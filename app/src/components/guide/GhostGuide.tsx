import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLocation } from 'react-router-dom'

// ─── Types ───────────────────────────────────────────────────────────

interface GuideMessage {
  id: string
  text: string
  type: 'info' | 'tip' | 'success' | 'warning'
}

// ─── Message Database ────────────────────────────────────────────────

const routeMessages: Record<string, GuideMessage[]> = {
  '/': [
    {
      id: 'home-1',
      text: '\u4eca\u5929\u6709\u65b0\u4efb\u52a1\u7b49\u4f60\u6311\u6218\uff01',
      type: 'info',
    },
    {
      id: 'home-2',
      text: '\u67e5\u770b\u4efb\u52a1\u677f\uff0c\u9009\u62e9\u9002\u5408\u4f60\u7ea7\u522b\u7684\u4efb\u52a1\u5f00\u59cb\u5192\u9669\u3002',
      type: 'tip',
    },
    {
      id: 'home-3',
      text: '\u5b8c\u6210\u4efb\u52a1\u53ef\u4ee5\u83b7\u5f97\u7ecf\u9a8c\u548c\u5956\u52b1\uff0c\u5f00\u59cb\u4f60\u7684\u9ed1\u5ba2\u4e4b\u8def\u5427\uff01',
      type: 'info',
    },
  ],
  '/missions': [
    {
      id: 'missions-1',
      text: '\u9009\u62e9\u4e00\u4e2a\u7eff\u8272\u8fb9\u6846\u7684\u4efb\u52a1\u5f00\u59cb\u4f60\u7684\u9ed1\u5ba2\u4e4b\u65c5\u3002',
      type: 'info',
    },
    {
      id: 'missions-2',
      text: '\u65b0\u624b\u5efa\u8bae\u4ece"\u5165\u4fb5\u542f\u52a8\u811a\u672c"\u5f00\u59cb\uff0c\u9010\u6b65\u638c\u63e1\u57fa\u672c\u547d\u4ee4\u3002',
      type: 'tip',
    },
    {
      id: 'missions-3',
      text: '\u6bcf\u4e2a\u4efb\u52a1\u90fd\u6709\u4e0d\u540c\u7684\u96be\u5ea6\u7b49\u7ea7\uff0c\u6839\u636e\u81ea\u5df1\u7684\u80fd\u529b\u9009\u62e9\u5427\u3002',
      type: 'info',
    },
  ],
  '/academy': [
    {
      id: 'academy-1',
      text: '\u5b66\u9662\u8bfe\u7a0b\u4ece\u57fa\u7840\u5230\u9ad8\u7ea7\uff0c\u5faa\u5e8f\u6e10\u8fdb\u638c\u63e1\u6240\u6709\u547d\u4ee4\u3002',
      type: 'info',
    },
    {
      id: 'academy-2',
      text: '\u5efa\u8bae\u5148\u5b8c\u6210\u57fa\u7840\u8bfe\u7a0b\uff0c\u518d\u6311\u6218\u8fdb\u9636\u5185\u5bb9\u3002',
      type: 'tip',
    },
    {
      id: 'academy-3',
      text: '\u5b66\u9662\u7684\u77e5\u8bc6\u5c06\u5728\u5b9e\u6218\u4efb\u52a1\u4e2d\u5f97\u5230\u9a8c\u8bc1\uff0c\u52a0\u6cb9\uff01',
      type: 'success',
    },
  ],
  '/atlas': [
    {
      id: 'atlas-1',
      text: '\u547d\u4ee4\u56fe\u9274\u662f\u4f60\u7684\u9ed1\u5ba2\u5de5\u5177\u7bb1\uff0c\u901f\u67e5\u6240\u6709\u53ef\u7528\u547d\u4ee4\u3002',
      type: 'info',
    },
    {
      id: 'atlas-2',
      text: '\u4f7f\u7528\u7b5b\u9009\u529f\u80fd\u5feb\u901f\u627e\u5230\u4f60\u9700\u8981\u7684\u547d\u4ee4\u3002',
      type: 'tip',
    },
  ],
}

