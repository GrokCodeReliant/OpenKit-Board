import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Role } from '../multiplayer/protocol'
import { canControlPiece } from '../multiplayer/useRoom'
import type { AssetDef, HexCoord, PieceTransform, PlacedPiece } from '../types'
import { pieceTransform } from '../types'
import {
  clampBoardZoom,
  VIEW_PRESETS,
  type CameraView,
} from '../cameraViews'
import {
  CELL_SIZE,
  cellKey,
  generateSquareMap,
  pixelToSquare,
  squarePath,
  squareToPixel,
} from '../hex'

export type PieceTransformPatch = Partial<PieceTransform>

interface HexBoardProps {
  mapRadius: number
  assetsById: Map<string, AssetDef>
  pieces: PlacedPiece[]
  selectedPieceId: string | null
  selectedAssetId: string | null
  hoverHex: HexCoord | null
  clientId: string | null
  role: Role | null
  inRoom: boolean
  onHoverHex: (h: HexCoord | null) => void
  onPlaceAt: (q: number, r: number) => void
  onSelectPiece: (id: string | null) => void
  onMovePiece: (id: string, q: number, r: number) => void
  onUpdatePiece: (id: string, patch: PieceTransformPatch) => void
  onDropAsset: (assetId: string, q: number, r: number) => void
  cameraView: CameraView
  /** Optional live board zoom for ambience crossfade (Bite 5). */
  onZoomChange?: (zoom: number) => void
}

type DragMode =
  | 'pan'
  | 'piece'
  | 'offset'
  | 'rotate'
  | 'scale-corner'
  | 'scale-edge'

type HandleKind =
  | 'rotate'
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se'
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | 'body'

interface DragState {
  mode: DragMode
  startX: number
  startY: number
  panX: number
  panY: number
  pieceId?: string
  handle?: HandleKind
  /** Snapshot of transform at pointer-down */
  startT?: PieceTransform
  /** World-space piece center (cell + offset) at pointer-down */
  originX?: number
  originY?: number
  /** Angle from origin to pointer at rotate start (deg) */
  startAngleDeg?: number
  /** Base unscaled size at pointer-down */
  baseSize?: number
}

const HANDLE_R = 5
const ROTATE_GAP = 18
const MIN_SCALE = 0.15
const MAX_SCALE = 6

function clampScale(n: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, n))
}

function snapRotation(deg: number, free: boolean): number {
  if (free) return deg
  const step = 15
  return Math.round(deg / step) * step
}

function normDeg(deg: number): number {
  let d = ((deg % 360) + 360) % 360
  if (d > 180) d -= 360
  return d
}

function baseSizeFor(piece: PlacedPiece): number {
  return piece.layer === 'ground' ? CELL_SIZE * 0.98 : CELL_SIZE * 0.82
}

/** Visual center in world px (cell center + offset). */
function pieceCenter(piece: PlacedPiece, t: PieceTransform) {
  const { x, y } = squareToPixel(piece.q, piece.r)
  return {
    x: x + t.offsetX * CELL_SIZE,
    y: y + t.offsetY * CELL_SIZE,
  }
}

function handleLayout(piece: PlacedPiece, t: PieceTransform) {
  const base = baseSizeFor(piece)
  const w = base * t.scaleX
  const h = base * t.scaleY
  const c = pieceCenter(piece, t)
  const hw = w / 2
  const hh = h / 2
  // Handles sit in unrotated local space; we rotate them with the piece group.
  return {
    cx: c.x,
    cy: c.y,
    w,
    h,
    hw,
    hh,
    rotationDeg: t.rotationDeg,
    local: {
      nw: { x: -hw, y: -hh },
      ne: { x: hw, y: -hh },
      sw: { x: -hw, y: hh },
      se: { x: hw, y: hh },
      n: { x: 0, y: -hh },
      s: { x: 0, y: hh },
      e: { x: hw, y: 0 },
      w: { x: -hw, y: 0 },
      rotate: { x: 0, y: -hh - ROTATE_GAP },
      body: { x: 0, y: 0 },
    } as Record<HandleKind, { x: number; y: number }>,
  }
}

function rotateLocal(lx: number, ly: number, deg: number) {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { x: lx * cos - ly * sin, y: lx * sin + ly * cos }
}

