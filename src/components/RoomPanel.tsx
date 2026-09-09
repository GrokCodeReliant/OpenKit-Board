import { useState } from 'react'
import type { Role } from '../multiplayer/protocol'
import type { RoomStatus } from '../multiplayer/useRoom'

interface RoomPanelProps {
  status: RoomStatus
  roomCode: string | null
  role: Role | null
  peerCount: number
  lastError: string | null
  onHost: () => void
  onJoin: (code: string, role: Role) => void
  onLeave: () => void
}

export function RoomPanel({
  status,
  roomCode,
  role,
  peerCount,
  lastError,
  onHost,
  onJoin,
  onLeave,
}: RoomPanelProps) {
  const [codeInput, setCodeInput] = useState('')
  const [joinRole, setJoinRole] = useState<Role>('player')

  const shareUrl =
    roomCode && typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?room=${roomCode}&role=${role ?? 'player'}`
      : null

  const copyShare = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      // ignore
    }
  }

  if (status === 'connected' && roomCode) {
    return (
      <div className="room-panel connected">
        <div className="room-row">
          <span className="room-badge">{role === 'dm' ? 'DM' : 'Player'}</span>
          <strong className="room-code">{roomCode}</strong>
          <span className="room-peers">{peerCount} connected</span>
        </div>
        {shareUrl && (
          <div className="room-share">
            <input readOnly value={shareUrl} aria-label="Shareable room URL" />
            <button type="button" onClick={copyShare}>
              Copy
            </button>
          </div>
        )}
        <button type="button" className="room-leave" onClick={onLeave}>
          Leave room (solo offline)
        </button>
      </div>
    )
  }

  return (
    <div className="room-panel">
      <p className="room-label">Multiplayer room</p>
      <div className="room-actions">
        <button
          type="button"
          className="room-host"
          onClick={onHost}
          disabled={status === 'connecting'}
        >
          {status === 'connecting' ? 'Connecting…' : 'Host room'}
        </button>
      </div>
      <div className="room-join">
        <input
          type="text"
          placeholder="Room code"
          value={codeInput}
          maxLength={8}
          onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
          aria-label="Room code"
        />
        <select
          value={joinRole}
          onChange={(e) => setJoinRole(e.target.value as Role)}
          aria-label="Join as role"
        >
          <option value="player">Player</option>
          <option value="dm">DM</option>
        </select>
        <button
          type="button"
          disabled={!codeInput.trim() || status === 'connecting'}
          onClick={() => onJoin(codeInput.trim(), joinRole)}
        >
          Join
        </button>
      </div>
      {lastError && <p className="room-error">{lastError}</p>}
      <p className="room-hint">Offline solo works without a room.</p>
    </div>
  )
}
