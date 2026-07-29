import { getLevelById, type LevelCheck, type MissionLevel } from './levels'
import {
  getScoreRating,
  getUnexpectedRedCommands,
  isMissionComplete,
  matchesMissionCommand,
  type ScoreResult,
  type ValidationResult,
} from './validator'

export interface MissionRunAction {
  id: string
  timestampSeconds: number
  command: string
  exitCode: number
  kind: 'command' | 'interaction'
  cwd: string
  mode: string
  /** Exact red-command callbacks emitted while this action executed. */
  redCommands?: string[]
}

export interface MissionRunReport {
  version: 1
  missionId: string
  completed: boolean
  completedAt: string
  elapsedSeconds: number
  hintsUsed: number
  redCommandsUsed: string[]
  attemptedActions: MissionRunAction[]
  successfulActions: string[]
  validationResults: ValidationResult[]
  scoreResult: ScoreResult
}

function storageKey(missionId: string): string {
  return `ghostops_run_report:${missionId}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

const VERIFICATION_TYPES = new Set<LevelCheck['type']>([
  'file_exists', 'file_contains', 'file_not_contains',
  'git_clean', 'git_branch', 'git_commit_exists',
])
const GENERATED_COMMAND_TRACES = new Set([
  '--help', '\\', '$?', '$VAR', '"', "'", '*', '?',
  '|', '>', '>>', '2>', '&&', '||', '&', '<<', '<()',
  'array', 'function', 'if', 'test', 'for', 'while', 'read',
])

function isShortcutCheck(check: LevelCheck): boolean {
  return check.type === 'command_used'
    && Boolean(check.pattern)
    && /^(?:Ctrl|Alt)-|^(?:Esc|Tab|Arrow(?:Up|Down|Left|Right))$/i.test(check.pattern!)
}

function isStringArray(
  value: unknown,
  maxLength = 10_000,
  maxItemLength = 20_000,
  allowEmptyItems = true,
): value is string[] {
  return Array.isArray(value)
    && value.length <= maxLength
    && value.every(item => (
      typeof item === 'string'
      && item.length <= maxItemLength
      && (allowEmptyItems || item.length > 0)
    ))
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRecord(value)
    && Object.keys(value).length <= 20
    && Object.values(value).every(item => isFiniteNumber(item) && item >= 0)
}

function isMissionRunAction(value: unknown, elapsedSeconds: number): value is MissionRunAction {
  if (!isRecord(value)) return false
  return typeof value.id === 'string'
    && value.id.length > 0
    && isFiniteNumber(value.timestampSeconds)
    && value.timestampSeconds >= 0
    && value.timestampSeconds <= elapsedSeconds + 5
    && typeof value.command === 'string'
    && value.command.length > 0
    && value.command.length <= 20_000
    && Number.isInteger(value.exitCode)
    && (value.kind === 'command' || value.kind === 'interaction')
    && typeof value.cwd === 'string'
    && value.cwd.startsWith('/')
    && value.cwd.length <= 4_096
    && typeof value.mode === 'string'
    && value.mode.length > 0
    && value.mode.length <= 100
    && isStringArray(value.redCommands, 100, 20_000, false)
}

function isValidationResult(value: unknown): value is ValidationResult {
  return isRecord(value)
    && typeof value.objectiveId === 'string'
    && value.objectiveId.length > 0
    && value.objectiveId.length <= 500
    && typeof value.completed === 'boolean'
    && typeof value.label === 'string'
    && value.label.length <= 20_000
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

function hasExactKeys(value: Record<string, number>, expected: Record<string, number>): boolean {
  const actualKeys = Object.keys(value).sort()
  const expectedKeys = Object.keys(expected).sort()
  return sameStringArray(actualKeys, expectedKeys)
}

function getExpectedScore(level: MissionLevel, report: MissionRunReport): ScoreResult | null {
  const unexpectedRedCommands = getUnexpectedRedCommands(level, report.redCommandsUsed)
  // A completed report can only prove safety when every emitted red command is
  // explicitly authorized by the mission contract. Reports do not persist
  // enough pre-completion state to reconstruct a failed safety check later.
  if (unexpectedRedCommands.length > 0) return null

  const breakdown: Record<string, number> = {
    objectives: level.scoring.objectives_weight,
    safety: level.scoring.safety_weight,
  }
  const breakdownMax: Record<string, number> = {
    objectives: level.scoring.objectives_weight,
    safety: level.scoring.safety_weight,
  }
  const excludedCategories: string[] = []

  const verificationChecks = level.checks.filter(check => VERIFICATION_TYPES.has(check.type))
  if (verificationChecks.length > 0) {
    const hasExplicitBindings = level.checks.some(check => Boolean(check.objectiveId))
    const validationById = new Map(report.validationResults.map(result => [result.objectiveId, result.completed]))
    const verificationProven = hasExplicitBindings
      ? verificationChecks.every(check => Boolean(check.objectiveId && validationById.get(check.objectiveId)))
      : level.objectives.some(objective => (
          objective.required
          && !/^obj-\d+$/.test(objective.id)
          && validationById.get(objective.id) === true
        ))
    if (!verificationProven) return null
    breakdown.verification = level.scoring.verification_weight
    breakdownMax.verification = level.scoring.verification_weight
  } else {
    excludedCategories.push('verification')
  }

  const commandChecks = level.checks.filter(check => check.type === 'command_used')
  const expectedCommands = level.scoring.par_actions ?? Math.max(1, commandChecks.length * 2)
  const commandRatio = Math.min(1, expectedCommands / Math.max(1, report.attemptedActions.length))
  const expectedSeconds = level.scoring.par_time_seconds ?? 600
  const timeRatio = report.elapsedSeconds <= 0 ? 1 : Math.min(1, expectedSeconds / report.elapsedSeconds)
  breakdown.efficiency = Math.round(level.scoring.efficiency_weight * Math.sqrt(commandRatio * timeRatio))
  breakdownMax.efficiency = level.scoring.efficiency_weight

  const shortcutChecks = level.checks.filter(isShortcutCheck)
  if (shortcutChecks.length > 0) {
    const shortcutsPassed = shortcutChecks.filter(check =>
      report.successfulActions.some(action => matchesMissionCommand(action, check.pattern!)),
    ).length
    breakdown.shortcuts = Math.round(level.scoring.shortcuts_weight * shortcutsPassed / shortcutChecks.length)
    breakdownMax.shortcuts = level.scoring.shortcuts_weight
  } else {
    excludedCategories.push('shortcuts')
  }

  excludedCategories.push('review')
  breakdown.noHints = report.hintsUsed === 0 ? level.scoring.no_hints_bonus : 0
  breakdownMax.noHints = level.scoring.no_hints_bonus

  const penalties = report.hintsUsed > 0
    ? [`No-hints bonus forfeited (${report.hintsUsed} hint${report.hintsUsed === 1 ? '' : 's'} used)`]
    : []
  const rawTotal = Object.values(breakdown).reduce((sum, value) => sum + value, 0)
  const applicableMax = Object.values(breakdownMax).reduce((sum, value) => sum + value, 0)
  const total = Math.max(0, Math.min(100, Math.round(100 * rawTotal / Math.max(1, applicableMax))))
  return {
    total,
    max: 100,
    breakdown,
    breakdownMax,
    rating: getScoreRating(total),
    penalties,
    excludedCategories,
  }
}

function isScoreResult(value: unknown, expected: ScoreResult): value is ScoreResult {
  if (!isRecord(value)) return false
  const breakdown = value.breakdown
  const breakdownMax = value.breakdownMax
  return isFiniteNumber(value.total)
    && value.total >= 0
    && value.total <= 100
    && value.max === 100
    && isNumberRecord(breakdown)
    && isNumberRecord(breakdownMax)
    && hasExactKeys(breakdown, expected.breakdown)
    && hasExactKeys(breakdownMax, expected.breakdownMax)
    && Object.entries(breakdown).every(([key, earned]) => (
      Number.isInteger(earned)
      && earned <= breakdownMax[key]
      && earned === expected.breakdown[key]
    ))
    && Object.entries(breakdownMax).every(([key, maximum]) => (
      maximum === expected.breakdownMax[key]
    ))
    && value.total === expected.total
    && value.rating === expected.rating
    && isStringArray(value.penalties, 100, 1_000)
    && sameStringArray(value.penalties, expected.penalties)
    && isStringArray(value.excludedCategories, 20, 100, false)
    && sameStringArray(value.excludedCategories, expected.excludedCategories)
}

function hasConsistentActionSources(report: MissionRunReport): boolean {
  const actions = report.attemptedActions
  if (actions.some((action, index) => action.id !== String(index + 1))) return false
  if (actions.some((action, index) => index > 0 && action.timestampSeconds < actions[index - 1].timestampSeconds)) return false
  if (report.successfulActions.length > 0 && actions.length === 0) return false

  const emittedRedCommands = [...new Set(actions.flatMap(action => action.redCommands ?? []))]
  if (!sameStringArray(report.redCommandsUsed, emittedRedCommands)) return false

  const successfulActionCounts = new Map<string, number>()
  for (const action of report.successfulActions) {
    successfulActionCounts.set(action, (successfulActionCounts.get(action) ?? 0) + 1)
  }
  const successfulInteractions = actions.filter(action => action.kind === 'interaction' && action.exitCode === 0)
  for (const action of successfulInteractions) {
    const count = successfulActionCounts.get(action.command) ?? 0
    if (count <= 0) return false
    successfulActionCounts.set(action.command, count - 1)
  }
  if (!actions.some(action => action.kind === 'command')) {
    return [...successfulActionCounts.values()].every(count => count === 0)
  }
  return true
}

function hasConsistentMissionEvidence(level: MissionLevel, report: MissionRunReport): boolean {
  if (report.validationResults.length !== level.objectives.length) return false
  const validationById = new Map(report.validationResults.map(result => [result.objectiveId, result]))
  if (validationById.size !== report.validationResults.length) return false
  if (!level.objectives.every(objective => {
    const result = validationById.get(objective.id)
    return Boolean(
      result
      && result.label === objective.getLabel('en')
      && (!objective.required || result.completed),
    )
  })) return false
  if (!isMissionComplete(level, report.validationResults)) return false

  const attemptedCommands = report.attemptedActions.map(action => action.command)
  const hasCommandAction = report.attemptedActions.some(action => action.kind === 'command')
  const hasExplicitBindings = level.checks.some(check => Boolean(check.objectiveId))
  const checksProvenComplete = hasExplicitBindings
    ? level.checks.filter(check => Boolean(check.objectiveId && validationById.get(check.objectiveId)?.completed))
    : level.checks
  for (const check of checksProvenComplete) {
    const pattern = check.pattern
    if (!pattern) continue
    if (check.type === 'command_used') {
      if (!report.successfulActions.some(action => matchesMissionCommand(action, pattern))) return false
      const hasDirectSource = attemptedCommands.some(action => matchesMissionCommand(action, pattern))
      if (!hasDirectSource && !(hasCommandAction && GENERATED_COMMAND_TRACES.has(pattern))) return false
    }
    if (
      check.type === 'command_not_used'
      && attemptedCommands.some(action => matchesMissionCommand(action, pattern))
    ) return false
  }
  return true
}

function isMissionRunReport(value: unknown, missionId: string): value is MissionRunReport {
  if (!isRecord(value) || value.version !== 1 || value.missionId !== missionId) return false
  if (
    value.completed !== true
    || typeof value.completedAt !== 'string'
    || !Number.isFinite(Date.parse(value.completedAt))
    || !isFiniteNumber(value.elapsedSeconds)
    || value.elapsedSeconds < 0
    || !isFiniteNumber(value.hintsUsed)
    || !Number.isInteger(value.hintsUsed)
    || value.hintsUsed < 0
    || !isStringArray(value.redCommandsUsed, 1_000, 20_000, false)
    || new Set(value.redCommandsUsed).size !== value.redCommandsUsed.length
    || !isStringArray(value.successfulActions, 10_000, 20_000, false)
    || !Array.isArray(value.attemptedActions)
    || value.attemptedActions.length > 10_000
    || !value.attemptedActions.every(action => isMissionRunAction(action, value.elapsedSeconds as number))
    || new Set(value.attemptedActions.map(action => (action as MissionRunAction).id)).size !== value.attemptedActions.length
    || !Array.isArray(value.validationResults)
    || value.validationResults.length > 1_000
    || !value.validationResults.every(isValidationResult)
  ) return false
  const report = value as unknown as MissionRunReport
  const level = getLevelById(missionId)
  if (!level || !hasConsistentActionSources(report) || !hasConsistentMissionEvidence(level, report)) return false
  const expectedScore = getExpectedScore(level, report)
  return Boolean(expectedScore && isScoreResult(report.scoreResult, expectedScore))
}

export function saveMissionRunReport(report: MissionRunReport): boolean {
  try {
    if (!isMissionRunReport(report, report.missionId)) return false
    sessionStorage.setItem(storageKey(report.missionId), JSON.stringify(report))
    return true
  } catch {
    return false
  }
}

export function loadMissionRunReport(missionId: string): MissionRunReport | null {
  try {
    const raw = sessionStorage.getItem(storageKey(missionId))
    if (!raw) return null
    const report: unknown = JSON.parse(raw)
    return isMissionRunReport(report, missionId) ? report : null
  } catch {
    return null
  }
}
