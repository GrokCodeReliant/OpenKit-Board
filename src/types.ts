export type AssetCategory = 'tiles' | 'props' | 'tokens' | 'monsters'

/** Coarse setting filter for the DM palette (not a rules system). */
export type AssetTheme =
  | 'fantasy'
  | 'fae'
  | 'heaven'
  | 'hell'
  | 'extraplanar'

/** Rough level band for browsing — optional tags, not enforced balance. */
export type LevelBand = '1-4' | '5-10' | '11-20'

export interface AssetDef {
  id: string
  name: string
  category: AssetCategory
  file: string
  /** Resolved URL for the image */
  src: string
  themes: AssetTheme[]
  levels: LevelBand[]
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
    themes?: AssetTheme[]
    levels?: LevelBand[]
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

export const THEMES: { id: AssetTheme | 'all'; label: string }[] = [
  { id: 'all', label: 'All themes' },
  { id: 'fantasy', label: 'Fantasy / medieval' },
  { id: 'fae', label: 'Fae' },
  { id: 'heaven', label: 'Heaven / celestial' },
  { id: 'hell', label: 'Hell / infernal' },
  { id: 'extraplanar', label: 'Extraplanar' },
]

export const LEVEL_BANDS: { id: LevelBand | 'all'; label: string }[] = [
  { id: 'all', label: 'All levels' },
  { id: '1-4', label: 'Level 1–4' },
  { id: '5-10', label: 'Level 5–10' },
  { id: '11-20', label: 'Level 11–20' },
]

export function layerForCategory(category: AssetCategory): 'ground' | 'object' {
  return category === 'tiles' ? 'ground' : 'object'
}