function hitHandle(
  worldX: number,
  worldY: number,
  piece: PlacedPiece,
  t: PieceTransform,
  zoom: number,
): HandleKind | null {
  const layout = handleLayout(piece, t)
  const lx = worldX - layout.cx
  const ly = worldY - layout.cy
  // Inverse-rotate into local handle space
  const inv = rotateLocal(lx, ly, -layout.rotationDeg)
  const thresh = (HANDLE_R + 4) / Math.max(zoom, 0.25)

  const order: HandleKind[] = [
    'rotate',
    'nw',
    'ne',
    'sw',
    'se',
    'n',
    's',
    'e',
    'w',
  ]
  for (const kind of order) {
    const p = layout.local[kind]
    const dx = inv.x - p.x
    const dy = inv.y - p.y
    if (dx * dx + dy * dy <= thresh * thresh) return kind
  }

  // Body hit for offset when locked (inside rect in local space)
  if (
    Math.abs(inv.x) <= layout.hw &&
    Math.abs(inv.y) <= layout.hh
  ) {
    return 'body'
  }
  return null
}

export function HexBoard({
  mapRadius,
  assetsById,
  pieces,
  selectedPieceId,
  selectedAssetId,
  hoverHex,
  clientId,
  role,
  inRoom,
  onHoverHex,
  onPlaceAt,
  onSelectPiece,
  onMovePiece,
  onUpdatePiece,
  onDropAsset,
  cameraView,
  onZoomChange,
}: HexBoardProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const didCenterRef = useRef(false)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(() => VIEW_PRESETS[cameraView].hexZoom)
  const [dragging, setDragging] = useState(false)
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 })
  /** Live transform preview while dragging handles (committed via onUpdatePiece). */
  const [livePatch, setLivePatch] = useState<{
    id: string
    patch: PieceTransformPatch
  } | null>(null)

  useEffect(() => {
    onZoomChange?.(zoom)
  }, [zoom, onZoomChange])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const { width, height } = el.getBoundingClientRect()
      setViewSize({ w: width, h: height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (viewSize.w <= 0 || viewSize.h <= 0) return
    setZoom((z) => clampBoardZoom(z, mapRadius, viewSize.w, viewSize.h))
  }, [mapRadius, viewSize.w, viewSize.h])

  const dragRef = useRef<DragState | null>(null)

  const cells = useMemo(() => generateSquareMap(mapRadius), [mapRadius])
  const validKeys = useMemo(
    () => new Set(cells.map((c) => cellKey(c.q, c.r))),
    [cells],
  )

  const isOnMap = useCallback(
    (q: number, r: number) => validKeys.has(cellKey(q, r)),
    [validKeys],
  )

  const recenter = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    didCenterRef.current = true
    setPan({ x: width / 2, y: height / 2 })
  }, [])

  useEffect(() => {
    recenter()
  }, [recenter])

  useEffect(() => {
    recenter()
  }, [mapRadius, recenter])

  // Clear live preview when selection changes / piece removed
  useEffect(() => {
    setLivePatch(null)
  }, [selectedPieceId])

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const el = wrapRef.current
      if (!el) return { x: 0, y: 0 }
      const rect = el.getBoundingClientRect()
      const sx = clientX - rect.left
      const sy = clientY - rect.top
      return {
        x: (sx - pan.x) / zoom,
        y: (sy - pan.y) / zoom,
      }
    },
    [pan, zoom],
  )

  const cellAtClient = useCallback(
    (clientX: number, clientY: number): HexCoord => {
      const { x, y } = screenToWorld(clientX, clientY)
      return pixelToSquare(x, y, CELL_SIZE)
    },
    [screenToWorld],
  )

  const resolvedPieces = useMemo(() => {
    if (!livePatch) return pieces
    return pieces.map((p) =>
      p.id === livePatch.id ? { ...p, ...livePatch.patch } : p,
    )
  }, [pieces, livePatch])

  const pieceAtCell = useCallback(
    (q: number, r: number): PlacedPiece | undefined => {
      const at = resolvedPieces.filter((p) => p.q === q && p.r === r)
      return at.find((p) => p.layer === 'object') ?? at.find((p) => p.layer === 'ground')
    },
    [resolvedPieces],
  )

  const selectedPiece = useMemo(
    () => resolvedPieces.find((p) => p.id === selectedPieceId) ?? null,
    [resolvedPieces, selectedPieceId],
  )

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const el = wrapRef.current
    const { width, height } = el?.getBoundingClientRect() ?? {
      width: viewSize.w,
      height: viewSize.h,
    }
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    setZoom((z) => clampBoardZoom(z * factor, mapRadius, width, height))
  }

  const beginPan = (e: React.PointerEvent) => {
    dragRef.current = {
      mode: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    }
    setDragging(true)
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    // Middle / right / Alt+left = pan (never steal camera)
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
      dragRef.current = {
        mode: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      }
      setDragging(true)
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
      return
    }

    if (e.button !== 0) return

    const world = screenToWorld(e.clientX, e.clientY)

    // Transform handles on selected controllable piece take priority
    if (selectedPiece) {
      const movable = canControlPiece(role, inRoom, clientId, selectedPiece)
      if (movable) {
        const t = pieceTransform(selectedPiece)
        const hit = hitHandle(world.x, world.y, selectedPiece, t, zoom)
        if (hit && hit !== 'body') {
          const c = pieceCenter(selectedPiece, t)
          const mode: DragMode =
            hit === 'rotate'
              ? 'rotate'
              : hit === 'n' || hit === 's' || hit === 'e' || hit === 'w'
                ? 'scale-edge'
                : 'scale-corner'
          const startAngleDeg =
            (Math.atan2(world.y - c.y, world.x - c.x) * 180) / Math.PI
          dragRef.current = {
            mode,
            startX: e.clientX,
            startY: e.clientY,
            panX: pan.x,
            panY: pan.y,
            pieceId: selectedPiece.id,
            handle: hit,
            startT: t,
            originX: c.x,
            originY: c.y,
            startAngleDeg,
            baseSize: baseSizeFor(selectedPiece),
          }
          setDragging(true)
          ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
          e.stopPropagation()
          return
        }
        if (hit === 'body' && t.lockedToCell) {
          // Locked: body-drag nudges image offset (cell ownership stays)
          dragRef.current = {
            mode: 'offset',
            startX: e.clientX,
            startY: e.clientY,
            panX: pan.x,
            panY: pan.y,
            pieceId: selectedPiece.id,
            handle: 'body',
            startT: t,
            originX: pieceCenter(selectedPiece, t).x,
            originY: pieceCenter(selectedPiece, t).y,
            baseSize: baseSizeFor(selectedPiece),
          }
          setDragging(true)
          ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
          return
        }
      }
    }

    const cell = cellAtClient(e.clientX, e.clientY)
    if (!isOnMap(cell.q, cell.r)) {
      onSelectPiece(null)
      beginPan(e)
      return
    }

    const piece = pieceAtCell(cell.q, cell.r)

    if (selectedAssetId) {
      onPlaceAt(cell.q, cell.r)
      return
    }

    if (piece) {
      onSelectPiece(piece.id)
      const movable = canControlPiece(role, inRoom, clientId, piece)
      const t = pieceTransform(piece)
      if (movable) {
        // Locked: body-drag nudges image. Shift+drag (or unlocked) moves cell.
        // Unlock still keeps transform; cell move is how you re-home the piece.
        if (t.lockedToCell && !e.shiftKey) {
          dragRef.current = {
            mode: 'offset',
            startX: e.clientX,
            startY: e.clientY,
            panX: pan.x,
            panY: pan.y,
            pieceId: piece.id,
            handle: 'body',
            startT: t,
            baseSize: baseSizeFor(piece),
          }
        } else {
          dragRef.current = {
            mode: 'piece',
            startX: e.clientX,
            startY: e.clientY,
            panX: pan.x,
            panY: pan.y,
            pieceId: piece.id,
          }
        }
        setDragging(true)
        ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
      }
      return
    }

    onSelectPiece(null)
    beginPan(e)
  }

  const applyLive = (id: string, patch: PieceTransformPatch) => {
    setLivePatch({ id, patch })
    onUpdatePiece(id, patch)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const cell = cellAtClient(e.clientX, e.clientY)
    onHoverHex(isOnMap(cell.q, cell.r) ? cell : null)

    const d = dragRef.current
    if (!d) return

    if (d.mode === 'pan') {
      setPan({
        x: d.panX + (e.clientX - d.startX),
        y: d.panY + (e.clientY - d.startY),
      })
      return
    }

    if (d.mode === 'piece' && d.pieceId) {
      onHoverHex(isOnMap(cell.q, cell.r) ? cell : null)
      return
    }

    if (!d.pieceId || !d.startT) return
    const world = screenToWorld(e.clientX, e.clientY)

    if (d.mode === 'offset') {
      const dx = (e.clientX - d.startX) / zoom / CELL_SIZE
      const dy = (e.clientY - d.startY) / zoom / CELL_SIZE
      applyLive(d.pieceId, {
        offsetX: Math.min(8, Math.max(-8, d.startT.offsetX + dx)),
        offsetY: Math.min(8, Math.max(-8, d.startT.offsetY + dy)),
      })
      return
    }

    if (d.mode === 'rotate' && d.originX != null && d.originY != null) {
      const ang =
        (Math.atan2(world.y - d.originY, world.x - d.originX) * 180) / Math.PI
      const delta = ang - (d.startAngleDeg ?? 0)
      const next = snapRotation(d.startT.rotationDeg + delta, e.shiftKey)
      applyLive(d.pieceId, { rotationDeg: normDeg(next) })
      return
    }

    if (
      (d.mode === 'scale-corner' || d.mode === 'scale-edge') &&
      d.originX != null &&
      d.originY != null &&
      d.baseSize &&
      d.handle
    ) {
      // Work in local (unrotated) space relative to piece center
      const lx = world.x - d.originX
      const ly = world.y - d.originY
      const local = rotateLocal(lx, ly, -d.startT.rotationDeg)
      const halfBaseX = (d.baseSize * d.startT.scaleX) / 2
      const halfBaseY = (d.baseSize * d.startT.scaleY) / 2

      let scaleX = d.startT.scaleX
      let scaleY = d.startT.scaleY

      if (d.mode === 'scale-corner') {
        // Distance from center along both axes
        const sx = Math.abs(local.x) / (d.baseSize / 2)
        const sy = Math.abs(local.y) / (d.baseSize / 2)
        if (e.shiftKey) {
          // Free non-uniform
          scaleX = clampScale(sx)
          scaleY = clampScale(sy)
        } else {
          // Uniform from average (or keep aspect from start)
          const aspect = d.startT.scaleY / d.startT.scaleX
          const fromX = sx
          const fromY = sy / aspect
          const u = clampScale(Math.max(fromX, fromY))
          scaleX = u
          scaleY = clampScale(u * aspect)
        }
      } else {
        // Edge: only one axis
        if (d.handle === 'e' || d.handle === 'w') {
          scaleX = clampScale((Math.abs(local.x) * 2) / d.baseSize)
        } else {
          scaleY = clampScale((Math.abs(local.y) * 2) / d.baseSize)
        }
      }

      // Keep finite / avoid NaN when pointer on center
      if (!Number.isFinite(scaleX) || scaleX < MIN_SCALE) scaleX = d.startT.scaleX
      if (!Number.isFinite(scaleY) || scaleY < MIN_SCALE) scaleY = d.startT.scaleY
      void halfBaseX
      void halfBaseY
      applyLive(d.pieceId, { scaleX, scaleY })
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (d?.mode === 'piece' && d.pieceId) {
      const cell = cellAtClient(e.clientX, e.clientY)
      if (isOnMap(cell.q, cell.r)) {
        onMovePiece(d.pieceId, cell.q, cell.r)
      }
    }
    // Transform modes already streamed updates via onUpdatePiece
    dragRef.current = null
    setDragging(false)
    setLivePatch(null)
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    const cell = cellAtClient(e.clientX, e.clientY)
    onHoverHex(isOnMap(cell.q, cell.r) ? cell : null)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const assetId =
      e.dataTransfer.getData('application/x-openkit-asset') ||
      e.dataTransfer.getData('text/plain')
    if (!assetId) return
    const cell = cellAtClient(e.clientX, e.clientY)
    if (!isOnMap(cell.q, cell.r)) return
    onDropAsset(assetId, cell.q, cell.r)
  }

  const sortedPieces = useMemo(() => {
    return [...resolvedPieces].sort((a, b) => {
      if (a.layer !== b.layer) return a.layer === 'ground' ? -1 : 1
      if (a.r !== b.r) return a.r - b.r
      return a.q - b.q
    })
  }, [resolvedPieces])

  const hoverKey = hoverHex ? cellKey(hoverHex.q, hoverHex.r) : null
  const half = CELL_SIZE / 2 - 0.5

  const selectedCanEdit =
    !!selectedPiece && canControlPiece(role, inRoom, clientId, selectedPiece)

  return (
    <div
      ref={wrapRef}
      className={`hex-board square-board ${dragging ? 'dragging' : ''}`}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg className="hex-svg" width="100%" height="100%">
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {cells.map(({ q, r }) => {
            const { x, y } = squareToPixel(q, r)
            const key = cellKey(q, r)
            const isHover = hoverKey === key
            const alt = ((q + r) & 1) === 0
            const cls = [
              'hex-cell',
              'square-cell',
              alt ? 'check-a' : 'check-b',
              isHover ? 'hover' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <path
                key={key}
                d={squarePath(x, y, half)}
                className={cls}
              />
            )
          })}

          {sortedPieces.map((piece) => {
            const asset = assetsById.get(piece.assetId)
            if (!asset) return null
            const t = pieceTransform(piece)
            const { x: cellX, y: cellY } = squareToPixel(piece.q, piece.r)
            const selected = piece.id === selectedPieceId
            const size = baseSizeFor(piece)
            const w = size * t.scaleX
            const h = size * t.scaleY
            const cx = cellX + t.offsetX * CELL_SIZE
            const cy = cellY + t.offsetY * CELL_SIZE
            return (
              <g key={piece.id} className={selected ? 'piece selected' : 'piece'}>
                {selected && (
                  <path
                    d={squarePath(cellX, cellY, CELL_SIZE / 2 - 1)}
                    className="piece-select-ring"
                  />
                )}
                {selected && piece.layer === 'object' && (
                  <ellipse
                    className="piece-contact-shadow"
                    cx={cx}
                    cy={cy + h * 0.38}
                    rx={w * 0.34}
                    ry={h * 0.13}
                  />
                )}
                <g transform={`translate(${cx}, ${cy}) rotate(${t.rotationDeg})`}>
                  <image
                    href={asset.src}
                    x={-w / 2}
                    y={-h / 2}
                    width={w}
                    height={h}
                    preserveAspectRatio="none"
                    style={{ pointerEvents: 'none' }}
                  />
                </g>
              </g>
            )
          })}

          {/* Edit handles for selected piece */}
          {selectedPiece && selectedCanEdit && (
            <TransformHandles piece={selectedPiece} />
          )}

          {selectedAssetId && hoverHex && isOnMap(hoverHex.q, hoverHex.r) && (
            <Ghost
              asset={assetsById.get(selectedAssetId)}
              q={hoverHex.q}
              r={hoverHex.r}
            />
          )}
        </g>
      </svg>

      <div className="board-hud">
        <span>
          Scroll zoom · empty/Alt drag pan · handles: rotate / scale / lock-nudge
        </span>
        <span>
          Zoom {Math.round(zoom * 100)}%
          {hoverHex ? ` · ${hoverHex.q},${hoverHex.r}` : ''}
        </span>
      </div>
    </div>
  )
}

