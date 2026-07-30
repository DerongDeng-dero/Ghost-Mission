import type { MissionLevel, LevelCheck } from './levels'
import type { GitState } from './git'

export interface ValidationResult {
  objectiveId: string
  completed: boolean
  label: string
}

export interface ScoreResult {
  total: number
  max: number
  breakdown: Record<string, number>
  breakdownMax: Record<string, number>
  rating: string
  penalties: string[]
  excludedCategories: string[]
}

export interface MissionState {
  commandHistory: string[]
  attemptedCommandHistory?: string[]
  gitState: GitState
  vfs: { files: Record<string, string> }
  redCommandsUsed: string[]
  hintsUsed: number
  objectivesCompleted: Set<string>
}

export function matchesMissionCommand(command: string, pattern: string): boolean {
  const candidate = command.trim()
  const target = pattern.trim()
  if (!candidate || !target) return false

  // Catalog patterns are command/action literals, not regular expressions.
  // Punctuation-only patterns describe operators, paths, editor commands, or
  // search gestures and therefore intentionally match inside the submitted
  // action. Word-like patterns must start a simple command segment so an
  // innocent `echo dd` cannot satisfy a task that requires running `dd`.
  if (!/^[\p{L}\p{N}_]/u.test(target)) {
    if (target === ':%s') return candidate.startsWith(':%s/')
    if ((target === '.env' || target.startsWith('/')) && !target.includes(' ')) {
      return tokenizeAction(candidate).some(token =>
        token === target || (target.startsWith('/') && token.startsWith(`${target}/`)),
      )
    }
    return candidate === target
  }

  const expectedTokens = tokenizeAction(target)
  if (expectedTokens.length === 0) return false
  return splitSimpleCommands(candidate).some(segment => {
    const actualTokens = stripCommandPrefixes(tokenizeAction(segment))
    if (actualTokens.length < expectedTokens.length) return false
    return expectedTokens.every(
      (token, index) => {
        const actual = actualTokens[index]
        if (actual === token) return true
        // Short POSIX flags may be grouped (`tar -czf`, `rm -rf`). A lesson
        // asking for `tar -c` should recognize the same flag inside a grouped
        // option without weakening case sensitivity or token boundaries.
        if (
          index > 0
          && /^-[A-Za-z]+$/.test(token)
          && /^-[A-Za-z]+$/.test(actual)
          && token.length < actual.length
        ) {
          return [...token.slice(1)].every(flag => actual.slice(1).includes(flag))
        }
        return false
      },
    )
  })
}

function splitSimpleCommands(line: string): string[] {
  const segments: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaped = false

  const push = () => {
    if (current.trim()) segments.push(current.trim())
    current = ''
  }

  for (let index = 0; index < line.length; index++) {
    const character = line[index]
    if (escaped) {
      current += character
      escaped = false
      continue
    }
    if (character === '\\' && quote !== "'") {
      current += character
      escaped = true
      continue
    }
    if (quote) {
      current += character
      if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      current += character
      continue
    }
    if (character === ';' || character === '|') {
      push()
      if (line[index + 1] === character) index++
      continue
    }
    if (character === '&' && line[index + 1] === '&') {
      push()
      index++
      continue
    }
    current += character
  }
  push()
  return segments
}

function tokenizeAction(value: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaped = false

  const push = () => {
    if (current) tokens.push(current)
    current = ''
  }

  for (const character of value) {
    if (escaped) {
      current += character
      escaped = false
      continue
    }
    if (character === '\\' && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (character === quote) quote = null
      else current += character
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (/\s/u.test(character)) {
      push()
      continue
    }
    current += character
  }
  if (escaped) current += '\\'
  push()
  return tokens
}

function stripCommandPrefixes(tokens: string[]): string[] {
  const remaining = [...tokens]
  while (remaining[0] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(remaining[0])) remaining.shift()
  if (remaining[0] !== 'sudo') return remaining

  remaining.shift()
  const sudoOptionsWithValue = new Set([
    '-C', '-D', '-g', '-h', '-p', '-R', '-T', '-u',
    '--chdir', '--group', '--host', '--prompt', '--role', '--type', '--user',
  ])
  while (remaining[0]?.startsWith('-')) {
    const option = remaining.shift()!
    if (option === '--') break
    const optionName = option.split('=', 1)[0]
    if (!option.includes('=') && sudoOptionsWithValue.has(optionName)) remaining.shift()
  }
  while (remaining[0] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(remaining[0])) remaining.shift()
  return remaining
}

function compileContentPattern(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, 'i')
  } catch {
    return null
  }
}

