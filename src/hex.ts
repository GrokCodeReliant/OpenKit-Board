import type { HexCoord } from './types'

/** Pointy-top hex size (center to vertex). */
export const HEX_SIZE = 40

/** Pixel size of a hex cell (width / height). */
export function hexWidth(size = HEX_SIZE): number {
  return Math.sqrt(3) * size
}

export function hexHeight(size = HEX_SIZE): number {
  return 2 * size
}

/** Axial → pixel (pointy-top), origin at (0,0) hex center. */
export function axialToPixel(q: number, r: number, size = HEX_SIZE): { x: number; y: number } {
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r)
  const y = size * ((3 / 2) * r)
  return { x, y }
}

/** Pixel → axial (fractional), then round to nearest hex. */
export function pixelToAxial(x: number, y: number, size = HEX_SIZE): HexCoord {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size
  const r = ((2 / 3) * y) / size
  return axialRound(q, r)
}

export function axialRound(q: number, r: number): HexCoord {
  const s = -q - r
  let rq = Math.round(q)
  let rr = Math.round(r)
  const rs = Math.round(s)
  const qDiff = Math.abs(rq - q)
  const rDiff = Math.abs(rr - r)
  const sDiff = Math.abs(rs - s)
  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs
  } else if (rDiff > sDiff) {
    rr = -rq - rs
  }
  return { q: rq, r: rr }
}

/** Six corner points of a pointy-top hex centered at (cx, cy). */
export function hexCorners(cx: number, cy: number, size = HEX_SIZE): { x: number; y: number }[] {
  const corners: { x: number; y: number }[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30)
    corners.push({
      x: cx + size * Math.cos(angle),
      y: cy + size * Math.sin(angle),
    })
  }
  return corners
}

export function hexPath(cx: number, cy: number, size = HEX_SIZE): string {
  return hexCorners(cx, cy, size)
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ') + ' Z'
}

/** Generate a rectangular-ish map of axial coords covering |q|,|r| within range. */
export function generateHexMap(radius: number): HexCoord[] {
  const cells: HexCoord[] = []
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius)
    const r2 = Math.min(radius, -q + radius)
    for (let r = r1; r <= r2; r++) {
      cells.push({ q, r })
    }
  }
  return cells
}

export function hexKey(q: number, r: number): string {
  return `${q},${r}`
}
