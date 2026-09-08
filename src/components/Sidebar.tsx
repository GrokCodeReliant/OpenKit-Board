import type { AssetCategory, AssetDef } from '../types'
import { CATEGORIES } from '../types'

const MIN_RADIUS = 3
const MAX_RADIUS = 40

/** Hexagon cell count for axial radius r: 3*r*(r+1)+1 */
function hexCount(radius: number): number {
  return 3 * radius * (radius + 1) + 1
}

interface SidebarProps {
  assets: AssetDef[]
  category: AssetCategory
  search: string
  selectedAssetId: string | null
  mapRadius: number
  onMapRadiusChange: (n: number) => void
  onCategoryChange: (c: AssetCategory) => void
  onSearchChange: (s: string) => void
  onSelectAsset: (id: string | null) => void
  onDragStart: (asset: AssetDef) => void
}

export function Sidebar({
  assets,
  category,
  search,
  selectedAssetId,
  mapRadius,
  onMapRadiusChange,
  onCategoryChange,
  onSearchChange,
  onSelectAsset,
  onDragStart,
}: SidebarProps) {
  const q = search.trim().toLowerCase()
  const filtered = assets.filter((a) => {
    if (a.category !== category) return false
    if (!q) return true
    return a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q)
  })

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <h1>Open Kit Board</h1>
        <p className="sidebar-sub">Hex map · sample assets</p>
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

      <div className="palette" role="list">
        {filtered.length === 0 && (
          <p className="palette-empty">No assets match.</p>
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
        <p className="hint">Select piece → move · Del removes</p>
      </footer>
    </aside>
  )
}
