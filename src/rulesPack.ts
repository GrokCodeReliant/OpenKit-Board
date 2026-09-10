/** Rules pack — user-owned plain text (+ light metadata). Not a rules engine. */

export type RulesPackFormat = 'text' | 'markdown'

export interface RulesPack {
  id: string
  title: string
  body: string
  format: RulesPackFormat
  /** Optional; kept for older packs. Import UX no longer requires a license. */
  license: string
  sourceUrl?: string
  attribution?: string
  rightsAffirmedAt: string
  importedAt: string
  importedBy: string
  byteLength: number
  contentHash: string
}

export const ACTIVE_RULES_PACK_KEY = 'okb.activeRulesPack.v1'

/** Soft warn / hard block for body size (character count proxy). */
export const BODY_SOFT_LIMIT = 100_000
export const BODY_HARD_LIMIT = 500_000

const DEFAULT_LICENSE = 'private session'

export function loadActiveRulesPack(): RulesPack | null {
  try {
    const raw = localStorage.getItem(ACTIVE_RULES_PACK_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<RulesPack>
    if (
      !parsed ||
      typeof parsed.id !== 'string' ||
      typeof parsed.title !== 'string' ||
      typeof parsed.body !== 'string'
    ) {
      return null
    }
    return {
      ...(parsed as RulesPack),
      license:
        typeof parsed.license === 'string' ? parsed.license : DEFAULT_LICENSE,
    }
  } catch {
    return null
  }
}

export function saveActiveRulesPack(pack: RulesPack | null): void {
  if (pack === null) {
    localStorage.removeItem(ACTIVE_RULES_PACK_KEY)
    return
  }
  localStorage.setItem(ACTIVE_RULES_PACK_KEY, JSON.stringify(pack))
}

export function inferFormat(
  filename: string | undefined,
  body: string,
): RulesPackFormat {
  if (filename?.toLowerCase().endsWith('.md')) return 'markdown'
  if (filename?.toLowerCase().endsWith('.txt')) return 'text'
  if (/^\s*#\s+\S/m.test(body)) return 'markdown'
  return 'text'
}

export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
  return base || 'Untitled rules pack'
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function createRulesPack(input: {
  title: string
  body: string
  /** Optional; defaults to "private session". */
  license?: string
  format: RulesPackFormat
  sourceUrl?: string
  attribution?: string
  importedBy: string
}): Promise<RulesPack> {
  const now = new Date().toISOString()
  const body = input.body
  if (body.length > BODY_HARD_LIMIT) {
    throw new Error(
      `Rules pack too large for table sync (max ${BODY_HARD_LIMIT.toLocaleString()} characters). Shorten the text and try again.`,
    )
  }
  const byteLength = new TextEncoder().encode(body).byteLength
  if (byteLength > BODY_HARD_LIMIT) {
    throw new Error(
      `Rules pack too large for table sync (max ~${BODY_HARD_LIMIT.toLocaleString()} bytes). Shorten the text and try again.`,
    )
  }
  const licenseRaw = input.license?.trim() ?? ''
  return {
    id: crypto.randomUUID(),
    title: input.title.trim() || 'Untitled rules pack',
    body,
    format: input.format,
    license: licenseRaw || DEFAULT_LICENSE,
    sourceUrl: input.sourceUrl?.trim() || undefined,
    attribution: input.attribution?.trim() || undefined,
    rightsAffirmedAt: now,
    importedAt: now,
    importedBy: input.importedBy,
    byteLength,
    contentHash: await sha256Hex(body),
  }
}

export function truncateBody(body: string, maxChars = 280): string {
  const t = body.replace(/\s+/g, ' ').trim()
  if (t.length <= maxChars) return t
  return `${t.slice(0, maxChars).trimEnd()}…`
}
