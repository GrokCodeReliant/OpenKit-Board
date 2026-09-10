/**
 * Shoulder board tools — JSON schemas for Ollama + client-side executors
 * against live AssetDef / PlacedPiece state. Never dump the full kit into prompts.
 */

import { inSquareMap } from './hex'
import type { AssetDef, PieceUpdatePatch, PlacedPiece } from './types'
import type { ShoulderLibraryPatch, ShoulderPlaceAction } from './shoulderPlace'

export const MAX_PLACE_PER_CALL = 30
export const MAX_SEARCH_RESULTS = 12

export interface ShoulderToolContext {
  assets: AssetDef[]
  pieces: PlacedPiece[]
  mapRadius: number
  canPlace: boolean
  onPlaceActions: (actions: ShoulderPlaceAction[]) => void
  onLibraryPatches: (patches: ShoulderLibraryPatch[]) => void
  onUpdatePiece: (id: string, patch: PieceUpdatePatch) => void
  onMovePiece: (id: string, q: number, r: number) => void
}

/** Ollama tools array (OpenAI-style function tools). */
export function shoulderToolDefs(canPlace: boolean) {
  const search = {
    type: 'function' as const,
    function: {
      name: 'search_assets',
      description:
        'Search loaded kit assets by name/id/category. Returns top matches — call this before place_pieces. Never invent asset ids.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search text, e.g. "goblin", "camp", "toadstool", "imp"',
          },
          limit: {
            type: 'number',
            description: `Max results (default 8, cap ${MAX_SEARCH_RESULTS})`,
          },
        },
        required: ['query'],
      },
    },
  }

  const listBoard = {
    type: 'function' as const,
    function: {
      name: 'list_board',
      description:
        'Summarize pieces currently on the board (id, asset, name, q, r, scale, rotation).',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  }

  const getRules = {
    type: 'function' as const,
    function: {
      name: 'get_rules',
      description:
        'Search the active rules pack for an excerpt matching a query (optional; pack is also in system context).',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Topic to look up in the rules pack',
          },
        },
        required: ['query'],
      },
    },
  }

  if (!canPlace) {
    return [search, listBoard, getRules]
  }

  return [
    search,
    listBoard,
    {
      type: 'function' as const,
      function: {
        name: 'place_pieces',
        description:
          `Place kit assets on the square board. Pass concrete {assetId,q,r} from search_assets results. Cap ${MAX_PLACE_PER_CALL} per call. Rough layouts OK — DM will mouse-finish. Optional ring helper: count + centerQ/centerR + ringRadius places copies around a center.`,
        parameters: {
          type: 'object',
          properties: {
            pieces: {
              type: 'array',
              description: 'Explicit placements',
              items: {
                type: 'object',
                properties: {
                  assetId: { type: 'string' },
                  q: { type: 'number', description: 'Column (square grid)' },
                  r: { type: 'number', description: 'Row (square grid)' },
                },
                required: ['assetId', 'q', 'r'],
              },
            },
            assetId: {
              type: 'string',
              description: 'Ring helper: single asset to place multiple times',
            },
            count: {
              type: 'number',
              description: 'Ring helper: how many copies (1–24)',
            },
            centerQ: { type: 'number', description: 'Ring center column' },
            centerR: { type: 'number', description: 'Ring center row' },
            ringRadius: {
              type: 'number',
              description: 'Approx ring distance in cells (default 2)',
            },
          },
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'update_pieces',
        description:
          'Update placed pieces by piece id or asset name substring. Patch scale, rotation, position, or unlock visual edit.',
        parameters: {
          type: 'object',
          properties: {
            match: {
              type: 'string',
              description: 'Piece id (e.g. p12) or asset/display name fragment',
            },
            scaleX: { type: 'number' },
            scaleY: { type: 'number' },
            rotationDeg: { type: 'number' },
            q: { type: 'number' },
            r: { type: 'number' },
            editUnlocked: { type: 'boolean' },
          },
          required: ['match'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'set_piece_stats',
        description:
          'Write notes/stats into the local piece library for an asset (by assetId or name).',
        parameters: {
          type: 'object',
          properties: {
            assetId: { type: 'string' },
            name: { type: 'string', description: 'Asset name if id unknown — will search' },
            statsBlob: { type: 'string' },
            notes: { type: 'string' },
            displayName: { type: 'string' },
          },
        },
      },
    },
    getRules,
  ]
}

function scoreAsset(query: string, a: AssetDef): number {
  const q = query.toLowerCase().trim()
  if (!q) return 0
  const name = a.name.toLowerCase()
  const id = a.id.toLowerCase()
  const cat = a.category.toLowerCase()
  let score = 0
  if (name === q || id === q) score += 100
  if (name.includes(q) || id.includes(q)) score += 40
  const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length >= 2)
  for (const t of tokens) {
    if (name.includes(t)) score += 8
    if (id.includes(t)) score += 6
    if (cat.includes(t)) score += 2
  }
  // Light synonym boosts for common DM words vs kit naming
  const syn: Record<string, string[]> = {
    goblin: ['imp', 'skirmisher'],
    goblins: ['imp', 'skirmisher'],
    camp: ['toadstool', 'fairy', 'lantern', 'camp', 'ring'],
    campsite: ['toadstool', 'fairy', 'lantern'],
    orc: ['horned', 'legionnaire'],
    fire: ['lantern', 'altar'],
  }
  for (const t of tokens) {
    const hints = syn[t]
    if (!hints) continue
    for (const h of hints) {
      if (name.includes(h) || id.includes(h)) score += 5
    }
  }
  return score
}

export function searchAssets(
  assets: AssetDef[],
  query: string,
  limit = 8,
): { id: string; name: string; category: string; score: number }[] {
  const lim = Math.min(MAX_SEARCH_RESULTS, Math.max(1, Math.round(limit) || 8))
  return assets
    .map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      score: scoreAsset(query, a),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, lim)
}

