import { motion } from 'framer-motion'
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

export default function EnemyGallery({ enemies }: EnemyGalleryProps) {
  return (
    <div className="w-full py-space-8">
      {/* Section Header */}
      <div className="mb-space-6">
        <h3 className="font-jetbrains text-h3 text-[#E8EDF2]">Know Your Enemies</h3>
        <p className="font-inter text-body text-[#8B9EB0] mt-1">
          These are the habits and traps that catch even experienced operators
        </p>
      </div>

      {/* Enemy Cards - Horizontal Scroll */}
      <div className="flex gap-4 overflow-x-auto pb-space-2 scrollbar-thin">
        {enemies.map((enemy, index) => (
          <motion.div
            key={enemy.id}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: 0.3,
              delay: index * 0.08,
              ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
            }}
            whileHover={{ y: -4, transition: { duration: 0.15 } }}
            className="flex-shrink-0 flex flex-col items-center p-space-5 rounded-radius-md border cursor-pointer transition-shadow duration-fast"
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
            {/* Portrait Placeholder */}
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center mb-space-3 border-2 overflow-hidden"
              style={{
                borderColor: `${enemy.color}40`,
                backgroundColor: `${enemy.color}10`,
              }}
            >
              <img
                src={enemy.portrait}
                alt={enemy.name}
                className="w-full h-full object-cover"
                style={{
                  filter: `drop-shadow(0 0 8px ${enemy.color}30)`,
                }}
                onError={(e) => {
                  // Fallback if image fails to load
                  const target = e.currentTarget
                  target.style.display = 'none'
                  const parent = target.parentElement
                  if (parent) {
                    const skull = document.createElement('div')
                    skull.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M8 20v2h8v-2"/><path d="M12 2C7.5 2 4 5.5 4 10c0 2.5 1 4.5 2.5 6L8 20h8l1.5-4c1.5-1.5 2.5-3.5 2.5-6 0-4.5-3.5-8-8-8z"/></svg>'
                    skull.firstElementChild?.setAttribute('color', enemy.color)
                    parent.appendChild(skull.firstElementChild as Node)
                  }
                }}
              />
            </div>

            {/* Enemy Name */}
            <h4
              className="font-jetbrains text-h4 text-center mb-1"
              style={{ color: enemy.color, fontSize: '0.875rem' }}
            >
              {enemy.name}
            </h4>

            {/* Description */}
            <p className="font-inter text-body-sm text-[#8B9EB0] text-center line-clamp-2 mb-space-2">
              {enemy.description}
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
            <span className="font-fira text-code-sm text-[#4A6072] mt-space-2 text-center">
              {enemy.chapter}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
