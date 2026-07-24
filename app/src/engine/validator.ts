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
  rating: string
  penalties: string[]
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

function matchesLiteralCommand(command: string, pattern: string): boolean {
  const candidate = command.trim()
  const target = pattern.trim()
  if (!candidate || !target) return false

  // Catalog patterns are command/action literals, not regular expressions.
  // Punctuation-only patterns describe operators, paths, editor commands, or
  // search gestures and therefore intentionally match inside the submitted
  // action. Word-like patterns must start a simple command segment so an
  // innocent `echo dd` cannot satisfy a task that requires running `dd`.
  if (!/^[\p{L}\p{N}_]/u.test(target)) {
    return candidate.toLocaleLowerCase().includes(target.toLocaleLowerCase())
  }

  const expectedTokens = tokenizeAction(target)
  if (expectedTokens.length === 0) return false
  return splitSimpleCommands(candidate).some(segment => {
    const actualTokens = stripCommandPrefixes(tokenizeAction(segment))
    if (actualTokens.length < expectedTokens.length) return false
    return expectedTokens.every(
      (token, index) => actualTokens[index]?.toLocaleLowerCase() === token.toLocaleLowerCase(),
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
  if (remaining[0]?.toLocaleLowerCase() !== 'sudo') return remaining

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

function getUnexpectedRedCommands(level: MissionLevel, state: MissionState): string[] {
  const allowedRedPatterns = [
    ...level.checks
      .filter(candidate => candidate.type === 'command_used' && candidate.pattern)
      .map(candidate => candidate.pattern!),
    ...(level.redCommands ?? []),
  ]
  return state.redCommandsUsed.filter(redCommand =>
    !allowedRedPatterns.some(pattern => matchesLiteralCommand(pattern, redCommand)),
  )
}

export function validateMission(level: MissionLevel, state: MissionState): ValidationResult[] {
  const hasExplicitBindings = level.checks.some(check => Boolean(check.objectiveId))
  const explicitBindingsValid = !hasExplicitBindings || level.checks.every(check => {
    if (!check.objectiveId) return false
    const objective = level.objectives.find(candidate => candidate.id === check.objectiveId)
    if (!objective) return false
    return check.type !== 'no_red_command_used' || objective.required
  })
  const progressChecks = level.checks.filter(check => check.type !== 'no_red_command_used')
  const legacySkillObjectives = level.objectives.filter(
    objective => objective.required && /^obj-\d+$/.test(objective.id),
  )
  const legacyAggregateObjectives = level.objectives.filter(
    objective => objective.required && !/^obj-\d+$/.test(objective.id),
  )

  const results: ValidationResult[] = []
  for (const obj of level.objectives) {
    let completed = false

    if (hasExplicitBindings) {
      if (explicitBindingsValid) {
        const relevantChecks = level.checks.filter(check => check.objectiveId === obj.id)
        completed = (
          relevantChecks.length > 0
          && relevantChecks.every(check => evaluateCheck(check, state, level))
        )
      }
    } else {
      // Legacy catalog contract: required obj-N entries correspond, in order,
      // to progress checks. The one required non-numeric objective summarizes
      // the whole mission. Optional objectives intentionally stay unbound.
      const objectiveIndex = legacySkillObjectives.findIndex(objective => objective.id === obj.id)
      if (objectiveIndex >= 0) {
        const check = progressChecks[objectiveIndex]
        completed = Boolean(check && evaluateCheck(check, state, level))
      } else if (
        obj.required &&
        legacyAggregateObjectives.length === 1 &&
        legacyAggregateObjectives[0].id === obj.id
      ) {
        completed = (
          progressChecks.length > 0
          && level.checks.every(check => evaluateCheck(check, state, level))
        )
      }
    }

    results.push({ objectiveId: obj.id, completed, label: obj.getLabel('en') })
  }
  return results
}

function evaluateCheck(check: LevelCheck, state: MissionState, level: MissionLevel): boolean {
  switch (check.type) {
    case 'command_used': {
      if (!check.pattern) return false
      return state.commandHistory.some(command => matchesLiteralCommand(command, check.pattern!))
    }
    case 'command_not_used': {
      if (!check.pattern) return false
      const attemptedCommands = state.attemptedCommandHistory ?? state.commandHistory
      return !attemptedCommands.some(command => matchesLiteralCommand(command, check.pattern!))
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
      return getUnexpectedRedCommands(level, state).length === 0
    }
    default:
      return false
  }
}

export function calculateScore(
  level: MissionLevel,
  validationResults: ValidationResult[],
  state: MissionState,
  _elapsedSeconds: number,
  commandCount: number
): ScoreResult {
  const sc = level.scoring
  const breakdown: Record<string, number> = {}
  const penalties: string[] = []

  const requiredDone = validationResults.filter(r => {
    const obj = level.objectives.find(o => o.id === r.objectiveId)
    return obj?.required && r.completed
  }).length
  const requiredTotal = level.objectives.filter(o => o.required).length
  const objectiveScore = Math.round(sc.objectives_weight * (requiredDone / Math.max(1, requiredTotal)))
  breakdown.objectives = objectiveScore

  const unexpectedRedCommands = getUnexpectedRedCommands(level, state)
  const safetyScore = sc.safety_weight * (unexpectedRedCommands.length === 0 ? 1 : 0)
  breakdown.safety = safetyScore
  if (unexpectedRedCommands.length > 0) {
    penalties.push(`Unexpected red commands used: ${unexpectedRedCommands.join(', ')}`)
  }

  const verificationScore = sc.verification_weight
  breakdown.verification = verificationScore

  const expectedCommands = level.objectives.length * 2
  const effRatio = Math.min(1, expectedCommands / Math.max(1, commandCount))
  const efficiencyScore = Math.round(sc.efficiency_weight * effRatio)
  breakdown.efficiency = efficiencyScore

  const shortcutScore = sc.shortcuts_weight
  breakdown.shortcuts = shortcutScore

  const reviewScore = sc.review_weight
  breakdown.review = reviewScore

  const noHintsScore = sc.no_hints_bonus * (state.hintsUsed === 0 ? 1 : 0)
  breakdown.noHints = noHintsScore
  if (state.hintsUsed > 0) {
    penalties.push(`Hints used: ${state.hintsUsed}`)
  }

  const total = objectiveScore + safetyScore + verificationScore + efficiencyScore + shortcutScore + reviewScore + noHintsScore
  const max = sc.objectives_weight + sc.safety_weight + sc.verification_weight + sc.efficiency_weight + sc.shortcuts_weight + sc.review_weight + sc.no_hints_bonus

  let rating = 'Field Pass'
  if (total >= max * 0.95) rating = 'Ghost Clean'
  else if (total >= max * 0.80) rating = 'Operator Grade'
  else if (total >= max * 0.60) rating = 'Field Pass'
  else if (total >= max * 0.40) rating = 'Panic Exit'
  else rating = 'Incident Replayed'

  return { total, max, breakdown, rating, penalties }
}

export function isMissionComplete(level: MissionLevel, validationResults: ValidationResult[]): boolean {
  const requiredObjectives = level.objectives.filter(objective => objective.required)
  if (requiredObjectives.length === 0) return false
  return requiredObjectives.every(objective => {
    const matches = validationResults.filter(candidate => candidate.objectiveId === objective.id)
    return matches.length === 1 && matches[0].completed === true
  })
}
