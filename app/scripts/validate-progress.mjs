import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  deriveMissionActivity,
  deriveProgressMetrics,
  deriveSkillGroups,
} from '../src/lib/progressMetrics.ts'
import { allocateIntegerPoints } from '../src/lib/scoreAllocation.ts'
import {
  MAX_MISSION_RUN_EVIDENCE_BYTES,
  MAX_MISSION_RUN_ACTIONS,
  createMissionRunEvidence,
  isMissionDebriefAvailable,
  persistMissionCompletion,
  scheduleCoalescedTask,
  tryRecordMissionAction,
} from '../src/lib/missionCompletion.ts'
import {
  segmentTextForTypewriter,
  splitTextIntoCodePoints,
} from '../src/lib/textSegmentation.ts'
import {
  calculateTotalXP,
  deriveProgressRank,
  resolveAchievements,
} from '../src/data/achievements.ts'
import {
  mergeProgressSnapshots,
  normalizeCallsign,
  normalizeMissionProgress,
  normalizePersistedEnvelope,
  normalizeProgressMilestones,
  sanitizeCallsignInput,
  useGameStore,
} from '../src/store/gameStore.ts'

const levels = [
  {
    id: 'known-a',
    checks: [
      { type: 'command_used', pattern: 'whoami' },
      { type: 'command_used', pattern: 'id' },
      { type: 'no_red_command_used', pattern: '' },
    ],
  },
  {
    id: 'known-b',
    checks: [
      { type: 'command_used', pattern: 'whoami' },
      { type: 'command_used' },
    ],
  },
  { id: 'known-c', checks: [{ type: 'command_used', pattern: 'pwd' }] },
]

const progress = {
  'known-a': {
    status: 'completed',
    startedAt: '2026-07-29T08:00:00.000Z',
    updatedAt: '2026-07-29T08:02:00.000Z',
    completedAt: '2026-07-29T08:02:00.000Z',
    bestScore: 100,
    latestScore: 100,
    completedAttempts: 1,
  },
  'known-b': {
    status: 'completed',
    startedAt: '2026-07-30T08:00:00.000Z',
    updatedAt: '2026-07-30T08:01:00.000Z',
    completedAt: '2026-07-30T08:01:00.000Z',
    bestScore: 80,
    latestScore: 80,
    completedAttempts: 1,
  },
  'known-c': {
    status: 'in-progress',
    startedAt: '2026-07-30T09:00:00.000Z',
    updatedAt: '2026-07-30T09:00:00.000Z',
    completedAttempts: 0,
  },
  'forged-unknown': {
    status: 'completed',
    startedAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:01.000Z',
    completedAt: '2026-07-30T00:00:01.000Z',
    bestScore: 100,
    latestScore: 100,
    completedAttempts: 999,
  },
}

const metrics = deriveProgressMetrics(levels, progress, '2026-07-30T12:00:00')
assert.equal(metrics.missionsCompleted, 2, 'unknown and in-progress records must not count as completed')
assert.equal(metrics.validatedActions, 2, 'validated actions must come from successful mission contracts and be deduplicated')
assert.equal(metrics.currentStreak, 2, 'consecutive local calendar days must form a streak')
assert.equal(metrics.firstStartedAt, '2026-07-29T08:00:00.000Z')
assert.equal(metrics.hasPerfectScore, true)

const activity = deriveMissionActivity(levels, progress, '2026-07-30T12:00:00', 3)
assert.equal(activity.length, 3)
assert.deepEqual(activity.map((day) => day.count), [0, 1, 1])

const skills = deriveSkillGroups([
  { id: 2, completedDrills: 2, totalDrills: 4 },
  { id: 3, completedDrills: 1, totalDrills: 2 },
  { id: 16, completedDrills: 3, totalDrills: 3 },
])
assert.equal(skills.find((skill) => skill.domain === 'filesystem')?.score, 50)
assert.equal(skills.find((skill) => skill.domain === 'git')?.score, 100)
assert.equal(skills.find((skill) => skill.domain === 'network')?.score, 0)
assert.equal(
  Object.hasOwn(skills[0], 'name'),
  false,
  'progress metrics must expose stable domains rather than English presentation labels',
)

assert.deepEqual(
  allocateIntegerPoints(40, 3),
  [14, 13, 13],
  'objective-point remainder allocation must be deterministic',
)
assert.equal(
  allocateIntegerPoints(40, 3).reduce((sum, points) => sum + points, 0),
  40,
  'per-objective points must preserve the exact earned objective total',
)
assert.deepEqual(allocateIntegerPoints(40, 0), [])

const familyEmoji = '\u{1F469}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}'
const combiningGrapheme = 'e\u0301'
assert.deepEqual(
  segmentTextForTypewriter(`A${familyEmoji}${combiningGrapheme}`),
  ['A', familyEmoji, combiningGrapheme],
  'typewriter segmentation must preserve emoji ZWJ sequences and combining graphemes',
)
assert.deepEqual(
  splitTextIntoCodePoints('A\u{1F600}B'),
  ['A', '\u{1F600}', 'B'],
  'the fallback must never split a surrogate pair',
)

assert.equal(isMissionDebriefAvailable(true, true), true)
for (const [reportPersisted, progressRecorded] of [
  [false, true],
  [true, false],
  [false, false],
  [null, true],
  [true, null],
]) {
  assert.equal(
    isMissionDebriefAvailable(reportPersisted, progressRecorded),
    false,
    'debrief access requires both the canonical progress and run report',
  )
}

const createTrackedAction = (id, command, successfulCommands = [command]) => ({
  id: String(id),
  timestampSeconds: 0,
  command,
  exitCode: 0,
  kind: 'command',
  cwd: '/home/ghost',
  mode: 'shell',
  successfulCommands,
  redCommands: [],
})

const adversarialEvidence = createMissionRunEvidence()
let acceptedAdversarialActions = 0
for (let index = 0; index < 10_000; index++) {
  if (tryRecordMissionAction(adversarialEvidence, createTrackedAction(index + 1, ':'))) {
    acceptedAdversarialActions++
  }
}
assert.equal(acceptedAdversarialActions, MAX_MISSION_RUN_ACTIONS)
assert.equal(adversarialEvidence.attemptedActions.length, MAX_MISSION_RUN_ACTIONS)
assert.equal(adversarialEvidence.attemptedCommands.length, MAX_MISSION_RUN_ACTIONS)
assert.equal(adversarialEvidence.successfulCommands.length, MAX_MISSION_RUN_ACTIONS)
assert.equal(adversarialEvidence.exhausted, true, 'action-budget exhaustion must remain sticky')
assert.equal(
  tryRecordMissionAction(adversarialEvidence, createTrackedAction(10_001, 'whoami')),
  false,
  'actions after exhaustion must fail closed instead of creating an unverifiable report',
)

const validEvidence = createMissionRunEvidence()
assert.equal(tryRecordMissionAction(validEvidence, createTrackedAction(1, 'whoami')), true)
assert.equal(tryRecordMissionAction(validEvidence, createTrackedAction(2, 'id')), true)
assert.equal(validEvidence.exhausted, false)
assert.deepEqual(validEvidence.attemptedCommands, ['whoami', 'id'])
assert.deepEqual(validEvidence.successfulCommands, ['whoami', 'id'])
assert.deepEqual(
  validEvidence.successfulCommands,
  validEvidence.attemptedActions.flatMap(action => action.successfulCommands),
  'a normal mission must retain the exact evidence needed for a savable debrief',
)
assert.equal(isMissionDebriefAvailable(true, !validEvidence.exhausted), true)

