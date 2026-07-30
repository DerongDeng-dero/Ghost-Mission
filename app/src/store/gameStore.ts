import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { KNOWN_MISSION_IDS } from '../data/knownMissionIds.ts'

interface MissionProgressBase {
  startedAt: string
  updatedAt: string
}

export interface MissionCompletionAttempt {
  id: string
  startedAt: string
  completedAt: string
  completedLocalDay: string
  score: number
}

type CompletionTally = Record<string, number>

export interface ProgressMilestones {
  longestStreakAchieved: number
  currentStreak: number
  lastCompletionLocalDay: string | null
}

export type MissionProgressRecord = MissionProgressBase & (
  | {
      status: 'in-progress'
      active: true
      completedAt?: never
      bestScore?: never
      latestScore?: never
      completedAttempts: 0
    }
  | {
      status: 'completed'
      active: false
      completedAt: string
      bestScore: number
      latestScore: number
      completedAttempts: number
      completionHistory: MissionCompletionAttempt[]
      completionTally: CompletionTally
    }
)

export type MissionProgressMap = Record<string, MissionProgressRecord>

const MISSION_PROGRESS_STORAGE_KEY = 'ghostops_progress_v1'
const CALLSIGN_STORAGE_KEY = 'ghostops_displayName'
const MISSION_PROGRESS_VERSION = 1
const MAX_PROGRESS_ENTRIES = 500
const MAX_PROGRESS_STORAGE_BYTES = 3 * 1024 * 1024
const MAX_COMPLETED_ATTEMPTS = 1_000_000
const MAX_STORED_COMPLETION_HISTORY = 50
const MAX_COMPLETION_HISTORY_CANDIDATES = 500
const EARLIEST_PROGRESS_TIMESTAMP = Date.UTC(2020, 0, 1)
const FUTURE_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000
const LATEST_REASONABLE_PROGRESS_TIMESTAMP = Date.UTC(2100, 0, 1)
const MISSION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/
const LOCAL_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ATTEMPT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/
const WRITER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/

interface PersistedProgressState {
  missionProgress: MissionProgressMap
  progressMilestones: ProgressMilestones
  progressResetAt: number
  progressResetSerial: string
}

export type ProgressPersistenceStatus = 'ready' | 'error'
let progressStoreInitialized = false
let pendingPersistenceStatus: ProgressPersistenceStatus | null = null
let persistenceStatusUpdateInFlight = false
let forceNextProgressResetWrite = false

function reportProgressPersistence(status: ProgressPersistenceStatus): void {
  pendingPersistenceStatus = status
  if (!progressStoreInitialized) return
  queueMicrotask(() => {
    const current = useGameStore.getState()
    if (current.progressPersistenceStatus !== status) {
      persistenceStatusUpdateInFlight = true
      try {
        useGameStore.setState({ progressPersistenceStatus: status })
      } finally {
        persistenceStatusUpdateInFlight = false
      }
    }
  })
}

const MAX_CALLSIGN_CODE_POINTS = 20

function isForbiddenCallsignCodePoint(codePoint: number): boolean {
  return codePoint <= 0x1f
    || (codePoint >= 0x7f && codePoint <= 0x9f)
    || (codePoint >= 0xd800 && codePoint <= 0xdfff)
    || codePoint === 0x061c
    || codePoint === 0x200e
    || codePoint === 0x200f
    || (codePoint >= 0x202a && codePoint <= 0x202e)
    || (codePoint >= 0x2066 && codePoint <= 0x2069)
}

export function sanitizeCallsignInput(value: unknown): string {
  if (typeof value !== 'string') return ''
  const accepted: string[] = []
  for (const character of value) {
    const codePoint = character.codePointAt(0)
    if (codePoint === undefined || isForbiddenCallsignCodePoint(codePoint)) continue
    accepted.push(character)
    if (accepted.length === MAX_CALLSIGN_CODE_POINTS) break
  }
  return accepted.join('')
}

export function normalizeCallsign(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  const codePoints = [...normalized]
  const containsForbiddenCodePoint = codePoints.some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint === undefined || isForbiddenCallsignCodePoint(codePoint)
  })
  return codePoints.length >= 1
    && codePoints.length <= MAX_CALLSIGN_CODE_POINTS
    && !containsForbiddenCodePoint
    ? normalized
    : null
}

function loadStoredCallsign(): string {
  if (typeof window === 'undefined') return 'Ghost-7'
  try {
    const raw = window.localStorage.getItem(CALLSIGN_STORAGE_KEY)
    if (raw === null) return 'Ghost-7'
    return normalizeCallsign(JSON.parse(raw)) ?? 'Ghost-7'
  } catch {
    return 'Ghost-7'
  }
}

