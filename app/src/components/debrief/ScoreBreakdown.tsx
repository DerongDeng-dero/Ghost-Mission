import { useRef, useEffect, useState } from 'react'
import { motion, useInView } from 'framer-motion'

interface ScoreCategory {
  name: string
  maxPoints: number
  earned: number
  detail: string
}

interface ScoreBreakdownProps {
  categories: ScoreCategory[]
  totalScore: number
}

function getBarColor(percentage: number): string {
  if (percentage >= 90) return '#00FF88'
  if (percentage >= 70) return '#00E5FF'
  if (percentage >= 50) return '#FFD166'
  if (percentage >= 30) return '#FF6B35'
  return '#FF4757'
}

function ScoreBar({
  earned,
  maxPoints,
  color,
  delay,
}: {
  earned: number
  maxPoints: number
  color: string
  delay: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-50px' })
  const [width, setWidth] = useState(0)

  useEffect(() => {
    if (isInView) {
      const timer = setTimeout(() => {
        setWidth((earned / maxPoints) * 100)
      }, delay + 200)
      return () => clearTimeout(timer)
    }
  }, [isInView, earned, maxPoints, delay])

  return (
    <div ref={ref} className="w-full h-[6px] rounded-full overflow-hidden" style={{ backgroundColor: '#1A2332' }}>
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
        initial={{ width: 0 }}
        animate={{ width: `${width}%` }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] as [number, number, number, number], delay: delay / 1000 }}
      />
    </div>
  )
}

export default function ScoreBreakdown({ categories, totalScore }: ScoreBreakdownProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(containerRef, { once: true, margin: '-80px' })

  const scoreColor =
    totalScore >= 95
      ? '#00FF88'
      : totalScore >= 80
        ? '#00E5FF'
        : totalScore >= 60
          ? '#FFD166'
          : totalScore >= 30
            ? '#FF6B35'
            : '#FF4757'

  return (
    <section ref={containerRef} className="max-w-[960px] mx-auto px-space-4 mt-space-8">
      <h2 className="font-jetbrains text-h2 text-[#E8EDF2] mb-space-6">Score Breakdown</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-4">
        {categories.map((cat, i) => {
          const pct = (cat.earned / cat.maxPoints) * 100
          const color = getBarColor(pct)
          return (
            <motion.div
              key={cat.name}
              className="p-space-4 rounded-radius-md border"
              style={{
                backgroundColor: '#0F1419',
                borderColor: '#1E2D3D',
              }}
              initial={{ opacity: 0, y: 16 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{
                duration: 0.3,
                delay: i * 0.1,
                ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
              }}
            >
              <div className="flex items-center justify-between mb-space-2">
                <h4 className="font-jetbrains text-h4 text-[#E8EDF2]">{cat.name}</h4>
                <span className="font-fira text-code" style={{ color }}>
                  {cat.earned}/{cat.maxPoints}
                </span>
              </div>
              <ScoreBar earned={cat.earned} maxPoints={cat.maxPoints} color={color} delay={i * 100} />
              <p className="mt-space-2 font-inter text-body-sm text-[#8B9EB0]">{cat.detail}</p>
            </motion.div>
          )
        })}
      </div>

      {/* Total Score */}
      <motion.div
        className="mt-space-8 text-center"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={isInView ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 0.5, delay: 0.6, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
      >
        <span className="font-jetbrains text-h1" style={{ color: scoreColor }}>
          TOTAL: {totalScore}/100
        </span>
      </motion.div>
    </section>
  )
}
