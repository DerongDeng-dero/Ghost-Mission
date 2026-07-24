import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'

interface AccessibilityFeature {
  id: string
  label: string
  description: string
  icon: LucideIcon
  enabled: boolean
  onChange: (v: boolean) => void
}

interface AccessibilityPanelProps {
  features: AccessibilityFeature[]
}

export default function AccessibilityPanel({ features }: AccessibilityPanelProps) {
  return (
    <div className="space-y-space-3">
      {features.map((feature, i) => {
        const Icon = feature.icon
        return (
          <motion.div
            key={feature.id}
            className="flex items-center justify-between py-space-3 px-space-4 rounded-radius-md border"
            style={{
              backgroundColor: '#0F1419',
              borderColor: '#1E2D3D',
            }}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05, duration: 0.25 }}
          >
            <div className="flex items-center gap-space-3 flex-1 pr-space-4">
              <div
                className="flex-shrink-0 w-8 h-8 rounded-radius-sm flex items-center justify-center"
                style={{ backgroundColor: 'rgba(0, 229, 255, 0.08)' }}
              >
                <Icon size={16} style={{ color: '#00E5FF' }} />
              </div>
              <div>
                <h4 className="font-jetbrains text-h4 text-[#E8EDF2]">{feature.label}</h4>
                <p className="font-inter text-body-sm text-[#8B9EB0] mt-space-0.5">{feature.description}</p>
              </div>
            </div>

            {/* Toggle */}
            <button
              onClick={() => feature.onChange(!feature.enabled)}
              className="relative flex-shrink-0 w-[44px] h-[24px] rounded-full transition-colors duration-fast focus:outline-none"
              style={{
                backgroundColor: feature.enabled ? '#00FF88' : '#1A2332',
              }}
              aria-checked={feature.enabled}
              role="switch"
              aria-label={feature.label}
            >
              <motion.div
                className="absolute top-[2px] w-5 h-5 rounded-full bg-white shadow-sm"
                animate={{ left: feature.enabled ? '22px' : '2px' }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
                style={{
                  boxShadow: feature.enabled ? '0 0 8px rgba(0,255,136,0.5)' : '0 1px 3px rgba(0,0,0,0.3)',
                }}
              />
            </button>
          </motion.div>
        )
      })}
    </div>
  )
}