export function getEffectiveChecks(level: MissionLevel): LevelCheck[] {
  if (level.checks.some(check => Boolean(check.objectiveId))) return level.checks
  const legacyObjectives = level.objectives.filter(
    objective => objective.required && /^obj-\d+$/.test(objective.id),
  )
  let progressIndex = 0
  return level.checks.map(check => {
    if (check.type === 'no_red_command_used') return check
    const objective = legacyObjectives[progressIndex++]
    if (check.type !== 'command_used' || !check.pattern || !objective) return check
    const expected = objective.label_en.match(/^Master the use of (.+)$/i)?.[1]?.trim()
    if (
      expected
      && expected.toLocaleLowerCase().startsWith(`${check.pattern.toLocaleLowerCase()} `)
    ) {
      return { ...check, pattern: expected }
    }
    return check
  })
}

export function getObjectiveChecks(level: MissionLevel, objectiveId: string): LevelCheck[] {
  const effectiveChecks = getEffectiveChecks(level)
  const hasExplicitBindings = effectiveChecks.some(check => Boolean(check.objectiveId))

  if (hasExplicitBindings) {
    const explicitBindingsValid = effectiveChecks.every(check => {
      if (!check.objectiveId) return false
      const objective = level.objectives.find(candidate => candidate.id === check.objectiveId)
      if (!objective) return false
      return check.type !== 'no_red_command_used' || objective.required
    })
    return explicitBindingsValid
      ? effectiveChecks.filter(check => check.objectiveId === objectiveId)
      : []
  }

  // Legacy catalog contract: required obj-N entries correspond, in order,
  // to progress checks. The one required non-numeric objective summarizes
  // every effective check, including the safety check. Optional objectives
  // intentionally stay unbound.
  const progressChecks = effectiveChecks.filter(check => check.type !== 'no_red_command_used')
  const legacySkillObjectives = level.objectives.filter(
    objective => objective.required && /^obj-\d+$/.test(objective.id),
  )
  const objectiveIndex = legacySkillObjectives.findIndex(objective => objective.id === objectiveId)
  if (objectiveIndex >= 0) {
    const check = progressChecks[objectiveIndex]
    return check ? [check] : []
  }

  const legacyAggregateObjectives = level.objectives.filter(
    objective => objective.required && !/^obj-\d+$/.test(objective.id),
  )
  return legacyAggregateObjectives.length === 1 && legacyAggregateObjectives[0].id === objectiveId
    ? effectiveChecks
    : []
}

function matchesAuthorizedRedCommand(command: string, pattern: string): boolean {
  const expectedTokens = stripCommandPrefixes(tokenizeAction(pattern))
  const actualTokens = stripCommandPrefixes(tokenizeAction(command))
  if (expectedTokens.length === 0 || actualTokens.length !== expectedTokens.length) return false
  return expectedTokens.every((token, index) => actualTokens[index] === token)
}

export function getUnexpectedRedCommands(level: MissionLevel, redCommands: string[]): string[] {
  const allowedRedPatterns = getEffectiveChecks(level)
    .filter(candidate => candidate.type === 'command_used' && candidate.pattern)
    .map(candidate => candidate.pattern!)
  return redCommands.filter(redCommand =>
    !allowedRedPatterns.some(pattern => matchesAuthorizedRedCommand(redCommand, pattern)),
  )
}

export function validateMission(level: MissionLevel, state: MissionState): ValidationResult[] {
  const results: ValidationResult[] = []
  for (const obj of level.objectives) {
    const relevantChecks = getObjectiveChecks(level, obj.id)
    const completed = (
      relevantChecks.length > 0
      && relevantChecks.every(check => evaluateCheck(check, state, level))
    )

    results.push({ objectiveId: obj.id, completed, label: obj.getLabel('en') })
  }
  return results
}

