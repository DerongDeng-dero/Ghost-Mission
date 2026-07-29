import { useState, useEffect, useCallback, useMemo, useRef, useId } from 'react'
import { motion } from 'framer-motion'
import {
  Palette,
  Accessibility,
  Terminal,
  Gamepad2,
  Volume2,
  User,
  Info,
  RotateCcw,
  Download,
  LogOut,
  AlertTriangle,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import SettingSection from '@/components/settings/SettingSection'
import ThemeSelector from '@/components/settings/ThemeSelector'
import type { Theme } from '@/components/settings/ThemeSelector'
import ToggleOption from '@/components/settings/ToggleOption'
import AccessibilityPanel from '@/components/settings/AccessibilityPanel'
import { useGameStore } from '@/store/gameStore'

// ─── localStorage Helpers ───────────────────────────────────────────

function loadSetting<K extends keyof SettingsState>(
  key: K,
  fallback: SettingsState[K],
): SettingsState[K] {
  try {
    if (typeof window === 'undefined') return fallback
    const raw = window.localStorage.getItem(`ghostops_${key}`)
    if (raw === null) return fallback
    const parsed: unknown = JSON.parse(raw)
    return isValidSettingValue(key, parsed) ? parsed as SettingsState[K] : fallback
  } catch {
    return fallback
  }
}

function saveSetting(key: string, value: unknown) {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(`ghostops_${key}`, JSON.stringify(value))
    }
  } catch {
    // ignore
  }
}

// ─── Types ──────────────────────────────────────────────────────────

type CursorStyle = 'block' | 'line' | 'bar'
type AnimationIntensity = 'full' | 'reduced' | 'none'

interface SettingsState {
  // Appearance
  theme: Theme
  crtScanlines: boolean
  bossModeEffects: boolean
  animationIntensity: AnimationIntensity

  // Terminal
  fontSize: number
  fontFamily: string
  cursorStyle: CursorStyle
  blinkCursor: boolean
  scrollbackLines: number
  clickToCopy: boolean

  // Accessibility
  highContrast: boolean
  colorBlindMode: boolean
  largeText: boolean
  screenReader: boolean
  keyboardHints: boolean
  soundToVisual: boolean

  // Gameplay
  defaultHintLevel: number
  timerDisplay: boolean
  scoreDisplay: boolean
  autoSave: boolean

  // Sound
  masterVolume: number
  inputFeedback: boolean
  missionCompleteSound: boolean
  redCommandWarning: boolean
  backgroundMusic: boolean

  // Account
  displayName: string
  locale: string
}

const DEFAULT_SETTINGS: SettingsState = {
  theme: 'dark',
  crtScanlines: false,
  bossModeEffects: true,
  animationIntensity: 'full',

  fontSize: 13,
  fontFamily: 'Fira Code',
  cursorStyle: 'block',
  blinkCursor: true,
  scrollbackLines: 10000,
  clickToCopy: true,

  highContrast: false,
  colorBlindMode: false,
  largeText: false,
  screenReader: false,
  keyboardHints: true,
  soundToVisual: false,

  defaultHintLevel: 2,
  timerDisplay: true,
  scoreDisplay: true,
  autoSave: true,

  masterVolume: 75,
  inputFeedback: true,
  missionCompleteSound: true,
  redCommandWarning: true,
  backgroundMusic: false,

  displayName: 'Ghost-7',
  locale: 'en-US',
}

function isValidSettingValue(key: keyof SettingsState, value: unknown): boolean {
  switch (key) {
    case 'theme':
      return value === 'dark' || value === 'high-contrast' || value === 'warm'
    case 'animationIntensity':
      return value === 'full' || value === 'reduced' || value === 'none'
    case 'fontSize':
      return Number.isInteger(value) && Number(value) >= 11 && Number(value) <= 16
    case 'fontFamily':
      return value === 'Fira Code' || value === 'JetBrains Mono' || value === 'Cascadia Code'
    case 'cursorStyle':
      return value === 'block' || value === 'line' || value === 'bar'
    case 'scrollbackLines':
      return value === 1000 || value === 5000 || value === 10000
    case 'defaultHintLevel':
      return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 5
    case 'masterVolume':
      return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100
    case 'displayName':
      return typeof value === 'string' && value.length <= 20
    case 'locale':
      return value === 'en-US' || value === 'zh-CN'
    default:
      return typeof value === typeof DEFAULT_SETTINGS[key]
  }
}