const serializedEvidenceBytes = evidence => new TextEncoder().encode([
  JSON.stringify(evidence.attemptedCommands),
  JSON.stringify(evidence.attemptedActions),
  JSON.stringify(evidence.successfulCommands),
  JSON.stringify(evidence.redCommandsUsed),
].join('')).byteLength
assert.equal(
  validEvidence.serializedBytes,
  serializedEvidenceBytes(validEvidence),
  'evidence accounting must equal the four arrays actually retained in memory',
)

const longFailureEvidence = createMissionRunEvidence()
const longFailedCommand = 'x'.repeat(20_000)
let acceptedLongFailures = 0
while (tryRecordMissionAction(
  longFailureEvidence,
  createTrackedAction(acceptedLongFailures + 1, longFailedCommand, []),
)) {
  acceptedLongFailures++
}
assert.ok(acceptedLongFailures > 0)
assert.equal(longFailureEvidence.exhausted, true)
assert.equal(longFailureEvidence.serializedBytes, serializedEvidenceBytes(longFailureEvidence))
assert.ok(longFailureEvidence.serializedBytes <= MAX_MISSION_RUN_EVIDENCE_BYTES)

const oversizedTraceEvidence = createMissionRunEvidence()
assert.equal(
  tryRecordMissionAction(
    oversizedTraceEvidence,
    createTrackedAction(1, 'echo $BIG$BIG', [`echo ${'a'.repeat(20_001)}`]),
  ),
  false,
  'report-incompatible expanded traces must fail before progress can be committed',
)
assert.equal(oversizedTraceEvidence.exhausted, true)
assert.deepEqual(oversizedTraceEvidence.attemptedActions, [])

const persistenceOrder = []
assert.deepEqual(
  persistMissionCompletion(
    () => {
      persistenceOrder.push('progress')
      return true
    },
    () => {
      persistenceOrder.push('report')
      return true
    },
  ),
  { progressRecorded: true, runReportPersisted: true },
)
assert.deepEqual(persistenceOrder, ['progress', 'report'])

let orphanReportWrites = 0
assert.deepEqual(
  persistMissionCompletion(
    () => false,
    () => {
      orphanReportWrites += 1
      return true
    },
  ),
  { progressRecorded: false, runReportPersisted: false },
  'a reset-invalidated attempt must fail closed before writing a run report',
)
assert.equal(orphanReportWrites, 0)

const failedReportPersistence = persistMissionCompletion(() => true, () => false)
assert.deepEqual(failedReportPersistence, {
  progressRecorded: true,
  runReportPersisted: false,
})
assert.equal(
  isMissionDebriefAvailable(
    failedReportPersistence.runReportPersisted,
    failedReportPersistence.progressRecorded,
  ),
  false,
  'a failed report write must keep debrief unavailable even after progress succeeds',
)

const pendingValidation = { current: null }
const scheduledValidations = []
let completedValidations = 0
let acceptedSchedules = 0
for (let index = 0; index < 10_000; index++) {
  if (scheduleCoalescedTask(
    pendingValidation,
    callback => {
      scheduledValidations.push(callback)
      return scheduledValidations.length
    },
    () => { completedValidations++ },
  )) acceptedSchedules++
}
assert.equal(acceptedSchedules, 1)
assert.equal(scheduledValidations.length, 1, 'a command burst must allocate only one validation timer')
assert.equal(completedValidations, 0)
scheduledValidations[0]()
assert.equal(completedValidations, 1)
assert.equal(pendingValidation.current, null)
assert.equal(
  scheduleCoalescedTask(
    pendingValidation,
    callback => {
      scheduledValidations.push(callback)
      return scheduledValidations.length
    },
    () => { completedValidations++ },
  ),
  true,
  'a completed validation must release the single scheduling slot',
)

const unicodeCallsign = `${'A'.repeat(19)}😀`
assert.equal(
  sanitizeCallsignInput(unicodeCallsign),
  unicodeCallsign,
  'callsign truncation must count Unicode code points rather than UTF-16 code units',
)
assert.equal([...sanitizeCallsignInput(`${unicodeCallsign}B`)].length, 20)
assert.equal(normalizeCallsign(unicodeCallsign), unicodeCallsign)
assert.equal(normalizeCallsign(`valid\uD83D`), null, 'unpaired surrogates must be rejected')
assert.equal(sanitizeCallsignInput(`valid\uD83D`), 'valid', 'interactive filtering must remove unpaired surrogates')
assert.equal(normalizeCallsign('left\u202Eright'), null, 'bidi overrides must be rejected')
assert.equal(normalizeCallsign('left\u2066right\u2069'), null, 'bidi isolates must be rejected')
assert.equal(
  sanitizeCallsignInput('left\u202Eright\u2066safe\u2069'),
  'leftrightsafe',
  'interactive callsign filtering must remove bidi formatting controls',
)
assert.equal(
  normalizeCallsign('👩‍💻'),
  '👩‍💻',
  'valid emoji ZWJ sequences must remain allowed',
)
assert.equal(
  sanitizeCallsignInput('👩‍💻'),
  '👩‍💻',
  'interactive filtering must preserve valid emoji ZWJ sequences',
)

for (const localeName of ['en', 'zh']) {
  const locale = JSON.parse(readFileSync(
    new URL(`../src/i18n/locales/${localeName}.json`, import.meta.url),
    'utf8',
  ))
  for (const skill of skills) {
    assert.equal(
      typeof locale.skills?.[skill.domain],
      'string',
      `${localeName} locale must label stable skill domain ${skill.domain}`,
    )
  }
}

const achievements = resolveAchievements(metrics)
assert.deepEqual(
  achievements.filter((achievement) => achievement.unlocked).map((achievement) => achievement.id),
  ['perfect-score'],
  'only achievements backed by persisted evidence may unlock',
)
assert.equal(achievements.length, 3, 'UI must only advertise achievements backed by the stored evidence model')
assert.equal(calculateTotalXP(metrics.missionsCompleted, achievements), 340)
assert.equal(deriveProgressRank(9_999), 'recruit')
assert.equal(deriveProgressRank(10_000), 'operator')
assert.equal(deriveProgressRank(20_000), 'ghost')

const historicalStreakProgress = {
  'known-a': {
    ...progress['known-a'],
    completionHistory: Array.from({ length: 7 }, (_, index) => ({
      startedAt: `2026-07-${String(10 + index).padStart(2, '0')}T08:00:00.000Z`,
      completedAt: `2026-07-${String(10 + index).padStart(2, '0')}T08:01:00.000Z`,
      score: 90,
    })),
  },
}
const historicalMetrics = deriveProgressMetrics(levels, historicalStreakProgress, '2026-07-30T12:00:00')
assert.equal(historicalMetrics.currentStreak, 0, 'an inactive streak must not be reported as current')
assert.equal(historicalMetrics.longestStreak, 7, 'bounded completion history must preserve earned streak evidence')
assert.equal(
  resolveAchievements(historicalMetrics).some((achievement) => achievement.id === 'week-warrior' && achievement.unlocked),
  true,
  'a once-earned streak achievement must not relock after the current streak ends',
)
const evictedHistoryMetrics = deriveProgressMetrics(
  levels,
  {
    'known-a': {
      ...progress['known-a'],
      completionHistory: Array.from({ length: 50 }, (_, index) => ({
        startedAt: `2026-07-29T08:${String(index).padStart(2, '0')}:00.000Z`,
        completedAt: `2026-07-29T08:${String(index).padStart(2, '0')}:30.000Z`,
        completedLocalDay: '2026-07-29',
        score: 90,
      })),
    },
  },
  '2026-07-30T12:00:00',
  { longestStreakAchieved: 7 },
)
assert.equal(evictedHistoryMetrics.longestStreak, 7)
assert.equal(
  resolveAchievements(evictedHistoryMetrics).some((achievement) => achievement.id === 'week-warrior' && achievement.unlocked),
  true,
  'bounded history eviction must not revoke a persisted lifetime milestone',
)

