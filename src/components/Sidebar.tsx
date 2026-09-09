import type { ReactNode } from 'react'
import type { Role } from '../multiplayer/protocol'
import { canPlaceCategory } from '../multiplayer/useRoom'
import type { AssetCategory, AssetDef, AssetTheme, LevelBand } from '../types'
import { CATEGORIES, LEVEL_BANDS, THEMES } from '../types'

const MIN_RADIUS = 3
const MAX_RADIUS = 40

/** Hexagon cell count for axial radius r: 3*r*(r+1)+1 */
function hexCount(radius: number): number {
  return 3 * radius * (radius + 1) + 1
}

interface SidebarProps {
  assets: AssetDef[]
  category: AssetCategory
  theme: AssetTheme | 'all'
  level: LevelBand | 'all'
  search: string
  selectedAssetId: string | null
  mapRadius: number
  radiusEditable: boolean
  role: Role | null
  inRoom: boolean
  onMapRadiusChange: (n: number) => void
  onCategoryChange: (c: AssetCategory) => void
  onThemeChange: (t: AssetTheme | 'all') => void
  onLevelChange: (l: LevelBand | 'all') => void
  onSearchChange: (s: string) => void
  onSelectAsset: (id: string | null) => void
  onDragStart: (asset: AssetDef) => void
  roomSlot?: ReactNode
  rulesSlot?: ReactNode
}

export function Sidebar({
  assets,
  category,
  theme,
  level,
  search,
  selectedAssetId,
  mapRadius,
  radiusEditable,
  role,
  inRoom,
  onMapRadiusChange,
  onCategoryChange,
  onThemeChange,
  onLevelChange,
  onSearchChange,
  onSelectAsset,
  onDragStart,
  roomSlot,
  rulesSlot,
}: SidebarProps) {
  const q = search.trim().toLowerCase()
  const filtered = assets.filter((a) => {
    if (a.category !== category) return false
    if (theme !== 'all' && !a.themes.includes(theme)) return false
    if (level !== 'all' && !a.levels.includes(level)) return false
    if (!q) return true
    return a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q)
  })

  return (
    <aside className="sidebar tray" aria-label="Piece tray">
      <div className="tray-wood">
        <div className="tray-felt">
          <header className="sidebar-header">
            <h1>Open Kit Board</h1>
            <p className="sidebar-sub">
              {inRoom
                ? role === 'dm'
                  ? 'DM · shared table'
                  : 'Player · tokens you own'
                : 'Piece tray · demo pack · no AI'}
            </p>
          </header>

          {roomSlot}

          {rulesSlot}

          <div className={`board-size-control ${radiusEditable ? '' : 'disabled'}`}>
            <label htmlFor="board-radius" className="paper-label">
              Board span
              {!radiusEditable && <span className="lock-hint"> · DM only</span>}
            </label>
            <div className="board-size-row">
              <input
                id="board-radius"
                type="number"
                min={MIN_RADIUS}
                max={MAX_RADIUS}
                value={mapRadius}
                disabled={!radiusEditable}
                onChange={(e) => onMapRadiusChange(Number(e.target.value))}
                aria-label="Board size radius"
              />
              <input
                type="range"
                min={MIN_RADIUS}
                max={MAX_RADIUS}
                value={mapRadius}
                disabled={!radiusEditable}
                onChange={(e) => onMapRadiusChange(Number(e.target.value))}
                aria-label="Board size radius slider"
              />
            </div>
            <p className="board-size-meta">
              ~{hexCount(mapRadius)} hexes (3×r×(r+1)+1)
            </p>
          </div>

          <div className="filter-grid">
            <label className="filter-field">
              <span className="paper-label">Theme</span>
              <select
                value={theme}
                onChange={(e) => onThemeChange(e.target.value as AssetTheme | 'all')}
                aria-label="Filter by theme"
              >
                {THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span className="paper-label">Level band</span>
              <select
                value={level}
                onChange={(e) => onLevelChange(e.target.value as LevelBand | 'all')}
                aria-label="Filter by level band"
              >
                {LEVEL_BANDS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <nav className="category-tabs paper-tabs" aria-label="Asset categories">
            {CATEGORIES.map((c) => {
              const allowed = canPlaceCategory(role, inRoom, c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  className={category === c.id ? 'tab active' : 'tab'}
                  disabled={!allowed}
                  title={allowed ? c.label : 'Players may only place tokens'}
                  onClick={() => onCategoryChange(c.id)}
                >
                  {c.label}
                </button>
              )
            })}
          </nav>

          <div className="search-wrap">
            <input
              type="search"
              className="search"
              placeholder="Find by name…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Filter assets by name"
            />
          </div>

          <p className="palette-count">{filtered.length} in the tray</p>

          <div className="palette" role="list">
            {filtered.length === 0 && (
              <p className="palette-empty">No pieces match these labels.</p>
            )}
            {filtered.map((asset) => {
              const selected = selectedAssetId === asset.id
              const allowed = canPlaceCategory(role, inRoom, asset.category)
              return (
                <button
                  key={asset.id}
                  type="button"
                  role="listitem"
                  className={selected ? 'palette-item selected' : 'palette-item'}
                  draggable={allowed}
                  disabled={!allowed}
                  title={
                    allowed
                      ? `${asset.name} — drag onto a hex, or click then click a hex`
                      : 'Players may only place tokens'
                  }
                  onClick={() => {
                    if (!allowed) return
                    onSelectAsset(selected ? null : asset.id)
                  }}
                  onDragStart={(e) => {
                    if (!allowed) {
                      e.preventDefault()
                      return
                    }
                    e.dataTransfer.setData('application/x-openkit-asset', asset.id)
                    e.dataTransfer.effectAllowed = 'copy'
                    onDragStart(asset)
                  }}
                >
                  <img src={asset.src} alt="" width={48} height={48} draggable={false} />
                  <span>{asset.name}</span>
                </button>
              )
            })}
          </div>

          <footer className="sidebar-footer">
            <p>
              {selectedAssetId
                ? 'Click a hex to place. Esc to clear.'
                : 'Drag onto hex, or click piece then hex.'}
            </p>
            <p className="hint">
              {inRoom && role === 'player'
                ? 'Move/delete only your tokens · Del removes'
                : 'Select piece → move · Del removes · You write the story'}
            </p>
          </footer>
        </div>
      </div>
    </aside>
  )
}
