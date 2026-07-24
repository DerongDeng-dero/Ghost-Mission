import { useRef, useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, useInView } from 'framer-motion'
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
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: circumference - progress }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number], delay: 0.3 }}
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

  useEffect(() => {
    if (!isInView) return
    let start = 0
    const duration = 1200
    const startTime = performance.now()

    function animate(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // ease-out-expo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      start = Math.round(eased * value)
      setDisplay(start)
      if (progress < 1) requestAnimationFrame(animate)
    }

    requestAnimationFrame(animate)
  }, [isInView, value])

  return (
    <div ref={ref} className="relative inline-flex items-center justify-center">
      <ScoreRing score={value} color={color} />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-jetbrains text-h1" style={{ color, fontSize: '32px' }}>
          {display}
        </span>
        <span className="font-jetbrains text-code-sm text-[#4A6072]">/100</span>
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
              style={{ color: obj.completed ? '#00FF88' : '#4A6072' }}
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

function WhatYouLearned({ skills }: { skills: LearnedSkill[] }) {
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
                <button className="font-jetbrains text-body-sm text-[#00E5FF] hover:underline">
                  {t('debrief.practice')} &rarr;
                </button>
                <button className="font-jetbrains text-body-sm text-[#8B9EB0] hover:text-[#00E5FF] transition-colors">
                  {t('debrief.viewInAtlas')}
                </button>
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
            {warnings.length} {t('debrief.issues')}
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
            className="flex-shrink-0 w-[280px] p-space-4 rounded-radius-md border cursor-pointer transition-all duration-fast"
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
                {Array.from({ length: 5 }).map((_, si) => (
                  <Zap
                    key={si}
                    size={10}
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
          </motion.div>
        ))}
      </div>
    </section>
  )
}

// ─── Demo Data ──────────────────────────────────────────────────────

const DEMO_CATEGORIES: ScoreCategory[] = [
  { name: 'Objectives Complete', maxPoints: 40, earned: 35, detail: 'Most primary objectives met' },
  { name: 'Safe Operations', maxPoints: 20, earned: 18, detail: 'Used safe commands throughout' },
  { name: 'Verification', maxPoints: 15, earned: 12, detail: 'Tests passed successfully' },
  { name: 'Command Efficiency', maxPoints: 10, earned: 8, detail: 'Minimal unnecessary commands' },
  { name: 'Keyboard Mastery', maxPoints: 5, earned: 5, detail: 'Used shortcuts effectively' },
  { name: 'No Hints Bonus', maxPoints: 5, earned: 5, detail: 'Completed without hints' },
  { name: 'Debrief Quality', maxPoints: 5, earned: 4, detail: 'Thorough review completed' },
]

