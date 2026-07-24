import { readFile } from 'node:fs/promises'

const catalogUrl = new URL('../src/data/all_levels.json', import.meta.url)
const levels = JSON.parse(await readFile(catalogUrl, 'utf8'))

const failures = []
const levelIds = new Set()
const chapterIds = new Set()
let objectiveCount = 0
let requiredObjectiveCount = 0
let checkCount = 0
let hintCount = 0

if (!Array.isArray(levels) || levels.length === 0) {
  failures.push('The level catalog must be a non-empty array.')
}

for (const level of levels) {
  if (!level.id) failures.push('A level is missing its id.')
  if (levelIds.has(level.id)) failures.push(`Duplicate level id: ${level.id}`)
  levelIds.add(level.id)
  chapterIds.add(level.chapter_id)

  const objectives = Array.isArray(level.objectives) ? level.objectives : []
  const requiredObjectives = objectives.filter((objective) => objective.required)
  const checks = Array.isArray(level.checks) ? level.checks : []
  const hints = Array.isArray(level.hints) ? level.hints : []

  objectiveCount += objectives.length
  requiredObjectiveCount += requiredObjectives.length
  checkCount += checks.length
  hintCount += hints.length

  const objectiveIds = new Set()
  for (const objective of objectives) {
    if (!objective.id) failures.push(`${level.id}: objective without an id`)
    if (objectiveIds.has(objective.id)) {
      failures.push(`${level.id}: duplicate objective id ${objective.id}`)
    }
    objectiveIds.add(objective.id)
  }

  if (requiredObjectives.length !== checks.length) {
    failures.push(
      `${level.id}: ${requiredObjectives.length} required objectives but ${checks.length} checks`,
    )
  }

  const hintLevels = hints.map((hint) => hint.level).sort((a, b) => a - b)
  if (hintLevels.join(',') !== '1,2,3,4,5') {
    failures.push(`${level.id}: expected hint levels 1-5, received ${hintLevels.join(',')}`)
  }
}

if (failures.length > 0) {
  console.error(`Content validation failed with ${failures.length} issue(s):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(
    `Content OK: ${levels.length} levels, ${chapterIds.size} chapters, ` +
      `${objectiveCount} objectives (${requiredObjectiveCount} required), ` +
      `${checkCount} checks, ${hintCount} hints.`,
  )
}
