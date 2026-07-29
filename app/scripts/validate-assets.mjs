import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  appRoot,
  workspaceRoot,
  getAssetMetrics,
  formatMiB,
  listFiles,
} from './project-metrics.mjs'

const assetExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.mp4', '.webm'])
const sourceExtensions = new Set(['.css', '.html', '.js', '.jsx', '.md', '.mjs', '.ts', '.tsx'])
const failures = []
const warnings = []
const referencedPublicFiles = new Set()
const referencedAssets = new Map()

function inspectPng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) {
    return 'invalid PNG signature'
  }
  if (buffer.subarray(12, 16).toString('ascii') !== 'IHDR') {
    return 'missing PNG IHDR'
  }
  if (buffer.readUInt32BE(16) === 0 || buffer.readUInt32BE(20) === 0) {
    return 'invalid PNG dimensions'
  }
  if (buffer.lastIndexOf(Buffer.from('IEND')) < buffer.length - 12) {
    return 'missing terminal PNG IEND chunk'
  }
  return null
}

function inspectJpeg(buffer) {
  if (
    buffer.length < 4 ||
    buffer[0] !== 0xff ||
    buffer[1] !== 0xd8 ||
    buffer[buffer.length - 2] !== 0xff ||
    buffer[buffer.length - 1] !== 0xd9
  ) {
    return 'invalid JPEG boundaries'
  }

  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ])
  let offset = 2
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = buffer[offset + 1]
    if (marker === 0xda || marker === 0xd9) break
    if (marker === 0x00 || marker === 0xff) {
      offset += 1
      continue
    }
    const segmentLength = buffer.readUInt16BE(offset + 2)
    if (segmentLength < 2 || offset + segmentLength + 2 > buffer.length) {
      return 'invalid JPEG segment length'
    }
    if (startOfFrameMarkers.has(marker)) {
      const height = buffer.readUInt16BE(offset + 5)
      const width = buffer.readUInt16BE(offset + 7)
      return width > 0 && height > 0 ? null : 'invalid JPEG dimensions'
    }
    offset += segmentLength + 2
  }
  return 'missing JPEG dimensions'
}

