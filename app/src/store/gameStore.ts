import { create } from 'zustand'

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
  setMissionsCompleted: (count: number) => void
  setCommandsLearned: (count: number) => void
  setCurrentStreak: (days: number) => void

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

export const useGameStore = create<GameState>((set) => ({
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
  setMissionsCompleted: (count) => set({ missionsCompleted: count }),
  setCommandsLearned: (count) => set({ commandsLearned: count }),
  setCurrentStreak: (days) => set({ currentStreak: days }),

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
  chapters: [
    { id: 1, title: '系统启动', status: 'current' },
    { id: 2, title: '文件系统基础', status: 'upcoming' },
    { id: 3, title: '文件操作', status: 'upcoming' },
    { id: 4, title: '分页器', status: 'upcoming' },
    { id: 5, title: 'Vim神庙', status: 'upcoming' },
    { id: 6, title: 'Git迷宫', status: 'upcoming' },
    { id: 7, title: '进程追踪', status: 'upcoming' },
    { id: 8, title: '暗影网络', status: 'upcoming' },
    { id: 9, title: 'Docker港湾', status: 'upcoming' },
    { id: 10, title: 'Shell精通', status: 'upcoming' },
    { id: 11, title: '监控器', status: 'upcoming' },
    { id: 12, title: '红区', status: 'upcoming' },
    { id: 13, title: '777博士', status: 'upcoming' },
    { id: 14, title: '逃脱', status: 'upcoming' },
    { id: 15, title: '幽灵协议', status: 'upcoming' },
    { id: 16, title: '终极终端', status: 'upcoming' },
    { id: 17, title: '多路复用器', status: 'upcoming' },
  ],
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
}))