const onboardingMessages: GuideMessage[] = [
  {
    id: 'onboard-1',
    text: '\u6b22\u8fce\u6765\u5230\u7ec8\u7aef\u5e7d\u7075\u884c\u52a8\uff01\u6211\u662f\u4f60\u7684AI\u52a9\u624b Ghost\u3002',
    type: 'info',
  },
  {
    id: 'onboard-2',
    text: "\u70b9\u51fb\u300e\u4efb\u52a1\u677f\u300f\u9009\u62e9\u4f60\u7684\u7b2c\u4e00\u4e2a\u4efb\u52a1\u3002\u6bcf\u4e2a\u4efb\u52a1\u90fd\u662f\u4e00\u4e2a\u9ed1\u5ba2\u884c\u52a8\u573a\u666f\u3002",
    type: 'tip',
  },
  {
    id: 'onboard-3',
    text: "\u5728\u7ec8\u7aef\u4e2d\u8f93\u5165\u547d\u4ee4\u6765\u5b8c\u6210\u76ee\u6807\u3002\u5b8c\u6210\u540e\u4f60\u4f1a\u83b7\u5f97\u7ecf\u9a8c\u548c\u5956\u52b1\uff01",
    type: 'success',
  },
]

const clickTips: GuideMessage[] = [
  {
    id: 'click-tip-1',
    text: '\u8bb0\u4f4f\uff1aCtrl+C \u53ef\u4ee5\u4e2d\u65ad\u5f53\u524d\u8fdb\u7a0b\uff01',
    type: 'tip',
  },
  {
    id: 'click-tip-2',
    text: '\u4f7f\u7528 Tab \u952e\u53ef\u4ee5\u81ea\u52a8\u8865\u5168\u547d\u4ee4',
    type: 'tip',
  },
  {
    id: 'click-tip-3',
    text: '\u8f93\u5165 history \u67e5\u770b\u4f60\u6267\u884c\u8fc7\u7684\u547d\u4ee4',
    type: 'tip',
  },
  {
    id: 'click-tip-4',
    text: '\u6309 \u2191 \u65b9\u5411\u952e\u53ef\u4ee5\u5feb\u901f\u4f7f\u7528\u4e0a\u4e00\u6761\u547d\u4ee4',
    type: 'tip',
  },
  {
    id: 'click-tip-5',
    text: '\u8f93\u5165 "help" \u67e5\u770b\u6240\u6709\u53ef\u7528\u547d\u4ee4\u5217\u8868',
    type: 'tip',
  },
]

const ONBOARDING_KEY = 'ghost_onboarding_complete'

// ─── Color helpers ───────────────────────────────────────────────────

function typeColor(type: GuideMessage['type']): string {
  switch (type) {
    case 'success':
      return '#00E676'
    case 'tip':
      return '#FFD600'
    case 'warning':
      return '#FF5252'
    default:
      return '#00E5FF'
  }
}

function typeBorderColor(type: GuideMessage['type']): string {
  switch (type) {
    case 'success':
      return 'rgba(0, 230, 118, 0.3)'
    case 'tip':
      return 'rgba(255, 214, 0, 0.3)'
    case 'warning':
      return 'rgba(255, 82, 82, 0.3)'
    default:
      return 'rgba(0, 229, 255, 0.3)'
  }
}

// ─── Component ───────────────────────────────────────────────────────

