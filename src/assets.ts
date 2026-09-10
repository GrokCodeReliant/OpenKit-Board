import type { AssetCategory, AssetDef, LevelBand, Manifest, AssetTheme } from './types'

/**
 * Category from Open Kit–style filename prefix:
 * tile-*, prop-*, token-*, monster-*
 */
export function categoryFromFilename(filename: string): AssetCategory | null {
  const base = filename.replace(/\.[^.]+$/, '').toLowerCase()
  if (base.startsWith('tile-')) return 'tiles'
  if (base.startsWith('prop-')) return 'props'
  if (base.startsWith('token-')) return 'tokens'
  if (base.startsWith('monster-')) return 'monsters'
  return null
}

export function displayNameFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '')
  const withoutPrefix = base.replace(/^(tile|prop|token|monster)-/i, '')
  return withoutPrefix
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

const DEFAULT_THEMES: AssetTheme[] = ['fantasy']
const DEFAULT_LEVELS: LevelBand[] = ['1-4', '5-10', '11-20']

export type AssetLoadSource = 'kit' | 'demo'

export interface AssetLoadResult {
  assets: AssetDef[]
  source: AssetLoadSource
  /** Present when source is kit (from server note / count). */
  kitCount?: number
}

function manifestToAssets(manifest: Manifest): AssetDef[] {
  const base = manifest.basePath.replace(/\/$/, '')
  return manifest.assets.map((a) => {
    const category = a.category || categoryFromFilename(a.file) || 'props'
    return {
      id: a.id,
      name: a.name || displayNameFromFilename(a.file),
      category,
      file: a.file,
      src: `${base}/${encodeURIComponent(a.file).replace(/%2F/gi, '/')}`,
      themes: a.themes?.length ? a.themes : DEFAULT_THEMES,
      levels: a.levels?.length ? a.levels : DEFAULT_LEVELS,
    }
  })
}

/** Load a single manifest URL into AssetDef[]. */
export async function loadAssetsFromManifest(
  manifestUrl = '/assets/manifest.json',
): Promise<AssetDef[]> {
  const res = await fetch(manifestUrl)
  if (!res.ok) {
    throw new Error(`Failed to load manifest: ${res.status} ${res.statusText}`)
  }
  const manifest = (await res.json()) as Manifest
  return manifestToAssets(manifest)
}

/**
 * Prefer live Open Kit scan from the room server (`/kit/manifest`).
 * Fall back to the curated demo pack under `/assets/manifest.json`.
 */
export async function loadAssetsPreferKit(): Promise<AssetLoadResult> {
  try {
    const res = await fetch('/kit/manifest', { cache: 'no-store' })
    if (res.ok) {
      const manifest = (await res.json()) as Manifest
      if (Array.isArray(manifest.assets) && manifest.assets.length > 0) {
        return {
          assets: manifestToAssets(manifest),
          source: 'kit',
          kitCount: manifest.assets.length,
        }
      }
    }
  } catch {
    // Server down or proxy missing — use demo.
  }

  const assets = await loadAssetsFromManifest('/assets/manifest.json')
  return { assets, source: 'demo' }
}
