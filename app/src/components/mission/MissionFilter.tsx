import { useState, useRef, useEffect, useId } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, ChevronDown, Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { skillDomains, riskColors } from '@/data/missions'

export type ModeFilter = 'all' | 'academy' | 'operation' | 'nightmare' | 'red-zone'
export type StatusFilter = 'all' | 'available' | 'in-progress' | 'completed'
export type SortOption = 'recommended' | 'difficulty' | 'newest' | 'az'

interface MissionFilterProps {
  modeFilter: ModeFilter
  setModeFilter: (mode: ModeFilter) => void
  difficultyFilter: number | null
  setDifficultyFilter: (diff: number | null) => void
  statusFilter: StatusFilter
  setStatusFilter: (status: StatusFilter) => void
  skillFilter: string[]
  setSkillFilter: (skills: string[]) => void
  riskFilter: string[]
  setRiskFilter: (risks: string[]) => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  sortOption: SortOption
  setSortOption: (sort: SortOption) => void
  activeFilterCount: number
}

const modeTabs: ModeFilter[] = ['all', 'academy', 'operation', 'nightmare', 'red-zone']

const statusTabs: StatusFilter[] = ['all', 'available', 'in-progress', 'completed']

const sortOptions: SortOption[] = ['recommended', 'difficulty', 'newest', 'az']

