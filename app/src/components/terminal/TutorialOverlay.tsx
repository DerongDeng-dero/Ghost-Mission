import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, Keyboard, Target, X, Play, CornerDownLeft } from 'lucide-react'

interface TutorialOverlayProps {
  isVisible: boolean
  onDismiss: () => void
}

const TYPING_MESSAGES = [
  '> Initializing terminal session...',
  '> Welcome to Ghost Ops, operative.',
  '> Your terminal is your weapon.',
]

export default function TutorialOverlay({ isVisible, onDismiss }: TutorialOverlayProps) {
  const [typedIndex, setTypedIndex] = useState(0)
  const [typedChar, setTypedChar] = useState(0)

  // Animated typing effect
  useEffect(() => {
    if (!isVisible) return
    const msg = TYPING_MESSAGES[typedIndex]
    if (!msg) return

    if (typedChar < msg.length) {
      const timer = setTimeout(() => setTypedChar(c => c + 1), 35)
      return () => clearTimeout(timer)
    } else {
      const timer = setTimeout(() => {
        if (typedIndex < TYPING_MESSAGES.length - 1) {
          setTypedIndex(i => i + 1)
          setTypedChar(0)
        }
      }, 600)
      return () => clearTimeout(timer)
    }
  }, [isVisible, typedIndex, typedChar])

  // Dismiss on any key press
  useEffect(() => {
    if (!isVisible) return
    const handleKey = () => onDismiss()
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isVisible, onDismiss])

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="absolute inset-0 z-[25] flex items-center justify-center px-4"
          style={{ backgroundColor: 'rgba(10, 14, 20, 0.88)', backdropFilter: 'blur(8px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          <motion.div
            className="w-full max-w-[520px] rounded-lg overflow-hidden"
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
                onClick={onDismiss}
                className="absolute top-4 right-4 p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all"
                aria-label="Close tutorial"
              >
                <X size={16} />
              </button>

              {/* Title */}
              <h2 className="font-jetbrains text-h2 mb-1" style={{ color: 'var(--neon-green)' }}>
                Welcome to Terminal Ghost Ops
              </h2>

              {/* Animated typing subtitle */}
              <p className="font-jetbrains text-code-sm mb-6 min-h-[20px]" style={{ color: 'var(--neon-cyan)' }}>
                {TYPING_MESSAGES[typedIndex]?.slice(0, typedChar)}
                <span className="animate-pulse">_</span>
              </p>

              {/* 3-step guide */}
              <div className="space-y-3 mb-6">
                {[
                  { icon: Eye, color: '#00E5FF', label: 'Read objectives', desc: 'Check the left panel for your mission goals' },
                  { icon: Keyboard, color: '#C77DFF', label: 'Type commands', desc: 'Click the terminal and enter commands like ls, cd, cat' },
                  { icon: Target, color: '#00FF88', label: 'Complete mission', desc: 'Finish all objectives to win and unlock the next level' },
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
                      <item.icon size={18} style={{ color: item.color }} />
                    </div>
                    <div>
                      <p className="font-jetbrains text-body font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {item.label}
                      </p>
                      <p className="font-inter text-body-sm" style={{ color: 'var(--text-secondary)' }}>
                        {item.desc}
                      </p>
                    </div>
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
                  Common Commands Cheat Sheet
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { cmd: 'ls', desc: 'List files' },
                    { cmd: 'cd', desc: 'Change dir' },
                    { cmd: 'pwd', desc: 'Show path' },
                    { cmd: 'cat', desc: 'Read file' },
                    { cmd: 'echo', desc: 'Print text' },
                    { cmd: 'whoami', desc: 'Show user' },
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
                onClick={onDismiss}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-md font-jetbrains text-body font-semibold transition-all"
                style={{
                  backgroundColor: 'var(--neon-green)',
                  color: '#0A0E14',
                }}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <Play size={16} />
                Start Mission
                <CornerDownLeft size={14} />
              </motion.button>

              <p className="font-jetbrains text-[10px] text-center mt-3" style={{ color: 'var(--text-muted)' }}>
                Press any key to dismiss
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
