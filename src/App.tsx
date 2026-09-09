import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadAssetsFromManifest } from './assets'
import { HexBoard } from './components/HexBoard'
import { RoomPanel } from './components/RoomPanel'
import { RulesPackPanel } from './components/RulesPackPanel'
import { Sidebar } from './components/Sidebar'
import { generateHexMap, hexKey } from './hex'
import type { Role } from './multiplayer/protocol'
import {
  canChangeRadius,
  canControlPiece,
  canPlaceCategory,
  useRoom,
} from './multiplayer/useRoom'
import type { RulesPack } from './rulesPack'
import { loadActiveRulesPack, saveActiveRulesPack } from './rulesPack'
import type { AssetCategory, AssetDef, AssetTheme, HexCoord, LevelBand, PlacedPiece } from './types'
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

function parseRoomFromUrl(): { code: string; role: Role } | null {
  const params = new URLSearchParams(window.location.search)
  const code = (params.get('room') || '').trim().toUpperCase()
  if (!code) return null
  const roleParam = (params.get('role') || 'player').toLowerCase()
  const role: Role = roleParam === 'dm' ? 'dm' : 'player'
  return { code, role }
}

function App() {
  const [assets, setAssets] = useState<AssetDef[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [category, setCategory] = useState<AssetCategory>('tiles')
  const [theme, setTheme] = useState<AssetTheme | 'all'>('all')
  const [level, setLevel] = useState<LevelBand | 'all'>('all')
  const [search, setSearch] = useState('')
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [localPieces, setLocalPieces] = useState<PlacedPiece[]>([])
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null)
  const [hoverHex, setHoverHex] = useState<HexCoord | null>(null)
  const [localRadius, setLocalRadius] = useState(DEFAULT_RADIUS)
  const [urlJoin] = useState(() => parseRoomFromUrl())
  const [activeRulesPack, setActiveRulesPack] = useState<RulesPack | null>(() =>
    loadActiveRulesPack(),
  )

  const room = useRoom(urlJoin)

  const inRoom = room.inRoom
  const pieces = inRoom && room.remoteState ? room.remoteState.pieces : localPieces
  const mapRadius =
    inRoom && room.remoteState ? room.remoteState.mapRadius : localRadius

  // Sync shareable URL when room changes
  useEffect(() => {
    const url = new URL(window.location.href)
    if (inRoom && room.roomCode) {
      url.searchParams.set('room', room.roomCode)
      url.searchParams.set('role', room.role ?? 'player')
      window.history.replaceState({}, '', url.toString())
    } else if (!urlJoin) {
      url.searchParams.delete('room')
      url.searchParams.delete('role')
      window.history.replaceState({}, '', url.toString())
    }
  }, [inRoom, room.roomCode, room.role, urlJoin])

  useEffect(() => {
    loadAssetsFromManifest()
      .then(setAssets)
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : String(err))
      })
  }, [])

  // Drop pieces outside the map when radius shrinks (solo only; server handles room)
  useEffect(() => {
    if (inRoom) {
      setHoverHex(null)
      return
    }
    const valid = new Set(
      generateHexMap(mapRadius).map((c) => hexKey(c.q, c.r)),
    )
    setLocalPieces((prev) => {
      const next = prev.filter((p) => valid.has(hexKey(p.q, p.r)))
      return next.length === prev.length ? prev : next
    })
    setHoverHex(null)
  }, [mapRadius, inRoom])

  useEffect(() => {
    if (!selectedPieceId) return
    if (!pieces.some((p) => p.id === selectedPieceId)) {
      setSelectedPieceId(null)
    }
  }, [pieces, selectedPieceId])

  // Players default to tokens tab
  useEffect(() => {
    if (inRoom && room.role === 'player' && category !== 'tokens') {
      setCategory('tokens')
      setSelectedAssetId(null)
    }
  }, [inRoom, room.role, category])

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
      if (!canPlaceCategory(room.role, inRoom, asset.category)) return

      if (inRoom) {
        room.place(assetId, q, r, asset.category)
        setSelectedPieceId(null)
        return
      }

      const layer = layerForCategory(asset.category)
      setLocalPieces((prev) => {
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
          category: asset.category,
        }
        return [...next, piece]
      })
      setSelectedPieceId(null)
    },
    [assetsById, validKeys, inRoom, room],
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
      const moving = pieces.find((p) => p.id === id)
      if (!canControlPiece(room.role, inRoom, room.clientId, moving)) return

      if (inRoom) {
        room.move(id, q, r)
        return
      }

      setLocalPieces((prev) => {
        const piece = prev.find((p) => p.id === id)
        if (!piece) return prev
        const rest = prev.filter(
          (p) =>
            p.id !== id &&
            !(p.q === q && p.r === r && p.layer === piece.layer),
        )
        return [...rest, { ...piece, q, r }]
      })
    },
    [validKeys, pieces, inRoom, room],
  )

  const onSelectPiece = useCallback((id: string | null) => {
    setSelectedPieceId(id)
    if (id) setSelectedAssetId(null)
  }, [])

  const onMapRadiusChange = useCallback(
    (n: number) => {
      if (!canChangeRadius(room.role, inRoom)) return
      const next = clampRadius(n)
      if (inRoom) {
        room.setRadius(next)
        return
      }
      setLocalRadius(next)
    },
    [inRoom, room],
  )

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
        const piece = pieces.find((p) => p.id === selectedPieceId)
        if (!canControlPiece(room.role, inRoom, room.clientId, piece)) return
        e.preventDefault()
        if (inRoom) {
          room.deletePiece(selectedPieceId)
        } else {
          setLocalPieces((prev) => prev.filter((p) => p.id !== selectedPieceId))
        }
        setSelectedPieceId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedPieceId, pieces, inRoom, room])

  const cellCount = hexCount(mapRadius)
  const radiusEditable = canChangeRadius(room.role, inRoom)

  // Solo: localStorage. In a room: DM pushes to room state; players see remote pack.
  const displayRulesPack =
    inRoom && room.remoteState
      ? (room.remoteState.rulesPack ?? null)
      : activeRulesPack
  const rulesReadOnly = inRoom && room.role !== 'dm'

  const onAttachRulesPack = useCallback(
    (pack: RulesPack) => {
      // Keep a personal local copy so solo offline still works after leave.
      setActiveRulesPack(pack)
      saveActiveRulesPack(pack)
      if (inRoom && room.role === 'dm') {
        room.setRulesPack(pack)
      }
    },
    [inRoom, room],
  )

  const onClearRulesPack = useCallback(() => {
    if (inRoom && room.role === 'dm') {
      room.setRulesPack(null)
      // Also clear personal solo pack when DM clears the room pack.
      setActiveRulesPack(null)
      saveActiveRulesPack(null)
      return
    }
    if (inRoom) return // players cannot clear
    setActiveRulesPack(null)
    saveActiveRulesPack(null)
  }, [inRoom, room])

  // Light Bite C: when DM hosts/joins a room with no pack yet, push their local active pack.
  const setRoomRulesPack = room.setRulesPack
  const roomRole = room.role
  const remoteRulesPack = room.remoteState?.rulesPack ?? null
  useEffect(() => {
    if (!inRoom || roomRole !== 'dm') return
    if (!activeRulesPack) return
    if (remoteRulesPack) return
    setRoomRulesPack(activeRulesPack)
  }, [inRoom, roomRole, remoteRulesPack, activeRulesPack, setRoomRulesPack])

  const handleLeave = () => {
    room.leave()
    const url = new URL(window.location.href)
    url.searchParams.delete('room')
    url.searchParams.delete('role')
    window.history.replaceState({}, '', url.toString())
  }

  return (
    <div className="app">
      <Sidebar
        assets={assets}
        category={category}
        theme={theme}
        level={level}
        search={search}
        selectedAssetId={selectedAssetId}
        mapRadius={mapRadius}
        radiusEditable={radiusEditable}
        role={inRoom ? room.role : null}
        inRoom={inRoom}
        onMapRadiusChange={onMapRadiusChange}
        onCategoryChange={(c) => {
          if (!canPlaceCategory(room.role, inRoom, c)) return
          setCategory(c)
          setSelectedAssetId(null)
        }}
        onThemeChange={(t) => {
          setTheme(t)
          setSelectedAssetId(null)
        }}
        onLevelChange={(l) => {
          setLevel(l)
          setSelectedAssetId(null)
        }}
        onSearchChange={setSearch}
        onSelectAsset={(id) => {
          if (id) {
            const a = assetsById.get(id)
            if (a && !canPlaceCategory(room.role, inRoom, a.category)) return
          }
          setSelectedAssetId(id)
          setSelectedPieceId(null)
        }}
        onDragStart={(asset) => {
          if (!canPlaceCategory(room.role, inRoom, asset.category)) return
          setSelectedPieceId(null)
        }}
        roomSlot={
          <RoomPanel
            status={room.status}
            roomCode={room.roomCode}
            role={room.role}
            peerCount={room.peerCount}
            lastError={room.lastError}
            onHost={room.host}
            onJoin={room.join}
            onLeave={handleLeave}
          />
        }
        rulesSlot={
          <RulesPackPanel
            pack={displayRulesPack}
            importedBy={room.clientId || 'local'}
            readOnly={rulesReadOnly}
            inRoom={inRoom}
            onAttach={onAttachRulesPack}
            onClear={onClearRulesPack}
          />
        }
      />
      <main className="main">
        {loadError && (
          <div className="banner error">Failed to load assets: {loadError}</div>
        )}
        {!loadError && assets.length === 0 && (
          <div className="banner">Loading demo assets…</div>
        )}
        {room.lastError && room.status === 'error' && (
          <div className="banner error">{room.lastError}</div>
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
        <div className="table-stage">
          <div className="table-object" aria-label="Game table">
            <div className="table-well">
              <HexBoard
                mapRadius={mapRadius}
                assetsById={assetsById}
                pieces={pieces}
                selectedPieceId={selectedPieceId}
                selectedAssetId={selectedAssetId}
                hoverHex={hoverHex}
                clientId={room.clientId}
                role={inRoom ? room.role : null}
                inRoom={inRoom}
                onHoverHex={setHoverHex}
                onPlaceAt={onPlaceAt}
                onSelectPiece={onSelectPiece}
                onMovePiece={onMovePiece}
                onDropAsset={placeAsset}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
