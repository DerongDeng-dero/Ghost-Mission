import rawJson from '../data/all_levels.json?raw'

/* ──────────────────────────────────────────────
   Type definitions
   ────────────────────────────────────────────── */

export interface Objective {
  id: string
  label_en: string
  label_zh: string
  required: boolean
  getLabel(lang: string): string
}

export interface LevelCheck {
  type: 'file_exists' | 'file_contains' | 'file_not_contains' | 'command_used' | 'command_not_used' | 'git_clean' | 'git_branch' | 'git_commit_exists' | 'no_red_command_used' | 'string'
  pattern?: string
  objectiveId?: string
}

export interface Hint {
  level: number
  text_en: string
  text_zh: string
  getText(lang: string): string
}

export interface ScoringConfig {
  max_score: number
  objectives_weight: number
  safety_weight: number
  verification_weight: number
  efficiency_weight: number
  shortcuts_weight: number
  review_weight: number
  no_hints_bonus: number
  penalties: {
    red_command: number
    unverified_fix: number
    dirty_git: number
    kill_critical: number
    excessive_perms: number
  }
}

export interface MissionLevel {
  id: string
  title_en: string
  title_zh: string
  getTitle(lang: string): string
  chapter_id: string
  chapter_title_en: string
  chapter_title_zh: string
  chapter_skill: string
  mode: 'academy' | 'operation' | 'nightmare' | 'boss'
  difficulty: number
  risk_level: string
  estimated_time: string
  summary_en: string
  summary_zh: string
  getSummary(lang: string): string
  story: {
    briefing_en: string
    briefing_zh: string
    success_en: string
    success_zh: string
    failure_en: string
    failure_zh: string
    getBriefing(lang: string): string
    getSuccess(lang: string): string
    getFailure(lang: string): string
  }
  skills: string[]
  objectives: Objective[]
  checks: LevelCheck[]
  hints: Hint[]
  scoring: ScoringConfig
  startingState?: {
    cwd: string[]
    env?: Record<string, string>
  }
  redCommands?: string[]
  targetFile?: string
  requiredCommandPatterns?: string[]
  forbiddenCommandPatterns?: string[]
}

export interface ChapterInfo {
  id: string
  title_en: string
  title_zh: string
  skill: string
  levelCount: number
}

interface RawObjective {
  i?: string
  id?: string
  l?: string
  label_en?: string
  label?: string
  lz?: string
  label_zh?: string
  r?: boolean
  required?: boolean
}

interface RawCheck {
  t?: LevelCheck['type']
  type?: LevelCheck['type']
  p?: string
  pattern?: string
  o?: string
  objectiveId?: string
}

interface RawHint {
  l?: number
  level?: number
  t?: string
  text_en?: string
  text?: string
  tz?: string
  text_zh?: string
}

interface RawStory {
  b?: string
  briefing_en?: string
  bz?: string
  briefing_zh?: string
  s?: string
  success_en?: string
  sz?: string
  success_zh?: string
  f?: string
  failure_en?: string
  fz?: string
  failure_zh?: string
}

interface RawScoring {
  ms?: number
  max_score?: number
  ow?: number
  objectives_weight?: number
  sw?: number
  safety_weight?: number
  vw?: number
  verification_weight?: number
  ew?: number
  efficiency_weight?: number
  sh?: number
  shortcuts_weight?: number
  rw?: number
  review_weight?: number
  nh?: number
  no_hints_bonus?: number
}

interface RawLevel {
  id: string
  te?: string
  title_en?: string
  title?: string
  tz?: string
  title_zh?: string
  ci?: string
  chapter_id?: string
  cte?: string
  chapter_title_en?: string
  ctz?: string
  chapter_title_zh?: string
  cs?: string
  chapter_skill?: string
  m?: MissionLevel['mode']
  mode?: MissionLevel['mode']
  d?: number
  difficulty?: number
  rl?: string
  risk_level?: string
  et?: string
  estimated_time?: string
  se?: string
  summary_en?: string
  sz?: string
  summary_zh?: string
  sk?: string[]
  skills?: string[]
  st?: RawStory
  story?: RawStory
  o?: RawObjective[]
  objectives?: RawObjective[]
  c?: RawCheck[]
  checks?: RawCheck[]
  h?: RawHint[]
  hints?: RawHint[]
  sc?: RawScoring
  scoring?: RawScoring
  startingState?: MissionLevel['startingState']
  redCommands?: string[]
}

/* ──────────────────────────────────────────────
   Helper: resolve localized string
   ────────────────────────────────────────────── */

function resolve(en: string, zh: string, lang: string): string {
  return lang === 'zh' ? zh : en
}

/* ──────────────────────────────────────────────
   Build LEVELS map from imported JSON
   ────────────────────────────────────────────── */

