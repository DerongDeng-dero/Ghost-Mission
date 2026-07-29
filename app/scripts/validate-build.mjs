import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { appRoot, workspaceRoot, getAssetMetrics, listFiles } from './project-metrics.mjs'

const distRoot = path.resolve(appRoot, 'dist')
const manifestPath = path.resolve(distRoot, '.vite/manifest.json')
const failures = []
let manifest

try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
} catch (error) {
  console.error('Build validation failed: missing or invalid dist/.vite/manifest.json.')
  throw error
}

const entry = Object.entries(manifest).find(([, value]) => value.isEntry)
if (!entry) failures.push('Vite manifest has no entry chunk.')

const manifestFiles = new Set()
for (const [key, value] of Object.entries(manifest)) {
  for (const file of [value.file, ...(value.css ?? []), ...(value.assets ?? [])]) {
    if (!file) continue
    manifestFiles.add(file)
    try {
      if (!(await stat(path.resolve(distRoot, file))).isFile()) {
        failures.push(key + ': manifest output is not a file: ' + file)
      }
    } catch {
      failures.push(key + ': missing manifest output ' + file)
    }
  }
  for (const dependency of [...(value.imports ?? []), ...(value.dynamicImports ?? [])]) {
    if (!manifest[dependency]) failures.push(key + ': missing manifest dependency ' + dependency)
  }
}