export default function MissionFilter({
  modeFilter,
  setModeFilter,
  difficultyFilter,
  setDifficultyFilter,
  statusFilter,
  setStatusFilter,
  skillFilter,
  setSkillFilter,
  riskFilter,
  setRiskFilter,
  searchQuery,
  setSearchQuery,
  sortOption,
  setSortOption,
  activeFilterCount,
}: MissionFilterProps) {
  const { t } = useTranslation()
  const [showSkillDropdown, setShowSkillDropdown] = useState(false)
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const skillRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)
  const searchId = useId()
  const skillMenuId = useId()
  const sortMenuId = useId()

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (skillRef.current && !skillRef.current.contains(e.target as Node)) {
        setShowSkillDropdown(false)
      }
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSortDropdown(false)
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowSkillDropdown(false)
        setShowSortDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  const toggleSkill = (skill: string) => {
    if (skillFilter.includes(skill)) {
      setSkillFilter(skillFilter.filter((s) => s !== skill))
    } else {
      setSkillFilter([...skillFilter, skill])
    }
  }

  const toggleRisk = (risk: string) => {
    if (riskFilter.includes(risk)) {
      setRiskFilter(riskFilter.filter((r) => r !== risk))
    } else {
      setRiskFilter([...riskFilter, risk])
    }
  }

  const clearAllFilters = () => {
    setModeFilter('all')
    setDifficultyFilter(null)
    setStatusFilter('all')
    setSkillFilter([])
    setRiskFilter([])
    setSearchQuery('')
    setSortOption('recommended')
  }

  const hasActiveFilters = activeFilterCount > 0

  return (
    <div
      className="z-elevated w-full border-b md:sticky md:top-[52px]"
      style={{
        backgroundColor: 'rgba(19, 27, 35, 0.9)',
        backdropFilter: 'blur(12px)',
        borderColor: '#1E2D3D',
      }}
    >
      <div className="max-w-[1200px] mx-auto px-space-4">
        {/* Main Filter Row */}
        <div className="flex min-h-14 flex-wrap items-center gap-space-3 py-2">
          {/* Mode Tabs */}
          <div className="flex flex-wrap items-center gap-1 rounded-radius-sm p-1" role="group" aria-label={t('missionBoard.filters.mode')} style={{ backgroundColor: '#1A2332' }}>
            {modeTabs.map((tab) => (
              <button
                type="button"
                key={tab}
                onClick={() => setModeFilter(tab)}
                aria-pressed={modeFilter === tab}
                className="relative min-h-11 whitespace-nowrap rounded-radius-sm px-3 font-jetbrains text-nav uppercase transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
                style={{
                  color: modeFilter === tab ? '#00E5FF' : '#8B9EB0',
                  backgroundColor: modeFilter === tab ? '#0F1419' : 'transparent',
                }}
              >
                {modeFilter === tab && (
                  <motion.div
                    layoutId="modeTabIndicator"
                    className="absolute inset-0 rounded-radius-sm"
                    style={{
                      backgroundColor: '#0F1419',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    }}
                    transition={{ duration: 0.2 }}
                  />
                )}
                <span className="relative z-10">{t(`missionBoard.filters.${tab === 'red-zone' ? 'redZone' : tab}`)}</span>
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="hidden h-6 w-px bg-[#1E2D3D] md:block" aria-hidden="true" />

          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t('missionBoard.filters.status')}>
            {statusTabs.map((tab) => (
              <button
                type="button"
                key={tab}
                onClick={() => setStatusFilter(tab)}
                aria-pressed={statusFilter === tab}
                className="min-h-11 whitespace-nowrap rounded-radius-sm px-3 font-jetbrains text-nav uppercase transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
                style={{
                  color: statusFilter === tab ? '#00E5FF' : '#8B9EB0',
                  backgroundColor: statusFilter === tab ? 'rgba(0,229,255,0.08)' : 'transparent',
                }}
              >
                {t(`missionBoard.filters.${tab === 'in-progress' ? 'inProgress' : tab}`)}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="hidden h-6 w-px bg-[#1E2D3D] md:block" aria-hidden="true" />

          {/* Difficulty Stars */}
          <div className="flex items-center" role="group" aria-label={t('missionBoard.filters.difficulty')}>
            {[1, 2, 3, 4, 5].map((level) => (
              <button
                type="button"
                key={level}
                onClick={() => setDifficultyFilter(difficultyFilter === level ? null : level)}
                aria-pressed={difficultyFilter === level}
                aria-label={t('missionBoard.filters.difficultyLevel', { level })}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-radius-sm transition-transform duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
              >
                <Star
                  size={18}
                  className={level <= (difficultyFilter || 0) ? 'text-[#FFD166]' : 'text-[#1E2D3D]'}
                  fill={level <= (difficultyFilter || 0) ? '#FFD166' : 'none'}
                />
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="hidden h-6 w-px bg-[#1E2D3D] md:block" aria-hidden="true" />

          {/* Skill Dropdown */}
          <div className="relative" ref={skillRef}>
            <button
              type="button"
              onClick={() => setShowSkillDropdown(!showSkillDropdown)}
              aria-expanded={showSkillDropdown}
              aria-controls={skillMenuId}
              className="flex min-h-11 items-center gap-1 whitespace-nowrap rounded-radius-sm px-3 font-jetbrains text-nav uppercase transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
              style={{
                color: skillFilter.length > 0 ? '#00E5FF' : '#8B9EB0',
                backgroundColor: skillFilter.length > 0 ? 'rgba(0,229,255,0.08)' : 'transparent',
              }}
            >
              {t('missionBoard.filters.skills')}
              {skillFilter.length > 0 && (
                <span className="ml-0.5 text-[10px] font-bold text-[#00E5FF]">({skillFilter.length})</span>
              )}
              <ChevronDown size={12} className={`transition-transform duration-fast ${showSkillDropdown ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showSkillDropdown && (
                <motion.div
                  id={skillMenuId}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 top-full z-floating mt-2 w-56 max-w-[calc(100vw-2rem)] overflow-hidden rounded-radius-md border"
                  style={{
                    backgroundColor: '#0F1419',
                    borderColor: '#1E2D3D',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  }}
                >
                  <div className="p-2 grid grid-cols-2 gap-1">
                    {skillDomains.map((skill) => (
                      <button
                        type="button"
                        key={skill.name}
                        onClick={() => toggleSkill(skill.name)}
                        aria-pressed={skillFilter.includes(skill.name)}
                        className="flex min-h-11 items-center gap-2 rounded-radius-sm px-2 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
                        style={{
                          backgroundColor: skillFilter.includes(skill.name) ? `${skill.color}15` : 'transparent',
                        }}
                      >
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: skill.color }}
                        />
                        <span
                          className="font-inter text-body-sm"
                          style={{
                            color: skillFilter.includes(skill.name) ? skill.color : '#8B9EB0',
                          }}
                        >
                          {skill.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Risk Filter Dots */}
          <div className="flex flex-wrap items-center" role="group" aria-label={t('missionBoard.filters.risk')}>
            {riskColors.map(({ level, color }) => (
              <button
                type="button"
                key={level}
                onClick={() => toggleRisk(String(level))}
                aria-pressed={riskFilter.includes(String(level))}
                aria-label={t('missionBoard.filters.riskLevel', { level })}
                className="group relative flex min-h-11 min-w-11 items-center justify-center rounded-radius-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
              >
                <div
                  className="rounded-full transition-all duration-fast"
                  style={{
                    width: riskFilter.includes(String(level)) ? '10px' : '8px',
                    height: riskFilter.includes(String(level)) ? '10px' : '8px',
                    backgroundColor: riskFilter.includes(String(level)) ? color : 'transparent',
                    border: `1.5px solid ${riskFilter.includes(String(level)) ? color : '#4A6072'}`,
                  }}
                />
                {/* Tooltip */}
                <span className="absolute -top-7 left-1/2 -translate-x-1/2 font-jetbrains text-xs uppercase text-[#8B9EB0] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {level}
                </span>
              </button>
            ))}
          </div>

          {/* Spacer */}
          <div className="hidden flex-1 lg:block" />

          {/* Search Input */}
          <div className="relative basis-full sm:basis-auto">
            <label htmlFor={searchId} className="sr-only">{t('missionBoard.filters.searchLabel')}</label>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4A6072]" />
            <input
              id={searchId}
              type="text"
              placeholder={t('missionBoard.filters.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 w-full rounded-radius-sm pl-9 pr-11 font-fira text-code-sm outline-none transition-all duration-fast sm:w-48 sm:focus:w-56"
              style={{
                backgroundColor: '#1A2332',
                border: '1px solid #1E2D3D',
                color: '#E8EDF2',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#00E5FF'
                e.currentTarget.style.boxShadow = '0 0 16px rgba(0,229,255,0.08)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#1E2D3D'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label={t('missionBoard.filters.clearSearch')}
                className="absolute right-0 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-radius-sm text-[#4A6072] hover:text-[#E8EDF2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Sort Dropdown */}
          <div className="relative" ref={sortRef}>
            <button
              type="button"
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              aria-expanded={showSortDropdown}
              aria-controls={sortMenuId}
              className="flex min-h-11 items-center gap-1 whitespace-nowrap rounded-radius-sm px-3 font-jetbrains text-nav transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
              style={{ color: '#8B9EB0' }}
            >
              {t('missionBoard.filters.sortBy')}
              <ChevronDown size={12} className={`transition-transform duration-fast ${showSortDropdown ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showSortDropdown && (
                <motion.div
                  id={sortMenuId}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full right-0 mt-2 w-40 rounded-radius-md border overflow-hidden z-floating"
                  style={{
                    backgroundColor: '#0F1419',
                    borderColor: '#1E2D3D',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  }}
                >
                  {sortOptions.map((opt) => (
                    <button
                      type="button"
                      key={opt}
                      onClick={() => { setSortOption(opt); setShowSortDropdown(false) }}
                      aria-pressed={sortOption === opt}
                      className="min-h-11 w-full px-3 text-left font-jetbrains text-body-sm transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00E5FF]"
                      style={{
                        color: sortOption === opt ? '#00E5FF' : '#8B9EB0',
                        backgroundColor: sortOption === opt ? 'rgba(0,229,255,0.08)' : 'transparent',
                      }}
                    >
                      {t(`missionBoard.filters.sort.${opt}`)}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Clear Filters */}
          <AnimatePresence>
            {hasActiveFilters && (
              <motion.button
                type="button"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                onClick={clearAllFilters}
                className="min-h-11 whitespace-nowrap rounded-radius-sm px-2 font-jetbrains text-body-sm text-[#4A6072] transition-colors duration-fast hover:text-[#E8EDF2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
              >
                <X size={12} className="inline mr-1" />
                {t('missionBoard.clearFilters')}
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Active Filter Pills */}
        <AnimatePresence>
          {hasActiveFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-wrap gap-1.5 pb-2"
            >
              {modeFilter !== 'all' && (
                <FilterPill
                  label={t('missionBoard.filters.activeMode', { value: t(`missionBoard.filters.${modeFilter === 'red-zone' ? 'redZone' : modeFilter}`) })}
                  color="#00E5FF"
                  onRemove={() => setModeFilter('all')}
                />
              )}
              {statusFilter !== 'all' && (
                <FilterPill
                  label={t('missionBoard.filters.activeStatus', { value: t(`missionBoard.filters.${statusFilter === 'in-progress' ? 'inProgress' : statusFilter}`) })}
                  color="#FFD166"
                  onRemove={() => setStatusFilter('all')}
                />
              )}
              {difficultyFilter !== null && (
                <FilterPill
                  label={t('missionBoard.filters.activeDifficulty', { value: difficultyFilter })}
                  color="#FFD166"
                  onRemove={() => setDifficultyFilter(null)}
                />
              )}
              {skillFilter.map((skill) => (
                <FilterPill
                  key={skill}
                  label={skill}
                  color={skillDomains.find((s) => s.name === skill)?.color || '#8B9EB0'}
                  onRemove={() => toggleSkill(skill)}
                />
              ))}
              {riskFilter.map((risk) => (
                <FilterPill
                  key={risk}
                  label={t('missionBoard.filters.activeRisk', { value: risk })}
                  color={riskColors.find(r => String(r.level) === risk)?.color || '#8B9EB0'}
                  onRemove={() => toggleRisk(risk)}
                />
              ))}
              {searchQuery && (
                <FilterPill
                  label={t('missionBoard.filters.activeSearch', { value: searchQuery })}
                  color="#E8EDF2"
                  onRemove={() => setSearchQuery('')}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function FilterPill({ label, color, onRemove }: { label: string; color: string; onRemove: () => void }) {
  const { t } = useTranslation()
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8, width: 0 }}
      transition={{ duration: 0.1 }}
      className="inline-flex min-h-11 items-center gap-1 rounded-full border py-0.5 pl-3 font-jetbrains text-body-sm"
      style={{
        color,
        borderColor: `${color}4D`,
        backgroundColor: `${color}1A`,
      }}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('common.removeFilter', { label })}
        className="ml-0.5 flex min-h-11 min-w-11 items-center justify-center rounded-full hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
      >
        <X size={10} />
      </button>
    </motion.span>
  )
}
