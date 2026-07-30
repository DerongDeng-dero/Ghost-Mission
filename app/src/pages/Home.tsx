import { useEffect, useMemo, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import {
  Terminal, Target, BookOpen, Search, User, Settings,
  Trophy, Clock, Calendar, ChevronRight, Crosshair,
  Activity, Star, Lock, TrendingUp
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '@/store/gameStore'
import {
  PROGRESS_CATALOG,
  buildProgressChapters,
  buildProgressMissions,
} from '@/data/progressCatalog'
import { deriveProgressMetrics, deriveSkillGroups } from '@/lib/progressMetrics'
import type { SkillGroupMetric } from '@/lib/progressMetrics'
import {
  calculateTotalXP,
  deriveProgressRank,
  resolveAchievements,
} from '@/data/achievements'
import { publicAssetUrl } from '@/lib/publicAsset'
import { useCurrentLocalDay } from '@/hooks/useCurrentLocalDay'
import { segmentTextForTypewriter } from '@/lib/textSegmentation'

type LocalizedSkillGroupMetric = SkillGroupMetric & { name: string }

interface StoryChapter {
  id: number
  title: string
  status: 'completed' | 'current' | 'upcoming'
}

interface RecentActivity {
  id: string
  description: string
  type: 'complete' | 'in-progress'
  timestamp: string
  sortTime: number
}

/* ------------------------------------------------------------------ */
/*  useTypewriter hook                                                  */
/* ------------------------------------------------------------------ */
function useTypewriter(text: string, speed = 40, delay = 300, reduceMotion = false) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    let i = 0
    let interval: ReturnType<typeof setInterval> | undefined
    let doneTimer: ReturnType<typeof setTimeout> | undefined
    const segments = segmentTextForTypewriter(text)
    const timer = setTimeout(() => {
      if (reduceMotion) {
        setDisplayed(text)
        setDone(true)
        return
      }
      setDisplayed('')
      setDone(false)
      interval = setInterval(() => {
        i++
        setDisplayed(segments.slice(0, i).join(''))
        if (i >= segments.length) {
          clearInterval(interval)
          doneTimer = setTimeout(() => setDone(true), 500)
        }
      }, speed)
    }, reduceMotion ? 0 : delay)
    return () => {
      clearTimeout(timer)
      if (interval) clearInterval(interval)
      if (doneTimer) clearTimeout(doneTimer)
    }
  }, [text, speed, delay, reduceMotion])

  return { displayed, done }
}

/* ------------------------------------------------------------------ */
/*  Easing constants                                                    */
/* ------------------------------------------------------------------ */
const easeOutExpo = [0.16, 1, 0.3, 1] as [number, number, number, number]
const easeBounce = [0.34, 1.56, 0.64, 1] as [number, number, number, number]

