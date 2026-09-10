/**
 * Open Kit Board — multiplayer room server (MVP).
 * In-memory rooms; WebSocket sync for mapRadius + pieces + rules pack.
 * Board is a square checkerboard: piece q,r are column/row; radius N → (2N+1)² cells.
 * Run: npm run server  (default port 3001)
 */
import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { WebSocketServer } from 'ws'
import { randomBytes } from 'node:crypto'
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve, basename, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createMcpHttpHandler,
  resolveMcpToken,
} from './mcp.mjs'
import {
  checkMcpAuth,
  getPublicOrigin,
  handleOAuthHttp,
  mcpWwwAuthenticate,
  FALLBACK_CLIENT_ID,
} from './oauth.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DIST = join(ROOT, 'dist')
const PORT = Number(process.env.PORT || 3001)
const DEFAULT_RADIUS = 8
const MIN_RADIUS = 3
const MAX_RADIUS = 40
/** Match client rulesPack BODY_HARD_LIMIT (UTF-8 bytes). */
const RULES_PACK_HARD_LIMIT = 500_000

/** @typedef {'dm' | 'player'} Role */
/** @typedef {'tiles' | 'props' | 'tokens' | 'monsters'} AssetCategory */

/**
 * @typedef {{
 *   id: string,
 *   assetId: string,
 *   q: number,
 *   r: number,
 *   layer: 'ground' | 'object',
 *   ownerId: string,
 *   category: AssetCategory,
 *   rotationDeg?: number,
 *   scaleX?: number,
 *   scaleY?: number,
 *   offsetX?: number,
 *   offsetY?: number,
 *   lockedToCell?: boolean,
 *   editUnlocked?: boolean,
 * }} Piece
 */

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   body: string,
 *   format: 'text' | 'markdown',
 *   license: string,
 *   sourceUrl?: string,
 *   attribution?: string,
 *   rightsAffirmedAt: string,
 *   importedAt: string,
 *   importedBy: string,
 *   byteLength: number,
 *   contentHash: string,
 * }} RulesPack
 */

/**
 * @typedef {{
 *   code: string,
 *   mapRadius: number,
 *   pieces: Piece[],
 *   rulesPack: RulesPack | null,
 *   clients: Map<import('ws').WebSocket, { id: string, role: Role }>,
 * }} Room
 */

/** @type {Map<string, Room>} */
const rooms = new Map()

let nextClientSeq = 1
let nextPieceSeq = 1


function roomCode() {
  // 5-char uppercase, avoid ambiguous 0/O/1/I
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  const bytes = randomBytes(5)
  for (let i = 0; i < 5; i++) code += alphabet[bytes[i] % alphabet.length]
  return code
}

function clampRadius(n) {
  if (!Number.isFinite(n)) return DEFAULT_RADIUS
  return Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, Math.round(n)))
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg))
}

function roomState(room) {
  return {
    mapRadius: room.mapRadius,
    pieces: room.pieces,
    rulesPack: room.rulesPack ?? null,
  }
}

function broadcast(room, msg, except = null) {
  const raw = JSON.stringify(msg)
  for (const [client] of room.clients) {
    if (client !== except && client.readyState === 1) client.send(raw)
  }
}

function findRoomFor(ws) {
  for (const room of rooms.values()) {
    if (room.clients.has(ws)) return room
  }
  return null
}

function leaveRoom(ws) {
  const room = findRoomFor(ws)
  if (!room) return
  room.clients.delete(ws)
  if (room.clients.size === 0) {
    rooms.delete(room.code)
  } else {
    broadcast(room, {
      type: 'peers',
      count: room.clients.size,
    })
  }
}

/**
 * @param {Room} room
 * @param {Role} role
 * @param {string} clientId
 * @param {Piece} piece
 */
function canPlace(role, category) {
  if (role === 'dm') return true
  return category === 'tokens'
}

/**
 * @param {Role} role
 * @param {string} clientId
 * @param {Piece | undefined} piece
 */
function canMutatePiece(role, clientId, piece) {
  if (!piece) return false
  if (role === 'dm') return true
  return piece.ownerId === clientId
}



/**
 * Clamp / normalize optional visual transform fields from a client update/place.
 * Stored opaquely on the piece (legacy pieces omit fields ⇒ client defaults).
 * @param {Record<string, unknown>} src
 * @returns {Partial<Piece>}
 */
