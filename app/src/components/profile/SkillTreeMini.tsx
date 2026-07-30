import { useEffect, useMemo, useState, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { ProgressChapter } from '@/data/progressCatalog';

interface Department {
  id: number;
  name: string;
  color: string;
  progress: number;
  subSkills: { name: string; progress: number }[];
}

function ProgressRing({
  progress,
  color,
  size = 36,
}: {
  progress: number;
  color: string;
  size?: number;
}) {
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const animatedProgressRef = useRef(0);
  const ref = useRef<SVGSVGElement>(null);
  const reduceMotion = useReducedMotion() ?? false;

  useEffect(() => {
    let frameId = 0;
    let started = false;
    const updateProgress = (nextProgress: number) => {
      animatedProgressRef.current = nextProgress;
      setAnimatedProgress(nextProgress);
    };

    if (reduceMotion) {
      animatedProgressRef.current = progress;
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          started = true;
          const initialProgress = animatedProgressRef.current;
          const start = performance.now();
          const duration = 800;
          const animate = (now: number) => {
            const elapsed = now - start;
            const p = Math.min(elapsed / duration, 1);
            const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
            updateProgress(Math.round(initialProgress + (progress - initialProgress) * eased));
            if (p < 1) frameId = requestAnimationFrame(animate);
          };
          frameId = requestAnimationFrame(animate);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frameId);
    };
  }, [progress, reduceMotion]);

  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const displayedProgress = reduceMotion ? progress : animatedProgress;
  const dashOffset = c - (displayedProgress / 100) * c;

  return (
    <svg ref={ref} width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#1E2D3D"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 100ms' }}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        className="font-jetbrains"
        style={{ fontSize: '9px', fill: '#8B9EB0' }}
      >
        {displayedProgress}%
      </text>
    </svg>
  );
}

export default function SkillTreeMini({ chapters }: { chapters: ProgressChapter[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const departments = useMemo<Department[]>(() => chapters.map((chapter) => {
    const subSkills = [...new Set(chapter.drills.flatMap((drill) => drill.skills))].map((name) => {
      const matchingDrills = chapter.drills.filter((drill) => drill.skills.includes(name));
      const completed = matchingDrills.filter((drill) => drill.status === 'completed').length;
      return {
        name,
        progress: matchingDrills.length === 0 ? 0 : Math.round((completed / matchingDrills.length) * 100),
      };
    });
    return {
      id: chapter.id,
      name: chapter.title,
      color: chapter.domainColor,
      progress: chapter.totalDrills === 0 ? 0 : Math.round((chapter.completedDrills / chapter.totalDrills) * 100),
      subSkills,
    };
  }), [chapters]);

  return (
    <div className="space-y-2">
      {departments.map((dept) => {
        const isExpanded = expandedId === dept.id;
        return (
          <div
            key={dept.id}
            className="rounded-radius-md overflow-hidden"
            style={{
              backgroundColor: '#0F1419',
              border: '1px solid #1E2D3D',
            }}
          >
            {/* Header */}
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : dept.id)}
              aria-expanded={isExpanded}
              aria-controls={`skill-department-${dept.id}`}
              className="w-full flex items-center gap-3 p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E14]"
            >
              <ProgressRing progress={dept.progress} color={dept.color} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="font-jetbrains text-badge px-1.5 py-0.5 rounded-sm"
                    style={{
                      color: dept.color,
                      backgroundColor: `${dept.color}15`,
                    }}
                  >
                    {String(dept.id).padStart(2, '0')}
                  </span>
                  <span className="font-jetbrains text-body font-semibold text-[#E8EDF2]">
                    {dept.name}
                  </span>
                </div>
                {/* Mini progress bar */}
                <div className="mt-1.5 w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#1A2332' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${dept.progress}%`,
                      backgroundColor: dept.color,
                    }}
                  />
                </div>
              </div>
              <motion.div
                animate={{ rotate: isExpanded ? 90 : 0 }}
                transition={{ duration: 0.2 }}
                className="text-[#788DA1] flex-shrink-0"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </motion.div>
            </button>

            {/* Expanded sub-skills */}
            <motion.div
              id={`skill-department-${dept.id}`}
              initial={false}
              animate={{ height: isExpanded ? 'auto' : 0, opacity: isExpanded ? 1 : 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              {isExpanded && (
                <div className="px-3 pb-3 pt-1 border-t border-[#1E2D3D] space-y-2">
                  {dept.subSkills.map((skill, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.25 }}
                      className="flex items-center gap-2"
                    >
                      <span className="font-fira text-body-sm text-[#8B9EB0] w-28 truncate flex-shrink-0">
                        {skill.name}
                      </span>
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: '#1A2332' }}>
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: dept.color }}
                          initial={{ width: 0 }}
                          animate={{ width: `${skill.progress}%` }}
                          transition={{ delay: 0.1 + i * 0.05, duration: 0.4 }}
                        />
                      </div>
                      <span className="font-jetbrains text-[10px] text-[#788DA1] w-7 text-right flex-shrink-0">
                        {skill.progress}%
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
