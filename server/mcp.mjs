/**
 * Streamable HTTP MCP at /mcp for Grok custom connectors.
 * Mutates the same in-memory rooms the WebSocket clients use, then broadcasts.
 *
 * Auth: Authorization: Bearer <OPENKIT_MCP_TOKEN> (or OAuth access token from server/oauth.mjs)
 * Room: OPENKIT_MCP_ROOM env, or list_rooms / set_active_room tools.
 */
import { randomBytes } from 'node:crypto'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import * as z from 'zod/v4'

const MAX_PLACE_PER_CALL = 30
const MAX_SEARCH_RESULTS = 12

/**
 * @typedef {{
 *   getRooms: () => Map<string, import('./index.mjs') extends never ? any : any>,
 *   getActiveRoomCode: () => string | null,
 *   setActiveRoomCode: (code: string | null) => void,
 *   getAssets: () => { id: string, name: string, category: string, file?: string }[],
 *   broadcast: (room: any, msg: any, except?: any) => void,
 *   roomState: (room: any) => any,
 *   nextPieceId: () => string,
 * }} McpBoardContext
 */

function inSquareMap(q, r, radius) {
  return Math.abs(q) <= radius && Math.abs(r) <= radius
}

function scoreAsset(query, a) {
  const q = query.toLowerCase().trim()
  if (!q) return 0
  const name = a.name.toLowerCase()
  const id = a.id.toLowerCase()
  const cat = a.category.toLowerCase()
  let score = 0
  if (name === q || id === q) score += 100
  if (name.includes(q) || id.includes(q)) score += 40
  const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length >= 2)
  for (const t of tokens) {
    if (name.includes(t)) score += 8
    if (id.includes(t)) score += 6
    if (cat.includes(t)) score += 2
  }
  const syn = {
    goblin: ['imp', 'skirmisher'],
    goblins: ['imp', 'skirmisher'],
    camp: ['toadstool', 'fairy', 'lantern', 'camp', 'ring'],
    campsite: ['toadstool', 'fairy', 'lantern'],
    orc: ['horned', 'legionnaire'],
    fire: ['lantern', 'altar'],
  }
  for (const t of tokens) {
    const hints = syn[t]
    if (!hints) continue
    for (const h of hints) {
      if (name.includes(h) || id.includes(h)) score += 5
    }
  }
  return score
}

function searchAssets(assets, query, limit = 8) {
  const lim = Math.min(MAX_SEARCH_RESULTS, Math.max(1, Math.round(limit) || 8))
  return assets
    .map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      score: scoreAsset(query, a),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, lim)
}

function resolveAsset(assets, assetId, name) {
  if (assetId) {
    const exact = assets.find((a) => a.id === assetId)
    if (exact) return exact
  }
  const q = (name || assetId || '').trim()
  if (!q) return null
  const hits = searchAssets(assets, q, 1)
  if (!hits.length) return null
  return assets.find((a) => a.id === hits[0].id) ?? null
}

function ringCells(centerQ, centerR, count, radius, mapRadius) {
  const n = Math.min(24, Math.max(1, Math.round(count)))
  const rad = Math.max(1, Math.round(radius) || 2)
  const out = []
  const seen = new Set()
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    let q = Math.round(centerQ + rad * Math.cos(angle))
    let r = Math.round(centerR + rad * Math.sin(angle))
    for (let tries = 0; tries < 12; tries++) {
      const key = `${q},${r}`
      if (
        inSquareMap(q, r, mapRadius) &&
        !seen.has(key) &&
        !(q === centerQ && r === centerR)
      ) {
        seen.add(key)
        out.push({ q, r })
        break
      }
      q += tries % 2 === 0 ? 1 : -1
      r += tries % 3 === 0 ? 1 : 0
    }
  }
  return out
}

function coerceValue(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return coerceValue(JSON.parse(trimmed))
      } catch {
        return value
      }
    }
    return value
  }
  if (Array.isArray(value)) return value.map((item) => coerceValue(item))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = coerceValue(v)
    return out
  }
  return value
}

function coerceToolArgs(args) {
  if (!args || typeof args !== 'object') return {}
  return /** @type {Record<string, unknown>} */ (coerceValue(args))
}

function placementRows(args) {
  const raw = args.placements ?? args.pieces
  if (Array.isArray(raw)) return raw
  return []
}

