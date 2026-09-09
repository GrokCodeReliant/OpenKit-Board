import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssetCategory, PlacedPiece } from '../types'
import type { ClientMessage, Role, RoomState, ServerMessage } from './protocol'
import { wsUrl } from './protocol'

export type RoomStatus = 'offline' | 'connecting' | 'connected' | 'error'

export interface RoomSession {
  status: RoomStatus
  roomCode: string | null
  clientId: string | null
  role: Role | null
  peerCount: number
  lastError: string | null
  remoteState: RoomState | null
  inRoom: boolean
  host: () => void
  join: (code: string, role?: Role) => void
  leave: () => void
  setRadius: (radius: number) => void
  place: (assetId: string, q: number, r: number, category: AssetCategory) => void
  move: (id: string, q: number, r: number) => void
  deletePiece: (id: string) => void
}

export function useRoom(autoJoin?: { code: string; role: Role } | null): RoomSession {
  const [status, setStatus] = useState<RoomStatus>('offline')
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [peerCount, setPeerCount] = useState(0)
  const [lastError, setLastError] = useState<string | null>(null)
  const [remoteState, setRemoteState] = useState<RoomState | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const pendingRef = useRef<ClientMessage | null>(null)
  const intentionalClose = useRef(false)
  const autoJoined = useRef(false)

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
        break
      case 'state':
        setRemoteState(msg.state)
        break
      case 'peers':
        setPeerCount(msg.count)
        break
      case 'error':
        setLastError(msg.message)
        setStatus((s) => (s === 'connecting' ? 'error' : s))
        break
      default:
        break
    }
  }, [])

  const connectAndSend = useCallback(
    (msg: ClientMessage) => {
      intentionalClose.current = false
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
        setLastError('WebSocket error — is `npm run server` running on :3001?')
        setStatus('error')
      }
      ws.onclose = () => {
        wsRef.current = null
        if (!intentionalClose.current) {
          setStatus((s) => (s === 'offline' ? s : 'error'))
          setLastError((e) => e ?? 'Disconnected from room server')
        }
      }
    },
    [applyServerMessage],
  )

  const host = useCallback(() => {
    connectAndSend({ type: 'host' })
  }, [connectAndSend])

  const join = useCallback(
    (code: string, joinRole: Role = 'player') => {
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
    wsRef.current?.close()
    wsRef.current = null
    pendingRef.current = null
    setStatus('offline')
    setRoomCode(null)
    setRole(null)
    setRemoteState(null)
    setPeerCount(0)
    setLastError(null)
  }, [])

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

  const deletePiece = useCallback(
    (id: string) => connectAndSend({ type: 'delete', id }),
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
      wsRef.current?.close()
    }
  }, [])

  const inRoom = status === 'connected' && !!roomCode

  return {
    status,
    roomCode,
    clientId,
    role,
    peerCount,
    lastError,
    remoteState,
    inRoom,
    host,
    join,
    leave,
    setRadius,
    place,
    move,
    deletePiece,
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
