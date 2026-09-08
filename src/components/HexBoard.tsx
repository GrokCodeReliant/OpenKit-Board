import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AssetDef, HexCoord, PlacedPiece } from '../types'
import {
  HEX_SIZE,
  axialToPixel,
  generateHexMap,
  hexKey,
  hexPath,
  pixelToAxial,
} from '../hex'

const MAP_RADIUS = 8

interface HexBoardProps {
  assetsById: Map<string, AssetDef>
  pieces: PlacedPiece[]
  selectedPieceId: string | null
  selectedAssetId: string | null
  hoverHex: HexCoord | null
  onHoverHex: (h: HexCoord | null) => void
  onPlaceAt: (q: number, r: number) => void
  onSelectPiece: (id: string | null) => void
  onMovePiece: (id: string, q: number, r: number) => void
  onDropAsset: (assetId: string, q: number, r: number) => void
}

export function HexBoard({
  assetsById,
  pieces,
  selectedPieceId,
  selectedAssetId,
  hoverHex,
  onHoverHex,
  onPlaceAt,
  onSelectPiece,
  onMovePiece,
  onDropAsset,
}: HexBoardProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{
    mode: 'pan' | 'piece'
    startX: number
    startY: number
    panX: number
    panY: number
    pieceId?: string
  } | null>(null)

  const cells = useMemo(() => generateHexMap(MAP_RADIUS), [])

  // Center pan on first layout
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPan({ x: width / 2, y: height / 2 })
  }, [])

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

  const hexAtClient = useCallback(
    (clientX: number, clientY: number): HexCoord => {
      const { x, y } = screenToWorld(clientX, clientY)
      return pixelToAxial(x, y, HEX_SIZE)
    },
    [screenToWorld],
  )

  const pieceAtHex = useCallback(
    (q: number, r: number): PlacedPiece | undefined => {
      // Prefer object layer over ground for picking
      const at = pieces.filter((p) => p.q === q && p.r === r)
      return at.find((p) => p.layer === 'object') ?? at.find((p) => p.layer === 'ground')
    },
    [pieces],
  )

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    setZoom((z) => Math.min(2.5, Math.max(0.35, z * factor)))
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

    const hex = hexAtClient(e.clientX, e.clientY)
    const piece = pieceAtHex(hex.q, hex.r)

    if (selectedAssetId) {
      onPlaceAt(hex.q, hex.r)
      return
    }

    if (piece) {
      onSelectPiece(piece.id)
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
      return
    }

    // Empty hex: start pan with left drag, clear selection
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
    const hex = hexAtClient(e.clientX, e.clientY)
    onHoverHex(hex)

    const d = dragRef.current
    if (!d) return

    if (d.mode === 'pan') {
      setPan({
        x: d.panX + (e.clientX - d.startX),
        y: d.panY + (e.clientY - d.startY),
      })
    } else if (d.mode === 'piece' && d.pieceId) {
      // Live preview via hover; commit on up
      onHoverHex(hex)
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (d?.mode === 'piece' && d.pieceId) {
      const hex = hexAtClient(e.clientX, e.clientY)
      onMovePiece(d.pieceId, hex.q, hex.r)
    }
    dragRef.current = null
    setDragging(false)
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    onHoverHex(hexAtClient(e.clientX, e.clientY))
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const assetId =
      e.dataTransfer.getData('application/x-openkit-asset') ||
      e.dataTransfer.getData('text/plain')
    if (!assetId) return
    const hex = hexAtClient(e.clientX, e.clientY)
    onDropAsset(assetId, hex.q, hex.r)
  }

  // Sort for draw order: ground first, then objects; stable by id
  const sortedPieces = useMemo(() => {
    return [...pieces].sort((a, b) => {
      if (a.layer !== b.layer) return a.layer === 'ground' ? -1 : 1
      if (a.r !== b.r) return a.r - b.r
      return a.q - b.q
    })
  }, [pieces])

  const hoverKey = hoverHex ? hexKey(hoverHex.q, hoverHex.r) : null

  return (
    <div
      ref={wrapRef}
      className={`hex-board ${dragging ? 'dragging' : ''}`}
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
          {/* Grid */}
          {cells.map(({ q, r }) => {
            const { x, y } = axialToPixel(q, r)
            const key = hexKey(q, r)
            const isHover = hoverKey === key
            return (
              <path
                key={key}
                d={hexPath(x, y, HEX_SIZE - 0.5)}
                className={isHover ? 'hex-cell hover' : 'hex-cell'}
              />
            )
          })}

          {/* Pieces: tiles (ground) under tokens/props/monsters */}
          {sortedPieces.map((piece) => {
            const asset = assetsById.get(piece.assetId)
            if (!asset) return null
            const { x, y } = axialToPixel(piece.q, piece.r)
            const selected = piece.id === selectedPieceId
            const size = piece.layer === 'ground' ? HEX_SIZE * 1.7 : HEX_SIZE * 1.35
            return (
              <g key={piece.id} className={selected ? 'piece selected' : 'piece'}>
                {selected && (
                  <path
                    d={hexPath(x, y, HEX_SIZE - 1)}
                    className="piece-select-ring"
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
          {selectedAssetId && hoverHex && (
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
  const { x, y } = axialToPixel(q, r)
  const size = asset.category === 'tiles' ? HEX_SIZE * 1.7 : HEX_SIZE * 1.35
  return (
    <g className="ghost" opacity={0.55}>
      <path d={hexPath(x, y, HEX_SIZE - 1)} className="ghost-hex" />
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