function pickTransform(src) {
  /** @type {Partial<Piece>} */
  const out = {}
  if (typeof src.rotationDeg === 'number' && Number.isFinite(src.rotationDeg)) {
    // Keep a sane range for JSON noise, wrap not required for MVP.
    out.rotationDeg = ((src.rotationDeg % 360) + 360) % 360
    if (out.rotationDeg > 180) out.rotationDeg -= 360
  }
  if (typeof src.scaleX === 'number' && Number.isFinite(src.scaleX) && src.scaleX > 0) {
    out.scaleX = Math.min(8, Math.max(0.05, src.scaleX))
  }
  if (typeof src.scaleY === 'number' && Number.isFinite(src.scaleY) && src.scaleY > 0) {
    out.scaleY = Math.min(8, Math.max(0.05, src.scaleY))
  }
  if (typeof src.offsetX === 'number' && Number.isFinite(src.offsetX)) {
    out.offsetX = Math.min(8, Math.max(-8, src.offsetX))
  }
  if (typeof src.offsetY === 'number' && Number.isFinite(src.offsetY)) {
    out.offsetY = Math.min(8, Math.max(-8, src.offsetY))
  }
  if (typeof src.lockedToCell === 'boolean') {
    out.lockedToCell = src.lockedToCell
  }
  if (typeof src.editUnlocked === 'boolean') {
    out.editUnlocked = src.editUnlocked
  }
  return out
}

/**
 * @param {unknown} pack
 * @returns {RulesPack | null | false} false = invalid
 */
function normalizeRulesPack(pack) {
  if (pack === null) return null
  if (!pack || typeof pack !== 'object') return false
  const p = /** @type {Record<string, unknown>} */ (pack)
  if (
    typeof p.id !== 'string' ||
    typeof p.title !== 'string' ||
    typeof p.body !== 'string' ||
    (p.format !== 'text' && p.format !== 'markdown')
  ) {
    return false
  }
  const body = p.body
  const byteLength =
    typeof p.byteLength === 'number'
      ? p.byteLength
      : Buffer.byteLength(body, 'utf8')
  if (byteLength > RULES_PACK_HARD_LIMIT || body.length > RULES_PACK_HARD_LIMIT) {
    return false
  }
  return {
    id: p.id,
    title: p.title,
    body,
    format: p.format,
    license:
      typeof p.license === 'string' && p.license.trim()
        ? p.license
        : 'private session',
    sourceUrl: typeof p.sourceUrl === 'string' ? p.sourceUrl : undefined,
    attribution: typeof p.attribution === 'string' ? p.attribution : undefined,
    rightsAffirmedAt:
      typeof p.rightsAffirmedAt === 'string'
        ? p.rightsAffirmedAt
        : new Date().toISOString(),
    importedAt:
      typeof p.importedAt === 'string' ? p.importedAt : new Date().toISOString(),
    importedBy: typeof p.importedBy === 'string' ? p.importedBy : 'unknown',
    byteLength,
    contentHash: typeof p.contentHash === 'string' ? p.contentHash : '',
  }
}

function createRoom() {
  let code = roomCode()
  while (rooms.has(code)) code = roomCode()
  /** @type {Room} */
  const room = {
    code,
    mapRadius: DEFAULT_RADIUS,
    pieces: [],
    rulesPack: null,
    clients: new Map(),
  }
  rooms.set(code, room)
  return room
}


const DEFAULT_KIT_PATH =
  'G:\\Game Dev Studio\\projects\\OpenKit\\2d\\dnd\\passed'

/**
 * Resolve Open Kit `passed` folder: env, then a few relative fallbacks.
 * @returns {string | null}
 */
function resolveKitPath() {
  const candidates = [
    process.env.OPENKIT_KIT_PATH,
    DEFAULT_KIT_PATH,
    join(ROOT, 'passed'),
    join(ROOT, '..', 'OpenKit', '2d', 'dnd', 'passed'),
    join(ROOT, '..', 'passed'),
  ].filter(Boolean)

  for (const cand of candidates) {
    try {
      const abs = resolve(cand)
      if (existsSync(abs) && statSync(abs).isDirectory()) return abs
    } catch {
      /* skip */
    }
  }
  return null
}

