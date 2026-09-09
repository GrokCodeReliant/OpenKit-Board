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
  onMapRadiusChange: (n: number) => void
  onCategoryChange: (c: AssetCategory) => void
  onThemeChange: (t: AssetTheme | 'all') => void
  onLevelChange: (l: LevelBand | 'all') => void
  onSearchChange: (s: string) => void
  onSelectAsset: (id: string | null) => void
  onDragStart: (asset: AssetDef) => void
}

export function Sidebar({
  assets,
  category,
  theme,
  level,
  search,
  selectedAssetId,
  mapRadius,
  onMapRadiusChange,
  onCategoryChange,
  onThemeChange,
  onLevelChange,
  onSearchChange,
  onSelectAsset,
  onDragStart,
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
    <aside className="sidebar">
      <header className="sidebar-header">
        <h1>Open Kit Board</h1>
        <p className="sidebar-sub">DM hex board · demo pack · no AI required</p>
      </header>

      <div className="board-size-control">
        <label htmlFor="board-radius">Board size (radius)</label>
        <div className="board-size-row">
          <input
            id="board-radius"
            type="number"
            min={MIN_RADIUS}
            max={MAX_RADIUS}
            value={mapRadius}
            onChange={(e) => onMapRadiusChange(Number(e.target.value))}
          />
          <input
            type="range"
            min={MIN_RADIUS}
            max={MAX_RADIUS}
            value={mapRadius}
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
          <span>Theme</span>
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
          <span>Level band</span>
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

      <nav className="category-tabs" aria-label="Asset categories">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={category === c.id ? 'tab active' : 'tab'}
            onClick={() => onCategoryChange(c.id)}
          >
            {c.label}
          </button>
        ))}
      </nav>

      <div className="search-wrap">
        <input
          type="search"
          className="search"
          placeholder="Filter by name…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Filter assets by name"
        />
      </div>

      <p className="palette-count">{filtered.length} shown</p>

      <div className="palette" role="list">
        {filtered.length === 0 && (
          <p className="palette-empty">No assets match these filters.</p>
        )}
        {filtered.map((asset) => {
          const selected = selectedAssetId === asset.id
          return (
            <button
              key={asset.id}
              type="button"
              role="listitem"
              className={selected ? 'palette-item selected' : 'palette-item'}
              draggable
              title={`${asset.name} — drag onto a hex, or click then click a hex`}
              onClick={() => onSelectAsset(selected ? null : asset.id)}
              onDragStart={(e) => {
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
            : 'Drag onto hex, or click asset then hex.'}
        </p>
        <p className="hint">Select piece → move · Del removes · You write the story</p>
      </footer>
    </aside>
  )
}