function TransformHandles({ piece }: { piece: PlacedPiece }) {
  const t = pieceTransform(piece)
  const layout = handleLayout(piece, t)
  const corners: HandleKind[] = ['nw', 'ne', 'sw', 'se']
  const edges: HandleKind[] = ['n', 's', 'e', 'w']
  const r = HANDLE_R

  return (
    <g
      className="piece-transform-handles"
      transform={`translate(${layout.cx}, ${layout.cy}) rotate(${layout.rotationDeg})`}
      style={{ pointerEvents: 'none' }}
    >
      <rect
        className="piece-transform-box"
        x={-layout.hw}
        y={-layout.hh}
        width={layout.w}
        height={layout.h}
      />
      {/* Rotate stem */}
      <line
        className="piece-handle-stem"
        x1={0}
        y1={-layout.hh}
        x2={0}
        y2={-layout.hh - ROTATE_GAP}
      />
      <circle
        className="piece-handle piece-handle-rotate"
        cx={0}
        cy={-layout.hh - ROTATE_GAP}
        r={r}
      />
      {corners.map((k) => (
        <rect
          key={k}
          className="piece-handle piece-handle-corner"
          x={layout.local[k].x - r}
          y={layout.local[k].y - r}
          width={r * 2}
          height={r * 2}
        />
      ))}
      {edges.map((k) => (
        <rect
          key={k}
          className="piece-handle piece-handle-edge"
          x={layout.local[k].x - r * 0.7}
          y={layout.local[k].y - r * 0.7}
          width={r * 1.4}
          height={r * 1.4}
        />
      ))}
      {t.lockedToCell && (
        <text
          className="piece-lock-badge"
          x={0}
          y={layout.hh + 12}
          textAnchor="middle"
        >
          locked
        </text>
      )}
    </g>
  )
}

function Ghost({
  asset,
  q,
  r,
}: {
  asset: AssetDef | undefined
  q: number
  r: number
}) {
  if (!asset) return null
  const { x, y } = squareToPixel(q, r)
  const size =
    asset.category === 'tiles' ? CELL_SIZE * 0.98 : CELL_SIZE * 0.82
  return (
    <g className="ghost" opacity={0.55}>
      <path
        d={squarePath(x, y, CELL_SIZE / 2 - 1)}
        className="ghost-hex ghost-square"
      />
      <image
        href={asset.src}
        x={x - size / 2}
        y={y - size / 2}
        width={size}
        height={size}
        preserveAspectRatio="xMidYMid meet"
        style={{ pointerEvents: 'none' }}
      />
    </g>
  )
}