export default function GhostGuide() {
  const location = useLocation()
  const [currentMessage, setCurrentMessage] = useState<GuideMessage | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [hasBeenGreeted, setHasBeenGreeted] = useState(
    () => localStorage.getItem(ONBOARDING_KEY) === 'true',
  )
  const [onboardingStep, setOnboardingStep] = useState(0)
  const [isOnboarding, setIsOnboarding] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRouteRef = useRef<string>('')

  // ── Show message helper ────────────────────────────────────────────

  const showMessage = useCallback(
    (msg: GuideMessage, duration: number = 8000) => {
      // Clear any existing hide timer
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
      }
      setCurrentMessage(msg)
      if (duration > 0) {
        hideTimerRef.current = setTimeout(() => setCurrentMessage(null), duration)
      }
    },
    []
  )

  // ── First appearance: slide in ─────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 600)
    return () => clearTimeout(timer)
  }, [])

  // ── Onboarding flow ────────────────────────────────────────────────

  useEffect(() => {
    if (!isVisible || hasBeenGreeted) return

    const timer = setTimeout(() => {
      setIsOnboarding(true)
      setOnboardingStep(0)
      showMessage(onboardingMessages[0], 0) // No auto-hide during onboarding
      setHasBeenGreeted(true)
    }, 0)

    return () => clearTimeout(timer)
  }, [isVisible, hasBeenGreeted, showMessage])

  // ── Advance onboarding on bubble click ─────────────────────────────

  const handleBubbleClick = useCallback(() => {
    if (isOnboarding) {
      const nextStep = onboardingStep + 1
      if (nextStep < onboardingMessages.length) {
        setOnboardingStep(nextStep)
        showMessage(onboardingMessages[nextStep], 0)
      } else {
        // Onboarding complete
        setIsOnboarding(false)
        localStorage.setItem(ONBOARDING_KEY, 'true')
        setCurrentMessage(null)
      }
    } else {
      // Normal dismiss
      setCurrentMessage(null)
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
      }
    }
  }, [isOnboarding, onboardingStep, showMessage])

  // ── Context-aware route messages ───────────────────────────────────

  useEffect(() => {
    const path = location.pathname

    // Don't show route messages during onboarding
    if (isOnboarding) return
    // Don't repeat same route immediately
    if (lastRouteRef.current === path) return
    lastRouteRef.current = path

    // Small delay so the page transition completes first
    const timer = setTimeout(() => {
      const messages = routeMessages[path]
      if (messages && messages.length > 0) {
        const msg = messages[Math.floor(Math.random() * messages.length)]
        showMessage(msg, 8000)
      }
    }, 800)

    return () => clearTimeout(timer)
  }, [location.pathname, isOnboarding, showMessage])

  // ── Cleanup timer on unmount ───────────────────────────────────────

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  // ── Avatar click: tips or dismiss ──────────────────────────────────

  const handleAvatarClick = useCallback(() => {
    if (currentMessage) {
      handleBubbleClick()
    } else {
      const randomTip = clickTips[Math.floor(Math.random() * clickTips.length)]
      showMessage(randomTip, 8000)
    }
  }, [currentMessage, handleBubbleClick, showMessage])

  // ── Early return while not yet visible ─────────────────────────────

  if (!isVisible) return null

  const accent = currentMessage ? typeColor(currentMessage.type) : '#00E5FF'
  const borderCol = currentMessage
    ? typeBorderColor(currentMessage.type)
    : 'rgba(0, 229, 255, 0.3)'

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-3 pointer-events-none">
      {/* ─── Speech Bubble ────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {currentMessage && (
          <motion.div
            key={currentMessage.id}
            initial={{ opacity: 0, y: 12, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 25,
            }}
            onClick={handleBubbleClick}
            className="max-w-[300px] p-4 rounded-xl relative cursor-pointer pointer-events-auto"
            style={{
              backgroundColor: 'rgba(12, 16, 22, 0.96)',
              border: `1.5px solid ${borderCol}`,
              backdropFilter: 'blur(12px)',
              boxShadow: `0 4px 24px ${borderCol}`,
            }}
          >
            {/* Type indicator dot */}
            <div
              className="absolute top-3 left-3 w-2 h-2 rounded-full"
              style={{
                backgroundColor: accent,
                boxShadow: `0 0 8px ${accent}`,
              }}
            />

            {/* Message text */}
            <p
              className="font-mono text-sm leading-relaxed pl-5"
              style={{ color: '#E8EDF2' }}
            >
              {currentMessage.text}
            </p>

            {/* Onboarding hint */}
            {isOnboarding && (
              <p
                className="text-[10px] mt-2 pl-5 font-mono"
                style={{ color: 'rgba(0, 229, 255, 0.6)' }}
              >
                {onboardingStep < onboardingMessages.length - 1
                  ? '\u70b9\u51fb\u7ee7\u7eed'
                  : '\u70b9\u51fb\u5b8c\u6210'}
              </p>
            )}

            {/* Dismiss button */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleBubbleClick()
              }}
              className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded text-[10px] transition-colors"
              style={{ color: '#788DA1' }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = '#E8EDF2')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = '#788DA1')
              }
              aria-label="\u5173\u95ed\u6d88\u606f"
            >
              &#x2715;
            </button>

            {/* Triangle pointer */}
            <div
              className="absolute -bottom-[6px] right-6 w-3 h-3 rotate-45"
              style={{
                backgroundColor: 'rgba(12, 16, 22, 0.96)',
                borderRight: `1.5px solid ${borderCol}`,
                borderBottom: `1.5px solid ${borderCol}`,
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Avatar Button ────────────────────────────────────────── */}
      <motion.button
        onClick={handleAvatarClick}
        initial={{ y: 60, opacity: 0, scale: 0.5 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{
          type: 'spring',
          stiffness: 260,
          damping: 20,
          delay: 0.2,
        }}
        className="relative w-12 h-12 rounded-full flex items-center justify-center pointer-events-auto cursor-pointer"
        style={{
          backgroundColor: 'rgba(0, 229, 255, 0.12)',
          border: '2px solid rgba(0, 229, 255, 0.4)',
          boxShadow: '0 0 20px rgba(0, 229, 255, 0.15)',
        }}
        whileHover={{ scale: 1.12 }}
        whileTap={{ scale: 0.92 }}
        aria-label="Ghost AI \u52a9\u624b"
        title="Ghost AI \u52a9\u624b"
      >
        {/* Ghost face SVG */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* Ghost head */}
          <circle
            cx="12"
            cy="10"
            r="7"
            stroke="#00E5FF"
            strokeWidth="1.5"
            fill="rgba(0,229,255,0.08)"
          />
          {/* Left eye */}
          <circle cx="9.5" cy="9" r="1" fill="#00E5FF">
            <animate
              attributeName="ry"
              values="1;0.2;1"
              dur="4s"
              repeatCount="indefinite"
            />
          </circle>
          {/* Right eye */}
          <circle cx="14.5" cy="9" r="1" fill="#00E5FF">
            <animate
              attributeName="ry"
              values="1;0.2;1"
              dur="4s"
              repeatCount="indefinite"
            />
          </circle>
          {/* Smile */}
          <path
            d="M9 12.5 Q12 14.5 15 12.5"
            stroke="#00E5FF"
            strokeWidth="1"
            fill="none"
            strokeLinecap="round"
          />
          {/* Antenna */}
          <line
            x1="12"
            y1="3"
            x2="12"
            y2="1.5"
            stroke="#00E5FF"
            strokeWidth="1"
          />
          <circle cx="12" cy="1.5" r="0.8" fill="#00E5FF">
            <animate
              attributeName="opacity"
              values="1;0.4;1"
              dur="1.5s"
              repeatCount="indefinite"
            />
          </circle>
        </svg>

        {/* Pulsing glow ring */}
        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            border: `2px solid ${accent}`,
          }}
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.5, 0, 0.5],
          }}
          transition={{
            duration: 2.2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Second slower pulse ring */}
        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            border: `1px solid ${accent}`,
          }}
          animate={{
            scale: [1, 1.8, 1],
            opacity: [0.3, 0, 0.3],
          }}
          transition={{
            duration: 3.5,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 0.5,
          }}
        />

        {/* Floating animation wrapper (applied via parent motion) */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={{ y: [0, -3, 0] }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </motion.button>
    </div>
  )
}
