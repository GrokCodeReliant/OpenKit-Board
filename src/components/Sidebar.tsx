import type { ReactNode } from 'react'

const MIN_RADIUS = 3
const MAX_RADIUS = 40

/** Square map cell count for radius r: (2r+1)² */
function squareCount(radius: number): number {
  const n = 2 * radius + 1
  return n * n
}

interface SidebarProps {
  mapRadius: number
  radiusEditable: boolean
  inRoom: boolean
  roleLabel: string | null
  onMapRadiusChange: (n: number) => void
  roomSlot?: ReactNode
  rulesSlot?: ReactNode
  /** Compact browse openers (Assets / Pinned / Shoulder). */
  assetsOpen: boolean
  pinnedOpen: boolean
  shoulderOpen: boolean
  pinnedCount: number
  onOpenAssets: () => void
  onOpenPinned: () => void
  onOpenShoulder: () => void
  placementHint?: string
  controlHint?: string
}

export function Sidebar({
  mapRadius,
  radiusEditable,
  inRoom,
  roleLabel,
  onMapRadiusChange,
  roomSlot,
  rulesSlot,
  assetsOpen,
  pinnedOpen,
  shoulderOpen,
  pinnedCount,
  onOpenAssets,
  onOpenPinned,
  onOpenShoulder,
  placementHint,
  controlHint,
}: SidebarProps) {
  return (
    <aside className="sidebar tray" aria-label="Piece tray">
      <div className="tray-wood">
        <div className="tray-felt">
          <header className="sidebar-header">
            <h1>Open Kit Board</h1>
            <p className="sidebar-sub">
              {inRoom
                ? roleLabel === 'dm'
                  ? 'DM · shared table'
                  : 'Player · tokens you own'
                : 'Piece tray · demo pack · local Shoulder'}
            </p>
          </header>

          {roomSlot}

          {rulesSlot}

          <div className="tray-browse" role="group" aria-label="Browse pieces">
            <button
              type="button"
              className={assetsOpen ? 'tray-browse-btn active' : 'tray-browse-btn'}
              aria-pressed={assetsOpen}
              onClick={onOpenAssets}
            >
              Assets
            </button>
            <button
              type="button"
              className={pinnedOpen ? 'tray-browse-btn active' : 'tray-browse-btn'}
              aria-pressed={pinnedOpen}
              onClick={onOpenPinned}
            >
              Pinned
              {pinnedCount > 0 ? (
                <span className="tray-browse-count">{pinnedCount}</span>
              ) : null}
            </button>
            <button
              type="button"
              className={
                shoulderOpen ? 'tray-browse-btn active' : 'tray-browse-btn'
              }
              aria-pressed={shoulderOpen}
              onClick={onOpenShoulder}
              title="Private local rules helper (this browser only)"
            >
              Shoulder
            </button>
          </div>

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
              ~{squareCount(mapRadius)} cells ((2r+1)² square)
            </p>
          </div>

          <footer className="sidebar-footer">
            <p>
              {placementHint ??
                'Open Assets or Pinned to browse — drag onto a cell, or click then cell.'}
            </p>
            <p className="hint">
              {controlHint ??
                'Select piece → floating sheet · Del removes · Pin notes locally'}
            </p>
          </footer>
        </div>
      </div>
    </aside>
  )
}
