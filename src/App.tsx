import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadAssetsPreferKit, type AssetLoadSource } from './assets'
import { HexBoard } from './components/HexBoard'
import { RoomPanel } from './components/RoomPanel'
import { PresenceToggle } from './components/PresenceToggle'
import { MuteToggle } from './components/MuteToggle'
import { NewBoardButton } from './components/NewBoardButton'
import { SeatPads } from './components/SeatPads'
import { RoomBackdrop } from './components/RoomBackdrop'
import { RulesPackPanel } from './components/RulesPackPanel'
import { PieceSheetPanel } from './components/PieceSheetPanel'
import { LibraryTray } from './components/LibraryTray'
import { AssetBrowserPanel } from './components/AssetBrowserPanel'
import { FloatingWindow } from './components/FloatingWindow'
import { RulesFolioWindow } from './components/RulesFolioWindow'
import { AiPanel } from './components/AiPanel'
import { Sidebar } from './components/Sidebar'
import { generateSquareMap, cellKey, squareCount } from './hex'
import type { Role } from './multiplayer/protocol'
import {
  canChangeRadius,
  canControlPiece,
  canPlaceCategory,
  useRoom,
} from './multiplayer/useRoom'
import type { RulesPack } from './rulesPack'
import { loadActiveRulesPack, saveActiveRulesPack } from './rulesPack'
import type { PieceLibraryMap } from './pieceLibrary'
import {
  getLibraryEntry,
  loadPieceLibrary,
  removeLibraryEntry,
  upsertLibraryEntry,
} from './pieceLibrary'
import type { ShoulderPieceContext } from './shoulderLocalHelper'
import type {
  ShoulderLibraryPatch,
  ShoulderPlaceAction,
} from './shoulderPlace'
import type { RoomMode } from './roomShell'
import { loadRoomMode, saveRoomMode } from './roomShell'
import { BOARD_SCALE, DEFAULT_HEX_ZOOM } from './cameraViews'
import { boardAudio, loadMuted } from './boardAudio'
import {
  ESTABLISHING_MS,
  markEstablishingShotSeen,
  shouldPlayEstablishingShot,
} from './establishingShot'
import type { AssetCategory, AssetDef, AssetTheme, HexCoord, LevelBand, PieceUpdatePatch, PlacedPiece } from './types'
import { hasPieceSheet } from './types'
import { DEFAULT_PIECE_TRANSFORM, layerForCategory } from './types'
import './App.css'

let nextPieceId = 1

