import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  KeyRound,
  BookOpen,
  Sword,
  GitBranch,
  LayoutGrid,
  Merge,
  ShieldCheck,
  Search,
  Network,
  Bomb,
  Zap,
  Target,
  Compass,
  Flame,
  BookMarked,
  Container,
  Database,
  Terminal,
  Moon,
  Trash2,
  Lock,
} from 'lucide-react';
import { achievements, tierColors, achievementCategories } from '@/data/achievements';

const iconMap: Record<string, React.ElementType> = {
  KeyRound,
  BookOpen,
  Sword,
  GitBranch,
  LayoutGrid,
  Merge,
  ShieldCheck,
  Search,
  Network,
  Bomb,
  Zap,
  Target,
  Compass,
  Flame,
  BookMarked,
  Container,
  Database,
  Terminal,
  Moon,
  Trash2,
};

interface AchievementGridProps {
  compact?: boolean;
}

export default function AchievementGrid({ compact = false }: AchievementGridProps) {
  const [activeCategory, setActiveCategory] = useState('All');

  const filtered = activeCategory === 'All'
    ? achievements
    : achievements.filter((a) => a.category === activeCategory);

  return (
    <div className="space-y-4">
      {/* Category filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {achievementCategories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className="px-3 py-1.5 font-jetbrains text-body-sm transition-all duration-fast rounded-radius-sm"
            style={{
              color: activeCategory === cat ? '#00E5FF' : '#788DA1',
              backgroundColor: activeCategory === cat ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
              border: `1px solid ${activeCategory === cat ? '#00E5FF' : '#1E2D3D'}`,
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className={`grid gap-4 ${compact
        ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
        : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
      }`}>
        {filtered.map((ach, i) => {
          const Icon = iconMap[ach.icon] || Target;
          const tierColor = tierColors[ach.tier];
          const isUnlocked = ach.unlocked;

          return (
            <motion.div
              key={ach.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                duration: 0.25,
                delay: Math.min(i * 0.06, 0.6),
                ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
              }}
              className="flex flex-col items-center text-center p-4 rounded-radius-md transition-all duration-fast"
              style={{
                backgroundColor: '#0F1419',
                border: `2px solid ${isUnlocked ? tierColor : '#1E2D3D'}`,
                opacity: isUnlocked ? 1 : 0.6,
                filter: isUnlocked ? 'none' : 'grayscale(0.5)',
              }}
            >
              {/* Icon */}
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                style={{
                  backgroundColor: isUnlocked ? `${tierColor}15` : '#1A2332',
                  border: `2px solid ${isUnlocked ? tierColor : '#1E2D3D'}`,
                  boxShadow: isUnlocked ? `0 0 12px ${tierColor}20` : 'none',
                }}
              >
                {isUnlocked ? (
                  <Icon size={22} style={{ color: tierColor }} />
                ) : (
                  <Lock size={18} className="text-[#788DA1]" />
                )}
              </div>

              {/* Tier badge */}
              <span
                className="font-jetbrains text-badge uppercase px-1.5 py-0.5 rounded-radius-sm mb-2"
                style={{
                  color: tierColor,
                  backgroundColor: `${tierColor}15`,
                  border: `1px solid ${tierColor}30`,
                }}
              >
                {ach.tier}
              </span>

              {/* Title */}
              <h4 className="font-jetbrains text-body font-semibold text-[#E8EDF2] leading-tight">
                {ach.title}
              </h4>

              {/* Description */}
              <p className="font-inter text-body-sm text-[#8B9EB0] mt-1.5 line-clamp-2">
                {ach.description}
              </p>

              {/* Status */}
              {isUnlocked && ach.unlockedAt && (
                <span className="font-jetbrains text-[10px] text-[#00FF88] mt-2">
                  Unlocked {ach.unlockedAt}
                </span>
              )}
              {!isUnlocked && (
                <span className="font-jetbrains text-[10px] text-[#788DA1] mt-2">
                  Locked
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
