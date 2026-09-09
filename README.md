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

Live sync of board radius + placed pieces over a small WebSocket server.
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

Solo offline mode is unchanged when you are not in a room.

Optional: set `VITE_WS_URL` (e.g. `ws://localhost:3001`) to bypass the Vite proxy.

## What works

- **Multiplayer rooms:** Host/Join with short code; DM + players sync mapRadius + pieces over WebSocket
- **DM filters:** theme (Fantasy / Fae / Heaven / Hell / Extraplanar) + level band + category tabs + name search
- **Demo pack:** ~18 real Open Kit PNGs under `public/assets/demo/` (infrastructure smoke-test — no baked story, no AI)
- Pointy-top hex grid (axial coords) with pan + scroll zoom
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