function evaluateCheck(check: LevelCheck, state: MissionState, level: MissionLevel): boolean {
  switch (check.type) {
    case 'command_used': {
      if (!check.pattern) return false
      return state.commandHistory.some(command => matchesMissionCommand(command, check.pattern!))
    }
    case 'command_not_used': {
      if (!check.pattern) return false
      const attemptedCommands = state.attemptedCommandHistory ?? state.commandHistory
      return !attemptedCommands.some(command => matchesMissionCommand(command, check.pattern!))
    }
    case 'file_exists': {
      if (!check.pattern) return false
      return Object.prototype.hasOwnProperty.call(state.vfs.files, check.pattern)
    }
    case 'file_contains': {
      if (!check.pattern) return false
      // pattern format: "filename:regex" or just regex to check all files
      const separatorIndex = check.pattern.indexOf(':')
      if (separatorIndex >= 0) {
        const filename = check.pattern.slice(0, separatorIndex)
        if (!Object.prototype.hasOwnProperty.call(state.vfs.files, filename)) return false
        const contentRegex = compileContentPattern(check.pattern.slice(separatorIndex + 1))
        if (!contentRegex) return false
        const content = state.vfs.files[filename]
        return contentRegex.test(content)
      }
      // Check all files
      const contentRegex = compileContentPattern(check.pattern)
      return Boolean(contentRegex && Object.values(state.vfs.files).some(content => contentRegex.test(content)))
    }
    case 'file_not_contains': {
      if (!check.pattern) return false
      const separatorIndex = check.pattern.indexOf(':')
      if (separatorIndex >= 0) {
        const filename = check.pattern.slice(0, separatorIndex)
        if (!Object.prototype.hasOwnProperty.call(state.vfs.files, filename)) return false
        const contentRegex = compileContentPattern(check.pattern.slice(separatorIndex + 1))
        if (!contentRegex) return false
        const content = state.vfs.files[filename]
        return !contentRegex.test(content)
      }
      const contentRegex = compileContentPattern(check.pattern)
      const contents = Object.values(state.vfs.files)
      return Boolean(contentRegex && contents.length > 0 && contents.every(content => !contentRegex.test(content)))
    }
    case 'git_clean': {
      return state.gitState.initialized && state.gitState.stagingArea.size === 0 && state.gitState.workingDirectory.size === 0
    }
    case 'git_branch': {
      if (!check.pattern) return false
      return state.gitState.initialized && state.gitState.currentBranch === check.pattern
    }
    case 'git_commit_exists': {
      return state.gitState.commits.length > 0
    }
    case 'no_red_command_used': {
      return getUnexpectedRedCommands(level, state.redCommandsUsed).length === 0
    }
    default:
      return false
  }
}

