/**
 * Open Kit Board — multiplayer room server (MVP).
 * In-memory rooms; WebSocket sync for mapRadius + pieces + rules pack.
 * Board is a square checkerboard: piece q,r are column/row; radius N → (2N+1)² cells.
 * Run: npm run server  (default port 3001)
 */
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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
    typeof p.license !== 'string' ||
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
    license: p.license,
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

const httpServer = createServer((req, res) => {
  // Minimal health + optional static serve of dist/ for later deploy
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }))
    return
  }
  res.writeHead(404)
  res.end('Open Kit Board room server. Connect via WebSocket.')
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
  console.log(`[openkit-board] room server on ws://localhost:${PORT}`)
  console.log(`[openkit-board] health http://localhost:${PORT}/health`)
  if (hasDist) {
    console.log(`[openkit-board] note: dist/ present (static serve not wired in MVP)`)
  }
})
