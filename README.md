# Open Kit Board

Digital pointy-top hex game board for Open Kit D&D-style PNG assets.

MVP only: no AI. Ollama and paid LLM are future stretch and are NOT built.

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

Production:

```bash
npm run build
npm run preview
```


## Multiplayer rooms (MVP)

Live sync of board radius + placed pieces + DM rules pack over a small WebSocket server.
DM owns board/assets/terrain; players place/move/delete only their own tokens.
No auth, no DB — rooms live in server memory.

### Run locally (two terminals)

```bash
# Terminal A — room server (port 3001)
npm run server

# Terminal B — Vite client (proxies /ws → :3001)
npm run dev
```

Open http://localhost:5173 in two browser tabs:

1. Tab 1: click **Host room** → copy the shareable `?room=CODE&role=dm` URL (or note the code).
2. Tab 2: enter the room code and **Join** as Player (or open `?room=CODE&role=player`).
3. DM places a tile; player places a token and moves it; player cannot move the DM tile.

Solo offline mode is the default. The UI shows **Solo — Host a room for multiplayer**
until you Host/Join; brief WebSocket proxy flaps do not spam red errors. If you were
already in a room, the client reconnects quietly.

Optional: set `VITE_WS_URL` (e.g. `ws://localhost:3001`) to bypass the Vite proxy.

## Rules packs (Bite A–C)

Import **your own** rules text for the session — paste or upload `.txt` / `.md` / `.pdf` (PDF text is extracted in the browser; binary PDF is never synced).
Open Kit Board does **not** ship rulebooks or sample pack bodies in the repo.

- Fields: title, license (free text), body, required rights acknowledgment
- Solo: active pack in browser `localStorage` (works offline)
- Sidebar **Rules folio** panel for all roles (title, license, attribution)
- **Open folio** opens a floating draggable window with the full scrollable pack body
- Multiplayer: DM attaches/replaces/clears the room pack; it syncs over WebSocket; players are read-only
- Late joiners receive the current room pack in `joined` / `state`

For a short CC-licensed one-pager to paste yourself while testing, see
[Lasers & Feelings](https://johnharper.itch.io/lasers-feelings) (CC BY 4.0) — download/copy from the author; do not commit that text here.

## Piece sheet + pin library

Select a placed piece to open a floating **index card** window over the table
(display name, notes, optional freeform stats blob — no baked D&D columns). Drag by
the title bar; multiple sheets can be open at once.

- **Pin / Save** writes to browser `localStorage`, keyed by `assetId` so notes stick across boards
- **Pinned library** lists thumb + title; open to edit; **Place** selects that asset for the board when allowed
- Selecting a board piece whose asset is pinned prefills the sheet from the library
- Library stays **local to this browser** — not synced over WebSocket (yet)

## Presence

- **Table well:** hex board sits in a recessed felt well on a wood table object (drop shadow + rim); ~2× larger and top-biased on large screens, with a bottom band for floating cards
- **Room shell:** original CSS hobby-room backdrop (warm wall / soft shelves / lamp + window glow — not a Demeo clone)
- Heavy vignette keeps focus on the table
- Toggle **Room / Dim room / Void** (persists in `localStorage`)
- **Material tray:** sidebar restyled as a wood-edged felt piece tray with paper tabs/labels (categories, filters, rooms, rules folio, pin library, radius unchanged)
- **Floating folios:** piece sheets + rules pack body open as draggable windows over the play area
- **Camera:** flat top-down only — presets **Top-down (default) / Close** (zoom + table scale, no tilt); pan + wheel zoom kept; zoom/scale limits leave a strip of table rim in frame (persists in `localStorage`)
- **Foley + ambience:** place/move/delete one-shots + low room tone (mute persists); room tone crossfades slightly closer when zoomed in
- **Establishing moment:** first load eases ~1.2s from room overview → table well; skipped on repeat visits (`localStorage`); **New board** clears the solo board and replays the arrival (respects reduced-motion)
- **Seat pads:** four decorative empty seat mats around the table rim (silhouettes/tokens); local near seat marked **You** — no networking
- **Selected token:** soft contact shadow under the selected piece

## What works

- **Presence:** table well + room/dim/void backdrop + material piece tray + top-down zoom presets + foley/ambience + establishing arrival + decorative seat pads + selected contact shadow
- **Multiplayer rooms:** Host/Join with short code; DM + players sync mapRadius + pieces over WebSocket
- **Rules pack:** Paste/upload .txt/.md/.pdf + license + rights checkbox; PDF → text client-side; solo localStorage; DM syncs room pack to players (read-only)
- **Piece sheet / pin library:** Select piece → index-card notes + freeform stats; pin by assetId in localStorage; library tray list/edit/place (local only, no WS)
- **DM filters:** theme (Fantasy / Fae / Heaven / Hell / Extraplanar) + level band + category tabs + name search
- **Demo pack:** ~18 real Open Kit PNGs under `public/assets/demo/` (infrastructure smoke-test — no baked story, no AI)
- Pointy-top hex grid (axial coords) with pan + scroll zoom + top-down zoom presets
- Sidebar categories: Tiles | Props | Tokens | Monsters
- Filter assets by name; thumbnail palette
- Drag an asset onto a hex, or click an asset then click a hex
- Select placed pieces, drag to move; Delete / Backspace removes
- Tiles render as a ground layer under props / tokens / monsters
- Offline sample PNGs under public/assets/samples/ plus manifest.json
- DM can set board radius (3–40); large maps warn about performance

## Demo assets

Filenames use Open Kit-style prefixes (tile-, prop-, token-, monster-).
The loader reads `public/assets/manifest.json` (tags: themes + level bands).

Included demo pack (~18): fae grove tiles/props/tokens; heaven goldvein + lantern + acolyte;
hell magma/grate + altar + imp/legionnaire; extraplanar dream mist/door/dreamwalker.

## Pointing at a real Open Kit passed/ folder

1. Copy (or symlink) your Open Kit passed PNGs into public/assets/passed/,
   or serve that folder and update the manifest basePath.
2. Edit public/assets/manifest.json: set basePath (e.g. /assets/passed),
   list each file with id, name, category, and file.
   Categories follow prefixes (tile- to tiles, etc.).
3. Restart the dev server (or rebuild).

See categoryFromFilename() in src/assets.ts for prefix rules.

## Controls

| Action | How |
|--------|-----|
| Place | Drag from palette onto hex, or click asset then click hex |
| Select piece | Click piece on board |
| Move | Drag piece to another hex |
| Delete | Select piece, press Delete or Backspace |
| Clear selection | Escape |
| Pan | Drag empty board (or Alt / middle / right drag) |
| Zoom | Mouse wheel |

## Stack

Vite + React + TypeScript client; small Node `ws` room server in `server/`. Hex math is simple axial (pointy-top). SVG board.

## License / assets

Sample PNGs are generated placeholders for local demo use.
Replace them with your own Open Kit exports when ready.
