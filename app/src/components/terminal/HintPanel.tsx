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
}

function getLevelColor(level: number): string {
  if (level <= 2) return 'var(--neon-cyan)'
  if (level === 3) return 'var(--status-warning)'
  return 'var(--status-danger)'
}

export default function HintPanel({ isOpen, onClose, hints, revealedLevels, onRevealHint, hintsUsed, totalPenalty }: HintPanelProps) {
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
              width: 360,
              backgroundColor: 'rgba(15, 20, 25, 0.95)',
              backdropFilter: 'blur(12px)',
              borderColor: 'var(--border-subtle)',
            }}
            initial={{ x: 360 }}
            animate={{ x: 0 }}
            exit={{ x: 360 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
            role="complementary"
            aria-label="Mission hints panel"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <div>
                <h3 className="font-jetbrains text-h3" style={{ color: 'var(--text-primary)' }}>Mission Hints</h3>
                <p className="font-jetbrains text-body-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Hints used: {hintsUsed}/{hints.length}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all"
                aria-label="Close hint panel"
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
                          Level {hint.level}
                        </span>
                        <span className="font-jetbrains text-body-sm" style={{ color: 'var(--text-primary)' }}>Hint {hint.level}</span>
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
                          Show Hint
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
                              {hint.getText('en')}
                            </p>
                            <p className="font-jetbrains text-body-sm mt-2 flex items-center gap-1" style={{ color: 'var(--status-warning)' }}>
                              <AlertTriangle size={12} />
                              Using this hint reduces perfect score bonus
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
                  Score penalty: -{totalPenalty} points
                </p>
              )}
              {hintsUsed >= 3 && (
                <button
                  className="w-full py-2 rounded-md font-jetbrains text-body-sm transition-colors"
                  style={{ color: 'var(--status-danger)', border: '1px solid rgba(255,71,87,0.3)', backgroundColor: 'rgba(255,71,87,0.06)' }}
                >
                  Request Override
                </button>
              )}
              <p className="font-jetbrains text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
                Using hints reduces your final score. Try to solve without them for maximum points.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
