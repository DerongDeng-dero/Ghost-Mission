import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build, transform } from 'esbuild'

const contractUrl = new URL('../src/store/settingsContract.ts', import.meta.url)
const contractSource = readFileSync(contractUrl, 'utf8')
const transformedContract = await transform(contractSource, {
  loader: 'ts',
  format: 'esm',
  target: 'es2022',
})
const contract = await import(`data:text/javascript;base64,${Buffer.from(transformedContract.code).toString('base64')}`)

let checks = 0
const check = (condition, message) => {
  assert.ok(condition, message)
  checks += 1
}

const defaults = { ...contract.DEFAULT_APP_SETTINGS }
check(contract.normalizeAppSettings(defaults) !== null, 'default settings must satisfy their own contract')
check(defaults.animationIntensity === 'system', 'fresh installs must follow the operating-system motion preference')
check(
  contract.parseSettingsEnvelope(contract.serializeSettings(defaults))?.scrollbackLines === 5000,
  'settings envelope must round-trip',
)
const legacySettings = { ...defaults, animationIntensity: 'full' }
const migratedLegacySettings = contract.parseSettingsEnvelope(JSON.stringify({
  schema: contract.SETTINGS_SCHEMA,
  version: 1,
  settings: legacySettings,
}))
check(
  migratedLegacySettings?.animationIntensity === 'system',
  'v1 Full must migrate to Follow System because that was its actual behavior',
)

for (const [setting, systemReduced, reducedMotion, skipAnimations] of [
  ['system', false, 'never', false],
  ['system', true, 'always', false],
  ['full', false, 'never', false],
  ['full', true, 'never', false],
  ['reduced', false, 'always', false],
  ['reduced', true, 'always', false],
  ['none', false, 'always', true],
  ['none', true, 'always', true],
]) {
  const policy = contract.getAppMotionPolicy(setting, systemReduced)
  check(
    policy.reducedMotion === reducedMotion && policy.skipAnimations === skipAnimations,
    `${setting} with systemReduced=${systemReduced}: MotionConfig policy must match the setting label`,
  )
}
for (const [setting, reducedByConfig, expected] of [
  ['system', false, true],
  ['system', true, false],
  ['full', false, true],
  ['full', true, true],
  ['reduced', false, false],
  ['reduced', true, false],
  ['none', false, false],
  ['none', true, false],
]) {
  check(
    contract.allowsContinuousMotion(setting, reducedByConfig) === expected,
    `${setting} with reducedByConfig=${reducedByConfig}: continuous-motion policy drifted`,
  )
}

for (const invalid of [
  null,
  [],
  {},
  { ...defaults, animationIntensity: 'turbo' },
  { ...defaults, animationIntensity: ['full'] },
  { ...defaults, animationIntensity: { toString: 'full' } },
  { ...defaults, fontSize: 10 },
  { ...defaults, fontSize: 17 },
  { ...defaults, fontSize: 13.5 },
  { ...defaults, fontFamily: 'serif' },
  { ...defaults, fontFamily: ['Fira Code'] },
  { ...defaults, cursorStyle: 'beam' },
  { ...defaults, cursorStyle: ['block'] },
  { ...defaults, scrollbackLines: 999999 },
  { ...defaults, scrollbackLines: '5000' },
  { ...defaults, scrollbackLines: ['5000'] },
  { ...defaults, keyboardHints: 'yes' },
]) {
  check(contract.normalizeAppSettings(invalid) === null, `invalid settings must fail closed: ${JSON.stringify(invalid)}`)
}

check(contract.parseSettingsEnvelope('{"schema":"wrong","version":1,"settings":{}}') === null, 'wrong schema must be rejected')
check(
  contract.parseSettingsEnvelope(JSON.stringify({
    schema: contract.SETTINGS_SCHEMA,
    version: 1,
    settings: { ...legacySettings, animationIntensity: ['full'] },
  })) === null,
  'legacy migration must reject coercible non-string motion values',
)
check(contract.parseSettingsEnvelope('x'.repeat(contract.MAX_SETTINGS_STORAGE_CODE_UNITS + 1)) === null, 'oversized storage must be rejected before parsing')

const storageValues = new Map()
const storageListeners = new Set()
let rejectWrites = false
const localStorage = {
  getItem(key) {
    return storageValues.get(key) ?? null
  },
  setItem(key, value) {
    if (rejectWrites) throw new Error('quota denied')
    storageValues.set(key, String(value))
  },
}
storageValues.set('ghostops_settings_v1', JSON.stringify({
  schema: contract.SETTINGS_SCHEMA,
  version: 1,
  settings: legacySettings,
}))
globalThis.window = {
  localStorage,
  addEventListener(type, listener) {
    if (type === 'storage') storageListeners.add(listener)
  },
  removeEventListener(type, listener) {
    if (type === 'storage') storageListeners.delete(listener)
  },
}

