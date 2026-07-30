import { useId, useRef, useState, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ChevronDown, AlertTriangle, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

gsap.registerPlugin(ScrollTrigger)

export interface TimelineEntry {
  id: string
  timestamp: string
  command: string
  exitCode: number
  cwd: string
  mode: string
  risk: 'green' | 'blue' | 'yellow' | 'red' | 'purple' | 'black'
  warning?: string
  output?: string
}

interface CommandTimelineProps {
  entries: TimelineEntry[]
}

const riskColorMap: Record<string, string> = {
  green: '#00FF88',
  blue: '#00E5FF',
  yellow: '#FFD166',
  red: '#FF4757',
  purple: '#C77DFF',
  black: '#FF6B35',
}

type FilterType = 'all' | 'warnings' | 'red'

interface FilterButtonProps {
  label: string
  active: boolean
  onClick: () => void
}

function FilterButton({ label, active, onClick }: FilterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="min-h-11 font-jetbrains text-body-sm px-space-3 py-space-1 rounded-radius-sm transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
      style={{
        color: active ? '#00E5FF' : '#8B9EB0',
        borderBottom: active ? '2px solid #00E5FF' : '2px solid transparent',
        backgroundColor: active ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
      }}
    >
      {label}
    </button>
  )
}

interface TimelineItemProps {
  entry: TimelineEntry
  isEven: boolean
}