function cellCoord(row, primary, alias) {
  const v = row[primary] ?? row[alias]
  return Number(v)
}

function matchPieces(pieces, assets, match) {
  const m = match.trim().toLowerCase()
  if (!m) return []
  const byId = pieces.filter((p) => p.id.toLowerCase() === m)
  if (byId.length) return byId
  return pieces.filter((p) => {
    if (p.assetId.toLowerCase().includes(m)) return true
    if (typeof p.displayName === 'string' && p.displayName.toLowerCase().includes(m))
      return true
    if (typeof p.sheetRole === 'string' && p.sheetRole.toLowerCase().includes(m))
      return true
    const a = assets.find((x) => x.id === p.assetId)
    return Boolean(a && a.name.toLowerCase().includes(m))
  })
}

function clipStr(v, max) {
  if (typeof v !== 'string') return undefined
  return v.slice(0, max)
}

/** Apply rules-agnostic sheet / combat fields onto a piece (mutates). */
function applySheetFields(piece, args) {
  if (typeof args.displayName === 'string') {
    piece.displayName = args.displayName.trim().slice(0, 80)
  }
  if (typeof args.notes === 'string') {
    piece.notes = args.notes.slice(0, 4000)
  }
  if (typeof args.statsBlob === 'string') {
    piece.statsBlob = args.statsBlob.slice(0, 4000)
  }
  if (typeof args.sheetRole === 'string') {
    piece.sheetRole = args.sheetRole.trim().slice(0, 40)
  }
  if (typeof args.hp === 'number' && Number.isFinite(args.hp)) {
    piece.hp = Math.min(9999, Math.max(-999, Math.round(args.hp)))
  }
  if (typeof args.maxHp === 'number' && Number.isFinite(args.maxHp)) {
    piece.maxHp = Math.min(9999, Math.max(0, Math.round(args.maxHp)))
  }
  if (typeof args.armor === 'number' && Number.isFinite(args.armor)) {
    piece.armor = Math.min(99, Math.max(0, Math.round(args.armor)))
  }
  if (typeof args.defeated === 'boolean') {
    piece.defeated = args.defeated
  }
}

function sheetSummary(p) {
  const out = {}
  if (p.displayName) out.displayName = p.displayName
  if (p.sheetRole) out.sheetRole = p.sheetRole
  if (p.hp != null) out.hp = p.hp
  if (p.maxHp != null) out.maxHp = p.maxHp
  if (p.armor != null) out.armor = p.armor
  if (p.defeated === true) out.defeated = true
  if (typeof p.notes === 'string' && p.notes.trim()) {
    out.notesPreview = p.notes.trim().slice(0, 120)
  }
  if (typeof p.statsBlob === 'string' && p.statsBlob.trim()) {
    out.statsPreview = p.statsBlob.trim().slice(0, 120)
  }
  return out
}

/** Parse NdS±K dice, e.g. 1d6, 2d6+1, d6, 3d8-2 */
function rollDiceExpression(expr) {
  const raw = String(expr || '').trim().toLowerCase().replace(/\s+/g, '')
  const m = raw.match(/^(\d*)d(\d+)([+-]\d+)?$/)
  if (!m) {
    return { ok: false, error: 'Bad expression — use NdS±K like 1d6, 2d6+1, d6' }
  }
  const n = m[1] ? Number(m[1]) : 1
  const sides = Number(m[2])
  const mod = m[3] ? Number(m[3]) : 0
  if (!Number.isFinite(n) || n < 1 || n > 40) {
    return { ok: false, error: 'Die count must be 1–40' }
  }
  if (!Number.isFinite(sides) || sides < 2 || sides > 1000) {
    return { ok: false, error: 'Sides must be 2–1000' }
  }
  const rolls = []
  for (let i = 0; i < n; i++) {
    rolls.push(1 + Math.floor(Math.random() * sides))
  }
  const sum = rolls.reduce((a, b) => a + b, 0)
  const total = sum + mod
  const detail =
    mod === 0
      ? `${n}d${sides} → [${rolls.join(', ')}] = ${total}`
      : `${n}d${sides}${mod >= 0 ? '+' : ''}${mod} → [${rolls.join(', ')}] ${mod >= 0 ? '+' : ''}${mod} = ${total}`
  return {
    ok: true,
    expression: raw,
    n,
    sides,
    modifier: mod,
    rolls,
    total,
    detail,
  }
}

