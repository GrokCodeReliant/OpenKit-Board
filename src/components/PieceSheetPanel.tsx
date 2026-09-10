import { useEffect, useState } from 'react'
import type { AssetDef, PieceUpdatePatch, PlacedPiece } from '../types'
import { hasPieceSheet, isEditUnlocked, pieceTransform } from '../types'
import type { PieceLibraryEntry } from '../pieceLibrary'

interface PieceSheetPanelProps {
  assetId: string
  asset: AssetDef | null
  /** Prefill from personal library when present. */
  libraryEntry: PieceLibraryEntry | null
  /** When the sheet is tied to a selected board piece, expose transforms. */
  placedPiece?: PlacedPiece | null
  canEditTransform?: boolean
  onTransformChange?: (patch: PieceUpdatePatch) => void
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

function num(v: string, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function PieceSheetPanel({
  assetId,
  asset,
  libraryEntry,
  placedPiece = null,
  canEditTransform = false,
  onTransformChange,
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
  const [sheetRole, setSheetRole] = useState('')
  const [hp, setHp] = useState('')
  const [maxHp, setMaxHp] = useState('')
  const [armor, setArmor] = useState('')
  const [defeated, setDefeated] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  // Prefer room-synced piece sheet when present; else personal library.
  useEffect(() => {
    if (placedPiece && hasPieceSheet(placedPiece)) {
      setDisplayName(placedPiece.displayName?.trim() || defaultName)
      setNotes(placedPiece.notes ?? '')
      setStatsBlob(placedPiece.statsBlob ?? '')
      setSheetRole(placedPiece.sheetRole ?? '')
      setHp(placedPiece.hp != null ? String(placedPiece.hp) : '')
      setMaxHp(placedPiece.maxHp != null ? String(placedPiece.maxHp) : '')
      setArmor(placedPiece.armor != null ? String(placedPiece.armor) : '')
      setDefeated(placedPiece.defeated === true)
    } else if (libraryEntry && libraryEntry.assetId === assetId) {
      setDisplayName(libraryEntry.displayName || defaultName)
      setNotes(libraryEntry.notes)
      setStatsBlob(libraryEntry.statsBlob)
      setSheetRole('')
      setHp('')
      setMaxHp('')
      setArmor('')
      setDefeated(false)
    } else {
      setDisplayName(defaultName)
      setNotes('')
      setStatsBlob('')
      setSheetRole('')
      setHp('')
      setMaxHp('')
      setArmor('')
      setDefeated(false)
    }
    setSavedFlash(false)
    // Switch target: asset, selected piece, or incoming MCP sheet fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- switch-target only
  }, [
    assetId,
    placedPiece?.id,
    placedPiece?.displayName,
    placedPiece?.notes,
    placedPiece?.statsBlob,
    placedPiece?.sheetRole,
    placedPiece?.hp,
    placedPiece?.maxHp,
    placedPiece?.armor,
    placedPiece?.defeated,
  ])

  const pinned = Boolean(libraryEntry && libraryEntry.assetId === assetId)
  const t = placedPiece ? pieceTransform(placedPiece) : null
  const transformEnabled = Boolean(placedPiece && canEditTransform && onTransformChange)

  const sheetPatch = (): PieceUpdatePatch => {
    const patch: PieceUpdatePatch = {
      displayName: displayName.trim() || defaultName,
      notes,
      statsBlob,
      sheetRole: sheetRole.trim(),
      defeated,
    }
    if (hp.trim() !== '' && Number.isFinite(Number(hp))) patch.hp = Number(hp)
    if (maxHp.trim() !== '' && Number.isFinite(Number(maxHp)))
      patch.maxHp = Number(maxHp)
    if (armor.trim() !== '' && Number.isFinite(Number(armor)))
      patch.armor = Number(armor)
    return patch
  }

  const onSave = () => {
    onPin({
      assetId,
      displayName: displayName.trim() || defaultName,
      notes,
      statsBlob,
      thumbSrc,
    })
    if (placedPiece && onTransformChange) {
      onTransformChange(sheetPatch())
    }
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

      {placedPiece && (
        <fieldset className="piece-transform-fields">
          <legend>Board sheet / combat</legend>
          <p className="piece-sheet-hint">
            Synced on this piece over the room (MCP + Host). Rules-agnostic —
            fill from whatever pack is on the table.
          </p>
          <div className="piece-transform-grid">
            <label className="rules-field">
              <span>Role</span>
              <input
                type="text"
                value={sheetRole}
                onChange={(e) => setSheetRole(e.target.value)}
                placeholder="PC / NPC / Fighter…"
                aria-label="Sheet role"
                disabled={!transformEnabled}
              />
            </label>
            <label className="rules-field">
              <span>HP</span>
              <input
                type="number"
                value={hp}
                onChange={(e) => setHp(e.target.value)}
                aria-label="Hit points"
                disabled={!transformEnabled}
              />
            </label>
            <label className="rules-field">
              <span>Max HP</span>
              <input
                type="number"
                value={maxHp}
                onChange={(e) => setMaxHp(e.target.value)}
                aria-label="Max hit points"
                disabled={!transformEnabled}
              />
            </label>
            <label className="rules-field">
              <span>Armor</span>
              <input
                type="number"
                value={armor}
                onChange={(e) => setArmor(e.target.value)}
                aria-label="Armor"
                disabled={!transformEnabled}
              />
            </label>
          </div>
          <label className="piece-lock-check">
            <input
              type="checkbox"
              checked={defeated}
              disabled={!transformEnabled}
              onChange={(e) => setDefeated(e.target.checked)}
              aria-label="Defeated"
            />
            <span>Defeated / down</span>
          </label>
        </fieldset>
      )}

      {placedPiece && (
        <label className="piece-lock-check piece-edit-unlock">
          <input
            type="checkbox"
            checked={isEditUnlocked(placedPiece)}
            disabled={!transformEnabled}
            onChange={(e) =>
              onTransformChange?.({ editUnlocked: e.target.checked })
            }
            aria-label="Unlock visual edit"
          />
          <span>
            Unlock visual edit
            <span className="piece-sheet-hint-inline">
              {' '}
              — handles for rotate / scale / nudge (off = drag moves cells)
            </span>
          </span>
        </label>
      )}

      {t && (
        <fieldset
          className="piece-transform-fields"
          disabled={!transformEnabled || !isEditUnlocked(placedPiece!)}
        >
          <legend>Board transform</legend>
          <p className="piece-sheet-hint">
            Rotate / scale / nudge so roads and gates abut. Lock keeps the home
            cell; body-drag nudges the image — stretch edges to fill after.
            {!transformEnabled && ' (read-only — you do not control this piece)'}
            {transformEnabled &&
              !isEditUnlocked(placedPiece!) &&
              ' (unlock visual edit above to change)'}
          </p>
          <div className="piece-transform-grid">
            <label className="rules-field">
              <span>Rotation °</span>
              <input
                type="number"
                step={15}
                value={Number(t.rotationDeg.toFixed(1))}
                onChange={(e) =>
                  onTransformChange?.({
                    rotationDeg: num(e.target.value, t.rotationDeg),
                  })
                }
                aria-label="Rotation degrees"
              />
            </label>
            <label className="rules-field">
              <span>Scale X</span>
              <input
                type="number"
                step={0.05}
                min={0.15}
                max={6}
                value={Number(t.scaleX.toFixed(3))}
                onChange={(e) =>
                  onTransformChange?.({
                    scaleX: Math.min(6, Math.max(0.15, num(e.target.value, t.scaleX))),
                  })
                }
                aria-label="Scale X"
              />
            </label>
            <label className="rules-field">
              <span>Scale Y</span>
              <input
                type="number"
                step={0.05}
                min={0.15}
                max={6}
                value={Number(t.scaleY.toFixed(3))}
                onChange={(e) =>
                  onTransformChange?.({
                    scaleY: Math.min(6, Math.max(0.15, num(e.target.value, t.scaleY))),
                  })
                }
                aria-label="Scale Y"
              />
            </label>
            <label className="rules-field">
              <span>Offset X (cells)</span>
              <input
                type="number"
                step={0.05}
                value={Number(t.offsetX.toFixed(3))}
                onChange={(e) =>
                  onTransformChange?.({
                    offsetX: Math.min(8, Math.max(-8, num(e.target.value, t.offsetX))),
                  })
                }
                aria-label="Offset X in cells"
              />
            </label>
            <label className="rules-field">
              <span>Offset Y (cells)</span>
              <input
                type="number"
                step={0.05}
                value={Number(t.offsetY.toFixed(3))}
                onChange={(e) =>
                  onTransformChange?.({
                    offsetY: Math.min(8, Math.max(-8, num(e.target.value, t.offsetY))),
                  })
                }
                aria-label="Offset Y in cells"
              />
            </label>
          </div>
          <label className="piece-lock-check">
            <input
              type="checkbox"
              checked={t.lockedToCell}
              onChange={(e) =>
                onTransformChange?.({ lockedToCell: e.target.checked })
              }
            />
            <span>Lock to cell (nudge image; Shift-drag to re-home)</span>
          </label>
          <div className="rules-actions piece-transform-actions">
            <button
              type="button"
              className="rules-secondary"
              disabled={!transformEnabled}
              onClick={() =>
                onTransformChange?.({
                  rotationDeg: 0,
                  scaleX: 1,
                  scaleY: 1,
                  offsetX: 0,
                  offsetY: 0,
                })
              }
            >
              Reset transform
            </button>
          </div>
        </fieldset>
      )}

      <p className="piece-sheet-hint">
        Pin saves to your browser library (keyed by asset). When a board piece
        is selected, Save also writes the sheet/combat fields onto that piece
        so the room (and Grok MCP) stay in sync. Drag the title bar to move
        this card over the table.
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
