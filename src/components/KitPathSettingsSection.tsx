import { useCallback, useEffect, useState } from 'react'

export const KIT_CONFIG_CHANGED_EVENT = 'okb:kit-config-changed'

type KitConfig = {
  kitPath: string | null
  kitAvailable: boolean
  source: 'env' | 'file' | 'fallback' | null
  savedPath: string | null
  envSet: boolean
  hint?: string
}

/** Point the room server at your Open Kit passed/ folder. */
export function KitPathSettingsSection() {
  const [draft, setDraft] = useState('')
  const [config, setConfig] = useState<KitConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/kit/config', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal,
      })
      if (!res.ok) {
        setConfig(null)
        setError(
          res.status === 401
            ? 'Kit path Settings need the board on localhost with npm run server.'
            : 'Room server not reachable. Start npm run server.',
        )
        setLoading(false)
        return
      }
      const data = (await res.json()) as KitConfig
      setConfig(data)
      setDraft(data.savedPath || data.kitPath || '')
      setLoading(false)
    } catch (err) {
      if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') return
      setConfig(null)
      setError('Room server not reachable. Start npm run server.')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    void reload(ac.signal)
    return () => ac.abort()
  }, [reload])

  const onSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    setNote(null)
    try {
      const res = await fetch('/kit/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ path: draft.trim() }),
      })
      const data = (await res.json()) as KitConfig & { ok?: boolean; error?: string; note?: string }
      if (!res.ok) {
        setError(data.error || `Save failed (HTTP ${res.status})`)
        setSaving(false)
        return
      }
      setConfig(data)
      setDraft(data.savedPath || data.kitPath || '')
      if (data.note) setNote(data.note)
      window.dispatchEvent(new CustomEvent(KIT_CONFIG_CHANGED_EVENT))
      setSaving(false)
    } catch {
      setError('Could not save — is npm run server up?')
      setSaving(false)
    }
  }, [draft])

  const onClear = useCallback(async () => {
    setDraft('')
    setSaving(true)
    setError(null)
    setNote(null)
    try {
      const res = await fetch('/kit/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ path: '' }),
      })
      const data = (await res.json()) as KitConfig & { error?: string; note?: string }
      if (!res.ok) {
        setError(data.error || 'Clear failed')
        setSaving(false)
        return
      }
      setConfig(data)
      setDraft('')
      window.dispatchEvent(new CustomEvent(KIT_CONFIG_CHANGED_EVENT))
      setSaving(false)
    } catch {
      setError('Could not clear — is npm run server up?')
      setSaving(false)
    }
  }, [])

  return (
    <section className="mcp-token-block" aria-label="Open Kit folder">
      <h3 className="shoulder-settings-label">Open Kit folder</h3>
      <p className="shoulder-settings-note">
        Point the board at <em>your</em> Open Kit <code>passed/</code> folder (absolute path).
        Saved on this PC for the room server. Demo pack is used when unset or missing.{' '}
        <code>OPENKIT_KIT_PATH</code> env overrides the saved path.
      </p>
      {loading ? (
        <p className="shoulder-settings-note">Loading kit path…</p>
      ) : (
        <>
          <label className="shoulder-settings-label" htmlFor="okb-kit-path">
            Kit folder path
          </label>
          <input
            id="okb-kit-path"
            type="text"
            className="shoulder-settings-input"
            placeholder="C:\path\to\OpenKit\passed"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <div className="shoulder-settings-actions mcp-token-row">
            <button type="button" className="shoulder-send" disabled={saving} onClick={() => void onSave()}>
              {saving ? 'Saving…' : 'Save kit path'}
            </button>
            <button type="button" className="shoulder-settings-toggle" disabled={saving} onClick={() => void onClear()}>
              Clear
            </button>
            <button type="button" className="shoulder-settings-toggle" disabled={saving} onClick={() => void reload()}>
              Reload
            </button>
          </div>
          {config?.kitAvailable ? (
            <p className="shoulder-settings-note">
              Active: <code>{config.kitPath}</code> ({config.source || 'ok'})
              {config.envSet ? ' — env override on' : ''}
            </p>
          ) : (
            <p className="shoulder-settings-note mcp-token-empty">
              No kit folder active — Assets will use the demo pack until you save a valid path.
            </p>
          )}
          {note ? <p className="shoulder-settings-note">{note}</p> : null}
          {error ? <p className="shoulder-settings-note mcp-token-empty">{error}</p> : null}
        </>
      )}
    </section>
  )
}
