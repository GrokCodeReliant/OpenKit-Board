/** Fetch board MCP token from local room server (Vite proxies /mcp → :3001). */

export type McpTokenSource = 'env' | 'file' | 'minted'

export type McpTokenFetch =
  | { ok: true; token: string; source?: McpTokenSource; hint?: string }
  | { ok: false; reason: 'offline' | 'unauthorized' | 'error'; message: string }

export async function fetchBoardMcpToken(
  signal?: AbortSignal,
): Promise<McpTokenFetch> {
  try {
    const res = await fetch('/mcp/token', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal,
    })
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        reason: 'unauthorized',
        message: 'Token endpoint blocked — use the board on localhost while hosting.',
      }
    }
    if (!res.ok) {
      return {
        ok: false,
        reason: res.status === 503 || res.status === 502 ? 'offline' : 'error',
        message:
          res.status === 502 || res.status === 503
            ? 'Room server not reachable. Start npm run server.'
            : `Could not load token (HTTP ${res.status}).`,
      }
    }
    const data = (await res.json()) as {
      token?: unknown
      source?: unknown
      hint?: unknown
      error?: unknown
    }
    const token = typeof data.token === 'string' ? data.token.trim() : ''
    if (!token) {
      return {
        ok: false,
        reason: 'error',
        message:
          typeof data.error === 'string'
            ? data.error
            : 'Token missing from server response.',
      }
    }
    const source =
      data.source === 'env' || data.source === 'file' || data.source === 'minted'
        ? data.source
        : undefined
    return {
      ok: true,
      token,
      source,
      hint: typeof data.hint === 'string' ? data.hint : undefined,
    }
  } catch (err) {
    const aborted =
      (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') ||
      false
    if (aborted) {
      return { ok: false, reason: 'offline', message: 'Cancelled' }
    }
    return {
      ok: false,
      reason: 'offline',
      message: 'Room server not reachable. Start npm run server.',
    }
  }
}

export function maskMcpToken(token: string): string {
  const t = token.trim()
  if (t.length <= 8) return '••••••••'
  return `${t.slice(0, 4)}…${t.slice(-4)}`
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    try {
      const ok = document.execCommand('copy')
      return ok
    } finally {
      document.body.removeChild(ta)
    }
  }
}
