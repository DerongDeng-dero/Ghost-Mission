import { useId } from 'react'

export type GhostAvatarMood = 'idle' | 'curious' | 'mischievous' | 'proud' | 'speaking' | 'startled'

export interface GhostAvatarFallbackProps {
  reduceMotion?: boolean
  isHovered?: boolean
  isSpeaking?: boolean
  mood?: GhostAvatarMood
}

export default function GhostAvatarFallback({
  reduceMotion = true,
  isHovered = false,
  isSpeaking = false,
  mood = 'mischievous',
}: GhostAvatarFallbackProps) {
  const rawId = useId()
  const id = rawId.replace(/:/g, '')
  const activeMood = isSpeaking ? 'speaking' : mood
  const isStartled = activeMood === 'startled'
  const isCurious = activeMood === 'curious'
  const isProud = activeMood === 'proud'

  return (
    <svg
      viewBox="0 0 80 80"
      className="h-20 w-20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={`${id}-aura`} cx="44%" cy="38%" r="59%">
          <stop offset="0%" stopColor="#86FFE0" stopOpacity="0.36" />
          <stop offset="58%" stopColor="#16EAB9" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#00C8FF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-body`} x1="25" y1="18" x2="57" y2="63">
          <stop stopColor="#9BFFE4" />
          <stop offset="0.42" stopColor="#3DECB4" />
          <stop offset="1" stopColor="#08AFC2" />
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1="25" y1="17" x2="56" y2="58">
          <stop stopColor="#D5FFF3" stopOpacity="0.92" />
          <stop offset="0.52" stopColor="#6CFFD7" stopOpacity="0.25" />
          <stop offset="1" stopColor="#FF62DB" stopOpacity="0.68" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-45%" y="-45%" width="190%" height="190%">
          <feGaussianBlur stdDeviation="2.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle cx="40" cy="40" r={isHovered ? 36 : 33} fill={`url(#${id}-aura)`} />
      <g
        style={{
          transformOrigin: '40px 40px',
          transform: isHovered ? 'scale(1.035)' : undefined,
          transition: reduceMotion ? undefined : 'transform 180ms ease-out',
        }}
      >
        <ellipse cx="40" cy="67" rx="18" ry="3.5" fill="#00D7DD" opacity="0.14" />
        <path
          d="M28 52c-4 3-7 2-8-1-1-4 4-6 8-7M52 52c4 3 7 2 8-1 1-4-4-6-8-7"
          stroke={`url(#${id}-body)`}
          strokeWidth="5.5"
          strokeLinecap="round"
        />
        <path
          d="M23 47c0-14 7-25 17-25s17 11 17 25c0 6-2 10-5 13l-5-4-6 7-6-7-7 5c-3-4-5-8-5-14Z"
          fill={`url(#${id}-body)`}
          stroke={`url(#${id}-rim)`}
          strokeWidth="1.4"
          strokeLinejoin="round"
          filter={`url(#${id}-glow)`}
        />
        <path
          d="M29 31c2-5 6-7 11-7"
          stroke="#E5FFF7"
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity="0.58"
        />
        <ellipse cx="35" cy="40" rx="5.1" ry={isStartled ? 6 : 5.6} fill="#F2FFFB" />
        <ellipse cx="46" cy="40" rx="5.1" ry={isStartled ? 6 : 5.6} fill="#F2FFFB" />
        <ellipse cx={isCurious ? 36 : 35.8} cy="40.5" rx="2.5" ry="2.9" fill="#04BBD1" />
        <ellipse cx={isCurious ? 47 : 46.8} cy="40.5" rx="2.5" ry="2.9" fill="#04BBD1" />
        <circle cx={isCurious ? 36.4 : 36.2} cy="40.7" r="1.45" fill="#07161D" />
        <circle cx={isCurious ? 47.4 : 47.2} cy="40.7" r="1.45" fill="#07161D" />
        <circle cx="35.5" cy="39.6" r="0.7" fill="white" />
        <circle cx="46.5" cy="39.6" r="0.7" fill="white" />
        <path
          d={isStartled ? 'M31 33l7 1M43 34l7-2' : isCurious ? 'M30 34c3-2 6-2 8 0M43 33c3-2 6-1 8 1' : 'M30 34c3-2 6-2 8 0M43 35c3-3 6-3 8-1'}
          stroke="#07515A"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <ellipse cx="30.5" cy="47" rx="3.2" ry="1.4" fill="#FF62D8" opacity="0.28" />
        <ellipse cx="51" cy="47" rx="3.2" ry="1.4" fill="#FF62D8" opacity="0.28" />
        <path
          d={isStartled ? 'M36 48c0-4 9-4 9 0 0 5-9 5-9 0Z' : isProud ? 'M35 48c3 1 6 1 10-1' : 'M35 47c2 4 7 5 11 1'}
          fill={isStartled ? '#07151C' : 'none'}
          stroke="#08232A"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {!isStartled && (
          <path d="M37 49c2 2 5 2 7 0" stroke="#FF63A7" strokeWidth="1.35" strokeLinecap="round" />
        )}
        <path d="M36 52l2 2-2 1" fill="#F5FFF9" opacity="0.92" />
        <circle cx="20" cy="31" r="1.1" fill="#6DFFDC" opacity="0.7" />
        <circle cx="61" cy="37" r="0.9" fill="#FF68DD" opacity="0.62" />
        <circle cx="18" cy="48" r="0.7" fill="#37DFF4" opacity="0.58" />
      </g>
    </svg>
  )
}
