import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'

interface SettingSectionProps {
  icon: LucideIcon
  title: string
  description: string
  children: React.ReactNode
}

export default function SettingSection({ icon: Icon, title, description, children }: SettingSectionProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-40px' })

  return (
    <motion.div
      ref={ref}
      className="mb-space-8"
      initial={{ opacity: 0, y: 16 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
    >
      {/* Section header */}
      <div className="flex items-start gap-space-3 mb-space-5">
        <div
          className="flex-shrink-0 w-9 h-9 rounded-radius-md flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 229, 255, 0.08)' }}
        >
          <Icon size={18} style={{ color: '#00E5FF' }} />
        </div>
        <div>
          <h3 className="font-jetbrains text-h3 text-[#E8EDF2]">{title}</h3>
          <p className="font-inter text-body text-[#8B9EB0] mt-space-0.5">{description}</p>
        </div>
      </div>

      {/* Section content */}
      <div className="space-y-space-4">{children}</div>
    </motion.div>
  )
}