assert.deepEqual(normalizeMissionProgress({
  inverted: {
    status: 'completed',
    active: false,
    startedAt: '2026-07-30T12:00:00.000Z',
    completedAt: '2026-07-30T11:00:00.000Z',
    updatedAt: '2026-07-30T12:00:00.000Z',
    bestScore: 80,
    latestScore: 80,
    completedAttempts: 1,
  },
}, Date.parse('2026-07-30T13:00:00.000Z')), {}, 'inverted persisted timestamps must fail closed')

const timestampValidationNow = Date.parse('2026-07-30T13:00:00.000Z')
const plausibleFutureRecord = {
  status: 'completed',
  active: false,
  startedAt: '2026-07-30T13:01:00.000Z',
  updatedAt: '2026-07-30T13:02:00.000Z',
  completedAt: '2026-07-30T13:02:00.000Z',
  bestScore: 80,
  latestScore: 80,
  completedAttempts: 1,
}
assert.equal(
  Object.keys(normalizeMissionProgress({ 'whoami-shell': plausibleFutureRecord }, timestampValidationNow)).length,
  1,
  'small positive clock skew within the explicit tolerance must remain readable',
)
assert.deepEqual(
  normalizeMissionProgress({
    'whoami-shell': {
      ...plausibleFutureRecord,
      startedAt: '2099-12-31T23:58:00.000Z',
      updatedAt: '2099-12-31T23:59:00.000Z',
      completedAt: '2099-12-31T23:59:00.000Z',
    },
  }, timestampValidationNow),
  {},
  'the absolute 2100 cap must not make decades-future timestamps plausible today',
)
for (const invalidNow of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
  assert.deepEqual(
    normalizeMissionProgress({ 'whoami-shell': plausibleFutureRecord }, invalidNow),
    {},
    `a non-finite validation clock (${String(invalidNow)}) must fail closed`,
  )
}

const store = useGameStore.getState()
store.resetMissionProgress()
const directCompletionAccepted = useGameStore.getState().completeMission('whoami-shell', 100)
assert.equal(directCompletionAccepted, false)
assert.deepEqual(
  useGameStore.getState().missionProgress,
  {},
  'completion must require a previously started mission or replay session',
)
useGameStore.getState().startMission('forged-unknown')
useGameStore.getState().completeMission('forged-unknown', 100)
assert.deepEqual(useGameStore.getState().missionProgress, {}, 'unknown mission actions must fail closed')

useGameStore.getState().startMission('whoami-shell')
useGameStore.getState().completeMission('whoami-shell', 80)
const firstCompletion = useGameStore.getState().missionProgress['whoami-shell']
assert.equal(firstCompletion?.status, 'completed')
useGameStore.getState().startMission('whoami-shell')
assert.deepEqual(
  useGameStore.getState().missionProgress['whoami-shell'],
  firstCompletion,
  'starting a replay must not corrupt the last completed record',
)
useGameStore.getState().completeMission('whoami-shell', 100)
const replayCompletion = useGameStore.getState().missionProgress['whoami-shell']
assert.equal(replayCompletion?.status, 'completed')
assert.equal(replayCompletion?.completedAttempts, 2)
assert.equal(replayCompletion?.bestScore, 100)
assert.equal(replayCompletion?.startedAt, firstCompletion?.startedAt, 'replay must preserve the first training timestamp')
assert.equal(replayCompletion?.completionHistory.length, 2, 'each completion attempt must remain auditable')
const replayActivity = deriveMissionActivity(
  [{ id: 'whoami-shell', checks: [] }],
  useGameStore.getState().missionProgress,
  replayCompletion?.completedAt ?? Date.now(),
  1,
)
assert.equal(replayActivity[0]?.count, 2, 'heatmap activity must count both completion attempts')
useGameStore.getState().resetMissionProgress()

const sameMillisecondNow = Date.now() + 10_000
const restoreSameMillisecondDateNow = Date.now
Date.now = () => sameMillisecondNow
try {
  useGameStore.getState().startMission('whoami-shell')
  assert.equal(useGameStore.getState().completeMission('whoami-shell', 80), true)
  const sameMillisecondFirst = useGameStore.getState().missionProgress['whoami-shell']
  assert.equal(sameMillisecondFirst?.status, 'completed')

  useGameStore.getState().startMission('whoami-shell')
  assert.equal(useGameStore.getState().completeMission('whoami-shell', 35), true)
  const sameMillisecondReplay = useGameStore.getState().missionProgress['whoami-shell']
  assert.equal(sameMillisecondReplay?.status, 'completed')
  assert.equal(
    Date.parse(sameMillisecondReplay?.completedAt ?? '') > Date.parse(sameMillisecondFirst?.completedAt ?? ''),
    true,
    'replays must receive a strictly newer completion timestamp when the wall clock does not advance',
  )
  assert.equal(sameMillisecondReplay?.latestScore, 35, 'the strictly latest replay score must win')
  assert.equal(sameMillisecondReplay?.bestScore, 80, 'a lower replay score must not reduce the best score')
  assert.equal(
    sameMillisecondReplay?.status === 'completed'
      ? sameMillisecondReplay.completionHistory.at(-1)?.score
      : undefined,
    35,
    'bounded completion history must end with the strictly latest replay',
  )
} finally {
  Date.now = restoreSameMillisecondDateNow
}
useGameStore.getState().resetMissionProgress()

useGameStore.getState().startMission('whoami-shell')
const rollbackStart = useGameStore.getState().missionProgress['whoami-shell']
assert.equal(rollbackStart?.status, 'in-progress')
const originalDateNow = Date.now
Date.now = () => Date.parse(rollbackStart?.startedAt ?? '') - 6 * 60 * 1_000
try {
  assert.equal(
    useGameStore.getState().completeMission('whoami-shell', 90),
    true,
    'a valid in-memory session must still record completion after a large wall-clock rollback',
  )
} finally {
  Date.now = originalDateNow
}
const rollbackCompletion = useGameStore.getState().missionProgress['whoami-shell']
assert.equal(rollbackCompletion?.status, 'completed')
assert.equal(
  Date.parse(rollbackCompletion?.completedAt ?? '') >= Date.parse(rollbackCompletion?.startedAt ?? ''),
  true,
  'small wall-clock rollbacks must be clamped to a monotonic mission timeline',
)
assert.equal(
  Object.keys(normalizeMissionProgress({ 'whoami-shell': rollbackCompletion })).length,
  1,
  'the in-memory completion must survive persistence normalization after a clock rollback',
)
useGameStore.getState().resetMissionProgress()

