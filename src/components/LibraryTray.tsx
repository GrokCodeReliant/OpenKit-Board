import type { AssetDef } from '../types'
import {
  listLibraryEntries,
  type PieceLibraryEntry,
  type PieceLibraryMap,
} from '../pieceLibrary'
import { canPlaceCategory } from '../multiplayer/useRoom'
import type { Role } from '../multiplayer/protocol'

interface LibraryTrayProps {
  library: PieceLibraryMap
  assetsById: Map<string, AssetDef>
  role: Role | null
  inRoom: boolean
  onOpenSheet: (assetId: string) => void
  onPlace: (assetId: string) => void
}

export function LibraryTray({
  library,
  assetsById,
  role,
  inRoom,
  onOpenSheet,
  onPlace,
}: LibraryTrayProps) {
  const entries = listLibraryEntries(library)

  return (
    <div className="library-tray">
      {entries.length === 0 ? (
        <p className="rules-empty">
          Select a board piece, jot notes, and pin — they stay in this browser.
        </p>
      ) : (
        <ul className="library-list" aria-label="Pinned piece library">
          {entries.map((entry) => (
            <LibraryRow
              key={entry.assetId}
              entry={entry}
              asset={assetsById.get(entry.assetId) ?? null}
              role={role}
              inRoom={inRoom}
              onOpenSheet={onOpenSheet}
              onPlace={onPlace}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function LibraryRow({
  entry,
  asset,
  role,
  inRoom,
  onOpenSheet,
  onPlace,
}: {
  entry: PieceLibraryEntry
  asset: AssetDef | null
  role: Role | null
  inRoom: boolean
  onOpenSheet: (assetId: string) => void
  onPlace: (assetId: string) => void
}) {
  const thumb = asset?.src || entry.thumbSrc
  const canPlace =
    asset != null && canPlaceCategory(role, inRoom, asset.category)

  return (
    <li className="library-row">
      <button
        type="button"
        className="library-row-main"
        onClick={() => onOpenSheet(entry.assetId)}
        title="Open sheet to edit"
      >
        {thumb ? (
          <img src={thumb} alt="" width={40} height={40} draggable={false} />
        ) : (
          <span className="library-row-thumb-ph" aria-hidden="true" />
        )}
        <span className="library-row-text">
          <strong>{entry.displayName}</strong>
          <span className="library-row-meta">
            {entry.notes.trim()
              ? entry.notes.trim().slice(0, 48) +
                (entry.notes.trim().length > 48 ? '…' : '')
              : 'No notes yet'}
          </span>
        </span>
      </button>
      {canPlace && (
        <button
          type="button"
          className="library-place"
          title="Select for placement on the board"
          onClick={() => onPlace(entry.assetId)}
        >
          Place
        </button>
      )}
    </li>
  )
}
