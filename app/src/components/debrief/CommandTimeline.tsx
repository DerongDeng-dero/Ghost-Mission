import { useRef, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ChevronDown, AlertTriangle, Check, Clock } from 'lucide-react'

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
  praise?: string
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

const riskLabelMap: Record<string, string> = {
  green: 'Safe',
  blue: 'Diagnostic',
  yellow: 'Caution',
  red: 'DESTRUCTIVE',
  purple: 'Interactive',
  black: 'Restricted',
}

type FilterType = 'all' | 'warnings' | 'red' | 'praised'

interface FilterButtonProps {
  label: string
  active: boolean
  onClick: () => void
}

function FilterButton({ label, active, onClick }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      className="font-jetbrains text-body-sm px-space-3 py-space-1 rounded-radius-sm transition-all duration-fast"
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
  index: number
  isEven: boolean
}

// Isolated GSAP-driven timeline item to avoid mixing with Framer Motion
function TimelineItem({ entry, isEven }: TimelineItemProps) {
  const itemRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const riskColor = riskColorMap[entry.risk] || '#00FF88'

  useEffect(() => {
    const item = itemRef.current
    if (!item) return

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
  }, [])

  const isRedCommand = entry.risk === 'red'
  const hasWarning = !!entry.warning
  const hasPraise = !!entry.praise

  return (
    <div
      ref={itemRef}
      className="relative border-b cursor-pointer transition-colors duration-fast hover:bg-[#1E2A3A]"
      style={{
        borderColor: '#1E2D3D',
        backgroundColor: isEven ? '#0A0E14' : '#0F1419',
        borderLeft: `3px solid ${riskColor}`,
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="p-space-3 flex items-start gap-space-3">
        {/* Timestamp */}
        <div className="flex-shrink-0 w-[48px] pt-[2px]">
          <span className="font-fira text-code-sm text-[#4A6072] flex items-center gap-1">
            <Clock size={10} />
            {entry.timestamp}
          </span>
        </div>

        {/* Command + details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-space-2 flex-wrap">
            <span className="font-fira text-code text-[#00FF88]">$</span>
            <span
              className="font-fira text-code truncate"
              style={{
                color: hasPraise ? '#00FF88' : '#E6DCCF',
              }}
            >
              {entry.command}
            </span>
            {isRedCommand && (
              <span
                className="font-jetbrains text-badge uppercase px-space-1.5 py-[2px] rounded-radius-sm"
                style={{
                  backgroundColor: 'rgba(255,71,87,0.15)',
                  color: '#FF4757',
                }}
              >
                Red Command
              </span>
            )}
            {hasWarning && (
              <AlertTriangle size={14} style={{ color: '#FFD166' }} />
            )}
            {hasPraise && (
              <Check size={14} style={{ color: '#00FF88' }} />
            )}
          </div>

          {/* Compact info row */}
          <div className="flex items-center gap-space-3 mt-space-1">
            <span
              className="font-fira text-code-sm"
              style={{
                color: entry.exitCode === 0 ? '#00FF88' : '#FF4757',
              }}
            >
              exit:{entry.exitCode}
            </span>
            <span className="font-fira text-code-sm text-[#4A6072]">{entry.cwd}</span>
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
        >
          <ChevronDown size={16} style={{ color: '#4A6072' }} />
        </motion.div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <motion.div
          className="px-space-3 pb-space-4 pt-space-1"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
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
                style={{
                  backgroundColor: riskColor,
                  boxShadow: `0 0 8px ${riskColor}40`,
                }}
              />
              <span className="font-jetbrains text-body-sm" style={{ color: riskColor }}>
                {riskLabelMap[entry.risk]}
              </span>
            </div>

            {/* Warning */}
            {entry.warning && (
              <div
                className="flex items-start gap-space-2 mb-space-2 p-space-2 rounded-radius-sm"
                style={{ backgroundColor: 'rgba(255,209,102,0.08)' }}
              >
                <AlertTriangle size={14} style={{ color: '#FFD166', marginTop: '2px' }} />
                <span className="font-inter text-body-sm" style={{ color: '#FFD166' }}>
                  {entry.warning}
                </span>
              </div>
            )}

            {/* Praise */}
            {entry.praise && (
              <div
                className="flex items-start gap-space-2 mb-space-2 p-space-2 rounded-radius-sm"
                style={{ backgroundColor: 'rgba(0,255,136,0.08)' }}
              >
                <Check size={14} style={{ color: '#00FF88', marginTop: '2px' }} />
                <span className="font-inter text-body-sm" style={{ color: '#00FF88' }}>
                  {entry.praise}
                </span>
              </div>
            )}

            {/* Output preview */}
            {entry.output && (
              <div className="mt-space-2">
                <span className="font-jetbrains text-body-sm text-[#4A6072]">Output:</span>
                <pre
                  className="mt-space-1 p-space-2 rounded-radius-sm font-fira text-code-sm overflow-x-auto"
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
      )}
    </div>
  )
}

export default function CommandTimeline({ entries }: CommandTimelineProps) {
  const [filter, setFilter] = useState<FilterType>('all')
  const headerRef = useRef<HTMLDivElement>(null)

  const filteredEntries = entries.filter((e) => {
    if (filter === 'warnings') return !!e.warning
    if (filter === 'red') return e.risk === 'red'
    if (filter === 'praised') return !!e.praise
    return true
  })

  return (
    <section className="max-w-[960px] mx-auto px-space-4 mt-space-8">
      <div ref={headerRef} className="mb-space-4">
        <h2 className="font-jetbrains text-h2 text-[#E8EDF2]">Command History</h2>
        <p className="font-inter text-body text-[#8B9EB0] mt-space-1">
          Every command you ran, in order
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-space-2 mb-space-4">
        <FilterButton label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterButton label="Warnings" active={filter === 'warnings'} onClick={() => setFilter('warnings')} />
        <FilterButton label="Red Commands" active={filter === 'red'} onClick={() => setFilter('red')} />
        <FilterButton label="Praised" active={filter === 'praised'} onClick={() => setFilter('praised')} />
      </div>

      {/* Timeline */}
      <div
        className="rounded-radius-lg border overflow-hidden"
        style={{
          backgroundColor: '#0A0E14',
          borderColor: '#1E2D3D',
          maxHeight: '600px',
          overflowY: 'auto',
        }}
      >
        {filteredEntries.length === 0 ? (
          <div className="p-space-8 text-center">
            <span className="font-inter text-body text-[#4A6072]">No entries match this filter</span>
          </div>
        ) : (
          filteredEntries.map((entry, i) => (
            <TimelineItem key={entry.id} entry={entry} index={i} isEven={i % 2 === 0} />
          ))
        )}
      </div>
    </section>
  )
}
