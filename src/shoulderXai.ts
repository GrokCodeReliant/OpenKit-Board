/**
 * Shoulder ↔ xAI Grok chat + OpenAI-compatible tool loop
 * (browser → /xai/v1 → room server → https://api.x.ai/v1).
 */

import type { RulesPack } from './rulesPack'
import type { AssetDef, PlacedPiece } from './types'
import type { ShoulderPieceContext } from './shoulderLocalHelper'
import {
  executeShoulderTool,
  shoulderToolDefs,
  type ShoulderToolContext,
} from './shoulderTools'
import { buildSystemPrompt } from './shoulderOllama'
import {
  DEFAULT_XAI_BASE,
  DEFAULT_XAI_MODEL,
} from './shoulderSettings'

const MAX_ROUNDS = 6

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
  name?: string
}

export interface OpenAIToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

interface ChatCompletionsResponse {
  choices?: {
    message?: OpenAIMessage
    finish_reason?: string
  }[]
  error?: { message?: string; type?: string } | string
}

function normalizeBase(base?: string): string {
  const t = (base || DEFAULT_XAI_BASE).trim().replace(/\/$/, '')
  return t || DEFAULT_XAI_BASE
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw || typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return {}
  }
  return {}
}

function authHeaders(apiKey: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  const key = (apiKey || '').trim()
  if (key) {
    headers.Authorization = `Bearer ${key}`
    headers['x-xai-api-key'] = key
  }
  return headers
}

function formatXaiError(status: number, errText: string): string {
  try {
    const j = JSON.parse(errText) as {
      error?: string | { message?: string }
      detail?: string
      message?: string
    }
    if (typeof j.error === 'string' && j.error.trim()) return j.error.trim()
    if (j.error && typeof j.error === 'object' && j.error.message) {
      return j.error.message.trim()
    }
    if (typeof j.message === 'string' && j.message.trim()) return j.message.trim()
    if (typeof j.detail === 'string' && j.detail.trim()) return j.detail.trim()
  } catch {
    /* keep raw */
  }
  const raw = errText.trim()
  return raw || `xAI HTTP ${status}`
}

/** Probe models list through the room-server proxy (env key or inbound header). */
export async function probeXaiModels(
  apiKey?: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; models: string[]; error?: string }> {
  const base = normalizeBase()
  try {
    const res = await fetch(`${base}/models`, {
      method: 'GET',
      headers: authHeaders(apiKey),
      signal: signal ?? AbortSignal.timeout(12_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, models: [], error: formatXaiError(res.status, text) }
    }
    const data = (await res.json()) as {
      data?: { id?: string }[]
    }
    const models = (data.data ?? [])
      .map((m) => (m.id || '').trim())
      .filter(Boolean)
    return { ok: true, models }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, models: [], error: message }
  }
}

export interface ShoulderXaiRunOpts {
  model: string
  apiKey?: string
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

export async function runShoulderXaiChat(
  opts: ShoulderXaiRunOpts,
): Promise<{ text: string; usedTools: string[] }> {
  const base = normalizeBase()
  const model = opts.model.trim() || DEFAULT_XAI_MODEL
  const tools = shoulderToolDefs(opts.canPlace)
  const usedTools: string[] = []

  const system = buildSystemPrompt({
    canPlace: opts.canPlace,
    pack: opts.pack,
    pieceContext: opts.pieceContext,
    mapRadius: opts.mapRadius,
    pieceCount: opts.pieces.length,
  })

  const messages: OpenAIMessage[] = [{ role: 'system', content: system }]
  const recent = opts.history.slice(-8)
  for (const h of recent) {
    messages.push({ role: h.role, content: h.text })
  }
  messages.push({ role: 'user', content: opts.userText })

  const extra = {
    rulesBody: opts.pack?.body ?? '',
    rulesTitle: opts.pack?.title ?? '',
  }

  async function postChat(): Promise<ChatCompletionsResponse> {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: authHeaders(opts.apiKey),
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: 'auto',
        stream: false,
      }),
      signal: opts.signal ?? AbortSignal.timeout(120_000),
    })
    const errText = res.ok ? '' : await res.text().catch(() => '')
    if (!res.ok) {
      throw new Error(formatXaiError(res.status, errText))
    }
    return (await res.json()) as ChatCompletionsResponse
  }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const data = await postChat()
    if (data.error) {
      const msg =
        typeof data.error === 'string'
          ? data.error
          : data.error.message || 'xAI error'
      throw new Error(msg)
    }
    const msg = data.choices?.[0]?.message
    if (!msg) throw new Error('Empty xAI response')

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

    messages.push({
      role: 'assistant',
      content: msg.content ?? null,
      tool_calls: toolCalls,
    })

    for (const call of toolCalls) {
      const name = call.function?.name || ''
      const args = parseArgs(call.function?.arguments)
      usedTools.push(name)
      const result = executeShoulderTool(name, args, opts.toolCtx, extra)
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: result,
      })
    }
  }

  return {
    text: `Stopped after ${MAX_ROUNDS} tool rounds. Tools used: ${usedTools.join(', ') || 'none'}.`,
    usedTools,
  }
}
