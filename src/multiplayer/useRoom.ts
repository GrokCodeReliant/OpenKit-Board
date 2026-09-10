import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssetCategory, PlacedPiece } from '../types'
import type { RulesPack } from '../rulesPack'
import { BODY_HARD_LIMIT } from '../rulesPack'
import type { ClientMessage, Role, RoomState, ServerMessage } from './protocol'
import { wsUrl } from './protocol'

export type RoomStatus =
  | 'offline'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

export interface RoomSession {
  status: RoomStatus
  roomCode: string | null
  clientId: string | null
  role: Role | null
  peerCount: number
  lastError: string | null
  remoteState: RoomState | null
  inRoom: boolean
  /** True when user intentionally Host/Joined (or URL auto-join) — not idle solo. */
  wantsRoom: boolean
  host: () => void
  join: (code: string, role?: Role) => void
  leave: () => void
  setRadius: (radius: number) => void
  place: (assetId: string, q: number, r: number, category: AssetCategory) => void
  move: (id: string, q: number, r: number) => void
  updatePiece: (
    id: string,
    patch: {
      rotationDeg?: number
      scaleX?: number
      scaleY?: number
      offsetX?: number
      offsetY?: number
      lockedToCell?: boolean
      editUnlocked?: boolean
    },
  ) => void
  deletePiece: (id: string) => void
  setRulesPack: (pack: RulesPack | null) => void
}

const RECONNECT_BASE_MS = 900
const RECONNECT_MAX_MS = 8000

