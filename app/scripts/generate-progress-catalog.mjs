import { readFile, writeFile } from 'node:fs/promises'
import {
  buildProgressCatalog,
  serializeKnownMissionIds,
} from './progress-catalog-tools.mjs'

const sourceUrl = new URL('../src/data/all_levels.json', import.meta.url)
const outputUrl = new URL('../src/data/progress_catalog.json', import.meta.url)
const missionIdsOutputUrl = new URL('../src/data/knownMissionIds.ts', import.meta.url)
const levels = JSON.parse(await readFile(sourceUrl, 'utf8'))
const catalog = buildProgressCatalog(levels)

await writeFile(outputUrl, JSON.stringify(catalog, null, 2) + '\n', 'utf8')
await writeFile(missionIdsOutputUrl, serializeKnownMissionIds(levels), 'utf8')
console.log(`Generated ${catalog.length} lightweight progress catalog entries and mission IDs.`)
