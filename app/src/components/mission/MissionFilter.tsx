import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, ChevronDown, Star } from 'lucide-react'
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

const modeTabs: { value: ModeFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'academy', label: '学院' },
  { value: 'operation', label: '行动' },
  { value: 'nightmare', label: '噩梦' },
  { value: 'red-zone', label: '红区' },
]

const statusTabs: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'available', label: '可开始' },
  { value: 'in-progress', label: '进行中' },
  { value: 'completed', label: '已完成' },
]

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'recommended', label: '推荐' },
  { value: 'difficulty', label: '难度' },
  { value: 'newest', label: '最新' },
  { value: 'az', label: 'A-Z' },
]

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
  const [showSkillDropdown, setShowSkillDropdown] = useState(false)
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const skillRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (skillRef.current && !skillRef.current.contains(e.target as Node)) {
        setShowSkillDropdown(false)
      }
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSortDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
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
      className="sticky top-[52px] z-elevated w-full border-b"
      style={{
        backgroundColor: 'rgba(19, 27, 35, 0.9)',
        backdropFilter: 'blur(12px)',
        borderColor: '#1E2D3D',
      }}
    >
      <div className="max-w-[1200px] mx-auto px-space-4">
        {/* Main Filter Row */}
        <div className="flex items-center gap-space-3 h-14 overflow-x-auto">
          {/* Mode Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-radius-sm" style={{ backgroundColor: '#1A2332' }}>
            {modeTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setModeFilter(tab.value)}
                className="relative font-jetbrains text-nav uppercase px-3 py-1.5 rounded-radius-sm transition-colors duration-fast whitespace-nowrap"
                style={{
                  color: modeFilter === tab.value ? '#00E5FF' : '#8B9EB0',
                  backgroundColor: modeFilter === tab.value ? '#0F1419' : 'transparent',
                }}
              >
                {modeFilter === tab.value && (
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
                <span className="relative z-10">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-[#1E2D3D]" />

          {/* Status Tabs */}
          <div className="flex items-center gap-1">
            {statusTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className="font-jetbrains text-nav uppercase px-3 py-1.5 rounded-radius-sm transition-colors duration-fast whitespace-nowrap"
                style={{
                  color: statusFilter === tab.value ? '#00E5FF' : '#8B9EB0',
                  backgroundColor: statusFilter === tab.value ? 'rgba(0,229,255,0.08)' : 'transparent',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-[#1E2D3D]" />

          {/* Difficulty Stars */}
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((level) => (
              <button
                key={level}
                onClick={() => setDifficultyFilter(difficultyFilter === level ? null : level)}
                className="p-0.5 transition-transform duration-fast"
                title={`难度 ${level}`}
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
          <div className="w-px h-6 bg-[#1E2D3D]" />

          {/* Skill Dropdown */}
          <div className="relative" ref={skillRef}>
            <button
              onClick={() => setShowSkillDropdown(!showSkillDropdown)}
              className="flex items-center gap-1 font-jetbrains text-nav uppercase px-3 py-1.5 rounded-radius-sm transition-colors duration-fast whitespace-nowrap"
              style={{
                color: skillFilter.length > 0 ? '#00E5FF' : '#8B9EB0',
                backgroundColor: skillFilter.length > 0 ? 'rgba(0,229,255,0.08)' : 'transparent',
              }}
            >
              技能
              {skillFilter.length > 0 && (
                <span className="ml-0.5 text-[10px] font-bold text-[#00E5FF]">({skillFilter.length})</span>
              )}
              <ChevronDown size={12} className={`transition-transform duration-fast ${showSkillDropdown ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showSkillDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full left-0 mt-2 w-56 rounded-radius-md border overflow-hidden z-floating"
                  style={{
                    backgroundColor: '#0F1419',
                    borderColor: '#1E2D3D',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  }}
                >
                  <div className="p-2 grid grid-cols-2 gap-1">
                    {skillDomains.map((skill) => (
                      <button
                        key={skill.name}
                        onClick={() => toggleSkill(skill.name)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-radius-sm transition-colors duration-fast"
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
          <div className="flex items-center gap-1.5">
            {riskColors.map(({ level, color }) => (
              <button
                key={level}
                onClick={() => toggleRisk(String(level))}
                className="relative group"
                title={`风险: ${level}`}
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
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 font-jetbrains text-[9px] uppercase text-[#8B9EB0] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {level}
                </span>
              </button>
            ))}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Search Input */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4A6072]" />
            <input
              type="text"
              placeholder="搜索任务..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="font-fira text-code-sm rounded-radius-sm pl-9 pr-3 py-1.5 w-48 outline-none transition-all duration-fast focus:w-56"
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
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#4A6072] hover:text-[#E8EDF2]"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Sort Dropdown */}
          <div className="relative" ref={sortRef}>
            <button
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="flex items-center gap-1 font-jetbrains text-nav px-3 py-1.5 rounded-radius-sm transition-colors duration-fast whitespace-nowrap"
              style={{ color: '#8B9EB0' }}
            >
              排序
              <ChevronDown size={12} className={`transition-transform duration-fast ${showSortDropdown ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showSortDropdown && (
                <motion.div
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
                      key={opt.value}
                      onClick={() => { setSortOption(opt.value); setShowSortDropdown(false) }}
                      className="w-full text-left px-3 py-2 font-jetbrains text-body-sm transition-colors duration-fast"
                      style={{
                        color: sortOption === opt.value ? '#00E5FF' : '#8B9EB0',
                        backgroundColor: sortOption === opt.value ? 'rgba(0,229,255,0.08)' : 'transparent',
                      }}
                    >
                      {opt.label}
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
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                onClick={clearAllFilters}
                className="font-jetbrains text-body-sm text-[#4A6072] hover:text-[#E8EDF2] transition-colors duration-fast whitespace-nowrap"
              >
                <X size={12} className="inline mr-1" />
                清除
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
                  label={`模式: ${modeFilter}`}
                  color="#00E5FF"
                  onRemove={() => setModeFilter('all')}
                />
              )}
              {statusFilter !== 'all' && (
                <FilterPill
                  label={`状态: ${statusFilter}`}
                  color="#FFD166"
                  onRemove={() => setStatusFilter('all')}
                />
              )}
              {difficultyFilter !== null && (
                <FilterPill
                  label={`难度: ${difficultyFilter}`}
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
                  label={`风险: ${risk}`}
                  color={riskColors.find(r => String(r.level) === risk)?.color || '#8B9EB0'}
                  onRemove={() => toggleRisk(risk)}
                />
              ))}
              {searchQuery && (
                <FilterPill
                  label={`搜索: ${searchQuery}`}
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
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8, width: 0 }}
      transition={{ duration: 0.1 }}
      className="inline-flex items-center gap-1 font-jetbrains text-body-sm px-2 py-0.5 rounded-full border"
      style={{
        color,
        borderColor: `${color}4D`,
        backgroundColor: `${color}1A`,
      }}
    >
      {label}
      <button onClick={onRemove} className="hover:opacity-70 ml-0.5">
        <X size={10} />
      </button>
    </motion.span>
  )
}