const DEMO_TIMELINE: TimelineEntry[] = [
  {
    id: '1',
    timestamp: '00:14',
    command: 'ls -la /srv/neonmall',
    exitCode: 0,
    cwd: '/srv/neonmall',
    mode: 'shell',
    risk: 'green',
    praise: 'Good first step \u2014 scoped the directory before diving in',
    output: 'total 48\ndrwxr-xr-x 5 root root 4096 Jan 15 08:30 .\ndrwxr-xr-x 12 root root 4096 Jan 15 08:00 ..\n-rw-r--r-- 1 root root  982 Jan 15 08:30 package.json\n-rw-r--r--r-- 1 root root  15K Jan 15 08:30 app.log',
  },
  {
    id: '2',
    timestamp: '00:42',
    command: 'cat app.log',
    exitCode: 0,
    cwd: '/srv/neonmall',
    mode: 'shell',
    risk: 'green',
    warning: 'Large file \u2014 consider using less or grep for files larger than 1KB',
    output: '[2024-01-15T08:25:01Z] INFO: Server starting on port 3000...',
  },
  {
    id: '3',
    timestamp: '01:23',
    command: 'grep "ERROR" app.log',
    exitCode: 0,
    cwd: '/srv/neonmall',
    mode: 'shell',
    risk: 'green',
    praise: 'Switched to grep \u2014 efficient way to find errors in logs',
    output: '[2024-01-15T08:27:42Z] ERROR: Cannot find module \'express\'\n[2024-01-15T08:28:10Z] ERROR: start script failed with code 1',
  },
  {
    id: '4',
    timestamp: '01:45',
    command: 'less app.log',
    exitCode: 0,
    cwd: '/srv/neonmall',
    mode: 'less',
    risk: 'purple',
    praise: 'Correctly used less to browse the full log file',
  },
  {
    id: '5',
    timestamp: '02:10',
    command: 'cat package.json | grep "start"',
    exitCode: 0,
    cwd: '/srv/neonmall',
    mode: 'shell',
    risk: 'green',
    output: '    "start": "node srver.js",',
  },
  {
    id: '6',
    timestamp: '02:35',
    command: "sed -i 's/srver.js/server.js/' package.json",
    exitCode: 0,
    cwd: '/srv/neonmall',
    mode: 'shell',
    risk: 'yellow',
    output: '',
  },
  {
    id: '7',
    timestamp: '03:01',
    command: 'npm test',
    exitCode: 0,
    cwd: '/srv/neonmall',
    mode: 'shell',
    risk: 'green',
    praise: 'Ran verification tests \u2014 excellent practice',
    output: '\u2713 all tests passed (3/3)',
  },
  {
    id: '8',
    timestamp: '03:45',
    command: 'git add -A && git commit -m "fix: correct start script path"',
    exitCode: 0,
    cwd: '/srv/neonmall',
    mode: 'shell',
    risk: 'green',
    praise: 'Clean commit with descriptive message',
    output: '[main 7a3f2c1] fix: correct start script path\n 1 file changed, 1 insertion(1), 1 deletion(-)',
  },
  {
    id: '9',
    timestamp: '04:02',
    command: 'rm -rf node_modules',
    exitCode: 0,
    cwd: '/srv/neonmall',
    mode: 'shell',
    risk: 'red',
    warning: 'Destructive command \u2014 ensure backups exist before removal',
  },
  {
    id: '10',
    timestamp: '04:30',
    command: 'npm install',
    exitCode: 0,
    cwd: '/srv/neonmall',
    mode: 'shell',
    risk: 'yellow',
    output: 'added 142 packages in 2.3s',
  },
]

const DEMO_OBJECTIVES: ObjectiveReview[] = [
  {
    id: '1',
    description: 'Find the error in the logs',
    completed: true,
    evidence: 'grep "ERROR" app.log',
    points: 15,
  },
  {
    id: '2',
    description: 'Fix package.json start script',
    completed: true,
    evidence: 'File modified, tests passed',
    points: 10,
  },
  {
    id: '3',
    description: 'Run verification tests',
    completed: true,
    evidence: 'npm test \u2713',
    points: 10,
  },
  {
    id: '4',
    description: 'Submit a clean Git commit',
    completed: true,
    evidence: 'git commit -m "fix: correct start script path"',
    points: 5,
  },
  {
    id: '5',
    description: 'Avoid using cat on large files',
    completed: false,
    evidence: 'cat app.log (50MB file)',
    points: 0,
  },
]

const DEMO_SKILLS: LearnedSkill[] = [
  { command: 'less', description: 'You used this for the first time to search log files efficiently.' },
  { command: 'sed -i', description: 'In-place file editing \u2014 a powerful pattern you applied correctly.' },
]

const DEMO_WARNINGS: Warning[] = [
  {
    message: "You used 'cat' on a 50MB log file.",
    suggestion: "'less' or 'grep' would be more efficient for large files.",
  },
  {
    message: "You used 'rm -rf node_modules' without checking git status first.",
    suggestion: "Always verify your changes are committed before destructive operations.",
  },
]

const DEMO_RECOMMENDATIONS: Recommendation[] = [
  {
    id: 'r1',
    title: 'Log Analysis Drill',
    type: 'skill gap',
    difficulty: 2,
    skills: ['grep', 'less', 'journalctl'],
  },
  {
    id: 'r2',
    title: 'NeonMall: Part II',
    type: 'next story',
    difficulty: 3,
    skills: ['npm', 'git', 'sed'],
  },
  {
    id: 'r3',
    title: 'Package Recovery',
    type: 'challenge',
    difficulty: 4,
    skills: ['Docker', 'npm'],
  },
  {
    id: 'r4',
    title: 'Safe File Handling',
    type: 'review',
    difficulty: 1,
    skills: ['Filesystem'],
  },
]

