/** Shoulder Ollama settings — persisted in localStorage. */

export const SHOULDER_OLLAMA_URL_KEY = 'okb.shoulder.ollamaUrl.v1'
export const SHOULDER_OLLAMA_ENABLED_KEY = 'okb.shoulder.ollamaEnabled.v1'
export const SHOULDER_OLLAMA_MODEL_KEY = 'okb.shoulder.ollamaModel.v1'

/** Default base is the room-server proxy (relative → Vite → :3001 → Ollama). */
export const DEFAULT_OLLAMA_BASE = '/ollama'
export const DEFAULT_OLLAMA_MODEL = 'qwen3-coder:30b'

/** Vite env hook for alternate backends. */
export function envShoulderUrl(): string | undefined {
  const v = import.meta.env.VITE_SHOULDER_URL as string | undefined
  const t = typeof v === 'string' ? v.trim() : ''
  return t || undefined
}

export function loadShoulderOllamaUrl(): string {
  try {
    const raw = localStorage.getItem(SHOULDER_OLLAMA_URL_KEY)
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
  } catch {
    /* ignore */
  }
  return envShoulderUrl() || DEFAULT_OLLAMA_BASE
}

export function saveShoulderOllamaUrl(url: string): void {
  const t = url.trim() || DEFAULT_OLLAMA_BASE
  localStorage.setItem(SHOULDER_OLLAMA_URL_KEY, t)
}

/** null = never set (auto: on if tags reachable). */
export function loadShoulderOllamaEnabled(): boolean | null {
  try {
    const raw = localStorage.getItem(SHOULDER_OLLAMA_ENABLED_KEY)
    if (raw === '1' || raw === 'true') return true
    if (raw === '0' || raw === 'false') return false
  } catch {
    /* ignore */
  }
  return null
}

export function saveShoulderOllamaEnabled(enabled: boolean): void {
  localStorage.setItem(SHOULDER_OLLAMA_ENABLED_KEY, enabled ? '1' : '0')
}

export function loadShoulderOllamaModel(): string {
  try {
    const raw = localStorage.getItem(SHOULDER_OLLAMA_MODEL_KEY)
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
  } catch {
    /* ignore */
  }
  return DEFAULT_OLLAMA_MODEL
}

export function saveShoulderOllamaModel(model: string): void {
  const t = model.trim() || DEFAULT_OLLAMA_MODEL
  localStorage.setItem(SHOULDER_OLLAMA_MODEL_KEY, t)
}
