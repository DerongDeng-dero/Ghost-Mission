import { useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ─── Types ───────────────────────────────────────────────────────────

export interface MissionResult {
  rank: 'S' | 'A' | 'B' | 'C' | 'D'
  score: number
  timeTaken: number // seconds
  missionName: string
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  color: string
  alpha: number
  life: number
  maxLife: number
}

interface MissionCompleteCelebrationProps {
  result: MissionResult | null
  onDismiss?: () => void
}

// ─── Rank config ─────────────────────────────────────────────────────

const rankConfig: Record<
  MissionResult['rank'],
  { color: string; glow: string; label: string }
> = {
  S: { color: '#FFD700', glow: '0 0 40px rgba(255,215,0,0.6)', label: '\u5b8c\u7f8e' },
  A: { color: '#00E676', glow: '0 0 40px rgba(0,230,118,0.5)', label: '\u4f18\u79c0' },
  B: { color: '#00E5FF', glow: '0 0 40px rgba(0,229,255,0.5)', label: '\u826f\u597d' },
  C: { color: '#FF9100', glow: '0 0 40px rgba(255,145,0,0.4)', label: '\u53ca\u683c' },
  D: { color: '#FF5252', glow: '0 0 40px rgba(255,82,82,0.4)', label: '\u52a0\u6cb9' },
}

const PARTICLE_COLORS = [
  '#00E5FF',
  '#00E676',
  '#FFD600',
  '#76FF03',
  '#64FFDA',
  '#18FFFF',
]

// ─── Canvas Particle System ──────────────────────────────────────────

function useParticleCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  isActive: boolean
) {
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number>(0)

  const spawnParticles = useCallback(
    (count: number, centerX: number, centerY: number) => {
      const newParticles: Particle[] = []
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = 2 + Math.random() * 6
        newParticles.push({
          x: centerX,
          y: centerY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - Math.random() * 3,
          radius: 1.5 + Math.random() * 3,
          color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
          alpha: 1,
          life: 0,
          maxLife: 60 + Math.random() * 90,
        })
      }
      particlesRef.current.push(...newParticles)
    },
    []
  )

  useEffect(() => {
    if (!isActive) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Spawn initial burst
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    spawnParticles(120, cx, cy)

    // Spawn periodic mini-bursts
    const burstInterval = setInterval(() => {
      if (particlesRef.current.length < 300) {
        spawnParticles(
          15,
          cx + (Math.random() - 0.5) * 200,
          cy + (Math.random() - 0.5) * 100
        )
      }
    }, 300)

    // Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particlesRef.current = particlesRef.current.filter((p) => {
        p.life++
        if (p.life >= p.maxLife) return false

        p.x += p.vx
        p.y += p.vy
        p.vy += 0.08 // gravity
        p.vx *= 0.99 // friction
        p.alpha = 1 - p.life / p.maxLife

        ctx.save()
        ctx.globalAlpha = p.alpha
        ctx.fillStyle = p.color
        ctx.shadowColor = p.color
        ctx.shadowBlur = 8
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        return true
      })

      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(rafRef.current)
      clearInterval(burstInterval)
      window.removeEventListener('resize', resize)
      particlesRef.current = []
    }
  }, [isActive, canvasRef, spawnParticles])

  return { spawnParticles }
}

// ─── Main Component ──────────────────────────────────────────────────

export default function MissionCompleteCelebration({
  result,
  onDismiss,
}: MissionCompleteCelebrationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isActive = result !== null

  useParticleCanvas(canvasRef, isActive)

  // Auto-dismiss after 4 seconds
  useEffect(() => {
    if (!result) return
    const timer = setTimeout(() => {
      onDismiss?.()
    }, 4000)
    return () => clearTimeout(timer)
  }, [result, onDismiss])

  const config = result ? rankConfig[result.rank] : null

  return (
    <AnimatePresence>
      {result && config && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Dark backdrop */}
          <motion.div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(10, 14, 20, 0.85)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onDismiss}
          />

          {/* Particle canvas */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 1 }}
          />

          {/* Content card */}
          <motion.div
            className="relative z-10 flex flex-col items-center gap-6"
            initial={{ scale: 0.3, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: -20 }}
            transition={{
              type: 'spring',
              stiffness: 200,
              damping: 15,
              delay: 0.15,
            }}
          >
            {/* Mission name */}
            <motion.p
              className="font-mono text-sm tracking-widest uppercase"
              style={{ color: 'rgba(232, 237, 242, 0.6)' }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              {result.missionName}
            </motion.p>

            {/* Rank letter */}
            <motion.div
              className="relative flex items-center justify-center"
              initial={{ rotateY: 180, scale: 0.5 }}
              animate={{ rotateY: 0, scale: 1 }}
              transition={{
                type: 'spring',
                stiffness: 150,
                damping: 12,
                delay: 0.2,
              }}
            >
              {/* Outer glow rings */}
              <motion.div
                className="absolute w-40 h-40 rounded-full"
                style={{
                  border: `2px solid ${config.color}`,
                  opacity: 0.3,
                }}
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.3, 0.1, 0.3],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
              <motion.div
                className="absolute w-32 h-32 rounded-full"
                style={{
                  border: `1px solid ${config.color}`,
                  opacity: 0.5,
                }}
                animate={{
                  scale: [1, 1.15, 1],
                  opacity: [0.5, 0.2, 0.5],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: 0.3,
                }}
              />

              {/* Rank text */}
              <motion.span
                className="text-[120px] font-black leading-none font-mono select-none"
                style={{
                  color: config.color,
                  textShadow: config.glow,
                }}
                animate={{
                  textShadow: [
                    config.glow,
                    config.glow.replace(/[\d.]+\)$/, '0.8)'),
                    config.glow,
                  ],
                }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                {result.rank}
              </motion.span>
            </motion.div>

            {/* Rank label */}
            <motion.p
              className="font-mono text-lg tracking-[0.3em]"
              style={{ color: config.color }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {config.label}
            </motion.p>

            {/* Score & Time row */}
            <motion.div
              className="flex gap-10 mt-2"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <div className="flex flex-col items-center gap-1">
                <span
                  className="text-[10px] font-mono uppercase tracking-wider"
                  style={{ color: 'rgba(232, 237, 242, 0.4)' }}
                >
                  \u5f97\u5206
                </span>
                <span
                  className="font-mono text-2xl font-bold"
                  style={{ color: '#E8EDF2' }}
                >
                  {result.score.toLocaleString()}
                </span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span
                  className="text-[10px] font-mono uppercase tracking-wider"
                  style={{ color: 'rgba(232, 237, 242, 0.4)' }}
                >
                  \u7528\u65f6
                </span>
                <span
                  className="font-mono text-2xl font-bold tabular-nums"
                  style={{ color: '#E8EDF2' }}
                >
                  {(() => {
                    const m = Math.floor(result.timeTaken / 60)
                    const s = result.timeTaken % 60
                    return `${m}:${s.toString().padStart(2, '0')}`
                  })()}
                </span>
              </div>
            </motion.div>

            {/* Dismiss hint */}
            <motion.p
              className="text-[10px] font-mono mt-4"
              style={{ color: 'rgba(232, 237, 242, 0.3)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{
                delay: 1.2,
                duration: 2,
                repeat: Infinity,
                repeatDelay: 1,
              }}
            >
              \u70b9\u51fb\u4efb\u610f\u4f4d\u7f6e\u7ee7\u7eed
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