// ─── Slider Component ───────────────────────────────────────────────

function NeonSlider({
  value,
  min,
  max,
  step,
  onChange,
  unit,
  label,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  unit?: string
  label: string
}) {
  const pct = ((value - min) / (max - min)) * 100

  return (
    <div className="flex items-center gap-space-4">
      <div className="relative flex h-11 flex-1 items-center">
        <div className="absolute left-0 right-0 top-1/2 h-[6px] -translate-y-1/2 rounded-full" style={{ backgroundColor: '#1A2332' }} />
        <div
          className="absolute left-0 top-1/2 h-[6px] -translate-y-1/2 rounded-full"
          style={{ width: `${pct}%`, backgroundColor: '#00E5FF' }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step || 1}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 focus-visible:opacity-100"
          style={{ zIndex: 2 }}
        />
        {/* Visible thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 pointer-events-none"
          style={{
            left: `calc(${pct}% - 8px)`,
            backgroundColor: '#0A0E14',
            borderColor: '#00E5FF',
            boxShadow: '0 0 8px rgba(0,229,255,0.4)',
          }}
        />
      </div>
      <span className="font-fira text-code text-[#00E5FF] w-[48px] text-right">
        {value}
        {unit}
      </span>
    </div>
  )
}

// ─── Select Component ───────────────────────────────────────────────

function NeonSelect({
  value,
  options,
  onChange,
  label,
}: {
  value: string | number
  options: { label: string; value: string | number }[]
  onChange: (v: string | number) => void
  label: string
}) {
  return (
    <div className="relative inline-block">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => {
          const val = e.target.value
          const num = Number(val)
          onChange(Number.isNaN(num) || e.target.value === '' ? val : num)
        }}
        className="min-h-11 min-w-[160px] cursor-pointer appearance-none rounded-radius-sm border border-[#1E2D3D] bg-[#1A2332] px-space-4 py-space-2 pr-space-10 font-jetbrains text-body text-[#E8EDF2] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <div className="absolute right-space-3 top-1/2 -translate-y-1/2 pointer-events-none">
        <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
          <path d="M1 1.5L6 6.5L11 1.5" stroke="#8B9EB0" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}

// ─── Reset Confirmation Modal ───────────────────────────────────────

function ResetModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter((element) => !element.hasAttribute('disabled'))
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
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [onCancel])

  return (
    <motion.div
      className="fixed inset-0 z-overlay flex items-center justify-center px-space-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(10, 14, 20, 0.8)', backdropFilter: 'blur(4px)' }}
        onClick={onCancel}
      />

      {/* Modal */}
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative w-full max-w-[480px] p-space-6 rounded-radius-lg border"
        style={{
          backgroundColor: '#131B23',
          borderColor: '#1E2D3D',
        }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.3 }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-space-3 top-space-3 flex min-h-11 min-w-11 items-center justify-center rounded-radius-sm text-[#788DA1] transition-colors hover:text-[#E8EDF2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
          aria-label={t('common.close')}
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-space-3 mb-space-4">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(255,71,87,0.15)' }}
          >
            <AlertTriangle size={20} style={{ color: '#FF4757' }} />
          </div>
          <h3 id={titleId} className="font-jetbrains text-h3 text-[#E8EDF2]">{t('settings.resetTitle')}</h3>
        </div>

        <p id={descriptionId} className="font-inter text-body text-[#8B9EB0] mb-space-6">
          {t('settings.resetWarning')}
        </p>

        <div className="flex items-center gap-space-3 justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-radius-sm border px-space-4 py-space-2 font-jetbrains text-body transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
            style={{ borderColor: '#1E2D3D', color: '#8B9EB0' }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-11 rounded-radius-sm px-space-4 py-space-2 font-jetbrains text-body transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{ backgroundColor: '#FF4757', color: '#FFFFFF' }}
          >
            {t('settings.resetConfirm')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Main Settings Page ─────────────────────────────────────────────

export default function Settings() {
  const { t, i18n } = useTranslation()
  const resetMissionProgress = useGameStore(state => state.resetMissionProgress)
  const [activeSection, setActiveSection] = useState('appearance')
  const [showResetModal, setShowResetModal] = useState(false)
  const [s, setS] = useState<SettingsState>(() => {
    // Load from localStorage on mount
    const loaded: Partial<SettingsState> = {}
    for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof SettingsState>) {
      loaded[key] = loadSetting(key, DEFAULT_SETTINGS[key]) as never
    }
    return { ...DEFAULT_SETTINGS, ...loaded }
  })

  // Persist to localStorage on change
  useEffect(() => {
    for (const key of Object.keys(s) as Array<keyof SettingsState>) {
      saveSetting(key, s[key])
    }
  }, [s])

  // Apply large text if enabled
  useEffect(() => {
    if (s.largeText) {
      document.documentElement.style.fontSize = '16px'
    } else {
      document.documentElement.style.fontSize = ''
    }
  }, [s.largeText])

  // Apply high contrast
  useEffect(() => {
    if (s.highContrast) {
      document.documentElement.setAttribute('data-theme', 'high-contrast')
    } else if (s.theme === 'dark') {
      document.documentElement.setAttribute('data-theme', '')
    } else {
      document.documentElement.setAttribute('data-theme', s.theme)
    }
  }, [s.highContrast, s.theme])

  const update = useCallback(<K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setS((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleReset = () => {
    resetMissionProgress()
    try {
      for (const storage of [window.localStorage, window.sessionStorage]) {
        for (let index = storage.length - 1; index >= 0; index -= 1) {
          const key = storage.key(index)
          if (key?.startsWith('ghostops_run_report:')) {
            storage.removeItem(key)
          }
        }
      }
    } catch {
      // The in-memory store is already reset if browser storage is unavailable.
    }
    setShowResetModal(false)
  }

  // Sidebar nav
  const sidebarRef = useRef<HTMLDivElement>(null)
  const navItems = useMemo<{ id: string; label: string; icon: LucideIcon }[]>(() => [
    { id: 'appearance', label: t('settings.appearance'), icon: Palette },
    { id: 'accessibility', label: t('settings.accessibility'), icon: Accessibility },
    { id: 'terminal', label: t('settings.terminal'), icon: Terminal },
    { id: 'gameplay', label: t('settings.gameplay'), icon: Gamepad2 },
    { id: 'sound', label: t('settings.sound'), icon: Volume2 },
    { id: 'account', label: t('settings.account'), icon: User },
    { id: 'about', label: t('settings.about'), icon: Info },
  ], [t])

  // Scroll to section when nav clicked
  const scrollToSection = (id: string) => {
    setActiveSection(id)
    const el = document.getElementById(`settings-${id}`)
    if (el) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    }
  }

  // Observe which section is in view
  useEffect(() => {
    const observers: IntersectionObserver[] = []
    navItems.forEach((item) => {
      const el = document.getElementById(`settings-${item.id}`)
      if (!el) return
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setActiveSection(item.id)
            }
          })
        },
        { rootMargin: '-20% 0px -70% 0px' }
      )
      obs.observe(el)
      observers.push(obs)
    })
    return () => observers.forEach((o) => o.disconnect())
  }, [navItems])

  const hintDescriptions: Record<number, string> = {
    0: t('settings.hintLevelDescriptions.0'),
    1: t('settings.hintLevelDescriptions.1'),
    2: t('settings.hintLevelDescriptions.2'),
    3: t('settings.hintLevelDescriptions.3'),
    4: t('settings.hintLevelDescriptions.4'),
    5: t('settings.hintLevelDescriptions.5'),
  }

  return (
    <div className="min-h-[100dvh]" style={{ backgroundColor: '#0A0E14' }}>
      {/* ── Page Header ── */}
      <div className="w-full" style={{ backgroundColor: '#0F1419', minHeight: '120px' }}>
        <div className="max-w-[960px] mx-auto px-space-4 py-space-8">
          <motion.h1
            className="font-jetbrains text-h1 text-[#E8EDF2]"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          >
            {t('settings.title')}
          </motion.h1>
          <motion.p
            className="font-inter text-body text-[#8B9EB0] mt-space-2"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            {t('settings.subtitle')}
          </motion.p>
        </div>
      </div>

      {/* ── Layout: Sidebar + Panel ── */}
      <div className="max-w-[960px] mx-auto px-space-4 pb-space-16 flex flex-col md:flex-row gap-space-6">
        {/* Sidebar Nav */}
        <div
          ref={sidebarRef}
          className="md:w-[200px] lg:w-[240px] flex-shrink-0"
        >
          <div className="sticky top-[72px] flex md:flex-col gap-space-1 overflow-x-auto md:overflow-visible pb-space-2 md:pb-0" role="navigation" aria-label={t('settings.sectionNavigation')}>
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = activeSection === item.id
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => scrollToSection(item.id)}
                  aria-current={isActive ? 'location' : undefined}
                  aria-label={item.label}
                  className="flex min-h-11 flex-shrink-0 items-center gap-space-3 whitespace-nowrap rounded-radius-sm px-space-4 py-[10px] font-jetbrains text-body transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF] md:flex-shrink"
                  style={{
                    color: isActive ? '#00E5FF' : '#8B9EB0',
                    backgroundColor: isActive ? '#1E2A3A' : 'transparent',
                    borderLeft: isActive ? '2px solid #00E5FF' : '2px solid transparent',
                  }}
                >
                  <Icon size={18} />
                  <span className="hidden md:inline">{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Settings Panel */}
        <div className="flex-1 max-w-[720px] py-space-4 md:py-space-6 space-y-space-8">
          {/* ── Appearance ── */}
          <div id="settings-appearance">
            <SettingSection
              icon={Palette}
              title={t('settings.appearance')}
              description={t('settings.theme')}
            >
              <div>
                <h4 className="font-jetbrains text-h4 text-[#E8EDF2] mb-space-3">{t('settings.theme')}</h4>
                <ThemeSelector value={s.theme} onChange={(t) => update('theme', t)} />
              </div>

              <div className="mt-space-6">
                <h4 className="font-jetbrains text-h4 text-[#E8EDF2] mb-space-3">{t('settings.animationIntensity')}</h4>
                <div className="flex gap-space-3">
                  {([
                    { v: 'full' as const, label: t('settings.animation.full') },
                    { v: 'reduced' as const, label: t('settings.animation.reduced') },
                    { v: 'none' as const, label: t('settings.animation.none') },
                  ]).map((opt) => (
                    <button
                      type="button"
                      key={opt.v}
                      onClick={() => update('animationIntensity', opt.v)}
                      aria-pressed={s.animationIntensity === opt.v}
                      className="min-h-11 flex-1 rounded-radius-md border px-space-4 py-space-3 text-center font-jetbrains text-body transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
                      style={{
                        borderColor: s.animationIntensity === opt.v ? '#00E5FF' : '#1E2D3D',
                        backgroundColor: s.animationIntensity === opt.v ? 'rgba(0,229,255,0.08)' : '#0F1419',
                        color: s.animationIntensity === opt.v ? '#00E5FF' : '#8B9EB0',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-space-4 space-y-space-3">
                <ToggleOption
                  label={t('settings.crtScanlines')}
                  description={t('settings.crtScanlinesDesc')}
                  enabled={s.crtScanlines}
                  onChange={(v) => update('crtScanlines', v)}
                />
                <ToggleOption
                  label={t('settings.bossModeEffects')}
                  description={t('settings.bossModeEffectsDesc')}
                  enabled={s.bossModeEffects}
                  onChange={(v) => update('bossModeEffects', v)}
                />
              </div>
            </SettingSection>
          </div>

          {/* ── Accessibility ── */}
          <div id="settings-accessibility">
            <SettingSection
              icon={Accessibility}
              title={t('settings.accessibility')}
              description=""
            >
              <AccessibilityPanel
                features={[
                  {
                    id: 'high-contrast',
                    label: t('settings.highContrast'),
                    description: t('settings.highContrastDesc'),
                    icon: Palette,
                    enabled: s.highContrast,
                    onChange: (v) => update('highContrast', v),
                  },
                  {
                    id: 'color-blind',
                    label: t('settings.colorBlind'),
                    description: t('settings.colorBlindDesc'),
                    icon: Palette,
                    enabled: s.colorBlindMode,
                    onChange: (v) => update('colorBlindMode', v),
                  },
                  {
                    id: 'large-text',
                    label: t('settings.largeText'),
                    description: t('settings.largeTextDesc'),
                    icon: Info,
                    enabled: s.largeText,
                    onChange: (v) => update('largeText', v),
                  },
                  {
                    id: 'screen-reader',
                    label: t('settings.screenReader'),
                    description: t('settings.screenReaderDesc'),
                    icon: Accessibility,
                    enabled: s.screenReader,
                    onChange: (v) => update('screenReader', v),
                  },
                  {
                    id: 'keyboard-hints',
                    label: t('settings.keyboardHints'),
                    description: t('settings.keyboardHintsDesc'),
                    icon: Info,
                    enabled: s.keyboardHints,
                    onChange: (v) => update('keyboardHints', v),
                  },
                  {
                    id: 'sound-to-visual',
                    label: t('settings.soundToVisual'),
                    description: t('settings.soundToVisualDesc'),
                    icon: Info,
                    enabled: s.soundToVisual,
                    onChange: (v) => update('soundToVisual', v),
                  },
                ]}
              />

              {/* Reduced Motion toggle — respects prefers-reduced-motion */}
              <div className="mt-space-4">
                <ToggleOption
                  label={t('settings.respectReducedMotion')}
                  description={t('settings.respectReducedMotionDesc')}
                  enabled={s.animationIntensity === 'none'}
                  onChange={(v) => update('animationIntensity', v ? 'none' : 'full')}
                />
              </div>
            </SettingSection>
          </div>

          {/* ── Terminal ── */}
          <div id="settings-terminal">
            <SettingSection
              icon={Terminal}
              title={t('settings.terminal')}
              description=""
            >
              {/* Font Size */}
              <div>
                <div className="flex items-center justify-between mb-space-3">
                  <h4 className="font-jetbrains text-h4 text-[#E8EDF2]">{t('settings.fontSize')}</h4>
                </div>
                <NeonSlider
                  label={t('settings.fontSize')}
                  value={s.fontSize}
                  min={11}
                  max={16}
                  onChange={(v) => update('fontSize', v)}
                  unit="px"
                />
                {/* Preview */}
                <div
                  className="mt-space-3 p-space-3 rounded-radius-sm border"
                  style={{
                    backgroundColor: '#0C1117',
                    borderColor: '#1E2D3D',
                    fontFamily: s.fontFamily,
                    fontSize: `${s.fontSize}px`,
                  }}
                >
                  <span className="text-[#00FF88]">$ </span>
                  <span className="text-[#E6DCCF]">echo "Terminal preview"</span>
                </div>
              </div>

              {/* Font Family */}
              <div className="mt-space-6">
                <h4 className="font-jetbrains text-h4 text-[#E8EDF2] mb-space-3">{t('settings.fontFamily')}</h4>
                <NeonSelect
                  label={t('settings.fontFamily')}
                  value={s.fontFamily}
                  options={[
                    { label: 'Fira Code', value: 'Fira Code' },
                    { label: 'JetBrains Mono', value: 'JetBrains Mono' },
                    { label: 'Cascadia Code', value: 'Cascadia Code' },
                  ]}
                  onChange={(v) => update('fontFamily', String(v))}
                />
              </div>

              {/* Cursor Style */}
              <div className="mt-space-6">
                <h4 className="font-jetbrains text-h4 text-[#E8EDF2] mb-space-3">{t('settings.cursorStyle')}</h4>
                <div className="flex gap-space-3">
                  {([
                    { v: 'block' as const, label: t('settings.cursor.block') },
                    { v: 'line' as const, label: t('settings.cursor.line') },
                    { v: 'bar' as const, label: t('settings.cursor.bar') },
                  ]).map((opt) => (
                    <button
                      type="button"
                      key={opt.v}
                      onClick={() => update('cursorStyle', opt.v)}
                      aria-pressed={s.cursorStyle === opt.v}
                      className="min-h-11 flex-1 rounded-radius-md border px-space-4 py-space-3 text-center font-jetbrains text-body transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
                      style={{
                        borderColor: s.cursorStyle === opt.v ? '#00E5FF' : '#1E2D3D',
                        backgroundColor: s.cursorStyle === opt.v ? 'rgba(0,229,255,0.08)' : '#0F1419',
                        color: s.cursorStyle === opt.v ? '#00E5FF' : '#8B9EB0',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrollback Lines */}
              <div className="mt-space-6">
                <h4 className="font-jetbrains text-h4 text-[#E8EDF2] mb-space-3">{t('settings.scrollbackLines')}</h4>
                <NeonSelect
                  label={t('settings.scrollbackLines')}
                  value={s.scrollbackLines}
                  options={[
                    { label: '1,000 lines', value: 1000 },
                    { label: '5,000 lines', value: 5000 },
                    { label: '10,000 lines', value: 10000 },
                  ]}
                  onChange={(v) => update('scrollbackLines', Number(v))}
                />
              </div>

              <div className="mt-space-4 space-y-space-3">
                <ToggleOption
                  label={t('settings.blinkCursor')}
                  description={t('settings.blinkCursorDesc')}
                  enabled={s.blinkCursor}
                  onChange={(v) => update('blinkCursor', v)}
                />
                <ToggleOption
                  label={t('settings.clickToCopy')}
                  description={t('settings.clickToCopyDesc')}
                  enabled={s.clickToCopy}
                  onChange={(v) => update('clickToCopy', v)}
                />
              </div>
            </SettingSection>
          </div>

          {/* ── Gameplay ── */}
          <div id="settings-gameplay">
            <SettingSection
              icon={Gamepad2}
              title={t('settings.gameplay')}
              description=""
            >
              {/* Default Hint Level */}
              <div>
                <h4 className="font-jetbrains text-h4 text-[#E8EDF2] mb-space-3">{t('settings.defaultHintLevel')}</h4>
                <div className="flex items-center gap-space-4">
                  <NeonSlider
                    label={t('settings.defaultHintLevel')}
                    value={s.defaultHintLevel}
                    min={0}
                    max={5}
                    onChange={(v) => update('defaultHintLevel', v)}
                  />
                </div>
                <p className="font-jetbrains text-body-sm text-[#788DA1] mt-space-2">
                  {hintDescriptions[s.defaultHintLevel]}
                </p>
              </div>

              <div className="mt-space-4 space-y-space-3">
                <ToggleOption
                  label={t('settings.timerDisplay')}
                  description={t('settings.timerDisplayDesc')}
                  enabled={s.timerDisplay}
                  onChange={(v) => update('timerDisplay', v)}
                />
                <ToggleOption
                  label={t('settings.scoreDisplay')}
                  description={t('settings.scoreDisplayDesc')}
                  enabled={s.scoreDisplay}
                  onChange={(v) => update('scoreDisplay', v)}
                />
                <ToggleOption
                  label={t('settings.autoSave')}
                  description={t('settings.autoSaveDesc')}
                  enabled={s.autoSave}
                  onChange={(v) => update('autoSave', v)}
                />
              </div>

              {/* Reset Progress */}
              <div
                className="mt-space-6 p-space-4 rounded-radius-md border"
                style={{
                  backgroundColor: 'rgba(255,71,87,0.05)',
                  borderColor: 'rgba(255,71,87,0.2)',
                }}
              >
                <div className="flex items-start gap-space-3">
                  <AlertTriangle size={18} style={{ color: '#FF4757', marginTop: '2px' }} className="flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="font-jetbrains text-h4" style={{ color: '#FF4757' }}>
                      {t('settings.resetProgress')}
                    </h4>
                    <p className="font-inter text-body-sm text-[#8B9EB0] mt-space-1">
                      {t('settings.resetProgressDesc')}
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowResetModal(true)}
                      className="mt-space-3 min-h-11 rounded-radius-sm border px-space-4 py-space-2 font-jetbrains text-body transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4757]"
                      style={{
                        borderColor: '#FF4757',
                        color: '#FF4757',
                        backgroundColor: 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255,71,87,0.1)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      <RotateCcw size={14} className="inline mr-2" />
                      {t('settings.resetConfirm')}
                    </button>
                  </div>
                </div>
              </div>
            </SettingSection>
          </div>

          {/* ── Sound ── */}
          <div id="settings-sound">
            <SettingSection
              icon={Volume2}
              title={t('settings.sound')}
              description=""
            >
              {/* Master Volume */}
              <div>
                <div className="flex items-center justify-between mb-space-3">
                  <h4 className="font-jetbrains text-h4 text-[#E8EDF2]">{t('settings.masterVolume')}</h4>
                </div>
                <NeonSlider
                  label={t('settings.masterVolume')}
                  value={s.masterVolume}
                  min={0}
                  max={100}
                  onChange={(v) => update('masterVolume', v)}
                  unit="%"
                />
              </div>

              <div className="mt-space-4 space-y-space-3">
                <ToggleOption
                  label={t('settings.inputFeedback')}
                  description={t('settings.inputFeedbackDesc')}
                  enabled={s.inputFeedback}
                  onChange={(v) => update('inputFeedback', v)}
                />
                <ToggleOption
                  label={t('settings.missionCompleteSound')}
                  description={t('settings.missionCompleteSoundDesc')}
                  enabled={s.missionCompleteSound}
                  onChange={(v) => update('missionCompleteSound', v)}
                />
                <ToggleOption
                  label={t('settings.redCommandWarning')}
                  description={t('settings.redCommandWarningDesc')}
                  enabled={s.redCommandWarning}
                  onChange={(v) => update('redCommandWarning', v)}
                />
                <ToggleOption
                  label={t('settings.backgroundMusic')}
                  description={t('settings.backgroundMusicDesc')}
                  enabled={s.backgroundMusic}
                  onChange={(v) => update('backgroundMusic', v)}
                />
              </div>
            </SettingSection>
          </div>

          {/* ── Account ── */}
          <div id="settings-account">
            <SettingSection
              icon={User}
              title={t('settings.account')}
              description=""
            >
              {/* Display Name */}
              <div>
                <label htmlFor="settings-display-name" className="mb-space-3 block font-jetbrains text-h4 text-[#E8EDF2]">{t('settings.displayName')}</label>
                <div className="flex items-center gap-space-3">
                  <input
                    id="settings-display-name"
                    type="text"
                    maxLength={20}
                    aria-describedby="settings-display-name-count"
                    value={s.displayName}
                    onChange={(e) => update('displayName', e.target.value.slice(0, 20))}
                    className="min-h-11 flex-1 max-w-[300px] rounded-radius-sm border border-[#1E2D3D] bg-[#1A2332] px-space-3 py-space-2 font-jetbrains text-body text-[#E8EDF2] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
                    placeholder={t('settings.callsignPlaceholder')}
                  />
                  <span id="settings-display-name-count" className="font-jetbrains text-code-sm text-[#788DA1]">
                    {s.displayName.length}/20
                  </span>
                </div>
              </div>

              {/* Preferred Shell */}
              <div className="mt-space-6">
                <h4 className="font-jetbrains text-h4 text-[#E8EDF2] mb-space-3">{t('settings.preferredShell')}</h4>
                <div
                  className="inline-flex items-center gap-space-2 px-space-4 py-space-2 rounded-radius-sm font-fira text-code"
                  style={{ backgroundColor: '#0C1117', color: '#00FF88', border: '1px solid #1E2D3D' }}
                >
                  <Terminal size={14} />
                  bash
                </div>
              </div>

              {/* Locale */}
              <div className="mt-space-6">
                <h4 className="font-jetbrains text-h4 text-[#E8EDF2] mb-space-3">{t('settings.locale')}</h4>
                <NeonSelect
                  label={t('settings.locale')}
                  value={s.locale}
                  options={[
                    { label: '中文（简体）', value: 'zh-CN' },
                    { label: 'English (US)', value: 'en-US' },
                  ]}
                  onChange={(v) => {
                    const locale = String(v)
                    update('locale', locale)
                    const language = locale.startsWith('zh') ? 'zh' : 'en'
                    try {
                      window.localStorage.setItem('i18nextLng', language)
                    } catch {
                      // Language switching still works when persistence is unavailable.
                    }
                    void i18n.changeLanguage(language)
                  }}
                />
              </div>

              {/* Export + Sign Out */}
              <div className="mt-space-6 flex flex-wrap items-center gap-space-3">
                <button
                  type="button"
                  onClick={() => {
                    const data: Record<string, unknown> = {}
                    for (let i = 0; i < localStorage.length; i++) {
                      const key = localStorage.key(i)
                      if (key && key.startsWith('ghostops_')) {
                        try {
                          data[key] = JSON.parse(localStorage.getItem(key) || 'null')
                        } catch {
                          data[key] = localStorage.getItem(key)
                        }
                      }
                    }
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = 'ghost-ops-progress.json'
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                  className="flex min-h-11 items-center gap-space-2 rounded-radius-sm px-space-4 py-space-2 font-jetbrains text-body transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
                  style={{
                    backgroundColor: '#1A2332',
                    color: '#00E5FF',
                  }}
                >
                  <Download size={14} />
                  {t('settings.exportProgress')}
                </button>

                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  title={t('settings.signOutUnavailable')}
                  className="flex min-h-11 items-center gap-space-2 rounded-radius-sm px-space-4 py-space-2 font-jetbrains text-body transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4757]"
                  style={{
                    backgroundColor: '#1A2332',
                    color: '#FF4757',
                    opacity: 0.5,
                    cursor: 'not-allowed',
                  }}
                >
                  <LogOut size={14} />
                  {t('settings.signOutUnavailable')}
                </button>
              </div>
            </SettingSection>
          </div>

          {/* ── About ── */}
          <div id="settings-about">
            <SettingSection
              icon={Info}
              title={t('settings.about')}
              description=""
            >
              <div
                className="p-space-6 rounded-radius-lg border text-center"
                style={{ backgroundColor: '#0F1419', borderColor: '#1E2D3D' }}
              >
                <h2 className="font-jetbrains text-h2 text-[#E8EDF2]">{t('app.title')}</h2>
                <p className="font-jetbrains text-body text-[#8B9EB0] mt-space-2">{t('settings.version')}</p>
                <p className="font-inter text-body text-[#8B9EB0] mt-space-3 italic">
                  &ldquo;{t('settings.tagline')}&rdquo;
                </p>

                <div className="mt-space-6 pt-space-4 border-t" style={{ borderColor: '#1E2D3D' }}>
                  <p className="font-jetbrains text-body-sm text-[#788DA1] mb-space-2">{t('settings.builtWith')}</p>
                  <div className="flex flex-wrap items-center justify-center gap-space-3">
                    {['React', 'TypeScript', 'Tailwind CSS', 'xterm.js', 'GSAP'].map((lib) => (
                      <span
                        key={lib}
                        className="font-jetbrains text-badge uppercase px-space-2 py-[4px] rounded-radius-sm"
                        style={{
                          backgroundColor: 'rgba(0,229,255,0.08)',
                          color: '#00E5FF',
                          border: '1px solid rgba(0,229,255,0.15)',
                        }}
                      >
                        {lib}
                      </span>
                    ))}
                  </div>
                </div>

                <p className="font-inter text-body-sm text-[#788DA1] mt-space-6">
                  {t('settings.educational')}
                </p>
              </div>
            </SettingSection>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetModal && <ResetModal onConfirm={handleReset} onCancel={() => setShowResetModal(false)} />}
    </div>
  )
}
