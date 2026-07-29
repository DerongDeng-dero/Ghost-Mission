import { motion } from 'framer-motion'
import { Lock, CheckCircle, Clock, Play, RotateCcw, Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { Mission } from '@/data/missions'
import { riskColors, modeLabels } from '@/data/missions'

interface MissionCardProps {
  mission: Mission
  index: number
  featured?: boolean
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

export default function MissionCard({ mission, index, featured = false }: MissionCardProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const risk = riskColors.find(r => r.level === mission.riskLevel)?.color
  const isLocked = mission.status === 'locked'
  const isCompleted = mission.status === 'completed'
  const isInProgress = mission.status === 'in-progress'

  const cardVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.25,
        delay: index * 0.05,
        ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
      },
    },
  }

  return (
    <motion.article
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      layout
      whileHover={!isLocked ? { y: -2, transition: { duration: 0.15 } } : {}}
      className={`relative flex flex-col overflow-hidden rounded-radius-md border ${featured ? 'min-h-[260px]' : 'min-h-[220px]'} ${isInProgress ? 'border-l-4 border-l-[#FFD166]' : 'border-l-0'}`}
      style={{
        backgroundColor: '#0F1419',
        borderColor: isInProgress ? '#1E2D3D' : '#1E2D3D',
        opacity: isLocked ? 0.6 : isCompleted ? 0.85 : 1,
        filter: isLocked ? 'grayscale(0.6)' : 'none',
      }}
    >
      {/* Risk Level Top Stripe */}
      <div
        className="h-1 w-full"
        style={{ backgroundColor: risk || '#00FF88' }}
        aria-hidden="true"
      />
      <span className="sr-only">{t('missionBoard.riskLevel', { level: mission.riskLevel })}</span>

      {/* Mode Badge */}
      <div className="absolute top-3 right-3">
        <span
          className="font-jetbrains text-badge uppercase px-2 py-0.5 rounded-radius-sm"
          style={{
            backgroundColor: mission.mode === 'red-zone' ? 'rgba(255,107,53,0.15)' :
              mission.mode === 'nightmare' ? 'rgba(255,71,87,0.15)' :
              mission.mode === 'operation' ? 'rgba(0,229,255,0.15)' : 'rgba(0,255,136,0.15)',
            color: mission.mode === 'red-zone' ? '#FF6B35' :
              mission.mode === 'nightmare' ? '#FF4757' :
              mission.mode === 'operation' ? '#00E5FF' : '#00FF88',
          }}
        >
          {modeLabels[mission.mode] || mission.mode}
        </span>
      </div>

      {/* Lock Overlay */}
      {isLocked && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0A0E14]/40">
          <div className="flex flex-col items-center gap-space-2">
            <Lock size={28} className="text-[#788DA1]" />
            <span className="font-jetbrains text-body-sm text-[#788DA1] uppercase tracking-wider">
              {t('missionBoard.locked')}
            </span>
          </div>
        </div>
      )}

      {/* Card Content */}
      <div className="flex flex-col flex-1 p-space-4 gap-space-3">
        {/* Title */}
        <h3 className="font-jetbrains text-h4 text-[#E8EDF2] pr-20 leading-tight" style={{ fontSize: '1rem' }}>
          {mission.title}
        </h3>

        {/* Difficulty + Time Row */}
        <div className="flex items-center gap-space-3">
          {/* Difficulty Stars */}
          <div className="flex items-center gap-0.5" aria-label={t('missionBoard.difficultyStars', { count: mission.difficulty })}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                size={14}
                className={i < mission.difficulty ? 'text-[#FFD166]' : 'text-[#1E2D3D]'}
                fill={i < mission.difficulty ? '#FFD166' : 'none'}
                aria-hidden="true"
              />
            ))}
          </div>
          {/* Time Badge */}
          <div className="flex items-center gap-1 text-[#788DA1]">
            <Clock size={12} />
            <span className="font-jetbrains text-body-sm">{mission.estimatedTime}</span>
          </div>
        </div>

        {/* Story Summary */}
        <p className="font-inter text-body text-[#8B9EB0] line-clamp-2 leading-relaxed flex-1">
          {mission.summary}
        </p>

        {/* Chapter Label */}
        <span className="font-jetbrains text-code-sm text-[#788DA1]">{mission.chapter}</span>

        {/* Skill Tags */}
        <div className="flex flex-wrap gap-1.5">
          {mission.skills.slice(0, 3).map((skill) => (
            <span
              key={skill}
              className="font-jetbrains text-badge uppercase px-2.5 py-0.5 rounded-full border"
              style={{
                color: skillColorMap[skill] || '#8B9EB0',
                borderColor: `${skillColorMap[skill] || '#8B9EB0'}33`,
                backgroundColor: `${skillColorMap[skill] || '#8B9EB0'}1A`,
              }}
            >
              {skill}
            </span>
          ))}
          {mission.skills.length > 3 && (
            <span className="font-jetbrains text-badge uppercase px-2 py-0.5 text-[#788DA1]">
              +{mission.skills.length - 3}
            </span>
          )}
        </div>

        {/* Footer: Score + CTA */}
        <div className="flex items-center justify-between pt-1">
          {isCompleted && (
            <div className="flex items-center gap-1.5">
              <CheckCircle size={14} className="text-[#00FF88]" />
              <span className="font-jetbrains text-code-sm text-[#00FF88]">{mission.score}%</span>
            </div>
          )}
          {isInProgress && (
            <div className="flex items-center gap-1.5">
              <div
                className="w-16 h-1.5 rounded-full bg-[#1A2332] overflow-hidden"
                role="progressbar"
                aria-label={t('missionBoard.missionProgress', { title: mission.title })}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={mission.score || 0}
              >
                <div
                  className="h-full rounded-full bg-[#FFD166]"
                  style={{ width: `${mission.score || 0}%` }}
                />
              </div>
              <span className="font-jetbrains text-code-sm text-[#FFD166]">{mission.score || 0}%</span>
            </div>
          )}
          {isLocked && <div />}

          {/* CTA Button */}
          {!isLocked && (
            <button
              type="button"
              onClick={() => navigate(`/terminal/${mission.id}`)}
              aria-label={`${isCompleted ? t('missionBoard.replay') : isInProgress ? t('missionBoard.continue') : t('missionBoard.enter')}: ${mission.title}`}
              className="flex min-h-11 items-center gap-1.5 rounded-radius-sm px-3 font-jetbrains text-code-sm transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
              style={{
                backgroundColor: isCompleted ? 'rgba(0,255,136,0.1)' : 'rgba(0,255,136,0.15)',
                color: '#00FF88',
                border: '1px solid rgba(0,255,136,0.3)',
              }}
            >
              {isCompleted ? (
                <><RotateCcw size={12} /> {t('missionBoard.replay')}</>
              ) : isInProgress ? (
                <><Play size={12} /> {t('missionBoard.continue')}</>
              ) : (
                <><Play size={12} /> {t('missionBoard.enter')}</>
              )}
            </button>
          )}
        </div>
      </div>
    </motion.article>
  )
}
