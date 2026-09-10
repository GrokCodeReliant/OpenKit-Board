import type { RulesPack } from '../rulesPack'

interface RulesFolioWindowProps {
  pack: RulesPack
}

/** Scrollable full-body rules reference for a floating folio window. */
export function RulesFolioWindow({ pack }: RulesFolioWindowProps) {
  return (
    <div className="rules-folio-floating">
      <div className="rules-folio-meta">
        <strong className="rules-folio-title">{pack.title}</strong>
        {pack.license.trim() && (
          <span className="rules-license" title={pack.license}>
            {pack.license}
          </span>
        )}
      </div>
      {pack.attribution && (
        <p className="rules-meta">Note / credit: {pack.attribution}</p>
      )}
      {pack.sourceUrl && (
        <p className="rules-meta">
          <a href={pack.sourceUrl} target="_blank" rel="noreferrer">
            Source
          </a>
        </p>
      )}
      <p className="rules-meta">
        {pack.body.length.toLocaleString()} chars · {pack.format}
      </p>
      <pre className="rules-folio-body" tabIndex={0}>
        {pack.body}
      </pre>
    </div>
  )
}