function buildLevels(data: RawLevel[]): Record<string, MissionLevel> {
  const map: Record<string, MissionLevel> = {}

  for (const raw of data) {
    // Support both compressed (te/tz) and full (title_en/title_zh) keys
    const title_en = raw.te ?? raw.title_en ?? raw.title ?? raw.id
    const title_zh = raw.tz ?? raw.title_zh ?? title_en
    const chapter_id = raw.ci ?? raw.chapter_id ?? 'unknown'
    const chapter_title_en = raw.cte ?? raw.chapter_title_en ?? 'Unknown'
    const chapter_title_zh = raw.ctz ?? raw.chapter_title_zh ?? 'Unknown'
    const chapter_skill = raw.cs ?? raw.chapter_skill ?? ''
    const mode = raw.m ?? raw.mode ?? 'academy'
    const difficulty = raw.d ?? raw.difficulty ?? 1
    const risk_level = raw.rl ?? raw.risk_level ?? 'green'
    const estimated_time = raw.et ?? raw.estimated_time ?? ''
    const summary_en = raw.se ?? raw.summary_en ?? ''
    const summary_zh = raw.sz ?? raw.summary_zh ?? ''
    const skills = raw.sk ?? raw.skills ?? []

    const rs = raw.st ?? raw.story ?? {}
    const briefing_en = rs.b ?? rs.briefing_en ?? ''
    const briefing_zh = rs.bz ?? rs.briefing_zh ?? ''
    const success_en = rs.s ?? rs.success_en ?? ''
    const success_zh = rs.sz ?? rs.success_zh ?? ''
    const failure_en = rs.f ?? rs.failure_en ?? ''
    const failure_zh = rs.fz ?? rs.failure_zh ?? ''

    const objectives: Objective[] = (raw.o ?? raw.objectives ?? []).map(o => ({
      id: o.i ?? o.id ?? 'obj',
      label_en: o.l ?? o.label_en ?? o.label ?? '',
      label_zh: o.lz ?? o.label_zh ?? '',
      required: o.r ?? o.required ?? true,
      getLabel(lang: string) { return resolve(this.label_en, this.label_zh, lang) },
    }))

    const checks: LevelCheck[] = (raw.c ?? raw.checks ?? []).map(c => ({
      type: c.t ?? c.type ?? 'command_used',
      pattern: c.p ?? c.pattern ?? '',
      objectiveId: c.o ?? c.objectiveId ?? undefined,
    }))

    const hints: Hint[] = (raw.h ?? raw.hints ?? []).map(h => ({
      level: h.l ?? h.level ?? 1,
      text_en: h.t ?? h.text_en ?? h.text ?? '',
      text_zh: h.tz ?? h.text_zh ?? '',
      getText(lang: string) { return resolve(this.text_en, this.text_zh, lang) },
    }))

    const rsc = raw.sc ?? raw.scoring ?? {}
    const scoring: ScoringConfig = {
      max_score: rsc.ms ?? rsc.max_score ?? 100,
      objectives_weight: rsc.ow ?? rsc.objectives_weight ?? 40,
      safety_weight: rsc.sw ?? rsc.safety_weight ?? 20,
      verification_weight: rsc.vw ?? rsc.verification_weight ?? 15,
      efficiency_weight: rsc.ew ?? rsc.efficiency_weight ?? 10,
      shortcuts_weight: rsc.sh ?? rsc.shortcuts_weight ?? 5,
      review_weight: rsc.rw ?? rsc.review_weight ?? 5,
      no_hints_bonus: rsc.nh ?? rsc.no_hints_bonus ?? 5,
      penalties: { red_command: -20, unverified_fix: -15, dirty_git: -10, kill_critical: -30, excessive_perms: -20 },
    }

    const level: MissionLevel = {
      id: raw.id, title_en, title_zh,
      getTitle(lang: string) { return resolve(this.title_en, this.title_zh, lang) },
      chapter_id, chapter_title_en, chapter_title_zh, chapter_skill,
      mode, difficulty, risk_level, estimated_time,
      summary_en, summary_zh,
      getSummary(lang: string) { return resolve(this.summary_en, this.summary_zh, lang) },
      story: { briefing_en, briefing_zh, success_en, success_zh, failure_en, failure_zh,
        getBriefing(lang: string) { return resolve(this.briefing_en, this.briefing_zh, lang) },
        getSuccess(lang: string) { return resolve(this.success_en, this.success_zh, lang) },
        getFailure(lang: string) { return resolve(this.failure_en, this.failure_zh, lang) },
      },
      skills, objectives, checks, hints, scoring,
      startingState: raw.startingState ?? { cwd: ['home', 'ghost'] },
      redCommands: raw.redCommands ?? [],
    }

    map[level.id] = level
  }

  return map
}

/* ──────────────────────────────────────────────
   Exports
   ────────────────────────────────────────────── */

const levelsData = JSON.parse(rawJson) as RawLevel[]
export const LEVELS: Record<string, MissionLevel> = buildLevels(levelsData)

export const ALL_LEVELS: MissionLevel[] = Object.values(LEVELS)

export function getLevelById(id: string): MissionLevel | undefined {
  return LEVELS[id]
}

export function getLevelsByChapter(chapterId: string): MissionLevel[] {
  return ALL_LEVELS.filter(l => l.chapter_id === chapterId)
}

export function getAllChapters(): ChapterInfo[] {
  const map = new Map<string, ChapterInfo>()

  for (const level of ALL_LEVELS) {
    if (!map.has(level.chapter_id)) {
      map.set(level.chapter_id, {
        id: level.chapter_id,
        title_en: level.chapter_title_en,
        title_zh: level.chapter_title_zh,
        skill: level.chapter_skill,
        levelCount: 0,
      })
    }
    map.get(level.chapter_id)!.levelCount++
  }

  return Array.from(map.values())
}

export function getLocalizedTitle(level: MissionLevel, lang: string): string {
  return level.getTitle(lang)
}

export function getLocalizedBriefing(level: MissionLevel, lang: string): string {
  return level.story.getBriefing(lang)
}

export function getLocalizedSuccess(level: MissionLevel, lang: string): string {
  return level.story.getSuccess(lang)
}

export function getLocalizedFailure(level: MissionLevel, lang: string): string {
  return level.story.getFailure(lang)
}

export function getLocalizedObjectiveLabel(obj: Objective, lang: string): string {
  return obj.getLabel(lang)
}

export function getLocalizedHintText(hint: Hint, lang: string): string {
  return hint.getText(lang)
}
