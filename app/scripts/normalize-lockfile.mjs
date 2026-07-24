import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { appRoot } from './project-metrics.mjs'

const lockfilePath = path.resolve(appRoot, 'package-lock.json')
const lockfile = JSON.parse(await readFile(lockfilePath, 'utf8'))
let replacements = 0

for (const metadata of Object.values(lockfile.packages ?? {})) {
  if (typeof metadata.resolved !== 'string') continue
  if (metadata.resolved.startsWith('https://registry.npmmirror.com/')) {
    metadata.resolved = metadata.resolved.replace(
      'https://registry.npmmirror.com/',
      'https://registry.npmjs.org/',
    )
    replacements += 1
  }
}

if (replacements > 0) {
  await writeFile(lockfilePath, JSON.stringify(lockfile, null, 2) + '\n')
}

console.log(
  replacements > 0
    ? 'Normalized ' + replacements + ' lockfile URL(s) to registry.npmjs.org.'
    : 'Lockfile registry URLs already normalized.',
)