const bundledStore = await build({
  entryPoints: [fileURLToPath(new URL('../src/store/settingsStore.ts', import.meta.url))],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  write: false,
})
const bundledStoreDataUrl = `data:text/javascript;base64,${Buffer.from(bundledStore.outputFiles[0].text).toString('base64')}`
const storeModule = await import(bundledStoreDataUrl)
const store = storeModule.useSettingsStore

check(store.getState().fontSize === 13, 'store must start from validated defaults')
check(store.getState().animationIntensity === 'system', 'store must load the migrated v1 motion policy')
check(storageValues.has(storeModule.SETTINGS_STORAGE_KEY), 'legacy settings must migrate into the v2 storage key')
check(store.getState().persistenceStatus === 'ready', 'a persisted legacy migration must start without an error state')
check(store.getState().setSetting('fontSize', 16) === true, 'valid setting must persist')
check(store.getState().fontSize === 16 && store.getState().persistenceStatus === 'saved', 'valid setting must apply and report saved')
check(storageValues.has(storeModule.SETTINGS_STORAGE_KEY), 'valid setting must write the versioned storage key')
check(store.getState().setSetting('fontSize', 99) === false, 'runtime-invalid setting must be rejected')
check(store.getState().fontSize === 16, 'rejected setting must not mutate active state')

rejectWrites = true
check(store.getState().setSetting('blinkCursor', false) === false, 'storage failure must be reported')
check(store.getState().blinkCursor === false && store.getState().persistenceStatus === 'error', 'storage failure must retain a session-only setting')
rejectWrites = false

const externalSettings = { ...defaults, keyboardHints: false, scoreDisplay: false }
for (const listener of storageListeners) {
  listener({
    storageArea: localStorage,
    key: storeModule.SETTINGS_STORAGE_KEY,
    newValue: contract.serializeSettings(externalSettings),
  })
}
check(store.getState().keyboardHints === false && store.getState().scoreDisplay === false, 'valid cross-tab storage event must reconcile settings')

