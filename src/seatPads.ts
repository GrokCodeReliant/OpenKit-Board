/** Bite 7 — decorative seat pads around the table (solo presence; no networking). */

export type SeatSide = 'near' | 'far' | 'west' | 'east'

export interface SeatPadDef {
  id: string
  side: SeatSide
  /** Local player seat — optional “You” marker. */
  you?: boolean
  label: string
}

/** Four empty seats; near seat is the local “You” pad. */
export const SEAT_PADS: SeatPadDef[] = [
  { id: 'near', side: 'near', you: true, label: 'You' },
  { id: 'west', side: 'west', label: 'Empty seat' },
  { id: 'east', side: 'east', label: 'Empty seat' },
  { id: 'far', side: 'far', label: 'Empty seat' },
]
