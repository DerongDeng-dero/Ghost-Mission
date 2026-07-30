export interface ProgressRecordLike {
  status: 'in-progress' | 'completed'
  startedAt: string
  updatedAt: string
  completedAt?: string
  bestScore?: number
  latestScore?: number
  completedAttempts: number
  completionHistory?: Array<{
    startedAt: string
    completedAt: string
    completedLocalDay?: string
    score: number
  }>
}

export type ProgressMapLike = Record<string, ProgressRecordLike>

export interface ProgressLevelLike {
  id: string
  checks: Array<{ type: string; pattern?: string }>
}

export interface ProgressMetrics {
  missionsCompleted: number
  validatedActions: number
  currentStreak: number
  longestStreak: number
  firstStartedAt: string | null
  hasPerfectScore: boolean
}

export interface ProgressMilestonesLike {
  longestStreakAchieved: number
  currentStreak?: number
  lastCompletionLocalDay?: string | null
}

function localDayKey(value: string | number | Date): string | null {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function shiftLocalDay(dayKey: string, offset: number): string {
  const date = new Date(`${dayKey}T12:00:00`)
  date.setDate(date.getDate() + offset)
  return localDayKey(date) ?? dayKey
}

function knownCompletedRecords(
  levels: ProgressLevelLike[],
  progress: ProgressMapLike,
): Array<{ level: ProgressLevelLike; record: ProgressRecordLike }> {
  return levels.flatMap((level) => {
    const record = progress[level.id]
    return record?.status === 'completed' ? [{ level, record }] : []
  })
}

function completionEvents(record: ProgressRecordLike): Array<{
  completedAt: string
  completedLocalDay?: string
  score: number
}> {
  if (record.status !== 'completed' || !record.completedAt) return []
  const storedEvents = Array.isArray(record.completionHistory)
    ? record.completionHistory.flatMap((attempt) => (
      typeof attempt.completedAt === 'string' && Number.isFinite(Date.parse(attempt.completedAt))
        ? [{
          completedAt: attempt.completedAt,
          completedLocalDay: attempt.completedLocalDay,
          score: attempt.score,
        }]
        : []
    ))
    : []
  return storedEvents.length > 0
    ? storedEvents
    : [{ completedAt: record.completedAt, score: record.latestScore ?? record.bestScore ?? 0 }]
}

function completionDaySet(
  levels: ProgressLevelLike[],
  progress: ProgressMapLike,
): Set<string> {
  const completionDays = new Set<string>()
  for (const { record } of knownCompletedRecords(levels, progress)) {
    for (const event of completionEvents(record)) {
      const day = event.completedLocalDay ?? localDayKey(event.completedAt)
      if (day !== null) completionDays.add(day)
    }
  }
  return completionDays
}

export function deriveCurrentStreak(
  levels: ProgressLevelLike[],
  progress: ProgressMapLike,
  now: string | number | Date = Date.now(),
): number {
  const completionDays = completionDaySet(levels, progress)

  if (completionDays.size === 0) return 0
  const today = localDayKey(now)
  if (today === null) return 0
  const latest = [...completionDays].sort().at(-1)
  if (!latest || (latest !== today && latest !== shiftLocalDay(today, -1))) return 0

  let streak = 0
  for (let day = latest; completionDays.has(day); day = shiftLocalDay(day, -1)) streak += 1
  return streak
}

export function deriveLongestStreak(
  levels: ProgressLevelLike[],
  progress: ProgressMapLike,
): number {
  const orderedDays = [...completionDaySet(levels, progress)].sort()
  let longest = 0
  let current = 0
  let previous: string | null = null
  for (const day of orderedDays) {
    current = previous !== null && shiftLocalDay(previous, 1) === day ? current + 1 : 1
    longest = Math.max(longest, current)
    previous = day
  }
  return longest
}

export function deriveProgressMetrics(
  levels: ProgressLevelLike[],
  progress: ProgressMapLike,
  now: string | number | Date = Date.now(),
  milestones?: ProgressMilestonesLike,
): ProgressMetrics {
  const completed = knownCompletedRecords(levels, progress)
  const validatedActions = new Set<string>()
  let firstStartedAt: string | null = null
  let firstStartedTime = Number.POSITIVE_INFINITY

  for (const level of levels) {
    const record = progress[level.id]
    if (record) {
      const startedTime = Date.parse(record.startedAt)
      if (Number.isFinite(startedTime) && startedTime < firstStartedTime) {
        firstStartedAt = new Date(startedTime).toISOString()
        firstStartedTime = startedTime
      }
    }
  }

  for (const { level } of completed) {
    for (const check of level.checks) {
      if (check.type !== 'command_used') continue
      const normalized = check.pattern?.trim().replace(/\s+/g, ' ').toLocaleLowerCase() ?? ''
      if (normalized) validatedActions.add(normalized)
    }
  }

  const today = localDayKey(now)
  const milestoneCurrentStreak = today !== null
    && milestones?.lastCompletionLocalDay
    && (
      milestones.lastCompletionLocalDay === today
      || milestones.lastCompletionLocalDay === shiftLocalDay(today, -1)
    )
    && Number.isInteger(milestones.currentStreak)
    ? Math.max(0, milestones.currentStreak ?? 0)
    : 0

  return {
    missionsCompleted: completed.length,
    validatedActions: validatedActions.size,
    currentStreak: Math.max(
      deriveCurrentStreak(levels, progress, now),
      milestoneCurrentStreak,
    ),
    longestStreak: Math.max(
      deriveLongestStreak(levels, progress),
      Number.isInteger(milestones?.longestStreakAchieved)
        ? Math.max(0, milestones?.longestStreakAchieved ?? 0)
        : 0,
    ),
    firstStartedAt,
    hasPerfectScore: completed.some(({ record }) => record.bestScore === 100),
  }
}

export interface ActivityDay {
  date: string
  count: number
}

export function deriveMissionActivity(
  levels: ProgressLevelLike[],
  progress: ProgressMapLike,
  now: string | number | Date = Date.now(),
  days = 365,
): ActivityDay[] {
  const safeDays = Math.max(1, Math.min(Math.trunc(days), 3660))
  const today = localDayKey(now)
  if (today === null) return []

  const counts = new Map<string, number>()
  for (const { record } of knownCompletedRecords(levels, progress)) {
    for (const event of completionEvents(record)) {
      const day = event.completedLocalDay ?? localDayKey(event.completedAt)
      if (day === null) continue
      counts.set(day, (counts.get(day) ?? 0) + 1)
    }
  }

  return Array.from({ length: safeDays }, (_, index) => {
    const day = shiftLocalDay(today, -(safeDays - index - 1))
    return {
      date: day,
      count: counts.get(day) ?? 0,
    }
  })
}

export interface ChapterProgressLike {
  id: number
  completedDrills: number
  totalDrills: number
}

export interface SkillGroupMetric {
  domain: 'filesystem' | 'shell' | 'process' | 'network' | 'runtime' | 'git'
  score: number
  color: string
  completed: number
  total: number
}

const SKILL_GROUPS = [
  { domain: 'filesystem', color: '#00FF88', chapters: [2, 3, 4, 10, 11] },
  { domain: 'shell', color: '#E8EDF2', chapters: [1, 5, 6, 7, 8] },
  { domain: 'process', color: '#FFD166', chapters: [9, 13] },
  { domain: 'network', color: '#00E5FF', chapters: [12, 17] },
  { domain: 'runtime', color: '#C77DFF', chapters: [14, 15] },
  { domain: 'git', color: '#FF6B35', chapters: [16] },
] as const

export function deriveSkillGroups(chapters: ChapterProgressLike[]): SkillGroupMetric[] {
  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]))
  return SKILL_GROUPS.map((group) => {
    const members = group.chapters.flatMap((id) => {
      const chapter = chapterById.get(id)
      return chapter ? [chapter] : []
    })
    const completed = members.reduce((total, chapter) => total + chapter.completedDrills, 0)
    const total = members.reduce((sum, chapter) => sum + chapter.totalDrills, 0)
    return {
      domain: group.domain,
      color: group.color,
      completed,
      total,
      score: total === 0 ? 0 : Math.round((completed / total) * 100),
    }
  })
}
