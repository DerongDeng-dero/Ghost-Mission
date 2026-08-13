import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotionConfig,
} from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../store/settingsStore'
import { allowsContinuousMotion } from '../../store/settingsContract'
import GhostAvatarFallback from './GhostAvatarFallback'
import type { GhostMood, GhostQuip, PerimeterPoint } from './ghostGuideModel'

const AVATAR_SIZE = 80
const AUTO_BANTER_SESSION_KEY = 'ghostops_guide_auto_banter_paused'
const BLOCKING_DIALOG_SELECTOR = [
  'dialog[open]',
  '[aria-modal="true"]',
  '[role="dialog"]:not([aria-hidden="true"]):not([data-state="closed"])',
  '[role="alertdialog"]:not([aria-hidden="true"]):not([data-state="closed"])',
].join(', ')

type GhostGuideModel = typeof import('./ghostGuideModel')
type MessageSource = 'auto' | 'manual'

interface VisibleMessage {
  quip: GhostQuip
  source: MessageSource
  placement: ReturnType<typeof getBubblePlacement>
}

interface LiveViewport {
  width: number
  height: number
  offsetLeft: number
  offsetTop: number
}

interface GhostAvatarProps {
  reduceMotion: boolean
  mood: GhostMood
  isSpeaking: boolean
  isHovered: boolean
  interactionPulse: number
}

function StaticGhostAvatar(props: GhostAvatarProps) {
  return (
    <GhostAvatarFallback
      reduceMotion={props.reduceMotion}
      mood={props.mood}
      isSpeaking={props.isSpeaking}
      isHovered={props.isHovered}
    />
  )
}

const DeferredGhostAvatar3D = lazy<ComponentType<GhostAvatarProps>>(() => (
  import('./GhostAvatar3D')
    .then((module) => ({ default: module.default as ComponentType<GhostAvatarProps> }))
    .catch((error) => {
      console.warn('[Ghost avatar] The 3D chunk failed to load; using the static avatar.', error)
      return { default: StaticGhostAvatar }
    })
))

function readViewport(): LiveViewport {
  if (typeof window === 'undefined') {
    return { width: 320, height: 568, offsetLeft: 0, offsetTop: 0 }
  }
  const visualViewport = window.visualViewport
  return {
    width: Math.max(1, visualViewport?.width ?? window.innerWidth),
    height: Math.max(1, visualViewport?.height ?? window.innerHeight),
    offsetLeft: Math.max(0, visualViewport?.offsetLeft ?? 0),
    offsetTop: Math.max(0, visualViewport?.offsetTop ?? 0),
  }
}

function getFallbackDock(viewport: LiveViewport): PerimeterPoint {
  const sideInset = viewport.width < 640 ? 12 : 20
  const bottomInset = viewport.width < 640 ? 38 : 22
  return {
    x: Math.max(viewport.offsetLeft, viewport.offsetLeft + viewport.width - AVATAR_SIZE - sideInset),
    y: Math.max(viewport.offsetTop, viewport.offsetTop + viewport.height - AVATAR_SIZE - bottomInset),
    edge: 'bottom',
  }
}

function isTextEntry(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false
  return Boolean(element.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
  ))
}

function hasBlockingDialog(): boolean {
  if (typeof document === 'undefined') return false
  return [...document.querySelectorAll(BLOCKING_DIALOG_SELECTOR)].some((element) => (
    !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true'
  ))
}

function nearestPointIndex(path: readonly PerimeterPoint[], x: number, y: number): number {
  if (path.length === 0) return -1
  let closestIndex = 0
  let closestDistance = Number.POSITIVE_INFINITY
  path.forEach((point, index) => {
    const distance = (point.x - x) ** 2 + (point.y - y) ** 2
    if (distance < closestDistance) {
      closestIndex = index
      closestDistance = distance
    }
  })
  return closestIndex
}

