import { useCallback, useState, type ReactNode } from 'react'
import type { RulesPack } from '../rulesPack'
import type { AssetDef, PieceUpdatePatch, PlacedPiece } from '../types'
import type { ShoulderPieceContext } from '../shoulderLocalHelper'
import type {
  ShoulderLibraryPatch,
  ShoulderPlaceAction,
} from '../shoulderPlace'
import { ShoulderChatWindow } from './ShoulderChatWindow'
import { McpTokenCopySection } from './McpTokenCopySection'

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
  const miniSession = `Set active room to ${codePlaceholder}. Confirm Kit Sparks is loaded (get_rules query Fighter). Make a Fighter PC sheet + token and 2 goblins with HP/armor from the rules (upsert_piece_sheet), place them, then run 3 rounds of Kit Sparks combat using get_rules, roll_dice, update_combat, and list_board. Narrate the story in chat; use board tools for tokens and sheets.`
  const miniCombat = `Using my board connector on room ${codePlaceholder}: list_board, then fight one goblin — roll_dice 1d6 for the Fighter Strike, update_combat with damage after Armor, mark defeated at 0 HP.`

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
          <SetupSection title="Open Kit folder">
            <p className="ai-note">
              Point the board at <em>your</em> Open Kit <code>passed/</code> folder in{' '}
              <strong>Shoulder → Settings</strong> (or set <code>OPENKIT_KIT_PATH</code>).
              Demo pack is the fallback when unset.
            </p>
          </SetupSection>

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
              Shoulder talks to Ollama (or an optional xAI API key) in this browser.
              That is separate from the grok.com MCP connector below — a missing
              Shoulder key does not block the subscription connector.
            </p>
          </SetupSection>

          <SetupSection title="Grok connector (grok.com)">
            <p className="ai-note">
              Token is stable — copy it from <strong>Shoulder → Settings</strong>{' '}
              (or below). Paste into Grok only when connecting/approving. Tunnel URL
              may change separately.
            </p>
            <McpTokenCopySection compact />
            <ol className="ai-steps">
              <li>
                Keep <code>npm run server</code> running. Copy the board MCP
                token from Settings (Show / Copy) — no need to open{' '}
                <code>.mcp-token</code> in Notepad.
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
              Subscription Grok lives in a separate grok.com tab and drives the
              board through this connector (<code>OPENKIT_MCP_TOKEN</code> + OAuth).
              Board <strong>Shoulder</strong> is a different path (Ollama / xAI key)
              and does <em>not</em> use the subscription connector.
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
          <CopyRow label="Kit Sparks mini session" text={miniSession} />
          <CopyRow label="One combat round" text={miniCombat} />
        </div>
      ) : null}
    </div>
  )
}
