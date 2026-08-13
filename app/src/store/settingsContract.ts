export type AnimationIntensity = 'full' | 'reduced' | 'none'
export type TerminalCursorStyle = 'block' | 'line' | 'bar'
export type TerminalFontFamily = 'Fira Code' | 'JetBrains Mono'

export interface AppSettings {
  animationIntensity: AnimationIntensity
  crtScanlines: boolean
  keyboardHints: boolean
  fontSize: number
  fontFamily: TerminalFontFamily
  cursorStyle: TerminalCursorStyle
  blinkCursor: boolean
  scrollbackLines: 1000 | 5000 | 10000
  timerDisplay: boolean
  scoreDisplay: boolean
}

export const SETTINGS_SCHEMA = 'ghostops_settings' as const
export const SETTINGS_VERSION = 1 as const
export const MAX_SETTINGS_STORAGE_CODE_UNITS = 16_384

export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = Object.freeze({
  animationIntensity: 'full',
  crtScanlines: false,
  keyboardHints: true,
  fontSize: 13,
  fontFamily: 'Fira Code',
  cursorStyle: 'block',
  blinkCursor: true,
  scrollbackLines: 5000,
  timerDisplay: true,
  scoreDisplay: true,
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeAppSettings(value: unknown): AppSettings | null {
  if (!isRecord(value)) return null

  const {
    animationIntensity,
    crtScanlines,
    keyboardHints,
    fontSize,
    fontFamily,
    cursorStyle,
    blinkCursor,
    scrollbackLines,
    timerDisplay,
    scoreDisplay,
  } = value

  if (
    !['full', 'reduced', 'none'].includes(String(animationIntensity))
    || typeof crtScanlines !== 'boolean'
    || typeof keyboardHints !== 'boolean'
    || !Number.isInteger(fontSize)
    || Number(fontSize) < 11
    || Number(fontSize) > 16
    || !['Fira Code', 'JetBrains Mono'].includes(String(fontFamily))
    || !['block', 'line', 'bar'].includes(String(cursorStyle))
    || typeof blinkCursor !== 'boolean'
    || ![1000, 5000, 10000].includes(Number(scrollbackLines))
    || typeof timerDisplay !== 'boolean'
    || typeof scoreDisplay !== 'boolean'
  ) {
    return null
  }

  return {
    animationIntensity: animationIntensity as AnimationIntensity,
    crtScanlines,
    keyboardHints,
    fontSize: Number(fontSize),
    fontFamily: fontFamily as TerminalFontFamily,
    cursorStyle: cursorStyle as TerminalCursorStyle,
    blinkCursor,
    scrollbackLines: Number(scrollbackLines) as AppSettings['scrollbackLines'],
    timerDisplay,
    scoreDisplay,
  }
}

export function parseSettingsEnvelope(raw: string): AppSettings | null {
  if (raw.length > MAX_SETTINGS_STORAGE_CODE_UNITS) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    if (parsed.schema !== SETTINGS_SCHEMA || parsed.version !== SETTINGS_VERSION) return null
    return normalizeAppSettings(parsed.settings)
  } catch {
    return null
  }
}

export function serializeSettings(settings: AppSettings): string {
  return JSON.stringify({
    schema: SETTINGS_SCHEMA,
    version: SETTINGS_VERSION,
    settings,
  })
}
