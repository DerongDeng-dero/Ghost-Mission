import { create } from 'zustand'
import {
  DEFAULT_APP_SETTINGS,
  MAX_SETTINGS_STORAGE_CODE_UNITS,
  normalizeAppSettings,
  parseSettingsEnvelope,
  serializeSettings,
  type AppSettings,
} from './settingsContract'

export const SETTINGS_STORAGE_KEY = 'ghostops_settings_v2'
export const LEGACY_SETTINGS_STORAGE_KEY = 'ghostops_settings_v1'

export type SettingsPersistenceStatus = 'ready' | 'saved' | 'error'
interface LoadedSettings {
  settings: AppSettings
  persistenceStatus: SettingsPersistenceStatus
}

interface SettingsStore extends AppSettings {
  persistenceStatus: SettingsPersistenceStatus
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => boolean
  resetSettings: () => boolean
}

function loadSettings(): LoadedSettings {
  try {
    if (typeof window === 'undefined') {
      return { settings: { ...DEFAULT_APP_SETTINGS }, persistenceStatus: 'ready' }
    }
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (raw !== null) {
      const parsed = parseSettingsEnvelope(raw)
      return parsed === null
        ? { settings: { ...DEFAULT_APP_SETTINGS }, persistenceStatus: 'error' }
        : { settings: parsed, persistenceStatus: 'ready' }
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_SETTINGS_STORAGE_KEY)
    if (legacyRaw === null) {
      return { settings: { ...DEFAULT_APP_SETTINGS }, persistenceStatus: 'ready' }
    }
    const migrated = parseSettingsEnvelope(legacyRaw)
    if (migrated === null) {
      return { settings: { ...DEFAULT_APP_SETTINGS }, persistenceStatus: 'error' }
    }
    return {
      settings: migrated,
      persistenceStatus: persistSettings(migrated) ? 'ready' : 'error',
    }
  } catch {
    return { settings: { ...DEFAULT_APP_SETTINGS }, persistenceStatus: 'error' }
  }
}

function persistSettings(settings: AppSettings): boolean {
  try {
    if (typeof window === 'undefined') return false
    const serialized = serializeSettings(settings)
    if (serialized.length > MAX_SETTINGS_STORAGE_CODE_UNITS) return false
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, serialized)
    return window.localStorage.getItem(SETTINGS_STORAGE_KEY) === serialized
  } catch {
    return false
  }
}

function settingsFromStore(state: SettingsStore): AppSettings {
  return {
    animationIntensity: state.animationIntensity,
    crtScanlines: state.crtScanlines,
    keyboardHints: state.keyboardHints,
    fontSize: state.fontSize,
    fontFamily: state.fontFamily,
    cursorStyle: state.cursorStyle,
    blinkCursor: state.blinkCursor,
    scrollbackLines: state.scrollbackLines,
    timerDisplay: state.timerDisplay,
    scoreDisplay: state.scoreDisplay,
  }
}

const initialLoad = loadSettings()

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...initialLoad.settings,
  persistenceStatus: initialLoad.persistenceStatus,
  setSetting: (key, value) => {
    const candidate = normalizeAppSettings({
      ...settingsFromStore(get()),
      [key]: value,
    })
    if (candidate === null) return false
    const persisted = persistSettings(candidate)
    set({ ...candidate, persistenceStatus: persisted ? 'saved' : 'error' })
    return persisted
  },
  resetSettings: () => {
    const candidate = { ...DEFAULT_APP_SETTINGS }
    const persisted = persistSettings(candidate)
    set({ ...candidate, persistenceStatus: persisted ? 'saved' : 'error' })
    return persisted
  },
}))

if (typeof window !== 'undefined') {
  const handleSettingsStorage = (event: StorageEvent) => {
    if (event.storageArea !== window.localStorage || event.key !== SETTINGS_STORAGE_KEY) return
    const settings = event.newValue === null
      ? { ...DEFAULT_APP_SETTINGS }
      : parseSettingsEnvelope(event.newValue)
    if (settings === null) return
    useSettingsStore.setState({ ...settings, persistenceStatus: 'ready' })
  }

  window.addEventListener('storage', handleSettingsStorage)
  if (import.meta.hot) {
    import.meta.hot.dispose(() => window.removeEventListener('storage', handleSettingsStorage))
  }
}