// ─── Main Debrief Page ──────────────────────────────────────────────

export default function Debrief() {
  const { t } = useTranslation()
  const { missionId } = useParams<{ missionId: string }>()
  const headerRef = useRef<HTMLDivElement>(null)
  const headerInView = useInView(headerRef, { once: true })

  // Demo values (in real app, derive from mission state)
  const missionTitle = missionId === 'midnight-pager' ? 'Midnight Pager' : 'NeonMall Restoration'
  const completed = true
  const totalScore = 87
  const timeTaken = '08:14'
  const completedDate = '2024-01-15 08:42 UTC'
  const missionType = t('debrief.missionType.operation')
  const grade = getGrade(totalScore)

  const handleShare = () => {
    const text = `${t('app.title')} \u2014 ${t('debrief.title')}\n${t('profile.tableHeaders.mission')}: ${missionTitle}\n${t('profile.tableHeaders.score')}: ${totalScore}/100 (${t(grade.label)})\n${t('terminal.hud.timer')}: ${timeTaken}\n${t('profile.tableHeaders.status')}: ${completed ? '\u2705 ' + t('profile.pass') : '\u274c ' + t('profile.fail')}\n`
    navigator.clipboard.writeText(text).catch(() => {})
  }

  const performanceStats = useMemo(
    () => [
      { label: t('terminal.hud.timer'), value: timeTaken, icon: Clock, color: '#00E5FF' },
      { label: t('debrief.metadata.commandsUsed'), value: '10', icon: Terminal, color: '#00FF88' },
      { label: t('debrief.stats.uniqueCommands'), value: '6', icon: Zap, color: '#FFD166' },
      { label: t('debrief.stats.errorsMade'), value: '2', icon: AlertTriangle, color: '#FF4757' },
      { label: t('debrief.metadata.hintsUsed'), value: '0', icon: Eye, color: '#C77DFF' },
      { label: t('debrief.stats.safeOps'), value: '7/10', icon: ShieldCheck, color: '#00FF88' },
    ],
    [t, timeTaken]
  )

  const missionReport = `You restored the NeonMall service in ${timeTaken}. You correctly used less to search for ERROR in the logs and exited with q. You fixed the package.json start script and ran npm test to verify. Your Git commit was clean.

Areas for improvement: You used cat on the log file once before switching to less. Consider using less first for files larger than 1KB.

Recommended next: Practice journalctl -u for service log filtering.`

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
                <span className="font-jetbrains text-body-sm text-[#4A6072]">{completedDate}</span>
                <span className="font-jetbrains text-body-sm text-[#4A6072] flex items-center gap-1">
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
              {grade.letter} \u2014 {t(grade.label)}
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
            <button
              onClick={handleShare}
              className="flex items-center gap-space-2 px-space-4 py-space-2 rounded-radius-sm font-jetbrains text-h4 transition-all duration-fast"
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
              <Share2 size={16} />
              {t('debrief.share')}
            </button>
          </motion.div>
        </div>
      </div>

      {/* ── Sections ── */}
      <div className="pt-space-8">
        <MissionReport
          report={missionReport}
          metadata={{
            commandsUsed: 10,
            hintsUsed: 0,
            redCommandsAvoided: false,
            verificationPassed: true,
          }}
        />

        <ScoreBreakdown categories={DEMO_CATEGORIES} totalScore={totalScore} />

        <PerformanceCard stats={performanceStats} />

        <ObjectivesReview objectives={DEMO_OBJECTIVES} />

        <CommandTimeline entries={DEMO_TIMELINE} />

        <WhatYouLearned skills={DEMO_SKILLS} />

        <WarningsSection warnings={DEMO_WARNINGS} />

        <RecommendedSteps recommendations={DEMO_RECOMMENDATIONS} />
      </div>
    </div>
  )
}
