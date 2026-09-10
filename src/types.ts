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

/**
 * Square grid cell (column / row).
 * Fields stay `q`,`r` for WS compatibility — they mean square axes, not axial hex.
 */
export interface HexCoord {
  q: number
  r: number
}

/** Visual transform for a placed piece (cell-relative). */
export interface PieceTransform {
  /** Degrees clockwise around the piece center. */
  rotationDeg: number
  /** Width multiplier vs base cell fill (1 = one cell). */
  scaleX: number
  /** Height multiplier vs base cell fill (1 = one cell). */
  scaleY: number
  /** Image nudge in cell units (1 = one cell width). */
  offsetX: number
  /** Image nudge in cell units (1 = one cell height). */
  offsetY: number
  /**
   * When true, piece stays owned by its grid cell; body-drag nudges the image
   * (offset) instead of changing cells. Scale/rotate still apply either way.
   */
  lockedToCell: boolean
}

export const DEFAULT_PIECE_TRANSFORM: PieceTransform = {
  rotationDeg: 0,
  scaleX: 1,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
  lockedToCell: true,
}

export interface PlacedPiece {
  id: string
  assetId: string
  q: number
  r: number
  /** tiles = ground; others sit above */
  layer: 'ground' | 'object'
  /** Client id of who placed the piece (multiplayer ownership). */
  ownerId?: string
  /** Asset category at place-time (server permission checks). */
  category?: AssetCategory
  /** Visual edit fields — omit ⇒ defaults (legacy room state OK). */
  rotationDeg?: number
  scaleX?: number
  scaleY?: number
  offsetX?: number
  offsetY?: number
  lockedToCell?: boolean
  /**
   * When true, show transform handles and allow visual edit (rotate/scale/offset).
   * Default false — body drag moves the piece cell-to-cell like a tabletop token.
   */
  editUnlocked?: boolean
}

/** Patch for updatePiece / WS `update` (transform + edit gate). */
export type PieceUpdatePatch = Partial<PieceTransform> & {
  editUnlocked?: boolean
}

/** Resolve transform with sensible defaults for older pieces. */
export function pieceTransform(p: PlacedPiece): PieceTransform {
  return {
    rotationDeg: Number.isFinite(p.rotationDeg) ? (p.rotationDeg as number) : 0,
    scaleX: Number.isFinite(p.scaleX) && (p.scaleX as number) > 0 ? (p.scaleX as number) : 1,
    scaleY: Number.isFinite(p.scaleY) && (p.scaleY as number) > 0 ? (p.scaleY as number) : 1,
    offsetX: Number.isFinite(p.offsetX) ? (p.offsetX as number) : 0,
    offsetY: Number.isFinite(p.offsetY) ? (p.offsetY as number) : 0,
    lockedToCell: p.lockedToCell !== false,
  }
}

/** Visual-edit mode is opt-in; omit / false ⇒ simple cell move. */
export function isEditUnlocked(p: PlacedPiece): boolean {
  return p.editUnlocked === true
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