/* ------------------------------------------------------------------ */
/*  Skill Radar Chart (SVG)                                             */
/* ------------------------------------------------------------------ */
function SkillRadar({ skills }: { skills: LocalizedSkillGroupMetric[] }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.3 })
  const size = 320
  const center = size / 2
  const maxRadius = 120
  const levels = 4

  if (skills.length === 0) {
    return <p className="font-inter text-body text-[#8B9EB0]">{t('home.noSkillData')}</p>
  }

  const angleFor = (i: number) => (Math.PI * 2 * i) / skills.length - Math.PI / 2
  const pointFor = (i: number, value: number) => {
    const angle = angleFor(i)
    const r = (value / 100) * maxRadius
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) }
  }

  const gridPolygons = Array.from({ length: levels }, (_, level) => {
    const r = ((level + 1) / levels) * maxRadius
    const points = skills.map((_, i) => {
      const angle = angleFor(i)
      return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`
    }).join(' ')
    return points
  })

  const dataPoints = skills.map((s, i) => pointFor(i, inView ? s.score : 0))
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ') + ' Z'

  return (
    <div ref={ref} className="flex w-full items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="h-auto w-full max-w-[320px]"
        role="img"
        aria-label={t('home.skillRadarLabel', { skills: skills.map((skill) => `${skill.name} ${skill.score}%`).join(', ') })}
      >
        <title>{t('home.skillMastery')}</title>
        {/* Grid polygons */}
        {gridPolygons.map((points, i) => (
          <polygon
            key={i}
            points={points}
            fill="none"
            stroke="#1E2D3D"
            strokeWidth="1"
            opacity={0.5 + (i + 1) * 0.1}
          />
        ))}

        {/* Axis lines */}
        {skills.map((_, i) => {
          const angle = angleFor(i)
          const x2 = center + maxRadius * Math.cos(angle)
          const y2 = center + maxRadius * Math.sin(angle)
          return (
            <motion.line
              key={i}
              x1={center}
              y1={center}
              x2={inView ? x2 : center}
              y2={inView ? y2 : center}
              stroke="#1E2D3D"
              strokeWidth="1"
              initial={false}
              animate={{ x2: inView ? x2 : center, y2: inView ? y2 : center }}
              transition={{ duration: 0.3, delay: 0.2 + i * 0.1, ease: easeOutExpo }}
            />
          )
        })}

        {/* Data polygon */}
        <motion.path
          d={dataPath}
          fill="rgba(0,255,136,0.15)"
          stroke="#00FF88"
          strokeWidth="2"
          initial={{ opacity: 0 }}
          animate={{ opacity: inView ? 1 : 0 }}
          transition={{ duration: 0.8, ease: easeOutExpo, delay: 0.4 }}
        />

        {/* Data points */}
        {dataPoints.map((p, i) => (
          <motion.circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="4"
            fill="#00FF88"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: inView ? 1 : 0, scale: inView ? 1 : 0 }}
            transition={{ duration: 0.3, delay: 0.8 + i * 0.05, ease: easeBounce }}
          />
        ))}

        {/* Labels */}
        {skills.map((s, i) => {
          const angle = angleFor(i)
          const labelR = maxRadius + 24
          const x = center + labelR * Math.cos(angle)
          const y = center + labelR * Math.sin(angle)
          return (
            <motion.text
              key={i}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#8B9EB0"
              fontSize="11"
              fontFamily="JetBrains Mono, monospace"
              initial={{ opacity: 0 }}
              animate={{ opacity: inView ? 1 : 0 }}
              transition={{ duration: 0.3, delay: 1.0 }}
            >
              {s.name}
            </motion.text>
          )
        })}
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Section Wrapper — scroll-triggered animation                        */
/* ------------------------------------------------------------------ */
function Section({
  children,
  className = '',
  delay = 0,
  style,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.15 })

  return (
    <motion.section
      ref={ref}
      className={className}
      style={style}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
      transition={{ duration: 0.5, delay, ease: easeOutExpo }}
    >
      {children}
    </motion.section>
  )
}

/* ------------------------------------------------------------------ */
/*  MAIN HOME COMPONENT                                                 */
/* ------------------------------------------------------------------ */
export default function Home() {
  const { t, i18n } = useTranslation()
  const reduceMotion = useReducedMotion() ?? false
  const callsign = useGameStore((state) => state.callsign)
  const missionProgress = useGameStore((state) => state.missionProgress)
  const progressMilestones = useGameStore((state) => state.progressMilestones)
  const currentLocalDay = useCurrentLocalDay()
  const progressLanguage = i18n.resolvedLanguage ?? i18n.language
  const missions = useMemo(
    () => buildProgressMissions(progressLanguage, missionProgress),
    [missionProgress, progressLanguage],
  )
  const academyChapters = useMemo(
    () => buildProgressChapters(progressLanguage, missionProgress),
    [missionProgress, progressLanguage],
  )

  const progressMetrics = useMemo(
    () => deriveProgressMetrics(
      PROGRESS_CATALOG,
      missionProgress,
      `${currentLocalDay}T12:00:00`,
      progressMilestones,
    ),
    [currentLocalDay, missionProgress, progressMilestones],
  )
  const missionsCompleted = progressMetrics.missionsCompleted
  const commandsLearned = progressMetrics.validatedActions
  const currentStreak = progressMetrics.currentStreak
  const resolvedAchievements = useMemo(
    () => resolveAchievements(progressMetrics),
    [progressMetrics],
  )
  const rank = deriveProgressRank(calculateTotalXP(missionsCompleted, resolvedAchievements))

  const skills = useMemo(() => {
    return deriveSkillGroups(academyChapters).map((skill) => ({
      ...skill,
      name: t(`skills.${skill.domain}`),
    }))
  }, [academyChapters, t])

  const weakSkills = useMemo(
    () => [...skills]
      .filter((skill) => skill.score < 100)
      .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
      .slice(0, 4),
    [skills],
  )

  const activeStoryChapter = academyChapters.find((chapter) =>
    chapter.drills.some((drill) => drill.status === 'in-progress'),
  )
  const partialStoryChapter = academyChapters.find((chapter) =>
    chapter.completedDrills > 0 && chapter.completedDrills < chapter.totalDrills,
  )
  const firstIncompleteChapter = academyChapters.find((chapter) =>
    chapter.completedDrills < chapter.totalDrills,
  )
  const currentAcademyChapter = activeStoryChapter
    ?? partialStoryChapter
    ?? firstIncompleteChapter
    ?? academyChapters.at(-1)
  const currentChapter = currentAcademyChapter?.id ?? 1
  const chapters = useMemo<StoryChapter[]>(() => academyChapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    status: chapter.completedDrills === chapter.totalDrills
      ? 'completed'
      : chapter.id === currentChapter
        ? 'current'
        : 'upcoming',
  })), [academyChapters, currentChapter])

  const inProgressMissions = useMemo(() => missions
    .filter((mission) => mission.status === 'in-progress')
    .sort((left, right) => (
      Date.parse(missionProgress[right.id]?.updatedAt ?? '')
      - Date.parse(missionProgress[left.id]?.updatedAt ?? '')
    )), [missionProgress, missions])
  const availableMissions = useMemo(
    () => missions.filter((mission) => mission.status === 'available'),
    [missions],
  )
  const completedMissions = useMemo(() => missions
    .filter((mission) => mission.status === 'completed')
    .sort((left, right) => (
      Date.parse(missionProgress[right.id]?.completedAt ?? '')
      - Date.parse(missionProgress[left.id]?.completedAt ?? '')
    )), [missionProgress, missions])
  const continuationMissions = inProgressMissions.length > 0
    ? inProgressMissions.slice(0, 3)
    : availableMissions.length > 0
      ? availableMissions.slice(0, 3)
      : completedMissions.slice(0, 3)
  const hasActiveMissions = inProgressMissions.length > 0
  const isReplaySelection = !hasActiveMissions && availableMissions.length === 0

  const activityDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }),
    [i18n.language],
  )
  const activities = useMemo<RecentActivity[]>(() => missions.flatMap<RecentActivity>((mission) => {
    const progress = missionProgress[mission.id]
    if (!progress) return []
    if (progress.status === 'completed') {
      return progress.completionHistory.map((attempt, index) => ({
        id: `${mission.id}-${attempt.completedAt}-${index}`,
        description: `${mission.title} · ${t('missionBoard.stats.completed')}`,
        type: 'complete' as const,
        timestamp: activityDateFormatter.format(new Date(attempt.completedAt)),
        sortTime: Date.parse(attempt.completedAt),
      }))
    }
    const timestamp = progress.updatedAt
    return [{
      id: mission.id,
      description: `${mission.title} · ${t('missionBoard.stats.inProgress')}`,
      type: 'in-progress' as const,
      timestamp: activityDateFormatter.format(new Date(timestamp)),
      sortTime: Date.parse(timestamp),
    }]
  }).sort((left, right) => right.sortTime - left.sortTime).slice(0, 8), [activityDateFormatter, missionProgress, missions, t])

  const { displayed: welcomeText, done: typewriterDone } = useTypewriter(t('home.welcome'), 40, 300, reduceMotion)

  const rankImages: Record<string, string> = {
    recruit: publicAssetUrl('rank-recruit.png'),
    operator: publicAssetUrl('rank-operator.png'),
    ghost: publicAssetUrl('rank-ghost.png'),
  }

  const rankLabels: Record<string, string> = {
    recruit: t('home.rank') + ' — ' + t('rank.recruit'),
    operator: t('home.rank') + ' — ' + t('rank.operator'),
    ghost: t('home.rank') + ' — ' + t('rank.ghost'),
  }

  const rankColors: Record<string, string> = {
    recruit: '#CD7F32',
    operator: '#C0C0C0',
    ghost: '#00FF88',
  }

  const activityColors: Record<string, string> = {
    complete: '#00FF88',
    'in-progress': '#FFD166',
    failed: '#FF4757',
    learning: '#00E5FF',
    achievement: '#C77DFF',
  }

  const quickActions = [
    { label: t('home.quickActions.newMission'), icon: Target, href: '/missions' },
    { label: t('home.quickActions.academy'), icon: BookOpen, href: '/academy' },
    { label: t('home.quickActions.commandAtlas'), icon: Search, href: '/atlas' },
    { label: t('home.quickActions.profile'), icon: User, href: '/profile' },
    { label: t('home.quickActions.settings'), icon: Settings, href: '/settings' },
    { label: t('home.quickActions.leaderboard'), icon: Trophy, href: '#', disabled: true },
  ]

  const missionModeLabel = (mode: string) => {
    if (mode === 'operation') return t('academy.operations')
    if (mode === 'nightmare') return t('academy.nightmareMode')
    if (mode === 'red-zone') return t('academy.bossBattles')
    return t('academy.trainingDrills')
  }
  const riskColors = ['#00FF88', '#00FF88', '#00E5FF', '#FFD166', '#FF4757', '#C77DFF', '#FF4757']
  const trainingMissions = [...inProgressMissions, ...availableMissions, ...completedMissions]
    .filter((mission, index, all) => all.findIndex((candidate) => candidate.id === mission.id) === index)
    .slice(0, 3)
  const trainingCards = trainingMissions.map((mission) => ({
    id: mission.id,
    title: mission.title,
    type: missionModeLabel(mission.mode),
    difficulty: mission.difficulty,
    time: mission.estimatedTime,
    skills: mission.skills.slice(0, 2),
    risk: riskColors[mission.riskLevel] ?? '#8B9EB0',
    borderColor: mission.status === 'in-progress' ? '#FFD166' : '#00E5FF',
    cta: mission.status === 'in-progress'
      ? t('missionBoard.continue')
      : mission.status === 'completed'
        ? t('missionBoard.replay')
        : t('academy.start'),
    href: `/terminal/${mission.id}`,
  }))

  return (
    <div>
      {/* ============================================================ */}
      {/* SECTION 1: HERO                                              */}
      {/* ============================================================ */}
      <section
        className="relative flex flex-col items-center justify-center text-center overflow-hidden"
        style={{ minHeight: '35vh', padding: 'var(--space-8) var(--space-4)' }}
      >
        {/* Background image */}
        <div
          className="absolute inset-0 z-bg"
          style={{
            backgroundImage: `url("${publicAssetUrl('hero-bg.jpg')}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.4,
          }}
        />
        {/* Video overlay */}
        {!reduceMotion && (
          <video
            autoPlay
            loop
            muted
            playsInline
            aria-hidden="true"
            className="absolute inset-0 z-bg object-cover pointer-events-none"
            style={{ opacity: 0.08 }}
          >
            <source src={publicAssetUrl('hero-loop.mp4')} type="video/mp4" />
          </video>
        )}
        {/* Gradient overlay */}
        <div
          className="absolute inset-0 z-bg"
          style={{ background: 'linear-gradient(to bottom, transparent 0%, #0A0E14 100%)' }}
        />

        {/* Content */}
        <div className="relative z-content flex flex-col items-center gap-space-4">
          {/* Welcome Text with Typewriter */}
          <motion.h1
            aria-label={t('home.welcome')}
            className="font-jetbrains text-h2 text-[#E8EDF2] whitespace-pre-wrap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {welcomeText.split('Operative')[0]}
            {welcomeText.includes('Operative') && (
              <span className="text-[#00FF88]">Operative</span>
            )}
            {!typewriterDone && (
              <span aria-hidden="true" className="inline-block w-[2px] h-[1.2em] bg-[#00E5FF] ml-1 animate-pulse motion-reduce:animate-none align-middle" />
            )}
          </motion.h1>

          {/* Callsign + Rank */}
          <motion.div
            className="flex max-w-full flex-wrap items-center justify-center gap-space-3"
            initial={{ opacity: 0, y: 12 }}
            animate={typewriterDone ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
            transition={{ duration: 0.3, ease: easeOutExpo }}
          >
            <img
              src={rankImages[rank]}
              alt={rank}
              className="w-9 h-9 rounded-full object-cover"
            />
            <span className="min-w-0 max-w-full break-words text-center font-jetbrains text-h3 text-[#00E5FF] tracking-tight">
              &ldquo;{callsign}&rdquo;
            </span>
            <span
              className="font-jetbrains text-badge uppercase px-space-2 py-space-1 rounded-radius-full border"
              style={{
                color: rankColors[rank],
                borderColor: rankColors[rank],
                backgroundColor: `${rankColors[rank]}15`,
              }}
            >
              {rankLabels[rank]}
            </span>
          </motion.div>

          {/* Tagline */}
          <motion.p
            className="font-inter text-body text-[#8B9EB0] italic max-w-md"
            initial={{ opacity: 0 }}
            animate={typewriterDone ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            {t('app.tagline')}
          </motion.p>

          {/* Quick Terminal CTA */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={typewriterDone ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.5, delay: 0.3, ease: easeBounce }}
          >
            <Link
              to="/terminal/whoami-shell"
              className="inline-flex items-center gap-space-2 px-space-6 py-space-3 rounded-radius-sm font-jetbrains text-h4 transition-all duration-fast"
              style={{
                backgroundColor: 'rgba(0,255,136,0.15)',
                border: '1px solid #00FF88',
                color: '#00FF88',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0,255,136,0.25)'
                e.currentTarget.style.boxShadow = '0 0 24px rgba(0,255,136,0.15)'
                e.currentTarget.style.transform = 'scale(1.02)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0,255,136,0.15)'
                e.currentTarget.style.boxShadow = 'none'
                e.currentTarget.style.transform = 'scale(1)'
              }}
            >
              <Terminal size={18} />
              {t('home.enterTerminal')}
            </Link>
          </motion.div>

          {/* Stats Row */}
          <motion.div
            className="flex flex-wrap items-center justify-center gap-space-6 mt-space-4"
            initial={{ opacity: 0, y: 8 }}
            animate={typewriterDone ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.3, delay: 0.5 }}
          >
            {[
              { label: t('home.stats.missionsCompleted'), value: String(missionsCompleted), icon: Trophy, color: '#00FF88' },
              { label: t('home.stats.commandsLearned'), value: String(commandsLearned), icon: Terminal, color: '#00E5FF' },
              { label: t('home.stats.currentStreak'), value: t('home.streakDays', { count: currentStreak }), icon: TrendingUp, color: '#FFD166' },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                className="flex items-center gap-space-1.5 font-jetbrains text-body-sm text-[#788DA1]"
                initial={{ opacity: 0, y: 8 }}
                animate={typewriterDone ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                transition={{ duration: 0.3, delay: 0.6 + i * 0.1 }}
              >
                <stat.icon size={14} style={{ color: stat.color }} />
                <span>{stat.label}:</span>
                <span style={{ color: stat.color }}>{stat.value}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* SECTION 1.5: CONTINUE WHERE YOU LEFT OFF                     */}
      {/* ============================================================ */}
      <Section className="w-full" delay={0}>
        <div
          className="max-w-[1200px] mx-auto px-space-4"
          style={{ paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-4)' }}
        >
          <div className="flex items-center justify-between mb-space-3">
            <div className="flex items-center gap-space-2">
              <Clock size={18} className="text-[#FFD166]" />
              <h2 className="font-jetbrains text-h4 text-[#E8EDF2]">
                {hasActiveMissions
                  ? t('home.continue')
                  : isReplaySelection
                    ? t('missionBoard.replay')
                    : t('home.recommended')}
              </h2>
            </div>
            <Link
              to="/missions"
              className="-mr-2 flex min-h-11 items-center gap-space-1 px-2 font-jetbrains text-body-sm text-[#00E5FF] transition-colors duration-fast hover:text-[#00FF88]"
            >
              {t('home.allMissions')}
              <ChevronRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-3">
            {continuationMissions.map((mission, i) => {
              const color = riskColors[mission.riskLevel] ?? '#8B9EB0'
              const statusLabel = mission.status === 'in-progress'
                ? t('missionBoard.stats.inProgress')
                : mission.status === 'completed'
                  ? t('missionBoard.stats.completed')
                  : t('home.progress.available')
              const sectionLabel = hasActiveMissions
                ? t('home.continue')
                : isReplaySelection
                  ? t('missionBoard.replay')
                  : t('home.recommended')
              return (
              <Link
                key={mission.id}
                to={`/terminal/${mission.id}`}
                className="rounded-radius-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
                aria-label={`${sectionLabel}: ${mission.title}`}
              >
              <motion.article
                className="relative rounded-radius-md p-space-4"
                style={{
                  backgroundColor: '#0F1419',
                  border: '1px solid #1E2D3D',
                }}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.08, ease: easeOutExpo }}
                whileHover={{
                  y: -2,
                  borderColor: '#2A4365',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                }}
              >
                <div className="flex items-center justify-between mb-space-2">
                  <span
                    className="font-jetbrains text-badge uppercase px-space-1.5 py-space-0.5 rounded-sm"
                    style={{
                      color,
                      backgroundColor: `${color}15`,
                    }}
                  >
                    {statusLabel}
                  </span>
                  <ChevronRight size={14} className="text-[#788DA1]" />
                </div>
                <h3 className="font-jetbrains text-body text-[#E8EDF2] truncate">{mission.title}</h3>
              </motion.article>
              </Link>
              )
            })}
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/* SECTION 2: TODAY'S TRAINING                                  */}
      {/* ============================================================ */}
      <Section className="w-full" delay={0}>
        <div
          className="max-w-[1200px] mx-auto px-space-4"
          style={{ paddingTop: 'var(--space-12)', paddingBottom: 'var(--space-8)' }}
        >
          {/* Section Header */}
          <div className="flex items-center justify-between mb-space-6">
            <div className="flex items-center gap-space-2">
              <Calendar size={20} className="text-[#00E5FF]" />
              <h2 className="font-jetbrains text-h3 text-[#E8EDF2]">{t('home.todayTraining')}</h2>
            </div>
            <Link
              to="/academy"
              className="-mr-2 flex min-h-11 items-center gap-space-1 px-2 font-jetbrains text-body-sm text-[#00E5FF] transition-colors duration-fast hover:text-[#00FF88]"
            >
              {t('home.viewAll')}
              <ChevronRight size={14} />
            </Link>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-space-5">
            {trainingCards.map((card, i) => (
              <motion.div
                key={card.title}
                className="relative rounded-radius-md p-space-5 transition-all duration-fast"
                style={{
                  backgroundColor: '#0F1419',
                  border: '1px solid #1E2D3D',
                  borderLeft: `4px solid ${card.borderColor}`,
                }}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.4, delay: i * 0.12, ease: easeOutExpo }}
                whileHover={{
                  y: -2,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  borderColor: '#2A4365',
                }}
              >
                {/* Risk stripe */}
                <div
                  className="absolute top-0 left-0 right-0 h-[4px] rounded-t-radius-md"
                  style={{ backgroundColor: card.risk }}
                />

                {/* Header */}
                <div className="flex items-center justify-between mb-space-2">
                  <span className="font-jetbrains text-badge uppercase text-[#788DA1]">{card.type}</span>
                  <div className="flex items-center gap-space-0.5" aria-label={t('missionBoard.difficultyStars', { count: card.difficulty })}>
                    {Array.from({ length: 5 }, (_, j) => (
                      <Star
                        key={j}
                        size={12}
                        fill={j < card.difficulty ? '#FFD166' : 'none'}
                        stroke={j < card.difficulty ? '#FFD166' : '#788DA1'}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                </div>

                {/* Title */}
                <h3 className="font-jetbrains text-h4 text-[#E8EDF2] mb-space-2">{card.title}</h3>

                {/* Meta */}
                <div className="flex flex-wrap items-center gap-space-3 mb-space-3">
                  <span className="flex items-center gap-space-1 font-jetbrains text-body-sm text-[#788DA1]">
                    <Clock size={12} />
                    {card.time}
                  </span>
                  {card.skills.map((skill) => (
                    <span
                      key={skill}
                      className="font-jetbrains text-badge uppercase px-space-1.5 py-space-0.5 rounded-radius-full border"
                      style={{
                        color: '#8B9EB0',
                        borderColor: 'rgba(139,158,176,0.3)',
                        backgroundColor: 'rgba(139,158,176,0.1)',
                      }}
                    >
                      {skill}
                    </span>
                  ))}
                </div>

                {/* CTA */}
                <Link
                  to={card.href}
                  className="-ml-2 inline-flex min-h-11 items-center gap-space-1 px-2 font-jetbrains text-body-sm font-semibold transition-colors duration-fast"
                  style={{ color: '#00FF88' }}
                >
                  {card.cta}
                  <ChevronRight size={14} />
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/* SECTION 3: STORY PROGRESS                                    */}
      {/* ============================================================ */}
      <Section className="w-full" delay={0} style={{ backgroundColor: '#0F1419' }}>
        <div
          className="max-w-[1200px] mx-auto px-space-4"
          style={{ paddingTop: 'var(--space-10)', paddingBottom: 'var(--space-10)' }}
        >
          {/* Section Header */}
          <div className="mb-space-6">
            <h2 className="font-jetbrains text-h3 text-[#E8EDF2] mb-space-1">
              {t('home.seasonTitle')}
            </h2>
            <p className="font-inter text-body text-[#8B9EB0]">
              {t('home.chapter', { current: currentChapter, total: chapters.length })} — {currentAcademyChapter?.title}
            </p>
          </div>

          {/* Timeline */}
          <div
            className="overflow-x-auto pb-space-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
            tabIndex={0}
            role="region"
            aria-label={t('home.storyProgress')}
          >
            <div className="flex items-center min-w-max px-space-2" role="list">
              {chapters.map((chapter: StoryChapter, i: number) => (
                <div
                  key={chapter.id}
                  className="flex items-center"
                  role="listitem"
                  aria-label={`${chapter.title}: ${chapter.status === 'completed' ? t('missionBoard.stats.completed') : chapter.status === 'current' ? t('missionBoard.stats.inProgress') : t('home.progress.available')}`}
                >
                  {/* Node */}
                  <div className="flex flex-col items-center relative">
                    <TimelineNode chapter={chapter} index={i} />
                    <span
                      className="font-jetbrains text-code-sm mt-space-2 whitespace-nowrap max-w-[70px] truncate text-center"
                      style={{
                        color:
                          chapter.status === 'completed'
                            ? '#00FF88'
                            : chapter.status === 'current'
                              ? '#00E5FF'
                              : '#788DA1',
                      }}
                    >
                      {chapter.title}
                    </span>
                  </div>

                  {/* Connecting line */}
                  {i < chapters.length - 1 && (
                    <div
                      className="w-[40px] lg:w-[50px] h-[2px] mx-space-1"
                      style={{
                        backgroundColor:
                          chapter.status === 'completed' ? '#00FF88' : '#1E2D3D',
                        backgroundImage:
                          chapter.status === 'completed'
                            ? 'none'
                            : 'repeating-linear-gradient(90deg, #1E2D3D, #1E2D3D 4px, transparent 4px, transparent 8px)',
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Chapter Summary */}
          <motion.p
            className="font-inter text-body text-[#8B9EB0] max-w-[600px] mx-auto text-center mt-space-6"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            {currentAcademyChapter?.description ?? t('home.storySummary')}
          </motion.p>
        </div>
      </Section>

      {/* ============================================================ */}
      {/* SECTION 4: SKILL RADAR + WEAK SPOTS                          */}
      {/* ============================================================ */}
      <Section className="w-full" delay={0}>
        <div
          className="max-w-[1200px] mx-auto px-space-4"
          style={{ paddingTop: 'var(--space-12)', paddingBottom: 'var(--space-12)' }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-8 items-start">
            {/* Left: Skill Radar */}
            <div>
              <h2 className="font-jetbrains text-h3 text-[#E8EDF2] mb-space-4">{t('home.skillMastery')}</h2>
              <SkillRadar skills={skills} />
            </div>

            {/* Right: Weak Spots */}
            <div>
              <div className="flex items-center gap-space-2 mb-space-1">
                <Crosshair size={20} className="text-[#FF6B35]" />
                <h2 className="font-jetbrains text-h3 text-[#E8EDF2]">{t('home.focusAreas')}</h2>
              </div>
              <p className="font-inter text-body-sm text-[#8B9EB0] mb-space-4">
                {t('home.focusAreasSubtitle')}
              </p>

              <div className="flex flex-col gap-space-3">
                {weakSkills.length === 0 ? (
                  <div className="rounded-radius-md border border-[#1E2D3D] bg-[#0F1419] p-space-4 font-inter text-body text-[#8B9EB0]">
                    {t('home.allSkillsMastered')}
                  </div>
                ) : weakSkills.map((skill, i) => (
                  <motion.div
                    key={skill.name}
                    className="rounded-radius-md p-space-4"
                    style={{ backgroundColor: '#0F1419' }}
                    initial={{ opacity: 0, x: 16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: i * 0.1, ease: 'cubic-bezier(0.4,0,0.2,1)' as unknown as [number,number,number,number] }}
                  >
                    <div className="flex items-center justify-between mb-space-2">
                      <span className="font-jetbrains text-h4 text-[#E8EDF2]">{skill.name}</span>
                      <Link
                        to="/academy"
                        className="-mr-2 flex min-h-11 items-center gap-space-0.5 px-2 font-jetbrains text-body-sm text-[#00E5FF] transition-colors duration-fast hover:text-[#00FF88]"
                      >
                        {t('home.train')}
                        <ChevronRight size={12} />
                      </Link>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1 w-full rounded-full mb-space-2" style={{ backgroundColor: '#1A2332' }}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: skill.color }}
                        initial={{ width: 0 }}
                        whileInView={{ width: `${skill.score}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.2 + i * 0.1, ease: easeOutExpo }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-jetbrains text-code-sm" style={{ color: skill.color }}>
                        {skill.score}%
                      </span>
                      <span className="font-inter text-body-sm text-[#788DA1]">
                        {skill.completed}/{skill.total} {t('academy.drills')}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/* SECTION 6: RECENT ACTIVITY + QUICK ACTIONS                   */}
      {/* ============================================================ */}
      <Section className="w-full" delay={0}>
        <div
          className="max-w-[1200px] mx-auto px-space-4"
          style={{ paddingTop: 'var(--space-10)', paddingBottom: 'var(--space-10)' }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-space-8">
            {/* Left: Recent Activity (60%) */}
            <div className="lg:col-span-3">
              <div className="flex items-center gap-space-2 mb-space-4">
                <Activity size={20} className="text-[#00E5FF]" />
                <h2 className="font-jetbrains text-h3 text-[#E8EDF2]">{t('home.recentActivity')}</h2>
              </div>

              <div className="flex flex-col">
                {activities.length === 0 ? (
                  <div
                    className="rounded-radius-md border border-dashed p-space-5"
                    style={{ borderColor: '#1E2D3D', backgroundColor: '#0F1419' }}
                    role="status"
                  >
                    <p className="font-inter text-body text-[#8B9EB0]">
                      {t('home.noRecentActivity')}
                    </p>
                    <Link
                      to="/missions"
                      className="-ml-2 mt-space-2 inline-flex min-h-11 items-center gap-space-1 px-2 font-jetbrains text-body-sm text-[#00E5FF] transition-colors hover:text-[#00FF88]"
                    >
                      {t('home.quickActions.newMission')}
                      <ChevronRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                ) : activities.map((activity, i) => (
                  <motion.div
                    key={activity.id}
                    className="flex items-start gap-space-3 py-space-3 border-b"
                    style={{ borderColor: '#1E2D3D' }}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: i * 0.08 }}
                  >
                    <div
                      className="w-2 h-2 rounded-full mt-[6px] shrink-0"
                      style={{ backgroundColor: activityColors[activity.type] }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-inter text-body text-[#E8EDF2] truncate">
                        {activity.description}
                      </p>
                    </div>
                    <span className="font-jetbrains text-body-sm text-[#788DA1] shrink-0">
                      {activity.timestamp}
                    </span>
                  </motion.div>
                ))}
              </div>

              <Link
                to="/profile"
                className="-ml-2 mt-space-3 inline-flex min-h-11 items-center gap-space-1 px-2 font-jetbrains text-body-sm text-[#00E5FF] transition-colors duration-fast hover:text-[#00FF88]"
              >
                {t('home.viewFullHistory')}
                <ChevronRight size={14} />
              </Link>
            </div>

            {/* Right: Quick Actions (40%) */}
            <div className="lg:col-span-2">
              <h2 className="font-jetbrains text-h3 text-[#E8EDF2] mb-space-4">{t('home.quickActionsTitle')}</h2>

              <div className="grid grid-cols-3 gap-space-3">
                {quickActions.map((action, i) => (
                  <motion.div
                    key={action.label}
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.25, delay: i * 0.06 }}
                  >
                    {action.disabled ? (
                      <div
                        className="flex flex-col items-center justify-center gap-space-2 p-space-3 rounded-radius-md cursor-not-allowed opacity-40"
                        style={{
                          backgroundColor: '#0F1419',
                          border: '1px solid #1E2D3D',
                          aspectRatio: '1',
                        }}
                      >
                        <Lock size={20} className="text-[#788DA1]" />
                        <span className="font-jetbrains text-body-sm text-[#788DA1] text-center leading-tight">
                          {action.label}
                        </span>
                      </div>
                    ) : (
                      <Link
                        to={action.href}
                        className="flex flex-col items-center justify-center gap-space-2 p-space-3 rounded-radius-md transition-all duration-fast"
                        style={{
                          backgroundColor: '#0F1419',
                          border: '1px solid #1E2D3D',
                          aspectRatio: '1',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#1E2A3A'
                          e.currentTarget.style.borderColor = '#2A4365'
                          e.currentTarget.style.transform = 'scale(1.03)'
                          const icon = e.currentTarget.querySelector('svg')
                          if (icon) icon.style.color = '#00FF88'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#0F1419'
                          e.currentTarget.style.borderColor = '#1E2D3D'
                          e.currentTarget.style.transform = 'scale(1)'
                          const icon = e.currentTarget.querySelector('svg')
                          if (icon) icon.style.color = '#00E5FF'
                        }}
                      >
                        <action.icon size={24} className="text-[#00E5FF] transition-colors duration-fast" />
                        <span className="font-jetbrains text-body-sm text-[#8B9EB0] text-center leading-tight">
                          {action.label}
                        </span>
                      </Link>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Timeline Node sub-component                                       */
/* ------------------------------------------------------------------ */
function TimelineNode({ chapter, index }: { chapter: StoryChapter; index: number }) {
  if (chapter.status === 'completed') {
    return (
      <motion.div
        aria-hidden="true"
        className="w-3 h-3 rounded-full"
        style={{ backgroundColor: '#00FF88' }}
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.3, delay: index * 0.05, ease: easeBounce }}
      />
    )
  }

  if (chapter.status === 'current') {
    return (
      <motion.div
        aria-hidden="true"
        className="w-4 h-4 rounded-full"
        style={{
          backgroundColor: '#00E5FF',
          boxShadow: '0 0 12px rgba(0,229,255,0.4)',
        }}
        animate={{
          boxShadow: [
            '0 0 12px rgba(0,229,255,0.4)',
            '0 0 20px rgba(0,229,255,0.6)',
            '0 0 12px rgba(0,229,255,0.4)',
          ],
        }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
    )
  }

  return (
    <div
      aria-hidden="true"
      className="w-2 h-2 rounded-full border"
      style={{
        borderColor: '#1E2D3D',
        backgroundColor: 'transparent',
      }}
    />
  )
}
