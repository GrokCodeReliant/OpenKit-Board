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

  if ((status === 'connected' || status === 'reconnecting') && roomCode) {
    return (
      <div
        className={`room-panel connected${status === 'reconnecting' ? ' reconnecting' : ''}`}
      >
        <div className="room-row">
          <span className="room-badge">{role === 'dm' ? 'DM' : 'Player'}</span>
          <strong className="room-code">{roomCode}</strong>
          <span className="room-peers">
            {status === 'reconnecting'
              ? 'Reconnecting…'
              : `${peerCount} connected`}
          </span>
        </div>
        {status === 'reconnecting' && (
          <p className="room-status soft">
            Connection hiccup — rejoining quietly. Keep playing locally until it
            settles.
          </p>
        )}
        {shareUrl && status === 'connected' && (
          <div className="room-share">
            <input readOnly value={shareUrl} aria-label="Shareable room URL" />
            <button type="button" onClick={copyShare}>
              Copy
            </button>
          </div>
        )}
        <button type="button" className="room-leave" onClick={onLeave}>
          Leave table (solo offline)
        </button>
      </div>
    )
  }

  const busy = status === 'connecting'
  const showError = status === 'error' && lastError

  return (
    <div className={`room-panel${status === 'error' ? ' soft-error' : ''}`}>
      <p className="room-label">Shared table</p>
      <p className="room-status solo" role="status">
        {busy
          ? 'Connecting to room server…'
          : status === 'error'
            ? 'Solo — room server unreachable'
            : 'Solo — Host a room for multiplayer'}
      </p>
      <div className="room-actions">
        <button
          type="button"
          className="room-host"
          onClick={onHost}
          disabled={busy}
        >
          {busy ? 'Connecting…' : 'Host table'}
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
          disabled={!codeInput.trim() || busy}
          onClick={() => onJoin(codeInput.trim(), joinRole)}
        >
          Join
        </button>
      </div>
      {showError && <p className="room-error soft">{lastError}</p>}
      <p className="room-hint">
        Offline solo is normal. Host/Join only when you want a shared table
        (`npm run server` on :3001).
      </p>
    </div>
  )
}
