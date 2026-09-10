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
  'I affirm I have the right to use this text in my private session (I wrote it, I own it, or its license allows my use).'

/** Built-in original sample we ship (CC0) — not third-party rulebook text. */
const KIT_SPARKS_URL = '/samples/kit-sparks.md'
const KIT_SPARKS_TITLE = 'Kit Sparks'
const KIT_SPARKS_LICENSE = 'CC0 1.0'
const KIT_SPARKS_CREDIT = 'Open Kit sample'

/** Link-only tip — never vendor Lasers & Feelings body in the repo. */
const SAMPLE_HELP_URL = 'https://johnharper.itch.io/lasers-feelings'

interface RulesPackPanelProps {
  pack: RulesPack | null
  importedBy: string
  /** Players / non-DM room peers: view only. */
  readOnly?: boolean
  /** When true, attach syncs to the multiplayer room. */
  inRoom?: boolean
  /** Open the full pack body in a floating folio window. */
  onOpenFolio?: () => void
  /** Whether the floating folio is currently open. */
  folioOpen?: boolean
  onAttach: (pack: RulesPack) => void
  onClear: () => void
}

function saveBlockedReason(opts: {
  busy: boolean
  rightsOk: boolean
  body: string
}): string | null {
  const { busy, rightsOk, body } = opts
  if (busy) {
    // Extract in progress (no body yet). During save the button label is enough.
    if (!body.trim()) return 'Waiting for PDF text…'
    return null
  }
  if (!body.trim()) return 'Body is empty — paste or upload rules text.'
  if (body.length > BODY_HARD_LIMIT) {
    return `Text too long (max ${BODY_HARD_LIMIT.toLocaleString()} characters). Shorten it.`
  }
  if (!rightsOk) return 'Check the rights affirmation to continue.'
  return null
}

