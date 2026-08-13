import { readFile, readdir } from 'node:fs/promises'
import { capabilityMetrics } from './report-capabilities.mjs'
import { getEffectiveActionRows, renderGuidedSolution } from './content-contracts.mjs'
import {
  buildProgressCatalog,
  serializeKnownMissionIds,
} from './progress-catalog-tools.mjs'

const catalogUrl = new URL('../src/data/all_levels.json', import.meta.url)
const chapterSummariesUrl = new URL('../src/data/chapter_summaries.json', import.meta.url)
const progressCatalogUrl = new URL('../src/data/progress_catalog.json', import.meta.url)
const knownMissionIdsUrl = new URL('../src/data/knownMissionIds.ts', import.meta.url)
const sourceRootUrl = new URL('../src/', import.meta.url)
const englishLocaleUrl = new URL('../src/i18n/locales/en.json', import.meta.url)
const chineseLocaleUrl = new URL('../src/i18n/locales/zh.json', import.meta.url)
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
const redCommandNames = new Set([
  'apt', 'chmod', 'chown', 'dd', 'dnf', 'docker', 'fdisk', 'kill', 'kubectl', 'mkfs',
  'pacman', 'pkill', 'reboot', 'rm', 'shred', 'shutdown', 'systemctl', 'truncate', 'yum',
])

