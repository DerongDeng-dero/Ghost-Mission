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
check(
  contract.parseSettingsEnvelope(contract.serializeSettings(defaults))?.scrollbackLines === 5000,
  'settings envelope must round-trip',
)

for (const invalid of [
  null,
  [],
  {},
  { ...defaults, animationIntensity: 'turbo' },
  { ...defaults, fontSize: 10 },
  { ...defaults, fontSize: 17 },
  { ...defaults, fontSize: 13.5 },
  { ...defaults, fontFamily: 'serif' },
  { ...defaults, cursorStyle: 'beam' },
  { ...defaults, scrollbackLines: 999999 },
  { ...defaults, keyboardHints: 'yes' },
]) {
  check(contract.normalizeAppSettings(invalid) === null, `invalid settings must fail closed: ${JSON.stringify(invalid)}`)
}

check(contract.parseSettingsEnvelope('{"schema":"wrong","version":1,"settings":{}}') === null, 'wrong schema must be rejected')
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
const storeModule = await import(`data:text/javascript;base64,${Buffer.from(bundledStore.outputFiles[0].text).toString('base64')}`)
const store = storeModule.useSettingsStore

check(store.getState().fontSize === 13, 'store must start from validated defaults')
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

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const layoutSource = readFileSync(new URL('../src/components/Layout.tsx', import.meta.url), 'utf8')
const terminalSource = readFileSync(new URL('../src/components/terminal/TerminalEmulator.tsx', import.meta.url), 'utf8')
const cockpitSource = readFileSync(new URL('../src/pages/TerminalCockpit.tsx', import.meta.url), 'utf8')
check(appSource.includes("root.dataset.motion = animationIntensity"), 'animation setting must reach the document root')
check(appSource.includes("skipAnimations={animationIntensity === 'none'}"), 'None must skip non-positional Motion animations too')
for (const motionConsumer of [
  '../src/pages/Home.tsx',
  '../src/pages/Debrief.tsx',
  '../src/components/guide/GhostGuide3D.tsx',
  '../src/components/debrief/CommandTimeline.tsx',
  '../src/components/debrief/MissionReport.tsx',
  '../src/components/profile/SkillTreeMini.tsx',
  '../src/components/profile/StatsPanel.tsx',
]) {
  const source = readFileSync(new URL(motionConsumer, import.meta.url), 'utf8')
  check(source.includes('useReducedMotionConfig'), `${motionConsumer} must honor the app motion setting`)
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
