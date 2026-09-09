/** Flat top-down camera presets (pan + zoom). No board tilt. */

import { boardExtent, CELL_SIZE } from './hex'

export type CameraView = 'top' | 'close'

export const CAMERA_VIEWS: { id: CameraView; label: string }[] = [
  { id: 'top', label: 'Top-down' },
  { id: 'close', label: 'Close' },
]

export const DEFAULT_CAMERA_VIEW: CameraView = 'top'

/**
 * Comfortable zoom floor when the board already fits the viewport.
 * For large maps (e.g. radius 40), fit-to-view may go lower so every cell stays visible.
 */
export const BOARD_ZOOM_MIN_COMFORT = 0.4
export const BOARD_ZOOM_MAX = 1.75

/** @deprecated Use BOARD_ZOOM_MIN_COMFORT / fitBoardZoom. */
export const HEX_ZOOM_MIN = BOARD_ZOOM_MIN_COMFORT
/** @deprecated Use BOARD_ZOOM_MAX. */
export const HEX_ZOOM_MAX = BOARD_ZOOM_MAX

export interface ViewPreset {
  /** Target board zoom when the preset is selected. */
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

/**
 * Zoom that fits the full square board into the viewport (with a small pad).
 * At radius 40 this drops below BOARD_ZOOM_MIN_COMFORT when needed.
 */
export function fitBoardZoom(
  mapRadius: number,
  viewW: number,
  viewH: number,
  cellSize = CELL_SIZE,
): number {
  if (viewW <= 1 || viewH <= 1) return BOARD_ZOOM_MIN_COMFORT
  const extent = boardExtent(mapRadius, cellSize)
  // Pad so outer cell strokes aren't flush against the well edge
  const pad = 1.06
  return Math.min(viewW / (extent * pad), viewH / (extent * pad))
}

/** Dynamic min zoom: always low enough that the whole board can fit. */
export function minBoardZoom(
  mapRadius: number,
  viewW: number,
  viewH: number,
): number {
  const fit = fitBoardZoom(mapRadius, viewW, viewH)
  // Allow zooming out at least to comfort floor, and further if fit requires it
  return Math.min(BOARD_ZOOM_MIN_COMFORT, fit)
}

export function clampBoardZoom(
  z: number,
  mapRadius: number,
  viewW: number,
  viewH: number,
): number {
  const minZ = minBoardZoom(mapRadius, viewW, viewH)
  // Absolute floor so tiny viewports don't go to zero
  const floor = Math.max(0.04, minZ)
  return Math.min(BOARD_ZOOM_MAX, Math.max(floor, z))
}

/** @deprecated Prefer clampBoardZoom with viewport + radius. */
export function clampHexZoom(z: number): number {
  return Math.min(BOARD_ZOOM_MAX, Math.max(0.04, z))
}
