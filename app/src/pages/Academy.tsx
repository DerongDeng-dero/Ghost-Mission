import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, Trophy, Clock, Target, Zap, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import ChapterCard from '@/components/academy/ChapterCard'
import SkillTree from '@/components/academy/SkillTree'
import TrainingCard from '@/components/academy/TrainingCard'
import EnemyGallery from '@/components/academy/EnemyGallery'
import { enemies } from '@/data/academy'
import { useLocalizedChapters } from '@/hooks/useLocalizedData'
import { useGameStore } from '@/store/gameStore'
import { PROGRESS_CATALOG } from '@/data/progressCatalog'
import { deriveProgressMetrics } from '@/lib/progressMetrics'
import { calculateTotalXP, resolveAchievements } from '@/data/achievements'

export default function Academy() {
  const { t } = useTranslation()
  const chapters = useLocalizedChapters()
  const missionProgress = useGameStore((state) => state.missionProgress)
  const progressMilestones = useGameStore((state) => state.progressMilestones)
  const [activeChapter, setActiveChapter] = useState(1)
  const chapter = chapters.find((c) => c.id === activeChapter) || chapters[0]

  // Stats
  const totalDrills = useMemo(() => chapters.reduce((acc, c) => acc + c.totalDrills, 0), [chapters])
  const completedDrills = useMemo(() => chapters.reduce((acc, c) => acc + c.completedDrills, 0), [chapters])
  const totalXP = useMemo(() => {
    const metrics = deriveProgressMetrics(PROGRESS_CATALOG, missionProgress, undefined, progressMilestones)
    return calculateTotalXP(metrics.missionsCompleted, resolveAchievements(metrics))
  }, [missionProgress, progressMilestones])


  // Scroll chapter tabs
  const scrollTabs = (dir: 'left' | 'right') => {
    const container = document.getElementById('chapter-tabs-container')
    if (container) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      container.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: reduceMotion ? 'auto' : 'smooth' })
    }
  }

  // Header animation
  const headerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.12 },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
    },
  }

  return (
    <div className="min-h-[100dvh]" style={{ backgroundColor: '#0A0E14' }}>
      {/* Page Header */}
      <motion.section
        variants={headerVariants}
        initial="hidden"
        animate="visible"
        className="w-full"
        style={{ backgroundColor: '#0F1419' }}
      >
        <div className="max-w-[1200px] mx-auto px-space-4 py-space-6">
          {/* Title + XP Row */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-space-4 mb-space-6">
            <motion.div variants={itemVariants} className="flex items-center gap-space-3">
              <BookOpen size={32} className="text-[#00E5FF]" />
              <div>
                <h1 className="font-jetbrains text-h1 text-[#E8EDF2]">{t('academy.title')}</h1>
                <p className="font-inter text-body text-[#8B9EB0] mt-0.5">
                  {t('academy.subtitle')}
                </p>
              </div>
            </motion.div>

            {/* XP Summary */}
            <motion.div
              variants={itemVariants}
              className="flex items-center gap-space-4"
            >
              <div className="flex items-center gap-space-2 px-space-4 py-space-2 rounded-radius-md border"
                style={{ borderColor: '#1E2D3D', backgroundColor: '#0A0E14' }}
              >
                <Trophy size={16} className="text-[#00FF88]" />
                <div>
                  <span className="font-jetbrains text-h4 text-[#00FF88]" style={{ fontSize: '1rem' }}>
                    {totalXP}
                  </span>
                  <span className="font-jetbrains text-body-sm text-[#788DA1] ml-1">{t('academy.xp')}</span>
                </div>
              </div>
              <div className="flex items-center gap-space-2 px-space-4 py-space-2 rounded-radius-md border"
                style={{ borderColor: '#1E2D3D', backgroundColor: '#0A0E14' }}
              >
                <Target size={16} className="text-[#00E5FF]" />
                <div>
                  <span className="font-jetbrains text-code text-[#E8EDF2]">
                    {completedDrills}/{totalDrills}
                  </span>
                  <span className="font-jetbrains text-body-sm text-[#788DA1] ml-1">{t('academy.drills')}</span>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Chapter Navigation Tabs */}
          <motion.div variants={itemVariants} className="relative">
            <button
              type="button"
              onClick={() => scrollTabs('left')}
              aria-label={t('academy.scrollChaptersLeft')}
              className="absolute left-0 top-1/2 z-10 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
              style={{ backgroundColor: 'rgba(10,14,20,0.9)', border: '1px solid #1E2D3D' }}
            >
              <ChevronLeft size={14} aria-hidden="true" className="text-[#8B9EB0]" />
            </button>

            <div
              id="chapter-tabs-container"
              tabIndex={0}
              aria-label={t('academy.chapterNavigation')}
              className="flex gap-1 overflow-x-auto px-space-8 py-1 scrollbar-none"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {chapters.map((ch) => (
                <ChapterCard
                  key={ch.id}
                  chapter={ch}
                  isActive={ch.id === activeChapter}
                  onClick={() => setActiveChapter(ch.id)}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => scrollTabs('right')}
              aria-label={t('academy.scrollChaptersRight')}
              className="absolute right-0 top-1/2 z-10 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
              style={{ backgroundColor: 'rgba(10,14,20,0.9)', border: '1px solid #1E2D3D' }}
            >
              <ChevronRight size={14} aria-hidden="true" className="text-[#8B9EB0]" />
            </button>
          </motion.div>
        </div>
      </motion.section>

      {/* Main Content */}
      <div className="max-w-[1200px] mx-auto px-space-4 py-space-8 space-y-space-10">
        {/* Skill Tree Visualization */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="rounded-radius-lg border p-space-6"
          style={{ backgroundColor: '#0F1419', borderColor: '#1E2D3D' }}
        >
          <div className="flex items-center justify-between mb-space-2">
            <h2 className="font-jetbrains text-h3 text-[#E8EDF2]">
              {t('academy.chapter', { number: chapter.id, title: chapter.title })}
            </h2>
            <span
              className="font-jetbrains text-badge uppercase px-3 py-1 rounded-full border"
              style={{
                color: chapter.domainColor,
                borderColor: `${chapter.domainColor}40`,
                backgroundColor: `${chapter.domainColor}10`,
              }}
            >
              {chapter.domain}
            </span>
          </div>
          <p className="font-inter text-body text-[#8B9EB0] mb-space-4">{chapter.description}</p>
          <SkillTree chapter={chapter} />
        </motion.section>

        {/* Drills Grid */}
        <section>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeChapter}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center justify-between mb-space-4">
                <div>
                  <h2 className="font-jetbrains text-h3 text-[#E8EDF2]">
                    {t('academy.trainingDrills')}
                  </h2>
                  <p className="font-inter text-body-sm text-[#8B9EB0] mt-0.5">
                    {t('academy.drillsCompletedInChapter', { completed: chapter.completedDrills, total: chapter.totalDrills })}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {chapter.drills.map((drill, index) => (
                  <TrainingCard key={drill.id} drill={drill} index={index} />
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </section>

        {/* Progress Overview */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="rounded-radius-lg border p-space-6"
          style={{ backgroundColor: '#0F1419', borderColor: '#1E2D3D' }}
        >
          <h2 className="font-jetbrains text-h3 text-[#E8EDF2] mb-space-4">{t('academy.progress')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={<Target size={18} />}
              label={t('academy.drillsCompleted')}
              value={`${completedDrills}/${totalDrills}`}
              color="#00FF88"
            />
            <StatCard
              icon={<Trophy size={18} />}
              label={t('academy.totalXP')}
              value={`${totalXP}`}
              color="#00E5FF"
            />
            <StatCard
              icon={<Zap size={18} />}
              label={t('academy.chaptersDone')}
              value={`${chapters.filter((c) => c.completedDrills === c.totalDrills).length}/${chapters.length}`}
              color="#FFD166"
            />
            <StatCard
              icon={<Clock size={18} />}
              label={t('academy.trainingTime')}
              value={t('academy.notTracked')}
              color="#C77DFF"
            />
          </div>

          {/* Chapter Progress Bars */}
          <div className="mt-space-6 space-y-space-3">
            {chapters.map((ch) => {
              const progress = ch.totalDrills > 0 ? (ch.completedDrills / ch.totalDrills) * 100 : 0
              return (
                <div key={ch.id} className="flex items-center gap-space-3">
                  <span className="font-fira text-code-sm text-[#788DA1] w-12 flex-shrink-0">
                    {ch.number}
                  </span>
                  <div
                    className="flex-1 h-1.5 bg-[#1A2332] rounded-full overflow-hidden"
                    role="progressbar"
                    aria-label={t('academy.chapterBarLabel', { number: ch.number })}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress)}
                  >
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{
                        duration: 0.8,
                        delay: ch.id * 0.03,
                        ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
                      }}
                      className="h-full rounded-full"
                      style={{
                        backgroundColor: progress === 100 ? '#00FF88' : ch.id === activeChapter ? '#00E5FF' : '#788DA1',
                      }}
                    />
                  </div>
                  <span
                    className="font-fira text-code-sm w-10 text-right flex-shrink-0"
                    style={{ color: progress === 100 ? '#00FF88' : '#788DA1' }}
                  >
                    {Math.round(progress)}%
                  </span>
                </div>
              )
            })}
          </div>
        </motion.section>

        {/* Enemy Gallery */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.6 }}
        >
          <EnemyGallery enemies={enemies} />
        </motion.section>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
}) {
  return (
    <div
      className="flex items-center gap-space-3 p-space-4 rounded-radius-md border"
      style={{ backgroundColor: '#0A0E14', borderColor: '#1E2D3D' }}
    >
      <div
        className="w-10 h-10 rounded-radius-sm flex items-center justify-center flex-shrink-0"
        style={{ color, backgroundColor: `${color}15` }}
      >
        {icon}
      </div>
      <div>
        <span className="font-jetbrains text-h4 block" style={{ color, fontSize: '1.125rem' }}>
          {value}
        </span>
        <span className="font-jetbrains text-body-sm text-[#788DA1]">{label}</span>
      </div>
    </div>
  )
}
