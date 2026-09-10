# Open Kit Board

Digital square checkerboard game board for Open Kit D&D-style PNG assets.

MVP: **Shoulder** is a private floating chat (per browser client). Choose **Ollama** (local) or **Grok (xAI)** in Shoulder Settings. With a tools-capable model it answers from the active rules pack and — for DM/solo — calls board tools (`search_assets`, `place_pieces`, etc.) so natural language like “camp and 5 goblins” places real kit assets. Ollama: browser → `/ollama` → Vite → `127.0.0.1:11434` (room server still proxies `/ollama` for non-Vite; `OPENKIT_OLLAMA_URL` overrides). Grok: browser → `/xai` → Vite → room server `:3001` → `https://api.x.ai/v1` (OpenAI-compatible tools; default model `grok-4.6`). Paste an xAI key in Settings (`localStorage` only) or set `XAI_API_KEY` / `GROK_API_KEY` on the server. If the selected LLM is off/unreachable, Shoulder uses the extractive local helper + hard-coded place planner; if an LLM chat call fails mid-session, it shows a clear error (rules-only Q&A optional) and does **not** place via the hard-coded planner. Players get rules Q&A only (no place tools).

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` (prefer localhost over `127.0.0.1` if host binding differs). For Ollama board tools, run Ollama locally; for Grok, set a key (Settings or server env) and keep `npm run server` up.

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

# Terminal B — Vite client (/ws + /kit + /xai → :3001; /ollama → 127.0.0.1:11434)
npm run dev
```

**Shoulder — Ollama:** run Ollama locally with a tools-capable model (default `llama3.1:8b`). Vite proxies `/ollama` straight to Ollama in dev.

**Shoulder — Grok (xAI):** keep the room server running (Vite proxies `/xai` → `:3001` → `api.x.ai`). Either:
1. Open Shoulder → **Settings** → choose **Grok (xAI)** → paste API key → Save (key stays in `localStorage` only; never commit it), model default `grok-4.6`; or
2. Export `XAI_API_KEY` or `GROK_API_KEY` before `npm run server` (server attaches Bearer; client key optional).

Banner shows `Grok · grok-4.6` when Grok is selected and a key is available. Room server is still required for multiplayer / live kit / the xAI proxy.

Open `http://localhost:5173` in two browser tabs:

1. Tab 1: click **Host room** → copy the shareable `?room=CODE&role=dm` URL (or note the code).
2. Tab 2: enter the room code and **Join** as Player (or open `?room=CODE&role=player`).
3. DM places a tile; player places a token and moves it; player cannot move the DM tile.

Solo offline mode is the default. The UI shows **Solo — Host a room for multiplayer**
until you Host/Join; brief WebSocket proxy flaps do not spam red errors. If you were
already in a room, the client reconnects quietly.

Optional: set `VITE_WS_URL` (e.g. `ws://localhost:3001`) to bypass the Vite proxy.

## Grok custom MCP connector (board tools)