function storeCallsign(value: string): boolean {
  if (typeof window === 'undefined') return true
  try {
    window.localStorage.setItem(CALLSIGN_STORAGE_KEY, JSON.stringify(value))
    return true
  } catch {
    // The in-memory callsign remains usable when storage is unavailable.
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeTimestamp(value: unknown, now = Date.now()): string | null {
  if (typeof value !== 'string' || !Number.isFinite(now)) return null
  const timestamp = Date.parse(value)
  const futureToleranceCeiling = now + FUTURE_TIMESTAMP_TOLERANCE_MS
  if (
    !Number.isFinite(timestamp) ||
    timestamp < EARLIEST_PROGRESS_TIMESTAMP ||
    timestamp > Math.min(futureToleranceCeiling, LATEST_REASONABLE_PROGRESS_TIMESTAMP)
  ) {
    return null
  }
  return new Date(timestamp).toISOString()
}

function normalizeScore(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100
    ? Number(value)
    : null
}

function localDayKey(value: string | number | Date): string {
  const date = new Date(value)
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function createAttemptId(completedAt: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // Fall through to a collision-resistant local identifier.
  }
  return `${completedAt}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}

let runtimeWriterId: string | null = null

function getProgressWriterId(): string {
  if (runtimeWriterId !== null) return runtimeWriterId
  const generated = `tab:${createAttemptId(new Date().toISOString())}`
  runtimeWriterId = generated
  return generated
}

function shiftCalendarDay(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function calculateLongestStoredStreak(progress: MissionProgressMap): number {
  const days = new Set<string>()
  for (const record of Object.values(progress)) {
    if (record.status !== 'completed') continue
    for (const attempt of record.completionHistory) days.add(attempt.completedLocalDay)
  }
  let longest = 0
  let current = 0
  let previous: string | null = null
  for (const day of [...days].sort()) {
    current = previous !== null && shiftCalendarDay(previous, 1) === day ? current + 1 : 1
    longest = Math.max(longest, current)
    previous = day
  }
  return longest
}

function calculateStoredStreakSummary(progress: MissionProgressMap): ProgressMilestones {
  const days = new Set<string>()
  for (const record of Object.values(progress)) {
    if (record.status !== 'completed') continue
    for (const attempt of record.completionHistory) days.add(attempt.completedLocalDay)
  }
  const orderedDays = [...days].sort()
  let longest = 0
  let current = 0
  let previous: string | null = null
  for (const day of orderedDays) {
    current = previous !== null && shiftCalendarDay(previous, 1) === day ? current + 1 : 1
    longest = Math.max(longest, current)
    previous = day
  }
  return {
    longestStreakAchieved: longest,
    currentStreak: current,
    lastCompletionLocalDay: previous,
  }
}

export function normalizeProgressMilestones(
  value: unknown,
  progress: MissionProgressMap,
  now = Date.now(),
): ProgressMilestones {
  const derived = calculateStoredStreakSummary(progress)
  if (derived.lastCompletionLocalDay === null) {
    return derived
  }

  const storedLongest = isRecord(value) && Number.isInteger(value.longestStreakAchieved)
    && Number(value.longestStreakAchieved) >= derived.longestStreakAchieved
    && Number(value.longestStreakAchieved) <= 50_000
    ? Number(value.longestStreakAchieved)
    : derived.longestStreakAchieved
  const storedCurrent = isRecord(value) && Number.isInteger(value.currentStreak)
    && Number(value.currentStreak) >= derived.currentStreak
    && Number(value.currentStreak) <= storedLongest
    ? Number(value.currentStreak)
    : derived.currentStreak
  const today = localDayKey(now)
  const storedLastDay = isRecord(value) && typeof value.lastCompletionLocalDay === 'string'
    && LOCAL_DAY_PATTERN.test(value.lastCompletionLocalDay)
    && Number.isFinite(Date.parse(`${value.lastCompletionLocalDay}T12:00:00Z`))
    && value.lastCompletionLocalDay <= today
    ? value.lastCompletionLocalDay
    : null
  const useStoredCurrent = storedLastDay === derived.lastCompletionLocalDay
  return {
    longestStreakAchieved: storedLongest,
    currentStreak: useStoredCurrent ? storedCurrent : derived.currentStreak,
    lastCompletionLocalDay: derived.lastCompletionLocalDay,
  }
}

function normalizeCompletionTally(value: unknown, completedAttempts: number): CompletionTally | null {
  if (value === undefined) return { legacy: completedAttempts }
  if (!isRecord(value)) return null

  const entries = new Map<string, number>()
  let total = 0
  for (const writerId in value) {
    if (!Object.prototype.hasOwnProperty.call(value, writerId)) continue
    const count = value[writerId]
    if (
      !WRITER_ID_PATTERN.test(writerId)
      || writerId === '__proto__'
      || writerId === 'constructor'
      || writerId === 'prototype'
      || !Number.isInteger(count)
      || Number(count) <= 0
      || Number(count) > MAX_COMPLETED_ATTEMPTS
    ) {
      return null
    }
    total = Math.min(MAX_COMPLETED_ATTEMPTS, total + Number(count))
    entries.set(writerId, Number(count))
  }
  return total === completedAttempts && total > 0
    ? Object.fromEntries(entries)
    : null
}

function normalizeCompletionHistory(
  value: unknown,
  recordStartedAt: string,
  latestCompletedAt: string,
  latestScore: number,
  now: number,
): MissionCompletionAttempt[] {
  const latestCompletedTime = Date.parse(latestCompletedAt)
  const recordStartedTime = Date.parse(recordStartedAt)
  const candidates = Array.isArray(value) && value.length <= MAX_COMPLETION_HISTORY_CANDIDATES
    ? value
    : []
  const normalizedCandidates = candidates.flatMap((candidate, candidateIndex) => {
    if (!isRecord(candidate)) return []
    const startedAt = normalizeTimestamp(candidate.startedAt, now)
    const completedAt = normalizeTimestamp(candidate.completedAt, now)
    const score = normalizeScore(candidate.score)
    if (startedAt === null || completedAt === null || score === null) return []
    const startedTime = Date.parse(startedAt)
    const completedTime = Date.parse(completedAt)
    if (
      startedTime < recordStartedTime ||
      completedTime < startedTime ||
      completedTime > latestCompletedTime
    ) {
      return []
    }
    const plausibleLocalDays = new Set([
      shiftCalendarDay(completedAt.slice(0, 10), -1),
      completedAt.slice(0, 10),
      shiftCalendarDay(completedAt.slice(0, 10), 1),
    ])
    const completedLocalDay = typeof candidate.completedLocalDay === 'string'
      && LOCAL_DAY_PATTERN.test(candidate.completedLocalDay)
      && Number.isFinite(Date.parse(`${candidate.completedLocalDay}T12:00:00Z`))
      && plausibleLocalDays.has(candidate.completedLocalDay)
      ? candidate.completedLocalDay
      : localDayKey(completedAt)
    const id = typeof candidate.id === 'string' && ATTEMPT_ID_PATTERN.test(candidate.id)
      ? candidate.id
      : `legacy:${completedAt}:${score}:${candidateIndex}`
    return [{ id, startedAt, completedAt, completedLocalDay, score }]
  })
  const history = canonicalizeCompletionAttempts(normalizedCandidates)

  const latest = history.at(-1)
  if (latest?.completedAt !== latestCompletedAt || latest.score !== latestScore) {
    history.push({
      id: `legacy:${latestCompletedAt}:${latestScore}:latest`,
      startedAt: recordStartedAt,
      completedAt: latestCompletedAt,
      completedLocalDay: localDayKey(latestCompletedAt),
      score: latestScore,
    })
  }
  return canonicalizeCompletionAttempts(history)
    .slice(-MAX_STORED_COMPLETION_HISTORY)
}

/**
 * Treat browser storage as untrusted input. Invalid records are discarded
 * independently so one corrupted mission cannot erase otherwise valid work.
 */
export function normalizeMissionProgress(value: unknown, now = Date.now()): MissionProgressMap {
  if (!isRecord(value)) return {}

  const normalized: MissionProgressMap = {}
  let accepted = 0
  for (const missionId of KNOWN_MISSION_IDS) {
    if (!Object.prototype.hasOwnProperty.call(value, missionId)) continue
    if (accepted >= MAX_PROGRESS_ENTRIES) break
    const candidate = value[missionId]
    if (!MISSION_ID_PATTERN.test(missionId) || !KNOWN_MISSION_IDS.has(missionId) || !isRecord(candidate)) continue

    const status = candidate.status
    const active = candidate.active
    const startedAt = normalizeTimestamp(candidate.startedAt, now)
    const updatedAt = normalizeTimestamp(candidate.updatedAt, now)
    const completedAttempts = typeof candidate.completedAttempts === 'number'
      ? candidate.completedAttempts
      : Number.NaN
    if (
      (status !== 'in-progress' && status !== 'completed') ||
      typeof active !== 'boolean' ||
      startedAt === null ||
      updatedAt === null ||
      !Number.isInteger(completedAttempts) ||
      completedAttempts < 0 ||
      completedAttempts > MAX_COMPLETED_ATTEMPTS
    ) {
      continue
    }

    if (status === 'in-progress') {
      if (!active || completedAttempts !== 0 || Date.parse(updatedAt) < Date.parse(startedAt)) continue
      normalized[missionId] = {
        status,
        active,
        startedAt,
        updatedAt,
        completedAttempts: 0,
      }
      accepted += 1
      continue
    }

    const completedAt = normalizeTimestamp(candidate.completedAt, now)
    const bestScore = normalizeScore(candidate.bestScore)
    const latestScore = normalizeScore(candidate.latestScore)
    if (
      active ||
      completedAt === null ||
      bestScore === null ||
      latestScore === null ||
      completedAttempts < 1 ||
      bestScore < latestScore ||
      Date.parse(completedAt) < Date.parse(startedAt) ||
      Date.parse(updatedAt) < Date.parse(completedAt)
    ) {
      continue
    }

    const completionHistory = normalizeCompletionHistory(
      candidate.completionHistory,
      startedAt,
      completedAt,
      latestScore,
      now,
    )
    if (
      completedAttempts < completionHistory.length ||
      completionHistory.some((attempt) => attempt.score > bestScore)
    ) {
      continue
    }

    const completionTally = normalizeCompletionTally(candidate.completionTally, completedAttempts)
    if (completionTally === null) continue

    normalized[missionId] = {
      status,
      active,
      startedAt,
      updatedAt,
      completedAt,
      bestScore,
      latestScore,
      completedAttempts,
      completionHistory,
      completionTally,
    }
    accepted += 1
  }

  return normalized
}

function normalizeResetEpoch(value: unknown): number {
  if (value === 0 || value === undefined) return 0
  return Number.isSafeInteger(value)
    && Number(value) >= EARLIEST_PROGRESS_TIMESTAMP
    && Number(value) <= LATEST_REASONABLE_PROGRESS_TIMESTAMP
    ? Number(value)
    : 0
}

function normalizeResetSerial(value: unknown, resetAt: number): string | null {
  let normalized: string
  if (value === undefined) {
    normalized = '0'
  } else if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) return null
    normalized = String(value)
  } else {
    if (
      typeof value !== 'string'
      || value.length === 0
      || value.length > MAX_PROGRESS_STORAGE_BYTES
      || !/^(0|[1-9][0-9]*)$/.test(value)
    ) {
      return null
    }
    normalized = value
  }
  if (resetAt === 0 && normalized !== '0') return null
  return normalized
}

function incrementDecimalString(value: string): string {
  const digits = value.split('')
  let carry = 1
  for (let index = digits.length - 1; index >= 0 && carry === 1; index -= 1) {
    if (digits[index] === '9') {
      digits[index] = '0'
    } else {
      digits[index] = String(Number(digits[index]) + 1)
      carry = 0
    }
  }
  if (carry === 1) digits.unshift('1')
  return digits.join('')
}

function compareDecimalStrings(left: string, right: string): number {
  if (left.length !== right.length) return left.length > right.length ? 1 : -1
  return left === right ? 0 : left > right ? 1 : -1
}

function compareResetClocks(left: PersistedProgressState, right: PersistedProgressState): number {
  if (left.progressResetAt !== right.progressResetAt) {
    return left.progressResetAt > right.progressResetAt ? 1 : -1
  }
  return compareDecimalStrings(left.progressResetSerial, right.progressResetSerial)
}

function nextResetClock(
  progressResetAt: number,
  progressResetSerial: string,
  now = Date.now(),
): Pick<PersistedProgressState, 'progressResetAt' | 'progressResetSerial'> {
  const boundedNow = Math.min(
    Math.max(now, EARLIEST_PROGRESS_TIMESTAMP),
    LATEST_REASONABLE_PROGRESS_TIMESTAMP,
  )
  return boundedNow > progressResetAt
    ? { progressResetAt: boundedNow, progressResetSerial: '0' }
    : {
        progressResetAt,
        progressResetSerial: incrementDecimalString(progressResetSerial),
      }
}

function emptyProgressAtClock(
  clock: Pick<PersistedProgressState, 'progressResetAt' | 'progressResetSerial'>,
): PersistedProgressState {
  return {
    missionProgress: {},
    progressMilestones: calculateStoredStreakSummary({}),
    ...clock,
  }
}

function normalizePersistedState(value: unknown, now = Date.now()): PersistedProgressState | null {
  if (!isRecord(value)) return null
  const missionProgress = normalizeMissionProgress(value.missionProgress, now)
  const progressResetAt = normalizeResetEpoch(value.progressResetAt)
  const progressResetSerial = normalizeResetSerial(value.progressResetSerial, progressResetAt)
  if (progressResetSerial === null) return null
  return {
    missionProgress,
    progressMilestones: normalizeProgressMilestones(value.progressMilestones, missionProgress, now),
    progressResetAt,
    progressResetSerial,
  }
}

function parsePersistedEnvelope(raw: string, now = Date.now()): PersistedProgressState | null {
  if (raw.length > MAX_PROGRESS_STORAGE_BYTES) return null
  try {
    const envelope: unknown = JSON.parse(raw)
    if (!isRecord(envelope) || envelope.version !== MISSION_PROGRESS_VERSION) return null
    return normalizePersistedState(envelope.state, now)
  } catch {
    return null
  }
}

function serializePersistedState(state: PersistedProgressState): string {
  return JSON.stringify({ state, version: MISSION_PROGRESS_VERSION })
}

function mergeCompletionTallies(
  left: MissionProgressRecord & { status: 'completed' },
  right: MissionProgressRecord & { status: 'completed' },
): CompletionTally {
  const merged: CompletionTally = {}
  for (const writerId of [...new Set([
    ...Object.keys(left.completionTally),
    ...Object.keys(right.completionTally),
  ])].sort()) {
    merged[writerId] = Math.max(left.completionTally[writerId] ?? 0, right.completionTally[writerId] ?? 0)
  }
  return merged
}

function mergeCompletionHistories(
  left: MissionCompletionAttempt[],
  right: MissionCompletionAttempt[],
): MissionCompletionAttempt[] {
  return canonicalizeCompletionAttempts([...left, ...right])
    .slice(-MAX_STORED_COMPLETION_HISTORY)
}

function completionAttemptFingerprint(attempt: MissionCompletionAttempt): string {
  return `${attempt.startedAt}\u0000${attempt.completedAt}\u0000${attempt.score}`
}

function completionAttemptIdentityRank(attempt: MissionCompletionAttempt): string {
  if (attempt.id === `legacy:${attempt.completedAt}:${attempt.score}:latest`) return '2'
  return attempt.id.startsWith('legacy:') ? '1' : '0'
}

function compareCompletionAttempts(left: MissionCompletionAttempt, right: MissionCompletionAttempt): number {
  // Rank legacy identities after concrete identities for an otherwise equal
  // event. If a bounded history retains the legacy marker, later merges can
  // still recognize and absorb concrete aliases of that migrated event. A
  // synthesized latest marker ranks last so the record's declared latest
  // score remains stable when several attempts share one millisecond.
  const leftKey = `${left.completedAt}\u0000${completionAttemptIdentityRank(left)}\u0000${left.id}\u0000${left.startedAt}\u0000${String(left.score).padStart(3, '0')}\u0000${left.completedLocalDay}`
  const rightKey = `${right.completedAt}\u0000${completionAttemptIdentityRank(right)}\u0000${right.id}\u0000${right.startedAt}\u0000${String(right.score).padStart(3, '0')}\u0000${right.completedLocalDay}`
  return leftKey === rightKey ? 0 : leftKey < rightKey ? -1 : 1
}

function canonicalizeCompletionAttempts(
  candidates: MissionCompletionAttempt[],
): MissionCompletionAttempt[] {
  // Attempt IDs are logical event identities. If hostile or conflicting
  // snapshots reuse one ID with different content, deterministically retain
  // the greatest canonical version rather than counting both versions.
  const winnerById = new Map<string, MissionCompletionAttempt>()
  for (const attempt of candidates) {
    const current = winnerById.get(attempt.id)
    if (current === undefined || compareCompletionAttempts(current, attempt) < 0) {
      winnerById.set(attempt.id, attempt)
    }
  }

  // A generated legacy identity is an absorbing alias marker for its event
  // fingerprint. Retaining that marker makes deduplication associative even
  // when intermediate histories are truncated to the latest 50 attempts.
  const winners = [...winnerById.values()]
  const legacyWinnerByFingerprint = new Map<string, MissionCompletionAttempt>()
  for (const attempt of winners) {
    if (!attempt.id.startsWith('legacy:')) continue
    const fingerprint = completionAttemptFingerprint(attempt)
    const current = legacyWinnerByFingerprint.get(fingerprint)
    if (current === undefined || compareCompletionAttempts(current, attempt) < 0) {
      legacyWinnerByFingerprint.set(fingerprint, attempt)
    }
  }
  const legacyFingerprints = new Set(legacyWinnerByFingerprint.keys())
  const canonical = winners.filter(attempt => (
    attempt.id.startsWith('legacy:')
      ? false
      : !legacyFingerprints.has(completionAttemptFingerprint(attempt))
  ))
  canonical.push(...legacyWinnerByFingerprint.values())
  return canonical.sort(compareCompletionAttempts)
}

function mergeMissionRecords(
  left: MissionProgressRecord,
  right: MissionProgressRecord,
): MissionProgressRecord {
  if (left.status === 'completed' && right.status === 'in-progress') return left
  if (left.status === 'in-progress' && right.status === 'completed') return right
  if (left.status === 'in-progress' && right.status === 'in-progress') {
    const startedAt = left.startedAt <= right.startedAt ? left.startedAt : right.startedAt
    const updatedAt = left.updatedAt >= right.updatedAt ? left.updatedAt : right.updatedAt
    return {
      status: 'in-progress',
      active: true,
      startedAt,
      updatedAt,
      completedAttempts: 0,
    }
  }

  const leftCompleted = left as MissionProgressRecord & { status: 'completed' }
  const rightCompleted = right as MissionProgressRecord & { status: 'completed' }
  const mergedCompletionHistory = mergeCompletionHistories(
    leftCompleted.completionHistory,
    rightCompleted.completionHistory,
  )
  const completionTally = mergeCompletionTallies(leftCompleted, rightCompleted)
  const completedAttempts = Object.values(completionTally)
    .reduce((sum, count) => Math.min(MAX_COMPLETED_ATTEMPTS, sum + count), 0)
  const completionHistory = mergedCompletionHistory.slice(-Math.min(
    MAX_STORED_COMPLETION_HISTORY,
    completedAttempts,
  ))
  const latestAttempt = completionHistory.at(-1)
  const completedAt = latestAttempt?.completedAt
    ?? (leftCompleted.completedAt >= rightCompleted.completedAt
      ? leftCompleted.completedAt
      : rightCompleted.completedAt)
  const latestScore = latestAttempt?.score
    ?? (leftCompleted.completedAt >= rightCompleted.completedAt
      ? leftCompleted.latestScore
      : rightCompleted.latestScore)
  return {
    status: 'completed',
    active: false,
    startedAt: leftCompleted.startedAt <= rightCompleted.startedAt
      ? leftCompleted.startedAt
      : rightCompleted.startedAt,
    updatedAt: [leftCompleted.updatedAt, rightCompleted.updatedAt, completedAt].sort().at(-1) ?? completedAt,
    completedAt,
    bestScore: Math.max(leftCompleted.bestScore, rightCompleted.bestScore, latestScore),
    latestScore,
    completedAttempts,
    completionHistory,
    completionTally,
  }
}

export function mergeProgressSnapshots(
  left: PersistedProgressState,
  right: PersistedProgressState,
  now = Date.now(),
): PersistedProgressState {
  const normalizedLeft = normalizePersistedState(left, now)
  const normalizedRight = normalizePersistedState(right, now)
  if (normalizedLeft === null) return normalizedRight ?? {
    missionProgress: {},
    progressMilestones: calculateStoredStreakSummary({}),
    progressResetAt: 0,
    progressResetSerial: '0',
  }
  if (normalizedRight === null) return normalizedLeft
  const resetClockComparison = compareResetClocks(normalizedLeft, normalizedRight)
  if (resetClockComparison !== 0) return resetClockComparison > 0 ? normalizedLeft : normalizedRight

  const missionProgress: MissionProgressMap = {}
  const missionIds = [...new Set([
    ...Object.keys(normalizedLeft.missionProgress),
    ...Object.keys(normalizedRight.missionProgress),
  ])].sort()
  for (const missionId of missionIds) {
    const leftRecord = normalizedLeft.missionProgress[missionId]
    const rightRecord = normalizedRight.missionProgress[missionId]
    if (leftRecord === undefined) missionProgress[missionId] = rightRecord
    else if (rightRecord === undefined) missionProgress[missionId] = leftRecord
    else missionProgress[missionId] = mergeMissionRecords(leftRecord, rightRecord)
  }

  const leftMilestone = normalizedLeft.progressMilestones
  const rightMilestone = normalizedRight.progressMilestones
  const laterMilestone = leftMilestone.lastCompletionLocalDay === rightMilestone.lastCompletionLocalDay
    ? {
        longestStreakAchieved: Math.max(leftMilestone.longestStreakAchieved, rightMilestone.longestStreakAchieved),
        currentStreak: Math.max(leftMilestone.currentStreak, rightMilestone.currentStreak),
        lastCompletionLocalDay: leftMilestone.lastCompletionLocalDay,
      }
    : (leftMilestone.lastCompletionLocalDay ?? '') > (rightMilestone.lastCompletionLocalDay ?? '')
      ? leftMilestone
      : rightMilestone
  const progressMilestones = normalizeProgressMilestones({
    ...laterMilestone,
    longestStreakAchieved: Math.max(
      leftMilestone.longestStreakAchieved,
      rightMilestone.longestStreakAchieved,
    ),
  }, missionProgress, now)
  return {
    missionProgress,
    progressMilestones,
    progressResetAt: normalizedLeft.progressResetAt,
    progressResetSerial: normalizedLeft.progressResetSerial,
  }
}

export function normalizePersistedEnvelope(raw: string): string | null {
  const state = parsePersistedEnvelope(raw)
  if (state === null) return null
  const normalized = serializePersistedState(state)
  return normalized.length <= MAX_PROGRESS_STORAGE_BYTES ? normalized : null
}

const safeProgressStorage = {
  getItem(name: string): string | null {
    if (typeof window === 'undefined') return null
    try {
      const raw = window.localStorage.getItem(name)
      if (raw === null) return null
      const normalized = normalizePersistedEnvelope(raw)
      if (normalized === null) reportProgressPersistence('error')
      return normalized
    } catch {
      reportProgressPersistence('error')
      return null
    }
  },
  setItem(name: string, value: string): void {
    if (typeof window === 'undefined') return
    try {
      const incoming = parsePersistedEnvelope(value)
      if (incoming === null) {
        reportProgressPersistence('error')
        return
      }
      const incomingSerialized = serializePersistedState(incoming)
      let lastForcedState: PersistedProgressState | null = null
      const mergeAndStore = (forceIncoming = false) => {
        const existingRaw = window.localStorage.getItem(name)
        const existing = existingRaw === null ? null : parsePersistedEnvelope(existingRaw)
        let merged: PersistedProgressState
        if (!forceIncoming) {
          merged = existing === null ? incoming : mergeProgressSnapshots(existing, incoming)
        } else if (
          lastForcedState !== null
          && existing !== null
          && compareResetClocks(existing, lastForcedState) === 0
        ) {
          // Progress written after this reset carries the reset's exact clock and
          // is therefore part of the new generation; never erase it on lock retry.
          merged = existing
        } else if (existing === null || compareResetClocks(incoming, existing) > 0) {
          merged = incoming
        } else {
          // A stale tab can request reset after another tab has already advanced.
          // Reset intent must dominate the latest persisted generation instead of
          // overwriting it with an older clock and allowing progress to resurrect.
          merged = emptyProgressAtClock(nextResetClock(
            existing.progressResetAt,
            existing.progressResetSerial,
          ))
        }
        const serialized = serializePersistedState(merged)
        if (serialized.length > MAX_PROGRESS_STORAGE_BYTES) {
          throw new Error('Progress storage capacity exceeded')
        }
        if (serialized !== existingRaw) window.localStorage.setItem(name, serialized)
        if (forceIncoming) lastForcedState = merged
        return serialized
      }
      const forceIncoming = forceNextProgressResetWrite
      forceNextProgressResetWrite = false
      const synchronized = mergeAndStore(forceIncoming)
      if (!persistenceStatusUpdateInFlight) reportProgressPersistence('ready')
      if (synchronized !== incomingSerialized) {
        queueMicrotask(() => reconcileProgressFromRaw(synchronized))
      }
      if (window.navigator.locks !== undefined) {
        void window.navigator.locks.request(`${MISSION_PROGRESS_STORAGE_KEY}:write`, () => {
          const locked = mergeAndStore(forceIncoming)
          if (locked !== incomingSerialized) queueMicrotask(() => reconcileProgressFromRaw(locked))
        }).catch(() => {
          // Storage-event convergence remains available when the lock service rejects.
        })
      }
    } catch {
      reportProgressPersistence('error')
      // Storage denial or quota exhaustion must not break a training session.
    }
  },
  removeItem(name: string): void {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.removeItem(name)
    } catch {
      reportProgressPersistence('error')
      // Treat unavailable storage as an empty persistence layer.
    }
  },
}

export interface GameState {
  // Player
  callsign: string
  setCallsign: (callsign: string) => boolean

  // Mission progress
  missionProgress: MissionProgressMap
  progressMilestones: ProgressMilestones
  progressResetAt: number
  progressResetSerial: string
  progressPersistenceStatus: ProgressPersistenceStatus
  activeMissionStarts: Record<string, string>
  startMission: (missionId: string) => void
  completeMission: (missionId: string, score: number) => boolean
  resetMissionProgress: () => void
}

export const useGameStore = create<GameState>()(persist((set, get) => ({
  // Player
  callsign: loadStoredCallsign(),
  setCallsign: (callsign) => {
    const normalized = normalizeCallsign(callsign)
    if (normalized === null) return false
    const persisted = storeCallsign(normalized)
    set({ callsign: normalized })
    return persisted
  },

  // Mission progress
  missionProgress: {},
  progressMilestones: {
    longestStreakAchieved: 0,
    currentStreak: 0,
    lastCompletionLocalDay: null,
  },
  progressResetAt: 0,
  progressResetSerial: '0',
  progressPersistenceStatus: 'ready',
  activeMissionStarts: {},
  startMission: (missionId) => set((state) => {
    if (!MISSION_ID_PATTERN.test(missionId) || !KNOWN_MISSION_IDS.has(missionId)) return state
    const now = new Date().toISOString()
    const previous = state.missionProgress[missionId]
    if (previous?.status === 'completed') {
      if (state.activeMissionStarts[missionId] !== undefined) return state
      return {
        activeMissionStarts: {
          ...state.activeMissionStarts,
          [missionId]: now,
        },
      }
    }
    if (previous?.status === 'in-progress') {
      if (state.activeMissionStarts[missionId] !== undefined) return state
      return {
        activeMissionStarts: {
          ...state.activeMissionStarts,
          [missionId]: now,
        },
      }
    }
    const nextRecord: MissionProgressRecord = {
          status: 'in-progress',
          active: true,
          startedAt: now,
          updatedAt: now,
          completedAttempts: 0,
        }
    const missionProgress = {
      ...state.missionProgress,
      [missionId]: nextRecord,
    }
    return {
      missionProgress,
      activeMissionStarts: {
        ...state.activeMissionStarts,
        [missionId]: now,
      },
    }
  }),
  completeMission: (missionId, score) => {
    const state = get()
    const normalizedScore = normalizeScore(score)
    if (!MISSION_ID_PATTERN.test(missionId) || !KNOWN_MISSION_IDS.has(missionId) || normalizedScore === null) return false

    const previous = state.missionProgress[missionId]
    const replayStartedAt = state.activeMissionStarts[missionId]
    if (previous?.status !== 'in-progress' && !(previous?.status === 'completed' && replayStartedAt !== undefined)) {
      return false
    }
    const attemptStartedAt = replayStartedAt
      ?? (previous.status === 'in-progress' ? previous.startedAt : undefined)
    if (attemptStartedAt === undefined) return false
    const wallClock = Date.now()
    const attemptStartedTime = Date.parse(attemptStartedAt)
    const previousUpdatedTime = Date.parse(previous.updatedAt)
    if (
      !Number.isFinite(attemptStartedTime)
      || !Number.isFinite(previousUpdatedTime)
    ) {
      return false
    }
    const completionTime = Math.max(wallClock, attemptStartedTime + 1, previousUpdatedTime + 1)
    if (completionTime > LATEST_REASONABLE_PROGRESS_TIMESTAMP) {
      reportProgressPersistence('error')
      return false
    }
    const now = new Date(completionTime).toISOString()
    const previousBest = previous?.status === 'completed' ? previous.bestScore : undefined
    const previousHistory = previous?.status === 'completed' ? previous.completionHistory : []
    const writerId = getProgressWriterId()
    const completionTally: CompletionTally = previous?.status === 'completed'
      ? { ...previous.completionTally }
      : {}
    const previousWriterCount = completionTally[writerId] ?? 0
    const completedAttemptsBefore = Object.values(completionTally)
      .reduce((sum, count) => Math.min(MAX_COMPLETED_ATTEMPTS, sum + count), 0)
    if (completedAttemptsBefore >= MAX_COMPLETED_ATTEMPTS) {
      reportProgressPersistence('error')
      return false
    }
    completionTally[writerId] = previousWriterCount + 1
    const completedAttempts = completedAttemptsBefore + 1
    const completionHistory = [
      ...previousHistory,
      {
        id: createAttemptId(now),
        startedAt: attemptStartedAt,
        completedAt: now,
        completedLocalDay: localDayKey(now),
        score: normalizedScore,
      },
    ].slice(-MAX_STORED_COMPLETION_HISTORY)
    const nextRecord: MissionProgressRecord = {
      status: 'completed',
      active: false,
      startedAt: previous?.startedAt ?? attemptStartedAt,
      updatedAt: now,
      completedAt: now,
      bestScore: previousBest === undefined ? normalizedScore : Math.max(previousBest, normalizedScore),
      latestScore: normalizedScore,
      completedAttempts,
      completionHistory,
      completionTally,
    }
    const missionProgress = {
      ...state.missionProgress,
      [missionId]: nextRecord,
    }
    const completionLocalDay = completionHistory.at(-1)?.completedLocalDay ?? localDayKey(now)
    const previousCompletionDay = state.progressMilestones.lastCompletionLocalDay
    const currentStreak = previousCompletionDay === completionLocalDay
      ? Math.max(1, state.progressMilestones.currentStreak)
      : previousCompletionDay !== null && shiftCalendarDay(previousCompletionDay, 1) === completionLocalDay
        ? state.progressMilestones.currentStreak + 1
        : 1
    const progressMilestones = {
      longestStreakAchieved: Math.max(
        state.progressMilestones.longestStreakAchieved,
        currentStreak,
        calculateLongestStoredStreak(missionProgress),
      ),
      currentStreak,
      lastCompletionLocalDay: completionLocalDay,
    }
    const activeMissionStarts = { ...state.activeMissionStarts }
    delete activeMissionStarts[missionId]
    set({
      missionProgress,
      progressMilestones,
      activeMissionStarts,
    })
    return true
  },
  resetMissionProgress: () => {
    const state = get()
    let { progressResetAt, progressResetSerial } = nextResetClock(
      state.progressResetAt,
      state.progressResetSerial,
    )
    if (serializePersistedState(emptyProgressAtClock({ progressResetAt, progressResetSerial })).length > MAX_PROGRESS_STORAGE_BYTES) {
      // A hostile or exhausted logical clock can consume the whole storage
      // budget. Removing the key is the browser's authoritative recovery
      // signal; other open tabs clear their active sessions on that event.
      try {
        if (typeof window !== 'undefined') window.localStorage.removeItem(MISSION_PROGRESS_STORAGE_KEY)
        progressResetAt = 0
        progressResetSerial = '0'
      } catch {
        reportProgressPersistence('error')
      }
    }
    forceNextProgressResetWrite = typeof window !== 'undefined'
    set({
      missionProgress: {},
      progressMilestones: {
        longestStreakAchieved: 0,
        currentStreak: 0,
        lastCompletionLocalDay: null,
      },
      progressResetAt,
      progressResetSerial,
      activeMissionStarts: {},
    })
  },
}), {
  name: MISSION_PROGRESS_STORAGE_KEY,
  version: MISSION_PROGRESS_VERSION,
  storage: createJSONStorage(() => safeProgressStorage),
  partialize: (state) => ({
    missionProgress: state.missionProgress,
    progressMilestones: state.progressMilestones,
    progressResetAt: state.progressResetAt,
    progressResetSerial: state.progressResetSerial,
  }),
  merge: (persistedState, currentState) => {
    const persisted = normalizePersistedState(persistedState) ?? {
      missionProgress: {},
      progressMilestones: calculateStoredStreakSummary({}),
      progressResetAt: 0,
      progressResetSerial: '0',
    }
    const current = normalizePersistedState(currentState) ?? {
      missionProgress: {},
      progressMilestones: calculateStoredStreakSummary({}),
      progressResetAt: 0,
      progressResetSerial: '0',
    }
    const merged = mergeProgressSnapshots(persisted, current)
    return {
      ...currentState,
      ...merged,
      activeMissionStarts: merged.progressResetAt === current.progressResetAt
        && merged.progressResetSerial === current.progressResetSerial
        ? currentState.activeMissionStarts
        : {},
    }
  },
}))

progressStoreInitialized = true
if (pendingPersistenceStatus !== null) reportProgressPersistence(pendingPersistenceStatus)

function reconcileProgressFromRaw(raw: string): void {
  const external = parsePersistedEnvelope(raw)
  if (external === null) return
  const state = useGameStore.getState()
  const current = normalizePersistedState(state)
  if (current === null) return
  let merged: PersistedProgressState
  try {
    merged = mergeProgressSnapshots(current, external)
    const storedRaw = window.localStorage.getItem(MISSION_PROGRESS_STORAGE_KEY)
    const stored = storedRaw === null ? null : parsePersistedEnvelope(storedRaw)
    if (stored !== null) merged = mergeProgressSnapshots(merged, stored)
  } catch {
    reportProgressPersistence('error')
    return
  }
  const mergedSerialized = serializePersistedState(merged)
  if (mergedSerialized !== serializePersistedState(current)) {
    useGameStore.setState({
      missionProgress: merged.missionProgress,
      progressMilestones: merged.progressMilestones,
      progressResetAt: merged.progressResetAt,
      progressResetSerial: merged.progressResetSerial,
      activeMissionStarts: merged.progressResetAt === current.progressResetAt
        && merged.progressResetSerial === current.progressResetSerial
        ? state.activeMissionStarts
        : {},
    })
    return
  }
  try {
    const storedRaw = window.localStorage.getItem(MISSION_PROGRESS_STORAGE_KEY)
    const stored = storedRaw === null ? null : parsePersistedEnvelope(storedRaw)
    if (stored === null || serializePersistedState(stored) !== mergedSerialized) {
      safeProgressStorage.setItem(MISSION_PROGRESS_STORAGE_KEY, mergedSerialized)
    }
  } catch {
    // An unavailable persistence layer must not break the active session.
  }
}

if (typeof window !== 'undefined') {
  const handleProgressStorage = (event: StorageEvent) => {
    if (
      event.storageArea === window.localStorage
      && event.key === MISSION_PROGRESS_STORAGE_KEY
    ) {
      if (event.newValue === null) {
        forceNextProgressResetWrite = true
        useGameStore.setState({
          missionProgress: {},
          progressMilestones: calculateStoredStreakSummary({}),
          progressResetAt: 0,
          progressResetSerial: '0',
          activeMissionStarts: {},
        })
      } else {
        reconcileProgressFromRaw(event.newValue)
      }
    }
  }
  window.addEventListener('storage', handleProgressStorage)
  if (import.meta.hot) {
    import.meta.hot.dispose(() => window.removeEventListener('storage', handleProgressStorage))
  }
}
