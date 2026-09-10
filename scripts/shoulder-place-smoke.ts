/**
 * Self-check: stringified placements + fuzzy "goblin" + x/y aliases.
 * npx --yes tsx scripts/shoulder-place-smoke.ts
 */
import {
  coerceToolArgs,
  executeShoulderTool,
} from '../src/shoulderTools.ts'
import type { AssetDef } from '../src/types.ts'
import type { ShoulderPlaceAction } from '../src/shoulderPlace.ts'

const assets: AssetDef[] = [
  {
    id: 'monster-goblin',
    name: 'Goblin Scout',
    category: 'monsters',
    file: 'monster-goblin.png',
    src: '/x.png',
    themes: ['fantasy'],
    levels: ['1-4'],
  },
  {
    id: 'token-imp-skirmisher',
    name: 'Imp Skirmisher',
    category: 'tokens',
    file: 'token-imp-skirmisher.png',
    src: '/y.png',
    themes: ['fantasy'],
    levels: ['1-4'],
  },
]

const placed: ShoulderPlaceAction[] = []
const ctx = {
  assets,
  pieces: [],
  mapRadius: 8,
  canPlace: true,
  onPlaceActions: (actions: ShoulderPlaceAction[]) => {
    placed.push(...actions)
  },
  onLibraryPatches: () => {},
  onUpdatePiece: () => {},
  onMovePiece: () => {},
}

const extra = { rulesBody: '', rulesTitle: '' }

const raw = {
  placements: '[{"assetId":"goblin","x":2,"y":-1}]',
}

console.log('coerced', JSON.stringify(coerceToolArgs(raw)))
const result = executeShoulderTool('place_pieces', raw, ctx, extra)
console.log('result', result)
console.log('placed', JSON.stringify(placed))

const ok =
  placed.length === 1 &&
  placed[0].assetId === 'monster-goblin' &&
  placed[0].q === 2 &&
  placed[0].r === -1

const search = executeShoulderTool('search_assets', { query: 'goblin' }, ctx, extra)
console.log('search', search)

placed.length = 0
executeShoulderTool(
  'place_pieces',
  { pieces: [{ assetId: 'token-imp-skirmisher', q: 0, r: 0 }] },
  ctx,
  extra,
)

if (!ok) {
  console.error('FAIL: expected monster-goblin at (2,-1) via stringified placements')
  process.exit(1)
}
if (placed.length !== 1 || placed[0].assetId !== 'token-imp-skirmisher') {
  console.error('FAIL: legacy pieces path')
  process.exit(1)
}
console.log('SMOKE OK')
