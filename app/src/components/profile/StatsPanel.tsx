import { useEffect, useState, useRef } from 'react';
import { motion, useReducedMotionConfig } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Crosshair, Terminal, Flame } from 'lucide-react';

interface StatsPanelProps {
  missionsCompleted: number;
  commandsLearned: number;
  currentStreak: number;
  currentLevelXP: number;
  level?: number;
  xpToNextLevel?: number;
}

function AnimatedNumber({ value, duration = 800 }: { value: number; duration?: number }) {
  const reduceMotion = useReducedMotionConfig() ?? false;
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frameId = 0;
    let started = false;
    const updateDisplay = (nextValue: number) => {
      displayRef.current = nextValue;
      setDisplay(nextValue);
    };

    if (reduceMotion) {
      displayRef.current = value;
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          started = true;
          const initialValue = displayRef.current;
          const start = performance.now();
          const animate = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // ease-out-expo
            const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            updateDisplay(Math.round(initialValue + (value - initialValue) * eased));
            if (progress < 1) frameId = requestAnimationFrame(animate);
          };
          frameId = requestAnimationFrame(animate);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frameId);
    };
  }, [value, duration, reduceMotion]);

  return <span ref={ref}>{(reduceMotion ? value : display).toLocaleString()}</span>;
}

export default function StatsPanel({
  missionsCompleted,
  commandsLearned,
  currentStreak,
  currentLevelXP,
  level = 12,
  xpToNextLevel = 5000,
}: StatsPanelProps) {
  const { t } = useTranslation();
  const xpProgress = Math.min((currentLevelXP / xpToNextLevel) * 100, 100);

  const stats = [
    {
      label: t('profile.missionsCleared'),
      value: missionsCompleted,
      icon: Crosshair,
      color: '#00FF88',
    },
    {
      label: t('profile.commandsLearned'),
      value: commandsLearned,
      icon: Terminal,
      color: '#00E5FF',
    },
    {
      label: t('profile.dayStreak'),
      value: currentStreak,
      icon: Flame,
      color: '#FFD166',
    },
  ];

  return (
    <div className="space-y-5">
      {/* XP Progress */}
      <div className="w-full max-w-[400px]">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-jetbrains text-body-sm text-[#8B9EB0]">
            {t('profile.levelNumber', { level })}
          </span>
          <span className="font-jetbrains text-body-sm text-[#00FF88]">
            <AnimatedNumber value={currentLevelXP} /> / {xpToNextLevel.toLocaleString()} XP
          </span>
        </div>
        <div
          className="w-full h-2 rounded-full overflow-hidden"
          style={{ backgroundColor: '#1A2332' }}
          role="progressbar"
          aria-label={t('profile.xpProgress')}
          aria-valuemin={0}
          aria-valuemax={xpToNextLevel}
          aria-valuenow={Math.min(currentLevelXP, xpToNextLevel)}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: '#00FF88' }}
            initial={{ width: 0 }}
            animate={{ width: `${xpProgress}%` }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                delay: 0.1 + i * 0.1,
                ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
              }}
              className="p-5 rounded-radius-md"
              style={{
                backgroundColor: '#0F1419',
                border: '1px solid #1E2D3D',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} style={{ color: stat.color }} />
                <span className="font-jetbrains text-body-sm text-[#8B9EB0]">
                  {stat.label}
                </span>
              </div>
              <div
                className="font-jetbrains text-h2"
                style={{ color: stat.color }}
              >
                <AnimatedNumber value={stat.value} />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
