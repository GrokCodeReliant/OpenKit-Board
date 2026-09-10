import { useCallback, useState, type ReactNode } from 'react'
import type { RulesPack } from '../rulesPack'
import type { AssetDef, PieceUpdatePatch, PlacedPiece } from '../types'
import type { ShoulderPieceContext } from '../shoulderLocalHelper'
import type {
  ShoulderLibraryPatch,
  ShoulderPlaceAction,
} from '../shoulderPlace'
import { ShoulderChatWindow } from './ShoulderChatWindow'

type AiTab = 'shoulder' | 'setup' | 'prompts'

export interface AiPanelProps {
  pack: RulesPack | null
  pieceContext: ShoulderPieceContext | null
  assets: AssetDef[]
  pieces: PlacedPiece[]
  mapRadius: number
  canPlaceFromChat: boolean
  /** Active Host/Join room code when in a room; used to prefill prompts. */
  roomCode: string | null
  onPlaceActions: (actions: ShoulderPlaceAction[]) => void
  onLibraryPatches: (patches: ShoulderLibraryPatch[]) => void
  onUpdatePiece: (id: string, patch: PieceUpdatePatch) => void
  onMovePiece: (id: string, q: number, r: number) => void
}

function CopyRow({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false)
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1600)
      } finally {
        document.body.removeChild(ta)
      }
    }
  }, [text])

  return (
    <div className="ai-prompt-row">
      <p className="ai-prompt-label">{label}</p>
      <pre className="ai-prompt-text">{text}</pre>
      <button type="button" className="ai-copy-btn" onClick={() => void onCopy()}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function SetupSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ai-setup-section">
      <h3 className="ai-setup-title">{title}</h3>
      {children}
    </section>
  )
}

export function AiPanel({
  pack,
  pieceContext,
  assets,
  pieces,
  mapRadius,
  canPlaceFromChat,
  roomCode,
  onPlaceActions,
  onLibraryPatches,
  onUpdatePiece,
  onMovePiece,
}: AiPanelProps) {
  const [tab, setTab] = useState<AiTab>('shoulder')
  const codePlaceholder = roomCode?.trim() || '<CODE>'
  const placeGoblins = `Set active room to ${codePlaceholder}, then place 3 goblins on the board.`
  const placeCamp =
    'Using my asset board connector, search assets for camp, then place a camp on the board.'
  const listRooms = 'Using my asset board connector, list rooms on the board.'

  return (
    <div className="ai-panel">
      <div className="ai-tabs" role="tablist" aria-label="AI panel">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'shoulder'}
          className={tab === 'shoulder' ? 'ai-tab active' : 'ai-tab'}
          onClick={() => setTab('shoulder')}
        >
          Shoulder
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'setup'}
          className={tab === 'setup' ? 'ai-tab active' : 'ai-tab'}
          onClick={() => setTab('setup')}
        >
          Setup
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'prompts'}
          className={tab === 'prompts' ? 'ai-tab active' : 'ai-tab'}
          onClick={() => setTab('prompts')}
        >
          Prompts
        </button>
      </div>

      {tab === 'shoulder' ? (
        <div className="ai-tab-panel ai-tab-shoulder" role="tabpanel">
          <ShoulderChatWindow
            pack={pack}
            pieceContext={pieceContext}
            assets={assets}
            pieces={pieces}
            mapRadius={mapRadius}
            canPlaceFromChat={canPlaceFromChat}
            onPlaceActions={onPlaceActions}
            onLibraryPatches={onLibraryPatches}
            onUpdatePiece={onUpdatePiece}
            onMovePiece={onMovePiece}
          />
        </div>
      ) : null}

      {tab === 'setup' ? (
        <div className="ai-tab-panel ai-tab-docs" role="tabpanel">
          <SetupSection title="Local model (Shoulder)">
            <ol className="ai-steps">
              <li>
                Install and run <strong>Ollama</strong> on this PC.
              </li>
              <li>
                Pull a tools-capable model, e.g.{' '}
                <code>ollama pull llama3.1:8b</code> (default).
              </li>
              <li>
                Open the <strong>Shoulder</strong> tab here →{' '}
                <strong>Settings</strong> → choose <strong>Ollama</strong> →
                Save. Banner should show <strong>Ollama · llama3.1:8b</strong>{' '}
                when reachable.
              </li>
            </ol>
            <p className="ai-note">
              Shoulder talks to Ollama in this browser. xAI API keys stay under
              Shoulder Settings if you already use that path — not required for
              this panel.
            </p>
          </SetupSection>

          <SetupSection title="Grok connector (grok.com)">
            <ol className="ai-steps">
              <li>
                Keep <code>npm run server</code> running. Copy the board MCP
                token from the server printout or <code>.mcp-token</code>{' '}
                (never commit it).
              </li>
              <li>
                Tunnel the server:{' '}
                <code>cloudflared tunnel --url http://localhost:3001</code>{' '}
                (or ngrok).
              </li>
              <li>
                On this board, click <strong>Host room</strong> and leave that
                tab open — note the room code.
              </li>
              <li>
                In a <strong>separate grok.com tab</strong>, open Connectors →
                New → Custom. MCP URL:{' '}
                <code>https://&lt;tunnel-host&gt;/mcp</code>.
              </li>
              <li>
                Approve OAuth on the board consent page — paste the same board
                token and Approve.
              </li>
            </ol>
            <p className="ai-note ai-note-em">
              Subscription Grok lives in that separate grok.com tab and drives
              the board through the connector. Board <strong>Shoulder</strong>{' '}
              does <em>not</em> use the subscription connector.
            </p>
          </SetupSection>
        </div>
      ) : null}

      {tab === 'prompts' ? (
        <div className="ai-tab-panel ai-tab-docs" role="tabpanel">
          <p className="ai-note">
            Paste into <strong>grok.com</strong> (with your board connector
            connected).
            {roomCode ? (
              <>
                {' '}
                Active room: <code>{roomCode}</code>.
              </>
            ) : (
              <>
                {' '}
                Host a room first, then replace <code>&lt;CODE&gt;</code>.
              </>
            )}
          </p>
          <CopyRow label="List rooms" text={listRooms} />
          <CopyRow
            label={
              roomCode
                ? `Set room ${roomCode} + place goblins`
                : 'Set room + place goblins'
            }
            text={placeGoblins}
          />
          <CopyRow label="Search + place a camp" text={placeCamp} />
        </div>
      ) : null}
    </div>
  )
}
