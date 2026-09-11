# Open Kit Board

Digital square checkerboard for Open Kit D&D-style PNG assets — solo or Host/Join multiplayer, with optional AI helpers.

## 60-second quickstart

```bash
npm install
npm run server   # terminal A — room server on :3001
npm run dev      # terminal B — Vite client
```

Open [http://localhost:5173](http://localhost:5173). Click around the board (demo assets work offline). Optional next steps:

1. **Sidebar → AI → Shoulder → Settings** — set **Open Kit folder** (absolute path to your `passed/` directory) and/or copy the **Grok connector (MCP)** token.
2. Load **Kit Sparks** from the rules folio for sample combat rules.
3. **Host room** if you want live sync or the grok.com MCP connector.

Prefer `localhost` over `127.0.0.1` if host binding differs.

---

## Two AI paths (do not mix them up)

| | **Shoulder** (in-board chat) | **grok.com MCP connector** |
|---|---|---|
| Where | Floating chat inside this board (AI → Shoulder) | Separate [grok.com](https://grok.com) tab + Custom connector |
| Auth | **Ollama** (local) *or* **xAI API key** in Settings / `XAI_API_KEY` | **Subscription Grok** + OAuth; board secret is `OPENKIT_MCP_TOKEN` (Approve page) |
| Endpoint | Browser → `/ollama` or `/xai` | Public HTTPS tunnel → `https://…/mcp` |
| Needs | Ollama running, *or* an xAI key | `npm run server`, tunnel to **:3001**, Host room tab left open |
| Key missing? | Banner may say Shoulder/Grok offline — that is **only** the in-board provider | MCP still works; use AI → Setup / Prompts on grok.com |

**Shoulder** never uses your grok.com subscription. The **MCP connector** never uses the xAI key you paste into Shoulder Settings.

Full connector guide: **[docs/MCP.md](docs/MCP.md)**.

---

## Shoulder (in-board)

Private floating chat per browser. Choose **Ollama** (local) or **Grok (xAI)** in Shoulder → **Settings**.

- With a tools-capable model it answers from the active rules pack and — for DM/solo — calls board tools (`search_assets`, `place_pieces`, …) so phrases like “camp and 5 goblins” place real kit assets.
- **Ollama:** browser → `/ollama` → Vite → `127.0.0.1:11434` (room server still proxies `/ollama` for non-Vite; `OPENKIT_OLLAMA_URL` overrides). Default model `llama3.1:8b`.
- **Grok (xAI):** browser → `/xai` → Vite → room server `:3001` → `https://api.x.ai/v1`. Paste an xAI key in Settings (`localStorage` only) or set `XAI_API_KEY` / `GROK_API_KEY` on the server. Default model `grok-4.6`.
- If the selected LLM is off/unreachable, Shoulder uses the extractive local helper + hard-coded place planner; if an LLM chat call fails mid-session, it shows a clear error (rules-only Q&A optional) and does **not** place via the hard-coded planner. Players get rules Q&A only (no place tools).

A banner like “Grok (Shoulder key offline)” means the **in-board xAI path** is unavailable — not that the grok.com MCP connector is broken.

## grok.com MCP connector (subscription)

Drive a **hosted** board from [grok.com/connectors](https://grok.com/connectors) (Custom) over Streamable HTTP MCP — no per-token xAI key inside the board for this path. Tools mutate the same in-memory room WebSocket clients use and **broadcast** so an open Host/Join browser updates live.

See **[docs/MCP.md](docs/MCP.md)** for OAuth, tunnel, token copy, and the verified tool list (includes sheets, combat, and dice).

Quick path:

1. `npm run server` — copy MCP token from **Shoulder → Settings → Grok connector (MCP)** (Show / Copy).
2. Tunnel: `cloudflared tunnel --url http://localhost:3001` (or ngrok).
3. Host a room in the board UI; leave that tab open.
4. grok.com → Connectors → Custom → MCP URL `https://<tunnel-host>/mcp` → Approve with the board token.

---

## Multiplayer rooms (MVP)

Live sync of board radius + placed pieces + DM rules pack over a small WebSocket server.
DM owns board/assets/terrain; players place/move/delete only their own tokens.
No auth, no DB — rooms live in server memory.

```bash
# Terminal A — room server (port 3001)
npm run server

# Terminal B — Vite client (/ws + /kit + /xai → :3001; /ollama → 127.0.0.1:11434)
npm run dev
```

Open `http://localhost:5173` in two browser tabs:

1. Tab 1: **Host room** → copy `?room=CODE&role=dm` (or note the code).
2. Tab 2: enter the code and **Join** as Player (or open `?room=CODE&role=player`).
3. DM places a tile; player places a token and moves it; player cannot move the DM tile.

Solo offline is the default. Brief WebSocket proxy flaps do not spam red errors; the client reconnects quietly if you were already in a room.

Optional: `VITE_WS_URL` (e.g. `ws://localhost:3001`) to bypass the Vite proxy.

Production:

```bash
npm run build
npm run preview
```

## Settings: kit folder + MCP token

In **AI → Shoulder → Settings** (also summarized under AI → Setup):

- **Open Kit folder** — absolute path to your kit `passed/` directory. Saved for the room server (gitignored). `OPENKIT_KIT_PATH` env overrides. Demo pack is the fallback when unset.
- **Grok connector (MCP)** — Show / Copy the board token (`OPENKIT_MCP_TOKEN` / `.mcp-token`). Paste only on the OAuth Approve page when adding or reconnecting the connector. Token is stable across server restarts; the tunnel URL may change separately.

Never commit `.mcp-token`, `.openkit-kit-path`, or API keys.

## Rules packs (Bite A–C)

Import **your own** rules text — paste or upload `.txt` / `.md` / `.pdf` (PDF text extracted in the browser; binary PDF is never synced).
Open Kit Board does **not** republish third-party rulebooks.

- **Load Kit Sparks sample** — CC0 micro-rules (`public/samples/kit-sparks.md`).
- Solo: active pack in browser `localStorage`.
- Sidebar **Rules folio**; **Open folio** for a floating window.
- Multiplayer: DM attaches/replaces/clears the room pack; players are read-only.

Optional testing tip (link only): [Lasers & Feelings](https://johnharper.itch.io/lasers-feelings) (CC BY 4.0).

## Piece visual transforms

Selected pieces show **rotate / corner / edge** handles. The floating index card has numeric rotation, scale X/Y, offset X/Y, and **Lock to cell**.

- **Lock on (default):** piece stays on its home cell; body-drag nudges the image; edge/corner stretch. **Shift**+body-drag re-homes.
- **Lock off:** body-drag moves the home cell.
- Rotate snaps to 15° (**Shift** = free). Corner scale uniform by default (**Shift** = non-uniform).
- Transforms sync over multiplayer. Camera: scroll zoom, empty-board drag, Alt/middle/right pan.

## Piece sheet + pin library

Select a placed piece → floating **index card** (display name, notes, freeform stats).

- **Pin / Save** → `localStorage` by `assetId`
- **Pinned library** floating window (local only — not WebSocket-synced yet)
- MCP `upsert_piece_sheet` / `update_combat` write sheets onto **room pieces** so Host tabs update live

## Presence

- Square checkerboard in a recessed felt well; room / dim / void backdrop
- Material tray; Assets / Pinned as floating windows
- Top-down camera; foley + ambience; establishing arrival; decorative seat pads; selected contact shadow

## What works

- Presence, multiplayer rooms, rules packs, piece sheets / pin library
- DM filters (theme + level + category + search)
- Live Open Kit `passed/` via room server (Settings kit path or `OPENKIT_KIT_PATH`), else demo pack under `public/assets/`
- Sidebar **AI** panel: Shoulder, Setup, copy-paste grok.com prompts
- Square grid (`q`,`r` = column/row), pan + scroll zoom; zoom-out fits the whole map
- Place / select / move / delete; tiles as ground layer

## Demo assets

Filenames use Open Kit-style prefixes (`tile-`, `prop-`, `token-`, `monster-`).
Loader reads `public/assets/manifest.json`. Included demo pack (~18): fae, heaven, hell, extraplanar samples.

## Open Kit live assets

The room server scans your Open Kit `passed/` folder and serves PNGs live — **Refresh** in Assets picks up new files (binaries stay on your machine; not committed).

1. **Shoulder → Settings → Open Kit folder** — paste the absolute path to `passed/` and Save, or
2. `export OPENKIT_KIT_PATH="/path/to/your/OpenKit/passed"` before `npm run server`.

```bash
npm run server   # also serves /kit/manifest + /kit/files/*
npm run dev      # proxies /kit → :3001
```

- Valid kit path → Assets shows **Open Kit live (N)**.
- Otherwise → curated **Demo pack**.
- Endpoints: `GET /kit/manifest`, `GET /kit/files/:file`, local `GET|POST /kit/config`.

## Grid coordinates

Classic D&D **square checkerboard** (not hex). `q`/`r` = column/row. Radius `N` → `(2N+1)×(2N+1)` cells centered on `(0,0)`.

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

Vite + React + TypeScript client; Node `ws` room server in `server/` (MCP + OAuth in `server/mcp.mjs` / `server/oauth.mjs`). SVG board.

## License / assets

Sample PNGs are generated placeholders for local demo use.
Replace them with your own Open Kit exports when ready.
