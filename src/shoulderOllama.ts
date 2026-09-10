/**
 * Shoulder ↔ Ollama chat + tool loop (via /ollama proxy — Vite→Ollama in dev).
 */

import type { RulesPack } from './rulesPack'
import type { AssetDef, PlacedPiece } from './types'
import type { ShoulderPieceContext } from './shoulderLocalHelper'
import {
  executeShoulderTool,
  shoulderToolDefs,
  type ShoulderToolContext,
} from './shoulderTools'
import {
  DEFAULT_OLLAMA_BASE,
  DEFAULT_OLLAMA_MODEL,
  normalizeOllamaBaseUrl,
} from './shoulderSettings'

const MAX_ROUNDS = 6
const RULES_PROMPT_CHARS = 16_000

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string
  tool_calls?: OllamaToolCall[]
  tool_name?: string
}

export interface OllamaToolCall {
  function: {
    name: string
    arguments: Record<string, unknown> | string
  }
}

export interface OllamaChatResponse {
  message?: OllamaMessage
  error?: string
}

function normalizeBase(base: string): string {
  return normalizeOllamaBaseUrl(base || DEFAULT_OLLAMA_BASE)
}

const PROBE_TIMEOUT_MS = 9_000

function formatOllamaHttpError(status: number, errText: string): string {
  let error = ''
  let detail = ''
  try {
    const j = JSON.parse(errText) as { error?: string; detail?: string }
    error = (j.error || '').trim()
    detail = (j.detail || '').trim()
  } catch {
    /* keep raw */
  }
  if (error && detail && detail !== error) return `${error}: ${detail}`
  if (error) return error
  if (detail) return detail
  const raw = errText.trim()
  return raw || `Ollama HTTP ${status}`
}

function isTransientOllamaFailure(status: number, message: string): boolean {
  if (status === 502 || status === 503 || status === 504) return true
  const m = message.toLowerCase()
  return (
    m.includes('upstream unreachable') ||
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('load failed')
  )
}

export async function probeOllamaTags(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; models: string[]; error?: string }> {
  const base = normalizeBase(baseUrl)
  try {
    const res = await fetch(`${base}/api/tags`, {
      method: 'GET',
      signal: signal ?? AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, models: [], error: text || `HTTP ${res.status}` }
    }
    const data = (await res.json()) as {
      models?: { name?: string; model?: string }[]
    }
    const models = (data.models ?? [])
      .map((m) => m.name || m.model || '')
      .filter(Boolean)
    return { ok: true, models }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, models: [], error: message }
  }
}

function parseArgs(
  raw: Record<string, unknown> | string | undefined,
): Record<string, unknown> {
  if (raw == null) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return {}
    }
  }
  return {}
}

function truncateRules(body: string, max = RULES_PROMPT_CHARS): string {
  if (body.length <= max) return body
  return `${body.slice(0, max)}\n\n…[truncated — use get_rules for more]`
}

export function buildSystemPrompt(opts: {
  canPlace: boolean
  pack: RulesPack | null
  pieceContext: ShoulderPieceContext | null
  mapRadius: number
  pieceCount: number
  selectedSummary?: string
}): string {
  const role = opts.canPlace
    ? 'You are the DM Shoulder assistant for Open Kit Board (solo or DM). You may search assets, place/update pieces, and set library stats.'
    : 'You are the player Shoulder assistant for Open Kit Board. You may answer rules questions and list/search assets. You must NOT place, update, or rearrange board pieces — those tools are not available.'

  const rulesTitle = opts.pack?.title?.trim() || '(no pack loaded)'
  const rulesBody = opts.pack?.body
    ? truncateRules(opts.pack.body)
    : '(empty — ask the user to Load Kit Sparks sample)'

  const selected = opts.pieceContext?.displayName
    ? `Selected piece: ${opts.pieceContext.displayName}` +
      (opts.pieceContext.notes
        ? `\nNotes: ${opts.pieceContext.notes.slice(0, 400)}`
        : '') +
      (opts.pieceContext.statsBlob
        ? `\nStats: ${opts.pieceContext.statsBlob.slice(0, 400)}`
        : '')
    : 'No piece selected.'

  const toolGuide = opts.canPlace
    ? `Tool guidance:
- Prefer search_assets(query) then place_pieces({ placements: [{assetId,q,r}, ...] }). Fuzzy names like "goblin" are OK; prefer ids from search when known.
- Rough layouts are fine; the DM will mouse-finish.
- For "camp + N goblins/imps around it": search for camp/toadstool/lantern AND goblin/imp, place camp near origin, then place_pieces with ring helper or explicit coords.
- Board is a square grid: q = column, r = row; valid cells satisfy |q|<=radius and |r|<=radius.
- Cap ~30 places per place_pieces call.
- Do not paste or request the full asset catalog — always search.`
    : `Tool guidance:
- Answer from the rules pack. You may search_assets or list_board for context, but cannot place.
- Do not invent asset ids.`

  return [
    role,
    '',
    `Board: square map radius ${opts.mapRadius} → ${(opts.mapRadius * 2 + 1) ** 2} cells; ${opts.pieceCount} pieces placed.`,
    selected,
    '',
    toolGuide,
    '',
    `Active rules pack: ${rulesTitle}`,
    '--- rules ---',
    rulesBody,
    '--- end rules ---',
  ].join('\n')
}

