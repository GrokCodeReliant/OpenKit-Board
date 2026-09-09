import { ROOM_MODES, type RoomMode } from '../roomShell'

interface PresenceToggleProps {
  mode: RoomMode
  onChange: (mode: RoomMode) => void
}

export function PresenceToggle({ mode, onChange }: PresenceToggleProps) {
  return (
    <div className="presence-toggle" role="group" aria-label="Room backdrop">
      {ROOM_MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          className={mode === m.id ? 'presence-btn active' : 'presence-btn'}
          aria-pressed={mode === m.id}
          onClick={() => onChange(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
