import { useRef, useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  Check,
  X,
  RotateCcw,
  ChevronRight,
  Share2,
  Clock,
  Terminal,
  Zap,
  AlertTriangle,
  ShieldCheck,
  Eye,
} from 'lucide-react'
import ScoreBreakdown from '@/components/debrief/ScoreBreakdown'
import CommandTimeline from '@/components/debrief/CommandTimeline'
import type { TimelineEntry } from '@/components/debrief/CommandTimeline'
import PerformanceCard from '@/components/debrief/PerformanceCard'
import MissionReport from '@/components/debrief/MissionReport'
import { ALL_LEVELS, getLevelById } from '@/engine/levels'
import { loadMissionRunReport } from '@/engine/runReport'
import type { MissionRunAction } from '@/engine/runReport'
import { getObjectiveChecks, matchesMissionCommand } from '@/engine/validator'
import { useGameStore } from '@/store/gameStore'
import { allocateIntegerPoints } from '@/lib/scoreAllocation'

// ─── Types ──────────────────────────────────────────────────────────

interface ScoreCategory {
  name: string
  maxPoints: number
  earned: number
  detail: string
}

interface ObjectiveReview {
  id: string
  description: string
  completed: boolean
  evidence: string
  points: number
}

function isRunActionRed(action: MissionRunAction, fallbackRedCommands: string[]): boolean {
  if (action.redCommands) return action.redCommands.length > 0
  return fallbackRedCommands.some(command => action.command.includes(command))
}

interface LearnedSkill {
  command: string
  description: string
}

interface Warning {
  message: string
  suggestion: string
}

interface Recommendation {
  id: string
  title: string
  type: string
  difficulty: number
  skills: string[]
}

// ─── Grade Logic ────────────────────────────────────────────────────

function getGrade(score: number): { letter: string; label: string; color: string } {
  if (score >= 95) return { letter: 'S', label: 'debrief.grade.S', color: '#00FF88' }
  if (score >= 80) return { letter: 'A', label: 'debrief.grade.A', color: '#00E5FF' }
  if (score >= 60) return { letter: 'B', label: 'debrief.grade.B', color: '#4488FF' }
  if (score >= 30) return { letter: 'C', label: 'debrief.grade.C', color: '#FFD166' }
  return { letter: 'D', label: 'debrief.grade.D', color: '#FF4757' }
}

// ─── Animated Score Ring ────────────────────────────────────────────

function ScoreRing({
  score,
  color,
  size = 120,
  strokeWidth = 8,
}: {
  score: number
  color: string
  size?: number
  strokeWidth?: number
}) {
  const shouldReduceMotion = useReducedMotion() ?? false
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#1A2332"
        strokeWidth={strokeWidth}
      />
      {/* Progress */}
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={shouldReduceMotion ? false : { strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: circumference - progress }}
        transition={shouldReduceMotion
          ? { duration: 0 }
          : { duration: 1.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number], delay: 0.3 }}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
      />
    </svg>
  )
}

// ─── Animated Counter ───────────────────────────────────────────────

function AnimatedScore({ value, color }: { value: number; color: string }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true })
  const shouldReduceMotion = useReducedMotion() ?? false

  useEffect(() => {
    if (!isInView || shouldReduceMotion) return
    let start = 0
    const duration = 1200
    const startTime = performance.now()
    let frameId = 0

    function animate(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // ease-out-expo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      start = Math.round(eased * value)
      setDisplay(start)
      if (progress < 1) frameId = requestAnimationFrame(animate)
    }

    frameId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameId)
  }, [isInView, shouldReduceMotion, value])

  return (
    <div ref={ref} className="relative inline-flex items-center justify-center">
      <ScoreRing score={value} color={color} />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-jetbrains text-h1" style={{ color, fontSize: '32px' }}>
          {shouldReduceMotion ? value : display}
        </span>
        <span className="font-jetbrains text-code-sm text-[#788DA1]">/100</span>
      </div>
    </div>
  )
}

