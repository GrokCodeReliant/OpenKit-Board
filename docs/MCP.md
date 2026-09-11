# Grok custom MCP connector

Drive a **hosted** Open Kit Board from [grok.com/connectors](https://grok.com/connectors) (Custom) over **Streamable HTTP MCP**. Tools mutate the same in-memory room the WebSocket clients use and **broadcast** so an open Host/Join browser updates live.

This path is **not** Shoulder. Shoulder is the in-board chat that uses Ollama or an xAI API key. The connector uses your **grok.com subscription** plus a board MCP token (`OPENKIT_MCP_TOKEN`) on OAuth Approve.

## Prerequisites

1. `npm run server` (listens on **port 3001** — MCP, OAuth, kit, and WebSocket all share this port).
2. A public HTTPS tunnel to that port (Grok’s servers must reach your laptop).
3. An open **Host room** browser tab (rooms are in-memory; they disappear when the last WebSocket client leaves).

## Board token (`OPENKIT_MCP_TOKEN`)

**Stable token vs changing tunnel URL:** the board MCP token is meant to stay the same across `npm run server` restarts. The Cloudflare/ngrok HTTPS URL changes more often. Connect once per tunnel URL; paste the token again only when adding/reconnecting the connector (OAuth Approve), not every play session.

```bash
# Optional: set a secret yourself (otherwise the server loads/mints .mcp-token)
# export OPENKIT_MCP_TOKEN="$(openssl rand -base64 32)"
# Optional default room (or use set_active_room after Host)
# export OPENKIT_MCP_ROOM=ABC12
# Point at your Open Kit passed/ folder if needed
# export OPENKIT_KIT_PATH="/path/to/OpenKit/passed"

npm run server
```

If `OPENKIT_MCP_TOKEN` is unset, the server loads gitignored **`.mcp-token`** in the project root, or mints one once and writes that file. Logs only show the last 4 characters.

**Copy the token from the board (preferred):**

- AI → Shoulder → **Settings** → **Grok connector (MCP)** (Show / Copy), or
- AI → Setup (same token UI).

Do not hunt `.mcp-token` in an editor for normal use. Never commit `.mcp-token` or put the raw token in the client bundle.

Local-only helper: `GET http://localhost:3001/mcp/token` (also via Vite proxy `/mcp/token`). Host must be localhost; via the public tunnel this endpoint requires Bearer auth.

MCP endpoint (local): `http://localhost:3001/mcp`  
Auth: `Authorization: Bearer <OPENKIT_MCP_TOKEN>` **or** a token from the OAuth consent flow (Grok Connect).

## Tunnel (required for grok.com)

Expose the room server — not the Vite port:

```bash
cloudflared tunnel --url http://localhost:3001
# or: ngrok http 3001
```

Copy the HTTPS URL (e.g. `https://….trycloudflare.com`). MCP URL for Grok:

```text
https://<tunnel-host>/mcp
```

If the tunnel URL changes, reconnect the connector on grok.com (token can stay the same).

## Add the connector on Grok (OAuth)

Grok Connect expects **OAuth**, not a pasted Bearer secret. This board server hosts a tiny OAuth 2.1 flow on the same port (PKCE + consent page). Static `Authorization: Bearer <OPENKIT_MCP_TOKEN>` still works for curl / local tools.

1. Keep `npm run server` running. Copy the board MCP token from **Shoulder → Settings**.
2. Tunnel `:3001` as above.
3. Open [grok.com/connectors](https://grok.com/connectors) → **New** → **Custom**.
4. MCP URL: `https://<tunnel-host>/mcp`
5. When Grok asks for OAuth fields, discovery should fill them from:
   - `/.well-known/oauth-protected-resource`
   - `/.well-known/oauth-authorization-server`
6. If you must enter a client id by hand, use the built-in public client: **`openkit-board`** (auth method **none** — no client secret). Dynamic registration at `/oauth/register` is also supported.
7. Complete Connect — your browser opens this board’s **Approve Grok connector** page on the tunnel host. Paste the same board MCP token and click **Approve**.
8. Grok redirects to `https://grok.com/connectors-oauth-exchange-code/` with a one-time code; the connector then uses the issued access token for `/mcp`.

OAuth endpoints (same origin as MCP): `/oauth/authorize`, `/oauth/token`, `/oauth/register`, plus the `.well-known` docs above.

## Host a room first (required)

1. Run Vite (`npm run dev`) and open the board.
2. Click **Host room** — note the 5-char code; **leave that tab open**.
3. Tell Grok the room code, or call `set_active_room`, or set `OPENKIT_MCP_ROOM` before `npm run server`.
4. Ask Grok to `search_assets` / `place_pieces` — tokens should appear on the open board.
5. **Mini session:** Load Kit Sparks on the Host tab, then in grok.com use the AI panel “Kit Sparks mini session” prompt (or `get_rules` → `upsert_piece_sheet` → `roll_dice` / `update_combat`). Narration stays in chat; board tools move tokens and sheets.

## Tools (verified from `server/mcp.mjs`)

| Tool | Role |
|------|------|
| `list_rooms` | Live room codes + peer counts |
| `set_active_room` | Target a room code for subsequent tools |
| `search_assets` | Fuzzy kit search (call before place) |
| `list_board` | Pieces on the active room (includes sheet/HP when set) |
| `place_pieces` | Place assets (placements / ring helper) + broadcast |
| `update_pieces` | Scale / rotate / move by id or name |
| `get_rules` | Excerpt / section from the room’s rules pack |
| `upsert_piece_sheet` | Create/update a room-synced piece sheet (name, role, notes, stats, HP/armor) — places a token if needed |
| `update_combat` | HP / armor / defeated / `deltaHp` on matched pieces |
| `remove_pieces` | Remove pieces by id or name |
| `clear_board` | Clear object pieces (or `all` for tiles too) |
| `roll_dice` | Roll `NdS±K` (e.g. `1d6`, `2d6+1`) — result in tool output for narration |

Piece sheets for MCP live on the **piece** (room state), not only in the browser library, so Host tabs update live over the WebSocket. Tools stay rules-agnostic: they read whatever `rulesPack` text the room loaded.

## Smoke test (no Grok)

```bash
curl -s -X POST http://127.0.0.1:3001/mcp \
  -H "Authorization: Bearer $OPENKIT_MCP_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Shoulder vs MCP (reminder)

| | Shoulder | This connector |
|---|---|---|
| UI | In-board chat | grok.com + Custom MCP |
| Auth | Ollama or xAI API key | Subscription + `OPENKIT_MCP_TOKEN` OAuth |
| Server | Optional for Ollama-only; required for xAI proxy / multiplayer | Always (`:3001` + tunnel) |

A Shoulder banner about a missing xAI key does **not** mean the MCP connector is misconfigured.