export interface ShoulderOllamaRunOpts {
  baseUrl: string
  model: string
  userText: string
  history: { role: 'user' | 'assistant'; text: string }[]
  pack: RulesPack | null
  pieceContext: ShoulderPieceContext | null
  assets: AssetDef[]
  pieces: PlacedPiece[]
  mapRadius: number
  canPlace: boolean
  toolCtx: ShoulderToolContext
  signal?: AbortSignal
}

export async function runShoulderOllamaChat(
  opts: ShoulderOllamaRunOpts,
): Promise<{ text: string; usedTools: string[] }> {
  const base = normalizeBase(opts.baseUrl)
  const model = opts.model.trim() || DEFAULT_OLLAMA_MODEL
  const tools = shoulderToolDefs(opts.canPlace)
  const usedTools: string[] = []

  const system = buildSystemPrompt({
    canPlace: opts.canPlace,
    pack: opts.pack,
    pieceContext: opts.pieceContext,
    mapRadius: opts.mapRadius,
    pieceCount: opts.pieces.length,
  })

  const messages: OllamaMessage[] = [
    { role: 'system', content: system },
  ]

  // Keep a short recent history (exclude the message we're about to add)
  const recent = opts.history.slice(-8)
  for (const h of recent) {
    messages.push({ role: h.role, content: h.text })
  }
  messages.push({ role: 'user', content: opts.userText })

  const extra = {
    rulesBody: opts.pack?.body ?? '',
    rulesTitle: opts.pack?.title ?? '',
  }

  /** One chat POST with a single retry on 502 / unreachable / network fail. */
  async function postChat(): Promise<Response> {
    const doFetch = () =>
      fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          tools,
          stream: false,
          // Keep thinking models quieter when supported
          think: false,
        }),
        signal: opts.signal ?? AbortSignal.timeout(120_000),
      })

    for (let attempt = 0; attempt < 2; attempt++) {
      let res: Response
      try {
        res = await doFetch()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (
          attempt === 0 &&
          !opts.signal?.aborted &&
          isTransientOllamaFailure(0, message)
        ) {
          await new Promise((r) => setTimeout(r, 400))
          continue
        }
        throw err
      }

      if (res.ok) return res

      const errText = await res.text().catch(() => '')
      const detail = formatOllamaHttpError(res.status, errText)
      if (
        attempt === 0 &&
        !opts.signal?.aborted &&
        isTransientOllamaFailure(res.status, detail)
      ) {
        await new Promise((r) => setTimeout(r, 400))
        continue
      }
      throw new Error(detail)
    }
    throw new Error('Ollama chat failed after retry')
  }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await postChat()

    const data = (await res.json()) as OllamaChatResponse
    if (data.error) throw new Error(data.error)
    const msg = data.message
    if (!msg) throw new Error('Empty Ollama response')

    const toolCalls = msg.tool_calls ?? []
    if (toolCalls.length === 0) {
      const text = (msg.content || '').trim()
      return {
        text:
          text ||
          (usedTools.length
            ? `Done (${usedTools.join(', ')}).`
            : '(No response from model)'),
        usedTools,
      }
    }

    // Append assistant tool-call message, then tool results
    messages.push({
      role: 'assistant',
      content: msg.content || '',
      tool_calls: toolCalls,
    })

    for (const call of toolCalls) {
      const name = call.function?.name || ''
      const args = parseArgs(call.function?.arguments)
      usedTools.push(name)
      // Refresh live pieces/assets on ctx each call (closures may be stale mid-loop
      // for list_board after place — callers pass getters via toolCtx mutation).
      const result = executeShoulderTool(name, args, opts.toolCtx, extra)
      messages.push({
        role: 'tool',
        tool_name: name,
        content: result,
      })
    }
  }

  return {
    text: `Stopped after ${MAX_ROUNDS} tool rounds. Tools used: ${usedTools.join(', ') || 'none'}.`,
    usedTools,
  }
}
