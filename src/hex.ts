import type { HexCoord } from './types'

/**
 * Square checkerboard grid.
 * WS / piece fields still use `q`,`r` — they mean column / row (square axes), not axial hex.
 * Radius N → (2N+1)×(2N+1) map centered on (0,0).
 */

/** Full cell edge length in world pixels. */
export const CELL_SIZE = 56

/** @deprecated Prefer CELL_SIZE — kept for older call sites. */
export const HEX_SIZE = CELL_SIZE

export function cellWidth(size = CELL_SIZE): number {
  return size
}

export function cellHeight(size = CELL_SIZE): number {
  return size
}

/** Square col/row → pixel center at origin (0,0). */
export function squareToPixel(
  q: number,
  r: number,
  size = CELL_SIZE,
): { x: number; y: number } {
  return { x: q * size, y: r * size }
}

/** @deprecated Alias — q,r are square axes now. */
export function axialToPixel(
  q: number,
  r: number,
  size = CELL_SIZE,
): { x: number; y: number } {
  return squareToPixel(q, r, size)
}

/** Pixel → nearest square cell. */
export function pixelToSquare(
  x: number,
  y: number,
  size = CELL_SIZE,
): HexCoord {
  return {
    q: Math.round(x / size),
    r: Math.round(y / size),
  }
}

/** @deprecated Alias for pixelToSquare. */
export function pixelToAxial(
  x: number,
  y: number,
  size = CELL_SIZE,
): HexCoord {
  return pixelToSquare(x, y, size)
}

/** SVG path for a square centered at (cx, cy). `half` is half-edge (inset OK). */
export function squarePath(
  cx: number,
  cy: number,
  half: number,
): string {
  const x0 = cx - half
  const y0 = cy - half
  const edge = half * 2
  return `M${x0.toFixed(2)},${y0.toFixed(2)} h${edge.toFixed(2)} v${edge.toFixed(2)} h${(-edge).toFixed(2)} Z`
}

/** @deprecated Alias for squarePath with size treated as half-edge≈size/2. */
export function hexPath(cx: number, cy: number, size = CELL_SIZE): string {
  return squarePath(cx, cy, size / 2)
}

/** Radius N → (2N+1)² square map of integer q,r. */
export function generateSquareMap(radius: number): HexCoord[] {
  const cells: HexCoord[] = []
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      cells.push({ q, r })
    }
  }
  return cells
}

/** @deprecated Alias for generateSquareMap. */
export function generateHexMap(radius: number): HexCoord[] {
  return generateSquareMap(radius)
}

export function cellKey(q: number, r: number): string {
  return `${q},${r}`
}

/** @deprecated Alias for cellKey. */
export function hexKey(q: number, r: number): string {
  return cellKey(q, r)
}

/** Cell count for radius N: (2N+1)² */
export function squareCount(radius: number): number {
  const n = 2 * radius + 1
  return n * n
}

/** World-space half-span from origin to outer cell edge (inclusive). */
export function boardHalfExtent(radius: number, size = CELL_SIZE): number {
  return (radius + 0.5) * size
}

/** Full board edge length in world pixels. */
export function boardExtent(radius: number, size = CELL_SIZE): number {
  return (2 * radius + 1) * size
}

/** Whether (q,r) lies on the square map of the given radius. */
export function inSquareMap(q: number, r: number, radius: number): boolean {
  return Math.abs(q) <= radius && Math.abs(r) <= radius
}