export function RulesPackPanel({
  pack,
  importedBy,
  readOnly = false,
  inRoom = false,
  onOpenFolio,
  folioOpen = false,
  onAttach,
  onClear,
}: RulesPackPanelProps) {
  const [importing, setImporting] = useState(false)
  const [title, setTitle] = useState('')
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
      setBody('')
      setSourceUrl(pack.sourceUrl ?? '')
      setAttribution(pack.attribution ?? '')
    } else {
      resetForm()
    }
    setRightsOk(false)
    setImporting(true)
  }

  /** One-click: fetch shipped Kit Sparks, affirm rights, attach + open folio. */
  const loadKitSparksSample = async () => {
    if (readOnly) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(KIT_SPARKS_URL)
      if (!res.ok) {
        throw new Error(`Could not load Kit Sparks sample (${res.status}).`)
      }
      const sampleBody = await res.text()
      if (!sampleBody.trim()) {
        throw new Error('Kit Sparks sample was empty.')
      }
      const packNext = await createRulesPack({
        title: KIT_SPARKS_TITLE,
        body: sampleBody,
        license: KIT_SPARKS_LICENSE,
        format: 'markdown',
        attribution: KIT_SPARKS_CREDIT,
        importedBy,
      })
      onAttach(packNext)
      // Parent also opens folio on attach; call here for a clear one-click path.
      onOpenFolio?.()
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not load the Kit Sparks sample.',
      )
    } finally {
      setBusy(false)
    }
  }

  const onFile = async (file: File | null) => {
    setError(null)
    if (!file) return
    const lower = file.name.toLowerCase()
    const isPdf =
      lower.endsWith('.pdf') || file.type === 'application/pdf'
    const isTextExt = lower.endsWith('.txt') || lower.endsWith('.md')
    const isTextType =
      !file.type ||
      file.type === 'text/plain' ||
      file.type === 'text/markdown' ||
      file.type === 'text/x-markdown'

    if (isPdf) {
      // Never call file.text() on PDF — binary as text blows up the folio / WS.
      // Lazy-load pdfjs so the main bundle stays lean until a PDF is chosen.
      setBusy(true)
      try {
        const { extractTextFromPdf } = await import('../pdfTextExtract')
        const text = await extractTextFromPdf(file)
        if (!text.trim()) {
          setError(
            'No extractable text found — this may be a scanned/image-only PDF. Paste the rules or use a text-based PDF / .txt / .md.',
          )
          setBody('')
          if (fileRef.current) fileRef.current.value = ''
          return
        }
        setBody(text)
        setFormatHint('text')
        if (!title.trim()) setTitle(titleFromFilename(file.name))
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : 'Could not extract text from that PDF.'
        setError(msg)
        if (fileRef.current) fileRef.current.value = ''
      } finally {
        setBusy(false)
      }
      return
    }

    if (!isTextExt || !isTextType) {
      setError('Upload a .txt, .md, or .pdf file, or paste text.')
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    if (file.size > BODY_HARD_LIMIT) {
      setError(`File too large (max ~${BODY_HARD_LIMIT / 1000} KB).`)
      return
    }
    try {
      const text = await file.text()
      if (!text.trim()) {
        setError('That file has no text. Paste rules or try another file.')
        setBody('')
        if (fileRef.current) fileRef.current.value = ''
        return
      }
      if (text.length > BODY_HARD_LIMIT) {
        setError(
          `Text too large for table sync (max ${BODY_HARD_LIMIT.toLocaleString()} characters). Shorten it and try again.`,
        )
        return
      }
      setBody(text)
      setFormatHint(inferFormat(file.name, text))
      if (!title.trim()) setTitle(titleFromFilename(file.name))
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not read that file.',
      )
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const canSave =
    rightsOk &&
    body.trim().length > 0 &&
    body.length <= BODY_HARD_LIMIT &&
    !busy

  const blockedReason = !canSave
    ? saveBlockedReason({ busy, rightsOk, body })
    : null

  const onSave = async () => {
    if (!canSave || readOnly) return
    setBusy(true)
    setError(null)
    try {
      const packNext = await createRulesPack({
        title: title.trim() || 'Untitled rules pack',
        body,
        // Optional on the model; import UX no longer collects a license.
        license: 'private session',
        format: inferFormat(undefined, body) === 'markdown' ? 'markdown' : formatHint,
        sourceUrl: sourceUrl.trim() || undefined,
        attribution: attribution.trim() || undefined,
        importedBy,
      })
      onAttach(packNext)
      setImporting(false)
      resetForm()
      // Parent opens the floating folio on attach so the book is visible.
      onOpenFolio?.()
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
          Private folio for this session. Paste or upload text you have the
          right to use — you are responsible for what you import. Open Kit does
          not ship rulebooks and does not republish your packs.
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
          <span>Body — paste or upload .txt / .md / .pdf</span>
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
            accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
            aria-label="Upload rules file (.txt, .md, or .pdf)"
            disabled={busy}
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
          {busy && (
            <p className="rules-meta">Extracting text from PDF…</p>
          )}
        </div>
        {softWarn && body.length <= BODY_HARD_LIMIT && (
          <p className="rules-warn">
            Large pack (~{Math.round(body.length / 1000)}k chars). Prefer a
            one-pager or summary if possible.
          </p>
        )}
        {body.length > BODY_HARD_LIMIT && (
          <p className="rules-error">
            Text exceeds the table sync limit ({BODY_HARD_LIMIT.toLocaleString()}{' '}
            characters). Shorten it before laying on the table — oversized packs
            are rejected so the room WebSocket stays healthy.
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
          <span>Note / credit (optional)</span>
          <input
            type="text"
            value={attribution}
            onChange={(e) => setAttribution(e.target.value)}
            placeholder="Author credit or private note"
            aria-label="Note or credit"
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
          This is your private folio for the table. You are responsible for what
          you import. We store it for your session; we do not republish your
          packs.
        </p>
        {error && <p className="rules-error">{error}</p>}
        <div className="rules-actions">
          <button
            type="button"
            className="rules-primary"
            disabled={!canSave}
            aria-describedby={blockedReason ? 'rules-save-blocked' : undefined}
            onClick={() => void onSave()}
          >
            {busy
              ? body.trim()
                ? 'Saving…'
                : 'Waiting for PDF…'
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
        {blockedReason && (
          <p id="rules-save-blocked" className="rules-blocked" role="status">
            {blockedReason}
          </p>
        )}
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
              Private folio for this session. Paste or upload text you have the
              right to use — you are responsible for what you import. Open Kit
              does not republish your packs. A tiny original sample is included
              for demos and AI/helper tests.
            </p>
            <div className="rules-actions">
              <button
                type="button"
                className="rules-primary"
                disabled={busy}
                onClick={() => void loadKitSparksSample()}
              >
                {busy ? 'Loading Kit Sparks…' : 'Load Kit Sparks sample'}
              </button>
              <button
                type="button"
                className="rules-secondary"
                disabled={busy}
                onClick={() => openImport(false)}
              >
                Import rules pack
              </button>
            </div>
            <p className="rules-sample">
              Kit Sparks is CC0 (Fight / Sneak / Grit, Armor, HP, Fighter &amp;
              Rogue). Loading it affirms rights for this shipped sample and lays
              the folio on the table.
            </p>
            <p className="rules-sample">
              Prefer your own one-pager? Testing tip (link only):{' '}
              <a href={SAMPLE_HELP_URL} target="_blank" rel="noreferrer">
                Lasers &amp; Feelings
              </a>{' '}
              — copy text yourself; do not commit it here.
            </p>
            {error && <p className="rules-error">{error}</p>}
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
        {pack.license.trim() && (
          <span className="rules-license" title={pack.license}>
            {pack.license}
          </span>
        )}
      </div>
      {pack.attribution && (
        <p className="rules-meta">Note / credit: {pack.attribution}</p>
      )}
      <p className="rules-meta">
        {pack.body.length.toLocaleString()} chars · {pack.format}
      </p>
      <p className="rules-preview">{truncateBody(pack.body)}</p>
      <div className="rules-actions">
        <button
          type="button"
          className={
            folioOpen ? 'rules-primary' : 'rules-primary rules-open-folio-pulse'
          }
          onClick={() => onOpenFolio?.()}
        >
          {folioOpen ? 'Folio open' : 'Open folio'}
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
                onClear()
              }}
            >
              Clear
            </button>
          </>
        )}
      </div>
      {!folioOpen && (
        <p className="rules-hint">
          Pack is on the table — click <strong>Open folio</strong> to read it as
          a book.
        </p>
      )}
    </div>
  )
}
