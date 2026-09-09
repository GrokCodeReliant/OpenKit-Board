/** Flat top-down camera presets (pan + zoom). No board tilt. */

export type CameraView = 'top' | 'close'

export const CAMERA_VIEWS: { id: CameraView; label: string }[] = [
  { id: 'top', label: 'Top-down' },
  { id: 'close', label: 'Close' },
]

export const DEFAULT_CAMERA_VIEW: CameraView = 'top'

/** Hex SVG zoom clamps — keep enough of the well/rim context in play. */
export const HEX_ZOOM_MIN = 0.4
export const HEX_ZOOM_MAX = 1.75

export interface ViewPreset {
  /** Target hex-board zoom when the preset is selected. */
  hexZoom: number
  /**
   * Scale of the whole table object in the stage.
   * Kept ≤ ~1.1 so a strip of wood rim stays in frame on Close.
   */
  boardScale: number
}

export const VIEW_PRESETS: Record<CameraView, ViewPreset> = {
  top: { hexZoom: 0.85, boardScale: 0.98 },
  close: { hexZoom: 1.35, boardScale: 1.06 },
}

const STORAGE_KEY = 'openkit-board-camera-view'

export function loadCameraView(): CameraView {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'top' || raw === 'close') return raw
    // Legacy "tilt" (and anything else) → flat top-down
    if (raw === 'tilt') return 'top'
  } catch {
    /* ignore */
  }
  return DEFAULT_CAMERA_VIEW
}

export function saveCameraView(view: CameraView): void {
  try {
    localStorage.setItem(STORAGE_KEY, view)
  } catch {
    /* ignore */
  }
}

export function clampHexZoom(z: number): number {
  return Math.min(HEX_ZOOM_MAX, Math.max(HEX_ZOOM_MIN, z))
}
