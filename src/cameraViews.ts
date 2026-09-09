/** Bite 4 — flatscreen camera grammar (preset views + zoom limits). */

export type CameraView = 'top' | 'tilt' | 'close'

export const CAMERA_VIEWS: { id: CameraView; label: string }[] = [
  { id: 'top', label: 'Top-down' },
  { id: 'tilt', label: 'Slight tilt' },
  { id: 'close', label: 'Close' },
]

export const DEFAULT_CAMERA_VIEW: CameraView = 'tilt'

/** Hex SVG zoom clamps — keep enough of the well/rim context in play. */
export const HEX_ZOOM_MIN = 0.4
export const HEX_ZOOM_MAX = 1.75

export interface ViewPreset {
  /** Target hex-board zoom when the preset is selected. */
  hexZoom: number
  /** Subtle board tilt in degrees (0 = flat top-down). */
  rotateXDeg: number
  /**
   * Scale of the whole table object in the stage.
   * Kept ≤ ~1.1 so a strip of wood rim stays in frame on Close.
   */
  boardScale: number
}

export const VIEW_PRESETS: Record<CameraView, ViewPreset> = {
  top: { hexZoom: 0.85, rotateXDeg: 0, boardScale: 0.9 },
  tilt: { hexZoom: 1, rotateXDeg: 8, boardScale: 0.94 },
  close: { hexZoom: 1.35, rotateXDeg: 10, boardScale: 1.08 },
}

const STORAGE_KEY = 'openkit-board-camera-view'

export function loadCameraView(): CameraView {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'top' || raw === 'tilt' || raw === 'close') return raw
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
