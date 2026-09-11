import { useCallback, useEffect, useState } from 'react'
import {
  copyTextToClipboard,
  fetchBoardMcpToken,
  maskMcpToken,
} from '../mcpBoardToken'

/** Show + Copy board MCP token (local Settings / AI Setup). */
export function McpTokenCopySection({ compact = false }: { compact?: boolean }) {
  const [token, setToken] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)

  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    const result = await fetchBoardMcpToken(signal)
    if (signal?.aborted) return
    if (result.ok) {
      setToken(result.token)
      setHint(result.hint ?? null)
      setError(null)
    } else {
      setToken(null)
      setHint(null)
      setError(result.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    void reload(ac.signal)
    return () => ac.abort()
  }, [reload])

  const onCopy = useCallback(async () => {
    if (!token) return
    const ok = await copyTextToClipboard(token)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    }
  }, [token])

  if (compact) {
    return (
      <div className="mcp-token-block mcp-token-compact">
        {loading ? (
          <p className="shoulder-settings-note">Loading board MCP token…</p>
        ) : token ? (
          <div className="mcp-token-row">
            <code className="mcp-token-value" title="Board MCP token">
              {revealed ? token : maskMcpToken(token)}
            </code>
            <button
              type="button"
              className="shoulder-settings-toggle"
              onClick={() => setRevealed((v) => !v)}
            >
              {revealed ? 'Hide' : 'Show'}
            </button>
            <button type="button" className="ai-copy-btn" onClick={() => void onCopy()}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        ) : (
          <p className="shoulder-settings-note">
            {error || 'Start npm run server, then refresh.'}{' '}
            <button type="button" className="shoulder-settings-toggle" onClick={() => void reload()}>
              Retry
            </button>
          </p>
        )}
      </div>
    )
  }

  return (
    <section className="mcp-token-block" aria-label="Grok connector MCP token">
      <h3 className="shoulder-settings-label">Grok connector (MCP)</h3>
      <p className="shoulder-settings-note">
        For the <strong>grok.com</strong> MCP connector only (not the Shoulder xAI key).
        This board token stays stable across server restarts (saved in{' '}
        <code>.mcp-token</code>). Paste it into Grok only when adding or reconnecting
        the connector (OAuth Approve). Tunnel to <code>:3001</code> — the Cloudflare/ngrok
        URL is separate and may change; connect once per tunnel URL. See{' '}
        <code>docs/MCP.md</code>.
      </p>
      {loading ? (
        <p className="shoulder-settings-note">Loading token from room server…</p>
      ) : token ? (
        <>
          <label className="shoulder-settings-label" htmlFor="mcp-board-token">
            Board MCP token
          </label>
          <div className="mcp-token-row">
            <input
              id="mcp-board-token"
              className="shoulder-settings-input mcp-token-input"
              type={revealed ? 'text' : 'password'}
              readOnly
              value={revealed ? token : '••••••••••••••••'}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="shoulder-settings-toggle"
              onClick={() => setRevealed((v) => !v)}
            >
              {revealed ? 'Hide' : 'Show'}
            </button>
            <button type="button" className="ai-copy-btn" onClick={() => void onCopy()}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          {hint ? <p className="shoulder-settings-note">{hint}</p> : null}
        </>
      ) : (
        <p className="shoulder-settings-note mcp-token-empty">
          {error || 'No token yet.'} Start <code>npm run server</code> while this board
          is open, then{' '}
          <button type="button" className="shoulder-settings-toggle" onClick={() => void reload()}>
            Retry
          </button>
          .
        </p>
      )}
    </section>
  )
}
