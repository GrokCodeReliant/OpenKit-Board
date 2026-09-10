import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import type { RulesPack } from '../rulesPack'
import type { AssetDef, PieceUpdatePatch, PlacedPiece } from '../types'
import { layerForCategory } from '../types'
import { cellKey } from '../hex'
import {
  answerFromRulesPack,
  type ShoulderPieceContext,
} from '../shoulderLocalHelper'
import {
  isPlaceIntent,
  planPlaceFromChat,
  playerRefusePlaceMessage,
  type ShoulderLibraryPatch,
  type ShoulderPlaceAction,
} from '../shoulderPlace'
import {
  DEFAULT_OLLAMA_BASE,
  DEFAULT_OLLAMA_MODEL,
  envShoulderUrl,
  loadShoulderOllamaEnabled,
  loadShoulderOllamaModel,
  loadShoulderOllamaUrl,
  saveShoulderOllamaEnabled,
  saveShoulderOllamaModel,
  saveShoulderOllamaUrl,
  normalizeOllamaBaseUrl,
} from '../shoulderSettings'
import { probeOllamaTags, runShoulderOllamaChat } from '../shoulderOllama'
import type { ShoulderToolContext } from '../shoulderTools'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
}

interface ShoulderChatWindowProps {
  pack: RulesPack | null
  pieceContext: ShoulderPieceContext | null
  assets: AssetDef[]
  pieces: PlacedPiece[]
  mapRadius: number
  /** Solo or DM — players get a refuse message on place intents / no board tools. */
  canPlaceFromChat: boolean
  onPlaceActions: (actions: ShoulderPlaceAction[]) => void
  onLibraryPatches: (patches: ShoulderLibraryPatch[]) => void
  onUpdatePiece: (id: string, patch: PieceUpdatePatch) => void
  onMovePiece: (id: string, q: number, r: number) => void
}

function newId(): string {
  return crypto.randomUUID()
}

function occupiedKeys(pieces: PlacedPiece[], layer: 'ground' | 'object'): Set<string> {
  const s = new Set<string>()
  for (const p of pieces) {
    if (p.layer === layer) s.add(cellKey(p.q, p.r))
  }
  return s
}

type ReachState = 'checking' | 'ok' | 'offline'

