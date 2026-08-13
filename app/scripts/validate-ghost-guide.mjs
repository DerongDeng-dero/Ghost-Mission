import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const modelUrl = new URL('../src/components/guide/ghostGuideModel.ts', import.meta.url)
const guideUrl = new URL('../src/components/guide/GhostGuide3D.tsx', import.meta.url)
const avatarUrl = new URL('../src/components/guide/GhostAvatar3D.tsx', import.meta.url)
const fallbackUrl = new URL('../src/components/guide/GhostAvatarFallback.tsx', import.meta.url)

const bundledModel = await build({
  entryPoints: [fileURLToPath(modelUrl)],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  write: false,
})
const model = await import(
  `data:text/javascript;base64,${Buffer.from(bundledModel.outputFiles[0].text).toString('base64')}`
)

let checks = 0
const check = (condition, message) => {
  assert.ok(condition, message)
  checks += 1
}

const quips = model.GHOST_QUIPS
check(Array.isArray(quips) && quips.length >= 80, 'the lazy banter catalogue must contain at least 80 quips')
check(new Set(quips.map((quip) => quip.id)).size === quips.length, 'quip ids must be unique')
check(new Set(quips.map((quip) => quip.key)).size === quips.length, 'quip keys must be unique')
check(model.RECENT_QUIP_WINDOW >= 12, 'the recent-history window must prevent at least 12 repeats')

const validMoods = new Set(['idle', 'curious', 'mischievous', 'proud', 'startled'])
const validRoutes = new Set([
  'global', 'home', 'missions', 'academy', 'atlas', 'terminal',
  'profile', 'debrief', 'settings', 'unknown',
])
for (const quip of quips) {
  check(typeof quip.id === 'string' && /^[a-z]+-\d{2}$/.test(quip.id), `${quip.id}: invalid quip id`)
  check(validMoods.has(quip.mood), `${quip.id}: invalid mood`)
  check(validRoutes.has(quip.route), `${quip.id}: invalid route`)
  for (const language of ['en', 'zh']) {
    const text = quip.text?.[language]
    check(typeof text === 'string' && text.trim() === text && text.length >= 8, `${quip.id}: missing ${language} text`)
    check(text.length <= 180, `${quip.id}: ${language} text is too long for the bubble`)
    check(!/[<>]|\$\{|dangerouslySetInnerHTML/i.test(text), `${quip.id}: ${language} text contains unsafe markup or interpolation`)
  }
}

for (const route of validRoutes) {
  if (route === 'global') continue
  check(quips.some((quip) => quip.route === route), `${route}: needs contextual commentary`)
}
check(quips.filter((quip) => quip.route === 'global').length >= 32, 'the global shuffle bag needs enough variety')

check(model.getAutoQuipDelayMs(true, 0) === 45_000, 'first auto quip must wait at least 45 seconds')
check(model.getAutoQuipDelayMs(true, 1) === 75_000, 'first auto quip must stay within 75 seconds')
check(model.getAutoQuipDelayMs(false, 0) === 45_000, 'subsequent auto quips must wait at least 45 seconds')
check(model.getAutoQuipDelayMs(false, 1) === 110_000, 'subsequent auto quips must stay within 110 seconds')

const pool = quips.slice(0, 32)
const recentIds = pool.slice(0, model.RECENT_QUIP_WINDOW).map((quip) => quip.id)
const firstBag = model.buildQuipShuffleBag(pool, recentIds, 0.314159)
const secondBag = model.buildQuipShuffleBag(pool, recentIds, 0.314159)
check(firstBag.length === pool.length - recentIds.length, 'shuffle bag must exclude the recent window')
check(new Set(firstBag).size === firstBag.length, 'shuffle bag must not repeat indices')
check(firstBag.every((index) => Number.isInteger(index) && index >= 0 && index < pool.length), 'shuffle bag indices must stay in bounds')
check(JSON.stringify(firstBag) === JSON.stringify(secondBag), 'seeded shuffle bag must be deterministic')
check(firstBag.every((index) => !recentIds.includes(pool[index].id)), 'shuffle bag must not replay recent ids')

for (const [pathname, expected] of [
  ['/', 'home'], ['/missions', 'missions'], ['/academy/', 'academy'], ['/atlas', 'atlas'],
  ['/terminal/whoami-shell', 'terminal'], ['/profile', 'profile'],
  ['/debrief/whoami-shell', 'debrief'], ['/settings', 'settings'], ['/missing', 'unknown'],
]) {
  check(model.routeFromPathname(pathname) === expected, `${pathname}: route classification drifted`)
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 320, height: 568 },
  { width: 120, height: 480 },
]) {
  const path = model.buildPerimeterPath(viewport, 80)
  check(path.length >= 4, `${viewport.width}x${viewport.height}: perimeter path is incomplete`)
  check(path.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)), `${viewport.width}x${viewport.height}: path must be finite`)
  check(path.every((point) => point.x >= 0 && point.y >= 0), `${viewport.width}x${viewport.height}: path must not use negative coordinates`)
  check(path.every((point) => point.x + 80 <= viewport.width && point.y + 80 <= viewport.height), `${viewport.width}x${viewport.height}: avatar must remain visible`)
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1]
    const current = path[index]
    check(previous.x === current.x || previous.y === current.y, `${viewport.width}x${viewport.height}: route must follow an edge, not cross content`)
  }
  if (path.length > 1) {
    const first = path[0]
    const last = path.at(-1)
    check(first.x === last.x || first.y === last.y, `${viewport.width}x${viewport.height}: closing segment must remain on the perimeter`)
  }
}
const malformedPath = model.buildPerimeterPath({ width: Number.NaN, height: -1 }, Number.POSITIVE_INFINITY)
check(malformedPath.length >= 4, 'malformed viewport input must fall back safely')
check(malformedPath.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)), 'fallback path must remain finite')