const indexHtml = await readFile(path.resolve(distRoot, 'index.html'), 'utf8')
if (/\b(?:src|href)=["']\/(?!\/)/i.test(indexHtml)) {
  failures.push('dist/index.html contains a root-absolute local URL; relative hosting would break.')
}
for (const match of indexHtml.matchAll(/\b(?:src|href)=["'](?!https?:|data:)([^"']+)["']/gi)) {
  const localPath = match[1].replace(/^\.\//, '').split(/[?#]/, 1)[0]
  try {
    if (!(await stat(path.resolve(distRoot, localPath))).isFile()) {
      failures.push('dist/index.html references missing output ' + match[1])
    }
  } catch {
    failures.push('dist/index.html references missing output ' + match[1])
  }
}

const initialManifestKeys = new Set()
function collectInitial(key) {
  if (initialManifestKeys.has(key) || !manifest[key]) return
  initialManifestKeys.add(key)
  for (const imported of manifest[key].imports ?? []) collectInitial(imported)
}
if (entry) collectInitial(entry[0])

const outputFiles = await listFiles(distRoot)
const javascriptFiles = outputFiles.filter((file) => path.extname(file) === '.js')
const cssFiles = outputFiles.filter((file) => path.extname(file) === '.css')
const sourceMaps = outputFiles.filter((file) => path.extname(file) === '.map')
if (sourceMaps.length > 0) failures.push('Production build unexpectedly contains source maps.')
for (const file of javascriptFiles) {
  if ((await readFile(file, 'utf8')).includes('"code-path"')) {
    failures.push(
      path.basename(file) + ': contains development-only source location attributes.',
    )
  }
}

async function compressedSize(file) {
  return gzipSync(await readFile(file), { level: 9 }).length
}

const javascriptSizes = await Promise.all(
  javascriptFiles.map(async (file) => ({
    file,
    raw: (await stat(file)).size,
    gzip: await compressedSize(file),
  })),
)
const initialFiles = new Set(
  [...initialManifestKeys]
    .map((key) => manifest[key]?.file)
    .filter((file) => file?.endsWith('.js')),
)
const initialSizes = javascriptSizes.filter((entrySize) =>
  initialFiles.has(path.relative(distRoot, entrySize.file).replaceAll('\\', '/')),
)

const initialRaw = initialSizes.reduce((sum, item) => sum + item.raw, 0)
const initialGzip = initialSizes.reduce((sum, item) => sum + item.gzip, 0)
const totalJsRaw = javascriptSizes.reduce((sum, item) => sum + item.raw, 0)
const totalJsGzip = javascriptSizes.reduce((sum, item) => sum + item.gzip, 0)
const totalCssGzip = (await Promise.all(cssFiles.map(compressedSize))).reduce(
  (sum, size) => sum + size,
  0,
)
const largestJavascript = javascriptSizes.toSorted((a, b) => b.raw - a.raw)[0]
const dynamicBoundaries = new Set(
  Object.values(manifest).flatMap((value) => value.dynamicImports ?? []),
)

const readme = await readFile(path.resolve(workspaceRoot, 'README.md'), 'utf8')
const initialRawKiB = Math.round(initialRaw / 1024)
const initialGzipKiB = Math.round(initialGzip / 1024)
const documentedBuildMetrics =
  `首载 ${initialFiles.size} 个 JS 块，约 ${initialRawKiB.toLocaleString('en-US')} KiB raw / ` +
  `${initialGzipKiB.toLocaleString('en-US')} KiB gzip；${dynamicBoundaries.size} 个动态边界，约 ` +
  `${Math.round(totalJsGzip / 1024).toLocaleString('en-US')} KiB total JS gzip`
if (!readme.includes(documentedBuildMetrics)) {
  failures.push('README production-build metrics do not match the current manifest.')
}

const initialMetricPattern = /首载[^\r\n]*?([0-9][0-9,]*) KiB raw\s*\/\s*([0-9][0-9,]*) KiB gzip/gi
for (const [lineIndex, line] of readme.split(/\r?\n/).entries()) {
  initialMetricPattern.lastIndex = 0
  let match
  while ((match = initialMetricPattern.exec(line)) !== null) {
    const documentedRawKiB = Number(match[1].replaceAll(',', ''))
    const documentedGzipKiB = Number(match[2].replaceAll(',', ''))
    if (documentedRawKiB !== initialRawKiB || documentedGzipKiB !== initialGzipKiB) {
      failures.push(
        `README line ${lineIndex + 1} contains stale initial-build metrics: ` +
          `${match[1]} KiB raw / ${match[2]} KiB gzip; expected ` +
          `${initialRawKiB.toLocaleString('en-US')} KiB raw / ` +
          `${initialGzipKiB.toLocaleString('en-US')} KiB gzip.`,
      )
    }
  }
}

if (initialGzip > 400 * 1024) {
  failures.push('Initial JavaScript exceeds the 400 KiB gzip budget.')
}
if (totalJsGzip > 750 * 1024) {
  failures.push('Total JavaScript exceeds the 750 KiB gzip budget.')
}
if (totalCssGzip > 32 * 1024) {
  failures.push('Total CSS exceeds the 32 KiB gzip budget.')
}
if (largestJavascript?.raw > 800 * 1024) {
  failures.push(
    path.basename(largestJavascript.file) + ': exceeds the 800 KiB raw chunk budget.',
  )
}
if (dynamicBoundaries.size < 7) {
  failures.push('Expected at least 7 route-level dynamic import boundaries.')
}

const sourceAssets = await getAssetMetrics()
for (const sourceFile of sourceAssets.publicFiles) {
  const relative = path.relative(path.resolve(appRoot, 'public'), sourceFile)
  const builtFile = path.resolve(distRoot, relative)
  try {
    if ((await stat(sourceFile)).size !== (await stat(builtFile)).size) {
      failures.push(relative + ': public asset size changed during build.')
    }
  } catch {
    failures.push(relative + ': public asset missing from dist/.')
  }
}

function formatKiB(bytes) {
  return Math.round(bytes / 1024) + ' KiB'
}

if (failures.length > 0) {
  console.error('Build validation failed with ' + failures.length + ' issue(s):')
  for (const failure of failures) console.error('- ' + failure)
  process.exitCode = 1
} else {
  console.log(
    'Build OK: ' + initialFiles.size + ' initial JS chunks (' + formatKiB(initialRaw) +
      ' raw / ' + formatKiB(initialGzip) + ' gzip), ' + dynamicBoundaries.size +
      ' dynamic boundaries, ' + formatKiB(totalJsGzip) + ' total JS gzip.',
  )
}
