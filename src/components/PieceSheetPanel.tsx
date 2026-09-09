import { useEffect, useState } from 'react'
import type { AssetDef } from '../types'
import type { PieceLibraryEntry } from '../pieceLibrary'

interface PieceSheetPanelProps {
  assetId: string
  asset: AssetDef | null
  /** Prefill from personal library when present. */
  libraryEntry: PieceLibraryEntry | null
  onPin: (entry: {
    assetId: string
    displayName: string
    notes: string
    statsBlob: string
    thumbSrc?: string
  }) => void
  onUnpin: (assetId: string) => void
  onClose: () => void
  /** When true, chrome close lives on the FloatingWindow — hide local ×. */
  floating?: boolean
}

export function PieceSheetPanel({
  assetId,
  asset,
  libraryEntry,
  onPin,
  onUnpin,
  onClose,
  floating = false,
}: PieceSheetPanelProps) {
  const defaultName = asset?.name || libraryEntry?.displayName || assetId
  const thumbSrc = asset?.src || libraryEntry?.thumbSrc

  const [displayName, setDisplayName] = useState(defaultName)
  const [notes, setNotes] = useState('')
  const [statsBlob, setStatsBlob] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)

  // Load fields when opening a different asset (not on every pin save).
  useEffect(() => {
    if (libraryEntry && libraryEntry.assetId === assetId) {
      setDisplayName(libraryEntry.displayName || defaultName)
      setNotes(libraryEntry.notes)
      setStatsBlob(libraryEntry.statsBlob)
    } else {
      setDisplayName(defaultName)
      setNotes('')
      setStatsBlob('')
    }
    setSavedFlash(false)
    // Intentionally only assetId — pin updates libraryEntry and must not wipe the flash.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- switch-target only
  }, [assetId])

  const pinned = Boolean(libraryEntry && libraryEntry.assetId === assetId)

  const onSave = () => {
    onPin({
      assetId,
      displayName: displayName.trim() || defaultName,
      notes,
      statsBlob,
      thumbSrc,
    })
    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 1600)
  }

  return (
    <div
      className={`piece-sheet${floating ? ' piece-sheet-floating' : ''}`}
      role={floating ? undefined : 'dialog'}
      aria-label={floating ? undefined : 'Piece sheet'}
    >
      <div className="piece-sheet-head">
        {thumbSrc ? (
          <img
            className="piece-sheet-thumb"
            src={thumbSrc}
            alt=""
            width={56}
            height={56}
            draggable={false}
          />
        ) : (
          <div className="piece-sheet-thumb placeholder" aria-hidden="true" />
        )}
        <div className="piece-sheet-head-text">
          <p className="piece-sheet-label">
            Index card
            {pinned && <span className="piece-sheet-pinned-badge">Pinned</span>}
          </p>
          <p className="piece-sheet-asset-id" title={assetId}>
            {assetId}
          </p>
        </div>
        {!floating && (
          <button
            type="button"
            className="piece-sheet-close"
            onClick={onClose}
            aria-label="Close piece sheet"
          >
            ×
          </button>
        )}
      </div>

      <label className="rules-field">
        <span>Display name</span>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={defaultName}
          aria-label="Display name"
        />
      </label>

      <label className="rules-field">
        <span>Notes</span>
        <textarea
          rows={5}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Bookwork, personality, reminders…"
          aria-label="Notes"
        />
      </label>

      <label className="rules-field">
        <span>Stats / freeform (optional)</span>
        <textarea
          rows={4}
          value={statsBlob}
          onChange={(e) => setStatsBlob(e.target.value)}
          placeholder="Any numbers or tags you want — no baked columns."
          aria-label="Freeform stats"
        />
      </label>

      <p className="piece-sheet-hint">
        Pin saves to your browser library (keyed by asset). Not shared over the
        room. Drag the title bar to move this card over the table.
      </p>

      <div className="rules-actions">
        <button type="button" className="rules-primary" onClick={onSave}>
          {savedFlash ? 'Pinned ✓' : pinned ? 'Save pin' : 'Pin to library'}
        </button>
        {pinned && (
          <button
            type="button"
            className="rules-danger"
            onClick={() => onUnpin(assetId)}
          >
            Unpin
          </button>
        )}
        <button type="button" className="rules-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
