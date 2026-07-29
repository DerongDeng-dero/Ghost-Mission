import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Target,
  Keyboard,
  DoorOpen,
  GitBranch,
  LayoutGrid,
  Shield,
  Skull,
  Flame,
  Zap,
  Play,
  RotateCcw,
  Lock,
  CheckCircle,
  Clock,
} from 'lucide-react'
import type { TrainingDrill } from '@/data/academy'
import { drillTypeConfig } from '@/data/academy'

interface TrainingCardProps {
  drill: TrainingDrill
  index: number
}

const skillColorMap: Record<string, string> = {
  Filesystem: '#00FF88',
  Git: '#FF6B35',
  Vim: '#C77DFF',
  Network: '#00E5FF',
  Process: '#FFD166',
  Security: '#FF4757',
  Docker: '#2496ED',
  Shell: '#E8EDF2',
  tmux: '#2A9D8F',
  'Text Processing': '#00E5FF',
  Services: '#4488FF',
}

const riskColorMap: Record<string, string> = {
  green: '#00FF88',
  blue: '#00E5FF',
  yellow: '#FFD166',
  red: '#FF4757',
  purple: '#C77DFF',
  black: '#FF6B35',
}

const iconMap: Record<string, React.ReactNode> = {
  Target: <Target size={14} />,
  Keyboard: <Keyboard size={14} />,
  DoorOpen: <DoorOpen size={14} />,
  GitBranch: <GitBranch size={14} />,
  LayoutGrid: <LayoutGrid size={14} />,
  Shield: <Shield size={14} />,
  Skull: <Skull size={14} />,
  Flame: <Flame size={14} />,
  Zap: <Zap size={14} />,
}

export default function TrainingCard({ drill, index }: TrainingCardProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const isLocked = drill.status === 'locked'
  const isCompleted = drill.status === 'completed'
  const isInProgress = drill.status === 'in-progress'
  const isBoss = drill.type === 'boss'
  const isNightmare = drill.type === 'nightmare'
  const displayTitle = isBoss
    ? drill.title.replace(/^[^:：]+[:：]\s*/, '')
    : drill.title

  const typeConfig = drillTypeConfig[drill.type] || drillTypeConfig.command
  const typeIcon = iconMap[typeConfig.icon] || iconMap.Target
  const typeColor = typeConfig.color

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.3,
        delay: index * 0.06,
        ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
      },
    },
  }

  return (
    <motion.article
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={!isLocked ? { y: -2, transition: { duration: 0.15 } } : {}}
      className={`relative flex flex-col rounded-radius-md border overflow-hidden ${isBoss ? 'sm:col-span-2' : ''}`}
      style={{
        backgroundColor: '#0F1419',
        borderColor: isBoss ? `${typeColor}30` : isNightmare ? 'rgba(255,71,87,0.3)' : '#1E2D3D',
        borderTopWidth: isCompleted ? '3px' : undefined,
        borderTopColor: isCompleted ? '#00FF88' : isInProgress ? '#FFD166' : undefined,
        opacity: isLocked ? 0.5 : 1,
        filter: isLocked ? 'grayscale(0.5)' : 'none',
      }}
    >
      {/* Boss card background tint */}
      {isBoss && (
        <div
          className="absolute inset-0 opacity-5"
          style={{ backgroundColor: typeColor }}
        />
      )}

      {/* Lock overlay for boss/nightmare */}
      {isLocked && (isBoss || isNightmare) && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0A0E14]/50">
          <div className="flex flex-col items-center gap-space-2">
            <Lock size={24} className="text-[#788DA1]" />
            <span className="font-jetbrains text-body-sm text-[#788DA1]">{t('academy.completePreviousDrills')}</span>
          </div>
        </div>
      )}

      <div className="relative flex flex-col p-space-4 gap-space-2">
        {/* Header Row */}
        <div className="flex items-start justify-between">
          <div className="flex min-w-0 items-center gap-space-2">
            {/* Type Icon */}
            <div
              className="flex items-center justify-center w-7 h-7 rounded-radius-sm"
              style={{ color: typeColor, backgroundColor: `${typeColor}15` }}
            >
              {typeIcon}
            </div>
            {/* Number + Title */}
            <div className="flex min-w-0 items-center gap-space-1.5">
              <span className="font-fira text-code-sm text-[#788DA1]">{drill.number}.</span>
              <h4 className="min-w-0 break-words font-jetbrains text-h4 text-[#E8EDF2]" style={{ fontSize: '0.9375rem' }}>
                {isBoss && (
                  <span className="text-badge uppercase mr-2" style={{ color: '#C77DFF' }}>{t('academy.boss')}</span>
                )}
                {displayTitle}
              </h4>
            </div>
          </div>

          {/* Time */}
          <div className="flex items-center gap-1 text-[#788DA1] flex-shrink-0 ml-2">
            <Clock size={12} />
            <span className="font-jetbrains text-body-sm">{drill.duration}</span>
          </div>
        </div>

        {/* Description */}
        <p className="font-inter text-body text-[#8B9EB0] line-clamp-2 leading-relaxed">
          {drill.description}
        </p>

        {/* Tags + CTA Row */}
        <div className="flex flex-col items-start justify-between gap-3 pt-1 sm:flex-row sm:items-center">
          {/* Skill Tags + Risk */}
          <div className="flex flex-wrap gap-1.5">
            {drill.skills.map((skill) => (
              <span
                key={skill}
                className="font-jetbrains text-badge uppercase px-2 py-0.5 rounded-full border"
                style={{
                  color: skillColorMap[skill] || '#8B9EB0',
                  borderColor: `${skillColorMap[skill] || '#8B9EB0'}33`,
                  backgroundColor: `${skillColorMap[skill] || '#8B9EB0'}1A`,
                }}
              >
                {skill}
              </span>
            ))}
            <span
              className="font-jetbrains text-badge uppercase px-2 py-0.5 rounded-full"
              style={{
                color: riskColorMap[drill.riskLevel] || '#8B9EB0',
                backgroundColor: `${riskColorMap[drill.riskLevel] || '#8B9EB0'}15`,
              }}
            >
              {t('academy.riskLevel', { level: drill.riskLevel })}
            </span>
          </div>

          {/* CTA */}
          {!isLocked && (
            <button
              type="button"
              onClick={() => navigate(`/terminal/${drill.id}`)}
              aria-label={`${isCompleted ? t('academy.replay') : t('academy.start')}: ${drill.title}`}
              className="flex min-h-11 flex-shrink-0 items-center gap-1 rounded-radius-sm px-3 font-jetbrains text-code-sm transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF] sm:ml-2"
              style={{
                backgroundColor: isCompleted ? 'rgba(0,255,136,0.1)' : 'rgba(0,255,136,0.15)',
                color: isBoss ? '#C77DFF' : '#00FF88',
                border: `1px solid ${isBoss ? 'rgba(199,125,255,0.3)' : 'rgba(0,255,136,0.3)'}`,
              }}
            >
              {isCompleted ? (
                <><RotateCcw size={12} aria-hidden="true" /> {t('academy.replay')}</>
              ) : (
                <><Play size={12} aria-hidden="true" /> {t('academy.start')}</>
              )}
            </button>
          )}
        </div>

        {/* Completed score */}
        {isCompleted && drill.score !== undefined && (
          <div className="flex items-center gap-1.5 pt-0.5">
            <CheckCircle size={12} className="text-[#00FF88]" />
            <span className="font-jetbrains text-code-sm text-[#00FF88]">{t('academy.scoreComplete', { score: drill.score })}</span>
          </div>
        )}
      </div>
    </motion.article>
  )
}
