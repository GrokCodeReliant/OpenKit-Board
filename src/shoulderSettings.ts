/** Optional future local LLM endpoint — stored locally; not called in Bite 1. */

export const SHOULDER_OLLAMA_URL_KEY = 'okb.shoulder.ollamaUrl.v1'

/** Vite env hook for later backends (disabled / unused in Bite 1). */
export function envShoulderUrl(): string | undefined {
  const v = import.meta.env.VITE_SHOULDER_URL as string | undefined
  const t = typeof v === 'string' ? v.trim() : ''
  return t || undefined
}

export function loadShoulderOllamaUrl(): string {
  try {
    const raw = localStorage.getItem(SHOULDER_OLLAMA_URL_KEY)
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}

export function saveShoulderOllamaUrl(url: string): void {
  const t = url.trim()
  if (!t) {
    localStorage.removeItem(SHOULDER_OLLAMA_URL_KEY)
    return
  }
  localStorage.setItem(SHOULDER_OLLAMA_URL_KEY, t)
}
