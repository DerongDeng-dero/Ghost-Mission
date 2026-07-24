import { motion } from 'framer-motion'
import type { Chapter } from '@/data/academy'

interface SkillTreeProps {
  chapter: Chapter
}

export default function SkillTree({ chapter }: SkillTreeProps) {
  const totalDrills = chapter.drills.length
  const completedCount = chapter.drills.filter((d) => d.status === 'completed').length

  return (
    <div className="w-full py-space-4">
      {/* Progress Stats */}
      <div className="flex items-center justify-between mb-space-3">
        <span className="font-jetbrains text-code-sm text-[#8B9EB0]">
          {completedCount} of {totalDrills} drills completed
        </span>
        <span className="font-jetbrains text-code-sm text-[#00FF88]">
          {totalDrills > 0 ? Math.round((completedCount / totalDrills) * 100) : 0}%
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-[#1A2332] rounded-full overflow-hidden mb-space-4">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${totalDrills > 0 ? (completedCount / totalDrills) * 100 : 0}%` }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="h-full rounded-full bg-[#00FF88]"
        />
      </div>

      {/* Node Tree */}
      <div className="relative flex items-center gap-0 overflow-x-auto pb-space-2">
        {/* Connecting Line Background */}
        <div
          className="absolute left-0 right-0 h-0.5"
          style={{
            backgroundColor: '#1E2D3D',
            top: '14px',
          }}
        />

        {/* Drill Nodes */}
        <div className="relative flex items-center gap-0 z-content">
          {chapter.drills.map((drill, index) => {
            const isCompleted = drill.status === 'completed'
            const isCurrent = drill.status === 'in-progress'
            const isLocked = drill.status === 'locked'

            return (
              <div key={drill.id} className="flex items-center">
                {/* Node */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    duration: 0.3,
                    delay: index * 0.05,
                    ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
                  }}
                  className="relative flex flex-col items-center gap-1"
                  style={{ width: `${100 / Math.max(totalDrills, 1)}%`, minWidth: 48 }}
                >
                  {/* Node Circle */}
                  <div
                    className="rounded-full transition-all duration-fast border-2"
                    style={{
                      width: isCurrent ? '16px' : isCompleted ? '12px' : '10px',
                      height: isCurrent ? '16px' : isCompleted ? '12px' : '10px',
                      backgroundColor: isCompleted ? '#00FF88' : isCurrent ? '#00E5FF' : 'transparent',
                      borderColor: isCompleted ? '#00FF88' : isCurrent ? '#00E5FF' : isLocked ? '#1E2D3D' : '#4A6072',
                      boxShadow: isCurrent ? '0 0 12px rgba(0,229,255,0.4)' : isCompleted ? '0 0 8px rgba(0,255,136,0.3)' : 'none',
                    }}
                  />

                  {/* Drill Number */}
                  <span
                    className="font-fira text-[9px] mt-0.5"
                    style={{
                      color: isCompleted ? '#00FF88' : isCurrent ? '#00E5FF' : '#4A6072',
                    }}
                  >
                    {drill.number}
                  </span>

                  {/* Drill Label (on hover / current / completed) */}
                  <span
                    className="font-fira text-[8px] text-center max-w-[60px] truncate"
                    style={{
                      color: isCompleted ? '#00FF88' : isCurrent ? '#00E5FF' : 'transparent',
                    }}
                  >
                    {drill.title.split(' ')[0]}
                  </span>
                </motion.div>

                {/* Connector Line (between nodes) */}
                {index < totalDrills - 1 && (
                  <div
                    className="h-0.5 flex-1 min-w-[12px]"
                    style={{
                      backgroundColor: isCompleted ? '#00FF88' : '#1E2D3D',
                      opacity: isCompleted ? 0.6 : 1,
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