export function calculateScore(
  level: MissionLevel,
  validationResults: ValidationResult[],
  state: MissionState,
  elapsedSeconds: number,
  commandCount: number
): ScoreResult {
  const sc = level.scoring
  const breakdown: Record<string, number> = {}
  const breakdownMax: Record<string, number> = {}
  const penalties: string[] = []
  const excludedCategories: string[] = []
  let configuredPenalty = 0

  const addCategory = (name: string, earned: number, maximum: number) => {
    breakdown[name] = Math.max(0, Math.min(maximum, earned))
    breakdownMax[name] = maximum
  }
  const applyConfiguredPenalty = (label: string, value: number) => {
    if (!Number.isFinite(value) || value >= 0) return
    configuredPenalty += value
    penalties.push(`${label} (${value} points)`)
  }

  const requiredDone = validationResults.filter(r => {
    const obj = level.objectives.find(o => o.id === r.objectiveId)
    return obj?.required && r.completed
  }).length
  const requiredTotal = level.objectives.filter(o => o.required).length
  const objectiveScore = Math.round(sc.objectives_weight * (requiredDone / Math.max(1, requiredTotal)))
  addCategory('objectives', objectiveScore, sc.objectives_weight)

  const unexpectedRedCommands = getUnexpectedRedCommands(level, state.redCommandsUsed)
  const safetyScore = sc.safety_weight * (unexpectedRedCommands.length === 0 ? 1 : 0)
  addCategory('safety', safetyScore, sc.safety_weight)
  if (unexpectedRedCommands.length > 0) {
    penalties.push(`Unexpected red commands used: ${unexpectedRedCommands.join(', ')}`)
    applyConfiguredPenalty('Unexpected red-command penalty', sc.penalties.red_command)
    const tokenizedRedCommands = unexpectedRedCommands.map(command => stripCommandPrefixes(tokenizeAction(command)))
    if (tokenizedRedCommands.some(tokens => tokens[0] === 'kill' && tokens.slice(1).some(token => /^(?:%?1|pid=1)$/i.test(token)))) {
      applyConfiguredPenalty('Critical-process signal penalty', sc.penalties.kill_critical)
    }
    if (tokenizedRedCommands.some(tokens =>
      tokens[0] === 'chmod' && tokens.slice(1).some(token => /^(?:0?777|a\+rwx)$/i.test(token)),
    )) {
      applyConfiguredPenalty('Excessive-permissions penalty', sc.penalties.excessive_perms)
    }
  }

  const effectiveChecks = getEffectiveChecks(level)
  const verificationTypes = new Set([
    'file_exists', 'file_contains', 'file_not_contains',
    'git_clean', 'git_branch', 'git_commit_exists',
  ])
  const verificationChecks = effectiveChecks.filter(check => verificationTypes.has(check.type))
  if (verificationChecks.length > 0) {
    const verificationPassed = verificationChecks.filter(check => evaluateCheck(check, state, level)).length
    addCategory(
      'verification',
      Math.round(sc.verification_weight * verificationPassed / verificationChecks.length),
      sc.verification_weight,
    )
    if (verificationPassed < verificationChecks.length) {
      applyConfiguredPenalty('Unverified-fix penalty', sc.penalties.unverified_fix)
    }
    const requiresCleanGit = verificationChecks.some(check => check.type === 'git_clean')
    if (requiresCleanGit && !state.gitState.initialized) {
      applyConfiguredPenalty('Dirty-Git penalty', sc.penalties.dirty_git)
    } else if (
      requiresCleanGit
      && (state.gitState.stagingArea.size > 0 || state.gitState.workingDirectory.size > 0)
    ) {
      applyConfiguredPenalty('Dirty-Git penalty', sc.penalties.dirty_git)
    }
  } else {
    excludedCategories.push('verification')
  }

  const commandChecks = effectiveChecks.filter(check => check.type === 'command_used')
  const expectedCommands = sc.par_actions ?? Math.max(1, commandChecks.length * 2)
  const commandRatio = Math.min(1, expectedCommands / Math.max(1, commandCount))
  const expectedSeconds = sc.par_time_seconds ?? 600
  const timeRatio = elapsedSeconds <= 0 ? 1 : Math.min(1, expectedSeconds / elapsedSeconds)
  const effRatio = Math.sqrt(commandRatio * timeRatio)
  const efficiencyScore = Math.round(sc.efficiency_weight * effRatio)
  addCategory('efficiency', efficiencyScore, sc.efficiency_weight)

  const shortcutChecks = effectiveChecks.filter(check =>
    check.type === 'command_used'
    && Boolean(check.pattern)
    && /^(?:Ctrl|Alt)-|^(?:Esc|Tab|Arrow(?:Up|Down|Left|Right))$/i.test(check.pattern!),
  )
  if (shortcutChecks.length > 0) {
    const shortcutsPassed = shortcutChecks.filter(check => evaluateCheck(check, state, level)).length
    addCategory(
      'shortcuts',
      Math.round(sc.shortcuts_weight * shortcutsPassed / shortcutChecks.length),
      sc.shortcuts_weight,
    )
  } else {
    excludedCategories.push('shortcuts')
  }

  // There is currently no user action that records a debrief/review. Keeping
  // this category out of the denominator is more truthful than granting it.
  excludedCategories.push('review')

  const noHintsScore = sc.no_hints_bonus * (state.hintsUsed === 0 ? 1 : 0)
  addCategory('noHints', noHintsScore, sc.no_hints_bonus)
  if (state.hintsUsed > 0) {
    penalties.push(`No-hints bonus forfeited (${state.hintsUsed} hint${state.hintsUsed === 1 ? '' : 's'} used)`)
  }

  const rawTotal = Object.values(breakdown).reduce((sum, value) => sum + value, 0)
  const applicableMax = Object.values(breakdownMax).reduce((sum, value) => sum + value, 0)
  const normalizedTotal = 100 * rawTotal / Math.max(1, applicableMax)
  const total = Math.max(0, Math.min(100, Math.round(normalizedTotal + configuredPenalty)))
  const max = 100

  const rating = getScoreRating(total)

  return { total, max, breakdown, breakdownMax, rating, penalties, excludedCategories }
}

export function getScoreRating(total: number): string {
  return total >= 95
    ? 'Ghost Clean'
    : total >= 80
      ? 'Operator Grade'
      : total >= 60
        ? 'Field Pass'
        : total >= 40
          ? 'Panic Exit'
          : 'Incident Replayed'
}

export function isMissionComplete(level: MissionLevel, validationResults: ValidationResult[]): boolean {
  const requiredObjectives = level.objectives.filter(objective => objective.required)
  if (requiredObjectives.length === 0) return false
  return requiredObjectives.every(objective => {
    const matches = validationResults.filter(candidate => candidate.objectiveId === objective.id)
    return matches.length === 1 && matches[0].completed === true
  })
}
