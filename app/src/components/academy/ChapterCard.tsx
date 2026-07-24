import { motion } from 'framer-motion'
import { Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Chapter } from '@/data/academy'

interface ChapterCardProps {
  chapter: Chapter
  isActive: boolean
  onClick: () => void
}

export default function ChapterCard({ chapter, isActive, onClick }: ChapterCardProps) {
  const { t } = useTranslation()
  const progress = chapter.totalDrills > 0 ? (chapter.completedDrills / chapter.totalDrills) * 100 : 0
  const isCompleted = chapter.completedDrills === chapter.totalDrills
  const isLocked = chapter.completedDrills === 0 && !isActive

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      aria-label={t('academy.chapterProgressLabel', {
        number: chapter.number,
        title: chapter.subtitle,
        completed: chapter.completedDrills,
        total: chapter.totalDrills,
      })}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      className="relative flex min-h-11 min-w-[72px] flex-col items-center gap-1 rounded-radius-sm px-2 py-2 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
      style={{
        backgroundColor: isActive ? '#0F1419' : '#1A2332',
        borderBottom: isActive ? '2px solid #00E5FF' : '2px solid transparent',
      }}
    >
      {/* Completed indicator */}
      {isCompleted && (
        <div className="absolute -top-0.5 -right-0.5">
          <div className="w-2 h-2 rounded-full bg-[#00FF88]" aria-hidden="true" />
        </div>
      )}

      {/* Chapter Number */}
      <span
        className="font-jetbrains text-badge uppercase"
        style={{ color: isActive ? '#00E5FF' : '#4A6072' }}
      >
        {chapter.number}
      </span>

      {/* Abbreviated Name */}
      <span
        className="font-fira text-code-sm whitespace-nowrap"
        style={{ color: isActive ? '#E8EDF2' : '#8B9EB0' }}
      >
        {chapter.subtitle.split(' ')[0]}
      </span>

      {/* Progress bar */}
      <div
        className="w-full h-0.5 bg-[#1A2332] rounded-full mt-0.5 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="h-full rounded-full"
          style={{ backgroundColor: isCompleted ? '#00FF88' : isActive ? '#00E5FF' : '#4A6072' }}
        />
      </div>

      {/* Lock indicator */}
      {isLocked && !isActive && (
        <Lock size={8} aria-hidden="true" className="absolute bottom-0.5 right-0.5 text-[#4A6072]" />
      )}
    </motion.button>
  )
}