const forgedFlood = Object.fromEntries(Array.from({ length: 500 }, (_, index) => [
  `forged-${index}`,
  progress['known-a'],
]))
const catalogRecord = {
  ...progress['known-a'],
  active: false,
}
const floodNormalized = normalizeMissionProgress({
  ...forgedFlood,
  'whoami-shell': catalogRecord,
}, Date.parse('2026-07-30T13:00:00.000Z'))
assert.deepEqual(
  Object.keys(floodNormalized),
  ['whoami-shell'],
  'unknown IDs must neither survive hydration nor consume the bounded catalog capacity',
)
const oversizedCandidateMap = Object.fromEntries([
  ...Array.from({ length: 2_001 }, (_, index) => [`forged-scan-${index}`, progress['known-a']]),
  ['whoami-shell', catalogRecord],
])
assert.deepEqual(
  Object.keys(normalizeMissionProgress(oversizedCandidateMap, Date.parse('2026-07-30T13:00:00.000Z'))),
  ['whoami-shell'],
  'normalization must visit the bounded trusted catalog, not attacker-controlled key order',
)

const prototypeTallyRecord = {
  ...catalogRecord,
  completedAttempts: 100,
  completionTally: JSON.parse('{"__proto__":100}'),
}
assert.deepEqual(
  normalizeMissionProgress({ 'whoami-shell': prototypeTallyRecord }, Date.parse('2026-07-30T13:00:00.000Z')),
  {},
  'prototype-like writer IDs must fail closed without creating a non-idempotent tally',
)

const sevenValidAttempts = Array.from({ length: 7 }, (_, index) => ({
  id: `valid-${index}`,
  startedAt: `2026-07-${String(10 + index).padStart(2, '0')}T08:00:00.000Z`,
  completedAt: `2026-07-${String(10 + index).padStart(2, '0')}T08:01:00.000Z`,
  completedLocalDay: `2026-07-${String(10 + index).padStart(2, '0')}`,
  score: 90,
}))
const historyWithInvalidTail = normalizeMissionProgress({
  'whoami-shell': {
    status: 'completed',
    active: false,
    startedAt: sevenValidAttempts[0].startedAt,
    updatedAt: sevenValidAttempts.at(-1).completedAt,
    completedAt: sevenValidAttempts.at(-1).completedAt,
    bestScore: 90,
    latestScore: 90,
    completedAttempts: sevenValidAttempts.length,
    completionHistory: [...sevenValidAttempts, ...Array.from({ length: 50 }, () => null)],
  },
}, Date.parse('2026-07-30T13:00:00.000Z'))
assert.equal(
  historyWithInvalidTail['whoami-shell']?.status === 'completed'
    ? historyWithInvalidTail['whoami-shell'].completionHistory.length
    : 0,
  7,
  'invalid history tail entries must not evict valid bounded evidence',
)

assert.deepEqual(
  normalizeProgressMilestones({
    longestStreakAchieved: 0,
    currentStreak: 50_000,
    lastCompletionLocalDay: '2026-07-30',
  }, {}, Date.parse('2026-07-30T13:00:00.000Z')),
  { longestStreakAchieved: 0, currentStreak: 0, lastCompletionLocalDay: null },
  'milestones without a completed-attempt evidence chain must fail closed',
)

assert.equal(
  normalizePersistedEnvelope('x'.repeat(3 * 1024 * 1024 + 1)),
  null,
  'oversized persisted envelopes must be rejected before JSON parsing',
)

assert.equal(
  normalizePersistedEnvelope(JSON.stringify({
    version: 1,
    state: {
      missionProgress: {},
      progressMilestones: { longestStreakAchieved: 0, currentStreak: 0, lastCompletionLocalDay: null },
      progressResetAt: 0,
      progressResetSerial: 1,
    },
  })),
  null,
  'legacy numeric reset serials must not bypass the zero-epoch invariant',
)

{
  const storageLimit = 3 * 1024 * 1024
  const boundaryTally = {}
  const boundaryWriterKeys = []
  const boundaryWriterId = (index, length = 160) => {
    const prefix = `w${index.toString(36)}_`
    return prefix + 'x'.repeat(Math.max(0, length - prefix.length))
  }
  let boundaryCount = 19_050
  for (let index = 0; index < boundaryCount; index += 1) {
    const writerId = boundaryWriterId(index)
    boundaryWriterKeys.push(writerId)
    boundaryTally[writerId] = 1
  }
  const createBoundaryEnvelope = () => JSON.stringify({
    state: {
      missionProgress: {
        'whoami-shell': {
          status: 'completed',
          active: false,
          startedAt: '2026-07-29T08:00:00.000Z',
          updatedAt: '2026-07-29T08:02:00.000Z',
          completedAt: '2026-07-29T08:02:00.000Z',
          bestScore: 90,
          latestScore: 90,
          completedAttempts: boundaryCount,
          completionHistory: [{
            id: 'a',
            startedAt: '2026-07-29T08:00:00.000Z',
            completedAt: '2026-07-29T08:02:00.000Z',
            completedLocalDay: '2026-07-29',
            score: 90,
          }],
          completionTally: boundaryTally,
        },
      },
      progressMilestones: { longestStreakAchieved: 1, currentStreak: 1, lastCompletionLocalDay: '2026-07-29' },
      progressResetAt: Date.UTC(2100, 0, 1),
      progressResetSerial: Number.MAX_SAFE_INTEGER,
    },
    version: 1,
  })
  let boundaryRaw = createBoundaryEnvelope()
  while (boundaryRaw.length <= storageLimit) {
    const writerId = boundaryWriterId(boundaryCount)
    boundaryWriterKeys.push(writerId)
    boundaryTally[writerId] = 1
    boundaryCount += 1
    boundaryRaw = createBoundaryEnvelope()
  }
  let excess = boundaryRaw.length - storageLimit
  let targetIndex = boundaryWriterKeys.length - 1
  while (excess > 0) {
    const previousWriterId = boundaryWriterKeys[targetIndex]
    const prefix = `w${targetIndex.toString(36)}_`
    const reduction = Math.min(excess, previousWriterId.length - prefix.length)
    assert.ok(reduction > 0, 'boundary fixture must have enough canonical writer-ID padding')
    const nextWriterId = previousWriterId.slice(0, -reduction)
    delete boundaryTally[previousWriterId]
    boundaryTally[nextWriterId] = 1
    boundaryWriterKeys[targetIndex] = nextWriterId
    excess -= reduction
    targetIndex -= 1
  }
  boundaryRaw = createBoundaryEnvelope()
  assert.equal(boundaryRaw.length, storageLimit, 'boundary fixture must exercise the exact read limit')
  assert.equal(
    normalizePersistedEnvelope(boundaryRaw),
    null,
    'canonical migration expansion beyond the write limit must fail closed',
  )
}

useGameStore.getState().startMission('whoami-shell')
useGameStore.getState().completeMission('whoami-shell', 80)
const concurrentBaseline = structuredClone({
  missionProgress: useGameStore.getState().missionProgress,
  progressMilestones: useGameStore.getState().progressMilestones,
  progressResetAt: useGameStore.getState().progressResetAt,
  progressResetSerial: useGameStore.getState().progressResetSerial,
})
useGameStore.setState(concurrentBaseline)
useGameStore.getState().startMission('whoami-shell')
useGameStore.getState().completeMission('whoami-shell', 100)
const concurrentA = structuredClone({
  missionProgress: useGameStore.getState().missionProgress,
  progressMilestones: useGameStore.getState().progressMilestones,
  progressResetAt: useGameStore.getState().progressResetAt,
  progressResetSerial: useGameStore.getState().progressResetSerial,
})
useGameStore.setState(concurrentBaseline)
useGameStore.getState().startMission('whoami-shell')
useGameStore.getState().completeMission('whoami-shell', 70)
const concurrentB = structuredClone({
  missionProgress: useGameStore.getState().missionProgress,
  progressMilestones: useGameStore.getState().progressMilestones,
  progressResetAt: useGameStore.getState().progressResetAt,
  progressResetSerial: useGameStore.getState().progressResetSerial,
})
concurrentA.missionProgress['whoami-shell'].completionTally = { legacy: 1, 'tab:a': 1 }
concurrentB.missionProgress['whoami-shell'].completionTally = { legacy: 1, 'tab:b': 1 }
const mergedConcurrent = mergeProgressSnapshots(concurrentA, concurrentB)
const mergedReverse = mergeProgressSnapshots(concurrentB, concurrentA)
assert.deepEqual(mergedConcurrent, mergedReverse, 'cross-tab merge must be commutative')
assert.equal(mergedConcurrent.missionProgress['whoami-shell'].bestScore, 100)
assert.equal(mergedConcurrent.missionProgress['whoami-shell'].completedAttempts, 3)
assert.equal(mergedConcurrent.missionProgress['whoami-shell'].completionHistory.length, 3)

