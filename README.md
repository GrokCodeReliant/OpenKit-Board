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

## What works

- Pointy-top hex grid (axial coords) with pan + scroll zoom
- Sidebar categories: Tiles | Props | Tokens | Monsters
- Filter assets by name; thumbnail palette
- Drag an asset onto a hex, or click an asset then click a hex
- Select placed pieces, drag to move; Delete / Backspace removes
- Tiles render as a ground layer under props / tokens / monsters
- Offline sample PNGs under public/assets/samples/ plus manifest.json
- DM can set board radius (3–40); large maps warn about performance

## Sample assets

Filenames use Open Kit-style prefixes (tile-, prop-, token-, monster-).
The loader reads the manifest and maps those prefixes to categories.

Included: grass/stone/water/dirt; crate/barrel/tree/rock;
guard/mage/rogue/cleric; goblin/orc/dragon/skeleton.

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

Vite + React + TypeScript. Hex math is simple axial (pointy-top). SVG board.

## License / assets

Sample PNGs are generated placeholders for local demo use.
Replace them with your own Open Kit exports when ready.
