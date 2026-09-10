# Open Kit Board

Digital square checkerboard game board for Open Kit D&D-style PNG assets.

MVP: **Shoulder** is a private floating chat (per browser client). When **Ollama** is reachable (default model `qwen3-coder:30b`, tools-capable), it answers from the active rules pack and — for DM/solo — calls board tools (`search_assets`, `place_pieces`, etc.) so natural language like “camp and 5 goblins” places real kit assets. The browser talks to `/ollama` → room server → `127.0.0.1:11434` (set `OPENKIT_OLLAMA_URL` to override). If Ollama is off or offline, Shoulder falls back to the extractive local helper + hard-coded place planner. Players get rules Q&A only (no place tools). No paid API.

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

# Terminal B — Vite client (proxies /ws, /kit, /ollama → :3001)
npm run dev
```

Ollama Shoulder needs both processes (same as live kit). Ensure Ollama is running locally with a tools-capable model (default `qwen3-coder:30b`).

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
Open Kit Board does **not** republish third-party rulebooks.

- **Load Kit Sparks sample** — one-click ships our original CC0 micro-rules (`public/samples/kit-sparks.md`: Fight/Sneak/Grit, Armor, HP, Fighter & Rogue). Sets title **Kit Sparks**, license/credit **CC0 1.0** / Open Kit sample, affirms rights for this shipped sample, attaches to the table, and opens the folio.
- Fields (custom import): title, body, optional note/credit, required rights acknowledgment (license stays on the data model as optional `"private session"` — not collected in import UX)
- Solo: active pack in browser `localStorage` (works offline)
- Sidebar **Rules folio** panel for all roles (title, optional license badge, note/credit)
- **Open folio** opens a floating draggable window with the full scrollable pack body
- Multiplayer: DM attaches/replaces/clears the room pack; it syncs over WebSocket; players are read-only
- Late joiners receive the current room pack in `joined` / `state`

Optional testing tip (link only — do not commit third-party bodies):
[Lasers & Feelings](https://johnharper.itch.io/lasers-feelings) (CC BY 4.0).


## Piece visual transforms

Selected pieces show **rotate / corner / edge** handles on the board. The floating
index card also has numeric rotation, scale X/Y, offset X/Y (in cell units), and a
**Lock to cell** checkbox.

- **Lock on (default):** piece stays owned by its home cell; drag the body to nudge
  the image; pull edge/corner handles to stretch so roads/gates meet neighbors.
  Hold **Shift** while dragging the body to re-home to another cell.
- **Lock off:** body-drag moves the home cell (classic); offset/scale/rotation still persist.
- Rotate handle snaps to 15°; hold **Shift** for free angle.
- Corner scale is uniform by default; **Shift** for non-uniform.
- Transforms sync over multiplayer (`update` WS message; server stores fields opaquely).
- Camera pan/zoom unchanged: scroll zoom, empty-board drag, Alt/middle/right pan.

## Piece sheet + pin library

Select a placed piece to open a floating **index card** window over the table
(display name, notes, optional freeform stats blob — no baked D&D columns). Drag by
the title bar; multiple sheets can be open at once.

- **Pin / Save** writes to browser `localStorage`, keyed by `assetId` so notes stick across boards
- **Pinned library** opens as a floating window (thumb + title); open to edit; **Place** selects that asset for the board when allowed
- Selecting a board piece whose asset is pinned prefills the sheet from the library
- Library stays **local to this browser** — not synced over WebSocket (yet)

## Presence

- **Table well:** square checkerboard sits in a recessed felt well on a wood table object (drop shadow + rim); ~2× larger and pushed high on large screens (thin status strip only), with a bottom band for floating cards
- **Room shell:** original CSS hobby-room backdrop (warm wall / soft shelves / lamp + window glow — not a Demeo clone)
- Heavy vignette keeps focus on the table
- Toggle **Room / Dim room / Void** (persists in `localStorage`)
- **Material tray:** sidebar restyled as a wood-edged felt piece tray; **Assets** / **Pinned** open floating browse windows (filters + palette stay out of the permanent tray); rooms, rules folio, radius unchanged
- **Floating folios:** piece sheets + rules pack body open as draggable windows over the play area
- **Camera:** flat **top-down only** (Close / tilt presets removed); pan + **mouse-wheel zoom**; min zoom fits the **entire** board (including radius 40); table scale keeps the board top visible under browser chrome
- **Foley + ambience:** place/move/delete one-shots + low room tone (mute persists); room tone crossfades slightly closer when zoomed in
- **Establishing moment:** first load eases ~1.2s from room overview → table well; skipped on repeat visits (`localStorage`); **New board** clears the solo board and replays the arrival (respects reduced-motion)
- **Seat pads:** four decorative empty seat mats around the table rim (silhouettes/tokens); local near seat marked **You** — no networking
- **Selected token:** soft contact shadow under the selected piece

## What works

- **Presence:** table well + room/dim/void backdrop + material piece tray + top-down framing + foley/ambience + establishing arrival + decorative seat pads + selected contact shadow
- **Multiplayer rooms:** Host/Join with short code; DM + players sync mapRadius + pieces over WebSocket
- **Rules pack:** Paste/upload .txt/.md/.pdf + rights checkbox (private folio; no required license field); PDF → text client-side; solo localStorage; DM syncs room pack to players (read-only)
- **Piece sheet / pin library:** Select piece → index-card notes + freeform stats; pin by assetId in localStorage; **Pinned** floating window list/edit/place (local only, no WS)
- **DM filters:** theme (Fantasy / Fae / Heaven / Hell / Extraplanar) + level band + category tabs + name search
- **Assets:** live Open Kit `passed/` via room server (`OPENKIT_KIT_PATH`), else curated demo pack (~18) under `public/assets/demo/`
- **Shoulder:** tray button → floating local helper (rules Q&A + DM/solo “put a fae well and 3 imps around it” place/arrange; optional selected piece notes; piece-library stats when DM names HP ranges)
- Square checkerboard grid (`q`,`r` = column/row) with pan + scroll zoom (top-down); zoom-out fits the whole map
- **Assets** floating window: categories (Tiles | Props | Tokens | Monsters), theme/level filters, name search, thumbnail palette
- Drag an asset onto a cell, or click an asset then click a cell
- Select placed pieces, drag to move; Delete / Backspace removes
- Tiles render as a ground layer under props / tokens / monsters
- Offline sample PNGs under public/assets/samples/ plus manifest.json
- DM can set board radius (3–40) → `(2r+1)²` cells; large maps warn about performance

## Demo assets

Filenames use Open Kit-style prefixes (tile-, prop-, token-, monster-).
The loader reads `public/assets/manifest.json` (tags: themes + level bands).

Included demo pack (~18): fae grove tiles/props/tokens; heaven goldvein + lantern + acolyte;
hell magma/grate + altar + imp/legionnaire; extraplanar dream mist/door/dreamwalker.

## Open Kit live assets (auto-load)

The room server can **scan your Open Kit `passed/` folder** and serve PNGs live —
new Ink drops show up after **Refresh** in the Assets window (no hand-edited mega-manifest,
and the ~963 binaries are **not** committed to git).

Default kit path (Windows):

`G:\Game Dev Studio\projects\OpenKit\2d\dnd\passed`

Override with env `OPENKIT_KIT_PATH` if yours differs.

```bash
# Terminal A — room server (also serves /kit/manifest + /kit/files/*)
# Optional: setx OPENKIT_KIT_PATH "D:\path\to\passed"
npm run server

