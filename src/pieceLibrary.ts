/** Personal piece notes library — local browser only (not room-synced). */

export interface PieceLibraryEntry {
  assetId: string
  displayName: string
  notes: string
  /** Freeform bookwork / stats blob — not a rules engine. */
  statsBlob: string
  /** Thumbnail URL captured at pin time (asset src). */
  thumbSrc?: string
  updatedAt: string
}

export const PIECE_LIBRARY_KEY = 'okb.pieceLibrary.v1'

export type PieceLibraryMap = Record<string, PieceLibraryEntry>

export function loadPieceLibrary(): PieceLibraryMap {
  try {
    const raw = localStorage.getItem(PIECE_LIBRARY_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    const out: PieceLibraryMap = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const entry = normalizeEntry(key, value)
      if (entry) out[entry.assetId] = entry
    }
    return out
  } catch {
    return {}
  }
}

function normalizeEntry(key: string, value: unknown): PieceLibraryEntry | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const assetId =
    typeof v.assetId === 'string' && v.assetId ? v.assetId : key
  if (!assetId) return null
  return {
    assetId,
    displayName: typeof v.displayName === 'string' ? v.displayName : assetId,
    notes: typeof v.notes === 'string' ? v.notes : '',
    statsBlob: typeof v.statsBlob === 'string' ? v.statsBlob : '',
    thumbSrc: typeof v.thumbSrc === 'string' ? v.thumbSrc : undefined,
    updatedAt:
      typeof v.updatedAt === 'string' ? v.updatedAt : new Date().toISOString(),
  }
}

export function savePieceLibrary(lib: PieceLibraryMap): void {
  localStorage.setItem(PIECE_LIBRARY_KEY, JSON.stringify(lib))
}

export function getLibraryEntry(
  lib: PieceLibraryMap,
  assetId: string,
): PieceLibraryEntry | null {
  return lib[assetId] ?? null
}

export function upsertLibraryEntry(
  lib: PieceLibraryMap,
  entry: Omit<PieceLibraryEntry, 'updatedAt'> & { updatedAt?: string },
): PieceLibraryMap {
  const next: PieceLibraryEntry = {
    assetId: entry.assetId,
    displayName: entry.displayName.trim() || entry.assetId,
    notes: entry.notes,
    statsBlob: entry.statsBlob,
    thumbSrc: entry.thumbSrc,
    updatedAt: entry.updatedAt ?? new Date().toISOString(),
  }
  const out = { ...lib, [next.assetId]: next }
  savePieceLibrary(out)
  return out
}

export function removeLibraryEntry(
  lib: PieceLibraryMap,
  assetId: string,
): PieceLibraryMap {
  if (!(assetId in lib)) return lib
  const out = { ...lib }
  delete out[assetId]
  savePieceLibrary(out)
  return out
}

/** Newest first. */
export function listLibraryEntries(lib: PieceLibraryMap): PieceLibraryEntry[] {
  return Object.values(lib).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  )
}
