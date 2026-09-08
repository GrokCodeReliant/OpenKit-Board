import type { AssetCategory, AssetDef } from '../types'
import { CATEGORIES } from '../types'

interface SidebarProps {
  assets: AssetDef[]
  category: AssetCategory
  search: string
  selectedAssetId: string | null
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
