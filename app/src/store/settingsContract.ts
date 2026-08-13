export type AnimationIntensity = 'system' | 'full' | 'reduced' | 'none'
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

export interface AppMotionPolicy {
  reducedMotion: 'user' | 'always' | 'never'
  skipAnimations: boolean
}

export const SETTINGS_SCHEMA = 'ghostops_settings' as const
export const SETTINGS_VERSION = 2 as const
export const MAX_SETTINGS_STORAGE_CODE_UNITS = 16_384

export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = Object.freeze({
  animationIntensity: 'system',
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

export function getAppMotionPolicy(
  animationIntensity: AnimationIntensity,
  systemReducedMotion: boolean,
): AppMotionPolicy {
  if (animationIntensity === 'full') {
    return { reducedMotion: 'never', skipAnimations: false }
  }
  if (animationIntensity === 'system') {
    return {
      reducedMotion: systemReducedMotion ? 'always' : 'never',
      skipAnimations: false,
    }
  }
  return {
    reducedMotion: 'always',
    skipAnimations: animationIntensity === 'none',
  }
}

export function allowsContinuousMotion(
  animationIntensity: AnimationIntensity,
  reducedByConfig: boolean,
): boolean {
  return animationIntensity === 'full'
    || (animationIntensity === 'system' && !reducedByConfig)
}

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
    typeof animationIntensity !== 'string'
    || !['system', 'full', 'reduced', 'none'].includes(animationIntensity)
    || typeof crtScanlines !== 'boolean'
    || typeof keyboardHints !== 'boolean'
    || !Number.isInteger(fontSize)
    || Number(fontSize) < 11
    || Number(fontSize) > 16
    || typeof fontFamily !== 'string'
    || !['Fira Code', 'JetBrains Mono'].includes(fontFamily)
    || typeof cursorStyle !== 'string'
    || !['block', 'line', 'bar'].includes(cursorStyle)
    || typeof blinkCursor !== 'boolean'
    || typeof scrollbackLines !== 'number'
    || ![1000, 5000, 10000].includes(scrollbackLines)
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
    if (parsed.schema !== SETTINGS_SCHEMA) return null
    if (parsed.version === SETTINGS_VERSION) return normalizeAppSettings(parsed.settings)
    if (parsed.version !== 1 || !isRecord(parsed.settings)) return null

    const legacyIntensity = parsed.settings.animationIntensity
    if (
      typeof legacyIntensity !== 'string'
      || !['full', 'reduced', 'none'].includes(legacyIntensity)
    ) return null
    return normalizeAppSettings({
      ...parsed.settings,
      // v1 "full" still deferred to the operating-system preference. Preserve
      // that behavior during migration; users can now explicitly choose Full.
      animationIntensity: legacyIntensity === 'full' ? 'system' : legacyIntensity,
    })
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
