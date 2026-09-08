import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadAssetsFromManifest } from './assets'
import { HexBoard } from './components/HexBoard'
import { Sidebar } from './components/Sidebar'
import type { AssetCategory, AssetDef, HexCoord, PlacedPiece } from './types'
import { layerForCategory } from './types'
import './App.css'

let nextPieceId = 1

function App() {
  const [assets, setAssets] = useState<AssetDef[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [category, setCategory] = useState<AssetCategory>('tiles')
  const [search, setSearch] = useState('')
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [pieces, setPieces] = useState<PlacedPiece[]>([])
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null)
  const [hoverHex, setHoverHex] = useState<HexCoord | null>(null)

  useEffect(() => {
    loadAssetsFromManifest()
      .then(setAssets)
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : String(err))
      })
  }, [])

  const assetsById = useMemo(() => {
    const m = new Map<string, AssetDef>()
    for (const a of assets) m.set(a.id, a)
    return m
  }, [assets])

  const placeAsset = useCallback(
    (assetId: string, q: number, r: number) => {
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
    [assetsById],
  )

  const onPlaceAt = useCallback(
    (q: number, r: number) => {
      if (!selectedAssetId) return
      placeAsset(selectedAssetId, q, r)
    },
    [selectedAssetId, placeAsset],
  )

  const onMovePiece = useCallback((id: string, q: number, r: number) => {
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
  }, [])

  const onSelectPiece = useCallback((id: string | null) => {
    setSelectedPieceId(id)
    if (id) setSelectedAssetId(null)
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

  return (
    <div className="app">
      <Sidebar
        assets={assets}
        category={category}
        search={search}
        selectedAssetId={selectedAssetId}
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
        <HexBoard
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
