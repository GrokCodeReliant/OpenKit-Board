import type { RulesPack } from '../rulesPack'
import type { AssetCategory, PlacedPiece } from '../types'

/** Piece `q`,`r` are square column/row axes (not axial hex). */

export type Role = 'dm' | 'player'

export interface RoomState {
  mapRadius: number
  pieces: PlacedPiece[]
  /** DM-owned active rules pack for the room (null = none). */
  rulesPack: RulesPack | null
}

/** Client → server */
export type ClientMessage =
  | { type: 'host' }
  | { type: 'join'; roomCode: string; role?: Role }
  | { type: 'setRadius'; radius: number }
  | {
      type: 'place'
      assetId: string
      q: number
      r: number
      category: AssetCategory
    }
  | { type: 'move'; id: string; q: number; r: number }
  | {
      type: 'update'
      id: string
      rotationDeg?: number
      scaleX?: number
      scaleY?: number
      offsetX?: number
      offsetY?: number
      lockedToCell?: boolean
      editUnlocked?: boolean
    }
  | { type: 'delete'; id: string }
  | { type: 'setRulesPack'; pack: RulesPack | null }

/** Server → client */
export type ServerMessage =
  | { type: 'hello'; clientId: string }
  | {
      type: 'joined'
      roomCode: string
      clientId: string
      role: Role
      state: RoomState
    }
  | { type: 'state'; state: RoomState }
  | { type: 'peers'; count: number }
  | { type: 'error'; message: string }

export function wsUrl(): string {
  const env = import.meta.env.VITE_WS_URL as string | undefined
  if (env) return env
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  // Dev: Vite proxies /ws → room server. Prod: same host if reverse-proxied.
  if (import.meta.env.DEV) {
    return `${proto}//${window.location.host}/ws`
  }
  return `${proto}//${window.location.host}/ws`
}