storageValues.clear()
storageValues.set(storeModule.LEGACY_SETTINGS_STORAGE_KEY, JSON.stringify({
  schema: contract.SETTINGS_SCHEMA,
  version: 1,
  settings: legacySettings,
}))
rejectWrites = true
const failedMigrationModule = await import(`${bundledStoreDataUrl}#migration-write-failure`)
const failedMigrationState = failedMigrationModule.useSettingsStore.getState()
check(failedMigrationState.animationIntensity === 'system', 'failed migration writes must keep the safely migrated session value')
check(failedMigrationState.persistenceStatus === 'error', 'failed migration writes must surface an initial persistence error')
check(!storageValues.has(storeModule.SETTINGS_STORAGE_KEY), 'failed migration writes must not claim that v2 was persisted')
rejectWrites = false

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const layoutSource = readFileSync(new URL('../src/components/Layout.tsx', import.meta.url), 'utf8')
const terminalSource = readFileSync(new URL('../src/components/terminal/TerminalEmulator.tsx', import.meta.url), 'utf8')
const cockpitSource = readFileSync(new URL('../src/pages/TerminalCockpit.tsx', import.meta.url), 'utf8')
const settingsPageSource = readFileSync(new URL('../src/pages/Settings.tsx', import.meta.url), 'utf8')
const academySource = readFileSync(new URL('../src/pages/Academy.tsx', import.meta.url), 'utf8')
const homeSource = readFileSync(new URL('../src/pages/Home.tsx', import.meta.url), 'utf8')
const missionReportSource = readFileSync(new URL('../src/components/debrief/MissionReport.tsx', import.meta.url), 'utf8')
const navbarSource = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8')
check(appSource.includes("root.dataset.motion = animationIntensity"), 'animation setting must reach the document root')
check(appSource.includes('getAppMotionPolicy(animationIntensity, systemReducedMotion)'), 'App must derive MotionConfig from the tested policy')
check(appSource.includes("mediaQuery.addEventListener('change', update)"), 'System motion preference must update without a reload')
check(appSource.includes("mediaQuery.removeEventListener('change', update)"), 'System motion listener must be cleaned up')
check(appSource.includes('reducedMotion={motionPolicy.reducedMotion}'), 'MotionConfig must consume the tested reduced-motion policy')
check(appSource.includes('skipAnimations={motionPolicy.skipAnimations}'), 'None must skip non-positional Motion animations too')
for (const motionConsumer of [
  '../src/pages/Settings.tsx',
  '../src/pages/Academy.tsx',
  '../src/pages/Home.tsx',
  '../src/pages/Debrief.tsx',
  '../src/components/Navbar.tsx',
  '../src/components/atlas/CommandGraph3D.tsx',
  '../src/components/guide/GhostGuide3D.tsx',
  '../src/components/debrief/CommandTimeline.tsx',
  '../src/components/debrief/MissionReport.tsx',
  '../src/components/profile/SkillTreeMini.tsx',
  '../src/components/profile/StatsPanel.tsx',
  '../src/components/terminal/TerminalEmulator.tsx',
]) {
  const source = readFileSync(new URL(motionConsumer, import.meta.url), 'utf8')
  check(source.includes('useReducedMotionConfig'), `${motionConsumer} must honor the app motion setting`)
}
const commandGraphSource = readFileSync(new URL('../src/components/atlas/CommandGraph3D.tsx', import.meta.url), 'utf8')
check(
  commandGraphSource.includes('const shouldReduceMotion = useReducedMotionConfig() ?? false'),
  'command graph must derive its D3 motion policy from MotionConfig',
)
check(
  commandGraphSource.includes('simulation.tick(stabilizationTicks)')
    && commandGraphSource.includes('simulation.stop()')
    && commandGraphSource.includes('renderPositions()'),
  'reduced command graph must synchronously settle, stop, and render once',
)
check(
  commandGraphSource.includes('const highlightDuration = shouldReduceMotion ? 0 : 150')
    && commandGraphSource.includes('const resetDuration = shouldReduceMotion ? 0 : 300')
    && commandGraphSource.includes("transition: shouldReduceMotion ? 'none' : 'height 0.3s ease'"),
  'reduced command graph interactions and expansion must have zero-duration transitions',
)
check(
  commandGraphSource.includes('if (!shouldReduceMotion && !event.active) simulation.alphaTarget(0.3).restart()'),
  'reduced command graph drag must not restart the force simulation',
)
check(
  settingsPageSource.includes("el.scrollIntoView({ behavior: shouldReduceMotion ? 'auto' : 'smooth'")
    && academySource.includes("behavior: shouldReduceMotion ? 'auto' : 'smooth'"),
  'programmatic scroll must derive smooth behavior from MotionConfig',
)
check(
  settingsPageSource.includes('const animationIntensityLabelId = useId()')
    && settingsPageSource.includes('id={animationIntensityLabelId}')
    && settingsPageSource.includes('role="group"')
    && settingsPageSource.includes('aria-labelledby={animationIntensityLabelId}'),
  'animation intensity choices must expose a programmatically labelled group',
)
check(
  homeSource.includes("reduceMotion ? '' : 'animate-pulse'")
    && missionReportSource.includes("showCursor && !shouldReduceMotion ? 'animate-pulse' : ''")
    && terminalSource.includes("shouldReduceMotion ? '' : 'animate-spin'"),
  'CSS utility animations must be gated by MotionConfig instead of the OS media query',
)
check(
  navbarSource.includes('{!shouldReduceMotion && (')
    && navbarSource.includes('<animate attributeName="opacity"'),
  'navbar cursor animation must render only when MotionConfig allows motion',
)
for (const [consumer, source] of [
  ['Settings', settingsPageSource],
  ['Academy', academySource],
  ['Home', homeSource],
  ['MissionReport', missionReportSource],
  ['TerminalEmulator', terminalSource],
  ['Navbar', navbarSource],
]) {
  check(!source.includes('motion-reduce:'), `${consumer} must not bypass MotionConfig with motion-reduce utilities`)
  check(!source.includes('prefers-reduced-motion'), `${consumer} must not read the OS preference outside MotionConfig`)
}
check(!layoutSource.includes('href="#main-content"'), 'skip control must not corrupt the HashRouter route')
check(layoutSource.includes("main.focus({ preventScroll: true })"), 'skip control must move focus to main content')
for (const option of ['fontFamily', 'fontSize', 'cursorStyle', 'cursorBlink', 'scrollback']) {
  check(terminalSource.includes(`term.options.${option}`), `xterm must consume ${option}`)
}
for (const setting of ['keyboardHints', 'timerDisplay', 'scoreDisplay']) {
  check(cockpitSource.includes(`useSettingsStore(state => state.${setting})`), `cockpit must consume ${setting}`)
}

console.log(`Settings validation passed (${checks} checks).`)