function ringCells(
  centerQ: number,
  centerR: number,
  count: number,
  radius: number,
  mapRadius: number,
): { q: number; r: number }[] {
  const n = Math.min(24, Math.max(1, Math.round(count)))
  const rad = Math.max(1, Math.round(radius) || 2)
  const out: { q: number; r: number }[] = []
  const seen = new Set<string>()
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    let q = Math.round(centerQ + rad * Math.cos(angle))
    let r = Math.round(centerR + rad * Math.sin(angle))
    // Nudge if duplicate or off-map
    for (let tries = 0; tries < 12; tries++) {
      const key = `${q},${r}`
      if (
        inSquareMap(q, r, mapRadius) &&
        !seen.has(key) &&
        !(q === centerQ && r === centerR)
      ) {
        seen.add(key)
        out.push({ q, r })
        break
      }
      q += tries % 2 === 0 ? 1 : -1
      r += tries % 3 === 0 ? 1 : 0
    }
  }
  return out
}

function resolveAsset(
  assets: AssetDef[],
  assetId?: string,
  name?: string,
): AssetDef | null {
  if (assetId) {
    const exact = assets.find((a) => a.id === assetId)
    if (exact) return exact
  }
  const q = (name || assetId || '').trim()
  if (!q) return null
  const hits = searchAssets(assets, q, 1)
  if (!hits.length) return null
  return assets.find((a) => a.id === hits[0].id) ?? null
}

function matchPieces(pieces: PlacedPiece[], assets: AssetDef[], match: string): PlacedPiece[] {
  const m = match.trim().toLowerCase()
  if (!m) return []
  const byId = pieces.filter((p) => p.id.toLowerCase() === m)
  if (byId.length) return byId
  return pieces.filter((p) => {
    if (p.assetId.toLowerCase().includes(m)) return true
    const a = assets.find((x) => x.id === p.assetId)
    return Boolean(a && a.name.toLowerCase().includes(m))
  })
}

export interface ToolExecExtra {
  rulesBody: string
  rulesTitle: string
}

