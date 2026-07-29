import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'

export type Theme = 'dark' | 'high-contrast' | 'warm'

interface ThemeOption {
  id: Theme
  preview: {
    bg: string
    text: string
    accent: string
  }
}

const themes: ThemeOption[] = [
  {
    id: 'dark',
    preview: { bg: '#0A0E14', text: '#00FF88', accent: '#00E5FF' },
  },
  {
    id: 'high-contrast',
    preview: { bg: '#000000', text: '#FFFFFF', accent: '#00FF00' },
  },
  {
    id: 'warm',
    preview: { bg: '#12100E', text: '#3DCC91', accent: '#D4C5A9' },
  },
]

interface ThemeSelectorProps {
  value: Theme
  onChange: (theme: Theme) => void
}

export default function ThemeSelector({ value, onChange }: ThemeSelectorProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col sm:flex-row gap-space-4">
      {themes.map((theme) => {
        const isSelected = value === theme.id
        return (
          <motion.button
            type="button"
            key={theme.id}
            onClick={() => onChange(theme.id)}
            aria-label={t(`settings.themes.${theme.id}`)}
            className="min-h-11 flex-1 rounded-radius-md border-2 p-space-4 text-left transition-all duration-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
            style={{
              backgroundColor: '#0F1419',
              borderColor: isSelected ? theme.preview.accent : '#1E2D3D',
              boxShadow: isSelected ? `0 0 16px ${theme.preview.accent}30` : 'none',
            }}
            whileHover={{ borderColor: theme.preview.accent }}
            whileTap={{ scale: 0.98 }}
            aria-pressed={isSelected}
          >
            {/* Mini preview */}
            <div
              className="w-full h-[80px] rounded-radius-sm mb-space-3 p-space-2 flex flex-col justify-end"
              style={{ backgroundColor: theme.preview.bg }}
            >
              <span className="font-fira text-code-sm" style={{ color: theme.preview.text }}>
                $ echo
              </span>
              <span className="font-fira text-code-sm" style={{ color: theme.preview.accent }}>
                hello world
              </span>
            </div>

            {/* Name + radio */}
            <div className="flex items-center justify-between">
              <span className="font-jetbrains text-h4" style={{ color: '#E8EDF2' }}>
                {t(`settings.themes.${theme.id}`)}
              </span>
              <div
                className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                style={{
                  borderColor: isSelected ? '#00E5FF' : '#788DA1',
                }}
              >
                {isSelected && (
                  <motion.div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: '#00E5FF' }}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.15 }}
                  />
                )}
              </div>
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}
