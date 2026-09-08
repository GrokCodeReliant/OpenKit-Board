import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadAssetsFromManifest } from './assets'
import { HexBoard } from './components/HexBoard'
import { Sidebar } from './components/Sidebar'
import { generateHexMap, hexKey } from './hex'
import type { AssetCategory, AssetDef, HexCoord, PlacedPiece } from './types'
import { layerForCategory } from './types'
import './App.css'

let nextPieceId = 1

const DEFAULT_RADIUS = 8
const MIN_RADIUS = 3
const MAX_RADIUS = 40

/** Hexagon cell count for axial radius r: 3*r*(r+1)+1 */
function hexCount(radius: number): number {
  return 3 * radius * (radius + 1) + 1
}

function clampRadius(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_RADIUS
  return Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, Math.round(n)))
}

function App() {
  const [assets, setAssets] = useState<AssetDef[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [category, setCategory] = useState<AssetCategory>('tiles')
  const [search, setSearch] = useState('')
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [pieces, setPieces] = useState<PlacedPiece[]>([])
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null)
  const [hoverHex, setHoverHex] = useState<HexCoord | null>(null)
  const [mapRadius, setMapRadius] = useState(DEFAULT_RADIUS)

  useEffect(() => {
    loadAssetsFromManifest()
      .then(setAssets)
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : String(err))
      })
  }, [])

  // Drop pieces outside the map when radius shrinks
  useEffect(() => {
    const valid = new Set(
      generateHexMap(mapRadius).map((c) => hexKey(c.q, c.r)),
    )
    setPieces((prev) => {
      const next = prev.filter((p) => valid.has(hexKey(p.q, p.r)))
      return next.length === prev.length ? prev : next
    })
    setHoverHex(null)
  }, [mapRadius])

  // Clear selection if selected piece no longer exists after clip
  useEffect(() => {
    if (!selectedPieceId) return
    if (!pieces.some((p) => p.id === selectedPieceId)) {
      setSelectedPieceId(null)
    }
  }, [pieces, selectedPieceId])

  const assetsById = useMemo(() => {
    const m = new Map<string, AssetDef>()
    for (const a of assets) m.set(a.id, a)
    return m
  }, [assets])

  const validKeys = useMemo(() => {
    return new Set(generateHexMap(mapRadius).map((c) => hexKey(c.q, c.r)))
  }, [mapRadius])

  const placeAsset = useCallback(
    (assetId: string, q: number, r: number) => {
      if (!validKeys.has(hexKey(q, r))) return
      const asset = assetsById.get(assetId)
      if (!asset) return
      const layer = layerForCategory(asset.category)

      setPieces((prev) => {
        let next = prev
        if (layer === 'ground') {
          next = prev.filter((p) => !(p.q === q && p.r === r && p.layer === 'ground'))
        } else {
          next = prev.filter((p) => !(p.q === q && p.r === r && p.layer === 'object'))
        }
        const piece: PlacedPiece = {
          id: `p${nextPieceId++}`,
          assetId,
          q,
          r,
          layer,
        }
        return [...next, piece]
      })
      setSelectedPieceId(null)
    },
    [assetsById, validKeys],
  )

  const onPlaceAt = useCallback(
    (q: number, r: number) => {
      if (!selectedAssetId) return
      if (!validKeys.has(hexKey(q, r))) return
      placeAsset(selectedAssetId, q, r)
    },
    [selectedAssetId, placeAsset, validKeys],
  )

  const onMovePiece = useCallback(
    (id: string, q: number, r: number) => {
      if (!validKeys.has(hexKey(q, r))) return
      setPieces((prev) => {
        const moving = prev.find((p) => p.id === id)
        if (!moving) return prev
        const rest = prev.filter(
          (p) =>
            p.id !== id &&
            !(p.q === q && p.r === r && p.layer === moving.layer),
        )
        return [...rest, { ...moving, q, r }]
      })
    },
    [validKeys],
  )

  const onSelectPiece = useCallback((id: string | null) => {
    setSelectedPieceId(id)
    if (id) setSelectedAssetId(null)
  }, [])

  const onMapRadiusChange = useCallback((n: number) => {
    setMapRadius(clampRadius(n))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedAssetId(null)
        setSelectedPieceId(null)
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        if (!selectedPieceId) return
        e.preventDefault()
        setPieces((prev) => prev.filter((p) => p.id !== selectedPieceId))
        setSelectedPieceId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedPieceId])

  const cellCount = hexCount(mapRadius)

  return (
    <div className="app">
      <Sidebar
        assets={assets}
        category={category}
        search={search}
        selectedAssetId={selectedAssetId}
        mapRadius={mapRadius}
        onMapRadiusChange={onMapRadiusChange}
        onCategoryChange={(c) => {
          setCategory(c)
          setSelectedAssetId(null)
        }}
        onSearchChange={setSearch}
        onSelectAsset={(id) => {
          setSelectedAssetId(id)
          setSelectedPieceId(null)
        }}
        onDragStart={() => setSelectedPieceId(null)}
      />
      <main className="main">
        {loadError && (
          <div className="banner error">Failed to load assets: {loadError}</div>
        )}
        {!loadError && assets.length === 0 && (
          <div className="banner">Loading sample assets…</div>
        )}
        {mapRadius >= 25 && (
          <div className="banner warn strong">
            Very large board (radius {mapRadius}, ~{cellCount} hexes) — expect
            heavy lag. Prefer radius under 15 for play, especially camp scenes.
          </div>
        )}
        {mapRadius >= 15 && mapRadius < 25 && (
          <div className="banner warn">
            Large boards can slow the browser — use a smaller size for camp
            scenes.
          </div>
        )}
        <HexBoard
          mapRadius={mapRadius}
          assetsById={assetsById}
          pieces={pieces}
          selectedPieceId={selectedPieceId}
          selectedAssetId={selectedAssetId}
          hoverHex={hoverHex}
          onHoverHex={setHoverHex}
          onPlaceAt={onPlaceAt}
          onSelectPiece={onSelectPiece}
          onMovePiece={onMovePiece}
          onDropAsset={placeAsset}
        />
      </main>
    </div>
  )
}

export default App
