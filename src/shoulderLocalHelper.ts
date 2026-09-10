/**
 * Local rules helper — extractive Q&A over an active rules pack body.
 * No network; keyword retrieval + quote / light paraphrase.
 */

export interface ShoulderPieceContext {
  displayName: string
  notes: string
  statsBlob?: string
}

export interface ShoulderAnswer {
  /** Short answer for the chat bubble. */
  text: string
  /** Sections / chunks that scored highest (for debugging / UI). */
  citations: { heading: string; excerpt: string; score: number }[]
  /** True when pack was empty or no useful overlap. */
  weak: boolean
}

interface Chunk {
  heading: string
  body: string
}

const STOP = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'is',
  'are',
  'was',
  'were',
  'be',
  'do',
  'does',
  'did',
  'what',
  'how',
  'when',
  'where',
  'who',
  'why',
  'which',
  'with',
  'from',
  'that',
  'this',
  'these',
  'those',
  'can',
  'could',
  'would',
  'should',
  'about',
  'into',
  'than',
  'then',
  'them',
  'they',
  'you',
  'your',
  'me',
  'my',
  'we',
  'our',
  'it',
  'its',
  'as',
  'at',
  'by',
  'if',
  'not',
  'no',
  'yes',
  'please',
  'tell',
  'explain',
  'describe',
  'give',
  'show',
  'mean',
  'means',
  'rule',
  'rules',
  'kit',
  'sparks',
])

const MAX_CONTEXT_CHARS = 80_000

export function truncatePackBody(body: string, max = MAX_CONTEXT_CHARS): string {
  if (body.length <= max) return body
  return `${body.slice(0, max)}\n\n…[truncated for local helper]`
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'+-]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP.has(w))
}

/** Split markdown / plain text into heading-scoped chunks. */
export function splitRulesChunks(body: string): Chunk[] {
  const text = truncatePackBody(body)
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const chunks: Chunk[] = []
  let heading = 'Preamble'
  let buf: string[] = []

  const flush = () => {
    const bodyText = buf.join('\n').trim()
    if (bodyText || heading !== 'Preamble') {
      chunks.push({ heading, body: bodyText })
    }
    buf = []
  }

  for (const line of lines) {
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    if (m) {
      flush()
      heading = m[2].trim()
      continue
    }
    buf.push(line)
  }
  flush()

  // If almost no headings, also split on blank-line paragraphs for retrieval.
  if (chunks.length <= 2) {
    const paras = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 40)
    if (paras.length > chunks.length) {
      return paras.map((p, i) => {
        const first = p.split('\n')[0].replace(/^#+\s*/, '').slice(0, 72)
        return { heading: first || `Section ${i + 1}`, body: p }
      })
    }
  }
  return chunks.filter((c) => c.body.length > 0 || c.heading !== 'Preamble')
}

function scoreChunk(terms: string[], chunk: Chunk): number {
  if (terms.length === 0) return 0
  const hay = `${chunk.heading}\n${chunk.body}`.toLowerCase()
  const headingLower = chunk.heading.toLowerCase()
  let score = 0
  for (const t of terms) {
    if (!hay.includes(t)) continue
    // Count rough occurrences (cap per term).
    let n = 0
    let idx = 0
    while (n < 6) {
      const found = hay.indexOf(t, idx)
      if (found < 0) break
      n++
      idx = found + t.length
    }
    score += n
    if (headingLower.includes(t)) score += 4
  }
  // Prefer compact, on-topic chunks slightly (only if terms hit).
  if (score > 0 && chunk.body.length > 0 && chunk.body.length < 900) score += 0.5
  return score
}

function excerptAround(body: string, terms: string[], maxLen = 420): string {
  const lower = body.toLowerCase()
  let best = 0
  for (const t of terms) {
    const i = lower.indexOf(t)
    if (i >= 0) {
      best = i
      break
    }
  }
  const start = Math.max(0, best - 80)
  let slice = body.slice(start, start + maxLen).trim()
  if (start > 0) slice = `…${slice}`
  if (start + maxLen < body.length) slice = `${slice}…`
  return slice.replace(/\s+\n/g, '\n').trim()
}

function paraphrase(heading: string, body: string, terms: string[]): string {
  const lines = body
    .split('\n')
    .map((l) => l.replace(/^[-*•]\s+/, '').replace(/^\|\s*/, '').trim())
    .filter((l) => l && !/^[-|]+$/.test(l) && !/^#/.test(l))

  const ranked = lines
    .map((line) => {
      const low = line.toLowerCase()
      const hits = terms.reduce((n, t) => (low.includes(t) ? n + 1 : n), 0)
      return { line, hits }
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)

  const picks = (ranked.length ? ranked : lines.map((line) => ({ line, hits: 0 })))
    .slice(0, 4)
    .map((x) => x.line)
    .filter((l) => l.length > 8)

  if (picks.length === 0) {
    return `From **${heading}**: the folio has a section on this, but little extractable detail.`
  }

  const bullet = picks.map((p) => `• ${p}`).join('\n')
  return `From **${heading}** (local paraphrase of the folio):\n${bullet}`
}

/**
 * Answer a question using only the rules pack text (+ optional piece notes).
 */
export function answerFromRulesPack(
  question: string,
  packBody: string,
  packTitle: string,
  piece?: ShoulderPieceContext | null,
): ShoulderAnswer {
  const q = question.trim()
  if (!q) {
    return {
      text: 'Ask a question about the active rules pack.',
      citations: [],
      weak: true,
    }
  }

  if (!packBody.trim()) {
    return {
      text:
        'No rules pack is loaded. Use **Load Kit Sparks sample** (or import your own) in the tray, then ask again.',
      citations: [],
      weak: true,
    }
  }

  const terms = tokenize(q)
  const chunks = splitRulesChunks(packBody)

  if (piece && (piece.notes.trim() || piece.statsBlob?.trim())) {
    const notesBody = [
      piece.notes.trim(),
      piece.statsBlob?.trim() ? `Stats:\n${piece.statsBlob.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')
    chunks.unshift({
      heading: `Selected piece: ${piece.displayName || 'notes'}`,
      body: notesBody,
    })
  }

  const scored = chunks
    .map((c) => ({
      ...c,
      score: scoreChunk(terms, c),
    }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)

  const top = scored.slice(0, 3)
  const citations = top.map((c) => ({
    heading: c.heading,
    excerpt: excerptAround(c.body || c.heading, terms),
    score: c.score,
  }))

  if (top.length === 0) {
    const preview = packBody.replace(/\s+/g, ' ').trim().slice(0, 180)
    return {
      text: `I couldn’t find a clear match in **${packTitle || 'the rules pack'}** for “${q}”. Try naming a role, action, or heading from the folio (e.g. Fighter, Rogue, Guard, HP).\n\nPack starts: “${preview}${packBody.length > 180 ? '…' : ''}”`,
      citations: [],
      weak: true,
    }
  }

  const parts = top.map((c) => {
    const para = paraphrase(c.heading, c.body, terms)
    const quote = excerptAround(c.body || c.heading, terms, 280)
    return `${para}\n\n> ${quote.replace(/\n+/g, ' ')}`
  })

  const title = packTitle.trim() || 'active pack'
  const pieceBit = piece?.displayName
    ? ` (plus notes for ${piece.displayName})`
    : ''
  const header = `**Local rules helper** · from **${title}**${pieceBit} — not a full LLM.\n\n`

  return {
    text: header + parts.join('\n\n---\n\n'),
    citations,
    weak: top[0].score < 2,
  }
}
