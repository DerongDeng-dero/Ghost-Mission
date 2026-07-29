import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type Theme = 'dark' | 'high-contrast' | 'warm'
export type Rank = 'recruit' | 'operator' | 'ghost'

export interface Skill {
  name: string
  domain: string
  score: number
  color: string
}

export interface Activity {
  id: string
  description: string
  type: 'complete' | 'in-progress' | 'failed' | 'learning' | 'achievement'
  timestamp: string
}

export interface Mission {
  id: string
  title: string
  type: string
  difficulty: number
  estimatedTime: string
  skills: string[]
  risk: string
  progress?: number
  cta: string
  borderColor?: string
}

export interface Chapter {
  id: number
  title: string
  status: 'completed' | 'current' | 'upcoming'
}

interface MissionProgressBase {
  startedAt: string
  updatedAt: string
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
    }
)

export type MissionProgressMap = Record<string, MissionProgressRecord>

const MISSION_PROGRESS_STORAGE_KEY = 'ghostops_progress_v1'
const MISSION_PROGRESS_VERSION = 1
const MAX_PROGRESS_ENTRIES = 500
const MAX_COMPLETED_ATTEMPTS = 1_000_000
const EARLIEST_PROGRESS_TIMESTAMP = Date.UTC(2020, 0, 1)
const FUTURE_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000
const MISSION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeTimestamp(value: unknown, now = Date.now()): string | null {
  if (typeof value !== 'string') return null
  const timestamp = Date.parse(value)
  if (
    !Number.isFinite(timestamp) ||
    timestamp < EARLIEST_PROGRESS_TIMESTAMP ||
    timestamp > now + FUTURE_TIMESTAMP_TOLERANCE_MS
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

/**
 * Treat browser storage as untrusted input. Invalid records are discarded
 * independently so one corrupted mission cannot erase otherwise valid work.
 */
export function normalizeMissionProgress(value: unknown, now = Date.now()): MissionProgressMap {
  if (!isRecord(value)) return {}

  const normalized: MissionProgressMap = {}
  for (const [missionId, candidate] of Object.entries(value)) {
    if (Object.keys(normalized).length >= MAX_PROGRESS_ENTRIES) break
    if (!MISSION_ID_PATTERN.test(missionId) || !isRecord(candidate)) continue

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
      if (!active || completedAttempts !== 0) continue
      normalized[missionId] = {
        status,
        active,
        startedAt,
        updatedAt,
        completedAttempts: 0,
      }
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
      bestScore < latestScore
    ) {
      continue
    }

    normalized[missionId] = {
      status,
      active,
      startedAt,
      updatedAt,
      completedAt,
      bestScore,
      latestScore,
      completedAttempts,
    }
  }

  return normalized
}

function countCompletedMissions(progress: MissionProgressMap): number {
  return Object.values(progress).filter(record => record.status === 'completed').length
}

function normalizePersistedEnvelope(raw: string): string | null {
  try {
    const envelope: unknown = JSON.parse(raw)
    if (!isRecord(envelope) || envelope.version !== MISSION_PROGRESS_VERSION || !isRecord(envelope.state)) {
      return null
    }
    const missionProgress = normalizeMissionProgress(envelope.state.missionProgress)
    return JSON.stringify({
      state: { missionProgress },
      version: MISSION_PROGRESS_VERSION,
    })
  } catch {
    return null
  }
}

const safeProgressStorage = {
  getItem(name: string): string | null {
    if (typeof window === 'undefined') return null
    try {
      const raw = window.localStorage.getItem(name)
      return raw === null ? null : normalizePersistedEnvelope(raw)
    } catch {
      return null
    }
  },
  setItem(name: string, value: string): void {
    if (typeof window === 'undefined') return
    try {
      const normalized = normalizePersistedEnvelope(value)
      if (normalized === null) {
        window.localStorage.removeItem(name)
        return
      }
      window.localStorage.setItem(name, normalized)
    } catch {
      // Storage denial or quota exhaustion must not break a training session.
    }
  },
  removeItem(name: string): void {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.removeItem(name)
    } catch {
      // Treat unavailable storage as an empty persistence layer.
    }
  },
}

export interface GameState {
  // Theme
  theme: Theme
  setTheme: (theme: Theme) => void

  // Player
  callsign: string
  rank: Rank
  setCallsign: (callsign: string) => void
  setRank: (rank: Rank) => void

  // Stats
  missionsCompleted: number
  commandsLearned: number
  currentStreak: number
  setCommandsLearned: (count: number) => void
  setCurrentStreak: (days: number) => void

  // Mission progress
  missionProgress: MissionProgressMap
  startMission: (missionId: string) => void
  completeMission: (missionId: string, score: number) => void
  resetMissionProgress: () => void

  // Skills
  skills: Skill[]
  setSkills: (skills: Skill[]) => void

  // Activity
  activities: Activity[]
  setActivities: (activities: Activity[]) => void
  addActivity: (activity: Activity) => void

