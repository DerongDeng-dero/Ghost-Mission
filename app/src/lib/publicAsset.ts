/**
 * Resolve a file from Vite's public directory without assuming that the app is
 * deployed at the origin root. This keeps local, static-file, and GitHub Pages
 * deployments on the same code path.
 */
export function publicAssetUrl(assetPath: string): string {
  if (/^(?:[a-z]+:)?\/\//i.test(assetPath) || /^[a-z]:[\\/]/i.test(assetPath)) {
    throw new Error(`Invalid public asset path: ${assetPath}`)
  }

  const normalized = assetPath.replaceAll('\\', '/').replace(/^\/+/, '')

  if (
    normalized.length === 0 ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(`Invalid public asset path: ${assetPath}`)
  }

  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`

  return `${base}${normalized}`
}
