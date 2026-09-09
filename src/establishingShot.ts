/** Bite 6 — establishing moment: room overview → table well. */

/** Ease duration in ms (brief: 800–1500). */
export const ESTABLISHING_MS = 1200

/** Room-overview scale relative to settled table framing. */
export const OVERVIEW_SCALE = 0.48

const STORAGE_KEY = 'openkit-board-establishing-seen'

export function hasSeenEstablishingShot(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function markEstablishingShotSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    /* ignore */
  }
}

/** Skip animation when the user prefers reduced motion. */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * First visit (and forced New board) play the shot unless reduced-motion.
 * Repeat loads skip via localStorage.
 */
export function shouldPlayEstablishingShot(force = false): boolean {
  if (prefersReducedMotion()) return false
  if (force) return true
  return !hasSeenEstablishingShot()
}
