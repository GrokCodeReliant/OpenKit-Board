import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Role } from '../multiplayer/protocol'
import { canControlPiece } from '../multiplayer/useRoom'
import type { AssetDef, HexCoord, PlacedPiece } from '../types'
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
  onDropAsset: (assetId: string, q: number, r: number) => void
  cameraView: CameraView
  /** Optional live board zoom for ambience crossfade (Bite 5). */
  onZoomChange?: (zoom: number) => void
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

  useEffect(() => {
    onZoomChange?.(zoom)
  }, [zoom, onZoomChange])

  // Track viewport so min zoom can fit the full board (incl. radius 40).
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

  // Reclamp zoom when board size or viewport changes so full map stays reachable.
  useEffect(() => {
    if (viewSize.w <= 0 || viewSize.h <= 0) return
    setZoom((z) => clampBoardZoom(z, mapRadius, viewSize.w, viewSize.h))
  }, [mapRadius, viewSize.w, viewSize.h])

  const dragRef = useRef<{
    mode: 'pan' | 'piece'
    startX: number
    startY: number
    panX: number
    panY: number
    pieceId?: string
  } | null>(null)

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

  // Center pan on first layout (HexBoard remounts on cameraView change via key)
  useEffect(() => {
    recenter()
  }, [recenter])

  // Keep origin centered when radius jumps so the full map can be framed.
  useEffect(() => {
    recenter()
  }, [mapRadius, recenter])

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

  const pieceAtCell = useCallback(
    (q: number, r: number): PlacedPiece | undefined => {
      // Prefer object layer over ground for picking
      const at = pieces.filter((p) => p.q === q && p.r === r)
      return at.find((p) => p.layer === 'object') ?? at.find((p) => p.layer === 'ground')
    },
    [pieces],
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

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
      // Middle / right / Alt+left = pan
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

    const cell = cellAtClient(e.clientX, e.clientY)
    if (!isOnMap(cell.q, cell.r)) {
      onSelectPiece(null)
      dragRef.current = {
        mode: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      }
      setDragging(true)
      ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
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
      if (movable) {
        dragRef.current = {
          mode: 'piece',
          startX: e.clientX,
          startY: e.clientY,
          panX: pan.x,
          panY: pan.y,
          pieceId: piece.id,
        }
        setDragging(true)
        ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
      }
      return
    }

    // Empty cell: start pan with left drag, clear selection
    onSelectPiece(null)
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
    } else if (d.mode === 'piece' && d.pieceId) {
      // Live preview via hover; commit on up
      onHoverHex(isOnMap(cell.q, cell.r) ? cell : null)
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
    dragRef.current = null
    setDragging(false)
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

  // Sort for draw order: ground first, then objects; stable by id
  const sortedPieces = useMemo(() => {
    return [...pieces].sort((a, b) => {
      if (a.layer !== b.layer) return a.layer === 'ground' ? -1 : 1
      if (a.r !== b.r) return a.r - b.r
      return a.q - b.q
    })
  }, [pieces])

  const hoverKey = hoverHex ? cellKey(hoverHex.q, hoverHex.r) : null
  const half = CELL_SIZE / 2 - 0.5

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
          {/* Checkerboard grid */}
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

          {/* Pieces: tiles (ground) under tokens/props/monsters */}
          {sortedPieces.map((piece) => {
            const asset = assetsById.get(piece.assetId)
            if (!asset) return null
            const { x, y } = squareToPixel(piece.q, piece.r)
            const selected = piece.id === selectedPieceId
            // Ground tiles fill the square edge-to-edge; objects sit slightly inset
            const size =
              piece.layer === 'ground' ? CELL_SIZE * 0.98 : CELL_SIZE * 0.82
            return (
              <g key={piece.id} className={selected ? 'piece selected' : 'piece'}>
                {selected && (
                  <path
                    d={squarePath(x, y, CELL_SIZE / 2 - 1)}
                    className="piece-select-ring"
                  />
                )}
                {selected && piece.layer === 'object' && (
                  <ellipse
                    className="piece-contact-shadow"
                    cx={x}
                    cy={y + size * 0.38}
                    rx={size * 0.34}
                    ry={size * 0.13}
                  />
                )}
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
          })}

          {/* Ghost for palette selection */}
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
        <span>Scroll zoom · drag empty to pan · Alt/middle also pan</span>
        <span>
          Zoom {Math.round(zoom * 100)}%
          {hoverHex ? ` · ${hoverHex.q},${hoverHex.r}` : ''}
        </span>
      </div>
    </div>
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
