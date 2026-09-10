/**
 * Local Shoulder place/arrange helper — parse DM natural language into
 * structured place actions. No network / no LLM.
 */

import { cellKey, inSquareMap } from './hex'
import { layerForCategory } from './types'
import type { AssetDef, AssetCategory } from './types'

export interface ShoulderPlaceAction {
  assetId: string
  assetName: string
  q: number
  r: number
  /** Query phrase that was fuzzy-matched when not an exact hit. */
  substitutedFrom?: string
}

export interface ShoulderLibraryPatch {
  assetId: string
  displayName: string
  statsBlob?: string
  notes?: string
  thumbSrc?: string
}

export interface ShoulderPlaceResult {
  /** True when the message looks like a place/arrange request. */
  isPlaceIntent: boolean
  text: string
  actions: ShoulderPlaceAction[]
  libraryPatches: ShoulderLibraryPatch[]
}

/** Soft synonyms → preferred substrings to boost fuzzy score. */
const SYNONYM_HINTS: Record<string, string[]> = {
  goblin: ['imp', 'skirmisher'],
  goblins: ['imp', 'skirmisher'],
  orc: ['horned', 'legionnaire'],
  orcs: ['horned', 'legionnaire'],
  demon: ['imp', 'horned'],
  devil: ['imp', 'horned'],
  camp: ['toadstool', 'fairy ring', 'lantern', 'well'],
  campsite: ['toadstool', 'fairy ring', 'lantern'],
  fire: ['lantern', 'altar'],
  well: ['fae well', 'mossy'],
  faewell: ['fae well', 'mossy'],
  pixie: ['pixie'],
  pixies: ['pixie'],
  imp: ['imp'],
  imps: ['imp'],
  dryad: ['dryad'],
  seraph: ['seraph'],
  angel: ['seraph'],
  dreamwalker: ['dreamwalker'],
  door: ['dream door'],
  altar: ['brass horn', 'altar'],
  lantern: ['halo lantern'],
  toadstool: ['toadstool'],
  mushroom: ['mushroom', 'toadstool'],
  ring: ['fairy ring', 'mushroom ring'],
  stones: ['fairy ring'],
  mist: ['dream mist'],
  path: ['willow'],
  grate: ['iron grate'],
  magma: ['magma'],
  goldvein: ['goldvein'],
}

const PLACE_VERB =
  /\b(put|place|drop|arrange|make|build|spawn|summon|set\s+up|set\s+down|lay\s+out|add)\b/i
const SCENE_NOUN =
  /\b(camp|campsite|scene|encounter|ring|around|surround(?:ed|ing)?|near|center|centre)\b/i
const COUNT_ASSET =
  /\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+([a-z][a-z0-9' -]{1,40}?)\b/gi

const WORD_NUM: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
}

const FILLER_AFTER_COUNT = new Set([
  'with',
  'around',
  'near',
  'at',
  'on',
  'in',
  'to',
  'the',
  'it',
  'them',
  'and',
  'of',
  'hp',
  'hit',
  'half',
  'full',
  'camp',
  'campsite',
  'center',
  'centre',
  'board',
  'map',
  'scene',
  'ring',
])

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function parseCount(raw: string): number {
  const t = raw.toLowerCase()
  if (WORD_NUM[t] != null) return WORD_NUM[t]
  const n = Number.parseInt(t, 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 24) : 1
}

export function isPlaceIntent(message: string): boolean {
  const q = message.trim()
  if (!q) return false
  // Clear rules Q&A — don't steal "what is HP" / "how does Guard work"
  if (
    /^(what|how|why|when|where|who|which|explain|describe|tell\s+me)\b/i.test(q) &&
    !PLACE_VERB.test(q) &&
    !/\b(put|drop|place|arrange|camp)\b/i.test(q)
  ) {
    return false
  }
  if (PLACE_VERB.test(q)) return true
  if (SCENE_NOUN.test(q) && /\b(\d+|a|an|one|two|three|four|five)\b/i.test(q)) {
    return true
  }
  // "3 imps near the center" / "fae well and two pixies"
  if (
    /\b(\d+|two|three|four|five)\s+[a-z]/i.test(q) &&
    /\b(around|near|center|centre|and)\b/i.test(q)
  ) {
    return true
  }
  return false
}

interface FuzzyHit {
  asset: AssetDef
  score: number
  exact: boolean
}

/** Soft singularize for matching imps→imp, pixies→pixie, goblins→goblin. */
function singularizeToken(w: string): string {
  if (w.endsWith('ses') || w.endsWith('xes') || w.endsWith('zes')) return w.slice(0, -2)
  // pixies→pixie (keep ie); fairies→fairy handled via stemVariants
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -1) // pixie
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1)
  return w
}

