export type AssetCategory = 'tiles' | 'props' | 'tokens' | 'monsters'

export interface AssetDef {
  id: string
  name: string
  category: AssetCategory
  file: string
  /** Resolved URL for the image */
  src: string
}

export interface Manifest {
  version: number
  basePath: string
  note?: string
  assets: Array<{
    id: string
    name: string
    category: AssetCategory
    file: string
  }>
}

/** Axial hex coordinates (pointy-top). */
export interface HexCoord {
  q: number
  r: number
}

export interface PlacedPiece {
  id: string
  assetId: string
  q: number
  r: number
  /** tiles = ground; others sit above */
  layer: 'ground' | 'object'
}

export const CATEGORIES: { id: AssetCategory; label: string }[] = [
  { id: 'tiles', label: 'Tiles' },
  { id: 'props', label: 'Props' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'monsters', label: 'Monsters' },
]

export function layerForCategory(category: AssetCategory): 'ground' | 'object' {
  return category === 'tiles' ? 'ground' : 'object'
}
