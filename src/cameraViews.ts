/** Flat top-down board framing (pan + wheel zoom). No Close / tilt presets. */

import { boardExtent, CELL_SIZE } from './hex'

/** Default board zoom (wheel adjusts from here). */
export const DEFAULT_HEX_ZOOM = 0.85

/**
 * Scale of the whole table object in the stage.
 * Kept ≤ 1 so the board top stays visible under browser chrome.
 */
export const BOARD_SCALE = 0.98

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
  // Square map: (2R+1)*CELL_SIZE on both axes — fit to the inscribed square
  // of the viewport so a square well kisses all four sides (no letterboxing).
  const extent = boardExtent(mapRadius, cellSize)
  const view = Math.min(viewW, viewH)
  // Tiny pad so outer cell strokes aren't clipped by the well edge
  const pad = 1.02
  return view / (extent * pad)
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
