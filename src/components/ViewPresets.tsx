import { CAMERA_VIEWS, type CameraView } from '../cameraViews'

interface ViewPresetsProps {
  view: CameraView
  onChange: (view: CameraView) => void
}

export function ViewPresets({ view, onChange }: ViewPresetsProps) {
  return (
    <div className="view-presets" role="group" aria-label="Board camera view">
      {CAMERA_VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          className={view === v.id ? 'view-btn active' : 'view-btn'}
          aria-pressed={view === v.id}
          onClick={() => onChange(v.id)}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}