Drive a **hosted** board from [grok.com/connectors](https://grok.com/connectors) (Custom) over **Streamable HTTP MCP** — no per-token xAI key inside the board for this path. Tools mutate the same in-memory room the WebSocket clients use and **broadcast** so an open Host/Join browser updates live.

### Tools

| Tool | Role |
|------|------|
| `search_assets` | Fuzzy kit search (call before place) |
| `list_board` | Pieces on the active room (includes sheet/HP when set) |
| `place_pieces` | Place assets (placements / ring helper) + broadcast |
| `update_pieces` | Scale / rotate / move by id or name |
| `upsert_piece_sheet` | Create/update a room-synced piece sheet (name, role, notes, stats, HP/armor) — places a token if needed |
| `update_combat` | HP / armor / defeated / `deltaHp` on matched pieces |
| `remove_pieces` | Remove pieces by id or name |
| `clear_board` | Clear object pieces (or `all` for tiles too) |
| `roll_dice` | Roll `NdS±K` (e.g. `1d6`, `2d6+1`) — result in tool output for narration |
| `get_rules` | Excerpt / section from the room’s rules pack (larger, section-aware) |
| `list_rooms` | Live room codes + peer counts |
| `set_active_room` | Target a room code for subsequent tools |

Piece sheets for MCP live on the **piece** (room state), not only in the browser library, so Host tabs update live over the WebSocket. Tools stay rules-agnostic: they read whatever `rulesPack` text the room loaded (Kit Sparks sample or your import).

### Run (token + room server)

**Stable token vs changing tunnel URL:** the board MCP token is meant to stay the same across `npm run server` restarts. The Cloudflare/ngrok HTTPS URL changes more often. Connect once per tunnel URL; you only need to paste the token again when adding/reconnecting the connector (OAuth Approve), not every play session.

```bash
# Optional: set a secret yourself (otherwise the server loads/mints .mcp-token)
# export OPENKIT_MCP_TOKEN="$(openssl rand -base64 32)"
# Optional default room (or use set_active_room after Host)
# export OPENKIT_MCP_ROOM=ABC12
# Point at your Open Kit passed/ folder if needed
# export OPENKIT_KIT_PATH="/path/to/OpenKit/2d/dnd/passed"

npm run server
```

If `OPENKIT_MCP_TOKEN` is unset, the server loads gitignored **`.mcp-token`** in the project root, or mints one once and writes that file. Logs only show the last 4 characters — never the full token. **Copy the token from the board:** AI panel → Shoulder → **Settings** → **Grok connector (MCP)** (Show / Copy), or AI → Setup. Do not hunt `.mcp-token` in Notepad for normal use. Never commit `.mcp-token` or put the raw token in the client bundle.

Local-only helper: `GET http://localhost:3001/mcp/token` (also via Vite proxy `/mcp/token`). Host must be localhost; via the public tunnel this endpoint requires Bearer auth.

MCP endpoint: `http://localhost:3001/mcp`  
Auth: `Authorization: Bearer <OPENKIT_MCP_TOKEN>` **or** a token from the OAuth consent flow (Grok Connect).

### Tunnel (Cloudflare or ngrok)

Grok’s servers must reach your laptop:

```bash
cloudflared tunnel --url http://localhost:3001
# or: ngrok http 3001
```

Copy the HTTPS URL (e.g. `https://….trycloudflare.com`).

### Add the connector on Grok (OAuth)

Grok Connect expects **OAuth**, not a pasted Bearer secret. This board server hosts a tiny OAuth 2.1 flow on the same port (PKCE + consent page). Static `Authorization: Bearer <OPENKIT_MCP_TOKEN>` still works for curl / local tools.

1. Keep `npm run server` running. Copy the board MCP token from **Shoulder → Settings** (or AI → Setup). Token persists in `.mcp-token` across restarts.
2. Expose it with a tunnel (`cloudflared tunnel --url http://localhost:3001`). Tunnel URL may change; reconnect the connector when it does.
3. Open [grok.com/connectors](https://grok.com/connectors) → **New** → **Custom**.
4. MCP URL: `https://<tunnel-host>/mcp`
5. When Grok asks for OAuth fields, discovery should fill them from:
   - `/.well-known/oauth-protected-resource`
   - `/.well-known/oauth-authorization-server`
6. If you must enter a client id by hand, use the built-in public client: **`openkit-board`** (auth method **none** — no client secret). Dynamic registration at `/oauth/register` is also supported.
7. Complete Connect — your browser opens this board’s **Approve Grok connector** page on the tunnel host. Paste the same board MCP token and click **Approve**.
8. Grok redirects to `https://grok.com/connectors-oauth-exchange-code/` with a one-time code; the connector then uses the issued access token for `/mcp`.

OAuth endpoints (same origin as MCP): `/oauth/authorize`, `/oauth/token`, `/oauth/register`, plus the `.well-known` docs above.

### Host a room first (required)

Rooms are in-memory and disappear when the last WebSocket client leaves.

1. Run Vite (`npm run dev`) and open the board.
2. Click **Host room** — note the 5-char code; **leave that tab open**.
3. Tell Grok the room code, or call `set_active_room`, or set `OPENKIT_MCP_ROOM` before `npm run server`.
4. Ask Grok to `search_assets` for goblins and `place_pieces` — tokens should appear on the open board.
5. **Mini session:** Load Kit Sparks on the Host tab, then in grok.com paste the AI panel “Kit Sparks mini session” prompt (or ask Grok to `get_rules` → `upsert_piece_sheet` a Fighter PC + 2 goblins → `roll_dice` / `update_combat` for a few rounds). Narration stays in chat; board tools move tokens and sheets.

Smoke test without Grok:

```bash
curl -s -X POST http://127.0.0.1:3001/mcp \
  -H "Authorization: Bearer $OPENKIT_MCP_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

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
- **Assets:** live Open Kit `passed/` via room server (Settings kit path or `OPENKIT_KIT_PATH`), else curated demo pack under `public/assets/`
- **AI:** small sidebar **AI** button opens a floating panel (Shoulder chat, local Ollama setup, Grok connector setup, copy-paste grok.com prompts)
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
new assets show up after **Refresh** in the Assets window (binaries stay on your machine; they are **not** committed to git).

Point the app at *your* kit folder:

1. **Shoulder → Settings → Open Kit folder** — paste the absolute path to your `passed/` directory and Save (stored in gitignored `.openkit-kit-path`), or
2. Set env `OPENKIT_KIT_PATH` before `npm run server` (overrides the saved path).

```bash
# Terminal A — room server (also serves /kit/manifest + /kit/files/*)
# Optional: export OPENKIT_KIT_PATH="/path/to/your/OpenKit/passed"
npm run server

# Terminal B — Vite (proxies /kit → :3001)
npm run dev
```

- With server + a valid kit path: Assets shows **Open Kit live (N)**.
- Without server/kit: Assets falls back to the curated **Demo pack** under `public/assets/`.
- Soft **Refresh** in the Assets tray re-fetches the manifest (picks up new PNGs).

Endpoints: `GET /kit/manifest`, `GET /kit/files/:file` (path-safe), local `GET|POST /kit/config` for Settings. Categories follow
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