function categoryFromFilename(filename) {
  const base = filename.replace(/\.[^.]+$/, '').toLowerCase()
  if (base.startsWith('tile-')) return 'tiles'
  if (base.startsWith('prop-')) return 'props'
  if (base.startsWith('token-')) return 'tokens'
  if (base.startsWith('monster-')) return 'monsters'
  return null
}

function displayNameFromFilename(filename) {
  const base = filename.replace(/\.[^.]+$/, '')
  const withoutPrefix = base.replace(/^(tile|prop|token|monster)-/i, '')
  return withoutPrefix
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Theme tags from filename keywords; default fantasy.
 * @param {string} filename
 * @returns {string[]}
 */
function themesFromFilename(filename) {
  const n = filename.toLowerCase()
  /** @type {Set<string>} */
  const themes = new Set()
  if (n.includes('fae') || n.includes('fairy') || n.includes('fey')) {
    themes.add('fae')
  }
  if (n.includes('hell') || n.includes('infernal')) {
    themes.add('hell')
  }
  if (
    n.includes('heaven') ||
    n.includes('seraph') ||
    n.includes('halo')
  ) {
    themes.add('heaven')
  }
  if (
    n.includes('dream') ||
    n.includes('void') ||
    n.includes('extraplanar')
  ) {
    themes.add('extraplanar')
  }
  if (themes.size === 0) themes.add('fantasy')
  return [...themes]
}

/**
 * Scan kit folder for PNGs and build a Manifest-shaped object.
 * @param {string} kitDir
 */
function buildKitManifest(kitDir) {
  /** @type {string[]} */
  let files = []
  try {
    files = readdirSync(kitDir).filter((f) => /\.png$/i.test(f))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Cannot read kit path: ${message}`)
  }

  files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

  const assets = []
  for (const file of files) {
    const category = categoryFromFilename(file)
    if (!category) continue
    const id = file.replace(/\.[^.]+$/, '')
    assets.push({
      id,
      name: displayNameFromFilename(file),
      category,
      file,
      themes: themesFromFilename(file),
      // omit levels → client defaults to all bands
    })
  }

  return {
    version: 1,
    basePath: '/kit/files',
    note: `Open Kit live scan of ${kitDir} (${assets.length} assets)`,
    kitPath: kitDir,
    assets,
  }
}

/**
 * Safe join under kitDir — rejects .. and absolute escapes.
 * @param {string} kitDir
 * @param {string} fileParam
 * @returns {string | null}
 */
function safeKitFilePath(kitDir, fileParam) {
  if (!fileParam || typeof fileParam !== 'string') return null
  // URL may encode spaces etc.
  let name
  try {
    name = decodeURIComponent(fileParam)
  } catch {
    return null
  }
  // Only allow a single basename (no subdirs / separators)
  const base = basename(name)
  if (base !== name.replace(/\\/g, '/').split('/').pop()) return null
  if (base.includes('..') || base.includes('\0')) return null
  if (!/\.png$/i.test(base)) return null

  const kitResolved = resolve(kitDir)
  const full = resolve(kitDir, base)
  const prefix = kitResolved.endsWith(sep) ? kitResolved : kitResolved + sep
  if (full !== kitResolved && !full.startsWith(prefix)) return null
  if (!existsSync(full) || !statSync(full).isFile()) return null
  return full
}

/** @type {string | null} */
let mcpActiveRoomCode = (process.env.OPENKIT_MCP_ROOM || '').trim().toUpperCase() || null

const mcpTokenInfo = resolveMcpToken()
const mcpHttpHandler = createMcpHttpHandler({
  getRooms: () => rooms,
  getActiveRoomCode: () => mcpActiveRoomCode,
  setActiveRoomCode: (code) => {
    mcpActiveRoomCode = code ? String(code).trim().toUpperCase() : null
  },
  getAssets: () => {
    const kitPath = resolveKitPath()
    if (!kitPath) return []
    try {
      return buildKitManifest(kitPath).assets
    } catch {
      return []
    }
  },
  broadcast,
  roomState,
  nextPieceId: () => `p${nextPieceSeq++}`,
})

const httpServer = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const pathname = url.pathname

  // CORS-ish for Vite proxy / same-origin; keep simple
  const jsonHeaders = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  }

  // --- OAuth 2.1 + protected-resource discovery (Grok Connect) ---
  if (pathname.startsWith('/.well-known/') || pathname.startsWith('/oauth/')) {
    void handleOAuthHttp(req, res, url, {
      getMcpToken: () => (process.env.OPENKIT_MCP_TOKEN || '').trim(),
    }).then((handled) => {
      if (!handled && !res.headersSent) {
        res.writeHead(404, jsonHeaders)
        res.end(JSON.stringify({ error: 'Not found' }))
      }
    })
    return
  }

  // --- MCP Streamable HTTP (Grok custom connectors) ---
  if (pathname === '/mcp' || pathname.startsWith('/mcp/')) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, MCP-Session-Id',
        'Access-Control-Max-Age': '86400',
      })
      res.end()
      return
    }
    const expected = (process.env.OPENKIT_MCP_TOKEN || '').trim()
    if (!checkMcpAuth(req.headers.authorization, expected)) {
      const origin = getPublicOrigin(req)
      res.writeHead(401, {
        ...jsonHeaders,
        'WWW-Authenticate': mcpWwwAuthenticate(origin),
        'Access-Control-Allow-Origin': '*',
      })
      res.end(
        JSON.stringify({
          error: 'Unauthorized',
          hint: 'Use Authorization: Bearer <OPENKIT_MCP_TOKEN> or complete Grok OAuth consent',
        }),
      )
      return
    }
    // CORS for browser-based connector UIs
    res.setHeader('Access-Control-Allow-Origin', '*')
    void mcpHttpHandler(req, res)
    return
  }

  if (pathname === '/health') {
    const kitPath = resolveKitPath()
    res.writeHead(200, jsonHeaders)
    res.end(
      JSON.stringify({
        ok: true,
        rooms: rooms.size,
        kitPath: kitPath,
        kitAvailable: Boolean(kitPath),
      }),
    )
    return
  }

  if (pathname === '/kit/manifest' && (req.method === 'GET' || req.method === 'HEAD')) {
    const kitPath = resolveKitPath()
    if (!kitPath) {
      res.writeHead(503, jsonHeaders)
      res.end(
        JSON.stringify({
          error: 'Open Kit path not found',
          hint: 'Set OPENKIT_KIT_PATH to your passed/ folder',
          triedDefault: DEFAULT_KIT_PATH,
        }),
      )
      return
    }
    try {
      const manifest = buildKitManifest(kitPath)
      res.writeHead(200, jsonHeaders)
      res.end(JSON.stringify(manifest))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      res.writeHead(500, jsonHeaders)
      res.end(JSON.stringify({ error: message }))
    }
    return
  }

  // Optional explicit rescan alias (same as GET manifest — rescans every time)
  if (pathname === '/kit/rescan' && req.method === 'POST') {
    const kitPath = resolveKitPath()
    if (!kitPath) {
      res.writeHead(503, jsonHeaders)
      res.end(JSON.stringify({ error: 'Open Kit path not found' }))
      return
    }
    try {
      const manifest = buildKitManifest(kitPath)
      res.writeHead(200, jsonHeaders)
      res.end(JSON.stringify({ ok: true, count: manifest.assets.length, kitPath }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      res.writeHead(500, jsonHeaders)
      res.end(JSON.stringify({ error: message }))
    }
    return
  }

  const kitFileMatch = pathname.match(/^\/kit\/files\/(.+)$/)
  if (kitFileMatch && (req.method === 'GET' || req.method === 'HEAD')) {
    const kitPath = resolveKitPath()
    if (!kitPath) {
      res.writeHead(503, { 'Content-Type': 'text/plain' })
      res.end('Kit path not found')
      return
    }
    const filePath = safeKitFilePath(kitPath, kitFileMatch[1])
    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found')
      return
    }
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=60',
    })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(filePath).pipe(res)
    return
  }

  // --- Ollama reverse proxy (CORS-safe; production / non-Vite) ---
  // Dev Vite proxies /ollama → 127.0.0.1:11434 directly; this hop uses node:http
  // (undici fetch often fails on Windows for :11434 even when tags work in PowerShell).
  const OLLAMA_UPSTREAM = (process.env.OPENKIT_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')

  if (pathname.startsWith('/ollama/')) {
    const upstreamPath = pathname.slice('/ollama'.length) // /api/chat | /api/tags
    if (
      !(
        (upstreamPath === '/api/tags' && (req.method === 'GET' || req.method === 'HEAD')) ||
        (upstreamPath === '/api/chat' && req.method === 'POST')
      )
    ) {
      res.writeHead(404, jsonHeaders)
      res.end(JSON.stringify({ error: 'Only /ollama/api/tags and /ollama/api/chat are proxied' }))
      return
    }

    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const bodyBuf = Buffer.concat(chunks)
      const targetUrl = new URL(`${OLLAMA_UPSTREAM}${upstreamPath}${url.search || ''}`)
      const target = targetUrl.href
      const isHttps = targetUrl.protocol === 'https:'
      const requester = isHttps ? httpsRequest : httpRequest
      const method = req.method === 'HEAD' ? 'GET' : req.method

      /**
       * @param {number} attempt
       */
      function proxyOnce(attempt) {
        /** @type {import('node:http').OutgoingHttpHeaders} */
        const headers = {
          Accept: 'application/json',
          Host: targetUrl.host,
        }
        if (req.method === 'POST') {
          headers['Content-Type'] = req.headers['content-type'] || 'application/json'
          headers['Content-Length'] = bodyBuf.length
        }

        const upstreamReq = requester(
          {
            protocol: targetUrl.protocol,
            hostname: targetUrl.hostname,
            port: targetUrl.port || (isHttps ? 443 : 80),
            path: `${targetUrl.pathname}${targetUrl.search}`,
            method,
            headers,
            timeout: 120_000,
          },
          (upstreamRes) => {
            const outHeaders = {
              'Content-Type': upstreamRes.headers['content-type'] || 'application/json',
              'Cache-Control': 'no-store',
            }
            res.writeHead(upstreamRes.statusCode || 502, outHeaders)
            if (req.method === 'HEAD') {
              upstreamRes.resume()
              res.end()
              return
            }
            upstreamRes.pipe(res)
          },
        )

        upstreamReq.on('timeout', () => {
          upstreamReq.destroy(Object.assign(new Error('Ollama upstream timeout'), { code: 'ETIMEDOUT' }))
        })

        upstreamReq.on('error', (err) => {
          const message = err instanceof Error ? err.message : String(err)
          const code =
            err && typeof err === 'object' && 'code' in err
              ? String(/** @type {{ code?: unknown }} */ (err).code || '')
              : ''
          const cause =
            err && typeof err === 'object' && 'cause' in err
              ? /** @type {{ cause?: { code?: unknown } }} */ (err).cause
              : undefined
          const causeCode =
            cause && typeof cause === 'object' && cause.code != null
              ? String(cause.code)
              : ''
          const detailParts = [message]
          if (code) detailParts.push(`code=${code}`)
          if (causeCode) detailParts.push(`cause.code=${causeCode}`)
          const detail = detailParts.join(' ')

          if (attempt === 0) {
            console.warn(
              `[openkit-board] ollama proxy request failed (retrying once): ${detail} → ${target}`,
            )
            setTimeout(() => proxyOnce(1), 400)
            return
          }

          console.error(
            `[openkit-board] ollama proxy upstream unreachable: ${detail} → ${target}`,
          )
          if (!res.headersSent) {
            res.writeHead(502, jsonHeaders)
            res.end(
              JSON.stringify({
                error: 'Ollama upstream unreachable',
                detail,
                code: code || undefined,
                causeCode: causeCode || undefined,
                upstream: OLLAMA_UPSTREAM,
                target,
                hint: 'Start Ollama locally, or set OPENKIT_OLLAMA_URL',
              }),
            )
          }
        })

        if (req.method === 'POST') {
          upstreamReq.write(bodyBuf)
        }
        upstreamReq.end()
      }

      proxyOnce(0)
    })
    return
  }

  // --- xAI Grok reverse proxy (OpenAI-compatible) ---
  // Browser → Vite /xai → :3001 → https://api.x.ai/v1/...
  // Bearer from env XAI_API_KEY / GROK_API_KEY, else inbound Authorization / x-xai-api-key.
  // Never log API keys or Authorization headers.
  const XAI_UPSTREAM = 'https://api.x.ai/v1'

  if (pathname.startsWith('/xai/')) {
    const upstreamPath = pathname.slice('/xai'.length) // /v1/chat/completions | /v1/models
    const allowed =
      (upstreamPath === '/v1/chat/completions' && req.method === 'POST') ||
      (upstreamPath === '/v1/models' && (req.method === 'GET' || req.method === 'HEAD'))
    if (!allowed) {
      res.writeHead(404, jsonHeaders)
      res.end(
        JSON.stringify({
          error: 'Only /xai/v1/chat/completions (POST) and /xai/v1/models (GET) are proxied',
        }),
      )
      return
    }

    const envKey = (process.env.XAI_API_KEY || process.env.GROK_API_KEY || '').trim()
    const inboundAuth =
      typeof req.headers.authorization === 'string' ? req.headers.authorization.trim() : ''
    const inboundXai =
      typeof req.headers['x-xai-api-key'] === 'string' ? req.headers['x-xai-api-key'].trim() : ''
    let bearer = ''
    if (envKey) {
      bearer = envKey
    } else if (inboundAuth.toLowerCase().startsWith('bearer ')) {
      bearer = inboundAuth.slice(7).trim()
    } else if (inboundXai) {
      bearer = inboundXai
    }

    if (!bearer) {
      res.writeHead(401, jsonHeaders)
      res.end(
        JSON.stringify({
          error: 'xAI API key missing',
          hint:
            'Set XAI_API_KEY or GROK_API_KEY on the server, or paste a key in Shoulder settings (Authorization / x-xai-api-key; localStorage only).',
        }),
      )
      return
    }

    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const bodyBuf = Buffer.concat(chunks)
      // /xai/v1/chat/completions → https://api.x.ai/v1/chat/completions
      const apiPath = upstreamPath.slice('/v1'.length) // /chat/completions | /models
      const parsed = new URL(`${XAI_UPSTREAM}${apiPath}${url.search || ''}`)

      /** @type {import('node:http').OutgoingHttpHeaders} */
      const headers = {
        Accept: 'application/json',
        Authorization: `Bearer ${bearer}`,
        Host: parsed.host,
      }
      if (req.method === 'POST') {
        headers['Content-Type'] = req.headers['content-type'] || 'application/json'
        headers['Content-Length'] = bodyBuf.length
      }

      const upstreamReq = httpsRequest(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || 443,
          path: `${parsed.pathname}${parsed.search}`,
          method: req.method === 'HEAD' ? 'GET' : req.method,
          headers,
          timeout: 120_000,
        },
        (upstreamRes) => {
          const outHeaders = {
            'Content-Type': upstreamRes.headers['content-type'] || 'application/json',
            'Cache-Control': 'no-store',
          }
          res.writeHead(upstreamRes.statusCode || 502, outHeaders)
          if (req.method === 'HEAD') {
            upstreamRes.resume()
            res.end()
            return
          }
          upstreamRes.pipe(res)
        },
      )

      upstreamReq.on('timeout', () => {
        upstreamReq.destroy(Object.assign(new Error('xAI upstream timeout'), { code: 'ETIMEDOUT' }))
      })

      upstreamReq.on('error', (err) => {
        const message = err instanceof Error ? err.message : String(err)
        const code =
          err && typeof err === 'object' && 'code' in err
            ? String(/** @type {{ code?: unknown }} */ (err).code || '')
            : ''
        console.error(
          `[openkit-board] xai proxy upstream unreachable: ${message}${code ? ` code=${code}` : ''} → ${parsed.pathname}`,
        )
        if (!res.headersSent) {
          res.writeHead(502, jsonHeaders)
          res.end(
            JSON.stringify({
              error: 'xAI upstream unreachable',
              detail: message,
              code: code || undefined,
              hint: 'Check network access to api.x.ai',
            }),
          )
        }
      })

      if (req.method === 'POST') {
        upstreamReq.write(bodyBuf)
      }
      upstreamReq.end()
    })
    return
  }

  res.writeHead(404)
  res.end('Open Kit Board room server. Connect via WebSocket /kit.')
})

// Cap inbound frames so a huge/garbage rules payload cannot crash the room WS.
// Pack body hard limit is 500k chars; leave headroom for JSON envelope + room state.
const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: 1_500_000,
})

wss.on('connection', (ws) => {
  const clientId = `c${nextClientSeq++}`

  send(ws, { type: 'hello', clientId })

  ws.on('message', (data) => {
    let msg
    try {
      msg = JSON.parse(String(data))
    } catch {
      send(ws, { type: 'error', message: 'Invalid JSON' })
      return
    }

    const type = msg?.type
    if (type === 'host') {
      leaveRoom(ws)
      const room = createRoom()
      room.clients.set(ws, { id: clientId, role: 'dm' })
      send(ws, {
        type: 'joined',
        roomCode: room.code,
        clientId,
        role: 'dm',
        state: roomState(room),
      })
      return
    }

    if (type === 'join') {
      const code = String(msg.roomCode || '')
        .trim()
        .toUpperCase()
      const room = rooms.get(code)
      if (!room) {
        send(ws, { type: 'error', message: `Room ${code || '(empty)'} not found` })
        return
      }
      leaveRoom(ws)
      /** @type {Role} */
      let role = msg.role === 'dm' ? 'dm' : 'player'
      // Only allow one DM claim if a DM already present — still allow role=dm for URL smoke tests
      // but prefer player when unspecified
      if (msg.role !== 'dm' && msg.role !== 'player') role = 'player'
      room.clients.set(ws, { id: clientId, role })
      send(ws, {
        type: 'joined',
        roomCode: room.code,
        clientId,
        role,
        state: roomState(room),
      })
      broadcast(
        room,
        { type: 'peers', count: room.clients.size },
        ws,
      )
      return
    }

    const room = findRoomFor(ws)
    const meta = room?.clients.get(ws)
    if (!room || !meta) {
      send(ws, { type: 'error', message: 'Not in a room — host or join first' })
      return
    }

    if (type === 'setRadius') {
      if (meta.role !== 'dm') {
        send(ws, { type: 'error', message: 'Only the DM can change board radius' })
        return
      }
      room.mapRadius = clampRadius(Number(msg.radius))
      // Drop pieces outside square map when radius shrinks (same as client: |q|,|r| <= R)
      const r = room.mapRadius
      room.pieces = room.pieces.filter((p) => {
        return Math.abs(p.q) <= r && Math.abs(p.r) <= r
      })
      broadcast(room, { type: 'state', state: roomState(room) })
      return
    }

    if (type === 'place') {
      const assetId = String(msg.assetId || '')
      const q = Number(msg.q)
      const r = Number(msg.r)
      /** @type {AssetCategory} */
      const category = msg.category
      const layer = category === 'tiles' ? 'ground' : 'object'
      if (!assetId || !Number.isFinite(q) || !Number.isFinite(r)) {
        send(ws, { type: 'error', message: 'Invalid place payload' })
        return
      }
      if (Math.abs(q) > room.mapRadius || Math.abs(r) > room.mapRadius) {
        send(ws, { type: 'error', message: 'Place outside board' })
        return
      }
      if (!canPlace(meta.role, category)) {
        send(ws, {
          type: 'error',
          message: 'Players can only place tokens',
        })
        return
      }
      // Replace same-layer occupant
      room.pieces = room.pieces.filter(
        (p) => !(p.q === q && p.r === r && p.layer === layer),
      )
      /** @type {Piece} */
      const piece = {
        id: `p${nextPieceSeq++}`,
        assetId,
        q,
        r,
        layer,
        ownerId: clientId,
        category,
        rotationDeg: 0,
        scaleX: 1,
        scaleY: 1,
        offsetX: 0,
        offsetY: 0,
        lockedToCell: true,
        editUnlocked: false,
        ...pickTransform(msg),
      }
      room.pieces.push(piece)
      broadcast(room, { type: 'state', state: roomState(room) })
      return
    }

    if (type === 'move') {
      const id = String(msg.id || '')
      const q = Number(msg.q)
      const r = Number(msg.r)
      const piece = room.pieces.find((p) => p.id === id)
      if (!canMutatePiece(meta.role, clientId, piece)) {
        send(ws, {
          type: 'error',
          message: 'Cannot move that piece',
        })
        return
      }
      if (!Number.isFinite(q) || !Number.isFinite(r)) {
        send(ws, { type: 'error', message: 'Invalid move' })
        return
      }
      if (Math.abs(q) > room.mapRadius || Math.abs(r) > room.mapRadius) {
        send(ws, { type: 'error', message: 'Move outside board' })
        return
      }
      room.pieces = room.pieces.filter(
        (p) =>
          p.id !== id &&
          !(p.q === q && p.r === r && p.layer === piece.layer),
      )
      room.pieces.push({ ...piece, q, r })
      broadcast(room, { type: 'state', state: roomState(room) })
      return
    }

    if (type === 'update') {
      const id = String(msg.id || '')
      const piece = room.pieces.find((p) => p.id === id)
      if (!canMutatePiece(meta.role, clientId, piece)) {
        send(ws, {
          type: 'error',
          message: 'Cannot update that piece',
        })
        return
      }
      const patch = pickTransform(msg)
      if (Object.keys(patch).length === 0) {
        send(ws, { type: 'error', message: 'Invalid update payload' })
        return
      }
      room.pieces = room.pieces.map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      )
      broadcast(room, { type: 'state', state: roomState(room) })
      return
    }

    if (type === 'delete') {
      const id = String(msg.id || '')
      const piece = room.pieces.find((p) => p.id === id)
      if (!canMutatePiece(meta.role, clientId, piece)) {
        send(ws, {
          type: 'error',
          message: 'Cannot delete that piece',
        })
        return
      }
      room.pieces = room.pieces.filter((p) => p.id !== id)
      broadcast(room, { type: 'state', state: roomState(room) })
      return
    }

    if (type === 'setRulesPack') {
      if (meta.role !== 'dm') {
        send(ws, {
          type: 'error',
          message: 'Only the DM can set the room rules pack',
        })
        return
      }
      const normalized = normalizeRulesPack(
        msg.pack === undefined ? null : msg.pack,
      )
      if (normalized === false) {
        send(ws, {
          type: 'error',
          message: 'Invalid rules pack (check fields and size — max 500,000 characters; PDF bytes are not accepted)',
        })
        return
      }
      room.rulesPack = normalized
      broadcast(room, { type: 'state', state: roomState(room) })
      return
    }

    send(ws, { type: 'error', message: `Unknown type: ${type}` })

  })

  ws.on('close', () => leaveRoom(ws))
})

httpServer.listen(PORT, () => {
  const hasDist = existsSync(DIST)
  const kitPath = resolveKitPath()
  console.log(`[openkit-board] room server on ws://localhost:${PORT}`)
  console.log(`[openkit-board] health http://localhost:${PORT}/health`)
  console.log(`[openkit-board] kit manifest http://localhost:${PORT}/kit/manifest`)
  console.log(`[openkit-board] MCP Streamable HTTP http://localhost:${PORT}/mcp (Bearer OPENKIT_MCP_TOKEN or OAuth)`)
  console.log(`[openkit-board] OAuth AS http://localhost:${PORT}/.well-known/oauth-authorization-server (client_id=${FALLBACK_CLIENT_ID})`)
  if (mcpTokenInfo.generated) {
    console.log(`[openkit-board] OPENKIT_MCP_TOKEN was unset — generated for this process:`)
    console.log(`[openkit-board]   export OPENKIT_MCP_TOKEN='${mcpTokenInfo.token}'`)
  } else {
    console.log(`[openkit-board] OPENKIT_MCP_TOKEN: set (${mcpTokenInfo.token.length} chars)`)
  }
  if (mcpActiveRoomCode) {
    console.log(`[openkit-board] OPENKIT_MCP_ROOM default: ${mcpActiveRoomCode}`)
  }
  console.log(`[openkit-board] ollama proxy http://localhost:${PORT}/ollama/api/tags → ${process.env.OPENKIT_OLLAMA_URL || 'http://127.0.0.1:11434'}`)
  console.log(`[openkit-board] xai proxy http://localhost:${PORT}/xai/v1/chat/completions → https://api.x.ai/v1 (env key: ${process.env.XAI_API_KEY || process.env.GROK_API_KEY ? 'set' : 'unset'})`)
  if (kitPath) {
    console.log(`[openkit-board] Open Kit path: ${kitPath}`)
  } else {
    console.log(
      `[openkit-board] Open Kit path not found — set OPENKIT_KIT_PATH (default: ${DEFAULT_KIT_PATH})`,
    )
  }
  if (hasDist) {
    console.log(`[openkit-board] note: dist/ present (static serve not wired in MVP)`)
  }
})
