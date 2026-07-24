import { readFile } from 'node:fs/promises'

const catalogUrl = new URL('../src/data/all_levels.json', import.meta.url)
const allowedModes = new Set(['academy', 'operation', 'boss', 'nightmare'])
const allowedRiskLevels = new Set(['green', 'blue', 'yellow', 'red', 'purple', 'black'])
const allowedCheckTypes = new Set([
  'file_exists',
  'file_contains',
  'file_not_contains',
  'command_used',
  'command_not_used',
  'git_clean',
  'git_branch',
  'git_commit_exists',
  'no_red_command_used',
])
const patternCheckTypes = new Set([
  'file_exists',
  'file_contains',
  'file_not_contains',
  'command_used',
  'command_not_used',
  'git_branch',
])
const scoringWeights = [
  'objectives_weight',
  'safety_weight',
  'verification_weight',
  'efficiency_weight',
  'shortcuts_weight',
  'review_weight',
  'no_hints_bonus',
]
const penaltyKeys = [
  'red_command',
  'unverified_fix',
  'dirty_git',
  'kill_critical',
  'excessive_perms',
]

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function describeLevel(level, index) {
  return isRecord(level) && isNonEmptyString(level.id) ? level.id : `level[${index}]`
}

let levels
try {
  levels = JSON.parse(await readFile(catalogUrl, 'utf8'))
} catch (error) {
  console.error(`Content validation failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

const failures = []
const levelIds = new Set()
const chapterContracts = new Map()
let objectiveCount = 0
let requiredObjectiveCount = 0
let checkCount = 0
let hintCount = 0

if (!Array.isArray(levels) || levels.length === 0) {
  failures.push('The level catalog must be a non-empty array.')
} else {
  levels.forEach((level, levelIndex) => {
    const context = describeLevel(level, levelIndex)
    if (!isRecord(level)) {
      failures.push(`${context}: level must be an object`)
      return
    }

    if (!isNonEmptyString(level.id)) failures.push(`${context}: missing id`)
    else if (levelIds.has(level.id)) failures.push(`${context}: duplicate level id`)
    else levelIds.add(level.id)

    for (const field of [
      'title_en', 'title_zh', 'chapter_id', 'chapter_title_en', 'chapter_title_zh',
      'chapter_skill', 'estimated_time', 'summary_en', 'summary_zh',
    ]) {
      if (!isNonEmptyString(level[field])) failures.push(`${context}: ${field} must be a non-empty string`)
    }
    if (!allowedModes.has(level.mode)) failures.push(`${context}: unsupported mode ${String(level.mode)}`)
    if (!allowedRiskLevels.has(level.risk_level)) failures.push(`${context}: unsupported risk level ${String(level.risk_level)}`)
    if (!Number.isInteger(level.difficulty) || level.difficulty < 1 || level.difficulty > 5) {
      failures.push(`${context}: difficulty must be an integer from 1 to 5`)
    }

    if (isNonEmptyString(level.chapter_id)) {
      const chapterContract = `${level.chapter_title_en}\u0000${level.chapter_title_zh}\u0000${level.chapter_skill}`
      const existingContract = chapterContracts.get(level.chapter_id)
      if (existingContract && existingContract !== chapterContract) {
        failures.push(`${context}: chapter metadata disagrees with other ${level.chapter_id} levels`)
      } else {
        chapterContracts.set(level.chapter_id, chapterContract)
      }
    }

    if (!isRecord(level.story)) {
      failures.push(`${context}: story must be an object`)
    } else {
      for (const field of ['briefing_en', 'briefing_zh', 'success_en', 'success_zh', 'failure_en', 'failure_zh']) {
        if (!isNonEmptyString(level.story[field])) failures.push(`${context}: story.${field} must be a non-empty string`)
      }
    }

    if (!Array.isArray(level.skills) || level.skills.length === 0 || level.skills.some(skill => !isNonEmptyString(skill))) {
      failures.push(`${context}: skills must be a non-empty string array`)
    }

    const objectives = Array.isArray(level.objectives) ? level.objectives : []
    const checks = Array.isArray(level.checks) ? level.checks : []
    const hints = Array.isArray(level.hints) ? level.hints : []
    if (!Array.isArray(level.objectives) || objectives.length === 0) failures.push(`${context}: objectives must be a non-empty array`)
    if (!Array.isArray(level.checks) || checks.length === 0) failures.push(`${context}: checks must be a non-empty array`)
    if (!Array.isArray(level.hints)) failures.push(`${context}: hints must be an array`)

    objectiveCount += objectives.length
    checkCount += checks.length
    hintCount += hints.length

    const objectiveIds = new Set()
    const requiredObjectives = []
    for (const [objectiveIndex, objective] of objectives.entries()) {
      if (!isRecord(objective)) {
        failures.push(`${context}: objective[${objectiveIndex}] must be an object`)
        continue
      }
      if (!isNonEmptyString(objective.id)) failures.push(`${context}: objective[${objectiveIndex}] missing id`)
      else if (objectiveIds.has(objective.id)) failures.push(`${context}: duplicate objective id ${objective.id}`)
      else objectiveIds.add(objective.id)
      if (!isNonEmptyString(objective.label_en) || !isNonEmptyString(objective.label_zh)) {
        failures.push(`${context}: objective ${objective.id ?? objectiveIndex} requires English and Chinese labels`)
      }
      if (typeof objective.required !== 'boolean') {
        failures.push(`${context}: objective ${objective.id ?? objectiveIndex} required must be boolean`)
      } else if (objective.required) {
        requiredObjectives.push(objective)
      }
    }
    requiredObjectiveCount += requiredObjectives.length
    if (requiredObjectives.length === 0) failures.push(`${context}: at least one objective must be required`)

    let explicitlyBoundChecks = 0
    for (const [checkIndex, check] of checks.entries()) {
      if (!isRecord(check)) {
        failures.push(`${context}: check[${checkIndex}] must be an object`)
        continue
      }
      if (!allowedCheckTypes.has(check.type)) failures.push(`${context}: check[${checkIndex}] has unsupported type ${String(check.type)}`)
      if (patternCheckTypes.has(check.type) && !isNonEmptyString(check.pattern)) {
        failures.push(`${context}: check[${checkIndex}] type ${check.type} requires a pattern`)
      }
      if (check.objectiveId !== undefined) {
        explicitlyBoundChecks += 1
        if (!isNonEmptyString(check.objectiveId) || !objectiveIds.has(check.objectiveId)) {
          failures.push(`${context}: check[${checkIndex}] references unknown objective ${String(check.objectiveId)}`)
        } else if (
          check.type === 'no_red_command_used' &&
          !requiredObjectives.some(objective => objective.id === check.objectiveId)
        ) {
          failures.push(`${context}: safety check[${checkIndex}] must bind to a required objective`)
        }
      }
    }

    if (explicitlyBoundChecks > 0 && explicitlyBoundChecks !== checks.length) {
      failures.push(`${context}: checks must be either all explicitly bound or all use the legacy ordinal contract`)
    } else if (explicitlyBoundChecks === checks.length && checks.length > 0) {
      for (const objective of requiredObjectives) {
        if (!checks.some(check => check.objectiveId === objective.id)) {
          failures.push(`${context}: required objective ${objective.id} has no explicitly bound check`)
        }
      }
    } else {
      const progressChecks = checks.filter(check => check.type !== 'no_red_command_used')
      const requiredSkillObjectives = requiredObjectives.filter(objective => /^obj-\d+$/.test(objective.id))
      const aggregateObjectives = requiredObjectives.filter(objective => !/^obj-\d+$/.test(objective.id))
      if (requiredObjectives.length !== checks.length) {
        failures.push(`${context}: ${requiredObjectives.length} required objectives but ${checks.length} checks`)
      }
      if (requiredSkillObjectives.length !== progressChecks.length) {
        failures.push(`${context}: ${requiredSkillObjectives.length} required skill objectives but ${progressChecks.length} progress checks`)
      }
      if (aggregateObjectives.length !== 1) {
        failures.push(`${context}: legacy levels require exactly one aggregate required objective`)
      }
      const safetyChecks = checks.filter(check => check.type === 'no_red_command_used')
      if (safetyChecks.length !== 1 || checks[checks.length - 1]?.type !== 'no_red_command_used') {
        failures.push(`${context}: legacy levels require one trailing no_red_command_used safety check`)
      }
    }

    const hintLevels = []
    for (const [hintIndex, hint] of hints.entries()) {
      if (!isRecord(hint)) {
        failures.push(`${context}: hint[${hintIndex}] must be an object`)
        continue
      }
      hintLevels.push(hint.level)
      if (!isNonEmptyString(hint.text_en) || !isNonEmptyString(hint.text_zh)) {
        failures.push(`${context}: hint level ${String(hint.level)} requires English and Chinese text`)
      }
    }
    hintLevels.sort((a, b) => a - b)
    if (hintLevels.join(',') !== '1,2,3,4,5') {
      failures.push(`${context}: expected hint levels 1-5, received ${hintLevels.join(',')}`)
    }

    if (!isRecord(level.scoring)) {
      failures.push(`${context}: scoring must be an object`)
    } else {
      if (!Number.isFinite(level.scoring.max_score) || level.scoring.max_score <= 0) {
        failures.push(`${context}: scoring.max_score must be positive`)
      }
      let weightTotal = 0
      for (const field of scoringWeights) {
        const value = level.scoring[field]
        if (!Number.isFinite(value) || value < 0) failures.push(`${context}: scoring.${field} must be non-negative`)
        else weightTotal += value
      }
      if (Number.isFinite(level.scoring.max_score) && weightTotal !== level.scoring.max_score) {
        failures.push(`${context}: scoring weights total ${weightTotal}, expected ${level.scoring.max_score}`)
      }
      if (!isRecord(level.scoring.penalties)) {
        failures.push(`${context}: scoring.penalties must be an object`)
      } else {
        for (const field of penaltyKeys) {
          const value = level.scoring.penalties[field]
          if (!Number.isFinite(value) || value > 0) failures.push(`${context}: scoring.penalties.${field} must be zero or negative`)
        }
      }
    }
  })
}

if (failures.length > 0) {
  console.error(`Content validation failed with ${failures.length} issue(s):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(
    `Content OK: ${levels.length} levels, ${chapterContracts.size} chapters, ` +
      `${objectiveCount} objectives (${requiredObjectiveCount} required), ` +
      `${checkCount} checks, ${hintCount} hints.`,
  )
}