function stemVariants(w: string): string[] {
  const s = singularizeToken(w)
  const out = new Set<string>([w, s])
  if (w.endsWith('ies') && w.length > 4) out.add(`${w.slice(0, -3)}y`) // fairies→fairy
  return [...out]
}

function queryHints(q: string): string[] {
  const tokens = q.split(' ').filter(Boolean)
  const out: string[] = []
  for (const t of tokens) {
    const stem = singularizeToken(t)
    for (const key of [t, stem]) {
      const h = SYNONYM_HINTS[key]
      if (h) out.push(...h)
    }
  }
  const joined = q.replace(/\s/g, '')
  if (SYNONYM_HINTS[joined]) out.push(...SYNONYM_HINTS[joined])
  return [...new Set(out)]
}

/** True when the match is close enough that we should not nag about substitution. */
export function isCloseMatch(query: string, assetName: string): boolean {
  const q = norm(query)
  const n = norm(assetName)
  if (!q || !n) return false
  if (n.includes(q) || q.includes(n)) return true
  const qStems = stemVariants(q.split(' ').pop() || q)
  return n.split(' ').some((t) => {
    const tStems = stemVariants(t)
    return qStems.some((qs) =>
      tStems.some((ts) => ts === qs || ts.startsWith(qs) || qs.startsWith(ts)),
    )
  })
}

/** Fuzzy-match a free-text name against the loaded AssetDef list. */
export function fuzzyMatchAsset(
  query: string,
  assets: AssetDef[],
  prefer?: AssetCategory[],
): FuzzyHit | null {
  const q = norm(query)
  if (!q || assets.length === 0) return null

  const qTokens = q.split(' ').filter(Boolean).map(singularizeToken)
  const hints = queryHints(q)
  const creatureQuery = /\b(imp|goblin|pixie|dryad|seraph|legion|walker|orc|demon|devil|token)\b/.test(
    qTokens.join(' '),
  )

  let best: FuzzyHit | null = null

  for (const asset of assets) {
    const name = norm(asset.name)
    const id = norm(asset.id.replace(/^(tile|prop|token|monster)-/, ''))
    const idFull = norm(asset.id)
    const nameTokens = name.split(' ').map(singularizeToken)
    let score = 0
    let exact = false

    if (
      name === q ||
      id === q ||
      idFull === q ||
      asset.id.toLowerCase() === query.trim().toLowerCase()
    ) {
      score = 100
      exact = true
    } else if (name.includes(q) || q.includes(name)) {
      score = 70 + Math.min(20, q.length)
    } else if (id.includes(q) || q.includes(id)) {
      score = 60 + Math.min(15, q.length)
    } else {
      const nameSet = new Set(nameTokens)
      const idTokens = new Set(id.split(' ').map(singularizeToken))
      let overlap = 0
      for (const t of qTokens) {
        if (nameSet.has(t) || idTokens.has(t)) overlap += 3
        else if ([...nameSet].some((n) => n.startsWith(t) || t.startsWith(n))) overlap += 1.5
      }
      score = overlap * 8
    }

    // Synonym boosts (e.g. goblin → imp) — strong, and prefer tokens
    let synonymHit = false
    for (const h of hints) {
      const hn = singularizeToken(norm(h))
      if (name.includes(hn) || id.includes(hn) || nameTokens.includes(hn)) {
        score += 40
        synonymHit = true
      }
    }
    if (synonymHit && (asset.category === 'tokens' || asset.category === 'monsters')) {
      score += 20
    }

    // Prefer category when requested (camp center → props/tiles)
    if (prefer?.includes(asset.category)) score += 12
    // Soft preference: tokens for creature-y queries
    if (creatureQuery && (asset.category === 'tokens' || asset.category === 'monsters')) {
      score += 10
    }
    // Penalize accidental tile matches for creature words
    if (creatureQuery && (asset.category === 'tiles' || asset.category === 'props')) {
      score -= 15
    }
    // Very short queries are dangerous ("go", "g") — require stronger score later
    if (q.length <= 2) score -= 30

    if (!best || score > best.score) {
      best = { asset, score, exact }
    }
  }

  if (!best || best.score < 18) return null
  return best
}

