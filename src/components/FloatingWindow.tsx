import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react'

export interface FloatingWindowProps {
  title: string
  onClose: () => void
  children: ReactNode
  /** Initial top-left in viewport coords (relative to offset parent). */
  initialX?: number
  initialY?: number
  width?: number
  minHeight?: number
  maxHeight?: number
  zIndex?: number
  onFocus?: () => void
  className?: string
  /** Extra aria label for the dialog. */
  ariaLabel?: string
}

/**
 * Material folio-style floating window — drag by the title bar.
 * Positioned absolutely inside a relatively positioned ancestor (e.g. .main).
 */
export function FloatingWindow({
  title,
  onClose,
  children,
  initialX = 72,
  initialY = 64,
  width = 340,
  minHeight,
  maxHeight = 520,
  zIndex = 20,
  onFocus,
  className = '',
  ariaLabel,
}: FloatingWindowProps) {
  const titleId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: initialX, y: initialY })
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      // Don't start drag from interactive controls in the chrome.
      const t = e.target as HTMLElement
      if (t.closest('button, input, textarea, select, a')) return
      onFocus?.()
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origX: pos.x,
        origY: pos.y,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
      e.preventDefault()
    },
    [onFocus, pos.x, pos.y],
  )

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    const parent = rootRef.current?.offsetParent as HTMLElement | null
    const pw = parent?.clientWidth ?? window.innerWidth
    const ph = parent?.clientHeight ?? window.innerHeight
    const el = rootRef.current
    const ew = el?.offsetWidth ?? width
    const eh = el?.offsetHeight ?? 200
    // Keep a strip of the title bar reachable.
    const nextX = Math.min(Math.max(8, d.origX + dx), Math.max(8, pw - 48))
    const nextY = Math.min(Math.max(8, d.origY + dy), Math.max(8, ph - 40))
    void ew
    void eh
    setPos({ x: nextX, y: nextY })
  }, [width])

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }, [])

  // Escape closes this window when it (or a child) has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const el = rootRef.current
      if (!el) return
      if (el.contains(document.activeElement) || document.activeElement === el) {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div
      ref={rootRef}
      className={`floating-window ${className}`.trim()}
      role="dialog"
      aria-labelledby={titleId}
      aria-label={ariaLabel ?? title}
      style={{
        left: pos.x,
        top: pos.y,
        width,
        zIndex,
        minHeight,
        maxHeight,
      }}
      onMouseDown={() => onFocus?.()}
    >
      <div
        className="floating-window-chrome"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <h2 id={titleId} className="floating-window-title">
          {title}
        </h2>
        <button
          type="button"
          className="floating-window-close"
          onClick={onClose}
          aria-label={`Close ${title}`}
        >
          ×
        </button>
      </div>
      <div className="floating-window-body">{children}</div>
    </div>
  )
}
