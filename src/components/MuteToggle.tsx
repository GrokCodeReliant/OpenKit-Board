interface MuteToggleProps {
  muted: boolean
  onChange: (muted: boolean) => void
}

export function MuteToggle({ muted, onChange }: MuteToggleProps) {
  return (
    <div className="mute-toggle" role="group" aria-label="Board sound">
      <button
        type="button"
        className={muted ? 'mute-btn active' : 'mute-btn'}
        aria-pressed={muted}
        title={muted ? 'Unmute board sounds' : 'Mute board sounds'}
        onClick={() => onChange(!muted)}
      >
        {muted ? 'Muted' : 'Sound on'}
      </button>
    </div>
  )
}