// Isolated GSAP-driven timeline item to avoid mixing with Framer Motion
function TimelineItem({ entry, isEven }: TimelineItemProps) {
  const { t } = useTranslation()
  const itemRef = useRef<HTMLDivElement>(null)
  const detailsId = useId()
  const [expanded, setExpanded] = useState(false)
  const shouldReduceMotion = useReducedMotion()
  const riskColor = riskColorMap[entry.risk] || '#00FF88'

  useEffect(() => {
    const item = itemRef.current
    if (!item) return

    if (shouldReduceMotion) {
      gsap.set(item, { x: 0, opacity: 1 })
      return
    }

    gsap.fromTo(
      item,
      { x: -20, opacity: 0 },
      {
        x: 0,
        opacity: 1,
        duration: 0.3,
        ease: 'expo.out',
        scrollTrigger: {
          trigger: item,
          start: 'top 92%',
          toggleActions: 'play none none none',
        },
      }
    )

    return () => {
      ScrollTrigger.getAll().forEach((st) => {
        if (st.trigger === item) st.kill()
      })
    }
  }, [shouldReduceMotion])

  const isRedCommand = entry.risk === 'red'
  const hasWarning = !!entry.warning

  return (
    <div
      ref={itemRef}
      role="listitem"
      className="relative border-b"
      style={{
        borderColor: '#1E2D3D',
        backgroundColor: isEven ? '#0A0E14' : '#0F1419',
        borderLeft: `3px solid ${riskColor}`,
      }}
    >
      <button
        type="button"
        className="w-full text-left transition-colors duration-fast hover:bg-[#1E2A3A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00E5FF]"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-controls={detailsId}
      >
        <div className="p-space-3 flex items-start gap-space-3">
          {/* Timestamp */}
          <div className="flex-shrink-0 w-[48px] pt-[2px]">
            <span className="font-fira text-code-sm text-[#788DA1] flex items-center gap-1">
              <Clock size={10} aria-hidden="true" />
              {entry.timestamp}
            </span>
          </div>

          {/* Command + details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-space-2 flex-wrap">
              <span className="font-fira text-code text-[#00FF88]" aria-hidden="true">$</span>
              <span
                className="font-fira text-code truncate"
                style={{ color: '#E6DCCF' }}
              >
                {entry.command}
              </span>
              <span className="sr-only">
                {t('debrief.timeline.riskLabel', { level: t(`debrief.timeline.risk.${entry.risk}`) })}
                {hasWarning ? `. ${t('debrief.timeline.hasWarning')}` : ''}
              </span>
              {isRedCommand && (
                <span
                  aria-hidden="true"
                  className="font-jetbrains text-badge uppercase px-space-1.5 py-[2px] rounded-radius-sm"
                  style={{
                    backgroundColor: 'rgba(255,71,87,0.15)',
                    color: '#FF4757',
                  }}
                >
                  {t('debrief.timeline.redCommand')}
                </span>
              )}
              {hasWarning && (
                <AlertTriangle size={14} style={{ color: '#FFD166' }} aria-hidden="true" />
              )}
            </div>

            {/* Compact info row */}
            <div className="flex flex-wrap items-center gap-x-space-3 gap-y-space-1 mt-space-1">
              <span
                className="font-fira text-code-sm"
                style={{
                  color: entry.exitCode === 0 ? '#00FF88' : '#FF4757',
                }}
              >
                {t('debrief.timeline.exitCodeValue', { code: entry.exitCode })}
              </span>
              <span className="font-fira text-code-sm text-[#788DA1]">{entry.cwd}</span>
              <span className="font-fira text-code-sm" style={{ color: '#00E5FF' }}>
                {entry.mode}
              </span>
            </div>
          </div>

          {/* Expand chevron */}
          <motion.div
            className="flex-shrink-0 pt-1"
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            aria-hidden="true"
          >
            <ChevronDown size={16} style={{ color: '#788DA1' }} />
          </motion.div>
        </div>
      </button>

      {/* Expanded details */}
      <motion.div
        id={detailsId}
        hidden={!expanded}
        aria-hidden={!expanded}
        className="px-space-3 pb-space-4 pt-space-1"
        initial={false}
        animate={expanded ? { opacity: 1, height: 'auto' } : { opacity: 0, height: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
      >
          <div
            className="p-space-3 rounded-radius-sm"
            style={{ backgroundColor: '#0C1117' }}
          >
            {/* Risk badge */}
            <div className="flex items-center gap-space-2 mb-space-2">
              <span
                className="w-2 h-2 rounded-full"
                aria-hidden="true"
                style={{
                  backgroundColor: riskColor,
                  boxShadow: `0 0 8px ${riskColor}40`,
                }}
              />
              <span className="font-jetbrains text-body-sm" style={{ color: riskColor }}>
                {t(`debrief.timeline.risk.${entry.risk}`)}
              </span>
            </div>

            {/* Warning */}
            {entry.warning && (
              <div
                className="flex items-start gap-space-2 mb-space-2 p-space-2 rounded-radius-sm"
                style={{ backgroundColor: 'rgba(255,209,102,0.08)' }}
              >
                <AlertTriangle size={14} style={{ color: '#FFD166', marginTop: '2px' }} aria-hidden="true" />
                <span className="font-inter text-body-sm" style={{ color: '#FFD166' }}>
                  {entry.warning}
                </span>
              </div>
            )}

            {/* Output preview */}
            {entry.output && (
              <div className="mt-space-2">
                <span className="font-jetbrains text-body-sm text-[#788DA1]">{t('debrief.timeline.output')}</span>
                <pre
                  className="mt-space-1 p-space-2 rounded-radius-sm font-fira text-code-sm overflow-x-auto"
                  tabIndex={0}
                  role="region"
                  aria-label={t('debrief.timeline.outputFor', { command: entry.command })}
                  style={{
                    backgroundColor: '#1A2332',
                    color: '#E6DCCF',
                    maxHeight: '160px',
                    overflowY: 'auto',
                  }}
                >
                  {entry.output}
                </pre>
              </div>
            )}
          </div>
      </motion.div>
    </div>
  )
}

export default function CommandTimeline({ entries }: CommandTimelineProps) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<FilterType>('all')
  const headerRef = useRef<HTMLDivElement>(null)

  const filteredEntries = entries.filter((e) => {
    if (filter === 'warnings') return !!e.warning
    if (filter === 'red') return e.risk === 'red'
    return true
  })

  return (
    <section className="max-w-[960px] mx-auto px-space-4 mt-space-8">
      <div ref={headerRef} className="mb-space-4">
        <h2 className="font-jetbrains text-h2 text-[#E8EDF2]">{t('debrief.commandTimeline')}</h2>
        <p className="font-inter text-body text-[#8B9EB0] mt-space-1">
          {t('debrief.timeline.subtitle')}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-space-2 mb-space-4" role="group" aria-label={t('debrief.timeline.filtersLabel')}>
        <FilterButton label={t('debrief.timeline.filters.all')} active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterButton label={t('debrief.timeline.filters.warnings')} active={filter === 'warnings'} onClick={() => setFilter('warnings')} />
        <FilterButton label={t('debrief.timeline.filters.red')} active={filter === 'red'} onClick={() => setFilter('red')} />
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {t('debrief.timeline.visibleCount', { count: filteredEntries.length })}
      </p>

      {/* Timeline */}
      <div
        className="rounded-radius-lg border overflow-hidden"
        role={filteredEntries.length > 0 ? 'list' : undefined}
        aria-label={filteredEntries.length > 0 ? t('debrief.timeline.listLabel') : undefined}
        style={{
          backgroundColor: '#0A0E14',
          borderColor: '#1E2D3D',
          maxHeight: '600px',
          overflowY: 'auto',
        }}
      >
        {filteredEntries.length === 0 ? (
          <div className="p-space-8 text-center" aria-live="polite">
            <span className="font-inter text-body text-[#788DA1]">{t('debrief.timeline.empty')}</span>
          </div>
        ) : (
          filteredEntries.map((entry, i) => (
            <TimelineItem key={entry.id} entry={entry} isEven={i % 2 === 0} />
          ))
        )}
      </div>
    </section>
  )
}
