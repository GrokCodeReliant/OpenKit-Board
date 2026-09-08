import type { AssetCategory, AssetDef, Manifest } from './types'

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

/** Load assets from public/assets/manifest.json (samples by default). */
export async function loadAssetsFromManifest(
  manifestUrl = '/assets/manifest.json',
): Promise<AssetDef[]> {
  const res = await fetch(manifestUrl)
  if (!res.ok) {
    throw new Error(`Failed to load manifest: ${res.status} ${res.statusText}`)
  }
  const manifest = (await res.json()) as Manifest
  const base = manifest.basePath.replace(/\/$/, '')

  return manifest.assets.map((a) => {
    const category = a.category || categoryFromFilename(a.file) || 'props'
    return {
      id: a.id,
      name: a.name || displayNameFromFilename(a.file),
      category,
      file: a.file,
      src: `${base}/${a.file}`,
    }
  })
}

/**
 * Later: point at a real Open Kit `passed/` folder by serving that folder
 * (or copying PNGs into public/) and updating manifest.json basePath + assets
 * listed by filename prefixes (tile-/prop-/token-/monster-).
 */
