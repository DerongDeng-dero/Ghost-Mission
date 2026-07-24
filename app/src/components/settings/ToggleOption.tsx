import { motion } from 'framer-motion'

interface ToggleOptionProps {
  label: string
  description?: string
  enabled: boolean
  onChange: (enabled: boolean) => void
  disabled?: boolean
}

export default function ToggleOption({ label, description, enabled, onChange, disabled }: ToggleOptionProps) {
  return (
    <div
      className="flex items-center justify-between py-space-3 px-space-4 rounded-radius-md border transition-colors duration-fast"
      style={{
        backgroundColor: '#0F1419',
        borderColor: '#1E2D3D',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div className="flex-1 pr-space-4">
        <h4 className="font-jetbrains text-h4 text-[#E8EDF2]">{label}</h4>
        {description && (
          <p className="font-inter text-body-sm text-[#8B9EB0] mt-space-0.5">{description}</p>
        )}
      </div>

      {/* Neon toggle switch */}
      <button
        type="button"
        onClick={() => !disabled && onChange(!enabled)}
        disabled={disabled}
        className="relative flex h-11 w-12 flex-shrink-0 items-center justify-center rounded-full transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
        style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
        aria-checked={enabled}
        role="switch"
        aria-label={label}
      >
        <span className="relative h-6 w-11 rounded-full" style={{ backgroundColor: enabled ? '#00FF88' : '#1A2332' }} aria-hidden="true">
        <motion.span
          className="absolute top-[2px] w-5 h-5 rounded-full bg-white shadow-sm"
          animate={{ left: enabled ? '22px' : '2px' }}
          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          style={{
            boxShadow: enabled ? '0 0 8px rgba(0,255,136,0.5)' : '0 1px 3px rgba(0,0,0,0.3)',
          }}
        />
        </span>
      </button>
    </div>
  )
}
