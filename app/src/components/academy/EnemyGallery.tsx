import { useState } from 'react'
import { motion } from 'framer-motion'
import { Skull } from 'lucide-react'
import { useTranslation } from 'react-i18next'
// EnemyGallery - enemy portrait gallery with skill tags
import type { Enemy } from '@/data/academy'

interface EnemyGalleryProps {
  enemies: Enemy[]
}

const skillColorMap: Record<string, string> = {
  less: '#00E5FF',
  man: '#00E5FF',
  vim: '#C77DFF',
  escape: '#FFD166',
  chmod: '#FF4757',
  security: '#FF4757',
  git: '#FF6B35',
  reset: '#FF6B35',
  kill: '#FF4757',
  SIGKILL: '#FF4757',
  cat: '#00FF88',
  find: '#00FF88',
  ln: '#00E5FF',
  df: '#4488FF',
  du: '#4488FF',
  netstat: '#00FF88',
  curl: '#00FF88',
}

const enemyKeyById: Record<string, string> = {
  e001: 'pagerPhantom',
  e002: 'vimTrapMonk',
  e003: 'resetDemon',
  e004: 'mergeConflictHydra',
  e005: 'backgroundJobGhost',
  e006: 'captainCat',
  e007: 'symlinkWraith',
  e008: 'diskHydra',
  e009: 'portMimic',
}

function EnemyPortrait({ src, name, color }: { src: string; name: string; color: string }) {
  const [failed, setFailed] = useState(false)
  const { t } = useTranslation()

  return (
    <div
      className="w-24 h-24 rounded-full flex items-center justify-center mb-space-3 border-2 overflow-hidden"
      style={{ borderColor: `${color}40`, backgroundColor: `${color}10` }}
    >
      {failed ? (
        <div role="img" aria-label={t('academy.portraitUnavailable', { name })} style={{ color }}>
          <Skull size={32} aria-hidden="true" />
        </div>
      ) : (
        <img
          src={src}
          alt={name}
          width={96}
          height={96}
          loading="lazy"
          className="w-full h-full object-cover"
          style={{ filter: `drop-shadow(0 0 8px ${color}30)` }}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}

export default function EnemyGallery({ enemies }: EnemyGalleryProps) {
  const { t } = useTranslation()
  return (
    <div className="w-full py-space-8">
      {/* Section Header */}
      <div className="mb-space-6">
        <h3 className="font-jetbrains text-h3 text-[#E8EDF2]">{t('academy.knowYourEnemies')}</h3>
        <p className="font-inter text-body text-[#8B9EB0] mt-1">
          {t('academy.enemyGallerySubtitle')}
        </p>
      </div>

      {/* Enemy Cards - Horizontal Scroll */}
      <div
        className="flex gap-4 overflow-x-auto pb-space-2 scrollbar-thin"
        tabIndex={0}
        aria-label={t('academy.enemies')}
      >
        {enemies.map((enemy, index) => {
          const enemyKey = enemyKeyById[enemy.id]
          const name = t(`academy.enemyNames.${enemyKey}`, { defaultValue: enemy.name })
          return (
          <motion.article
            key={enemy.id}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: 0.3,
              delay: index * 0.08,
              ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
            }}
            whileHover={{ y: -4, transition: { duration: 0.15 } }}
            className="flex-shrink-0 flex flex-col items-center p-space-5 rounded-radius-md border transition-shadow duration-fast"
            style={{
              backgroundColor: '#0F1419',
              borderColor: '#1E2D3D',
              width: '180px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = `${enemy.color}40`
              e.currentTarget.style.boxShadow = `0 0 20px ${enemy.color}15`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#1E2D3D'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <EnemyPortrait src={enemy.portrait} name={name} color={enemy.color} />

            {/* Enemy Name */}
            <h4
              className="font-jetbrains text-h4 text-center mb-1"
              style={{ color: enemy.color, fontSize: '0.875rem' }}
            >
              {name}
            </h4>

            {/* Description */}
            <p className="font-inter text-body-sm text-[#8B9EB0] text-center line-clamp-2 mb-space-2">
              {t(`academy.enemyDescriptions.${enemyKey}`, { defaultValue: enemy.description })}
            </p>

            {/* Skill Tags */}
            <div className="flex flex-wrap justify-center gap-1">
              {enemy.skills.map((skill) => (
                <span
                  key={skill}
                  className="font-jetbrains text-badge uppercase px-2 py-0.5 rounded-full"
                  style={{
                    color: skillColorMap[skill] || enemy.color,
                    backgroundColor: `${skillColorMap[skill] || enemy.color}15`,
                  }}
                >
                  {skill}
                </span>
              ))}
            </div>

            {/* Chapter */}
            <span className="font-fira text-code-sm text-[#788DA1] mt-space-2 text-center">
              {t(`academy.enemyChapters.${enemyKey}`, { defaultValue: enemy.chapter })}
            </span>
          </motion.article>
          )
        })}
      </div>
    </div>
  )
}
