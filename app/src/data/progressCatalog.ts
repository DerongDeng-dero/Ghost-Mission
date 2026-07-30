import compactCatalog from './progress_catalog.json'
import type { MissionProgressMap } from '@/store/gameStore'
import type { ProgressLevelLike } from '@/lib/progressMetrics'

type ProgressMissionMode = 'academy' | 'operation' | 'nightmare' | 'red-zone'
type ProgressMissionStatus = 'available' | 'in-progress' | 'completed'

interface CompactProgressLevel {
  i: string
  te: string
  tz: string
  c: string
  cte: string
  ctz: string
  cs: string
  m: 'academy' | 'operation' | 'nightmare' | 'boss'
  d: number
  et: string
  s: string[]
  r: string
  a: string[]
}

export interface ProgressCatalogLevel extends ProgressLevelLike {
  titleEn: string
  titleZh: string
  chapterId: string
  chapterTitleEn: string
  chapterTitleZh: string
  chapterSkill: string
  mode: CompactProgressLevel['m']
  difficulty: number
  estimatedTime: string
  skills: string[]
  riskLevel: string
}

export interface ProgressMission {
  id: string
  title: string
  mode: ProgressMissionMode
  difficulty: number
  estimatedTime: string
  skills: string[]
  riskLevel: number
  status: ProgressMissionStatus
}

export interface ProgressChapter {
  id: number
  title: string
  description: string
  domainColor: string
  totalDrills: number
  completedDrills: number
  drills: Array<{
    id: string
    skills: string[]
    status: ProgressMissionStatus
  }>
}

const riskLevelNumbers: Record<string, number> = {
  green: 1,
  blue: 2,
  yellow: 3,
  red: 4,
  purple: 5,
  black: 6,
}

const chapterColors = [
  '#E8EDF2', '#00FF88', '#00FF88', '#FF4757', '#00E5FF', '#E8EDF2',
  '#00E5FF', '#C77DFF', '#FFD166', '#4488FF', '#00FF88', '#00E5FF',
  '#FFD166', '#FF6B35', '#C77DFF', '#FF6B35', '#2A9D8F',
]

function mapMode(mode: CompactProgressLevel['m']): ProgressMissionMode {
  if (mode === 'boss') return 'red-zone'
  if (mode === 'nightmare') return 'nightmare'
  if (mode === 'operation') return 'operation'
  return 'academy'
}

function getStatus(
  missionId: string,
  progress: MissionProgressMap,
): ProgressMissionStatus {
  const record = progress[missionId]
  if (record?.status === 'completed') return 'completed'
  if (record?.active) return 'in-progress'
  return 'available'
}

export const PROGRESS_CATALOG: ProgressCatalogLevel[] = (
  compactCatalog as CompactProgressLevel[]
).map((level) => ({
  id: level.i,
  titleEn: level.te,
  titleZh: level.tz,
  chapterId: level.c,
  chapterTitleEn: level.cte,
  chapterTitleZh: level.ctz,
  chapterSkill: level.cs,
  mode: level.m,
  difficulty: level.d,
  estimatedTime: level.et,
  skills: level.s,
  riskLevel: level.r,
  checks: level.a.map((pattern) => ({ type: 'command_used', pattern })),
}))

export function buildProgressMissions(
  language: string,
  progress: MissionProgressMap,
): ProgressMission[] {
  const isZh = language.startsWith('zh')
  return PROGRESS_CATALOG.map((level) => ({
    id: level.id,
    title: isZh ? level.titleZh : level.titleEn,
    mode: mapMode(level.mode),
    difficulty: Math.max(1, Math.min(5, level.difficulty)),
    estimatedTime: level.estimatedTime,
    skills: level.skills,
    riskLevel: riskLevelNumbers[level.riskLevel.trim().toLowerCase()] ?? 0,
    status: getStatus(level.id, progress),
  }))
}

export function buildProgressChapters(
  language: string,
  progress: MissionProgressMap,
): ProgressChapter[] {
  const isZh = language.startsWith('zh')
  const levelsByChapter = new Map<string, ProgressCatalogLevel[]>()
  for (const level of PROGRESS_CATALOG) {
    const members = levelsByChapter.get(level.chapterId) ?? []
    members.push(level)
    levelsByChapter.set(level.chapterId, members)
  }

  return [...levelsByChapter.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([chapterId, levels], index) => {
      const chapterNumber = Number(chapterId.replace(/\D/g, '')) || index + 1
      const title = isZh ? levels[0].chapterTitleZh : levels[0].chapterTitleEn
      const featuredSkills = [...new Set(levels.flatMap((level) => level.skills))].slice(0, 6)
      const drills = levels.map((level) => ({
        id: level.id,
        skills: level.skills,
        status: getStatus(level.id, progress),
      }))
      return {
        id: chapterNumber,
        title,
        description: isZh
          ? `${levels.length} 个“${title}”训练任务，覆盖 ${featuredSkills.join('、')} 等技能。`
          : `${levels.length} ${title} missions covering ${featuredSkills.join(', ')} and related skills.`,
        domainColor: chapterColors[chapterNumber - 1] ?? '#8B9EB0',
        totalDrills: drills.length,
        completedDrills: drills.filter((drill) => drill.status === 'completed').length,
        drills,
      }
    })
}
