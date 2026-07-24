import { motion } from 'framer-motion'
import { Ghost } from 'lucide-react'
import MissionCard from './MissionCard'
import type { Mission } from '@/data/missions'

interface MissionGridProps {
  missions: Mission[]
  emptyMessage?: string
}

export default function MissionGrid({ missions, emptyMessage = 'No missions match your filters' }: MissionGridProps) {
  if (missions.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center justify-center py-space-16 gap-space-4"
      >
        <Ghost size={64} className="text-[#1E2D3D]" />
        <h3 className="font-jetbrains text-h3 text-[#8B9EB0]">{emptyMessage}</h3>
        <p className="font-inter text-body text-[#4A6072]">
          Try adjusting your filters or clearing them to see all missions.
        </p>
      </motion.div>
    )
  }

  return (
    <motion.div
      layout
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      {missions.map((mission, index) => (
        <MissionCard key={mission.id} mission={mission} index={index} />
      ))}
    </motion.div>
  )
}