function detectFormat(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png'
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpeg'
  if (/^GIF8[79]a$/.test(buffer.subarray(0, 6).toString('ascii'))) return 'gif'
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return 'webp'
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') return 'mp4'
  if (buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'webm'
  if (/<svg(?:\s|>)/i.test(buffer.toString('utf8', 0, Math.min(buffer.length, 4096)))) return 'svg'
  if (buffer.toString('utf8', 0, 64).startsWith('version https://git-lfs.github.com/spec/v1')) {
    return 'git-lfs-pointer'
  }
  return 'unknown'
}

function inspectBinary(filePath, buffer) {
  const extension = path.extname(filePath).toLowerCase()
  const expectedFormat = extension === '.jpg' ? 'jpeg' : extension.slice(1)
  const detectedFormat = detectFormat(buffer)
  let issue = null

  if (detectedFormat === 'png') issue = inspectPng(buffer)
  else if (detectedFormat === 'jpeg') issue = inspectJpeg(buffer)
  else if (detectedFormat === 'git-lfs-pointer') issue = 'Git LFS content is not materialized'
  else if (detectedFormat === 'unknown') issue = 'unrecognized or corrupt asset format'

  return { detectedFormat, expectedFormat, issue }
}

async function collectReferences(filePath) {
  const text = await readFile(filePath, 'utf8')
  const pattern = /(?:^|['"`(=:,\s])((?:\/|\.\.?\/)[^'"`)\s?#]+\.(?:png|jpe?g|gif|webp|svg|mp4|webm))(?:[?#][^'"`)\s]*)?/gim
  let match

  while ((match = pattern.exec(text)) !== null) {
    const reference = decodeURIComponent(match[1])
    const resolved = reference.startsWith('/') && filePath.startsWith(path.resolve(appRoot, 'src'))
      ? path.resolve(appRoot, 'public', reference.slice(1))
      : path.resolve(path.dirname(filePath), reference)
    referencedAssets.set(resolved, { reference, source: filePath })
    if (resolved.startsWith(path.resolve(appRoot, 'public') + path.sep)) {
      referencedPublicFiles.add(resolved)
      if (reference.startsWith('/') && filePath.startsWith(path.resolve(appRoot, 'src'))) {
        failures.push(
          'Root-absolute public asset ' + reference + ' in ' +
            path.relative(appRoot, filePath) + ' bypasses Vite BASE_URL',
        )
      }
    }
  }

  const publicAssetPattern = /publicAssetUrl\(\s*['"]([^'"]+\.(?:png|jpe?g|gif|webp|svg|mp4|webm))['"]\s*\)/gim
  while ((match = publicAssetPattern.exec(text)) !== null) {
    const reference = decodeURIComponent(match[1])
    const resolved = path.resolve(appRoot, 'public', reference.replace(/^\/+/, ''))
    referencedAssets.set(resolved, { reference, source: filePath })
    referencedPublicFiles.add(resolved)
  }
}

const sourceFiles = (await listFiles(path.resolve(appRoot, 'src'))).filter((file) =>
  sourceExtensions.has(path.extname(file).toLowerCase()),
)
for (const extra of [
  path.resolve(appRoot, 'index.html'),
  path.resolve(appRoot, 'README.md'),
  path.resolve(workspaceRoot, 'README.md'),
]) {
  try {
    if ((await stat(extra)).isFile()) sourceFiles.push(extra)
  } catch {
    // The root README is created during project packaging; source assets still validate without it.
  }
}

for (const sourceFile of sourceFiles) await collectReferences(sourceFile)

for (const [resolved, details] of referencedAssets) {
  try {
    if (!(await stat(resolved)).isFile()) failures.push('Not a file: ' + details.reference)
  } catch {
    failures.push('Missing ' + details.reference + ' referenced by ' + path.relative(appRoot, details.source))
  }
}

const metrics = await getAssetMetrics()
const binaryFiles = [...metrics.publicFiles, ...metrics.docsFiles].filter((file) =>
  assetExtensions.has(path.extname(file).toLowerCase()),
)
for (const file of binaryFiles) {
  const buffer = await readFile(file)
  const inspection = inspectBinary(file, buffer)
  if (inspection.issue) failures.push(path.relative(appRoot, file) + ': ' + inspection.issue)
  if (
    inspection.detectedFormat !== 'unknown' &&
    inspection.detectedFormat !== 'git-lfs-pointer' &&
    inspection.detectedFormat !== inspection.expectedFormat
  ) {
    failures.push(
      path.relative(appRoot, file) + ': extension says ' + inspection.expectedFormat +
        ', binary content is ' + inspection.detectedFormat,
    )
  }
  if (buffer.length > 2 * 1024 * 1024) {
    failures.push(path.relative(appRoot, file) + ': exceeds the 2 MiB per-file budget')
  }
}

if (metrics.publicBytes > 16 * 1024 * 1024) {
  failures.push('public/: exceeds the 16 MiB total budget')
}

for (const publicFile of metrics.publicFiles) {
  if (!referencedPublicFiles.has(publicFile)) {
    warnings.push('Unreferenced public asset: ' + path.relative(appRoot, publicFile))
  }
}

if (failures.length > 0) {
  console.error('Asset validation failed with ' + failures.length + ' issue(s):')
  for (const failure of failures) console.error('- ' + failure)
  process.exitCode = 1
} else {
  console.log(
    'Assets OK: ' + metrics.publicFiles.length + ' public files (' +
      formatMiB(metrics.publicBytes) + ' MiB), ' + metrics.docsFiles.length +
      ' README images, ' + referencedAssets.size + ' local references.',
  )
}

for (const warning of warnings) console.warn('- ' + warning)