function edgeForSegment(
  from: PerimeterPoint,
  to: PerimeterPoint,
  path: readonly PerimeterPoint[],
): PerimeterPoint['edge'] {
  const xs = path.map((point) => point.x)
  const ys = path.map((point) => point.y)
  const middleX = (Math.min(...xs) + Math.max(...xs)) / 2
  const middleY = (Math.min(...ys) + Math.max(...ys)) / 2
  if (Math.abs(from.x - to.x) < 1) return from.x <= middleX ? 'left' : 'right'
  return from.y <= middleY ? 'top' : 'bottom'
}

function getBubblePlacement(
  edge: PerimeterPoint['edge'],
  avatarX: number,
  avatarY: number,
  viewport: LiveViewport,
): { bubble: CSSProperties; tail: CSSProperties } {
  const compact = viewport.width < 520
  const midpointX = viewport.offsetLeft + viewport.width / 2
  const midpointY = viewport.offsetTop + viewport.height / 2
  const effectiveEdge = compact ? (avatarY > midpointY ? 'bottom' : 'top') : edge
  const alignToEnd = avatarX + AVATAR_SIZE / 2 > midpointX
  const alignToBottom = avatarY + AVATAR_SIZE / 2 > midpointY
  // Use the visual viewport rather than CSS `vw`: under pinch zoom the layout
  // viewport can be wider than the actually visible area.
  const bubble: CSSProperties = {
    width: Math.min(300, Math.max(1, viewport.width - 24)),
  }
  const tail: CSSProperties = {
    width: 12,
    height: 12,
    position: 'absolute',
    transform: 'rotate(45deg)',
    background: 'rgba(10, 14, 25, 0.98)',
  }

  if (effectiveEdge === 'bottom') {
    bubble.bottom = AVATAR_SIZE + 12
    if (alignToEnd) bubble.right = 0
    else bubble.left = 0
    tail.bottom = -6
    if (alignToEnd) tail.right = 30
    else tail.left = 30
    tail.borderRight = '1px solid rgba(0, 229, 255, 0.28)'
    tail.borderBottom = '1px solid rgba(0, 229, 255, 0.28)'
  } else if (effectiveEdge === 'top') {
    bubble.top = AVATAR_SIZE + 12
    if (alignToEnd) bubble.right = 0
    else bubble.left = 0
    tail.top = -6
    if (alignToEnd) tail.right = 30
    else tail.left = 30
    tail.borderLeft = '1px solid rgba(0, 229, 255, 0.28)'
    tail.borderTop = '1px solid rgba(0, 229, 255, 0.28)'
  } else if (effectiveEdge === 'left') {
    bubble.left = AVATAR_SIZE + 12
    if (alignToBottom) bubble.bottom = 0
    else bubble.top = 0
    tail.left = -6
    if (alignToBottom) tail.bottom = 30
    else tail.top = 30
    tail.borderLeft = '1px solid rgba(0, 229, 255, 0.28)'
    tail.borderBottom = '1px solid rgba(0, 229, 255, 0.28)'
  } else {
    bubble.right = AVATAR_SIZE + 12
    if (alignToBottom) bubble.bottom = 0
    else bubble.top = 0
    tail.right = -6
    if (alignToBottom) tail.bottom = 30
    else tail.top = 30
    tail.borderRight = '1px solid rgba(0, 229, 255, 0.28)'
    tail.borderTop = '1px solid rgba(0, 229, 255, 0.28)'
  }

  return { bubble, tail }
}

