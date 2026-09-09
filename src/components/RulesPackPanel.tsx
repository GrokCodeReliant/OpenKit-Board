import { useRef, useState } from 'react'
import type { RulesPack } from '../rulesPack'
import {
  BODY_HARD_LIMIT,
  BODY_SOFT_LIMIT,
  createRulesPack,
  inferFormat,
  titleFromFilename,
  truncateBody,
} from '../rulesPack'

const RIGHTS_LABEL =
  'I affirm that I have the right to use this text in this private session (I wrote it, I own it, or its license allows my use). Open Kit Board will not redistribute this pack for me.'

/** Link-only sample — never vendor pack body in the repo. */
const SAMPLE_HELP_URL = 'https://johnharper.itch.io/lasers-feelings'

interface RulesPackPanelProps {
  pack: RulesPack | null
  importedBy: string
  /** Players / non-DM room peers: view only. */
  readOnly?: boolean
  /** When true, attach syncs to the multiplayer room. */
  inRoom?: boolean
  onAttach: (pack: RulesPack) => void
  onClear: () => void
}

export function RulesPackPanel({
  pack,
  importedBy,
  readOnly = false,
  inRoom = false,
  onAttach,
  onClear,
}: RulesPackPanelProps) {
  const [importing, setImporting] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [license, setLicense] = useState('')
  const [body, setBody] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [attribution, setAttribution] = useState('')
  const [rightsOk, setRightsOk] = useState(false)
  const [formatHint, setFormatHint] = useState<'text' | 'markdown'>('text')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const resetForm = () => {
    setTitle('')
    setLicense('')
    setBody('')
    setSourceUrl('')
    setAttribution('')
    setRightsOk(false)
    setFormatHint('text')
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const openImport = (replace: boolean) => {
    if (readOnly) return
    if (replace && pack) {
      setTitle(pack.title)
      setLicense(pack.license)
      setBody('')
      setSourceUrl(pack.sourceUrl ?? '')
      setAttribution(pack.attribution ?? '')
    } else {
      resetForm()
    }
    setRightsOk(false)
    setImporting(true)
    setViewOpen(false)
  }

  const onFile = async (file: File | null) => {
    setError(null)
    if (!file) return
    const lower = file.name.toLowerCase()
    const okExt = lower.endsWith('.txt') || lower.endsWith('.md')
    const okType =
      !file.type ||
      file.type === 'text/plain' ||
      file.type === 'text/markdown' ||
      file.type === 'text/x-markdown'
    if (!okExt || !okType) {
      setError('Convert to .txt or .md first, or paste text.')
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    if (file.size > BODY_HARD_LIMIT) {
      setError(`File too large (max ~${BODY_HARD_LIMIT / 1000} KB).`)
      return
    }
    const text = await file.text()
    if (text.length > BODY_HARD_LIMIT) {
      setError(`Text too large (max ${BODY_HARD_LIMIT.toLocaleString()} characters).`)
      return
    }
    setBody(text)
    setFormatHint(inferFormat(file.name, text))
    if (!title.trim()) setTitle(titleFromFilename(file.name))
  }

  const canSave =
    rightsOk &&
    body.trim().length > 0 &&
    license.trim().length > 0 &&
    body.length <= BODY_HARD_LIMIT &&
    !busy

  const onSave = async () => {
    if (!canSave || readOnly) return
    setBusy(true)
    setError(null)
    try {
      const packNext = await createRulesPack({
        title: title.trim() || 'Untitled rules pack',
        body,
        license: license.trim(),
        format: inferFormat(undefined, body) === 'markdown' ? 'markdown' : formatHint,
        sourceUrl: sourceUrl.trim() || undefined,
        attribution: attribution.trim() || undefined,
        importedBy,
      })
      onAttach(packNext)
      setImporting(false)
      resetForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (importing && !readOnly) {
    const softWarn = body.length >= BODY_SOFT_LIMIT
    return (
      <div className="rules-panel">
        <p className="rules-label">Slip in a rules folio</p>
        <p className="rules-empty">
          Paste or upload rules you own or wrote. Open Kit does not ship
          rulebooks.
        </p>
        <label className="rules-field">
          <span>Title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled rules pack"
            aria-label="Rules pack title"
          />
        </label>
        <label className="rules-field">
          <span>License (required)</span>
          <input
            type="text"
            value={license}
            onChange={(e) => setLicense(e.target.value)}
            placeholder="CC BY 4.0, Public domain, Personal / house rules…"
            aria-label="License"
          />
        </label>
        <label className="rules-field">
          <span>Body — paste or upload .txt / .md</span>
          <textarea
            rows={8}
            value={body}
            onChange={(e) => {
              setBody(e.target.value)
              setFormatHint(inferFormat(undefined, e.target.value))
            }}
            placeholder="Paste rules text here…"
            aria-label="Rules pack body"
          />
        </label>
        <div className="rules-upload-row">
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            aria-label="Upload rules file"
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </div>
        {softWarn && body.length <= BODY_HARD_LIMIT && (
          <p className="rules-warn">
            Large pack (~{Math.round(body.length / 1000)}k chars). Prefer a
            one-pager or summary if possible.
          </p>
        )}
        <label className="rules-field">
          <span>Source URL (optional)</span>
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://…"
            aria-label="Source URL"
          />
        </label>
        <label className="rules-field">
          <span>Attribution (optional)</span>
          <input
            type="text"
            value={attribution}
            onChange={(e) => setAttribution(e.target.value)}
            placeholder="Author credit"
            aria-label="Attribution"
          />
        </label>
        <label className="rules-check">
          <input
            type="checkbox"
            checked={rightsOk}
            onChange={(e) => setRightsOk(e.target.checked)}
          />
          <span>{RIGHTS_LABEL}</span>
        </label>
        <p className="rules-disclaimer">
          Open Kit Board is rules-agnostic. You are responsible for the legality
          of text you import. We store it for your session; we do not republish
          your packs.
        </p>
        {error && <p className="rules-error">{error}</p>}
        <div className="rules-actions">
          <button
            type="button"
            className="rules-primary"
            disabled={!canSave}
            onClick={() => void onSave()}
          >
            {busy
              ? 'Saving…'
              : inRoom
                ? 'Lay on table'
                : 'Lay on table'}
          </button>
          <button
            type="button"
            className="rules-secondary"
            onClick={() => {
              setImporting(false)
              resetForm()
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  if (!pack) {
    return (
      <div className="rules-panel">
        <p className="rules-label">Rules folio</p>
        {readOnly ? (
          <p className="rules-empty">
            No rules pack in this room yet. Ask the DM to attach one.
          </p>
        ) : (
          <>
            <p className="rules-empty">
              Paste or upload rules you own or wrote. Open Kit does not ship
              rulebooks.
            </p>
            <p className="rules-sample">
              Testing tip (link only):{' '}
              <a href={SAMPLE_HELP_URL} target="_blank" rel="noreferrer">
                Lasers &amp; Feelings
              </a>{' '}
              (CC BY 4.0) — copy text yourself; do not commit it here.
            </p>
            <button
              type="button"
              className="rules-primary"
              onClick={() => openImport(false)}
            >
              Import rules pack
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="rules-panel has-pack">
      <p className="rules-label">
        Rules folio
        {readOnly && <span className="rules-readonly-badge">Read-only</span>}
        {inRoom && !readOnly && (
          <span className="rules-room-badge">Table · DM</span>
        )}
      </p>
      <div className="rules-active-head">
        <strong className="rules-title">{pack.title}</strong>
        <span className="rules-license" title={pack.license}>
          {pack.license}
        </span>
      </div>
      {pack.attribution && (
        <p className="rules-meta">Attribution: {pack.attribution}</p>
      )}
      <p className="rules-meta">
        {pack.body.length.toLocaleString()} chars · {pack.format}
      </p>
      <p className="rules-preview">{truncateBody(pack.body)}</p>
      {viewOpen && (
        <pre className="rules-view" tabIndex={0}>
          {pack.body}
        </pre>
      )}
      <div className="rules-actions">
        <button
          type="button"
          className="rules-secondary"
          onClick={() => setViewOpen((v) => !v)}
        >
          {viewOpen ? 'Hide' : 'View'}
        </button>
        {!readOnly && (
          <>
            <button
              type="button"
              className="rules-secondary"
              onClick={() => openImport(true)}
            >
              Replace
            </button>
            <button
              type="button"
              className="rules-danger"
              onClick={() => {
                setViewOpen(false)
                onClear()
              }}
            >
              Clear
            </button>
          </>
        )}
      </div>
    </div>
  )
}
