import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import MissionFilter from '@/components/mission/MissionFilter'
import type { ModeFilter, StatusFilter, SortOption } from '@/components/mission/MissionFilter'
import MissionGrid from '@/components/mission/MissionGrid'
import MissionCard from '@/components/mission/MissionCard'
import { useLocalizedMissions } from '@/hooks/useLocalizedData'

function MissionSkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto px-space-4 py-space-8 space-y-space-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse rounded-radius-md h-48" style={{ backgroundColor: '#0F1419', border: '1px solid #1E2D3D' }} />
        ))}
      </div>
      <div className="animate-pulse rounded-radius-md h-64" style={{ backgroundColor: '#0F1419', border: '1px solid #1E2D3D' }} />
    </div>
  )
}

export default function MissionBoard() {
  const { t } = useTranslation()
  const missions = useLocalizedMissions()
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
  const [difficultyFilter, setDifficultyFilter] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [skillFilter, setSkillFilter] = useState<string[]>([])
  const [riskFilter, setRiskFilter] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOption, setSortOption] = useState<SortOption>('recommended')
  const [isLoading] = useState(false)

  // Stats
  const totalMissions = missions.length
  const completedMissions = missions.filter((m) => m.status === 'completed').length
  const inProgressMissions = missions.filter((m) => m.status === 'in-progress').length

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (modeFilter !== 'all') count++
    if (statusFilter !== 'all') count++
    if (difficultyFilter !== null) count++
    count += skillFilter.length
    count += riskFilter.length
    if (searchQuery) count++
    return count
  }, [modeFilter, statusFilter, difficultyFilter, skillFilter, riskFilter, searchQuery])

  // Filter and sort missions
  const filteredMissions = useMemo(() => {
    let result = [...missions]

    // Mode filter
    if (modeFilter !== 'all') {
      result = result.filter((m) => m.mode === modeFilter)
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((m) => m.status === statusFilter)
    }

    // Difficulty filter (exact match)
    if (difficultyFilter !== null) {
      result = result.filter((m) => m.difficulty === difficultyFilter)
    }

    // Skill filter
    if (skillFilter.length > 0) {
      result = result.filter((m) => skillFilter.some((s) => m.skills.includes(s)))
    }

    // Risk filter
    if (riskFilter.length > 0) {
      result = result.filter((m) => riskFilter.includes(String(m.riskLevel)))
    }

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.summary.toLowerCase().includes(q) ||
          m.chapter.toLowerCase().includes(q) ||
          m.skills.some((s) => s.toLowerCase().includes(q))
      )
    }

    // Sort
    switch (sortOption) {
      case 'difficulty':
        result.sort((a, b) => a.difficulty - b.difficulty)
        break
      case 'newest':
        result.sort((a, b) => b.id.localeCompare(a.id))
        break
      case 'az':
        result.sort((a, b) => a.title.localeCompare(b.title))
        break
      case 'recommended':
      default:
        // Recommended: available first, then in-progress, then by difficulty
        result.sort((a, b) => {
          const statusOrder = { available: 0, 'in-progress': 1, completed: 2, locked: 3 }
          if (statusOrder[a.status] !== statusOrder[b.status]) {
            return statusOrder[a.status] - statusOrder[b.status]
          }
          return a.difficulty - b.difficulty
        })
        break
    }

    return result
  }, [missions, modeFilter, statusFilter, difficultyFilter, skillFilter, riskFilter, searchQuery, sortOption])

  // Section: Featured Missions (top 3 available missions)
  const featuredMissions = useMemo(() => {
    return missions
      .filter((m) => m.status === 'available' || m.status === 'in-progress')
      .slice(0, 3)
  }, [missions])

  // Section: In Progress
  const inProgress = useMemo(() => {
    return missions.filter((m) => m.status === 'in-progress')
  }, [missions])

  // Section: Recommended (2 missions - weakest skill + next story)
  const recommendedMissions = useMemo(() => {
    return missions
      .filter((m) => m.status === 'available')
      .slice(0, 2)
  }, [missions])

  // Header animation
  const headerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15 },
    },
  }

  const titleVariants = {
    hidden: { opacity: 0, x: -30 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
    },
  }

  const statVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        delay: i * 0.15,
        ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
      },
    }),
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
        <div className="max-w-[1200px] mx-auto px-space-4 py-space-8 md:py-space-10 flex flex-col md:flex-row md:items-center md:justify-between gap-space-4">
          {/* Title Block */}
          <div>
            <motion.h1
              variants={titleVariants}
              className="font-jetbrains text-h1 text-[#E8EDF2]"
            >
              {t('missionBoard.title')}
            </motion.h1>
            <motion.p
              variants={titleVariants}
              className="font-inter text-body text-[#8B9EB0] mt-1"
            >
              {t('missionBoard.subtitle')}
            </motion.p>
          </div>

          {/* Live Stats */}
          <div className="flex items-center gap-space-6">
            <motion.div variants={statVariants} custom={0} className="text-center">
              <motion.span
                className="font-jetbrains text-h2 text-[#00FF88] block"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0 }}
              >
                {totalMissions}
              </motion.span>
              <span className="font-jetbrains text-badge text-[#4A6072] uppercase tracking-wider">
                {t('missionBoard.stats.total')}
              </span>
            </motion.div>
            <motion.div variants={statVariants} custom={1} className="text-center">
              <motion.span
                className="font-jetbrains text-h2 text-[#00FF88] block"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.15 }}
              >
                {completedMissions}
              </motion.span>
              <span className="font-jetbrains text-badge text-[#4A6072] uppercase tracking-wider">
                {t('missionBoard.stats.completed')}
              </span>
            </motion.div>
            <motion.div variants={statVariants} custom={2} className="text-center">
              <motion.span
                className="font-jetbrains text-h2 text-[#00FF88] block"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.3 }}
              >
                {inProgressMissions}
              </motion.span>
              <span className="font-jetbrains text-badge text-[#4A6072] uppercase tracking-wider">
                {t('missionBoard.stats.inProgress')}
              </span>
            </motion.div>
          </div>
        </div>
      </motion.section>

      {/* Filter Bar */}
      <MissionFilter
        modeFilter={modeFilter}
        setModeFilter={setModeFilter}
        difficultyFilter={difficultyFilter}
        setDifficultyFilter={setDifficultyFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        skillFilter={skillFilter}
        setSkillFilter={setSkillFilter}
        riskFilter={riskFilter}
        setRiskFilter={setRiskFilter}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        sortOption={sortOption}
        setSortOption={setSortOption}
        activeFilterCount={activeFilterCount}
      />

      {/* Main Content */}
      {isLoading ? (
        <MissionSkeleton />
      ) : (
      <div className="max-w-[1200px] mx-auto px-space-4 py-space-8 space-y-space-10">
        {/* Featured Missions Section */}
        {featuredMissions.length > 0 && activeFilterCount === 0 && (
          <motion.section
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] as [number, number, number, number], delay: 0.2 }}
          >
            <div className="flex items-center justify-between mb-space-4">
              <h2 className="font-jetbrains text-h3 text-[#E8EDF2]">{t('missionBoard.featured')}</h2>
              <span className="font-jetbrains text-body-sm text-[#4A6072]">
                {t('home.recommended')}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {featuredMissions.map((mission, index) => (
                <MissionCard key={mission.id} mission={mission} index={index} featured />
              ))}
            </div>
          </motion.section>
        )}

        {/* In Progress Section */}
        {inProgress.length > 0 && activeFilterCount === 0 && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <div className="flex items-center justify-between mb-space-4">
              <div className="flex items-center gap-space-3">
                <h2 className="font-jetbrains text-h3 text-[#E8EDF2]">{t('missionBoard.inProgress')}</h2>
                <span
                  className="flex items-center justify-center w-6 h-6 rounded-full font-jetbrains text-badge text-[#0A0E14]"
                  style={{ backgroundColor: '#FFD166' }}
                >
                  {inProgress.length}
                </span>
              </div>
              <button className="flex items-center gap-1 font-jetbrains text-body-sm text-[#4A6072] hover:text-[#00E5FF] transition-colors duration-fast">
                {t('missionBoard.seeAll')} <ArrowRight size={14} />
              </button>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-space-2 snap-x snap-mandatory scrollbar-thin">
              {inProgress.map((mission, index) => (
                <div key={mission.id} className="snap-start flex-shrink-0" style={{ width: '280px' }}>
                  <MissionCard mission={mission} index={index} />
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* Recommended Section */}
        {recommendedMissions.length > 0 && activeFilterCount === 0 && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.4 }}
          >
            <div className="flex items-center justify-between mb-space-4">
              <h2 className="font-jetbrains text-h3 text-[#E8EDF2]">{t('missionBoard.recommended')}</h2>
              <span className="font-jetbrains text-body-sm text-[#4A6072]">
                {t('missionBoard.basedOnSkillGaps')}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {recommendedMissions.map((mission, index) => (
                <motion.div
                  key={mission.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.4,
                    delay: 0.4 + index * 0.15,
                    ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
                  }}
                >
                  <MissionCard mission={mission} index={index} />
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}

        {/* All Missions Section */}
        <section>
          <div className="flex items-center justify-between mb-space-4">
            <h2 className="font-jetbrains text-h3 text-[#E8EDF2]">
              {activeFilterCount > 0 ? t('missionBoard.filteredResults') : t('missionBoard.allMissions')}
            </h2>
            <span className="font-jetbrains text-body-sm text-[#4A6072]">
              {t('missionBoard.showing', { filtered: filteredMissions.length, total: missions.length })}
            </span>
          </div>
          {filteredMissions.length === 0 && activeFilterCount > 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center justify-center py-16 gap-3 text-center"
            >
              <Search size={48} className="opacity-30" style={{ color: 'var(--text-muted, #4A6072)' }} />
              <p className="font-jetbrains text-body text-[#8B9EB0]">{t('missionBoard.noMissionsMatch')}</p>
              <button
                onClick={() => {
                  setModeFilter('all')
                  setStatusFilter('all')
                  setDifficultyFilter(null)
                  setSkillFilter([])
                  setRiskFilter([])
                  setSearchQuery('')
                  setSortOption('recommended')
                }}
                className="flex items-center gap-1 font-jetbrains text-body-sm underline transition-colors"
                style={{ color: '#00E5FF' }}
              >
                <X size={14} />
                {t('missionBoard.clearFilters')}
              </button>
            </motion.div>
          ) : (
            <MissionGrid missions={filteredMissions} />
          )}
        </section>
      </div>
      )}
    </div>
  )
}
