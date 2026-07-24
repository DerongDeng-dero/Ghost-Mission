import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface RedCommandWarningProps {
  isActive: boolean
  command: string
}

export default function RedCommandWarning({ isActive, command }: RedCommandWarningProps) {
  const { t } = useTranslation()
  const warning = `${t('terminal.redWarning')} ${command}`
  return (
    <AnimatePresence>
      {isActive && (
        <>
          <motion.div
            className="absolute inset-0 pointer-events-none z-[45]"
            style={{
              boxShadow: 'inset 0 0 0 3px rgba(255, 71, 87, 0)',
            }}
            animate={{
              boxShadow: [
                'inset 0 0 0 3px rgba(255, 71, 87, 0)',
                'inset 0 0 0 3px rgba(255, 71, 87, 0.6)',
                'inset 0 0 0 3px rgba(255, 71, 87, 0)',
                'inset 0 0 0 3px rgba(255, 71, 87, 0.6)',
                'inset 0 0 0 3px rgba(255, 71, 87, 0)',
                'inset 0 0 0 3px rgba(255, 71, 87, 0.6)',
                'inset 0 0 0 3px rgba(255, 71, 87, 0)',
              ],
            }}
            transition={{ duration: 3.6, times: [0, 0.14, 0.28, 0.42, 0.56, 0.7, 1] }}
          />
          <motion.div
            role="alert"
            aria-label={warning}
            className="absolute top-2 right-2 z-[46] pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-md"
            style={{
              backgroundColor: 'rgba(255, 71, 87, 0.15)',
              border: '1px solid rgba(255, 71, 87, 0.4)',
            }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <AlertTriangle size={14} style={{ color: 'var(--status-danger)' }} />
            <span className="font-jetbrains text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--status-danger)' }}>
              {warning}
            </span>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
