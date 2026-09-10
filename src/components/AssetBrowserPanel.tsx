import type { AssetLoadSource } from '../assets'
import type { Role } from '../multiplayer/protocol'
import { canPlaceCategory } from '../multiplayer/useRoom'
import type { AssetCategory, AssetDef, AssetTheme, LevelBand } from '../types'
import { CATEGORIES, LEVEL_BANDS, THEMES } from '../types'

interface AssetBrowserPanelProps {
  assets: AssetDef[]
  category: AssetCategory
  theme: AssetTheme | 'all'
  level: LevelBand | 'all'
  search: string
  selectedAssetId: string | null
  role: Role | null
  inRoom: boolean
  /** Live Open Kit scan vs curated demo fallback. */
  assetSource: AssetLoadSource
  assetRefreshing?: boolean
  onRefreshAssets: () => void
  onCategoryChange: (c: AssetCategory) => void
  onThemeChange: (t: AssetTheme | 'all') => void
  onLevelChange: (l: LevelBand | 'all') => void
  onSearchChange: (s: string) => void
  onSelectAsset: (id: string | null) => void
  onDragStart: (asset: AssetDef) => void
}

/** Filterable asset grid for the floating Assets browse window. */
export function AssetBrowserPanel({
  assets,
  category,
  theme,
  level,
  search,
  selectedAssetId,
  role,
  inRoom,
  assetSource,
  assetRefreshing = false,
  onRefreshAssets,
  onCategoryChange,
  onThemeChange,
  onLevelChange,
  onSearchChange,
  onSelectAsset,
  onDragStart,
}: AssetBrowserPanelProps) {
  const q = search.trim().toLowerCase()
  const filtered = assets.filter((a) => {
    if (a.category !== category) return false
    if (theme !== 'all' && !a.themes.includes(theme)) return false
    if (level !== 'all' && !a.levels.includes(level)) return false
    if (!q) return true
    return a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q)
  })

  const sourceLabel =
    assetSource === 'kit'
      ? `Open Kit live (${assets.length})`
      : `Demo pack (fallback) · ${assets.length}`

  return (
    <div className="asset-browser-panel">
      <div className="asset-source-bar">
        <span
          className={
            assetSource === 'kit'
              ? 'asset-source-label live'
              : 'asset-source-label fallback'
          }
          title={
            assetSource === 'kit'
              ? 'Serving PNGs from OPENKIT_KIT_PATH via the room server'
              : 'Room server / kit path unavailable — curated demo pack'
          }
        >
          {sourceLabel}
        </span>
        <button
          type="button"
          className="asset-refresh-btn"
          onClick={onRefreshAssets}
          disabled={assetRefreshing}
          title="Re-scan kit (or reload demo) for new Ink drops"
        >
          {assetRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
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

      <p className="palette-count">{filtered.length} matching</p>

      <div className="palette asset-browser-palette" role="list">
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
                  ? `${asset.name} — drag onto a cell, or click then click a cell`
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

      <p className="asset-browser-hint">
        {selectedAssetId
          ? 'Click a cell to place. Esc to clear.'
          : 'Drag onto a cell, or click piece then cell.'}
      </p>
    </div>
  )
}