interface ParsedGroup {
  count: number
  query: string
  role: 'center' | 'ring' | 'loose'
}

function stripStatsPhrases(s: string): string {
  return s
    .replace(/\bhalf\s*(?:of\s*)?(?:\d+\s*)?(?:hp|hit\s*points?)\b/gi, ' ')
    .replace(/\b(?:hp|hit\s*points?)\s*[:=]?\s*\d+(?:\s*[-–to]+\s*\d+)?\b/gi, ' ')
    .replace(/\b\d+\s*[-–to]+\s*\d+\s*(?:hp|hit\s*points?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseGroups(message: string): ParsedGroup[] {
  const cleaned = stripStatsPhrases(message)
  const groups: ParsedGroup[] = []
  const lower = cleaned.toLowerCase()

  const isCamp = /\b(camp|campsite)\b/i.test(cleaned)
  const countWord =
    '\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve'

  // "camp with five goblins around it" (before generic and/with — "camp with" is not a center asset)
  const campWith = new RegExp(
    String.raw`\b(?:make\s+(?:a\s+)?)?(?:camp|campsite)\s+with\s+(${countWord})\s+([a-z][a-z0-9' -]+?)(?:\s+around(?:\s+it)?)?\s*$`,
    'i',
  ).exec(cleaned.trim())
  if (campWith) {
    groups.push({ count: 1, query: 'camp', role: 'center' })
    const ringQ = campWith[2].trim()
    groups.push({ count: parseCount(campWith[1]), query: ringQ, role: 'ring' })
    return groups
  }

  // "X and N Y" / "put a fae well and 3 imps around it"
  const centerAndRing = new RegExp(
    String.raw`^(?:put|place|drop|add|make|build|set\s+up)?\s*(?:a|an|the)?\s*([a-z][a-z0-9' -]+?)\s+(?:and|with)\s+(${countWord})\s+([a-z][a-z0-9' -]+?)(?:\s+(?:around|near|by)\s+(?:it|them|the\s+center|the\s+centre)?)?\.?$`,
    'i',
  ).exec(cleaned.trim())

  if (centerAndRing) {
    const centerQ = centerAndRing[1].trim()
    const count = parseCount(centerAndRing[2])
    const ringQ = centerAndRing[3].trim()
    if (centerQ && !FILLER_AFTER_COUNT.has(norm(centerQ).split(' ')[0])) {
      groups.push({ count: 1, query: centerQ, role: 'center' })
    }
    if (ringQ && count > 0) {
      groups.push({ count, query: ringQ, role: 'ring' })
    }
    if (groups.length) return groups
  }

  // Generic "N name" captures
  COUNT_ASSET.lastIndex = 0
  let m: RegExpExecArray | null
  const found: { count: number; query: string; index: number }[] = []
  while ((m = COUNT_ASSET.exec(cleaned)) !== null) {
    let name = m[2].trim()
    // Trim trailing scene words
    name = name
      .replace(
        /\s+(around|near|at|on|in|with|to|the|center|centre|board|map|it|them|camp|campsite|ring|scene|half|hp|hit).*$/i,
        '',
      )
      .trim()
    const first = norm(name).split(' ')[0]
    if (!name || FILLER_AFTER_COUNT.has(first)) continue
    // Skip pure "a camp" handled above — still allow as center prop
    found.push({ count: parseCount(m[1]), query: name, index: m.index })
  }

  if (found.length === 0) {
    // Bare asset: "fae well" / "drop pixie"
    const bare =
      /(?:put|place|drop|add|spawn)\s+(?:a|an|the)?\s*([a-z][a-z0-9' -]{2,40}?)(?:\s+(?:near|at|on)\s+(?:the\s+)?(?:center|centre|board|map))?\.?$/i.exec(
        cleaned.trim(),
      )
    if (bare) {
      const q = bare[1]
        .trim()
        .replace(/\s+(near|at|on|the|center|centre|board|map).*$/i, '')
        .trim()
      if (q) return [{ count: 1, query: q, role: isCamp ? 'center' : 'loose' }]
    }
    if (isCamp) {
      return [{ count: 1, query: 'camp', role: 'center' }]
    }
    return []
  }

  if (isCamp && found.length === 1) {
    groups.push({ count: 1, query: 'camp', role: 'center' })
    groups.push({ ...found[0], role: 'ring' })
    return groups
  }

  // Heuristic: first singular prop-ish → center; rest ring/loose
  if (found.length >= 2) {
    const [first, ...rest] = found
    const firstIsCenter =
      first.count === 1 ||
      /\b(well|camp|altar|lantern|door|toadstool|ring|stones|path|mist|grate)\b/i.test(
        first.query,
      )
    if (firstIsCenter) {
      groups.push({ count: 1, query: first.query, role: 'center' })
      for (const f of rest) {
        groups.push({ ...f, role: 'ring' })
      }
      return groups
    }
  }

  // All loose / ring near center
  const nearCenter = /\b(near|around|at)\s+(?:the\s+)?(?:center|centre)\b/i.test(lower)
  for (const f of found) {
    groups.push({
      ...f,
      role: nearCenter && f.count > 1 ? 'ring' : f.count > 1 ? 'ring' : 'loose',
    })
  }
  return groups
}

export interface StatsIntent {
  /** Absolute HP or rolled range midpoint text for statsBlob. */
  statsBlob: string
  notes?: string
}

/** Parse optional HP / half-HP phrases from the DM message. */
export function parseStatsIntent(message: string): StatsIntent | null {
  const halfOf = /\bhalf\s*(?:hp|hit\s*points?)?\s*(?:of\s*)?(\d+)\b/i.exec(message)
  if (halfOf) {
    const full = Number.parseInt(halfOf[1], 10)
    const half = Math.max(1, Math.floor(full / 2))
    return {
      statsBlob: `HP ${half} (half of ${full})`,
      notes: `Shoulder: half HP of ${full} → ${half}`,
    }
  }
  if (/\bhalf\s*(?:hp|hit\s*points?)\b/i.test(message)) {
    return {
      statsBlob: 'HP: half (DM — set full HP on sheet)',
      notes: 'Shoulder: marked half HP; set a full HP number when known.',
    }
  }
  const range = /\b(?:hp|hit\s*points?)?\s*[:=]?\s*(\d+)\s*[-–to]+\s*(\d+)\s*(?:hp|hit\s*points?)?\b/i.exec(
    message,
  )
  if (range) {
    const lo = Number.parseInt(range[1], 10)
    const hi = Number.parseInt(range[2], 10)
    if (lo > 0 && hi >= lo) {
      // Deterministic mid for reproducibility (DM can edit).
      const mid = Math.round((lo + hi) / 2)
      return {
        statsBlob: `HP ${mid} (DM range ${lo}–${hi})`,
        notes: `Shoulder: rolled mid of ${lo}–${hi} → ${mid}`,
      }
    }
  }
  const single = /\b(?:hp|hit\s*points?)\s*[:=]?\s*(\d+)\b/i.exec(message)
  if (single) {
    const n = Number.parseInt(single[1], 10)
    if (n > 0) {
      return { statsBlob: `HP ${n}`, notes: `Shoulder: HP set to ${n}` }
    }
  }
  return null
}

/** Chebyshev rings around (cq,cr), nearest first, skipping occupied. */
export function ringCells(
  cq: number,
  cr: number,
  count: number,
  mapRadius: number,
  occupied: Set<string>,
): { q: number; r: number }[] {
  const out: { q: number; r: number }[] = []
  for (let dist = 1; dist <= mapRadius + 1 && out.length < count; dist++) {
    const candidates: { q: number; r: number }[] = []
    for (let dq = -dist; dq <= dist; dq++) {
      for (let dr = -dist; dr <= dist; dr++) {
        if (Math.max(Math.abs(dq), Math.abs(dr)) !== dist) continue
        const q = cq + dq
        const r = cr + dr
        if (!inSquareMap(q, r, mapRadius)) continue
        const key = cellKey(q, r)
        if (occupied.has(key)) continue
        candidates.push({ q, r })
      }
    }
    // Stable order: east, then clockwise-ish by angle
    candidates.sort((a, b) => {
      const aa = Math.atan2(a.r - cr, a.q - cq)
      const bb = Math.atan2(b.r - cr, b.q - cq)
      return aa - bb
    })
    for (const c of candidates) {
      if (out.length >= count) break
      out.push(c)
      occupied.add(cellKey(c.q, c.r))
    }
  }
  return out
}

function nextFreeCell(
  cq: number,
  cr: number,
  mapRadius: number,
  occupied: Set<string>,
): { q: number; r: number } | null {
  const key0 = cellKey(cq, cr)
  if (inSquareMap(cq, cr, mapRadius) && !occupied.has(key0)) {
    occupied.add(key0)
    return { q: cq, r: cr }
  }
  const ring = ringCells(cq, cr, 1, mapRadius, occupied)
  return ring[0] ?? null
}

/**
 * Build place actions + chat text from a DM message.
 * Caller must enforce DM/solo; this always plans placements when intent matches.
 */
export function planPlaceFromChat(
  message: string,
  assets: AssetDef[],
  mapRadius: number,
  occupiedObjectKeys: Set<string>,
  occupiedGroundKeys: Set<string>,
): ShoulderPlaceResult {
  if (!isPlaceIntent(message)) {
    return { isPlaceIntent: false, text: '', actions: [], libraryPatches: [] }
  }

  if (assets.length === 0) {
    return {
      isPlaceIntent: true,
      text: 'No assets loaded yet — wait for the demo pack manifest, then try again.',
      actions: [],
      libraryPatches: [],
    }
  }

  const groups = parseGroups(message)
  if (groups.length === 0) {
    return {
      isPlaceIntent: true,
      text:
        'I heard a place/arrange request but could not parse asset names. Try e.g. “put a fae well and 3 imps around it” or “camp with 5 imps around it”.',
      actions: [],
      libraryPatches: [],
    }
  }

  const occupiedObj = new Set(occupiedObjectKeys)
  const occupiedGnd = new Set(occupiedGroundKeys)
  const actions: ShoulderPlaceAction[] = []
  const subs: string[] = []
  const placedSummary: string[] = []
  let centerQ = 0
  let centerR = 0
  let centerSet = false

  const stats = parseStatsIntent(message)
  const libraryPatches: ShoulderLibraryPatch[] = []
  const patchedIds = new Set<string>()

  const markOccupied = (asset: AssetDef, q: number, r: number) => {
    const key = cellKey(q, r)
    if (layerForCategory(asset.category) === 'ground') occupiedGnd.add(key)
    else occupiedObj.add(key)
  }

  const occupyFor = (asset: AssetDef) =>
    layerForCategory(asset.category) === 'ground' ? occupiedGnd : occupiedObj

  for (const g of groups) {
    const prefer: AssetCategory[] | undefined =
      g.role === 'center' || norm(g.query) === 'camp'
        ? ['props', 'tiles']
        : g.role === 'ring'
          ? ['tokens', 'monsters']
          : undefined

    const hit = fuzzyMatchAsset(g.query, assets, prefer)
    if (!hit) {
      placedSummary.push(`could not match “${g.query}”`)
      continue
    }

    const from = g.query.trim()
    const substituted = !hit.exact && !isCloseMatch(from, hit.asset.name)
    if (substituted) {
      subs.push(`“${from}” → **${hit.asset.name}**`)
    }

    if (g.role === 'center') {
      const cell = nextFreeCell(0, 0, mapRadius, occupyFor(hit.asset))
      if (!cell) {
        placedSummary.push(`no space for center ${hit.asset.name}`)
        continue
      }
      centerQ = cell.q
      centerR = cell.r
      centerSet = true
      actions.push({
        assetId: hit.asset.id,
        assetName: hit.asset.name,
        q: cell.q,
        r: cell.r,
        substitutedFrom: substituted ? from : undefined,
      })
      markOccupied(hit.asset, cell.q, cell.r)
      placedSummary.push(`**${hit.asset.name}** at center (${cell.q},${cell.r})`)
    } else if (g.role === 'ring') {
      const cq = centerSet ? centerQ : 0
      const cr = centerSet ? centerR : 0
      const occ = occupyFor(hit.asset)
      // Never stack ring creatures on the camp/center cell
      occ.add(cellKey(cq, cr))
      const cells = ringCells(cq, cr, g.count, mapRadius, occ)
      for (const cell of cells) {
        actions.push({
          assetId: hit.asset.id,
          assetName: hit.asset.name,
          q: cell.q,
          r: cell.r,
          substitutedFrom: substituted ? from : undefined,
        })
        markOccupied(hit.asset, cell.q, cell.r)
      }
      if (cells.length) {
        placedSummary.push(
          `${cells.length}× **${hit.asset.name}** in a ring around (${cq},${cr})`,
        )
      } else {
        placedSummary.push(`no free cells for ${g.count}× ${hit.asset.name}`)
      }
      if (cells.length < g.count) {
        placedSummary.push(`(wanted ${g.count}, placed ${cells.length})`)
      }
    } else {
      // loose: first at/near center, extras in ring
      const cells: { q: number; r: number }[] = []
      const first = nextFreeCell(0, 0, mapRadius, occupyFor(hit.asset))
      if (first) cells.push(first)
      if (g.count > 1) {
        cells.push(
          ...ringCells(0, 0, g.count - cells.length, mapRadius, occupyFor(hit.asset)),
        )
      }
      for (const cell of cells) {
        actions.push({
          assetId: hit.asset.id,
          assetName: hit.asset.name,
          q: cell.q,
          r: cell.r,
          substitutedFrom: substituted ? from : undefined,
        })
        markOccupied(hit.asset, cell.q, cell.r)
      }
      if (cells.length) {
        placedSummary.push(
          cells.length === 1
            ? `**${hit.asset.name}** at (${cells[0].q},${cells[0].r})`
            : `${cells.length}× **${hit.asset.name}** near center`,
        )
      }
    }

    if (stats && !patchedIds.has(hit.asset.id) && (hit.asset.category === 'tokens' || hit.asset.category === 'monsters')) {
      patchedIds.add(hit.asset.id)
      libraryPatches.push({
        assetId: hit.asset.id,
        displayName: hit.asset.name,
        statsBlob: stats.statsBlob,
        notes: stats.notes,
        thumbSrc: hit.asset.src,
      })
    }
  }

  if (actions.length === 0) {
    return {
      isPlaceIntent: true,
      text:
        `Could not place anything from that request.\n` +
        (placedSummary.length ? placedSummary.map((s) => `• ${s}`).join('\n') : '') +
        `\n\nDemo pack tokens: Dryad Warden, Pixie Courier, Seraph Acolyte, Imp Skirmisher, Horned Legionnaire, Dreamwalker.`,
      actions: [],
      libraryPatches: [],
    }
  }

  const lines: string[] = [
    '**Local place helper** — arranging on the board (DM mouse can finish).',
    '',
    ...placedSummary.map((s) => `• ${s}`),
  ]
  if (subs.length) {
    lines.push('', 'Substitutions (demo pack has no exact match):')
    for (const s of [...new Set(subs)]) lines.push(`• ${s}`)
  }
  if (libraryPatches.length) {
    lines.push('', `Updated piece library stats for: ${libraryPatches.map((p) => p.displayName).join(', ')}.`)
  }
  return {
    isPlaceIntent: true,
    text: lines.join('\n'),
    actions,
    libraryPatches,
  }
}

export function playerRefusePlaceMessage(): string {
  return 'Only the **DM** (or solo board) can place/arrange from Shoulder. Ask the host, or open a solo table.'
}
