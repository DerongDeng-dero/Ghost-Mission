import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { appRoot, listFiles } from './project-metrics.mjs'

const packageJson = JSON.parse(await readFile(path.resolve(appRoot, 'package.json'), 'utf8'))
const lockfile = JSON.parse(await readFile(path.resolve(appRoot, 'package-lock.json'), 'utf8'))
const failures = []
const warnings = []

function sameObject(left = {}, right = {}) {
  const leftEntries = Object.entries(left).sort(([a], [b]) => a.localeCompare(b))
  const rightEntries = Object.entries(right).sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries)
}

const lockRoot = lockfile.packages?.['']
if (lockfile.lockfileVersion !== 3) failures.push('package-lock.json must use lockfileVersion 3.')
if (!lockRoot) {
  failures.push('package-lock.json is missing its root package entry.')
} else {
  if (lockRoot.name !== packageJson.name || lockRoot.version !== packageJson.version) {
    failures.push('package.json name/version do not match the lockfile root.')
  }
  if (!sameObject(lockRoot.dependencies, packageJson.dependencies)) {
    failures.push('Production dependencies do not match the lockfile root.')
  }
  if (!sameObject(lockRoot.devDependencies, packageJson.devDependencies)) {
    failures.push('Development dependencies do not match the lockfile root.')
  }
  if (!sameObject(lockRoot.engines, packageJson.engines)) {
    failures.push('Node engine requirements do not match the lockfile root.')
  }
}

const allowedRegistryHosts = new Set(['registry.npmjs.org'])
const registryHosts = new Map()
for (const [packagePath, metadata] of Object.entries(lockfile.packages ?? {})) {
  if (!metadata.resolved) continue
  let host
  try {
    host = new URL(metadata.resolved).host
  } catch {
    failures.push(packagePath + ': invalid resolved URL ' + metadata.resolved)
    continue
  }
  registryHosts.set(host, (registryHosts.get(host) ?? 0) + 1)
  if (!allowedRegistryHosts.has(host)) {
    failures.push(packagePath + ': unapproved lockfile registry host ' + host)
  }
  if (!metadata.integrity) {
    failures.push(packagePath + ': remote package has no integrity hash')
  }
}

const dependencyNames = new Set(Object.keys(packageJson.dependencies ?? {}))
const devDependencyNames = new Set(Object.keys(packageJson.devDependencies ?? {}))
for (const dependency of dependencyNames) {
  if (devDependencyNames.has(dependency)) {
    failures.push(dependency + ': declared as both a production and development dependency')
  }
  if (dependency.startsWith('@types/')) {
    failures.push(dependency + ': type packages belong in devDependencies')
  }
}
if (dependencyNames.has('xterm')) {
  failures.push('xterm: deprecated package must not coexist with the @xterm package family')
}

function packageNameFromSpecifier(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) {
    return null
  }
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

const importedPackages = new Set()
const importPatterns = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
]
const scannedExtensions = new Set(['.css', '.js', '.jsx', '.mjs', '.ts', '.tsx'])
const scannedFiles = (await listFiles(path.resolve(appRoot, 'src'))).filter((file) =>
  scannedExtensions.has(path.extname(file).toLowerCase()),
)
for (const name of [
  'eslint.config.js',
  'postcss.config.js',
  'tailwind.config.js',
  'vite.config.ts',
]) {
  scannedFiles.push(path.resolve(appRoot, name))
}
scannedFiles.push(
  ...(await listFiles(path.resolve(appRoot, 'scripts'))).filter((file) =>
    scannedExtensions.has(path.extname(file).toLowerCase()),
  ),
)

for (const file of scannedFiles) {
  const source = await readFile(file, 'utf8')
  for (const pattern of importPatterns) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(source)) !== null) {
      const dependency = packageNameFromSpecifier(match[1])
      if (dependency) importedPackages.add(dependency)
    }
  }
}

// PostCSS resolves these object keys as plugins, and TypeScript/ESLint/Vite are
// invoked by package scripts rather than imported by application modules.
for (const toolPackage of ['autoprefixer', 'postcss', 'tailwindcss', 'typescript', 'eslint', 'vite']) {
  importedPackages.add(toolPackage)
}
for (const dependency of devDependencyNames) {
  if (dependency.startsWith('@types/')) importedPackages.add(dependency)
}

for (const dependency of [...dependencyNames, ...devDependencyNames]) {
  if (!importedPackages.has(dependency)) {
    failures.push(dependency + ': direct dependency has no source, config, or script import')
  }
}

for (const [host, count] of registryHosts) {
  if (host !== 'registry.npmjs.org') warnings.push(host + ': ' + count + ' lockfile entries')
}

if (failures.length > 0) {
  console.error('Dependency validation failed with ' + failures.length + ' issue(s):')
  for (const failure of failures) console.error('- ' + failure)
  process.exitCode = 1
} else {
  console.log(
    'Dependencies OK: ' + dependencyNames.size + ' production, ' + devDependencyNames.size +
      ' development, ' + (lockfile.packages ? Object.keys(lockfile.packages).length - 1 : 0) +
      ' locked packages from registry.npmjs.org.',
  )
}

for (const warning of warnings) console.warn('- ' + warning)