export function useRoom(autoJoin?: { code: string; role: Role } | null): RoomSession {
  const [status, setStatus] = useState<RoomStatus>('offline')
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [peerCount, setPeerCount] = useState(0)
  const [lastError, setLastError] = useState<string | null>(null)
  const [remoteState, setRemoteState] = useState<RoomState | null>(null)
  const [wantsRoom, setWantsRoom] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const pendingRef = useRef<ClientMessage | null>(null)
  const intentionalClose = useRef(false)
  const autoJoined = useRef(false)
  const reconnectTimer = useRef<number | null>(null)
  const reconnectAttempt = useRef(0)
  /** Session we should restore after a quiet reconnect. */
  const sessionRef = useRef<{ code: string; role: Role } | null>(null)
  const wantsRoomRef = useRef(false)
  const scheduleReconnectRef = useRef<() => void>(() => {})

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimer.current !== null) {
      window.clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
    }
  }, [])

  const applyServerMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case 'hello':
        setClientId(msg.clientId)
        break
      case 'joined':
        setStatus('connected')
        setRoomCode(msg.roomCode)
        setClientId(msg.clientId)
        setRole(msg.role)
        setRemoteState(msg.state)
        setLastError(null)
        setPeerCount(1)
        reconnectAttempt.current = 0
        sessionRef.current = { code: msg.roomCode, role: msg.role }
        break
      case 'state':
        setRemoteState(msg.state)
        break
      case 'peers':
        setPeerCount(msg.count)
        break
      case 'error':
        // Server rejected host/join — surface in the room panel, not a red banner spam.
        setLastError(msg.message)
        setStatus((s) =>
          s === 'connecting' || s === 'reconnecting' ? 'error' : s,
        )
        break
      default:
        break
    }
  }, [])

  const scheduleReconnect = useCallback(() => {
    clearReconnectTimer()
    const session = sessionRef.current
    if (!session || !wantsRoomRef.current) return
    const attempt = reconnectAttempt.current
    const delay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * Math.pow(1.6, attempt),
    )
    reconnectAttempt.current = attempt + 1
    setStatus('reconnecting')
    // Soft message — not a scary red banner.
    setLastError(null)
    reconnectTimer.current = window.setTimeout(() => {
      reconnectTimer.current = null
      if (!wantsRoomRef.current || !sessionRef.current) return
      // Re-join the same room quietly.
      const s = sessionRef.current
      pendingRef.current = {
        type: 'join',
        roomCode: s.code,
        role: s.role,
      }
      // Open a fresh socket without flipping to hard error.
      intentionalClose.current = false
      const existing = wsRef.current
      if (existing) {
        try {
          existing.onclose = null
          existing.onerror = null
          existing.close()
        } catch {
          /* ignore */
        }
        wsRef.current = null
      }
      const ws = new WebSocket(wsUrl())
      wsRef.current = ws
      ws.onopen = () => {
        const pending = pendingRef.current
        pendingRef.current = null
        if (pending) ws.send(JSON.stringify(pending))
      }
      ws.onmessage = (ev) => {
        try {
          applyServerMessage(JSON.parse(String(ev.data)) as ServerMessage)
        } catch {
          /* ignore */
        }
      }
      ws.onerror = () => {
        // Quiet during reconnect — schedule another attempt.
        if (wantsRoomRef.current && sessionRef.current) {
          scheduleReconnectRef.current()
        }
      }
      ws.onclose = () => {
        wsRef.current = null
        if (intentionalClose.current) return
        if (wantsRoomRef.current && sessionRef.current) {
          scheduleReconnectRef.current()
        }
      }
    }, delay)
  }, [applyServerMessage, clearReconnectTimer])

  useEffect(() => {
    // Keep ref current so socket handlers can recurse without capturing during init.
    scheduleReconnectRef.current = scheduleReconnect
  }, [scheduleReconnect])

  const connectAndSend = useCallback(
    (msg: ClientMessage) => {
      intentionalClose.current = false
      clearReconnectTimer()
      wantsRoomRef.current = true
      setWantsRoom(true)

      const existing = wsRef.current
      if (existing && existing.readyState === WebSocket.OPEN) {
        existing.send(JSON.stringify(msg))
        return
      }
      if (existing && existing.readyState === WebSocket.CONNECTING) {
        pendingRef.current = msg
        return
      }
      pendingRef.current = msg
      setStatus('connecting')
      // Only show a hard error if the initial Host/Join fails — not for solo idle.
      setLastError(null)
      const ws = new WebSocket(wsUrl())
      wsRef.current = ws
      ws.onopen = () => {
        const pending = pendingRef.current
        pendingRef.current = null
        if (pending) ws.send(JSON.stringify(pending))
      }
      ws.onmessage = (ev) => {
        try {
          applyServerMessage(JSON.parse(String(ev.data)) as ServerMessage)
        } catch {
          /* ignore */
        }
      }
      ws.onerror = () => {
        // If we already had a room, reconnect quietly instead of red-spam.
        if (sessionRef.current && wantsRoomRef.current) {
          scheduleReconnect()
          return
        }
        setLastError(
          'Could not reach the room server. Start it with `npm run server` (port 3001), or keep playing solo.',
        )
        setStatus('error')
      }
      ws.onclose = () => {
        wsRef.current = null
        if (intentionalClose.current) return
        if (sessionRef.current && wantsRoomRef.current) {
          // Brief proxy flaps (ECONNABORTED) → quiet reconnect.
          scheduleReconnect()
          return
        }
        // Failed before ever joining — soft error only if user tried Host/Join.
        setStatus((s) => {
          if (s === 'connecting') return 'error'
          if (s === 'offline') return s
          return 'error'
        })
        setLastError((e) =>
          e ??
          'Could not reach the room server. Solo play still works — Host again when ready.',
        )
      }
    },
    [applyServerMessage, clearReconnectTimer, scheduleReconnect],
  )

  const host = useCallback(() => {
    reconnectAttempt.current = 0
    sessionRef.current = null
    connectAndSend({ type: 'host' })
  }, [connectAndSend])

  const join = useCallback(
    (code: string, joinRole: Role = 'player') => {
      reconnectAttempt.current = 0
      // Do not set sessionRef until server confirms joined — avoids reconnect spam on bad codes.
      connectAndSend({
        type: 'join',
        roomCode: code.trim().toUpperCase(),
        role: joinRole,
      })
    },
    [connectAndSend],
  )

  const leave = useCallback(() => {
    intentionalClose.current = true
    wantsRoomRef.current = false
    setWantsRoom(false)
    clearReconnectTimer()
    sessionRef.current = null
    reconnectAttempt.current = 0
    wsRef.current?.close()
    wsRef.current = null
    pendingRef.current = null
    setStatus('offline')
    setRoomCode(null)
    setRole(null)
    setRemoteState(null)
    setPeerCount(0)
    setLastError(null)
  }, [clearReconnectTimer])

  const setRadius = useCallback(
    (radius: number) => connectAndSend({ type: 'setRadius', radius }),
    [connectAndSend],
  )

  const place = useCallback(
    (assetId: string, q: number, r: number, category: AssetCategory) => {
      connectAndSend({ type: 'place', assetId, q, r, category })
    },
    [connectAndSend],
  )

  const move = useCallback(
    (id: string, q: number, r: number) =>
      connectAndSend({ type: 'move', id, q, r }),
    [connectAndSend],
  )

  const updatePiece = useCallback(
    (
      id: string,
      patch: {
        rotationDeg?: number
        scaleX?: number
        scaleY?: number
        offsetX?: number
        offsetY?: number
        lockedToCell?: boolean
        editUnlocked?: boolean
      },
    ) => connectAndSend({ type: 'update', id, ...patch }),
    [connectAndSend],
  )

  const deletePiece = useCallback(
    (id: string) => connectAndSend({ type: 'delete', id }),
    [connectAndSend],
  )

  const setRulesPack = useCallback(
    (pack: RulesPack | null) => {
      if (
        pack &&
        (pack.body.length > BODY_HARD_LIMIT ||
          pack.byteLength > BODY_HARD_LIMIT)
      ) {
        setLastError(
          `Rules pack too large to sync over the room (max ${BODY_HARD_LIMIT.toLocaleString()} characters). Shorten it and try again.`,
        )
        return
      }
      connectAndSend({ type: 'setRulesPack', pack })
    },
    [connectAndSend],
  )

  // Auto-join from ?room=&role=
  useEffect(() => {
    if (!autoJoin?.code || autoJoined.current) return
    autoJoined.current = true
    join(autoJoin.code, autoJoin.role)
  }, [autoJoin, join])

  useEffect(() => {
    return () => {
      intentionalClose.current = true
      wantsRoomRef.current = false
      clearReconnectTimer()
      wsRef.current?.close()
    }
  }, [clearReconnectTimer])

  const inRoom =
    (status === 'connected' || status === 'reconnecting') && !!roomCode

  return {
    status,
    roomCode,
    clientId,
    role,
    peerCount,
    lastError,
    remoteState,
    inRoom,
    wantsRoom,
    host,
    join,
    leave,
    setRadius,
    place,
    move,
    updatePiece,
    deletePiece,
    setRulesPack,
  }
}

export function canChangeRadius(role: Role | null, inRoom: boolean): boolean {
  if (!inRoom) return true
  return role === 'dm'
}

export function canPlaceCategory(
  role: Role | null,
  inRoom: boolean,
  category: AssetCategory,
): boolean {
  if (!inRoom) return true
  if (role === 'dm') return true
  return category === 'tokens'
}

export function canControlPiece(
  role: Role | null,
  inRoom: boolean,
  clientId: string | null,
  piece: PlacedPiece | undefined,
): boolean {
  if (!piece) return false
  if (!inRoom) return true
  if (role === 'dm') return true
  return !!clientId && piece.ownerId === clientId
}
