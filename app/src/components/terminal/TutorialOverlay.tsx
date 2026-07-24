import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, Keyboard, Target, X, Play, CornerDownLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface TutorialOverlayProps {
  isVisible: boolean
  onDismiss: () => void
}

export default function TutorialOverlay({ isVisible, onDismiss }: TutorialOverlayProps) {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDivElement>(null)
  const startButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isVisible) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusFrame = requestAnimationFrame(() => startButtonRef.current?.focus())
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onDismiss()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', handleKey)
      previouslyFocused?.focus()
    }
  }, [isVisible, onDismiss])

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="absolute inset-0 z-[25] flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center"
          style={{ backgroundColor: 'rgba(10, 14, 20, 0.88)', backdropFilter: 'blur(8px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          <motion.div
            ref={dialogRef}
            className="max-h-full w-full max-w-[520px] overflow-y-auto rounded-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="terminal-tutorial-title"
            aria-describedby="terminal-tutorial-steps"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
            }}
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
          >
            {/* Header stripe */}
            <div className="h-1 w-full" style={{ backgroundColor: 'var(--neon-green)' }} />

            <div className="p-6 relative">
              {/* Close button */}
              <button
                type="button"
                onClick={onDismiss}
                className="absolute right-2 top-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-[var(--text-muted)] transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                aria-label={t('terminal.tutorial.close')}
              >
                <X size={16} aria-hidden="true" />
              </button>

              {/* Title */}
              <h2 id="terminal-tutorial-title" className="mb-5 pr-10 font-jetbrains text-h2" style={{ color: 'var(--neon-green)' }}>
                {t('terminal.tutorial.welcome')}
              </h2>

              {/* Quick-start guide */}
              <div id="terminal-tutorial-steps" className="mb-6 space-y-3">
                {[
                  { icon: Eye, color: '#00E5FF', text: t('terminal.tutorial.step1') },
                  { icon: Keyboard, color: '#C77DFF', text: t('terminal.tutorial.step2') },
                  { icon: Target, color: '#00FF88', text: t('terminal.tutorial.step3') },
                  { icon: Target, color: '#FFD166', text: t('terminal.tutorial.step4') },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    className="flex items-start gap-3 p-3 rounded-md"
                    style={{ backgroundColor: 'var(--bg-tertiary)' }}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.15, duration: 0.4 }}
                  >
                    <div
                      className="flex items-center justify-center w-9 h-9 rounded-md flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: item.color + '15' }}
                    >
                      <item.icon size={18} style={{ color: item.color }} aria-hidden="true" />
                    </div>
                    <p className="font-inter text-body" style={{ color: 'var(--text-secondary)' }}>
                      {item.text}
                    </p>
                  </motion.div>
                ))}
              </div>

              {/* Common commands cheat sheet */}
              <motion.div
                className="mb-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8, duration: 0.4 }}
              >
                <p className="font-jetbrains text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                  {t('terminal.tutorial.cheatSheet')}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { cmd: 'ls', desc: t('terminal.tutorial.commands.ls') },
                    { cmd: 'cd', desc: t('terminal.tutorial.commands.cd') },
                    { cmd: 'pwd', desc: t('terminal.tutorial.commands.pwd') },
                    { cmd: 'cat', desc: t('terminal.tutorial.commands.cat') },
                    { cmd: 'echo', desc: t('terminal.tutorial.commands.echo') },
                    { cmd: 'whoami', desc: t('terminal.tutorial.commands.whoami') },
                  ].map(item => (
                    <div
                      key={item.cmd}
                      className="p-2 rounded-md"
                      style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                    >
                      <code className="font-jetbrains text-code-sm block" style={{ color: 'var(--neon-green)' }}>{item.cmd}</code>
                      <span className="font-inter text-[10px]" style={{ color: 'var(--text-muted)' }}>{item.desc}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Start button */}
              <motion.button
                ref={startButtonRef}
                type="button"
                onClick={onDismiss}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md py-3 font-jetbrains text-body font-semibold transition-all"
                style={{
                  backgroundColor: 'var(--neon-green)',
                  color: '#0A0E14',
                }}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <Play size={16} aria-hidden="true" />
                {t('terminal.tutorial.startButton')}
                <CornerDownLeft size={14} aria-hidden="true" />
              </motion.button>

              <p className="font-jetbrains text-[10px] text-center mt-3" style={{ color: 'var(--text-muted)' }}>
                {t('terminal.tutorial.dismissKey')}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