export function executeShoulderTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ShoulderToolContext,
  extra: ToolExecExtra,
): string {
  try {
    switch (name) {
      case 'search_assets': {
        const query = String(args.query ?? '')
        const limit = Number(args.limit ?? 8)
        const hits = searchAssets(ctx.assets, query, limit)
        return JSON.stringify({
          query,
          count: hits.length,
          results: hits,
          note:
            hits.length === 0
              ? 'No matches — try a shorter keyword (imp, toadstool, lantern, tile).'
              : 'Use these exact assetId values with place_pieces.',
        })
      }
      case 'list_board': {
        const list = ctx.pieces.map((p) => {
          const a = ctx.assets.find((x) => x.id === p.assetId)
          return {
            id: p.id,
            assetId: p.assetId,
            name: a?.name ?? p.assetId,
            q: p.q,
            r: p.r,
            scaleX: p.scaleX ?? 1,
            scaleY: p.scaleY ?? 1,
            rotationDeg: p.rotationDeg ?? 0,
            editUnlocked: p.editUnlocked === true,
            layer: p.layer,
          }
        })
        return JSON.stringify({
          mapRadius: ctx.mapRadius,
          pieceCount: list.length,
          pieces: list,
        })
      }
      case 'place_pieces': {
        if (!ctx.canPlace) {
          return JSON.stringify({
            error: 'Place tools are DM/solo only.',
          })
        }
        const actions: ShoulderPlaceAction[] = []
        const rawPieces = Array.isArray(args.pieces) ? args.pieces : []
        for (const raw of rawPieces) {
          if (!raw || typeof raw !== 'object') continue
          const row = raw as Record<string, unknown>
          const assetId = String(row.assetId ?? '')
          const q = Number(row.q)
          const r = Number(row.r)
          const asset = ctx.assets.find((a) => a.id === assetId)
          if (!asset || !Number.isFinite(q) || !Number.isFinite(r)) continue
          if (!inSquareMap(q, r, ctx.mapRadius)) continue
          actions.push({ assetId, assetName: asset.name, q, r })
          if (actions.length >= MAX_PLACE_PER_CALL) break
        }

        // Ring helper
        if (actions.length < MAX_PLACE_PER_CALL && args.assetId && args.count) {
          const asset = resolveAsset(ctx.assets, String(args.assetId))
          if (asset) {
            const centerQ = Number(args.centerQ ?? 0)
            const centerR = Number(args.centerR ?? 0)
            const cells = ringCells(
              centerQ,
              centerR,
              Number(args.count),
              Number(args.ringRadius ?? 2),
              ctx.mapRadius,
            )
            for (const c of cells) {
              if (actions.length >= MAX_PLACE_PER_CALL) break
              actions.push({
                assetId: asset.id,
                assetName: asset.name,
                q: c.q,
                r: c.r,
              })
            }
          }
        }

        if (!actions.length) {
          return JSON.stringify({
            ok: false,
            placed: 0,
            error:
              'No valid placements. Call search_assets first and use exact assetId + in-bounds q,r.',
          })
        }
        ctx.onPlaceActions(actions)
        return JSON.stringify({
          ok: true,
          placed: actions.length,
          pieces: actions.map((a) => ({
            assetId: a.assetId,
            name: a.assetName,
            q: a.q,
            r: a.r,
          })),
        })
      }
      case 'update_pieces': {
        if (!ctx.canPlace) {
          return JSON.stringify({ error: 'Update tools are DM/solo only.' })
        }
        const match = String(args.match ?? '')
        const targets = matchPieces(ctx.pieces, ctx.assets, match)
        if (!targets.length) {
          return JSON.stringify({ ok: false, updated: 0, error: `No pieces matched "${match}"` })
        }
        const patch: PieceUpdatePatch = {}
        if (typeof args.scaleX === 'number' && Number.isFinite(args.scaleX)) {
          patch.scaleX = args.scaleX
        }
        if (typeof args.scaleY === 'number' && Number.isFinite(args.scaleY)) {
          patch.scaleY = args.scaleY
        }
        if (typeof args.rotationDeg === 'number' && Number.isFinite(args.rotationDeg)) {
          patch.rotationDeg = args.rotationDeg
        }
        if (typeof args.editUnlocked === 'boolean') {
          patch.editUnlocked = args.editUnlocked
        }
        const moveQ = typeof args.q === 'number' && Number.isFinite(args.q) ? args.q : null
        const moveR = typeof args.r === 'number' && Number.isFinite(args.r) ? args.r : null
        const updated: string[] = []
        for (const p of targets) {
          if (Object.keys(patch).length) ctx.onUpdatePiece(p.id, patch)
          if (moveQ != null && moveR != null) {
            if (inSquareMap(moveQ, moveR, ctx.mapRadius)) {
              ctx.onMovePiece(p.id, moveQ, moveR)
            }
          }
          updated.push(p.id)
        }
        return JSON.stringify({ ok: true, updated: updated.length, ids: updated })
      }
      case 'set_piece_stats': {
        if (!ctx.canPlace) {
          return JSON.stringify({ error: 'Library tools are DM/solo only.' })
        }
        const asset = resolveAsset(
          ctx.assets,
          args.assetId != null ? String(args.assetId) : undefined,
          args.name != null ? String(args.name) : undefined,
        )
        if (!asset) {
          return JSON.stringify({
            ok: false,
            error: 'Asset not found — search_assets first',
          })
        }
        const patch: ShoulderLibraryPatch = {
          assetId: asset.id,
          displayName:
            typeof args.displayName === 'string' && args.displayName.trim()
              ? String(args.displayName)
              : asset.name,
          thumbSrc: asset.src,
        }
        if (typeof args.statsBlob === 'string') patch.statsBlob = args.statsBlob
        if (typeof args.notes === 'string') patch.notes = args.notes
        ctx.onLibraryPatches([patch])
        return JSON.stringify({
          ok: true,
          assetId: asset.id,
          displayName: patch.displayName,
        })
      }
      case 'get_rules': {
        const query = String(args.query ?? '').toLowerCase().trim()
        const body = extra.rulesBody || ''
        if (!body.trim()) {
          return JSON.stringify({
            error: 'No rules pack loaded. Load Kit Sparks sample first.',
          })
        }
        if (!query) {
          return JSON.stringify({
            title: extra.rulesTitle,
            excerpt: body.slice(0, 800),
          })
        }
        const lower = body.toLowerCase()
        const idx = lower.indexOf(query)
        if (idx < 0) {
          // token fallback
          const tokens = query.split(/\s+/).filter((t) => t.length >= 3)
          let best = -1
          for (const t of tokens) {
            const i = lower.indexOf(t)
            if (i >= 0 && (best < 0 || i < best)) best = i
          }
          if (best < 0) {
            return JSON.stringify({
              title: extra.rulesTitle,
              found: false,
              hint: 'No match — try Fighter, Rogue, Guard, HP, Armor',
            })
          }
          const start = Math.max(0, best - 120)
          return JSON.stringify({
            title: extra.rulesTitle,
            found: true,
            excerpt: body.slice(start, start + 700),
          })
        }
        const start = Math.max(0, idx - 120)
        return JSON.stringify({
          title: extra.rulesTitle,
          found: true,
          excerpt: body.slice(start, start + 700),
        })
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ error: message })
  }
}