function findRulesExcerpt(body, query, maxChars) {
  const cap = Math.min(4000, Math.max(200, Math.round(maxChars) || 1800))
  if (!query) {
    return { found: true, excerpt: body.slice(0, cap), mode: 'head' }
  }
  const q = query.toLowerCase().trim()
  // Prefer markdown section whose header contains the query
  const lines = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  let sectionStart = -1
  let sectionEnd = body.length
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const hm = line.match(/^#{1,3}\s+(.*)$/)
    if (!hm) continue
    if (hm[1].toLowerCase().includes(q) || q.split(/\s+/).some((t) => t.length >= 3 && hm[1].toLowerCase().includes(t))) {
      // compute byte/char offsets
      let start = 0
      for (let j = 0; j < i; j++) start += lines[j].length + 1
      sectionStart = start
      for (let k = i + 1; k < lines.length; k++) {
        if (/^#{1,3}\s+/.test(lines[k])) {
          let end = 0
          for (let j = 0; j < k; j++) end += lines[j].length + 1
          sectionEnd = end
          break
        }
      }
      break
    }
  }
  if (sectionStart >= 0) {
    return {
      found: true,
      excerpt: body.slice(sectionStart, Math.min(sectionEnd, sectionStart + cap)),
      mode: 'section',
    }
  }
  const lower = body.toLowerCase()
  let idx = lower.indexOf(q)
  if (idx < 0) {
    const tokens = q.split(/\s+/).filter((t) => t.length >= 3)
    let best = -1
    for (const t of tokens) {
      const i = lower.indexOf(t)
      if (i >= 0 && (best < 0 || i < best)) best = i
    }
    idx = best
  }
  if (idx < 0) return { found: false }
  const start = Math.max(0, idx - 160)
  return {
    found: true,
    excerpt: body.slice(start, start + cap),
    mode: 'match',
  }
}

function textResult(obj) {
  return {
    content: [{ type: 'text', text: JSON.stringify(obj, null, 0) }],
  }
}

/**
 * Resolve or mint OPENKIT_MCP_TOKEN for this process.
 * Never logs the full token when it came from env; logs generated tokens once.
 * @returns {{ token: string, generated: boolean }}
 */
export function resolveMcpToken() {
  const fromEnv = (process.env.OPENKIT_MCP_TOKEN || '').trim()
  if (fromEnv) return { token: fromEnv, generated: false }
  const token = randomBytes(24).toString('base64url')
  process.env.OPENKIT_MCP_TOKEN = token
  return { token, generated: true }
}

/**
 * @param {string | undefined} authHeader
 * @param {string} expected
 */
export function checkBearer(authHeader, expected) {
  if (!expected) return false
  if (!authHeader || typeof authHeader !== 'string') return false
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!m) return false
  const got = m[1].trim()
  if (got.length !== expected.length) return false
  // timing-safe-ish compare for equal lengths
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= got.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

/**
 * @param {McpBoardContext} ctx
 */
function resolveTargetRoom(ctx) {
  const rooms = ctx.getRooms()
  let code = (ctx.getActiveRoomCode() || '').trim().toUpperCase()
  if (!code) {
    const env = (process.env.OPENKIT_MCP_ROOM || '').trim().toUpperCase()
    if (env) code = env
  }
  if (!code) {
    if (rooms.size === 1) {
      code = [...rooms.keys()][0]
    }
  }
  if (!code) {
    return {
      error:
        'No active MCP room. Host a room in the board, then call set_active_room with that code (or set OPENKIT_MCP_ROOM). Use list_rooms to see live codes.',
    }
  }
  const room = rooms.get(code)
  if (!room) {
    return {
      error: `Room ${code} not found (or empty — keep Host tab open). Host/join that code, then retry.`,
      roomCode: code,
    }
  }
  return { room, roomCode: code }
}

/**
 * @param {McpBoardContext} ctx
 */
