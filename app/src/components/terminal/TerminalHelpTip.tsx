import { motion, AnimatePresence } from 'framer-motion'
import { CornerDownLeft } from 'lucide-react'

interface TerminalHelpTipProps {
  visible: boolean
}

export default function TerminalHelpTip({ visible }: TerminalHelpTipProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="absolute bottom-16 left-1/2 z-[20] pointer-events-none"
          initial={{ opacity: 0, y: 10, x: '-50%' }}
          animate={{
            opacity: [0.7, 1, 0.7],
            y: 0,
            x: '-50%',
          }}
          exit={{ opacity: 0, y: 5, x: '-50%' }}
          transition={{
            opacity: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
            y: { duration: 0.3 },
          }}
        >
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full"
            style={{
              backgroundColor: 'rgba(0, 255, 136, 0.1)',
              border: '1px solid rgba(0, 255, 136, 0.25)',
              backdropFilter: 'blur(4px)',
            }}
          >
            <span className="font-jetbrains text-[11px] font-semibold" style={{ color: 'var(--neon-green)' }}>
              Type commands here
            </span>
            <CornerDownLeft size={12} style={{ color: 'var(--neon-green)' }} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
