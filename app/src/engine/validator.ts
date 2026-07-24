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
  // Pure punctuation operators are matched verbatim; word-like commands use
  // token boundaries so `man` does not accidentally match `command`.
  if (!/[\p{L}\p{N}_]/u.test(target)) {
    return candidate.toLocaleLowerCase().includes(target.toLocaleLowerCase())
  }

  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`,
    'iu',
  ).test(candidate)
}

export function validateMission(level: MissionLevel, state: MissionState): ValidationResult[] {
  const hasExplicitBindings = level.checks.some(check => Boolean(check.objectiveId))
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
      const relevantChecks = level.checks.filter(check => check.objectiveId === obj.id)
      completed = relevantChecks.length > 0 && relevantChecks.every(check => evaluateCheck(check, state))
    } else {
      // Legacy catalog contract: required obj-N entries correspond, in order,
      // to progress checks. The one required non-numeric objective summarizes
      // the whole mission. Optional objectives intentionally stay unbound.
      const objectiveIndex = legacySkillObjectives.findIndex(objective => objective.id === obj.id)
      if (objectiveIndex >= 0) {
        const check = progressChecks[objectiveIndex]
        completed = Boolean(check && evaluateCheck(check, state))
      } else if (
        obj.required &&
        legacyAggregateObjectives.length === 1 &&
        legacyAggregateObjectives[0].id === obj.id
      ) {
        completed = progressChecks.length > 0 && progressChecks.every(check => evaluateCheck(check, state))
      }
    }

    results.push({ objectiveId: obj.id, completed, label: obj.getLabel('en') })
  }
  return results
}

function evaluateCheck(check: LevelCheck, state: MissionState): boolean {
  switch (check.type) {
    case 'command_used': {
      if (!check.pattern) return false
      return state.commandHistory.some(command => matchesLiteralCommand(command, check.pattern!))
    }
    case 'command_not_used': {
      if (!check.pattern) return false
      return !state.commandHistory.some(command => matchesLiteralCommand(command, check.pattern!))
    }
    case 'file_exists': {
      if (!check.pattern) return false
      return !!state.vfs.files[check.pattern]
    }
    case 'file_contains': {
      if (!check.pattern) return false
      // pattern format: "filename:regex" or just regex to check all files
      const parts = check.pattern.split(':')
      if (parts.length >= 2) {
        const filename = parts[0]
        const contentRegex = new RegExp(parts.slice(1).join(':'), 'i')
        const content = state.vfs.files[filename] || ''
        return contentRegex.test(content)
      }
      // Check all files
      return Object.values(state.vfs.files).some(content => new RegExp(check.pattern!, 'i').test(content))
    }
    case 'file_not_contains': {
      if (!check.pattern) return false
      const parts = check.pattern.split(':')
      if (parts.length >= 2) {
        const filename = parts[0]
        const contentRegex = new RegExp(parts.slice(1).join(':'), 'i')
        const content = state.vfs.files[filename] || ''
        return !contentRegex.test(content)
      }
      return !Object.values(state.vfs.files).some(content => new RegExp(check.pattern!, 'i').test(content))
    }
    case 'git_clean': {
      return state.gitState.stagingArea.size === 0 && state.gitState.workingDirectory.size === 0
    }
    case 'git_branch': {
      if (!check.pattern) return false
      return state.gitState.currentBranch === check.pattern
    }
    case 'git_commit_exists': {
      return state.gitState.commits.length > 0
    }
    case 'no_red_command_used': {
      return state.redCommandsUsed.length === 0
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

  const safetyScore = sc.safety_weight * (state.redCommandsUsed.length === 0 ? 1 : 0)
  breakdown.safety = safetyScore
  if (state.redCommandsUsed.length > 0) {
    penalties.push(`Red commands used: ${state.redCommandsUsed.join(', ')}`)
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
  const required = validationResults.filter(r => {
    const obj = level.objectives.find(o => o.id === r.objectiveId)
    return obj?.required
  })
  return required.length > 0 && required.every(r => r.completed)
}