const DEFAULT_RADIUS = 8
const MIN_RADIUS = 3
const MAX_RADIUS = 40

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
  const [assetSource, setAssetSource] = useState<AssetLoadSource>('demo')
  const [assetRefreshing, setAssetRefreshing] = useState(false)
  const [category, setCategory] = useState<AssetCategory>('tiles')
  const [theme, setTheme] = useState<AssetTheme | 'all'>('all')
  const [level, setLevel] = useState<LevelBand | 'all'>('all')
  const [search, setSearch] = useState('')
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [localPieces, setLocalPieces] = useState<PlacedPiece[]>([])
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null)
  /** Open floating piece sheets (asset ids). Multiple OK. */
  const [openSheetIds, setOpenSheetIds] = useState<string[]>([])
  /** Z-order focus counter for floating windows. */
  const floatZRef = useRef(20)
  const [sheetZ, setSheetZ] = useState<Record<string, number>>({})
  const [rulesFolioOpen, setRulesFolioOpen] = useState(false)
  const [rulesFolioZ, setRulesFolioZ] = useState(20)
  const [pieceLibrary, setPieceLibrary] = useState<PieceLibraryMap>(() =>
    loadPieceLibrary(),
  )
  const [hoverHex, setHoverHex] = useState<HexCoord | null>(null)
  const [localRadius, setLocalRadius] = useState(DEFAULT_RADIUS)
  const [urlJoin] = useState(() => parseRoomFromUrl())
  const [activeRulesPack, setActiveRulesPack] = useState<RulesPack | null>(() =>
    loadActiveRulesPack(),
  )
  const [roomMode, setRoomMode] = useState<RoomMode>(() => loadRoomMode())
  const [muted, setMuted] = useState(() => loadMuted())
  const [hexZoom, setHexZoom] = useState(() => DEFAULT_HEX_ZOOM)
  const [assetsBrowseOpen, setAssetsBrowseOpen] = useState(false)
  const [assetsBrowseZ, setAssetsBrowseZ] = useState(20)
  const [pinnedBrowseOpen, setPinnedBrowseOpen] = useState(false)
  const [pinnedBrowseZ, setPinnedBrowseZ] = useState(20)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiZ, setAiZ] = useState(20)
  /** Bite 6: room overview → table well on first load / New board. */
  const [establishingPhase, setEstablishingPhase] = useState<
    'overview' | 'arriving' | 'settled'
  >(() => (shouldPlayEstablishingShot() ? 'overview' : 'settled'))
  const [establishingShot, setEstablishingShot] = useState(() => ({
    id: 0,
    active: shouldPlayEstablishingShot(),
  }))

  useEffect(() => {
    boardAudio.init()
  }, [])

  useEffect(() => {
    boardAudio.syncFromZoom(hexZoom)
  }, [hexZoom])

  const onRoomModeChange = useCallback((mode: RoomMode) => {
    setRoomMode(mode)
    saveRoomMode(mode)
  }, [])

  const onMuteChange = useCallback((next: boolean) => {
    setMuted(next)
    boardAudio.setMuted(next)
  }, [])

  const onHexZoomChange = useCallback((z: number) => {
    setHexZoom(z)
  }, [])

  // Paint overview, then ease into the table well. Deps are shot id/active only
  // so flipping phase to "arriving" does not cancel the settle timeout.
  useEffect(() => {
    if (!establishingShot.active) return
    let cancelled = false
    let timeoutId: number | undefined
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return
        setEstablishingPhase('arriving')
        timeoutId = window.setTimeout(() => {
          if (cancelled) return
          markEstablishingShotSeen()
          setEstablishingPhase('settled')
          setEstablishingShot((s) =>
            s.id === establishingShot.id ? { ...s, active: false } : s,
          )
        }, ESTABLISHING_MS)
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf1)
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [establishingShot.id, establishingShot.active])

  const room = useRoom(urlJoin)

  const inRoom = room.inRoom
  const pieces = inRoom && room.remoteState ? room.remoteState.pieces : localPieces
  const mapRadius =
    inRoom && room.remoteState ? room.remoteState.mapRadius : localRadius

  const onNewBoard = useCallback(() => {
    if (inRoom) return
    setLocalPieces([])
    setSelectedPieceId(null)
    setSelectedAssetId(null)
    setOpenSheetIds([])
    setRulesFolioOpen(false)
    setAssetsBrowseOpen(false)
    setPinnedBrowseOpen(false)
    setAiOpen(false)
    setLocalRadius(DEFAULT_RADIUS)
    setHoverHex(null)
    if (!shouldPlayEstablishingShot(true)) {
      setEstablishingPhase('settled')
      setEstablishingShot((s) => ({ id: s.id + 1, active: false }))
      return
    }
    setEstablishingPhase('overview')
    setEstablishingShot((s) => ({ id: s.id + 1, active: true }))
  }, [inRoom])

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

  const refreshAssets = useCallback(() => {
    setAssetRefreshing(true)
    loadAssetsPreferKit()
      .then((result) => {
        setAssets(result.assets)
        setAssetSource(result.source)
        setLoadError(null)
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setAssetRefreshing(false))
  }, [])

  useEffect(() => {
    refreshAssets()
  }, [refreshAssets])

  // Drop pieces outside the map when radius shrinks (solo only; server handles room)
  useEffect(() => {
    if (inRoom) {
      setHoverHex(null)
      return
    }
    const valid = new Set(
      generateSquareMap(mapRadius).map((c) => cellKey(c.q, c.r)),
    )
    setLocalPieces((prev) => {
      const next = prev.filter((p) => valid.has(cellKey(p.q, p.r)))
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
    return new Set(generateSquareMap(mapRadius).map((c) => cellKey(c.q, c.r)))
  }, [mapRadius])

  const placeAsset = useCallback(
    (assetId: string, q: number, r: number) => {
      if (!validKeys.has(cellKey(q, r))) return
      const asset = assetsById.get(assetId)
      if (!asset) return
      if (!canPlaceCategory(room.role, inRoom, asset.category)) return

      boardAudio.playPlace()

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
          ...DEFAULT_PIECE_TRANSFORM,
          editUnlocked: false,
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
      if (!validKeys.has(cellKey(q, r))) return
      placeAsset(selectedAssetId, q, r)
    },
    [selectedAssetId, placeAsset, validKeys],
  )

  const onMovePiece = useCallback(
    (id: string, q: number, r: number) => {
      if (!validKeys.has(cellKey(q, r))) return
      const moving = pieces.find((p) => p.id === id)
      if (!canControlPiece(room.role, inRoom, room.clientId, moving)) return
      if (moving && moving.q === q && moving.r === r) return

      boardAudio.playMove()

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

  const onUpdatePiece = useCallback(
    (id: string, patch: PieceUpdatePatch) => {
      const target = pieces.find((p) => p.id === id)
      if (!canControlPiece(room.role, inRoom, room.clientId, target)) return

      if (inRoom) {
        room.updatePiece(id, patch)
        return
      }

      setLocalPieces((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      )
    },
    [pieces, inRoom, room],
  )

  const focusSheet = useCallback((assetId: string) => {
    floatZRef.current += 1
    const next = floatZRef.current
    setSheetZ((m) => ({ ...m, [assetId]: next }))
  }, [])

  const openPieceSheet = useCallback(
    (assetId: string) => {
      setOpenSheetIds((prev) =>
        prev.includes(assetId) ? prev : [...prev, assetId],
      )
      focusSheet(assetId)
    },
    [focusSheet],
  )

  const closePieceSheet = useCallback((assetId: string) => {
    setOpenSheetIds((prev) => prev.filter((id) => id !== assetId))
  }, [])

  const onSelectPiece = useCallback(
    (id: string | null) => {
      setSelectedPieceId(id)
      if (id) {
        setSelectedAssetId(null)
        const piece = pieces.find((p) => p.id === id)
        if (piece) openPieceSheet(piece.assetId)
      }
    },
    [pieces, openPieceSheet],
  )

  const onPinLibraryEntry = useCallback(
    (entry: {
      assetId: string
      displayName: string
      notes: string
      statsBlob: string
      thumbSrc?: string
    }) => {
      setPieceLibrary((prev) => upsertLibraryEntry(prev, entry))
    },
    [],
  )

  const onUnpinLibraryEntry = useCallback((assetId: string) => {
    setPieceLibrary((prev) => removeLibraryEntry(prev, assetId))
  }, [])

  const onOpenLibrarySheet = useCallback(
    (assetId: string) => {
      openPieceSheet(assetId)
      setSelectedPieceId(null)
      setSelectedAssetId(null)
    },
    [openPieceSheet],
  )

  const onPlaceFromLibrary = useCallback(
    (assetId: string) => {
      const asset = assetsById.get(assetId)
      if (!asset) return
      if (!canPlaceCategory(room.role, inRoom, asset.category)) return
      setCategory(asset.category)
      setSelectedAssetId(assetId)
      setSelectedPieceId(null)
      // Keep sheet open so notes stay visible while placing.
    },
    [assetsById, inRoom, room.role],
  )

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
        boardAudio.playDelete()
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

  const cellCount = squareCount(mapRadius)
  const radiusEditable = canChangeRadius(room.role, inRoom)

  // Solo: localStorage. In a room: DM pushes to room state; players see remote pack.
  const displayRulesPack =
    inRoom && room.remoteState
      ? (room.remoteState.rulesPack ?? null)
      : activeRulesPack
  const rulesReadOnly = inRoom && room.role !== 'dm'

  // Optional Shoulder context: prefer room-synced piece sheet, else library.
  const shoulderPieceContext: ShoulderPieceContext | null = (() => {
    if (!selectedPieceId) return null
    const piece = pieces.find((p) => p.id === selectedPieceId)
    if (!piece) return null
    const entry = getLibraryEntry(pieceLibrary, piece.assetId)
    const asset = assetsById.get(piece.assetId)
    const fromPiece = hasPieceSheet(piece)
    const displayName =
      (fromPiece && piece.displayName?.trim()) ||
      entry?.displayName ||
      asset?.name ||
      piece.assetId
    const notes = fromPiece
      ? piece.notes?.trim() || ''
      : entry?.notes?.trim() || ''
    const statsParts = fromPiece
      ? [
          piece.sheetRole ? `Role: ${piece.sheetRole}` : '',
          piece.hp != null
            ? `HP: ${piece.hp}${piece.maxHp != null ? '/' + piece.maxHp : ''}`
            : '',
          piece.armor != null ? `Armor: ${piece.armor}` : '',
          piece.defeated ? 'Defeated' : '',
          piece.statsBlob?.trim() || '',
        ].filter(Boolean)
      : []
    const statsBlob = fromPiece
      ? statsParts.join('\n')
      : entry?.statsBlob?.trim() || ''
    if (!notes && !statsBlob) {
      return { displayName, notes: '', statsBlob: '' }
    }
    return { displayName, notes, statsBlob }
  })()

  const onAttachRulesPack = useCallback(
    (pack: RulesPack) => {
      // Keep a personal local copy so solo offline still works after leave.
      setActiveRulesPack(pack)
      saveActiveRulesPack(pack)
      if (inRoom && room.role === 'dm') {
        room.setRulesPack(pack)
      }
      // Land on the readable book after Lay on table (Open folio).
      setRulesFolioOpen(true)
      floatZRef.current += 1
      setRulesFolioZ(floatZRef.current)
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

  const canPlaceFromChat = !inRoom || room.role === 'dm'

  const onShoulderPlaceActions = useCallback(
    (actions: ShoulderPlaceAction[]) => {
      for (const a of actions) {
        placeAsset(a.assetId, a.q, a.r)
      }
    },
    [placeAsset],
  )

  const onShoulderLibraryPatches = useCallback(
    (patches: ShoulderLibraryPatch[]) => {
      setPieceLibrary((prev) => {
        let next = prev
        for (const p of patches) {
          const existing = getLibraryEntry(next, p.assetId)
          const asset = assetsById.get(p.assetId)
          next = upsertLibraryEntry(next, {
            assetId: p.assetId,
            displayName:
              p.displayName ||
              existing?.displayName ||
              asset?.name ||
              p.assetId,
            notes:
              p.notes !== undefined
                ? p.notes
                : (existing?.notes ?? ''),
            statsBlob:
              p.statsBlob !== undefined
                ? p.statsBlob
                : (existing?.statsBlob ?? ''),
            thumbSrc:
              p.thumbSrc ||
              existing?.thumbSrc ||
              asset?.src,
          })
        }
        return next
      })
    },
    [assetsById],
  )

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
        mapRadius={mapRadius}
        radiusEditable={radiusEditable}
        inRoom={inRoom}
        roleLabel={inRoom ? room.role : null}
        onMapRadiusChange={onMapRadiusChange}
        assetsOpen={assetsBrowseOpen}
        pinnedOpen={pinnedBrowseOpen}
        aiOpen={aiOpen}
        pinnedCount={Object.keys(pieceLibrary).length}
        onOpenAssets={() => {
          setAssetsBrowseOpen(true)
          floatZRef.current += 1
          setAssetsBrowseZ(floatZRef.current)
        }}
        onOpenPinned={() => {
          setPinnedBrowseOpen(true)
          floatZRef.current += 1
          setPinnedBrowseZ(floatZRef.current)
        }}
        onOpenAi={() => {
          setAiOpen(true)
          floatZRef.current += 1
          setAiZ(floatZRef.current)
        }}
        placementHint={
          selectedAssetId
            ? 'Click a cell to place. Esc to clear.'
            : 'Open Assets or Pinned to browse — drag onto a cell, or click then cell.'
        }
        controlHint={
          inRoom && room.role === 'player'
            ? 'Move/delete only your tokens · Del removes · Select opens floating sheet'
            : 'Select piece → floating sheet · Del removes · Pin notes locally'
        }
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
            folioOpen={rulesFolioOpen}
            onOpenFolio={() => {
              if (!displayRulesPack) return
              setRulesFolioOpen(true)
              floatZRef.current += 1
              setRulesFolioZ(floatZRef.current)
            }}
            onAttach={onAttachRulesPack}
            onClear={() => {
              setRulesFolioOpen(false)
              onClearRulesPack()
            }}
          />
        }
      />
      <main className={`main room-mode-${roomMode}`}>
        {roomMode !== 'void' && <RoomBackdrop />}
        <div className="room-vignette" aria-hidden="true" />
        <PresenceToggle mode={roomMode} onChange={onRoomModeChange} />
        <MuteToggle muted={muted} onChange={onMuteChange} />
        <NewBoardButton
          disabled={inRoom || establishingPhase !== 'settled'}
          onClick={onNewBoard}
        />
        {loadError && (
          <div className="banner error">Failed to load assets: {loadError}</div>
        )}
        {!loadError && assets.length === 0 && (
          <div className="banner">Loading demo assets…</div>
        )}
        {/* Soft solo: no red WebSocket banner for idle / brief flaps. */}
        {mapRadius >= 25 && (
          <div className="banner warn strong">
            Very large board (radius {mapRadius}, ~{cellCount} cells) — expect
            heavy lag. Prefer radius under 15 for play, especially camp scenes.
          </div>
        )}
        {mapRadius >= 15 && mapRadius < 25 && (
          <div className="banner warn">
            Large boards can slow the browser — use a smaller size for camp
            scenes.
          </div>
        )}
        <div
          className={`table-stage view-top${
            establishingPhase !== 'settled' ? ' is-establishing' : ''
          }`}
        >
          <div className={`establishing-lens phase-${establishingPhase}`}>
            <div
              className="table-object view-top"
              aria-label="Game table"
              style={{
                // Top-down only — scale ≤1 so board top stays under browser chrome
                transform: `scale(${BOARD_SCALE})`,
              }}
            >
              <SeatPads />
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
                  onUpdatePiece={onUpdatePiece}
                  onDropAsset={placeAsset}
                  onZoomChange={onHexZoomChange}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="floating-layer" aria-label="Floating folios">
          {openSheetIds.map((assetId, i) => {
            const entry = getLibraryEntry(pieceLibrary, assetId)
            const asset = assetsById.get(assetId) ?? null
            const selectedPlaced =
              selectedPieceId
                ? (pieces.find(
                    (p) =>
                      p.id === selectedPieceId && p.assetId === assetId,
                  ) ?? null)
                : null
            const title =
              selectedPlaced?.displayName ||
              entry?.displayName ||
              asset?.name ||
              'Index card'
            const canEdit =
              !!selectedPlaced &&
              canControlPiece(
                room.role,
                inRoom,
                room.clientId,
                selectedPlaced,
              )
            return (
              <FloatingWindow
                key={assetId}
                title={title}
                ariaLabel={`Piece sheet: ${title}`}
                className="floating-piece-sheet"
                initialX={48 + (i % 4) * 36}
                initialY={56 + (i % 4) * 28}
                width={360}
                maxHeight={660}
                zIndex={sheetZ[assetId] ?? 20 + i}
                onFocus={() => focusSheet(assetId)}
                onClose={() => closePieceSheet(assetId)}
              >
                <PieceSheetPanel
                  assetId={assetId}
                  asset={asset}
                  libraryEntry={entry}
                  placedPiece={selectedPlaced}
                  canEditTransform={canEdit}
                  onTransformChange={
                    selectedPlaced
                      ? (patch) => onUpdatePiece(selectedPlaced.id, patch)
                      : undefined
                  }
                  onPin={onPinLibraryEntry}
                  onUnpin={onUnpinLibraryEntry}
                  onClose={() => closePieceSheet(assetId)}
                  floating
                />
              </FloatingWindow>
            )
          })}
          {rulesFolioOpen && displayRulesPack && (
            <FloatingWindow
              title={displayRulesPack.title || 'Rules folio'}
              ariaLabel="Rules folio"
              className="floating-rules-folio"
              initialX={420}
              initialY={48}
              width={420}
              maxHeight={640}
              zIndex={rulesFolioZ}
              onFocus={() => {
                floatZRef.current += 1
                setRulesFolioZ(floatZRef.current)
              }}
              onClose={() => setRulesFolioOpen(false)}
            >
              <RulesFolioWindow pack={displayRulesPack} />
            </FloatingWindow>
          )}
          {assetsBrowseOpen && (
            <FloatingWindow
              title="Assets"
              ariaLabel="Asset browser"
              className="floating-assets-browse"
              initialX={56}
              initialY={40}
              width={380}
              maxHeight={680}
              zIndex={assetsBrowseZ}
              onFocus={() => {
                floatZRef.current += 1
                setAssetsBrowseZ(floatZRef.current)
              }}
              onClose={() => setAssetsBrowseOpen(false)}
            >
              <AssetBrowserPanel
                assets={assets}
                category={category}
                theme={theme}
                level={level}
                search={search}
                selectedAssetId={selectedAssetId}
                role={inRoom ? room.role : null}
                inRoom={inRoom}
                assetSource={assetSource}
                assetRefreshing={assetRefreshing}
                onRefreshAssets={refreshAssets}
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
              />
            </FloatingWindow>
          )}
          {pinnedBrowseOpen && (
            <FloatingWindow
              title="Pinned"
              ariaLabel="Pinned piece library"
              className="floating-pinned-browse"
              initialX={120}
              initialY={72}
              width={360}
              maxHeight={560}
              zIndex={pinnedBrowseZ}
              onFocus={() => {
                floatZRef.current += 1
                setPinnedBrowseZ(floatZRef.current)
              }}
              onClose={() => setPinnedBrowseOpen(false)}
            >
              <LibraryTray
                library={pieceLibrary}
                assetsById={assetsById}
                role={inRoom ? room.role : null}
                inRoom={inRoom}
                onOpenSheet={onOpenLibrarySheet}
                onPlace={onPlaceFromLibrary}
              />
            </FloatingWindow>
          )}
          {aiOpen && (
            <FloatingWindow
              title="AI"
              ariaLabel="AI panel — Shoulder, setup, and prompts"
              className="floating-ai"
              initialX={260}
              initialY={48}
              width={420}
              maxHeight={620}
              zIndex={aiZ}
              onFocus={() => {
                floatZRef.current += 1
                setAiZ(floatZRef.current)
              }}
              onClose={() => setAiOpen(false)}
            >
              <AiPanel
                pack={displayRulesPack}
                pieceContext={shoulderPieceContext}
                assets={assets}
                pieces={pieces}
                mapRadius={mapRadius}
                canPlaceFromChat={canPlaceFromChat}
                roomCode={inRoom ? room.roomCode : null}
                onPlaceActions={onShoulderPlaceActions}
                onLibraryPatches={onShoulderLibraryPatches}
                onUpdatePiece={onUpdatePiece}
                onMovePiece={onMovePiece}
              />
            </FloatingWindow>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