function dangerousInvocationIsIncomplete(tokens) {
  const [command, subcommand] = tokens
  if (!redCommandNames.has(command)) return false
  if (command === 'rm') return !tokens.slice(1).some(token => !token.startsWith('-'))
  if (command === 'chmod' || command === 'chown') return tokens.length < 3
  if (command === 'truncate') {
    const sizeIndex = tokens.findIndex(token => token === '-s' || token === '--size')
    return sizeIndex < 0 || !tokens[sizeIndex + 1] || !tokens.slice(sizeIndex + 2).some(token => !token.startsWith('-'))
  }
  if (command === 'systemctl' && ['start', 'stop', 'restart', 'enable', 'disable'].includes(subcommand)) {
    return tokens.length < 3
  }
  return tokens.length === 1
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function describeLevel(level, index) {
  return isRecord(level) && isNonEmptyString(level.id) ? level.id : `level[${index}]`
}

function flattenLocale(value, prefix = '', output = new Map()) {
  if (!isRecord(value)) {
    output.set(prefix, value)
    return output
  }
  for (const [key, child] of Object.entries(value)) {
    flattenLocale(child, prefix ? `${prefix}.${key}` : key, output)
  }
  return output
}

function logicalLocaleKey(key) {
  return key.replace(/_(?:one|other)$/, '')
}

function hasLocaleKey(locale, key) {
  return locale.has(key) || (locale.has(`${key}_one`) && locale.has(`${key}_other`))
}

let levels
let chapterSummaries
let progressCatalog
let knownMissionIdsSource
let englishLocale
let chineseLocale
let sourceFiles
try {
  levels = JSON.parse(await readFile(catalogUrl, 'utf8'))
  chapterSummaries = JSON.parse(await readFile(chapterSummariesUrl, 'utf8'))
  progressCatalog = JSON.parse(await readFile(progressCatalogUrl, 'utf8'))
  knownMissionIdsSource = await readFile(knownMissionIdsUrl, 'utf8')
  englishLocale = flattenLocale(JSON.parse(await readFile(englishLocaleUrl, 'utf8')))
  chineseLocale = flattenLocale(JSON.parse(await readFile(chineseLocaleUrl, 'utf8')))
  sourceFiles = (await readdir(sourceRootUrl, { recursive: true }))
    .filter(entry => typeof entry === 'string' && /\.(?:ts|tsx)$/.test(entry))
} catch (error) {
  console.error(`Content validation failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

const failures = []
const levelIds = new Set()
const chapterContracts = new Map()
const chapterLevelCounts = new Map()
let objectiveCount = 0
let requiredObjectiveCount = 0
let checkCount = 0
let hintCount = 0
let verifiedCommandSolutionCount = 0
let guidedActionSolutionCount = 0

for (const [language, locale] of [['en', englishLocale], ['zh', chineseLocale]]) {
  for (const [key, value] of locale) {
    if (!isNonEmptyString(value)) failures.push(`${language} locale key ${key} must be a non-empty string`)
    if (key.endsWith('_one') && !locale.has(`${key.slice(0, -4)}_other`)) {
      failures.push(`${language} locale plural ${key.slice(0, -4)} is missing _other`)
    }
    if (key.endsWith('_other') && !locale.has(`${key.slice(0, -6)}_one`)) {
      failures.push(`${language} locale plural ${key.slice(0, -6)} is missing _one`)
    }
  }
}

const englishLogicalKeys = new Set([...englishLocale.keys()].map(logicalLocaleKey))
const chineseLogicalKeys = new Set([...chineseLocale.keys()].map(logicalLocaleKey))
for (const key of new Set([...englishLogicalKeys, ...chineseLogicalKeys])) {
  if (!englishLogicalKeys.has(key)) failures.push(`English locale is missing logical key ${key}`)
  if (!chineseLogicalKeys.has(key)) failures.push(`Chinese locale is missing logical key ${key}`)
}

for (const entry of sourceFiles) {
  const normalizedEntry = entry.replaceAll('\\', '/')
  const source = await readFile(new URL(normalizedEntry, sourceRootUrl), 'utf8')
  for (const match of source.matchAll(/\bt\(\s*['"]([^'"$`]+)['"]/g)) {
    const key = match[1]
    const line = source.slice(0, match.index).split('\n').length
    if (!hasLocaleKey(englishLocale, key)) failures.push(`${normalizedEntry}:${line}: English locale is missing ${key}`)
    if (!hasLocaleKey(chineseLocale, key)) failures.push(`${normalizedEntry}:${line}: Chinese locale is missing ${key}`)
  }
}

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
      chapterLevelCounts.set(level.chapter_id, (chapterLevelCounts.get(level.chapter_id) ?? 0) + 1)
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

    if (explicitlyBoundChecks !== checks.length) {
      failures.push(
        `${context}: every check requires an explicit objectiveId; legacy ordinal binding is forbidden`,
      )
    } else if (checks.length > 0) {
      for (const objective of requiredObjectives) {
        if (!checks.some(check => check.objectiveId === objective.id)) {
          failures.push(`${context}: required objective ${objective.id} has no explicitly bound check`)
        }
      }
    }

    const requiredSkillObjectives = requiredObjectives.filter(objective => /^obj-\d+$/.test(objective.id))
    let legacyObjectiveIndex = 0
    for (const check of checks) {
      if (!isRecord(check) || check.type === 'no_red_command_used') continue
      const objective = check.objectiveId
        ? objectives.find(candidate => candidate.id === check.objectiveId)
        : requiredSkillObjectives[legacyObjectiveIndex++]
      if (check.type !== 'command_used' || !isNonEmptyString(check.pattern)) continue
      let effectivePattern = check.pattern.trim()
      const expected = objective?.label_en?.match(/^Master the use of (.+)$/i)?.[1]?.trim()
      if (expected && expected.toLowerCase().startsWith(`${effectivePattern.toLowerCase()} `)) {
        effectivePattern = expected
      }
      const tokens = effectivePattern.split(/\s+/)
      if (dangerousInvocationIsIncomplete(tokens)) {
        failures.push(`${context}: dangerous command objective must name a complete exact invocation: ${effectivePattern}`)
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
      if (hint.level !== 5 && hint.solution_type !== undefined) {
        failures.push(`${context}: only the H5 hint may declare solution_type`)
      }
    }
    hintLevels.sort((a, b) => a - b)
    if (hintLevels.join(',') !== '1,2,3,4,5') {
      failures.push(`${context}: expected hint levels 1-5, received ${hintLevels.join(',')}`)
    }

    const h5 = hints.find(hint => hint.level === 5)
    if (h5?.solution_type === 'verified_command') {
      verifiedCommandSolutionCount += 1
      if (!/^Full solution:\s*\S/i.test(h5.text_en)) {
        failures.push(`${context}: verified_command H5 requires a non-empty English transcript`)
      }
      if (!/^完整解答[：:]\s*\S/u.test(h5.text_zh)) {
        failures.push(`${context}: verified_command H5 requires a non-empty Chinese transcript`)
      }
      if (/^Full solution:\s*Use '/i.test(h5.text_en)) {
        failures.push(`${context}: verified_command H5 cannot use the legacy generic template`)
      }
    } else if (h5?.solution_type === 'guided_actions') {
      guidedActionSolutionCount += 1
      try {
        const expected = renderGuidedSolution(level, getEffectiveActionRows(level, checks))
        if (h5.text_en !== expected.text_en || h5.text_zh !== expected.text_zh) {
          failures.push(`${context}: guided_actions H5 has drifted from its objective/check contract`)
        }
      } catch (error) {
        failures.push(
          `${context}: guided_actions H5 cannot be derived: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        )
      }
    } else {
      failures.push(`${context}: H5 solution_type must be verified_command or guided_actions`)
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

if (chapterContracts.size !== 17) {
  failures.push(`catalog must contain exactly 17 chapters, found ${chapterContracts.size}`)
}
for (const [chapterId, levelCount] of chapterLevelCounts) {
  if (levelCount !== 13) failures.push(`${chapterId}: expected 13 levels, found ${levelCount}`)
}

if (!Array.isArray(chapterSummaries) || chapterSummaries.length !== chapterContracts.size) {
  failures.push('chapter_summaries.json must contain exactly one row per catalog chapter')
} else {
  const summariesById = new Map(chapterSummaries.map(summary => [summary.id, summary]))
  for (const [chapterId, contract] of chapterContracts) {
    const [titleEn, titleZh, skill] = contract.split('\u0000')
    const summary = summariesById.get(chapterId)
    if (!summary || summary.title_en !== titleEn || summary.title_zh !== titleZh || summary.skill !== skill) {
      failures.push(`${chapterId}: chapter_summaries.json disagrees with the mission catalog`)
    }
  }
}

const expectedProgressCatalog = buildProgressCatalog(levels)
if (JSON.stringify(progressCatalog) !== JSON.stringify(expectedProgressCatalog)) {
  failures.push(
    'progress_catalog.json is stale or malformed; run npm run generate:progress-catalog',
  )
}
if (knownMissionIdsSource !== serializeKnownMissionIds(levels)) {
  failures.push(
    'knownMissionIds.ts is stale or malformed; run npm run generate:progress-catalog',
  )
}

if (capabilityMetrics.blockedLevels > 0) {
  failures.push(
    `capability registry has ${capabilityMetrics.blockedLevels} unmapped level(s) ` +
      `and ${capabilityMetrics.unsupportedChecks} unsupported command check(s)`,
  )
}

if (failures.length > 0) {
  console.error(`Content validation failed with ${failures.length} issue(s):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(
    `Content OK: ${levels.length} levels, ${chapterContracts.size} chapters, ` +
      `${objectiveCount} objectives (${requiredObjectiveCount} required), ` +
      `${checkCount} explicitly bound checks, ${hintCount} hints ` +
      `(${verifiedCommandSolutionCount} verified commands, ` +
      `${guidedActionSolutionCount} guided action checklists).`,
  )
}