const concurrentC = structuredClone(concurrentB)
const concurrentCRecord = concurrentC.missionProgress['whoami-shell']
concurrentCRecord.completionTally = { legacy: 1, 'tab:c': 1 }
concurrentCRecord.completionHistory[1].id = 'concurrent-c'
concurrentCRecord.completionHistory[1].score = 60
concurrentCRecord.latestScore = 60
const groupedLeft = mergeProgressSnapshots(mergeProgressSnapshots(concurrentA, concurrentB), concurrentC)
const groupedRight = mergeProgressSnapshots(concurrentA, mergeProgressSnapshots(concurrentB, concurrentC))
assert.deepEqual(groupedLeft, groupedRight, 'cross-tab merge must be associative below the explicit writer cap')
assert.deepEqual(
  mergeProgressSnapshots(groupedLeft, groupedLeft),
  groupedLeft,
  'cross-tab merge must be idempotent',
)

const createConflictingAttemptSnapshot = (score) => {
  const snapshot = structuredClone(concurrentBaseline)
  const record = snapshot.missionProgress['whoami-shell']
  record.bestScore = score
  record.latestScore = score
  record.completedAttempts = 1
  record.completionTally = { 'tab:conflict': 1 }
  record.completionHistory = [{
    ...record.completionHistory[0],
    id: 'shared-attempt-id',
    score,
  }]
  return snapshot
}
const conflictingAttemptA = createConflictingAttemptSnapshot(70)
const conflictingAttemptB = createConflictingAttemptSnapshot(90)
const conflictingAttemptC = createConflictingAttemptSnapshot(80)
const directConflictRecord = structuredClone(conflictingAttemptB.missionProgress['whoami-shell'])
directConflictRecord.completionHistory.unshift(
  structuredClone(conflictingAttemptA.missionProgress['whoami-shell'].completionHistory[0]),
)
const normalizedDirectConflict = normalizeMissionProgress({ 'whoami-shell': directConflictRecord })
assert.equal(
  normalizedDirectConflict['whoami-shell']?.status === 'completed'
    ? normalizedDirectConflict['whoami-shell'].completionHistory.length
    : 0,
  1,
  'conflicting content with one logical attempt ID must not be counted as multiple attempts',
)
assert.equal(
  normalizedDirectConflict['whoami-shell']?.status === 'completed'
    ? normalizedDirectConflict['whoami-shell'].completionHistory[0]?.score
    : undefined,
  90,
  'same-ID conflicts must resolve to one deterministic canonical version',
)
const syntheticLatestRecord = structuredClone(conflictingAttemptB.missionProgress['whoami-shell'])
const syntheticBaseAttempt = syntheticLatestRecord.completionHistory[0]
syntheticLatestRecord.completedAttempts = 2
syntheticLatestRecord.completionTally = { synthetic: 2 }
syntheticLatestRecord.bestScore = 90
syntheticLatestRecord.latestScore = 90
syntheticLatestRecord.completionHistory = [
  { ...syntheticBaseAttempt, id: 'legacy:a', score: 90 },
  { ...syntheticBaseAttempt, id: 'legacy:z', score: 70 },
]
const normalizedSyntheticLatest = normalizeMissionProgress({ 'whoami-shell': syntheticLatestRecord })
const normalizedSyntheticLatestRecord = normalizedSyntheticLatest['whoami-shell']
assert.equal(normalizedSyntheticLatestRecord?.status, 'completed')
assert.equal(
  normalizedSyntheticLatestRecord?.status === 'completed'
    ? normalizedSyntheticLatestRecord.completionHistory.at(-1)?.score
    : undefined,
  90,
  'the synthesized latest attempt must remain last when legacy IDs share one completion timestamp',
)
assert.deepEqual(
  normalizeMissionProgress(normalizedSyntheticLatest),
  normalizedSyntheticLatest,
  'synthetic latest insertion must reach a canonical fixed point in one normalization pass',
)
const conflictingMerge = mergeProgressSnapshots(conflictingAttemptA, conflictingAttemptB)
assert.deepEqual(
  conflictingMerge,
  mergeProgressSnapshots(conflictingAttemptB, conflictingAttemptA),
  'same-ID conflict resolution must remain commutative',
)
const conflictingGroupedLeft = mergeProgressSnapshots(conflictingMerge, conflictingAttemptC)
const conflictingGroupedRight = mergeProgressSnapshots(
  conflictingAttemptA,
  mergeProgressSnapshots(conflictingAttemptB, conflictingAttemptC),
)
assert.deepEqual(conflictingGroupedLeft, conflictingGroupedRight, 'same-ID conflict resolution must remain associative')
assert.deepEqual(
  mergeProgressSnapshots(conflictingGroupedLeft, conflictingGroupedLeft),
  conflictingGroupedLeft,
  'same-ID conflict resolution must remain idempotent',
)
assert.deepEqual(
  normalizeMissionProgress(conflictingGroupedLeft.missionProgress),
  conflictingGroupedLeft.missionProgress,
  'a conflict merge must remain inside the persisted mission schema after re-normalization',
)
const restoreLocaleCompare = String.prototype.localeCompare
let localeIndependentConflictMerge
String.prototype.localeCompare = () => {
  throw new Error('merge ordering must not depend on the host locale')
}
try {
  localeIndependentConflictMerge = mergeProgressSnapshots(conflictingAttemptA, conflictingAttemptB)
} finally {
  String.prototype.localeCompare = restoreLocaleCompare
}
assert.deepEqual(
  localeIndependentConflictMerge,
  conflictingMerge,
  'completion ordering must be deterministic across host locales',
)

