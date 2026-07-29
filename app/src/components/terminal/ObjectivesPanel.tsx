import type { Objective } from '@/engine/levels'
import { motion, AnimatePresence } from 'framer-motion'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface ObjectivesPanelProps {
  objectives: Objective[]
  completedIds: Set<string>
  progress: number
  isCollapsed: boolean
  onToggleCollapse: () => void
}

export default function ObjectivesPanel({ objectives, completedIds, progress, isCollapsed, onToggleCollapse }: ObjectivesPanelProps) {
  const { t, i18n } = useTranslation()
  const language: 'en' | 'zh' = i18n.resolvedLanguage?.startsWith('zh') ? 'zh' : 'en'
  const requiredObjectives = objectives.filter(objective => objective.required)
  const completedRequiredCount = requiredObjectives.filter(objective => completedIds.has(objective.id)).length

  if (isCollapsed) {
    return (
      <div
        className="flex flex-col items-center py-4 gap-4 border-r"
        style={{ width: 40, backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}
      >
        <button
          onClick={onToggleCollapse}
          className="text-[var(--text-muted)] hover:text-[var(--neon-cyan)] transition-colors"
          aria-label={t('terminal.expandObjectives')}
          title={t('terminal.expandObjectives')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex flex-col gap-3 items-center">
          <div className="w-5 h-5 rounded-sm border flex items-center justify-center" style={{ borderColor: 'var(--border-subtle)' }}>
            <Check size={12} style={{ color: 'var(--neon-green)' }} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col border-r overflow-hidden"
      style={{ width: 280, minWidth: 280, backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}
      role="region"
      aria-label={t('terminal.objectivesRegion')}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <h3 className="font-jetbrains text-h4" style={{ color: 'var(--text-primary)' }}>{t('terminal.objectives')}</h3>
        <div className="flex items-center gap-2">
          <span className="font-jetbrains text-body-sm" style={{ color: 'var(--text-secondary)' }}>
            {completedRequiredCount}/{requiredObjectives.length}
          </span>
          <button
            onClick={onToggleCollapse}
            className="text-[var(--text-muted)] hover:text-[var(--neon-cyan)] transition-colors"
            aria-label={t('terminal.collapseObjectives')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      <div className="px-3 py-2">
        <div className="w-full h-1 rounded-full" style={{ backgroundColor: 'var(--bg-input)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: 'var(--neon-green)' }}
            initial={{ width: 0 }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <AnimatePresence>
          {objectives.map((obj) => {
            const isComplete = completedIds.has(obj.id)
            return (
              <motion.div
                key={obj.id}
                className="flex items-start gap-3 px-3 py-2.5 border-b"
                style={{ borderColor: 'var(--border-subtle)' }}
                initial={false}
                animate={isComplete ? { backgroundColor: 'rgba(0, 255, 136, 0.06)' } : { backgroundColor: 'transparent' }}
                transition={{ duration: 0.3 }}
              >
                <div className="mt-0.5 flex-shrink-0">
                  <motion.div
                    className="w-4 h-4 rounded-sm border flex items-center justify-center"
                    style={{
                      borderColor: isComplete ? 'var(--neon-green)' : 'var(--border-subtle)',
                      backgroundColor: isComplete ? 'var(--neon-green)' : 'transparent',
                    }}
                    initial={false}
                    animate={isComplete ? { scale: [1, 1.2, 1] } : { scale: 1 }}
                    transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
                  >
                    {isComplete && (
                      <motion.div
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Check size={10} color="#0A0E14" strokeWidth={3} />
                      </motion.div>
                    )}
                  </motion.div>
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="font-jetbrains text-body leading-snug"
                    style={{
                      color: isComplete ? 'var(--neon-green)' : 'var(--text-primary)',
                      textDecorationLine: isComplete ? 'line-through' : 'none',
                      textDecorationColor: 'var(--neon-green)',
                      textDecorationThickness: '1px',
                    }}
                  >
                    {obj.required && <span style={{ color: 'var(--neon-cyan)' }}>&#8226; </span>}
                    {obj.getLabel(language)}
                    {!obj.required && (
                      <span
                        className="ml-2 inline-flex align-middle rounded px-1.5 py-0.5 font-jetbrains text-[9px] uppercase tracking-wider"
                        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
                      >
                        {t('terminal.optional')}
                      </span>
                    )}
                  </p>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