function buildMcpServer(ctx) {
  const server = new McpServer({
    name: 'openkit-board',
    version: '1.0.0',
  })

  server.registerTool(
    'list_rooms',
    {
      description:
        'List live multiplayer room codes on this server (need an open Host/Join browser tab).',
      inputSchema: z.object({}),
    },
    async () => {
      const rooms = ctx.getRooms()
      const active = (ctx.getActiveRoomCode() || process.env.OPENKIT_MCP_ROOM || '')
        .trim()
        .toUpperCase() || null
      const list = [...rooms.values()].map((r) => ({
        code: r.code,
        peers: r.clients.size,
        pieceCount: r.pieces.length,
        mapRadius: r.mapRadius,
        hasRules: Boolean(r.rulesPack),
        active: active === r.code,
      }))
      return textResult({
        rooms: list,
        activeRoom: active,
        note:
          list.length === 0
            ? 'No rooms — open the board and click Host room, leave the tab open.'
            : 'Call set_active_room with a code before place_pieces (or set OPENKIT_MCP_ROOM).',
      })
    },
  )

  server.registerTool(
    'set_active_room',
    {
      description:
        'Target a hosted room code for subsequent board tools (place_pieces, list_board, …).',
      inputSchema: z.object({
        roomCode: z
          .string()
          .describe('5-char room code from Host room / list_rooms'),
      }),
    },
    async ({ roomCode }) => {
      const code = String(roomCode || '')
        .trim()
        .toUpperCase()
      if (!code) return textResult({ ok: false, error: 'roomCode required' })
      const room = ctx.getRooms().get(code)
      if (!room) {
        return textResult({
          ok: false,
          error: `Room ${code} not found — Host that room in the browser and keep it open.`,
        })
      }
      ctx.setActiveRoomCode(code)
      return textResult({
        ok: true,
        activeRoom: code,
        peers: room.clients.size,
        pieceCount: room.pieces.length,
      })
    },
  )

  server.registerTool(
    'search_assets',
    {
      description:
        'Search loaded kit assets by name/id/category. Returns top matches — call this before place_pieces. Never invent asset ids.',
      inputSchema: z.object({
        query: z
          .string()
          .describe('Search text, e.g. "goblin", "camp", "toadstool", "imp"'),
        limit: z
          .number()
          .optional()
          .describe(`Max results (default 8, cap ${MAX_SEARCH_RESULTS})`),
      }),
    },
    async (args) => {
      const a = coerceToolArgs(args)
      const query = String(a.query ?? '')
      const limit = Number(a.limit ?? 8)
      const assets = ctx.getAssets()
      const hits = searchAssets(assets, query, limit)
      return textResult({
        query,
        count: hits.length,
        results: hits,
        note:
          hits.length === 0
            ? 'No matches — try a shorter keyword (imp, toadstool, lantern, tile). Set OPENKIT_KIT_PATH if kit is empty.'
            : 'Use these exact assetId values with place_pieces.',
      })
    },
  )

  server.registerTool(
    'list_board',
    {
      description:
        'Summarize pieces on the active MCP room board, including sheet/combat fields (HP, armor, displayName) when set.',
      inputSchema: z.object({}),
    },
    async () => {
      const target = resolveTargetRoom(ctx)
      if (target.error) return textResult(target)
      const { room, roomCode } = target
      const assets = ctx.getAssets()
      const list = room.pieces.map((p) => {
        const a = assets.find((x) => x.id === p.assetId)
        return {
          id: p.id,
          assetId: p.assetId,
          name: a?.name ?? p.assetId,
          q: p.q,
          r: p.r,
          scaleX: p.scaleX ?? 1,
          scaleY: p.scaleY ?? 1,
          rotationDeg: p.rotationDeg ?? 0,
          editUnlocked: p.editUnlocked === true,
          layer: p.layer,
          ...sheetSummary(p),
        }
      })
      return textResult({
        roomCode,
        mapRadius: room.mapRadius,
        pieceCount: list.length,
        pieces: list,
        note: 'Sheet/combat fields (hp, armor, displayName, …) appear when set via upsert_piece_sheet / update_combat.',
      })
    },
  )

  server.registerTool(
    'place_pieces',
    {
      description: `Place kit assets on the square board via placements: [{assetId|name,q,r}]. assetId may be a fuzzy name (e.g. goblin). q/r accept x/y aliases. Cap ${MAX_PLACE_PER_CALL} per call. Optional ring helper: assetId + count + centerQ/centerR + ringRadius. Mutates the hosted room and broadcasts so open boards update live.`,
      inputSchema: z.object({
        placements: z
          .array(
            z.object({
              assetId: z.string().optional(),
              name: z.string().optional(),
              q: z.number().optional(),
              r: z.number().optional(),
              x: z.number().optional(),
              y: z.number().optional(),
            }),
          )
          .optional(),
        pieces: z
          .array(
            z.object({
              assetId: z.string().optional(),
              name: z.string().optional(),
              q: z.number().optional(),
              r: z.number().optional(),
              x: z.number().optional(),
              y: z.number().optional(),
            }),
          )
          .optional(),
        assetId: z.string().optional(),
        name: z.string().optional(),
        count: z.number().optional(),
        centerQ: z.number().optional(),
        centerR: z.number().optional(),
        centerX: z.number().optional(),
        centerY: z.number().optional(),
        ringRadius: z.number().optional(),
      }),
    },
    async (rawArgs) => {
      const target = resolveTargetRoom(ctx)
      if (target.error) return textResult(target)
      const { room, roomCode } = target
      const args = coerceToolArgs(rawArgs)
      const assets = ctx.getAssets()
      /** @type {{ assetId: string, assetName: string, q: number, r: number }[]} */
      const actions = []

      for (const raw of placementRows(args)) {
        if (!raw || typeof raw !== 'object') continue
        const row = /** @type {Record<string, unknown>} */ (raw)
        const idHint =
          row.assetId != null && String(row.assetId).trim()
            ? String(row.assetId)
            : undefined
        const nameHint =
          row.name != null && String(row.name).trim()
            ? String(row.name)
            : undefined
        const q = cellCoord(row, 'q', 'x')
        const r = cellCoord(row, 'r', 'y')
        const asset = resolveAsset(assets, idHint, nameHint)
        if (!asset || !Number.isFinite(q) || !Number.isFinite(r)) continue
        if (!inSquareMap(q, r, room.mapRadius)) continue
        actions.push({
          assetId: asset.id,
          assetName: asset.name,
          q,
          r,
          category: asset.category,
        })
        if (actions.length >= MAX_PLACE_PER_CALL) break
      }

      if (
        actions.length < MAX_PLACE_PER_CALL &&
        (args.assetId || args.name) &&
        args.count
      ) {
        const asset = resolveAsset(
          assets,
          args.assetId != null ? String(args.assetId) : undefined,
          args.name != null ? String(args.name) : undefined,
        )
        if (asset) {
          const centerQ = Number(args.centerQ ?? args.centerX ?? 0)
          const centerR = Number(args.centerR ?? args.centerY ?? 0)
          const cells = ringCells(
            centerQ,
            centerR,
            Number(args.count),
            Number(args.ringRadius ?? 2),
            room.mapRadius,
          )
          for (const c of cells) {
            if (actions.length >= MAX_PLACE_PER_CALL) break
            actions.push({
              assetId: asset.id,
              assetName: asset.name,
              q: c.q,
              r: c.r,
              category: asset.category,
            })
          }
        }
      }

      if (!actions.length) {
        return textResult({
          ok: false,
          placed: 0,
          roomCode,
          error:
            'No valid placements. Call search_assets first and use exact assetId + in-bounds q,r.',
        })
      }

      const placed = []
      for (const a of actions) {
        const layer = a.category === 'tiles' ? 'ground' : 'object'
        room.pieces = room.pieces.filter(
          (p) => !(p.q === a.q && p.r === a.r && p.layer === layer),
        )
        const piece = {
          id: ctx.nextPieceId(),
          assetId: a.assetId,
          q: a.q,
          r: a.r,
          layer,
          ownerId: 'mcp',
          category: a.category,
          rotationDeg: 0,
          scaleX: 1,
          scaleY: 1,
          offsetX: 0,
          offsetY: 0,
          lockedToCell: true,
          editUnlocked: false,
        }
        room.pieces.push(piece)
        placed.push({
          id: piece.id,
          assetId: a.assetId,
          name: a.assetName,
          q: a.q,
          r: a.r,
        })
      }
      ctx.broadcast(room, { type: 'state', state: ctx.roomState(room) })
      return textResult({
        ok: true,
        roomCode,
        placed: placed.length,
        pieces: placed,
      })
    },
  )

  server.registerTool(
    'update_pieces',
    {
      description:
        'Update placed pieces in the active room by piece id or asset name substring. Patch scale, rotation, position, or unlock visual edit. Broadcasts to open boards.',
      inputSchema: z.object({
        match: z
          .string()
          .describe('Piece id (e.g. p12) or asset/display name fragment'),
        scaleX: z.number().optional(),
        scaleY: z.number().optional(),
        rotationDeg: z.number().optional(),
        q: z.number().optional(),
        r: z.number().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        editUnlocked: z.boolean().optional(),
      }),
    },
    async (rawArgs) => {
      const target = resolveTargetRoom(ctx)
      if (target.error) return textResult(target)
      const { room, roomCode } = target
      const args = coerceToolArgs(rawArgs)
      const assets = ctx.getAssets()
      const match = String(args.match ?? '')
      const targets = matchPieces(room.pieces, assets, match)
      if (!targets.length) {
        return textResult({
          ok: false,
          updated: 0,
          roomCode,
          error: `No pieces matched "${match}"`,
        })
      }
      const updated = []
      for (const p of targets) {
        if (typeof args.scaleX === 'number' && Number.isFinite(args.scaleX)) {
          p.scaleX = Math.min(8, Math.max(0.05, args.scaleX))
        }
        if (typeof args.scaleY === 'number' && Number.isFinite(args.scaleY)) {
          p.scaleY = Math.min(8, Math.max(0.05, args.scaleY))
        }
        if (
          typeof args.rotationDeg === 'number' &&
          Number.isFinite(args.rotationDeg)
        ) {
          let deg = ((args.rotationDeg % 360) + 360) % 360
          if (deg > 180) deg -= 360
          p.rotationDeg = deg
        }
        if (typeof args.editUnlocked === 'boolean') {
          p.editUnlocked = args.editUnlocked
        }
        const qRaw = args.q ?? args.x
        const rRaw = args.r ?? args.y
        if (
          typeof qRaw === 'number' &&
          Number.isFinite(qRaw) &&
          typeof rRaw === 'number' &&
          Number.isFinite(rRaw) &&
          inSquareMap(qRaw, rRaw, room.mapRadius)
        ) {
          p.q = qRaw
          p.r = rRaw
        }
        updated.push(p.id)
      }
      ctx.broadcast(room, { type: 'state', state: ctx.roomState(room) })
      return textResult({
        ok: true,
        roomCode,
        updated: updated.length,
        ids: updated,
      })
    },
  )

  server.registerTool(
    'get_rules',
    {
      description:
        'Read the active room’s rules pack. Optional query finds a markdown section or excerpt (Fighter, Rogue, HP, Armor, …). Rules-agnostic — returns whatever pack the room loaded.',
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe('Topic or section title to look up'),
        maxChars: z
          .number()
          .optional()
          .describe('Excerpt length (default 1800, cap 4000)'),
      }),
    },
    async (rawArgs) => {
      const target = resolveTargetRoom(ctx)
      if (target.error) return textResult(target)
      const { room, roomCode } = target
      const args = coerceToolArgs(rawArgs)
      const query = String(args.query ?? '').trim()
      const maxChars = Number(args.maxChars ?? 1800)
      const pack = room.rulesPack
      const body = pack?.body || ''
      const title = pack?.title || ''
      if (!body.trim()) {
        return textResult({
          roomCode,
          error:
            'No rules pack loaded in this room. DM: Load Kit Sparks sample (or import) while Hosting.',
        })
      }
      const hit = findRulesExcerpt(body, query, maxChars)
      if (!hit.found) {
        return textResult({
          roomCode,
          title,
          found: false,
          hint: 'No match — try Fighter, Rogue, Guard, HP, Armor, Damage',
        })
      }
      return textResult({
        roomCode,
        title,
        found: true,
        mode: hit.mode,
        query: query || null,
        excerpt: hit.excerpt,
        packChars: body.length,
      })
    },
  )

  server.registerTool(
    'upsert_piece_sheet',
    {
      description:
        'Create or update a room-synced piece sheet (displayName, role, notes, stats, HP/armor). Match an existing piece by id/name, or place a new token with assetId/name + q/r then attach the sheet. Broadcasts so Host boards update live.',
      inputSchema: z.object({
        match: z
          .string()
          .optional()
          .describe('Existing piece id or display/asset name fragment'),
        assetId: z.string().optional(),
        name: z.string().optional().describe('Asset name if placing a new token'),
        q: z.number().optional(),
        r: z.number().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        displayName: z.string().optional(),
        sheetRole: z
          .string()
          .optional()
          .describe('Freeform role tag: PC, NPC, Fighter, Rogue, …'),
        notes: z.string().optional(),
        statsBlob: z
          .string()
          .optional()
          .describe('Freeform stats text from the room rules pack'),
        hp: z.number().optional(),
        maxHp: z.number().optional(),
        armor: z.number().optional(),
        defeated: z.boolean().optional(),
      }),
    },
    async (rawArgs) => {
      const target = resolveTargetRoom(ctx)
      if (target.error) return textResult(target)
      const { room, roomCode } = target
      const args = coerceToolArgs(rawArgs)
      const assets = ctx.getAssets()
      const match = String(args.match ?? '')
      let piece = null
      let created = false

      if (match.trim()) {
        const hits = matchPieces(room.pieces, assets, match)
        if (!hits.length) {
          return textResult({
            ok: false,
            roomCode,
            error: `No pieces matched "${match}"`,
          })
        }
        piece = hits[0]
      } else {
        const idHint =
          args.assetId != null && String(args.assetId).trim()
            ? String(args.assetId)
            : undefined
        const nameHint =
          args.name != null && String(args.name).trim()
            ? String(args.name)
            : undefined
        const q = Number(args.q ?? args.x)
        const r = Number(args.r ?? args.y)
        const asset = resolveAsset(assets, idHint, nameHint)
        if (!asset || !Number.isFinite(q) || !Number.isFinite(r)) {
          return textResult({
            ok: false,
            roomCode,
            error:
              'Provide match for an existing piece, or assetId/name + q,r to place a new token with a sheet.',
          })
        }
        if (!inSquareMap(q, r, room.mapRadius)) {
          return textResult({
            ok: false,
            roomCode,
            error: 'q,r outside the board',
          })
        }
        const layer = asset.category === 'tiles' ? 'ground' : 'object'
        room.pieces = room.pieces.filter(
          (p) => !(p.q === q && p.r === r && p.layer === layer),
        )
        piece = {
          id: ctx.nextPieceId(),
          assetId: asset.id,
          q,
          r,
          layer,
          ownerId: 'mcp',
          category: asset.category,
          rotationDeg: 0,
          scaleX: 1,
          scaleY: 1,
          offsetX: 0,
          offsetY: 0,
          lockedToCell: true,
          editUnlocked: false,
        }
        room.pieces.push(piece)
        created = true
      }

      applySheetFields(piece, args)
      if (!piece.displayName && (args.name || args.displayName)) {
        // already handled by applySheetFields when displayName set
      }
      if (!piece.displayName) {
        const a = assets.find((x) => x.id === piece.assetId)
        if (typeof args.displayName !== 'string' && a) {
          // leave unset — list_board falls back to asset name
        }
      }

      ctx.broadcast(room, { type: 'state', state: ctx.roomState(room) })
      const a = assets.find((x) => x.id === piece.assetId)
      return textResult({
        ok: true,
        roomCode,
        created,
        piece: {
          id: piece.id,
          assetId: piece.assetId,
          name: a?.name ?? piece.assetId,
          q: piece.q,
          r: piece.r,
          ...sheetSummary(piece),
        },
      })
    },
  )

  server.registerTool(
    'update_combat',
    {
      description:
        'Update combat fields on matched pieces: hp / maxHp / armor / defeated, or deltaHp (negative = damage). Auto-marks defeated when hp ≤ 0 unless defeated is set explicitly. Broadcasts live.',
      inputSchema: z.object({
        match: z
          .string()
          .describe('Piece id or display/asset name fragment'),
        hp: z.number().optional(),
        maxHp: z.number().optional(),
        armor: z.number().optional(),
        defeated: z.boolean().optional(),
        deltaHp: z
          .number()
          .optional()
          .describe('Add to current hp (use negative for damage)'),
      }),
    },
    async (rawArgs) => {
      const target = resolveTargetRoom(ctx)
      if (target.error) return textResult(target)
      const { room, roomCode } = target
      const args = coerceToolArgs(rawArgs)
      const assets = ctx.getAssets()
      const match = String(args.match ?? '')
      const targets = matchPieces(room.pieces, assets, match)
      if (!targets.length) {
        return textResult({
          ok: false,
          updated: 0,
          roomCode,
          error: `No pieces matched "${match}"`,
        })
      }
      const updated = []
      for (const p of targets) {
        if (typeof args.maxHp === 'number' && Number.isFinite(args.maxHp)) {
          p.maxHp = Math.min(9999, Math.max(0, Math.round(args.maxHp)))
        }
        if (typeof args.armor === 'number' && Number.isFinite(args.armor)) {
          p.armor = Math.min(99, Math.max(0, Math.round(args.armor)))
        }
        if (typeof args.hp === 'number' && Number.isFinite(args.hp)) {
          p.hp = Math.min(9999, Math.max(-999, Math.round(args.hp)))
        }
        if (typeof args.deltaHp === 'number' && Number.isFinite(args.deltaHp)) {
          const cur = typeof p.hp === 'number' && Number.isFinite(p.hp) ? p.hp : 0
          p.hp = Math.min(9999, Math.max(-999, Math.round(cur + args.deltaHp)))
        }
        if (typeof args.defeated === 'boolean') {
          p.defeated = args.defeated
        } else if (typeof p.hp === 'number' && p.hp <= 0) {
          p.defeated = true
        }
        const a = assets.find((x) => x.id === p.assetId)
        updated.push({
          id: p.id,
          name: p.displayName || a?.name || p.assetId,
          hp: p.hp,
          maxHp: p.maxHp,
          armor: p.armor,
          defeated: p.defeated === true,
        })
      }
      ctx.broadcast(room, { type: 'state', state: ctx.roomState(room) })
      return textResult({
        ok: true,
        roomCode,
        updated: updated.length,
        pieces: updated,
      })
    },
  )

  server.registerTool(
    'remove_pieces',
    {
      description:
        'Remove pieces from the active room by id or name fragment. Broadcasts live.',
      inputSchema: z.object({
        match: z
          .string()
          .describe('Piece id or display/asset name fragment'),
      }),
    },
    async (rawArgs) => {
      const target = resolveTargetRoom(ctx)
      if (target.error) return textResult(target)
      const { room, roomCode } = target
      const args = coerceToolArgs(rawArgs)
      const assets = ctx.getAssets()
      const match = String(args.match ?? '')
      const targets = matchPieces(room.pieces, assets, match)
      if (!targets.length) {
        return textResult({
          ok: false,
          removed: 0,
          roomCode,
          error: `No pieces matched "${match}"`,
        })
      }
      const ids = new Set(targets.map((p) => p.id))
      room.pieces = room.pieces.filter((p) => !ids.has(p.id))
      ctx.broadcast(room, { type: 'state', state: ctx.roomState(room) })
      return textResult({
        ok: true,
        roomCode,
        removed: targets.length,
        ids: [...ids],
      })
    },
  )

  server.registerTool(
    'clear_board',
    {
      description:
        'Clear pieces on the active room. Default removes object-layer pieces (tokens/monsters/props); pass all=true to also clear ground tiles. Broadcasts live.',
      inputSchema: z.object({
        all: z
          .boolean()
          .optional()
          .describe('If true, remove every piece including ground tiles'),
      }),
    },
    async (rawArgs) => {
      const target = resolveTargetRoom(ctx)
      if (target.error) return textResult(target)
      const { room, roomCode } = target
      const args = coerceToolArgs(rawArgs)
      const clearAll = args.all === true
      const before = room.pieces.length
      room.pieces = clearAll
        ? []
        : room.pieces.filter((p) => p.layer === 'ground')
      const removed = before - room.pieces.length
      ctx.broadcast(room, { type: 'state', state: ctx.roomState(room) })
      return textResult({
        ok: true,
        roomCode,
        removed,
        remaining: room.pieces.length,
        cleared: clearAll ? 'all' : 'objects',
      })
    },
  )

  server.registerTool(
    'roll_dice',
    {
      description:
        'Roll dice for the narrative (NdS±K like 1d6, 2d6+1). Returns rolls + total in the tool result — Grok narrates; does not change the board.',
      inputSchema: z.object({
        expression: z
          .string()
          .describe('Dice expression, e.g. 1d6, 2d6+1, d6'),
      }),
    },
    async (rawArgs) => {
      const args = coerceToolArgs(rawArgs)
      const result = rollDiceExpression(String(args.expression ?? ''))
      return textResult(result)
    },
  )

  return server
}

/**
 * @param {McpBoardContext} ctx
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void}
 */
export function createMcpHttpHandler(ctx) {
  const handler = createMcpHandler(() => buildMcpServer(ctx))
  return toNodeHandler(handler)
}
