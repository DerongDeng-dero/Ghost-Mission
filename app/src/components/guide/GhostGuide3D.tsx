import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import GhostAvatarFallback from './GhostAvatarFallback'

interface Message {
  id: string
  key: string
  type: 'info' | 'tip' | 'success' | 'warning'
}

interface GhostAvatarProps {
  reduceMotion: boolean
}

function StaticGhostAvatar(props: GhostAvatarProps) {
  void props
  return <GhostAvatarFallback />
}

const DeferredGhostAvatar3D = lazy<ComponentType<GhostAvatarProps>>(() =>
  import('./GhostAvatar3D').catch((error) => {
    console.warn('[Ghost avatar] The 3D chunk failed to load; using the static avatar.', error)
    return { default: StaticGhostAvatar }
  }),
)

const routeMessages: Record<string, Message[]> = {
  '/': [
    { id: 'welcome', key: 'guide.messages.welcome', type: 'info' },
    { id: 'tip1', key: 'guide.tips.previousCommand', type: 'tip' },
  ],
  '/missions': [
    { id: 'mission', key: 'guide.messages.missions', type: 'info' },
  ],
  '/academy': [
    { id: 'academy', key: 'guide.messages.academy', type: 'info' },
  ],
  '/atlas': [
    { id: 'atlas', key: 'guide.messages.atlas', type: 'tip' },
  ],
  '/terminal': [
    { id: 'terminal', key: 'guide.messages.terminal', type: 'info' },
  ],
}

const randomTips: Message[] = [
  { id: 't1', key: 'guide.tips.autocomplete', type: 'tip' },
  { id: 't2', key: 'guide.tips.interrupt', type: 'tip' },
  { id: 't3', key: 'guide.tips.history', type: 'tip' },
  { id: 't4', key: 'guide.tips.previousCommand', type: 'tip' },
  { id: 't5', key: 'guide.tips.previousDirectory', type: 'tip' },
  { id: 't6', key: 'guide.tips.hiddenFiles', type: 'tip' },
  { id: 't7', key: 'guide.tips.recursiveSearch', type: 'tip' },
  { id: 't8', key: 'guide.tips.scoreCost', type: 'tip' },
]

export default function GhostGuide3D() {
  const { t } = useTranslation()
  const location = useLocation()
  const reduceMotion = useReducedMotion() ?? false
  const tipIndexRef = useRef(0)
  const messageId = useId()
  const [message, setMessage] = useState<Message | null>(null)
  const [shouldLoad3D, setShouldLoad3D] = useState(false)
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showMessage = useCallback((nextMessage: Message) => {
    setMessage(nextMessage)
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current)
    msgTimerRef.current = setTimeout(() => {
      setMessage(null)
      msgTimerRef.current = null
    }, 8000)
  }, [])

  const hideMessage = useCallback(() => {
    if (msgTimerRef.current) {
      clearTimeout(msgTimerRef.current)
      msgTimerRef.current = null
    }
    setMessage(null)
  }, [])

  const request3D = useCallback(() => {
    // Reduced-motion users keep the equivalent static avatar and never pay for
    // a decorative WebGL runtime they did not request.
    if (!reduceMotion) setShouldLoad3D(true)
  }, [reduceMotion])

  useEffect(() => () => {
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current)
  }, [])

  useEffect(() => {
    let greeted = false
    try {
      greeted = localStorage.getItem('ghost-greeted') === 'true'
    } catch {
      // Storage is optional; a hardened browser may show the greeting again.
    }
    if (greeted) return

    const greetingTimer = window.setTimeout(() => {
      const routeKey = location.pathname.startsWith('/terminal') ? '/terminal' : location.pathname
      showMessage(routeMessages[routeKey]?.[0] ?? routeMessages['/'][0])
      try {
        localStorage.setItem('ghost-greeted', 'true')
      } catch {
        // Keep the guide usable even when browser persistence is denied.
      }
    }, 0)

    return () => window.clearTimeout(greetingTimer)
  }, [location.pathname, showMessage])

  const handleClick = () => {
    request3D()
    if (message) {
      hideMessage()
      return
    }

    const routeKey = location.pathname.startsWith('/terminal') ? '/terminal' : location.pathname
    const contextualMessages = routeMessages[routeKey] ?? []
    const tips = [...contextualMessages, ...randomTips]
    const tip = tips[tipIndexRef.current % tips.length]
    tipIndexRef.current += 1
    showMessage(tip)
  }

  const renderDeferredAvatar = shouldLoad3D && !reduceMotion

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 right-4 z-[20] flex flex-col items-end gap-3 sm:bottom-6 sm:left-auto sm:right-6">
      <AnimatePresence>
        {message && (
          <motion.div
            id={messageId}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ duration: 0.3 }}
            className="pointer-events-auto relative w-full max-w-[300px] rounded-xl p-4 pr-12"
            style={{
              background: 'linear-gradient(135deg, rgba(15, 20, 30, 0.95), rgba(10, 14, 25, 0.98))',
              border: '1px solid rgba(0, 229, 255, 0.25)',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 8px 32px rgba(0, 229, 255, 0.1), 0 0 0 1px rgba(0, 229, 255, 0.05)',
            }}
          >
            <div
              className="absolute -bottom-2 right-8 h-4 w-4 rotate-45"
              style={{
                background: 'rgba(10, 14, 25, 0.98)',
                borderRight: '1px solid rgba(0, 229, 255, 0.25)',
                borderBottom: '1px solid rgba(0, 229, 255, 0.25)',
              }}
            />
            <p className="font-jetbrains text-[13px] leading-relaxed text-[#E8EDF2]">
              {t(message.key)}
            </p>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                hideMessage()
              }}
              aria-label={t('common.close')}
              className="absolute right-1 top-1 flex min-h-11 min-w-11 items-center justify-center rounded-radius-sm text-sm text-[#788DA1] transition-colors hover:text-[#E8EDF2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={handleClick}
        onFocus={request3D}
        onPointerEnter={request3D}
        aria-label={message ? t('guide.hideMessage') : t('guide.showTip')}
        aria-expanded={Boolean(message)}
        aria-controls={message ? messageId : undefined}
        whileHover={reduceMotion ? undefined : { scale: 1.08 }}
        whileTap={reduceMotion ? undefined : { scale: 0.95 }}
        className="pointer-events-auto relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
        style={{
          background: 'radial-gradient(circle, rgba(0, 229, 255, 0.08), transparent 70%)',
          border: '1px solid rgba(0, 229, 255, 0.2)',
          boxShadow: '0 0 30px rgba(0, 229, 255, 0.15), inset 0 0 20px rgba(0, 229, 255, 0.05)',
        }}
      >
        {renderDeferredAvatar ? (
          <Suspense fallback={<GhostAvatarFallback />}>
            <DeferredGhostAvatar3D reduceMotion={reduceMotion} />
          </Suspense>
        ) : (
          <GhostAvatarFallback />
        )}
        {!reduceMotion && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ border: '1.5px solid rgba(0, 229, 255, 0.3)' }}
            animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </motion.button>
    </div>
  )
}