  // Story
  currentChapter: number
  chapters: Chapter[]
  setCurrentChapter: (chapter: number) => void
  setChapters: (chapters: Chapter[]) => void

  // Connection
  connectionStatus: 'connected' | 'connecting' | 'disconnected'
  setConnectionStatus: (status: 'connected' | 'connecting' | 'disconnected') => void

  // Daily Incident
  dailyIncident: {
    title: string
    description: string
    estimatedTime: string
    difficulty: string
    skills: string[]
  } | null
  setDailyIncident: (incident: GameState['dailyIncident']) => void
}

export const useGameStore = create<GameState>()(persist((set) => ({
  // Theme
  theme: 'dark',
  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? '' : theme)
    set({ theme })
  },

  // Player
  callsign: 'Ghost-7',
  rank: 'recruit',
  setCallsign: (callsign) => set({ callsign }),
  setRank: (rank) => set({ rank }),

  // Stats
  missionsCompleted: 0,
  commandsLearned: 0,
  currentStreak: 0,
  setCommandsLearned: (count) => set({ commandsLearned: count }),
  setCurrentStreak: (days) => set({ currentStreak: days }),

  // Mission progress
  missionProgress: {},
  startMission: (missionId) => set((state) => {
    if (!MISSION_ID_PATTERN.test(missionId)) return state
    const now = new Date().toISOString()
    const previous = state.missionProgress[missionId]
    const nextRecord: MissionProgressRecord = previous?.status === 'completed'
      ? {
          ...previous,
          active: false,
          startedAt: now,
          updatedAt: now,
        }
      : {
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
      missionsCompleted: countCompletedMissions(missionProgress),
    }
  }),
  completeMission: (missionId, score) => set((state) => {
    const normalizedScore = normalizeScore(score)
    if (!MISSION_ID_PATTERN.test(missionId) || normalizedScore === null) return state

    const now = new Date().toISOString()
    const previous = state.missionProgress[missionId]
    const previousBest = previous?.status === 'completed' ? previous.bestScore : undefined
    const completedAttempts = Math.min(
      MAX_COMPLETED_ATTEMPTS,
      (previous?.status === 'completed' ? previous.completedAttempts : 0) + 1,
    )
    const nextRecord: MissionProgressRecord = {
      status: 'completed',
      active: false,
      startedAt: previous?.startedAt ?? now,
      updatedAt: now,
      completedAt: now,
      bestScore: previousBest === undefined ? normalizedScore : Math.max(previousBest, normalizedScore),
      latestScore: normalizedScore,
      completedAttempts,
    }
    const missionProgress = {
      ...state.missionProgress,
      [missionId]: nextRecord,
    }
    return {
      missionProgress,
      missionsCompleted: countCompletedMissions(missionProgress),
    }
  }),
  resetMissionProgress: () => set({
    missionProgress: {},
    missionsCompleted: 0,
  }),

  // Skills
  skills: [
    { name: 'Filesystem', domain: 'filesystem', score: 0, color: '#00FF88' },
    { name: 'Git', domain: 'git', score: 0, color: '#FF6B35' },
    { name: 'Vim', domain: 'vim', score: 0, color: '#C77DFF' },
    { name: 'Network', domain: 'network', score: 0, color: '#00E5FF' },
    { name: 'Process', domain: 'process', score: 0, color: '#FFD166' },
    { name: 'Shell', domain: 'shell', score: 0, color: '#E8EDF2' },
  ],
  setSkills: (skills) => set({ skills }),

  // Activity
  activities: [],
  setActivities: (activities) => set({ activities }),
  addActivity: (activity) => set((state) => ({ activities: [activity, ...state.activities] })),

  // Story
  currentChapter: 1,
  chapters: Array.from({ length: 17 }, (_, index) => ({
    id: index + 1,
    title: `Ch${String(index + 1).padStart(2, '0')}`,
    status: index === 0 ? 'current' as const : 'upcoming' as const,
  })),
  setCurrentChapter: (chapter) => set({ currentChapter: chapter }),
  setChapters: (chapters) => set({ chapters }),

  // Connection
  connectionStatus: 'connected',
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  // Daily Incident
  dailyIncident: {
    title: '服务端口 3000 被占用',
    description: '一个幽灵进程占用了端口3000。找到并终止它。',
    estimatedTime: '约15分钟',
    difficulty: '中等',
    skills: ['Network', 'Process'],
  },
  setDailyIncident: (incident) => set({ dailyIncident: incident }),
}), {
  name: MISSION_PROGRESS_STORAGE_KEY,
  version: MISSION_PROGRESS_VERSION,
  storage: createJSONStorage(() => safeProgressStorage),
  partialize: (state) => ({ missionProgress: state.missionProgress }),
  merge: (persistedState, currentState) => {
    const missionProgress = normalizeMissionProgress(
      isRecord(persistedState) ? persistedState.missionProgress : undefined,
    )
    return {
      ...currentState,
      missionProgress,
      missionsCompleted: countCompletedMissions(missionProgress),
    }
  },
}))
