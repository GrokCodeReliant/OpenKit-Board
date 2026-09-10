/** Shoulder LLM settings (Ollama + xAI Grok) — persisted in localStorage. */

export const SHOULDER_OLLAMA_URL_KEY = 'okb.shoulder.ollamaUrl.v1'
export const SHOULDER_OLLAMA_ENABLED_KEY = 'okb.shoulder.ollamaEnabled.v1'
export const SHOULDER_OLLAMA_MODEL_KEY = 'okb.shoulder.ollamaModel.v1'

/** Default base is the Vite/dev proxy path (relative → Vite → Ollama; room server also serves /ollama). */
export const DEFAULT_OLLAMA_BASE = '/ollama'
export const DEFAULT_OLLAMA_MODEL = 'llama3.1:8b'

/**
 * Browser cannot call Ollama on 127.0.0.1/localhost (CORS).
 * Rewrite common loopback absolute bases to the CORS-safe `/ollama` proxy.
 */
export function normalizeOllamaBaseUrl(url: string): string {
  const t = (url || '').trim().replace(/\/$/, '')
  if (!t) return DEFAULT_OLLAMA_BASE
  // http(s)://127.0.0.1:11434 | localhost:11434 | [::1]:11434 → /ollama (CORS)
  if (
    /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):11434$/i.test(t)
  ) {
    return DEFAULT_OLLAMA_BASE
  }
  return t
}

/** Vite env hook for alternate backends. */
export function envShoulderUrl(): string | undefined {
  const v = import.meta.env.VITE_SHOULDER_URL as string | undefined
  const t = typeof v === 'string' ? v.trim() : ''
  return t || undefined
}

export function loadShoulderOllamaUrl(): string {
  try {
    const raw = localStorage.getItem(SHOULDER_OLLAMA_URL_KEY)
    if (typeof raw === 'string' && raw.trim()) {
      const normalized = normalizeOllamaBaseUrl(raw)
      // Persist migration away from CORS-doom loopback URLs
      if (normalized !== raw.trim().replace(/\/$/, '')) {
        try {
          localStorage.setItem(SHOULDER_OLLAMA_URL_KEY, normalized)
        } catch {
          /* ignore */
        }
      }
      return normalized
    }
  } catch {
    /* ignore */
  }
  const fromEnv = envShoulderUrl()
  return fromEnv ? normalizeOllamaBaseUrl(fromEnv) : DEFAULT_OLLAMA_BASE
}

export function saveShoulderOllamaUrl(url: string): void {
  const t = normalizeOllamaBaseUrl(url.trim() || DEFAULT_OLLAMA_BASE)
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

/** Previous default — migrate browsers still on this (or empty) to llama3.1:8b. */
const LEGACY_DEFAULT_OLLAMA_MODEL = 'qwen3-coder:30b'

export function loadShoulderOllamaModel(): string {
  try {
    const raw = localStorage.getItem(SHOULDER_OLLAMA_MODEL_KEY)
    const trimmed = typeof raw === 'string' ? raw.trim() : ''
    // One-time migration: empty or prior default → new story/D&D default
    if (!trimmed || trimmed === LEGACY_DEFAULT_OLLAMA_MODEL) {
      try {
        localStorage.setItem(SHOULDER_OLLAMA_MODEL_KEY, DEFAULT_OLLAMA_MODEL)
      } catch {
        /* ignore */
      }
      return DEFAULT_OLLAMA_MODEL
    }
    return trimmed
  } catch {
    /* ignore */
  }
  return DEFAULT_OLLAMA_MODEL
}

export function saveShoulderOllamaModel(model: string): void {
  const t = model.trim() || DEFAULT_OLLAMA_MODEL
  localStorage.setItem(SHOULDER_OLLAMA_MODEL_KEY, t)
}

/** Provider: local Ollama or xAI Grok (OpenAI-compatible). */
export type ShoulderProvider = 'ollama' | 'xai'

export const SHOULDER_PROVIDER_KEY = 'okb.shoulder.provider.v1'
export const SHOULDER_XAI_MODEL_KEY = 'okb.shoulder.xaiModel.v1'
export const SHOULDER_XAI_API_KEY = 'okb.shoulder.xaiApiKey.v1'

export const DEFAULT_XAI_MODEL = 'grok-4.6'
/** Browser → Vite → room server → api.x.ai */
export const DEFAULT_XAI_BASE = '/xai/v1'

export function loadShoulderProvider(): ShoulderProvider {
  try {
    const raw = localStorage.getItem(SHOULDER_PROVIDER_KEY)
    if (raw === 'xai' || raw === 'ollama') return raw
  } catch {
    /* ignore */
  }
  return 'ollama'
}

export function saveShoulderProvider(provider: ShoulderProvider): void {
  localStorage.setItem(SHOULDER_PROVIDER_KEY, provider)
}

export function loadShoulderXaiModel(): string {
  try {
    const raw = localStorage.getItem(SHOULDER_XAI_MODEL_KEY)
    const trimmed = typeof raw === 'string' ? raw.trim() : ''
    if (trimmed) return trimmed
  } catch {
    /* ignore */
  }
  return DEFAULT_XAI_MODEL
}

export function saveShoulderXaiModel(model: string): void {
  const t = model.trim() || DEFAULT_XAI_MODEL
  localStorage.setItem(SHOULDER_XAI_MODEL_KEY, t)
}

/** API key lives in localStorage only — never commit. Empty if unset. */
export function loadShoulderXaiApiKey(): string {
  try {
    const raw = localStorage.getItem(SHOULDER_XAI_API_KEY)
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}

export function saveShoulderXaiApiKey(key: string): void {
  const t = key.trim()
  if (!t) {
    try {
      localStorage.removeItem(SHOULDER_XAI_API_KEY)
    } catch {
      /* ignore */
    }
    return
  }
  localStorage.setItem(SHOULDER_XAI_API_KEY, t)
}

export function hasShoulderXaiApiKey(): boolean {
  return loadShoulderXaiApiKey().length > 0
}
