import { motion, AnimatePresence } from 'framer-motion'
import { X, AlertTriangle } from 'lucide-react'
import type { Hint } from '@/engine/levels'

interface HintPanelProps {
  isOpen: boolean
  onClose: () => void
  hints: Hint[]
  revealedLevels: Set<number>
  onRevealHint: (level: number) => void
  hintsUsed: number
  totalPenalty: number
  language: 'en' | 'zh'
}

function getLevelColor(level: number): string {
  if (level <= 2) return 'var(--neon-cyan)'
  if (level === 3) return 'var(--status-warning)'
  return 'var(--status-danger)'
}

export default function HintPanel({ isOpen, onClose, hints, revealedLevels, onRevealHint, hintsUsed, totalPenalty, language }: HintPanelProps) {
  const copy = language === 'zh'
    ? {
        panel: '任务提示面板', title: '任务提示', used: '已使用提示', close: '关闭提示面板',
        level: '等级', hint: '提示', reveal: '显示提示', forfeits: '查看提示会失去一次性的无提示奖励',
        penalty: '已失去无提示奖励', footer: '使用提示会降低最终得分。尽量自行推理以获得最高分。',
      }
    : {
        panel: 'Mission hints panel', title: 'Mission Hints', used: 'Hints used', close: 'Close hint panel',
        level: 'Level', hint: 'Hint', reveal: 'Show Hint', forfeits: 'Revealing a hint forfeits the one-time no-hints bonus',
        penalty: 'No-hints bonus forfeited', footer: 'Using hints reduces your final score. Try to solve without them for maximum points.',
      }
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-[29]"
            style={{ backgroundColor: 'rgba(10, 14, 20, 0.3)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed top-[52px] right-0 bottom-0 z-[30] flex flex-col border-l overflow-y-auto"
            style={{
              width: 'min(360px, 100vw)',
              backgroundColor: 'rgba(15, 20, 25, 0.95)',
              backdropFilter: 'blur(12px)',
              borderColor: 'var(--border-subtle)',
            }}
            initial={{ x: 360 }}
            animate={{ x: 0 }}
            exit={{ x: 360 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
            role="complementary"
            aria-label={copy.panel}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <div>
                <h3 className="font-jetbrains text-h3" style={{ color: 'var(--text-primary)' }}>{copy.title}</h3>
                <p className="font-jetbrains text-body-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {copy.used}: {hintsUsed}/{hints.length}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all"
                aria-label={copy.close}
              >
                <X size={18} />
              </button>
            </div>

            {/* Hint levels */}
            <div className="flex-1 p-3 space-y-2">
              {hints.map((hint) => {
                const isRevealed = revealedLevels.has(hint.level)
                const color = getLevelColor(hint.level)
                return (
                  <div
                    key={hint.level}
                    className="rounded-md overflow-hidden"
                    style={{ border: `1px solid ${isRevealed ? color + '40' : 'var(--border-subtle)'}`, backgroundColor: 'var(--bg-secondary)' }}
                  >
                    <div className="flex items-center justify-between px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-jetbrains text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full" style={{ color, backgroundColor: color.replace(')', ', 0.12)').replace('var(', 'rgba(').replace('--neon-cyan', '0, 229, 255').replace('--status-warning', '255, 209, 102').replace('--status-danger', '255, 71, 87') }}>
                          {copy.level} {hint.level}
                        </span>
                        <span className="font-jetbrains text-body-sm" style={{ color: 'var(--text-primary)' }}>{copy.hint} {hint.level}</span>
                      </div>
                      {!isRevealed && (
                        <button
                          onClick={() => onRevealHint(hint.level)}
                          className="px-2.5 py-1 rounded-sm font-jetbrains text-[10px] font-semibold uppercase tracking-wider transition-all"
                          style={{
                            backgroundColor: 'var(--bg-input)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border-subtle)',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.color = color }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                        >
                          {copy.reveal}
                        </button>
                      )}
                    </div>
                    <AnimatePresence>
                      {isRevealed && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 pt-1">
                            <p className="font-jetbrains text-body leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                              {hint.getText(language)}
                            </p>
                            <p className="font-jetbrains text-body-sm mt-2 flex items-center gap-1" style={{ color: 'var(--status-warning)' }}>
                              <AlertTriangle size={12} />
                              {copy.forfeits}
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div className="p-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              {totalPenalty > 0 && (
                <p className="font-jetbrains text-body-sm mb-2" style={{ color: 'var(--status-warning)' }}>
                  {copy.penalty}: -{totalPenalty} {language === 'zh' ? '分（总计）' : 'points total'}
                </p>
              )}
              <p className="font-jetbrains text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
                {copy.footer}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