// ─── Objectives Review ──────────────────────────────────────────────

function ObjectivesReview({ objectives }: { objectives: ObjectiveReview[] }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })
  const completed = objectives.filter((o) => o.completed).length

  return (
    <section ref={ref} className="max-w-[960px] mx-auto px-space-4 mt-space-8">
      <div className="flex items-center justify-between mb-space-6">
        <h2 className="font-jetbrains text-h2 text-[#E8EDF2]">{t('debrief.objectives')}</h2>
        <span className="font-jetbrains text-code text-[#8B9EB0]">
          {completed}/{objectives.length} {t('debrief.completed')}
        </span>
      </div>

      <div className="space-y-space-2">
        {objectives.map((obj, i) => (
          <motion.div
            key={obj.id}
            className="flex items-start gap-space-3 p-space-3 rounded-radius-md border"
            style={{
              backgroundColor: '#0F1419',
              borderColor: '#1E2D3D',
              borderLeft: `3px solid ${obj.completed ? '#00FF88' : '#FF4757'}`,
            }}
            initial={{ opacity: 0, x: -12 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{
              duration: 0.25,
              delay: i * 0.08,
              ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
            }}
          >
            {obj.completed ? (
              <Check size={18} style={{ color: '#00FF88', marginTop: '2px' }} className="flex-shrink-0" />
            ) : (
              <X size={18} style={{ color: '#FF4757', marginTop: '2px' }} className="flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-inter text-body" style={{ color: '#E8EDF2' }}>
                {obj.description}
              </p>
              <p className="font-fira text-code-sm text-[#8B9EB0] mt-space-1">{obj.evidence}</p>
            </div>
            <span
              className="font-fira text-code-sm flex-shrink-0"
              style={{ color: obj.completed ? '#00FF88' : '#788DA1' }}
            >
              {obj.completed ? `+${obj.points} ${t('debrief.points')}` : `0 ${t('debrief.points')}`}
            </span>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

// ─── What You Learned ───────────────────────────────────────────────

function WhatYouLearned({ skills, missionId }: { skills: LearnedSkill[]; missionId: string }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })

  return (
    <section ref={ref} className="max-w-[960px] mx-auto px-space-4 mt-space-8">
      <h2 className="font-jetbrains text-h2 text-[#E8EDF2] mb-space-6">
        {skills.length > 0 ? t('debrief.newSkills') : t('debrief.practiceReinforced')}
      </h2>

      {skills.length > 0 ? (
        <div className="flex gap-space-4 overflow-x-auto pb-space-2">
          {skills.map((skill, i) => (
            <motion.div
              key={skill.command}
              className="flex-shrink-0 w-[260px] p-space-4 rounded-radius-md border"
              style={{
                backgroundColor: '#0F1419',
                borderColor: '#1E2D3D',
                borderTop: '3px solid #00FF88',
              }}
              initial={{ opacity: 0, y: 16 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{
                duration: 0.3,
                delay: i * 0.1,
                ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
              }}
            >
              <h3 className="font-fira text-h3 text-[#00FF88]">{skill.command}</h3>
              <p className="font-inter text-body text-[#8B9EB0] mt-space-2">{skill.description}</p>
              <div className="flex items-center gap-space-3 mt-space-4">
                <Link
                  to={`/terminal/${missionId}`}
                  aria-label={t('debrief.practiceCommand', { command: skill.command })}
                  className="rounded-radius-sm font-jetbrains text-body-sm text-[#00E5FF] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
                >
                  {t('debrief.practice')} &rarr;
                </Link>
                <Link
                  to="/atlas"
                  aria-label={t('debrief.viewCommandInAtlas', { command: skill.command })}
                  className="rounded-radius-sm font-jetbrains text-body-sm text-[#8B9EB0] hover:text-[#00E5FF] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
                >
                  {t('debrief.viewInAtlas')}
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <p className="font-inter text-body text-[#8B9EB0]">
          {t('debrief.noNewCommands')}
        </p>
      )}
    </section>
  )
}

// ─── Warnings Section ───────────────────────────────────────────────

function WarningsSection({ warnings }: { warnings: Warning[] }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })

  if (warnings.length === 0) return null

  return (
    <section ref={ref} className="max-w-[960px] mx-auto px-space-4 mt-space-8">
      <motion.div
        className="p-space-6 rounded-radius-lg border"
        style={{
          backgroundColor: '#0F1419',
          borderColor: '#1E2D3D',
          backgroundImage: 'linear-gradient(135deg, rgba(255,71,87,0.03) 0%, transparent 60%)',
        }}
        initial={{ opacity: 0, y: 12 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.35 }}
      >
        <div className="flex items-center gap-space-2 mb-space-4">
          <AlertTriangle size={20} style={{ color: '#FFD166' }} />
          <h2 className="font-jetbrains text-h2" style={{ color: '#FFD166' }}>
            {t('debrief.warnings')}
          </h2>
          <span
            className="font-jetbrains text-badge uppercase px-space-2 py-[2px] rounded-radius-sm"
            style={{
              backgroundColor: 'rgba(255,209,102,0.15)',
              color: '#FFD166',
            }}
          >
            {t('debrief.issueCount', { count: warnings.length })}
          </span>
        </div>

        <div className="space-y-space-3">
          {warnings.map((w, i) => (
            <motion.div
              key={i}
              className="flex items-start gap-space-3 p-space-3 rounded-radius-sm"
              style={{ backgroundColor: 'rgba(255,209,102,0.05)' }}
              initial={{ opacity: 0, y: 12 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.25, delay: i * 0.1 }}
            >
              <AlertTriangle size={16} style={{ color: '#FFD166', marginTop: '3px' }} className="flex-shrink-0" />
              <div>
                <p className="font-inter text-body" style={{ color: '#E8EDF2' }}>
                  {w.message}
                </p>
                <p className="font-inter text-body-sm text-[#8B9EB0] mt-space-1">{w.suggestion}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  )
}

// ─── Recommended Next Steps ─────────────────────────────────────────

function RecommendedSteps({ recommendations }: { recommendations: Recommendation[] }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })

  return (
    <section ref={ref} className="max-w-[960px] mx-auto px-space-4 mt-space-10 mb-space-16">
      <h2 className="font-jetbrains text-h2 text-[#E8EDF2] mb-space-1">{t('debrief.recommendations')}</h2>
      <p className="font-inter text-body text-[#8B9EB0] mb-space-6">{t('debrief.recommendedSubtitle')}</p>

      <div className="flex gap-space-4 overflow-x-auto pb-space-4">
        {recommendations.map((rec, i) => (
          <motion.div
            key={rec.id}
            className="flex-shrink-0 w-[280px] rounded-radius-md border transition-all duration-fast"
            style={{
              backgroundColor: '#0F1419',
              borderColor: '#1E2D3D',
            }}
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{
              duration: 0.4,
              delay: i * 0.12,
              ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
            }}
            whileHover={{
              y: -2,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              borderColor: '#2A4365',
            }}
          >
            <Link
              to={`/terminal/${rec.id}`}
              aria-label={t('debrief.openRecommendedMission', { title: rec.title })}
              className="block h-full rounded-radius-md p-space-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00E5FF]"
            >
              <div className="flex items-center justify-between mb-space-2">
                <span
                  className="font-jetbrains text-badge uppercase px-space-2 py-[2px] rounded-radius-sm"
                  style={{
                    backgroundColor: 'rgba(0,229,255,0.1)',
                    color: '#00E5FF',
                  }}
                >
                  {rec.type}
                </span>
                <div className="flex">
                  <span className="sr-only">{t('debrief.difficulty', { level: rec.difficulty })}</span>
                  {Array.from({ length: 5 }).map((_, si) => (
                    <Zap
                      key={si}
                      size={10}
                      aria-hidden="true"
                      style={{
                        color: si < rec.difficulty ? '#FFD166' : '#1E2D3D',
                        fill: si < rec.difficulty ? '#FFD166' : 'none',
                      }}
                    />
                  ))}
                </div>
              </div>
              <h3 className="font-jetbrains text-h4 text-[#E8EDF2] mb-space-2">{rec.title}</h3>
              <div className="flex flex-wrap gap-space-1">
                {rec.skills.map((skill) => (
                  <span
                    key={skill}
                    className="font-jetbrains text-badge uppercase px-[10px] py-[4px] rounded-radius-full"
                    style={{
                      backgroundColor: 'rgba(0,255,136,0.08)',
                      color: '#00FF88',
                      border: '1px solid rgba(0,255,136,0.2)',
                    }}
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

// ─── Main Debrief Page ──────────────────────────────────────────────

export default function Debrief() {
  const { t, i18n } = useTranslation()
  const { missionId } = useParams<{ missionId: string }>()
  const [shareStatus, setShareStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const headerRef = useRef<HTMLDivElement>(null)
  const headerInView = useInView(headerRef, { once: true })
  const currentMissionStatus = useGameStore((state) => (
    missionId ? state.missionProgress[missionId]?.status : undefined
  ))
  const sessionReport = useMemo(() => missionId ? loadMissionRunReport(missionId) : null, [missionId])
  const report = currentMissionStatus === 'completed' ? sessionReport : null
  const level = missionId ? getLevelById(missionId) : undefined
  const language = i18n.resolvedLanguage?.startsWith('zh') ? 'zh' : 'en'
  const scoreCategoryLabel = (category: string) => t(
    `debrief.scoreCategories.${category}`,
    { defaultValue: category },
  )

  const completed = report?.completed ?? false
  const totalScore = report?.scoreResult.total ?? 0
  const elapsedSeconds = report?.elapsedSeconds ?? 0
  const timeTaken = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`
  const completedDate = report
    ? new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(report.completedAt))
    : ''
  const missionTitle = level?.getTitle(language) ?? missionId ?? t('debrief.title')
  const missionType = level
    ? t(`debrief.missionTypes.${level.mode}`, { defaultValue: level.mode })
    : ''
  const grade = getGrade(totalScore)

  const handleShare = async () => {
    const text = `${t('app.title')} \u2014 ${t('debrief.title')}\n${t('profile.tableHeaders.mission')}: ${missionTitle}\n${t('profile.tableHeaders.score')}: ${totalScore}/100 (${t(grade.label)})\n${t('terminal.hud.timer')}: ${timeTaken}\n${t('profile.tableHeaders.status')}: ${completed ? '\u2705 ' + t('profile.pass') : '\u274c ' + t('profile.fail')}\n`
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(text)
      setShareStatus('success')
    } catch {
      setShareStatus('error')
    }
  }

  const performanceStats = useMemo(
    () => [
      { label: t('terminal.hud.timer'), value: timeTaken, icon: Clock, color: '#00E5FF' },
      { label: t('debrief.metadata.commandsUsed'), value: String(report?.attemptedActions.length ?? 0), icon: Terminal, color: '#00FF88' },
      {
        label: t('debrief.stats.uniqueCommands'),
        value: String(new Set(report?.attemptedActions.map(action => action.command.trim().split(/\s+/, 1)[0]) ?? []).size),
        icon: Zap,
        color: '#FFD166',
      },
      { label: t('debrief.stats.errorsMade'), value: String(report?.attemptedActions.filter(action => action.exitCode !== 0).length ?? 0), icon: AlertTriangle, color: '#FF4757' },
      { label: t('debrief.metadata.hintsUsed'), value: String(report?.hintsUsed ?? 0), icon: Eye, color: '#C77DFF' },
      {
        label: t('debrief.stats.safeOps'),
        value: `${report?.attemptedActions.filter(action => !isRunActionRed(action, report.redCommandsUsed)).length ?? 0}/${report?.attemptedActions.length ?? 0}`,
        icon: ShieldCheck,
        color: '#00FF88',
      },
    ],
    [report, t, timeTaken]
  )

  const categories: ScoreCategory[] = report
    ? Object.entries(report.scoreResult.breakdownMax).map(([name, maxPoints]) => ({
        name: scoreCategoryLabel(name),
        maxPoints,
        earned: report.scoreResult.breakdown[name] ?? 0,
        detail: name === 'efficiency'
          ? t('debrief.scoreDetails.efficiency')
          : t('debrief.scoreDetails.evidence'),
      }))
    : []
  const requiredObjectives = level?.objectives.filter(objective => objective.required) ?? []
  const completedRequiredObjectiveIds = report
    ? requiredObjectives.flatMap(objective => (
        report.validationResults.find(candidate => candidate.objectiveId === objective.id)?.completed
          ? [objective.id]
          : []
      ))
    : []
  const objectivePointAllocations = allocateIntegerPoints(
    report?.scoreResult.breakdown.objectives ?? 0,
    completedRequiredObjectiveIds.length,
  )
  const objectivePointsById = new Map(
    completedRequiredObjectiveIds.map((objectiveId, index) => (
      [objectiveId, objectivePointAllocations[index] ?? 0] as const
    )),
  )
  const objectives: ObjectiveReview[] = level && report
    ? requiredObjectives.map(objective => {
        const result = report.validationResults.find(candidate => candidate.objectiveId === objective.id)
        const completed = result?.completed === true
        const commandPatterns = getObjectiveChecks(level, objective.id).flatMap(check => (
          check.type === 'command_used' && check.pattern ? [check.pattern] : []
        ))
        const evidence = completed
          ? [...new Set(report.successfulActions.filter(action => (
              commandPatterns.some(pattern => matchesMissionCommand(action, pattern))
            )))].join(' · ')
          : ''
        return {
          id: objective.id,
          description: objective.getLabel(language),
          completed,
          evidence: evidence || (completed
            ? t('debrief.evidence.missionContract')
            : t('debrief.evidence.notRecorded')),
          points: objectivePointsById.get(objective.id) ?? 0,
        }
      })
    : []
  const timeline: TimelineEntry[] = report
    ? report.attemptedActions.map(action => {
        const red = isRunActionRed(action, report.redCommandsUsed)
        return {
          id: action.id,
          timestamp: `${String(Math.floor(action.timestampSeconds / 60)).padStart(2, '0')}:${String(action.timestampSeconds % 60).padStart(2, '0')}`,
          command: action.command,
          exitCode: action.exitCode,
          cwd: action.cwd,
          mode: action.mode,
          risk: red ? 'red' : action.kind === 'interaction' ? 'purple' : action.exitCode === 0 ? 'green' : 'yellow',
          warning: red
            ? t('debrief.timeline.warnings.redCommand')
            : action.exitCode !== 0
              ? t('debrief.timeline.warnings.nonZeroExit')
              : undefined,
        }
      })
    : []
  const learnedSkills: LearnedSkill[] = level
    ? level.skills.map(command => ({ command, description: t('debrief.skillDescription') }))
    : []
  const warnings: Warning[] = report
    ? [
        ...report.redCommandsUsed.map(command => ({
          message: t('debrief.warningMessages.redCommand', { command }),
          suggestion: t('debrief.warningSuggestions.redCommand'),
        })),
        ...(report.hintsUsed > 0 ? [{
          message: t('debrief.warningMessages.hintsUsed', { count: report.hintsUsed }),
          suggestion: t('debrief.warningSuggestions.hintsUsed'),
        }] : []),
        ...report.scoreResult.excludedCategories.map(category => ({
          message: t('debrief.warningMessages.categoryNotScored', { category: scoreCategoryLabel(category) }),
          suggestion: t('debrief.warningSuggestions.categoryNotScored'),
        })),
      ]
    : []
  const recommendations: Recommendation[] = level
    ? ALL_LEVELS.filter(candidate => candidate.chapter_id === level.chapter_id && candidate.id !== level.id)
        .slice(0, 4)
        .map(candidate => ({
          id: candidate.id,
          title: candidate.getTitle(language),
          type: t(`debrief.missionTypes.${candidate.mode}`, { defaultValue: candidate.mode }),
          difficulty: candidate.difficulty,
          skills: candidate.skills.slice(0, 3),
        }))
    : []
  const verificationApplicable = report?.scoreResult.breakdownMax.verification !== undefined
  const verificationPassed = verificationApplicable
    ? report!.scoreResult.breakdown.verification === report!.scoreResult.breakdownMax.verification
    : null
  const requiredObjectiveCount = level?.objectives.filter(objective => objective.required).length ?? 0
  const validatedRequiredObjectiveCount = report && level
    ? report.validationResults.filter(result => (
        result.completed
        && level.objectives.find(objective => objective.id === result.objectiveId)?.required
      )).length
    : 0
  const excludedCategoryList = report
    ? report.scoreResult.excludedCategories.map(scoreCategoryLabel).join(language === 'zh' ? '、' : ', ')
      || t('debrief.none')
    : t('debrief.none')
  const missionReport = report && level
    ? t('debrief.reportNarrative', {
        missionTitle,
        timeTaken,
        actionCount: report.attemptedActions.length,
        validatedCount: validatedRequiredObjectiveCount,
        requiredCount: requiredObjectiveCount,
        totalScore,
        excludedCategories: excludedCategoryList,
      })
    : ''

  if (!report || !level) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-4" style={{ backgroundColor: '#0A0E14' }}>
        <div className="max-w-[560px] text-center p-8 rounded-lg border" style={{ backgroundColor: '#0F1419', borderColor: '#1E2D3D' }}>
          <h1 className="font-jetbrains text-h1 text-[#E8EDF2]">{t('debrief.reportUnavailableTitle')}</h1>
          <p className="font-inter text-body text-[#8B9EB0] mt-3">{t('debrief.reportUnavailableDescription')}</p>
          <Link
            to={level && missionId ? `/terminal/${missionId}` : '/missions'}
            className="inline-flex mt-6 px-5 py-3 rounded-md font-jetbrains"
            style={{ backgroundColor: '#00FF88', color: '#0A0E14' }}
          >
            {level ? t('debrief.startMission') : t('nav.missions')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh]" style={{ backgroundColor: '#0A0E14' }}>
      {/* ── Debrief Header ── */}
      <div
        ref={headerRef}
        className="w-full"
        style={{ backgroundColor: '#0F1419', minHeight: '180px' }}
      >
        <div className="max-w-[960px] mx-auto px-space-4 py-space-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-space-4">
          {/* Mission Info */}
          <div className="flex items-start gap-space-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={headerInView ? { scale: 1 } : {}}
              transition={{
                duration: 0.5,
                ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
              }}
            >
              {completed ? (
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(0,255,136,0.15)' }}
                >
                  <Check size={24} style={{ color: '#00FF88' }} />
                </div>
              ) : (
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(255,71,87,0.15)' }}
                >
                  <X size={24} style={{ color: '#FF4757' }} />
                </div>
              )}
            </motion.div>
            <div>
              <motion.h1
                className="font-jetbrains text-h1 text-[#E8EDF2]"
                initial={{ opacity: 0 }}
                animate={headerInView ? { opacity: 1 } : {}}
                transition={{ delay: 0.2, duration: 0.4 }}
              >
                {missionTitle}
              </motion.h1>
              <motion.div
                className="flex items-center gap-space-2 mt-space-1 flex-wrap"
                initial={{ opacity: 0, y: 4 }}
                animate={headerInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.35, duration: 0.3 }}
              >
                <span
                  className="font-jetbrains text-badge uppercase px-space-2 py-[2px] rounded-radius-sm"
                  style={{
                    backgroundColor: 'rgba(0,229,255,0.1)',
                    color: '#00E5FF',
                  }}
                >
                  {missionType}
                </span>
                <span className="font-jetbrains text-body-sm text-[#788DA1]">{completedDate}</span>
                <span className="font-jetbrains text-body-sm text-[#788DA1] flex items-center gap-1">
                  <Clock size={12} />
                  {timeTaken}
                </span>
              </motion.div>
            </div>
          </div>

          {/* Score Display */}
          <motion.div
            className="flex flex-col items-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={headerInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.4, duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          >
            <AnimatedScore value={totalScore} color={grade.color} />
            <motion.div
              className="mt-space-2 font-jetbrains text-badge uppercase px-space-3 py-[4px] rounded-radius-full"
              style={{
                backgroundColor: `${grade.color}20`,
                color: grade.color,
                border: `1px solid ${grade.color}40`,
              }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={headerInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ delay: 0.8, duration: 0.4 }}
            >
              {grade.letter} — {t(grade.label)}
            </motion.div>
          </motion.div>

          {/* Action Buttons */}
          <motion.div
            className="flex items-center gap-space-3 flex-wrap"
            initial={{ opacity: 0 }}
            animate={headerInView ? { opacity: 1 } : {}}
            transition={{ delay: 0.6, duration: 0.3 }}
          >
            <Link
              to={`/terminal/${missionId || 'neonmall'}`}
              className="flex items-center gap-space-2 px-space-4 py-space-2 rounded-radius-sm font-jetbrains text-h4 transition-all duration-fast border"
              style={{
                borderColor: '#00E5FF',
                color: '#00E5FF',
                backgroundColor: 'transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0,229,255,0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <RotateCcw size={16} />
              {t('debrief.replay')}
            </Link>
            <Link
              to="/missions"
              className="flex items-center gap-space-2 px-space-4 py-space-2 rounded-radius-sm font-jetbrains text-h4 transition-all duration-fast"
              style={{
                backgroundColor: '#00FF88',
                color: '#0A0E14',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 0 20px rgba(0,255,136,0.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              {t('debrief.nextMission')}
              <ChevronRight size={16} />
            </Link>
            <div className="flex flex-col items-start gap-1">
              <button
                type="button"
                onClick={handleShare}
                className="flex items-center gap-space-2 px-space-4 py-space-2 rounded-radius-sm font-jetbrains text-h4 transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
                style={{
                  backgroundColor: '#1A2332',
                  color: '#8B9EB0',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#E8EDF2'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#8B9EB0'
                }}
              >
                <Share2 size={16} aria-hidden="true" />
                {t('debrief.share')}
              </button>
              <span
                role="status"
                aria-live="polite"
                className="min-h-[1rem] max-w-[240px] font-inter text-xs"
                style={{ color: shareStatus === 'error' ? '#FF4757' : '#00FF88' }}
              >
                {shareStatus === 'success'
                  ? t('debrief.shareSuccess')
                  : shareStatus === 'error' ? t('debrief.shareFailed') : ''}
              </span>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── Sections ── */}
      <div className="pt-space-8">
        <MissionReport
          report={missionReport}
          metadata={{
            commandsUsed: report.attemptedActions.length,
            hintsUsed: report.hintsUsed,
            redCommandsAvoided: report.redCommandsUsed.length === 0,
            verificationPassed,
          }}
        />

        <ScoreBreakdown categories={categories} totalScore={totalScore} />

        <PerformanceCard stats={performanceStats} />

        <ObjectivesReview objectives={objectives} />

        <CommandTimeline entries={timeline} />

        <WhatYouLearned skills={learnedSkills} missionId={level.id} />

        <WarningsSection warnings={warnings} />

        <RecommendedSteps recommendations={recommendations} />
      </div>
    </div>
  )
}