const aliasCompletedAt = '2026-07-29T08:02:00.000Z'
const aliasLocalDay = '2026-07-29'
const createAliasAttempt = (id, startedAt, score = 80) => ({
  id,
  startedAt,
  completedAt: aliasCompletedAt,
  completedLocalDay: aliasLocalDay,
  score,
})
const legacyAliasAttempt = createAliasAttempt('legacy:bounded-alias', '2026-07-29T08:00:00.000Z')
const concreteAliasAttempt = createAliasAttempt('a-concrete-alias', '2026-07-29T08:00:00.000Z')
const middleRankAttempt = createAliasAttempt('g-middle-rank', '2026-07-29T08:00:00.000Z', 70)
const higherRankAttempts = Array.from({ length: 49 }, (_, index) => createAliasAttempt(
  `m-high-rank-${String(index).padStart(2, '0')}`,
  `2026-07-29T08:00:${String(index + 1).padStart(2, '0')}.000Z`,
))
const createAliasSnapshot = (attempts, writerId, latestScore) => ({
  missionProgress: {
    'whoami-shell': {
      status: 'completed',
      active: false,
      startedAt: attempts.map(attempt => attempt.startedAt).sort()[0],
      updatedAt: aliasCompletedAt,
      completedAt: aliasCompletedAt,
      bestScore: Math.max(...attempts.map(attempt => attempt.score)),
      latestScore,
      completedAttempts: attempts.length,
      completionHistory: attempts,
      completionTally: { [writerId]: attempts.length },
    },
  },
  progressMilestones: { longestStreakAchieved: 1, currentStreak: 1, lastCompletionLocalDay: aliasLocalDay },
  progressResetAt: concurrentBaseline.progressResetAt,
  progressResetSerial: concurrentBaseline.progressResetSerial,
})
const boundedLegacySnapshot = createAliasSnapshot(
  [legacyAliasAttempt, ...higherRankAttempts],
  'bounded:legacy',
  80,
)
const boundedMiddleSnapshot = createAliasSnapshot([middleRankAttempt], 'bounded:middle', 70)
const boundedConcreteSnapshot = createAliasSnapshot([concreteAliasAttempt], 'bounded:concrete', 80)
const boundedAliasGroupedLeft = mergeProgressSnapshots(
  mergeProgressSnapshots(boundedLegacySnapshot, boundedMiddleSnapshot),
  boundedConcreteSnapshot,
)
const boundedAliasGroupedRight = mergeProgressSnapshots(
  boundedLegacySnapshot,
  mergeProgressSnapshots(boundedMiddleSnapshot, boundedConcreteSnapshot),
)
assert.deepEqual(
  boundedAliasGroupedLeft,
  boundedAliasGroupedRight,
  'legacy alias absorption must remain associative at the bounded-history cutoff',
)
const boundedAliasHistory = boundedAliasGroupedLeft.missionProgress['whoami-shell'].completionHistory
assert.equal(boundedAliasHistory.length, 50)
assert.equal(
  boundedAliasHistory.some(attempt => attempt.id === legacyAliasAttempt.id),
  true,
  'the retained legacy alias must continue suppressing concrete duplicates in later merges',
)
assert.equal(boundedAliasHistory.some(attempt => attempt.id === concreteAliasAttempt.id), false)
assert.equal(boundedAliasHistory.some(attempt => attempt.id === middleRankAttempt.id), false)

const saturatedA = structuredClone(concurrentBaseline)
const saturatedB = structuredClone(concurrentBaseline)
const saturatedC = structuredClone(concurrentBaseline)
for (const [snapshot, writerId] of [
  [saturatedA, 'saturated:a'],
  [saturatedB, 'saturated:b'],
  [saturatedC, 'saturated:c'],
]) {
  const record = snapshot.missionProgress['whoami-shell']
  record.completedAttempts = 600_000
  record.completionTally = { [writerId]: 600_000 }
}
const saturatedAB = mergeProgressSnapshots(saturatedA, saturatedB)
assert.equal(
  saturatedAB.missionProgress['whoami-shell'].completedAttempts,
  1_000_000,
  'disjoint G-Counter components must saturate the displayed attempt count instead of throwing',
)
assert.deepEqual(
  saturatedAB,
  mergeProgressSnapshots(saturatedB, saturatedA),
  'saturated completion counters must remain commutative',
)
const saturatedGroupedLeft = mergeProgressSnapshots(saturatedAB, saturatedC)
const saturatedGroupedRight = mergeProgressSnapshots(saturatedA, mergeProgressSnapshots(saturatedB, saturatedC))
assert.deepEqual(saturatedGroupedLeft, saturatedGroupedRight, 'saturated completion counters must remain associative')
assert.deepEqual(
  mergeProgressSnapshots(saturatedGroupedLeft, saturatedGroupedLeft),
  saturatedGroupedLeft,
  'saturated completion counters must remain idempotent',
)

useGameStore.setState(concurrentBaseline)
useGameStore.getState().resetMissionProgress()
const resetSnapshot = structuredClone({
  missionProgress: useGameStore.getState().missionProgress,
  progressMilestones: useGameStore.getState().progressMilestones,
  progressResetAt: useGameStore.getState().progressResetAt,
  progressResetSerial: useGameStore.getState().progressResetSerial,
})
const mergedAfterReset = mergeProgressSnapshots(resetSnapshot, concurrentB)
assert.deepEqual(mergedAfterReset.missionProgress, {}, 'a newer reset tombstone must defeat a stale tab snapshot')
assert.equal(mergedAfterReset.progressResetAt, resetSnapshot.progressResetAt)
assert.equal(mergedAfterReset.progressResetSerial, resetSnapshot.progressResetSerial)
const forgedFutureReset = structuredClone(concurrentB)
forgedFutureReset.progressResetAt = Date.UTC(3000, 0, 1)
assert.deepEqual(
  mergeProgressSnapshots(resetSnapshot, forgedFutureReset).missionProgress,
  {},
  'a far-future untrusted reset epoch must not pin storage or resurrect stale progress',
)
const frozenNow = Date.now()
const restoreDateNow = Date.now
Date.now = () => frozenNow
try {
  useGameStore.getState().resetMissionProgress()
  const firstFrozenReset = useGameStore.getState().progressResetAt
  const firstFrozenResetSerial = useGameStore.getState().progressResetSerial
  useGameStore.getState().resetMissionProgress()
  const secondFrozenReset = useGameStore.getState().progressResetAt
  const secondFrozenResetSerial = useGameStore.getState().progressResetSerial
  assert.equal(secondFrozenReset, firstFrozenReset, 'repeated resets must preserve the wall-clock epoch under a frozen clock')
  assert.equal(
    secondFrozenResetSerial,
    (BigInt(firstFrozenResetSerial) + 1n).toString(),
    'repeated resets must advance the logical serial under a frozen clock',
  )
  assert.deepEqual(
    mergeProgressSnapshots({
      missionProgress: {},
      progressMilestones: { longestStreakAchieved: 0, currentStreak: 0, lastCompletionLocalDay: null },
      progressResetAt: secondFrozenReset,
      progressResetSerial: secondFrozenResetSerial,
    }, concurrentB, frozenNow - 10 * 60 * 1_000).missionProgress,
    {},
    'a legitimate reset tombstone must survive a later wall-clock rollback',
  )
} finally {
  Date.now = restoreDateNow
}

const maximumLegacyClock = structuredClone(concurrentB)
maximumLegacyClock.progressResetAt = Date.UTC(2100, 0, 1)
maximumLegacyClock.progressResetSerial = Number.MAX_SAFE_INTEGER
const normalizedMaximumClock = JSON.parse(normalizePersistedEnvelope(JSON.stringify({
  version: 1,
  state: maximumLegacyClock,
}))).state
useGameStore.setState({
  ...normalizedMaximumClock,
  activeMissionStarts: { 'whoami-shell': new Date().toISOString() },
})
useGameStore.getState().resetMissionProgress()
const recoveredMaximumClock = structuredClone({
  missionProgress: useGameStore.getState().missionProgress,
  progressMilestones: useGameStore.getState().progressMilestones,
  progressResetAt: useGameStore.getState().progressResetAt,
  progressResetSerial: useGameStore.getState().progressResetSerial,
})
assert.equal(recoveredMaximumClock.progressResetAt, Date.UTC(2100, 0, 1))
assert.equal(recoveredMaximumClock.progressResetSerial, '9007199254740992')
assert.deepEqual(recoveredMaximumClock.missionProgress, {}, 'explicit reset must recover from the largest legacy numeric clock')
assert.deepEqual(
  mergeProgressSnapshots(recoveredMaximumClock, normalizedMaximumClock).missionProgress,
  {},
  'a recovered arbitrary-precision reset clock must defeat the stale maximum legacy snapshot',
)
useGameStore.getState().startMission('whoami-shell')
assert.equal(
  useGameStore.getState().completeMission('whoami-shell', 85),
  true,
  'a reset clock pinned at the hard epoch cap must not deny new mission progress',
)
assert.equal(useGameStore.getState().progressResetAt, Date.UTC(2100, 0, 1))
assert.equal(useGameStore.getState().progressResetSerial, '9007199254740992')
useGameStore.getState().resetMissionProgress()

