import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'

interface Stat {
  label: string
  value: string | number
  icon: LucideIcon
  color?: string
}

interface PerformanceCardProps {
  stats: Stat[]
}

export default function PerformanceCard({ stats }: PerformanceCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })

  return (
    <section ref={ref} className="max-w-[960px] mx-auto px-space-4 mt-space-8">
      <h2 className="font-jetbrains text-h2 text-[#E8EDF2] mb-space-6">Performance</h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-space-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon
          const color = stat.color || '#00FF88'
          return (
            <motion.div
              key={stat.label}
              className="flex flex-col items-center justify-center p-space-5 rounded-radius-md border text-center"
              style={{
                backgroundColor: '#0F1419',
                borderColor: '#1E2D3D',
              }}
              initial={{ opacity: 0, y: 16 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{
                duration: 0.3,
                delay: i * 0.08,
                ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
              }}
              whileHover={{
                y: -2,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                borderColor: '#2A4365',
              }}
            >
              <Icon size={22} style={{ color }} className="mb-space-2" />
              <span className="font-jetbrains text-h3" style={{ color: '#E8EDF2' }}>
                {stat.value}
              </span>
              <span className="font-inter text-body-sm text-[#8B9EB0] mt-space-1">{stat.label}</span>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}