const guideSource = readFileSync(guideUrl, 'utf8')
const avatarSource = readFileSync(avatarUrl, 'utf8')
const fallbackSource = readFileSync(fallbackUrl, 'utf8')

for (const token of [
  "import('./GhostAvatar3D')",
  "import('./ghostGuideModel')",
  "const movementAllowed = animationIntensity === 'full' && !reducedByConfig",
  'if (movementAllowed) setShouldLoad3D(true)',
  'const renderDeferredAvatar = shouldLoad3D && movementAllowed',
  'useReducedMotionConfig',
  'window.visualViewport',
  'document.hidden',
  'MutationObserver',
  "attributeFilter: ['open', 'hidden', 'aria-hidden', 'aria-modal', 'data-state']",
  'isTextEntry(document.activeElement)',
  '[contenteditable]:not([contenteditable="false"])',
  'aria-live={message.source === \'manual\' ? \'polite\' : \'off\'}',
  'pointer-events-none fixed inset-0',
  'pointer-events-auto relative',
]) {
  check(guideSource.includes(token), `guide runtime contract missing ${token}`)
}
for (const token of [
  'setIsHovered(false)',
  'setIsFocusWithin(false)',
  'setIsPointerDown(false)',
  'if (dialogOpen) return null',
  'width: Math.min(300, Math.max(1, viewport.width - 24))',
  'observer.disconnect()',
  "window.visualViewport?.removeEventListener('resize', updateViewport)",
  "window.visualViewport?.removeEventListener('scroll', updateViewport)",
]) {
  check(guideSource.includes(token), `guide recovery or cleanup contract missing ${token}`)
}
const patrolTransformIndex = guideSource.indexOf('style={{ x, y }}')
const hoverTransformIndex = guideSource.indexOf('whileHover={movementAllowed')
check(
  patrolTransformIndex >= 0 && hoverTransformIndex > patrolTransformIndex,
  'perimeter translation and hover transform must remain on nested elements',
)
check(
  guideSource.includes("import type { GhostMood, GhostQuip, PerimeterPoint } from './ghostGuideModel'"),
  'the initial guide may import only model types statically',
)
check(!guideSource.includes('setInterval('), 'automatic banter must use one-shot timers, not catch-up intervals')
check(!guideSource.includes('dangerouslySetInnerHTML'), 'guide messages must render as text')

for (const token of [
  'canvas.getBoundingClientRect()',
  'const centerX = rect.left + rect.width / 2',
  'const centerY = rect.top + rect.height / 2',
  "window.addEventListener('pointermove'",
  "document.addEventListener('visibilitychange'",
  "canvas.addEventListener('webglcontextlost'",
  'ResizeObserver',
  'const failToFallback = (phase: string, error?: unknown) =>',
  'if (!mounted || fallbackRequested) return',
  'if (mounted) setWebglUnavailable(true)',
  "failToFallback('WebGL initialization failed'",
  "failToFallback('Animation frame failed'",
  "failToFallback('Static render failed'",
  "failToFallback('Canvas resize failed'",
  "failToFallback('WebGL context was lost')",
  'window.cancelAnimationFrame(frameId)',
  'resizeObserver?.disconnect()',
  'disposeSceneResources',
  'renderer?.dispose()',
  'MAX_DEVICE_PIXEL_RATIO = 1.5',
  'Math.min((timestamp - lastFrameTime) / 1000, 1 / 20)',
]) {
  check(avatarSource.includes(token), `3D lifecycle contract missing ${token}`)
}
check(!avatarSource.includes('forceContextLoss('), 'normal teardown must not force a noisy WebGL context loss')
check(!avatarSource.includes('event.clientX / window.innerWidth'), 'eye tracking must stay relative to the avatar center')
check(fallbackSource.includes('useId'), 'SVG fallback ids must be unique across instances')
check(!avatarSource.includes('Math.random('), '3D particle layout must be deterministic')

console.log(`Ghost guide OK: ${quips.length} bilingual quips and ${checks} adversarial checks passed.`)