const maximumTimestamp = '2100-01-01T00:00:00.000Z'
const maximumTimestampRecord = {
  status: 'completed',
  active: false,
  startedAt: '2099-12-31T23:59:00.000Z',
  updatedAt: maximumTimestamp,
  completedAt: maximumTimestamp,
  bestScore: 80,
  latestScore: 80,
  completedAttempts: 1,
  completionHistory: [{
    id: 'maximum-timestamp',
    startedAt: '2099-12-31T23:59:00.000Z',
    completedAt: maximumTimestamp,
    completedLocalDay: '2100-01-01',
    score: 80,
  }],
  completionTally: { maximum: 1 },
}
useGameStore.setState({
  missionProgress: { 'whoami-shell': maximumTimestampRecord },
  activeMissionStarts: { 'whoami-shell': new Date().toISOString() },
  progressPersistenceStatus: 'ready',
})
assert.equal(
  useGameStore.getState().completeMission('whoami-shell', 100),
  false,
  'a replay that would exceed the accepted timestamp domain must fail before mutating progress',
)
await new Promise(resolve => setTimeout(resolve, 0))
assert.deepEqual(
  useGameStore.getState().missionProgress['whoami-shell'],
  maximumTimestampRecord,
  'timestamp overflow must leave the previous completion and attempt count unchanged',
)
assert.equal(
  useGameStore.getState().progressPersistenceStatus,
  'error',
  'timestamp overflow must be surfaced instead of reporting a successful completion',
)
useGameStore.getState().resetMissionProgress()
useGameStore.setState({ progressPersistenceStatus: 'ready' })

{
  const previousWindow = globalThis.window
  const restoreLockRaceDateNow = Date.now
  const resetEpoch = Date.now()
  const storageKey = 'ghostops_progress_v1'
  const storageValues = new Map()
  const pendingLockCallbacks = []
  const createEmptyResetEnvelope = (serial) => JSON.stringify({
    state: {
      missionProgress: {},
      progressMilestones: { longestStreakAchieved: 0, currentStreak: 0, lastCompletionLocalDay: null },
      progressResetAt: resetEpoch,
      progressResetSerial: String(serial),
    },
    version: 1,
  })
  storageValues.set(storageKey, createEmptyResetEnvelope(0))
  const fakeStorage = {
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, value),
    removeItem: (key) => storageValues.delete(key),
  }
  const fakeWindow = {
    localStorage: fakeStorage,
    navigator: {
      locks: {
        request(_name, callback) {
          return new Promise((resolve, reject) => {
            pendingLockCallbacks.push(async () => {
              try {
                resolve(await callback())
              } catch (error) {
                reject(error)
              }
            })
          })
        },
      },
    },
    addEventListener() {},
    removeEventListener() {},
  }
  globalThis.window = fakeWindow
  Date.now = () => resetEpoch
  try {
    const staleStore = (await import('../src/store/gameStore.ts?validate-stale-reset-lock-a')).useGameStore
    storageValues.set(storageKey, createEmptyResetEnvelope(2))
    staleStore.getState().resetMissionProgress()
    const afterImmediateReset = JSON.parse(storageValues.get(storageKey)).state
    assert.equal(afterImmediateReset.progressResetSerial, '3', 'a stale reset must advance from the persisted clock')
    assert.deepEqual(afterImmediateReset.missionProgress, {})

    fakeWindow.navigator.locks = undefined
    const postResetStore = (await import('../src/store/gameStore.ts?validate-stale-reset-lock-b')).useGameStore
    postResetStore.getState().startMission('whoami-shell')
    assert.equal(postResetStore.getState().completeMission('whoami-shell', 70), true)
    const afterPostResetCompletion = JSON.parse(storageValues.get(storageKey)).state
    assert.equal(afterPostResetCompletion.progressResetSerial, '3')
    assert.equal(afterPostResetCompletion.missionProgress['whoami-shell'].completedAttempts, 1)

    assert.equal(pendingLockCallbacks.length, 1, 'the reset write must schedule exactly one lock retry')
    await pendingLockCallbacks[0]()
    await new Promise(resolve => setTimeout(resolve, 0))
    const afterLockRetry = JSON.parse(storageValues.get(storageKey)).state
    assert.equal(afterLockRetry.progressResetSerial, '3', 'lock retry must not bump an already-applied reset clock')
    assert.equal(
      afterLockRetry.missionProgress['whoami-shell'].completedAttempts,
      1,
      'lock retry must preserve progress created after the reset generation became visible',
    )
  } finally {
    Date.now = restoreLockRaceDateNow
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
}

{
  const previousWindow = globalThis.window
  const restoreEqualClockDateNow = Date.now
  const resetEpoch = Date.now()
  const storageKey = 'ghostops_progress_v1'
  const createEmptyResetEnvelope = (serial) => JSON.stringify({
    state: {
      missionProgress: {},
      progressMilestones: { longestStreakAchieved: 0, currentStreak: 0, lastCompletionLocalDay: null },
      progressResetAt: resetEpoch,
      progressResetSerial: String(serial),
    },
    version: 1,
  })
  const storageValues = new Map([[storageKey, createEmptyResetEnvelope(0)]])
  const storageHandlers = []
  const fakeStorage = {
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, value),
    removeItem: (key) => storageValues.delete(key),
  }
  globalThis.window = {
    localStorage: fakeStorage,
    navigator: {},
    addEventListener(type, callback) {
      if (type === 'storage') storageHandlers.push(callback)
    },
    removeEventListener() {},
  }
  Date.now = () => resetEpoch
  try {
    const staleStore = (await import('../src/store/gameStore.ts?validate-equal-reset-a')).useGameStore
    const newerStore = (await import('../src/store/gameStore.ts?validate-equal-reset-b')).useGameStore
    newerStore.getState().resetMissionProgress()
    newerStore.getState().startMission('whoami-shell')
    assert.equal(newerStore.getState().completeMission('whoami-shell', 70), true)
    const staleEventRaw = storageValues.get(storageKey)

    staleStore.getState().resetMissionProgress()
    const persistedReset = JSON.parse(storageValues.get(storageKey)).state
    assert.equal(
      persistedReset.progressResetSerial,
      '2',
      'a stale reset whose proposed clock equals persisted progress must advance to its successor',
    )
    assert.deepEqual(persistedReset.missionProgress, {})

    storageHandlers[0]({ storageArea: fakeStorage, key: storageKey, newValue: staleEventRaw })
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(staleStore.getState().progressResetSerial, '2')
    assert.deepEqual(
      staleStore.getState().missionProgress,
      {},
      'a queued equal-clock pre-reset event must not resurrect progress',
    )
  } finally {
    Date.now = restoreEqualClockDateNow
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
}