export function ShoulderChatWindow({
  pack,
  pieceContext,
  assets,
  pieces,
  mapRadius,
  canPlaceFromChat,
  onPlaceActions,
  onLibraryPatches,
  onUpdatePiece,
  onMovePiece,
}: ShoulderChatWindowProps) {
  const listId = useId()
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: newId(),
      role: 'system',
      text:
        'Shoulder — rules Q&A + DM board tools. Prefers local Ollama (via /ollama proxy) with tool calling; falls back to the offline local helper when Ollama is off or unreachable.',
    },
  ])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [ollamaUrl, setOllamaUrl] = useState(() => loadShoulderOllamaUrl())
  const [ollamaModel, setOllamaModel] = useState(() => loadShoulderOllamaModel())
  const [ollamaEnabled, setOllamaEnabled] = useState<boolean>(() => {
    const saved = loadShoulderOllamaEnabled()
    return saved === null ? true : saved
  })
  const [reach, setReach] = useState<ReachState>('checking')
  const [probeError, setProbeError] = useState<string | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Live board refs so tool rounds see placements from earlier tools in the same turn
  const assetsRef = useRef(assets)
  const piecesRef = useRef(pieces)
  const mapRadiusRef = useRef(mapRadius)
  useEffect(() => {
    assetsRef.current = assets
    piecesRef.current = pieces
    mapRadiusRef.current = mapRadius
  }, [assets, pieces, mapRadius])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy])

  const probe = useCallback(async (base: string) => {
    setReach('checking')
    setProbeError(null)
    const result = await probeOllamaTags(base)
    if (result.ok) {
      setReach('ok')
      setProbeError(null)
      setModels(result.models)
      // Auto-enable when never explicitly disabled and tags reachable
      if (loadShoulderOllamaEnabled() === null) {
        setOllamaEnabled(true)
      }
    } else {
      setReach('offline')
      setModels([])
      setProbeError(result.error?.trim() || 'tags probe failed')
    }
    return result
  }, [])

  useEffect(() => {
    const base = ollamaUrl.trim() || DEFAULT_OLLAMA_BASE
    const ac = new AbortController()
    void probe(base)
    return () => ac.abort()
  }, [ollamaUrl, probe])

  const packLabel = pack?.title?.trim() || null
  const envUrl = envShoulderUrl()
  const useOllama = ollamaEnabled && reach === 'ok'

  const bannerLabel = useOllama
    ? `Ollama · ${ollamaModel || DEFAULT_OLLAMA_MODEL}`
    : reach === 'checking' && ollamaEnabled
      ? 'Checking Ollama…'
      : 'Local helper (Ollama offline)'

  /** Offline helper when Ollama is intentionally unused — may place via hard-coded planner. */
  const runLocalFallback = useCallback(
    (q: string): string => {
      if (isPlaceIntent(q)) {
        if (!canPlaceFromChat) {
          return playerRefusePlaceMessage()
        }
        const objOcc = occupiedKeys(pieces, 'object')
        const gndOcc = occupiedKeys(pieces, 'ground')
        for (const p of pieces) {
          if (layerForCategory(p.category ?? 'props') !== 'ground') {
            objOcc.add(cellKey(p.q, p.r))
          }
        }
        const planned = planPlaceFromChat(q, assets, mapRadius, objOcc, gndOcc)
        if (planned.actions.length) onPlaceActions(planned.actions)
        if (planned.libraryPatches.length) onLibraryPatches(planned.libraryPatches)
        return planned.text
      }
      const answer = answerFromRulesPack(
        q,
        pack?.body ?? '',
        pack?.title ?? '',
        pieceContext,
      )
      return answer.text
    },
    [
      canPlaceFromChat,
      pieces,
      assets,
      mapRadius,
      onPlaceActions,
      onLibraryPatches,
      pack,
      pieceContext,
    ],
  )

  /**
   * After an Ollama chat failure: never run the hard-coded place planner
   * (it nonsense-matches words like "pink"). Rules-only Q&A is OK.
   */
  const rulesOnlyAfterOllamaFail = useCallback(
    (q: string): string => {
      if (isPlaceIntent(q)) {
        return (
          'Board place/arrange needs a working Ollama connection — ' +
          'no local place fallback (avoids nonsense asset matches). ' +
          'Start Ollama, confirm the banner shows **Ollama**, then retry.'
        )
      }
      const answer = answerFromRulesPack(
        q,
        pack?.body ?? '',
        pack?.title ?? '',
        pieceContext,
      )
      return answer.text
    },
    [pack, pieceContext],
  )

  const send = useCallback(async () => {
    const q = draft.trim()
    if (!q || busy) return
    setDraft('')
    const userMsg: ChatMessage = { id: newId(), role: 'user', text: q }
    setMessages((prev) => [...prev, userMsg])
    setBusy(true)

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    let assistantText: string

    if (useOllama) {
      try {
        const history = messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({
            role: m.role as 'user' | 'assistant',
            text: m.text,
          }))

        const toolCtx: ShoulderToolContext = {
          get assets() {
            return assetsRef.current
          },
          get pieces() {
            return piecesRef.current
          },
          get mapRadius() {
            return mapRadiusRef.current
          },
          canPlace: canPlaceFromChat,
          onPlaceActions: (actions) => {
            onPlaceActions(actions)
            // Optimistic local mirror so later tool rounds in this turn see them
            piecesRef.current = [
              ...piecesRef.current,
              ...actions.map((a, i) => {
                const asset = assetsRef.current.find((x) => x.id === a.assetId)
                return {
                  id: `tmp-${Date.now()}-${i}`,
                  assetId: a.assetId,
                  q: a.q,
                  r: a.r,
                  layer: layerForCategory(asset?.category ?? 'props'),
                  category: asset?.category,
                } satisfies PlacedPiece
              }),
            ]
          },
          onLibraryPatches,
          onUpdatePiece,
          onMovePiece: (id, qq, rr) => {
            onMovePiece(id, qq, rr)
            piecesRef.current = piecesRef.current.map((p) =>
              p.id === id ? { ...p, q: qq, r: rr } : p,
            )
          },
        }

        const result = await runShoulderOllamaChat({
          baseUrl: ollamaUrl.trim() || DEFAULT_OLLAMA_BASE,
          model: ollamaModel.trim() || DEFAULT_OLLAMA_MODEL,
          userText: q,
          history,
          pack,
          pieceContext,
          assets: assetsRef.current,
          pieces: piecesRef.current,
          mapRadius: mapRadiusRef.current,
          canPlace: canPlaceFromChat,
          toolCtx,
          signal: ac.signal,
        })
        assistantText = result.text
        if (result.usedTools.length) {
          assistantText += `\n\n_Tools: ${result.usedTools.join(' → ')}_`
        }
      } catch (err) {
        if (ac.signal.aborted) {
          setBusy(false)
          return
        }
        const message = err instanceof Error ? err.message : String(err)
        setReach('offline')
        setProbeError(message)
        assistantText =
          `Ollama error (${message}). Is Ollama running? ` +
          `Banner should show **Ollama** when reachable — no hard-coded place fallback.\n\n` +
          rulesOnlyAfterOllamaFail(q)
      }
    } else {
      assistantText = runLocalFallback(q)
    }

    const assistantMsg: ChatMessage = {
      id: newId(),
      role: 'assistant',
      text: assistantText,
    }
    setMessages((prev) => [...prev, assistantMsg])
    setBusy(false)
  }, [
    draft,
    busy,
    useOllama,
    messages,
    canPlaceFromChat,
    onPlaceActions,
    onLibraryPatches,
    onUpdatePiece,
    onMovePiece,
    ollamaUrl,
    ollamaModel,
    pack,
    pieceContext,
    runLocalFallback,
    rulesOnlyAfterOllamaFail,
  ])

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  const onSaveSettings = () => {
    const url = normalizeOllamaBaseUrl(ollamaUrl.trim() || DEFAULT_OLLAMA_BASE)
    const model = ollamaModel.trim() || DEFAULT_OLLAMA_MODEL
    setOllamaUrl(url)
    setOllamaModel(model)
    saveShoulderOllamaUrl(url)
    saveShoulderOllamaModel(model)
    saveShoulderOllamaEnabled(ollamaEnabled)
    setSettingsOpen(false)
    void probe(url)
  }

  return (
    <div className="shoulder-chat">
      <div
        className="shoulder-banner"
        role="status"
        title={
          reach === 'offline' && probeError
            ? `Ollama probe/chat: ${probeError}`
            : undefined
        }
      >
        <strong>{bannerLabel}</strong>
        <span>
          {packLabel
            ? ` · rules: ${packLabel}`
            : ' · no pack loaded — Load Kit Sparks for Q&A'}
          {canPlaceFromChat ? ' · place: on (DM/solo)' : ' · place: DM only'}
          {pieceContext?.displayName
            ? ` · piece: ${pieceContext.displayName}`
            : ''}
          {reach === 'offline' && probeError
            ? ` · probe: ${probeError.slice(0, 80)}`
            : ''}
        </span>
      </div>

      <div
        className="shoulder-messages"
        id={listId}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.map((m) => (
          <div
            key={m.id}
            className={`shoulder-msg shoulder-msg-${m.role}`}
          >
            <span className="shoulder-msg-role">
              {m.role === 'user'
                ? 'You'
                : m.role === 'system'
                  ? 'Note'
                  : useOllama
                    ? 'Shoulder'
                    : 'Helper'}
            </span>
            <div className="shoulder-msg-body">
              <MessageBody text={m.text} />
            </div>
          </div>
        ))}
        {busy ? (
          <div className="shoulder-msg shoulder-msg-system">
            <span className="shoulder-msg-role">Note</span>
            <div className="shoulder-msg-body">
              <p className="shoulder-p">
                {useOllama ? 'Talking to Ollama…' : 'Thinking…'}
              </p>
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <div className="shoulder-compose">
        <textarea
          ref={inputRef}
          className="shoulder-input"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
          placeholder={
            canPlaceFromChat
              ? pack
                ? useOllama
                  ? 'Ask rules, or “make a small camp and put 5 goblins around it”…'
                  : 'Ask rules, or “put a fae well and 3 imps around it”…'
                : 'Place: “camp with 5 goblins” — or load a rules pack for Q&A…'
              : pack
                ? 'Ask about Fighter, Rogue, Guard, HP…'
                : 'Load a rules pack, then ask…'
          }
          aria-label="Shoulder question"
          aria-controls={listId}
        />
        <div className="shoulder-compose-row">
          <button
            type="button"
            className="shoulder-send"
            onClick={() => void send()}
            disabled={!draft.trim() || busy}
          >
            Ask
          </button>
          <button
            type="button"
            className="shoulder-settings-toggle"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((o) => !o)}
          >
            Settings
          </button>
        </div>
      </div>

      {settingsOpen && (
        <div className="shoulder-settings" aria-label="Shoulder settings">
          <p className="shoulder-settings-note">
            In <code>npm run dev</code>, the browser calls <code>/ollama</code>{' '}
            and Vite proxies it directly to <code>http://127.0.0.1:11434</code>{' '}
            (CORS-safe; avoids a Node fetch hop). The room server still exposes{' '}
            <code>/ollama</code> for non-Vite / production. Use{' '}
            <code>/ollama</code> as the base URL — do not point the browser at{' '}
            <code>http://127.0.0.1:11434</code> directly. Prefer opening{' '}
            <code>http://localhost:5173</code>. Saved loopback URLs rewrite to{' '}
            <code>/ollama</code>. If chat fails, Shoulder shows an error and
            rules-only Q&A — it does <em>not</em> hard-code place assets.
            {probeError ? (
              <>
                {' '}
                Last probe/chat error: <code>{probeError}</code>.
              </>
            ) : null}
            {envUrl ? (
              <>
                {' '}
                <code>VITE_SHOULDER_URL</code> can override the default base.
              </>
            ) : null}
          </p>
          <label className="shoulder-settings-check">
            <input
              type="checkbox"
              checked={ollamaEnabled}
              onChange={(e) => setOllamaEnabled(e.target.checked)}
            />{' '}
            Enable Ollama
            {reach === 'ok'
              ? ' (reachable)'
              : reach === 'checking'
                ? ' (checking…)'
                : ' (offline)'}
          </label>
          <label className="shoulder-settings-label" htmlFor="shoulder-ollama">
            Base URL (proxy)
          </label>
          <input
            id="shoulder-ollama"
            type="text"
            className="shoulder-settings-input"
            placeholder={DEFAULT_OLLAMA_BASE}
            value={ollamaUrl}
            onChange={(e) => setOllamaUrl(e.target.value)}
            autoComplete="off"
          />
          <label className="shoulder-settings-label" htmlFor="shoulder-model">
            Model
          </label>
          <input
            id="shoulder-model"
            type="text"
            className="shoulder-settings-input"
            placeholder={DEFAULT_OLLAMA_MODEL}
            value={ollamaModel}
            onChange={(e) => setOllamaModel(e.target.value)}
            list="shoulder-model-list"
            autoComplete="off"
          />
          {models.length > 0 ? (
            <datalist id="shoulder-model-list">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          ) : null}
          <div className="shoulder-settings-actions">
            <button type="button" className="shoulder-send" onClick={onSaveSettings}>
              Save locally
            </button>
            <button
              type="button"
              className="shoulder-settings-toggle"
              onClick={() => void probe(ollamaUrl.trim() || DEFAULT_OLLAMA_BASE)}
            >
              Re-check
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Lightweight markdown-ish render: **bold**, > quotes, bullets, ---, _italic_. */
function MessageBody({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/)
  return (
    <>
      {blocks.map((block, i) => {
        const trimmed = block.trim()
        if (trimmed === '---') {
          return <hr key={i} className="shoulder-hr" />
        }
        if (trimmed.startsWith('> ')) {
          return (
            <blockquote key={i} className="shoulder-quote">
              {formatInline(trimmed.replace(/^>\s?/, ''))}
            </blockquote>
          )
        }
        const lines = trimmed.split('\n')
        const allBullets = lines.every(
          (l) => /^[•*-]\s/.test(l.trim()) || !l.trim(),
        )
        if (allBullets && lines.some((l) => l.trim())) {
          return (
            <ul key={i} className="shoulder-ul">
              {lines
                .filter((l) => l.trim())
                .map((l, j) => (
                  <li key={j}>{formatInline(l.replace(/^[•*-]\s+/, ''))}</li>
                ))}
            </ul>
          )
        }
        return (
          <p key={i} className="shoulder-p">
            {lines.map((line, j) => (
              <span key={j}>
                {j > 0 ? <br /> : null}
                {formatInline(line)}
              </span>
            ))}
          </p>
        )
      })}
    </>
  )
}

function formatInline(s: string): ReactNode[] {
  const parts: React.ReactNode[] = []
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|_([^_]+)_/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push(s.slice(last, m.index))
    if (m[1] != null) {
      parts.push(<strong key={k++}>{m[1]}</strong>)
    } else if (m[2] != null) {
      parts.push(<code key={k++}>{m[2]}</code>)
    } else if (m[3] != null) {
      parts.push(<em key={k++}>{m[3]}</em>)
    }
    last = m.index + m[0].length
  }
  if (last < s.length) parts.push(s.slice(last))
  return parts
}
