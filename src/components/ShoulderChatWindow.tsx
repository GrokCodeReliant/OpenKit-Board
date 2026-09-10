import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { RulesPack } from '../rulesPack'
import type { AssetDef, PlacedPiece } from '../types'
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
  loadShoulderOllamaUrl,
  saveShoulderOllamaUrl,
  envShoulderUrl,
} from '../shoulderSettings'

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
  /** Solo or DM — players get a refuse message on place intents. */
  canPlaceFromChat: boolean
  onPlaceActions: (actions: ShoulderPlaceAction[]) => void
  onLibraryPatches: (patches: ShoulderLibraryPatch[]) => void
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

export function ShoulderChatWindow({
  pack,
  pieceContext,
  assets,
  pieces,
  mapRadius,
  canPlaceFromChat,
  onPlaceActions,
  onLibraryPatches,
}: ShoulderChatWindowProps) {
  const listId = useId()
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: newId(),
      role: 'system',
      text:
        'Local Shoulder — rules Q&A from the active pack, plus DM/solo place & arrange from chat (demo-pack fuzzy match). No paid API. Future: optional Ollama URL (not called yet).',
    },
  ])
  const [draft, setDraft] = useState('')
  const [ollamaUrl, setOllamaUrl] = useState(() => loadShoulderOllamaUrl())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  const packLabel = pack?.title?.trim() || null
  const envUrl = envShoulderUrl()

  const send = useCallback(() => {
    const q = draft.trim()
    if (!q) return
    setDraft('')
    const userMsg: ChatMessage = { id: newId(), role: 'user', text: q }

    let assistantText: string

    if (isPlaceIntent(q)) {
      if (!canPlaceFromChat) {
        assistantText = playerRefusePlaceMessage()
      } else {
        const objOcc = occupiedKeys(pieces, 'object')
        const gndOcc = occupiedKeys(pieces, 'ground')
        // Also treat any piece cell as soft-occupied for object stacking avoidance
        for (const p of pieces) {
          if (layerForCategory(p.category ?? 'props') !== 'ground') {
            objOcc.add(cellKey(p.q, p.r))
          }
        }
        const planned = planPlaceFromChat(q, assets, mapRadius, objOcc, gndOcc)
        assistantText = planned.text
        if (planned.actions.length) {
          onPlaceActions(planned.actions)
        }
        if (planned.libraryPatches.length) {
          onLibraryPatches(planned.libraryPatches)
        }
      }
    } else {
      const answer = answerFromRulesPack(
        q,
        pack?.body ?? '',
        pack?.title ?? '',
        pieceContext,
      )
      assistantText = answer.text
    }

    const assistantMsg: ChatMessage = {
      id: newId(),
      role: 'assistant',
      text: assistantText,
    }
    setMessages((prev) => [...prev, userMsg, assistantMsg])
  }, [
    draft,
    pack,
    pieceContext,
    canPlaceFromChat,
    pieces,
    assets,
    mapRadius,
    onPlaceActions,
    onLibraryPatches,
  ])

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const onSaveSettings = () => {
    saveShoulderOllamaUrl(ollamaUrl)
    setSettingsOpen(false)
  }

  return (
    <div className="shoulder-chat">
      <div className="shoulder-banner" role="status">
        <strong>Local Shoulder</strong>
        <span>
          {packLabel
            ? ` · rules: ${packLabel}`
            : ' · no pack loaded — Load Kit Sparks for Q&A'}
          {canPlaceFromChat ? ' · place: on (DM/solo)' : ' · place: DM only'}
          {pieceContext?.displayName
            ? ` · piece: ${pieceContext.displayName}`
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
                  : 'Helper'}
            </span>
            <div className="shoulder-msg-body">
              <MessageBody text={m.text} />
            </div>
          </div>
        ))}
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
          placeholder={
            canPlaceFromChat
              ? pack
                ? 'Ask rules, or “put a fae well and 3 imps around it”…'
                : 'Place: “camp with 5 imps” — or load a rules pack for Q&A…'
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
            onClick={send}
            disabled={!draft.trim()}
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
            Bite 2 uses the <strong>local helper</strong> only (rules Q&A + DM
            place/arrange). No network. Optional Ollama / OpenAI-compatible URL
            is stored for a later bite — it is <em>not called</em> yet.
            {envUrl ? (
              <>
                {' '}
                <code>VITE_SHOULDER_URL</code> is set in the build env but unused
                for now.
              </>
            ) : null}
          </p>
          <label className="shoulder-settings-label" htmlFor="shoulder-ollama">
            Future Ollama URL (optional stub)
          </label>
          <input
            id="shoulder-ollama"
            type="url"
            className="shoulder-settings-input"
            placeholder="http://127.0.0.1:11434"
            value={ollamaUrl}
            onChange={(e) => setOllamaUrl(e.target.value)}
            autoComplete="off"
          />
          <div className="shoulder-settings-actions">
            <button type="button" className="shoulder-send" onClick={onSaveSettings}>
              Save locally
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Lightweight markdown-ish render: **bold**, > quotes, bullets, ---. */
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
        const allBullets = lines.every((l) => /^[•*-]\s/.test(l.trim()) || !l.trim())
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
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push(s.slice(last, m.index))
    if (m[1] != null) {
      parts.push(<strong key={k++}>{m[1]}</strong>)
    } else if (m[2] != null) {
      parts.push(<code key={k++}>{m[2]}</code>)
    }
    last = m.index + m[0].length
  }
  if (last < s.length) parts.push(s.slice(last))
  return parts
}