export default function GhostGuide3D() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const animationIntensity = useSettingsStore((state) => state.animationIntensity)
  const setSetting = useSettingsStore((state) => state.setSetting)
  const reducedByConfig = useReducedMotionConfig() ?? false
  const systemMotionPaused = animationIntensity === 'system' && reducedByConfig
  const movementAllowed = allowsContinuousMotion(animationIntensity, reducedByConfig)
  const messageId = useId()
  const [initialDock] = useState(() => getFallbackDock(readViewport()))
  const x = useMotionValue(initialDock.x)
  const y = useMotionValue(initialDock.y)
  const [model, setModel] = useState<GhostGuideModel | null>(null)
  const [message, setMessage] = useState<VisibleMessage | null>(null)
  const [viewport, setViewport] = useState<LiveViewport>(readViewport)
  const [targetIndex, setTargetIndex] = useState(1)
  const [shouldLoad3D, setShouldLoad3D] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [isFocusWithin, setIsFocusWithin] = useState(false)
  const [isPointerDown, setIsPointerDown] = useState(false)
  const [pageHidden, setPageHidden] = useState(() => typeof document !== 'undefined' && document.hidden)
  const [dialogOpen, setDialogOpen] = useState(hasBlockingDialog)
  const [textEntryActive, setTextEntryActive] = useState(() => (
    typeof document !== 'undefined' && isTextEntry(document.activeElement)
  ))
  const [interactionPulse, setInteractionPulse] = useState(0)
  const [autoBanterPaused, setAutoBanterPaused] = useState(() => {
    try {
      return typeof window !== 'undefined'
        && window.sessionStorage.getItem(AUTO_BANTER_SESSION_KEY) === 'true'
    } catch {
      return false
    }
  })

  const avatarButtonRef = useRef<HTMLButtonElement>(null)
  const mountedRef = useRef(true)
  const positionInitializedRef = useRef(false)
  const currentEdgeRef = useRef<PerimeterPoint['edge']>('bottom')
  const modelRef = useRef<GhostGuideModel | null>(null)
  const modelPromiseRef = useRef<Promise<GhostGuideModel | null> | null>(null)
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firstAutoQuipRef = useRef(true)
  const recentQuipIdsRef = useRef<string[]>([])
  const bagByPoolRef = useRef(new Map<string, number[]>())
  const selectionOrdinalRef = useRef(0)

  const requestModel = useCallback((): Promise<GhostGuideModel | null> => {
    if (modelRef.current) return Promise.resolve(modelRef.current)
    if (!modelPromiseRef.current) {
      modelPromiseRef.current = import('./ghostGuideModel')
        .then((loadedModel) => {
          modelRef.current = loadedModel
          if (mountedRef.current) setModel(loadedModel)
          return loadedModel
        })
        .catch((error) => {
          console.warn('[Ghost guide] Banter model failed to load.', error)
          modelPromiseRef.current = null
          return null
        })
    }
    return modelPromiseRef.current
  }, [])

  const hideMessage = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    const restoreAvatarFocus = event.detail === 0
    if (restoreAvatarFocus) avatarButtonRef.current?.focus({ preventScroll: true })
    if (messageTimerRef.current) {
      clearTimeout(messageTimerRef.current)
      messageTimerRef.current = null
    }
    setMessage(null)
    // Removing a focused close button does not reliably emit blur. Keyboard
    // activation hands focus to the avatar and keeps it still; pointer
    // activation releases the transient state so patrol can resume.
    setIsHovered(false)
    if (!restoreAvatarFocus) setIsFocusWithin(false)
    setIsPointerDown(false)
  }, [])

  const showMessage = useCallback((quip: GhostQuip, source: MessageSource) => {
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current)
    setMessage({
      quip,
      source,
      placement: getBubblePlacement(currentEdgeRef.current, x.get(), y.get(), viewport),
    })
  }, [viewport, x, y])

  const selectNextQuip = useCallback((loadedModel: GhostGuideModel): GhostQuip | null => {
    const available = loadedModel.getQuipsForPath(location.pathname)
    if (available.length === 0) return null
    const route = loadedModel.routeFromPathname(location.pathname)
    const contextual = available.filter((quip) => quip.route === route)
    const global = available.filter((quip) => quip.route === 'global')
    const preferContext = selectionOrdinalRef.current % 3 === 0
    selectionOrdinalRef.current += 1
    const pool = preferContext && contextual.length > 0 ? contextual : (global.length > 0 ? global : available)
    const poolKey = `${route}:${pool[0]?.route ?? 'all'}`
    let bag = bagByPoolRef.current.get(poolKey)
    if (!bag || bag.length === 0) {
      bag = loadedModel.buildQuipShuffleBag(
        pool,
        recentQuipIdsRef.current,
        Math.random(),
      )
      bagByPoolRef.current.set(poolKey, bag)
    }
    const index = bag.shift()
    const quip = index === undefined ? null : pool[index] ?? null
    if (!quip) return null
    recentQuipIdsRef.current.push(quip.id)
    if (recentQuipIdsRef.current.length > loadedModel.RECENT_QUIP_WINDOW) {
      recentQuipIdsRef.current.splice(
        0,
        recentQuipIdsRef.current.length - loadedModel.RECENT_QUIP_WINDOW,
      )
    }
    return quip
  }, [location.pathname])

  const requestAvatar = useCallback(() => {
    void requestModel()
    if (movementAllowed) setShouldLoad3D(true)
  }, [movementAllowed, requestModel])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current)
    }
  }, [])

  useEffect(() => {
    bagByPoolRef.current.clear()
    selectionOrdinalRef.current = 0
  }, [location.pathname])

  useEffect(() => {
    let cancelled = false
    const prepare = () => {
      void requestModel().then(() => {
        if (!cancelled && movementAllowed) setShouldLoad3D(true)
      })
    }
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (handle: number) => void
    }
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(prepare, { timeout: 2_500 })
      return () => {
        cancelled = true
        idleWindow.cancelIdleCallback?.(handle)
      }
    }
    const timer = window.setTimeout(prepare, 1_400)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [movementAllowed, requestModel])

  useEffect(() => {
    let frame = 0
    const updateViewport = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const nextViewport = readViewport()
        if (messageTimerRef.current) {
          clearTimeout(messageTimerRef.current)
          messageTimerRef.current = null
        }
        setMessage(null)
        setViewport((current) => (
          current.width === nextViewport.width
          && current.height === nextViewport.height
          && current.offsetLeft === nextViewport.offsetLeft
          && current.offsetTop === nextViewport.offsetTop
            ? current
            : nextViewport
        ))
      })
    }
    window.addEventListener('resize', updateViewport, { passive: true })
    window.visualViewport?.addEventListener('resize', updateViewport, { passive: true })
    window.visualViewport?.addEventListener('scroll', updateViewport, { passive: true })
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', updateViewport)
      window.visualViewport?.removeEventListener('resize', updateViewport)
      window.visualViewport?.removeEventListener('scroll', updateViewport)
    }
  }, [])

  useEffect(() => {
    const updateVisibility = () => setPageHidden(document.hidden)
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  useEffect(() => {
    let frame = 0
    const updateInteractionContext = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const nextDialogOpen = hasBlockingDialog()
        if (nextDialogOpen) {
          if (messageTimerRef.current) {
            clearTimeout(messageTimerRef.current)
            messageTimerRef.current = null
          }
          setMessage(null)
          // Removing a hovered/focused subtree does not reliably dispatch
          // pointerleave/blur. Clear transient input state so patrol can resume
          // after the modal closes.
          setIsHovered(false)
          setIsFocusWithin(false)
          setIsPointerDown(false)
        }
        setDialogOpen(nextDialogOpen)
        setTextEntryActive(isTextEntry(document.activeElement))
      })
    }
    const observer = new MutationObserver(updateInteractionContext)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open', 'hidden', 'aria-hidden', 'aria-modal', 'data-state'],
    })
    document.addEventListener('focusin', updateInteractionContext)
    document.addEventListener('focusout', updateInteractionContext)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      document.removeEventListener('focusin', updateInteractionContext)
      document.removeEventListener('focusout', updateInteractionContext)
    }
  }, [])

  useEffect(() => {
    const releasePointer = () => setIsPointerDown(false)
    window.addEventListener('pointerup', releasePointer)
    window.addEventListener('pointercancel', releasePointer)
    window.addEventListener('blur', releasePointer)
    return () => {
      window.removeEventListener('pointerup', releasePointer)
      window.removeEventListener('pointercancel', releasePointer)
      window.removeEventListener('blur', releasePointer)
    }
  }, [])

  const perimeterPath = useMemo(() => {
    if (!model) return [getFallbackDock(viewport)]
    return model.buildPerimeterPath(viewport, AVATAR_SIZE).map((point) => ({
      ...point,
      x: point.x + viewport.offsetLeft,
      y: point.y + viewport.offsetTop,
    }))
  }, [model, viewport])

  useEffect(() => {
    if (perimeterPath.length === 0) return
    const nearestIndex = movementAllowed && positionInitializedRef.current
      ? nearestPointIndex(perimeterPath, x.get(), y.get())
      : 0
    const safeIndex = Math.max(0, nearestIndex)
    const point = perimeterPath[safeIndex]
    if (!point) return
    x.set(point.x)
    y.set(point.y)
    currentEdgeRef.current = point.edge
    setTargetIndex(perimeterPath.length > 1 ? (safeIndex + 1) % perimeterPath.length : 0)
    positionInitializedRef.current = true
  }, [movementAllowed, perimeterPath, x, y])

  const interactionPaused = Boolean(message)
    || isHovered
    || isFocusWithin
    || isPointerDown
    || pageHidden
    || dialogOpen
    || textEntryActive

  useEffect(() => {
    if (messageTimerRef.current) {
      clearTimeout(messageTimerRef.current)
      messageTimerRef.current = null
    }
    if (!message || isHovered || isFocusWithin || pageHidden) return
    messageTimerRef.current = setTimeout(() => {
      setMessage(null)
      messageTimerRef.current = null
    }, message.source === 'manual' ? 10_000 : 8_000)
    return () => {
      if (messageTimerRef.current) {
        clearTimeout(messageTimerRef.current)
        messageTimerRef.current = null
      }
    }
  }, [isFocusWithin, isHovered, message, pageHidden])

  useEffect(() => {
    if (!movementAllowed || interactionPaused || perimeterPath.length < 2) return
    const target = perimeterPath[targetIndex % perimeterPath.length]
    if (!target) return
    const from = { x: x.get(), y: y.get(), edge: currentEdgeRef.current }
    const distance = Math.hypot(target.x - from.x, target.y - from.y)
    if (distance < 1) {
      const advanceTimer = window.setTimeout(() => {
        setTargetIndex((current) => (current + 1) % perimeterPath.length)
      }, 0)
      return () => window.clearTimeout(advanceTimer)
    }

    currentEdgeRef.current = edgeForSegment(from, target, perimeterPath)
    const pixelsPerSecond = viewport.width < 640 ? 18 : 24
    const duration = Math.min(18, Math.max(4, distance / pixelsPerSecond))
    let active = true
    const xAnimation = animate(x, target.x, { duration, ease: 'linear' })
    const yAnimation = animate(y, target.y, { duration, ease: 'linear' })
    void Promise.all([xAnimation, yAnimation]).then(() => {
      if (active) setTargetIndex((current) => (current + 1) % perimeterPath.length)
    })
    return () => {
      active = false
      xAnimation.stop()
      yAnimation.stop()
    }
  }, [interactionPaused, movementAllowed, perimeterPath, targetIndex, viewport.width, x, y])

  const autoQuipBlocked = autoBanterPaused || interactionPaused
  useEffect(() => {
    if (!model || autoQuipBlocked) return
    const timer = window.setTimeout(() => {
      if (document.hidden || hasBlockingDialog() || isTextEntry(document.activeElement)) return
      const quip = selectNextQuip(model)
      if (!quip) return
      firstAutoQuipRef.current = false
      showMessage(quip, 'auto')
    }, model.getAutoQuipDelayMs(firstAutoQuipRef.current, Math.random()))
    return () => window.clearTimeout(timer)
  }, [autoQuipBlocked, model, selectNextQuip, showMessage])

  const handleAvatarClick = async () => {
    requestAvatar()
    setInteractionPulse((current) => current + 1)
    const loadedModel = await requestModel()
    if (!loadedModel || !mountedRef.current) return
    const quip = selectNextQuip(loadedModel)
    if (quip) showMessage(quip, 'manual')
  }

  const toggleAutoBanter = () => {
    setAutoBanterPaused((current) => {
      const next = !current
      try {
        window.sessionStorage.setItem(AUTO_BANTER_SESSION_KEY, String(next))
      } catch {
        // Session persistence is optional; the visible control still works.
      }
      return next
    })
  }

  const enableFullMotion = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const restoreAvatarFocus = event.detail === 0
    // The app setting remains the source of truth. Even when persistence is
    // denied, setSetting keeps the explicit choice active for this session.
    void setSetting('animationIntensity', 'full')
    setIsHovered(false)
    if (!restoreAvatarFocus) setIsFocusWithin(false)
    setIsPointerDown(false)
    setShouldLoad3D(true)
    setInteractionPulse((current) => current + 1)
    if (restoreAvatarFocus) avatarButtonRef.current?.focus({ preventScroll: true })
    void requestModel()
  }

  const handleBlurWithin = (event: ReactFocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget
    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
      setIsFocusWithin(false)
    }
  }

  const mood = message?.quip.mood ?? 'curious'
  const language = (i18n.resolvedLanguage ?? i18n.language).startsWith('zh') ? 'zh' : 'en'
  const renderDeferredAvatar = shouldLoad3D && movementAllowed

  // A decorative guide must never sit above a modal or enter its focus order.
  if (dialogOpen) return null

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[30] overflow-visible"
      role="region"
      aria-label={t('guide.regionLabel')}
      data-ghost-guide-root
    >
      <motion.div
        className="pointer-events-none absolute h-20 w-20"
        style={{ x, y }}
        onPointerEnter={() => {
          setIsHovered(true)
          requestAvatar()
        }}
        onPointerLeave={() => setIsHovered(false)}
        onPointerDownCapture={() => setIsPointerDown(true)}
        onFocusCapture={() => {
          setIsFocusWithin(true)
          requestAvatar()
        }}
        onBlurCapture={handleBlurWithin}
      >
        {systemMotionPaused && !message && (
          <button
            type="button"
            onClick={enableFullMotion}
            className="pointer-events-auto absolute bottom-[calc(100%+10px)] right-0 flex min-h-11 w-max max-w-[min(240px,calc(100vw-24px))] items-center gap-2 rounded-full border border-[#00E5FF]/35 bg-[#0A0E14]/95 px-3 py-2 text-left font-jetbrains shadow-[0_8px_28px_rgba(0,229,255,0.14)] backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
            aria-label={`${t('guide.systemMotionPaused')}. ${t('guide.enableFullMotion')}`}
            data-ghost-motion-cta
          >
            <span className="shrink-0 text-[9px] font-bold tracking-[0.14em] text-[#FFD166]" aria-hidden="true">
              SYSTEM · STATIC
            </span>
            <span className="text-[11px] text-[#E8EDF2]">
              {t('guide.enableFullMotion')}
            </span>
          </button>
        )}

        <motion.button
          ref={avatarButtonRef}
          type="button"
          onClick={() => void handleAvatarClick()}
          aria-label={t('guide.requestQuip')}
          aria-expanded={Boolean(message)}
          aria-controls={message ? messageId : undefined}
          aria-describedby={message?.source === 'manual' ? messageId : undefined}
          whileHover={movementAllowed ? { scale: 1.08, rotate: -2 } : undefined}
          whileTap={movementAllowed ? { scale: 0.94, rotate: 2 } : undefined}
          className="pointer-events-auto relative flex h-20 w-20 items-center justify-center overflow-visible rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E14]"
          style={{
            background: 'radial-gradient(circle, rgba(0, 229, 255, 0.11), transparent 72%)',
            border: '1px solid rgba(0, 229, 255, 0.23)',
            boxShadow: '0 0 34px rgba(0, 229, 255, 0.18), inset 0 0 22px rgba(0, 229, 255, 0.06)',
          }}
          data-ghost-mood={mood}
          data-auto-banter={autoBanterPaused ? 'paused' : 'active'}
          data-motion-allowed={movementAllowed ? 'true' : 'false'}
          data-ghost-avatar
        >
          {renderDeferredAvatar ? (
            <Suspense
              fallback={(
                <GhostAvatarFallback
                  reduceMotion={!movementAllowed}
                  mood={mood}
                  isSpeaking={Boolean(message)}
                  isHovered={isHovered || isFocusWithin}
                />
              )}
            >
              <DeferredGhostAvatar3D
                reduceMotion={!movementAllowed}
                mood={mood}
                isSpeaking={Boolean(message)}
                isHovered={isHovered || isFocusWithin}
                interactionPulse={interactionPulse}
              />
            </Suspense>
          ) : (
            <GhostAvatarFallback
              reduceMotion={!movementAllowed}
              mood={mood}
              isSpeaking={Boolean(message)}
              isHovered={isHovered || isFocusWithin}
            />
          )}
          {movementAllowed && (
            <motion.span
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{ border: '1.5px solid rgba(0, 229, 255, 0.32)' }}
              animate={{ scale: [1, 1.34, 1], opacity: [0.38, 0, 0.38] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
              aria-hidden="true"
            />
          )}
        </motion.button>

        <AnimatePresence>
          {message && (
            <motion.div
              key={message.quip.id}
              id={messageId}
              role={message.source === 'manual' ? 'status' : undefined}
              aria-live={message.source === 'manual' ? 'polite' : 'off'}
              aria-atomic="true"
              initial={movementAllowed ? { opacity: 0, y: 8, scale: 0.94 } : { opacity: 0 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={movementAllowed ? { opacity: 0, y: 6, scale: 0.96 } : { opacity: 0 }}
              transition={{ duration: movementAllowed ? 0.22 : 0 }}
              className="pointer-events-auto absolute rounded-xl p-4 pt-5"
              style={{
                ...message.placement.bubble,
                background: 'linear-gradient(135deg, rgba(15, 20, 30, 0.97), rgba(10, 14, 25, 0.99))',
                border: '1px solid rgba(0, 229, 255, 0.28)',
                backdropFilter: 'blur(14px)',
                boxShadow: '0 12px 38px rgba(0, 0, 0, 0.35), 0 0 28px rgba(0, 229, 255, 0.12)',
              }}
              data-message-source={message.source}
              data-ghost-mood={message.quip.mood}
            >
              <span aria-hidden="true" style={message.placement.tail} />
              <div className="mb-2 flex items-center justify-between gap-3 pr-8">
                <span className="font-jetbrains text-[10px] font-bold tracking-[0.18em] text-[#00E5FF]">
                  GHOST // COMMS
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-[#00E5FF] shadow-[0_0_8px_#00E5FF]" aria-hidden="true" />
              </div>
              <p className="font-jetbrains text-[13px] leading-relaxed text-[#E8EDF2]">
                {message.quip.text[language]}
              </p>
              <div className="mt-3 border-t border-white/10 pt-2">
                <button
                  type="button"
                  onClick={toggleAutoBanter}
                  aria-pressed={autoBanterPaused}
                  className="inline-flex min-h-11 items-center rounded-md px-2 font-jetbrains text-[11px] text-[#9CB0C2] transition-colors hover:bg-white/5 hover:text-[#E8EDF2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
                >
                  {autoBanterPaused ? t('guide.resumeBanter') : t('guide.pauseBanter')}
                </button>
              </div>
              <button
                type="button"
                onClick={hideMessage}
                aria-label={t('common.close')}
                className="absolute right-1 top-1 flex min-h-11 min-w-11 items-center justify-center rounded-md text-sm text-[#788DA1] transition-colors hover:text-[#E8EDF2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>
    </div>
  )
}