{
  const previousWindow = globalThis.window
  const restorePreEpochDateNow = Date.now
  const preEpochNow = Date.parse('2019-12-31T12:00:00.000Z')
  const storageKey = 'ghostops_progress_v1'
  const legacyState = structuredClone(concurrentBaseline)
  legacyState.progressResetAt = 0
  legacyState.progressResetSerial = '0'
  const legacyRaw = JSON.stringify({ state: legacyState, version: 1 })
  const storageValues = new Map([[storageKey, legacyRaw]])
  const storageHandlers = []
  const fakeStorage = {
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, value),
    removeItem: (key) => storageValues.delete(key),
  }
  globalThis.window = {
    localStorage: fakeStorage,
    navigator: {},
    addEventListener(type, callback) {
      if (type === 'storage') storageHandlers.push(callback)
    },
    removeEventListener() {},
  }
  Date.now = () => preEpochNow
  try {
    const preEpochStore = (await import('../src/store/gameStore.ts?validate-pre-epoch-reset')).useGameStore
    preEpochStore.getState().resetMissionProgress()
    const persistedReset = JSON.parse(storageValues.get(storageKey)).state
    assert.equal(
      persistedReset.progressResetAt,
      Date.UTC(2020, 0, 1),
      'a reset under a pre-epoch wall clock must clamp to the earliest valid persisted epoch',
    )
    assert.equal(persistedReset.progressResetSerial, '0')
    assert.deepEqual(persistedReset.missionProgress, {})

    assert.equal(storageHandlers.length, 1)
    storageHandlers[0]({ storageArea: fakeStorage, key: storageKey, newValue: legacyRaw })
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.deepEqual(
      preEpochStore.getState().missionProgress,
      {},
      'a stale zero-epoch storage event must not resurrect progress after a clamped reset',
    )
  } finally {
    Date.now = restorePreEpochDateNow
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
}

{
  const previousWindow = globalThis.window
  const storageLimit = 3 * 1024 * 1024
  const storageKey = 'ghostops_progress_v1'
  const maximumResetAt = Date.UTC(2100, 0, 1)
  const createCapacityEnvelope = (serial) => JSON.stringify({
    state: {
      missionProgress: {},
      progressMilestones: { longestStreakAchieved: 0, currentStreak: 0, lastCompletionLocalDay: null },
      progressResetAt: maximumResetAt,
      progressResetSerial: serial,
    },
    version: 1,
  })
  const capacitySerial = '9'.repeat(storageLimit - createCapacityEnvelope('').length)
  const capacityRaw = createCapacityEnvelope(capacitySerial)
  assert.equal(capacityRaw.length, storageLimit)
  assert.notEqual(normalizePersistedEnvelope(capacityRaw), null, 'the recovery fixture must be a valid canonical envelope')

  const storageValues = new Map([[storageKey, capacityRaw]])
  const fakeStorage = {
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, value),
    removeItem: (key) => storageValues.delete(key),
  }
  globalThis.window = {
    localStorage: fakeStorage,
    navigator: {},
    addEventListener() {},
    removeEventListener() {},
  }
  try {
    const capacityStore = (await import('../src/store/gameStore.ts?validate-reset-capacity-recovery')).useGameStore
    capacityStore.getState().resetMissionProgress()
    await new Promise(resolve => setTimeout(resolve, 0))
    const recovered = JSON.parse(storageValues.get(storageKey)).state
    assert.ok(storageValues.get(storageKey).length < storageLimit)
    assert.deepEqual(recovered.missionProgress, {})
    assert.equal(recovered.progressResetAt, 0)
    assert.equal(recovered.progressResetSerial, '0')
    assert.equal(capacityStore.getState().progressResetAt, 0)
    assert.equal(capacityStore.getState().progressResetSerial, '0')
    assert.equal(capacityStore.getState().progressPersistenceStatus, 'ready')
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
}

const homeSource = readFileSync(new URL('../src/pages/Home.tsx', import.meta.url), 'utf8')
const profileSource = readFileSync(new URL('../src/pages/Profile.tsx', import.meta.url), 'utf8')
const settingsSource = readFileSync(new URL('../src/pages/Settings.tsx', import.meta.url), 'utf8')
const terminalCockpitSource = readFileSync(new URL('../src/pages/TerminalCockpit.tsx', import.meta.url), 'utf8')
const commandTimelineSource = readFileSync(
  new URL('../src/components/debrief/CommandTimeline.tsx', import.meta.url),
  'utf8',
)
const statsPanelSource = readFileSync(
  new URL('../src/components/profile/StatsPanel.tsx', import.meta.url),
  'utf8',
)
const skillTreeSource = readFileSync(
  new URL('../src/components/profile/SkillTreeMini.tsx', import.meta.url),
  'utf8',
)
for (const forbidden of ['Midnight Pager Op', 'NeonMall Infiltration', "date: '2024-"]) {
  assert.equal(homeSource.includes(forbidden) || profileSource.includes(forbidden), false, `demo history leaked into UI: ${forbidden}`)
}
for (const [label, source] of [['Home', homeSource], ['Profile', profileSource]]) {
  for (const forbiddenImport of ['@/engine/levels', '@/hooks/useLocalizedData']) {
    assert.equal(
      source.includes(forbiddenImport),
      false,
      `${label} must use the validated lightweight progress catalog, not ${forbiddenImport}`,
    )
  }
  assert.equal(
    source.includes('@/data/progressCatalog'),
    true,
    `${label} must derive real progress from the lightweight progress catalog`,
  )
}
assert.equal(
  homeSource.includes('flex max-w-full flex-wrap'),
  true,
  'Home callsign row must wrap on narrow viewports',
)
assert.equal(
  homeSource.includes('break-words') && profileSource.includes('break-words'),
  true,
  'Home and Profile callsigns must break long unspaced values',
)
assert.equal(
  settingsSource.includes('sanitizeCallsignInput(e.target.value)'),
  true,
  'Settings input must use the shared Unicode callsign contract',
)
assert.equal(
  settingsSource.includes('maxLength={20}'),
  false,
  'HTML maxLength counts UTF-16 units and must not override the code-point contract',
)
assert.equal(
  terminalCockpitSource.includes('persistMissionCompletion('),
  true,
  'TerminalCockpit must use the executable progress-before-report transaction contract',
)
assert.equal(
  terminalCockpitSource.includes('disabled={!debriefAvailable}'),
  true,
  'the completion dialog must fail closed when either persistence operation fails',
)
assert.equal(
  terminalCockpitSource.includes("state.missionProgress[missionId]?.status === 'completed'"),
  true,
  'debrief access must react if another tab resets canonical mission progress after completion',
)
for (const unreachablePraiseToken of ["'praised'", 'entry.praise', 'hasPraise']) {
  assert.equal(
    commandTimelineSource.includes(unreachablePraiseToken),
    false,
    `Command timeline must not expose unreachable praise UI: ${unreachablePraiseToken}`,
  )
}
for (const [component, source] of [
  ['StatsPanel', statsPanelSource],
  ['SkillTreeMini', skillTreeSource],
]) {
  assert.equal(
    source.includes('started.current'),
    false,
    `${component} animation gates must reset when progress props change`,
  )
  assert.equal(
    source.includes('useReducedMotion'),
    true,
    `${component} animations must respect the system reduced-motion preference`,
  )
}

console.log('Progress OK: catalog-bound metrics, local streaks, achievements, activity, and demo-data guard passed.')
