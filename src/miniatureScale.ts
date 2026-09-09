/**
 * Bite 8 — miniature scale polish (DOF, pan parallax, contact shadow helpers).
 * Soft flatscreen cues so close zoom reads as peering at minis, not a spreadsheet.
 */

import { HEX_ZOOM_MAX, HEX_ZOOM_MIN } from './cameraViews'

/** Backdrop shifts at 2–3% of board pan offset from center. */
export const PARALLAX_FACTOR = 0.025

/**
 * Zoom where edge DOF begins to appear (above mid-range).
 * Below this, center stays fully sharp with no edge blur.
 */
export const DOF_ZOOM_START = 1.15

/** Soft max blur radius (px) at full zoom-in — keep readable. */
export const DOF_BLUR_PX = 2.75

export interface PanOffset {
  x: number
  y: number
}

/** 0 = no DOF, 1 = full soft edge blur at max zoom. */
export function dofAmountFromZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 0
  const span = HEX_ZOOM_MAX - DOF_ZOOM_START
  if (span <= 0) return zoom >= HEX_ZOOM_MAX ? 1 : 0
  return Math.min(1, Math.max(0, (zoom - DOF_ZOOM_START) / span))
}

/** Backdrop translate (px) for a pan offset measured from board center. */
export function parallaxFromPan(offset: PanOffset): PanOffset {
  return {
    x: offset.x * PARALLAX_FACTOR,
    y: offset.y * PARALLAX_FACTOR,
  }
}

/** True when zoom is near the lean-in range (for optional CSS class). */
export function isCloseZoom(zoom: number): boolean {
  if (!Number.isFinite(zoom)) return false
  const mid = (HEX_ZOOM_MIN + HEX_ZOOM_MAX) / 2
  return zoom >= mid
}
