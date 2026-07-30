import { RUN_REPORT_LIMITS } from '../engine/runReportLimits.ts'

export function isMissionDebriefAvailable(
  runReportPersisted: boolean | null,
  progressRecorded: boolean | null,
): boolean {
  return runReportPersisted === true && progressRecorded === true
}

export interface MissionCompletionPersistence {
  progressRecorded: boolean
  runReportPersisted: boolean
}

/**
 * Commit canonical progress before its derived run report. Keeping both writes
 * behind one tested operation prevents an orphan report when a reset in another
 * tab has already invalidated the active attempt.
 */
export function persistMissionCompletion(
  recordProgress: () => boolean,
  persistRunReport: () => boolean,
): MissionCompletionPersistence {
  const progressRecorded = recordProgress()
  return {
    progressRecorded,
    runReportPersisted: progressRecorded ? persistRunReport() : false,
  }
}

export const MAX_MISSION_RUN_ACTIONS = 1_000
export const MAX_MISSION_RUN_SUCCESSFUL_COMMANDS = RUN_REPORT_LIMITS.successfulActions
export const MAX_MISSION_ACTION_SUCCESSFUL_COMMANDS = RUN_REPORT_LIMITS.actionSuccessfulCommands
export const MAX_MISSION_ACTION_RED_COMMANDS = RUN_REPORT_LIMITS.actionRedCommands
export const MAX_MISSION_RUN_RED_COMMANDS = RUN_REPORT_LIMITS.redCommands
export const MAX_MISSION_RUN_EVIDENCE_BYTES = 512 * 1_024

interface TrackableMissionAction {
  command: string
  cwd: string
  mode: string
  successfulCommands: string[]
  redCommands?: string[]
}

export interface MissionRunEvidence<TAction extends TrackableMissionAction> {
  attemptedCommands: string[]
  attemptedActions: TAction[]
  successfulCommands: string[]
  redCommandsUsed: string[]
  serializedBytes: number
  exhausted: boolean
  readonly seenRedCommands: Set<string>
}

export function createMissionRunEvidence<TAction extends TrackableMissionAction>(): MissionRunEvidence<TAction> {
  return {
    attemptedCommands: [],
    attemptedActions: [],
    successfulCommands: [],
    redCommandsUsed: [],
    // Four independently serialized evidence arrays each contribute `[]`.
    serializedBytes: 8,
    exhausted: false,
    seenRedCommands: new Set(),
  }
}

function serializedByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

function appendedJsonArrayBytes(existingLength: number, values: unknown[]): number {
  if (values.length === 0) return 0
  const separators = existingLength === 0 ? values.length - 1 : values.length
  return separators + values.reduce<number>((total, value) => total + serializedByteLength(value), 0)
}

function isValidTrace(value: string): boolean {
  return value.length > 0 && value.length <= RUN_REPORT_LIMITS.traceCodeUnits
}

function exhaustEvidence<TAction extends TrackableMissionAction>(
  evidence: MissionRunEvidence<TAction>,
): false {
  evidence.exhausted = true
  return false
}

export function tryRecordMissionRedCommand<TAction extends TrackableMissionAction>(
  evidence: MissionRunEvidence<TAction>,
  command: string,
): boolean {
  if (evidence.exhausted) return false
  if (!isValidTrace(command)) return exhaustEvidence(evidence)
  if (evidence.seenRedCommands.has(command)) return true
  const additionalBytes = appendedJsonArrayBytes(evidence.redCommandsUsed.length, [command])
  if (
    evidence.redCommandsUsed.length >= MAX_MISSION_RUN_RED_COMMANDS
    || evidence.serializedBytes + additionalBytes > MAX_MISSION_RUN_EVIDENCE_BYTES
  ) {
    return exhaustEvidence(evidence)
  }
  evidence.seenRedCommands.add(command)
  evidence.redCommandsUsed.push(command)
  evidence.serializedBytes += additionalBytes
  return true
}

export function tryRecordMissionAction<TAction extends TrackableMissionAction>(
  evidence: MissionRunEvidence<TAction>,
  action: TAction,
): boolean {
  if (evidence.exhausted) return false
  const redCommands = action.redCommands ?? []
  if (
    !isValidTrace(action.command)
    || !action.cwd.startsWith('/')
    || action.cwd.length > RUN_REPORT_LIMITS.cwdCodeUnits
    || action.mode.length === 0
    || action.mode.length > RUN_REPORT_LIMITS.modeCodeUnits
    || !action.successfulCommands.every(isValidTrace)
    || !redCommands.every(isValidTrace)
  ) {
    return exhaustEvidence(evidence)
  }
  const additionalBytes = appendedJsonArrayBytes(evidence.attemptedCommands.length, [action.command])
    + appendedJsonArrayBytes(evidence.attemptedActions.length, [action])
    + appendedJsonArrayBytes(evidence.successfulCommands.length, action.successfulCommands)
  if (
    evidence.attemptedActions.length >= MAX_MISSION_RUN_ACTIONS
    || action.successfulCommands.length > MAX_MISSION_ACTION_SUCCESSFUL_COMMANDS
    || redCommands.length > MAX_MISSION_ACTION_RED_COMMANDS
    || evidence.successfulCommands.length + action.successfulCommands.length > MAX_MISSION_RUN_SUCCESSFUL_COMMANDS
    || evidence.serializedBytes + additionalBytes > MAX_MISSION_RUN_EVIDENCE_BYTES
  ) {
    return exhaustEvidence(evidence)
  }

  evidence.attemptedCommands.push(action.command)
  evidence.attemptedActions.push(action)
  evidence.successfulCommands.push(...action.successfulCommands)
  evidence.serializedBytes += additionalBytes
  return true
}

export interface PendingTaskRef<THandle> {
  current: THandle | null
}

export function scheduleCoalescedTask<THandle>(
  pending: PendingTaskRef<THandle>,
  schedule: (task: () => void) => THandle,
  task: () => void,
): boolean {
  if (pending.current !== null) return false
  pending.current = schedule(() => {
    pending.current = null
    task()
  })
  return true
}
