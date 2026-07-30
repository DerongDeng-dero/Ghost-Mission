import { getLevelById, type LevelCheck, type MissionLevel } from './levels'
import { RUN_REPORT_LIMITS } from './runReportLimits'
import {
  getScoreRating,
  getEffectiveChecks,
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
  /** Exact progress-eligible traces emitted by the engine for this action. */
  successfulCommands: string[]
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

const MAX_RUN_DURATION_SECONDS = 30 * 24 * 60 * 60
const EARLIEST_RUN_REPORT_TIMESTAMP = Date.UTC(2020, 0, 1)
const LATEST_RUN_REPORT_TIMESTAMP = Date.UTC(2100, 0, 1)
const RUN_REPORT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000

function storageKey(missionId: string): string {
  return `ghostops_run_report:${missionId}`
}

function isWithinReportStorageBudget(serialized: string): boolean {
  return serialized.length <= RUN_REPORT_LIMITS.storageBytes
    && new TextEncoder().encode(serialized).byteLength <= RUN_REPORT_LIMITS.storageBytes
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
function isShortcutCheck(check: LevelCheck): boolean {
  return check.type === 'command_used'
    && Boolean(check.pattern)
    && /^(?:Ctrl|Alt)-|^(?:Esc|Tab|Arrow(?:Up|Down|Left|Right))$/i.test(check.pattern!)
}

function isStringArray(
  value: unknown,
  maxLength: number = RUN_REPORT_LIMITS.successfulActions,
  maxItemLength: number = RUN_REPORT_LIMITS.traceCodeUnits,
  allowEmptyItems: boolean = true,
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
    && Number.isInteger(value.timestampSeconds)
    && value.timestampSeconds >= 0
    && value.timestampSeconds <= elapsedSeconds + 5
    && typeof value.command === 'string'
    && value.command.length > 0
    && value.command.length <= RUN_REPORT_LIMITS.traceCodeUnits
    && Number.isInteger(value.exitCode)
    && (value.kind === 'command' || value.kind === 'interaction')
    && typeof value.cwd === 'string'
    && value.cwd.startsWith('/')
    && value.cwd.length <= RUN_REPORT_LIMITS.cwdCodeUnits
    && typeof value.mode === 'string'
    && value.mode.length > 0
    && value.mode.length <= RUN_REPORT_LIMITS.modeCodeUnits
    && isStringArray(
      value.successfulCommands,
      RUN_REPORT_LIMITS.actionSuccessfulCommands,
      RUN_REPORT_LIMITS.traceCodeUnits,
      false,
    )
    && (
      value.kind === 'command'
      || (
        value.exitCode === 0
          ? sameStringArray(value.successfulCommands, [value.command])
          : value.successfulCommands.length === 0
      )
    )
    && isStringArray(
      value.redCommands,
      RUN_REPORT_LIMITS.actionRedCommands,
      RUN_REPORT_LIMITS.traceCodeUnits,
      false,
    )
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

  const effectiveChecks = getEffectiveChecks(level)
  const verificationChecks = effectiveChecks.filter(check => VERIFICATION_TYPES.has(check.type))
  if (verificationChecks.length > 0) {
    const hasExplicitBindings = effectiveChecks.some(check => Boolean(check.objectiveId))
    const validationById = new Map(report.validationResults.map(result => [result.objectiveId, result.completed]))
    // State-backed checks cannot be replayed from a compact report. A completed
    // objective proves all of its bound checks; an incomplete optional objective
    // does not reveal which subset passed, so its verification score is not
    // reconstructible and the report must fail closed.
    const verificationProven = hasExplicitBindings
      ? verificationChecks.every(check => (
          Boolean(check.objectiveId)
          && validationById.get(check.objectiveId!) === true
        ))
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

  const commandChecks = effectiveChecks.filter(check => check.type === 'command_used')
  const expectedCommands = level.scoring.par_actions ?? Math.max(1, commandChecks.length * 2)
  const commandRatio = Math.min(1, expectedCommands / Math.max(1, report.attemptedActions.length))
  const expectedSeconds = level.scoring.par_time_seconds ?? 600
  const timeRatio = report.elapsedSeconds <= 0 ? 1 : Math.min(1, expectedSeconds / report.elapsedSeconds)
  breakdown.efficiency = Math.round(level.scoring.efficiency_weight * Math.sqrt(commandRatio * timeRatio))
  breakdownMax.efficiency = level.scoring.efficiency_weight

  const shortcutChecks = effectiveChecks.filter(isShortcutCheck)
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
  const emittedRedCommands = [...new Set(actions.flatMap(action => action.redCommands ?? []))]
  if (!sameStringArray(report.redCommandsUsed, emittedRedCommands)) return false

  // The engine is the source of truth for command/interaction traces. Preserve
  // their action order and duplicates across separate actions; never infer
  // success from command text or a compound command's final exit code.
  const emittedSuccessfulCommands = actions.flatMap(action => action.successfulCommands)
  return sameStringArray(report.successfulActions, emittedSuccessfulCommands)
}

type ReconstructedCheckResult = boolean | null

function reconstructCheckResult(
  level: MissionLevel,
  check: LevelCheck,
  report: MissionRunReport,
): ReconstructedCheckResult {
  if (check.type === 'command_used') {
    if (!check.pattern) return false
    return report.successfulActions.some(action => matchesMissionCommand(action, check.pattern!))
  }
  if (check.type === 'command_not_used') {
    if (!check.pattern) return false
    return !report.attemptedActions.some(action => matchesMissionCommand(action.command, check.pattern!))
  }
  if (check.type === 'no_red_command_used') {
    return getUnexpectedRedCommands(level, report.redCommandsUsed).length === 0
  }
  // File and Git checks depend on terminal state that the compact report does
  // not persist. A v1 report containing any such check is rejected below until
  // the schema carries a bounded state snapshot that can reproduce it.
  return null
}

function reconstructObjectiveCompletion(
  level: MissionLevel,
  objectiveId: string,
  report: MissionRunReport,
): ReconstructedCheckResult {
  const checks = getEffectiveChecks(level)
  const hasExplicitBindings = checks.some(check => Boolean(check.objectiveId))

  if (hasExplicitBindings) {
    const relevantChecks = checks.filter(check => check.objectiveId === objectiveId)
    if (relevantChecks.length === 0) return false
    const results = relevantChecks.map(check => reconstructCheckResult(level, check, report))
    if (results.includes(false)) return false
    return results.every(result => result === true) ? true : null
  }

  const objective = level.objectives.find(candidate => candidate.id === objectiveId)
  if (!objective) return false
  const progressChecks = checks.filter(check => check.type !== 'no_red_command_used')
  const skillObjectives = level.objectives.filter(candidate => candidate.required && /^obj-\d+$/.test(candidate.id))
  const skillIndex = skillObjectives.findIndex(candidate => candidate.id === objectiveId)
  if (skillIndex >= 0) {
    const check = progressChecks[skillIndex]
    return check ? reconstructCheckResult(level, check, report) : false
  }

  const aggregateObjectives = level.objectives.filter(
    candidate => candidate.required && !/^obj-\d+$/.test(candidate.id),
  )
  if (
    objective.required
    && aggregateObjectives.length === 1
    && aggregateObjectives[0].id === objectiveId
  ) {
    if (progressChecks.length === 0) return false
    const results = checks.map(check => reconstructCheckResult(level, check, report))
    if (results.includes(false)) return false
    return results.every(result => result === true) ? true : null
  }

  // Legacy optional objectives are intentionally unbound in validateMission.
  return false
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

  return level.objectives.every(objective => {
    const expected = reconstructObjectiveCompletion(level, objective.id, report)
    return expected !== null && validationById.get(objective.id)?.completed === expected
  })
}

function isMissionRunReport(value: unknown, missionId: string): value is MissionRunReport {
  if (!isRecord(value) || value.version !== 1 || value.missionId !== missionId) return false
  const completedTimestamp = typeof value.completedAt === 'string'
    ? Date.parse(value.completedAt)
    : Number.NaN
  const validationNow = Date.now()
  if (
    value.completed !== true
    || typeof value.completedAt !== 'string'
    || !Number.isFinite(completedTimestamp)
    || new Date(completedTimestamp).toISOString() !== value.completedAt
    || completedTimestamp < EARLIEST_RUN_REPORT_TIMESTAMP
    || !Number.isFinite(validationNow)
    || completedTimestamp > Math.min(
      validationNow + RUN_REPORT_FUTURE_TOLERANCE_MS,
      LATEST_RUN_REPORT_TIMESTAMP,
    )
    || !isFiniteNumber(value.elapsedSeconds)
    || !Number.isInteger(value.elapsedSeconds)
    || value.elapsedSeconds < 0
    || value.elapsedSeconds > MAX_RUN_DURATION_SECONDS
    || !isFiniteNumber(value.hintsUsed)
    || !Number.isInteger(value.hintsUsed)
    || value.hintsUsed < 0
    || !isStringArray(
      value.redCommandsUsed,
      RUN_REPORT_LIMITS.redCommands,
      RUN_REPORT_LIMITS.traceCodeUnits,
      false,
    )
    || new Set(value.redCommandsUsed).size !== value.redCommandsUsed.length
    || !isStringArray(
      value.successfulActions,
      RUN_REPORT_LIMITS.successfulActions,
      RUN_REPORT_LIMITS.traceCodeUnits,
      false,
    )
    || !Array.isArray(value.attemptedActions)
    || value.attemptedActions.length > RUN_REPORT_LIMITS.actions
    || !value.attemptedActions.every(action => isMissionRunAction(action, value.elapsedSeconds as number))
    || new Set(value.attemptedActions.map(action => (action as MissionRunAction).id)).size !== value.attemptedActions.length
    || !Array.isArray(value.validationResults)
    || value.validationResults.length > 1_000
    || !value.validationResults.every(isValidationResult)
  ) return false
  const report = value as unknown as MissionRunReport
  const level = getLevelById(missionId)
  if (
    !level
    || report.hintsUsed > level.hints.length
    || !hasConsistentActionSources(report)
    || !hasConsistentMissionEvidence(level, report)
  ) return false
  const expectedScore = getExpectedScore(level, report)
  return Boolean(expectedScore && isScoreResult(report.scoreResult, expectedScore))
}

export function saveMissionRunReport(report: MissionRunReport): boolean {
  try {
    if (!isMissionRunReport(report, report.missionId)) return false
    const serialized = JSON.stringify(report)
    if (!isWithinReportStorageBudget(serialized)) return false
    sessionStorage.setItem(storageKey(report.missionId), serialized)
    return true
  } catch {
    return false
  }
}

export function loadMissionRunReport(missionId: string): MissionRunReport | null {
  try {
    const raw = sessionStorage.getItem(storageKey(missionId))
    if (!raw || !isWithinReportStorageBudget(raw)) return null
    const report: unknown = JSON.parse(raw)
    return isMissionRunReport(report, missionId) ? report : null
  } catch {
    return null
  }
}
