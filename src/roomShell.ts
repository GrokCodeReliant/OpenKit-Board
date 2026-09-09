/** Bite 2 — room presence shell (backdrop modes). Original hobby-room; not a Demeo clone. */

export type RoomMode = 'room' | 'dim' | 'void'

export const ROOM_MODES: { id: RoomMode; label: string }[] = [
  { id: 'room', label: 'Room' },
  { id: 'dim', label: 'Dim room' },
  { id: 'void', label: 'Void' },
]

const STORAGE_KEY = 'openkit-board-room-mode'

export function loadRoomMode(): RoomMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'room' || raw === 'dim' || raw === 'void') return raw
  } catch {
    /* ignore */
  }
  return 'room'
}

export function saveRoomMode(mode: RoomMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
}