# Terminal B — Vite (proxies /kit → :3001)
npm run dev
```

- With server + kit path: Assets shows **Open Kit live (N)** (~963 including goblins).
- Without server/kit: Assets falls back to the curated **Demo pack** under `public/assets/`.
- Soft **Refresh** in the Assets tray re-fetches the manifest (picks up new PNGs).

Endpoints: `GET /kit/manifest`, `GET /kit/files/:file` (path-safe). Categories follow
filename prefixes (`tile-` / `prop-` / `token-` / `monster-`); theme tags are heuristic
from name keywords (fae, hell, heaven, dream/void, else fantasy).


## Grid coordinates

Classic D&D **square checkerboard** (not hex). Open Kit PNG tiles are rectangular, so path/gate art meets edge-to-edge on squares.

- Piece / WS fields `q` and `r` mean **column** and **row** (square axes). Keeping these names avoids breaking the room protocol.
- Board **radius** `N` is half-span from center: the map is `(2N+1)×(2N+1)` cells centered on `(0,0)`.
- Subtle alternating cell tint marks the checkers pattern.
- Wheel zoom-out is clamped to a **fit-to-view** floor so every cell stays visible (including radius 40).

## Controls

| Action | How |
|--------|-----|
| Place | Drag from palette onto a cell, or click asset then click cell |
| Select piece | Click piece on board |
| Move | Drag piece to another cell |
| Delete | Select piece, press Delete or Backspace |
| Clear selection | Escape |
| Pan | Drag empty board (or Alt / middle / right drag) |
| Zoom | Mouse wheel |

## Stack

Vite + React + TypeScript client; small Node `ws` room server in `server/`. Square grid math (`q`,`r` column/row; radius N → `(2N+1)²`). SVG board.

## License / assets

Sample PNGs are generated placeholders for local demo use.
Replace them with your own Open Kit exports when ready.
