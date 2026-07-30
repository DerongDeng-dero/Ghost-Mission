import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface Skill {
  name: string;
  score: number;
}

interface SkillRadarProps {
  skills: Skill[];
  size?: number;
}

export default function SkillRadar({ skills, size = 400 }: SkillRadarProps) {
  const { t } = useTranslation();
  const [animated, setAnimated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAnimated(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  if (skills.length === 0) {
    return <p className="font-inter text-body text-[#8B9EB0]">{t('profile.noSkillData')}</p>;
  }

  const displaySkills = skills;
  const count = displaySkills.length;
  const center = size / 2;
  const radius = size * 0.35;
  const levels = 4;

  const angleForIndex = (i: number) => (Math.PI * 2 * i) / count - Math.PI / 2;

  const pointFor = (i: number, value: number, maxValue: number) => {
    const angle = angleForIndex(i);
    const r = (value / maxValue) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  const gridPolygons = Array.from({ length: levels }, (_, level) => {
    const levelRadius = ((level + 1) / levels) * radius;
    const points = Array.from({ length: count }, (_, i) => {
      const angle = angleForIndex(i);
      return `${center + levelRadius * Math.cos(angle)},${center + levelRadius * Math.sin(angle)}`;
    }).join(' ');
    return points;
  });

  const axisLines = Array.from({ length: count }, (_, i) => {
    const angle = angleForIndex(i);
    return {
      x2: center + radius * Math.cos(angle),
      y2: center + radius * Math.sin(angle),
    };
  });

  // Calculate skill polygon points with animation
  const skillPoints = displaySkills.map((skill, i) => {
    const animatedScore = animated ? skill.score : 0;
    const pt = pointFor(i, animatedScore, 100);
    return `${pt.x},${pt.y}`;
  }).join(' ');

  // Label positions
  const labels = displaySkills.map((skill, i) => {
    const angle = angleForIndex(i);
    const labelRadius = radius + 28;
    return {
      x: center + labelRadius * Math.cos(angle),
      y: center + labelRadius * Math.sin(angle),
      name: skill.name,
      score: skill.score,
    };
  });

  return (
    <div ref={ref} className="flex w-full flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="h-auto w-full overflow-visible"
        style={{ maxWidth: size }}
        role="img"
        aria-label={t('profile.skillRadarLabel', { skills: displaySkills.map((skill) => `${skill.name} ${skill.score}%`).join(', ') })}
      >
        <title>{t('profile.skillMastery')}</title>
        {/* Grid */}
        {gridPolygons.map((points, i) => (
          <polygon
            key={i}
            points={points}
            fill="none"
            stroke="#1E2D3D"
            strokeOpacity={0.4}
            strokeWidth={1}
          />
        ))}

        {/* Axes */}
        {axisLines.map((line, i) => (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={line.x2}
            y2={line.y2}
            stroke="#1E2D3D"
            strokeOpacity={0.4}
            strokeWidth={1}
          />
        ))}

        {/* Skill polygon */}
        <motion.polygon
          points={skillPoints}
          fill="rgba(0, 255, 136, 0.12)"
          stroke="#00FF88"
          strokeWidth={2}
          initial={{ opacity: 0 }}
          animate={{ opacity: animated ? 1 : 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
        />

        {/* Dots at skill points */}
        {animated && displaySkills.map((skill, i) => {
          const pt = pointFor(i, skill.score, 100);
          return (
            <motion.circle
              key={i}
              cx={pt.x}
              cy={pt.y}
              r={4}
              fill="#00FF88"
              initial={{ opacity: 0, r: 0 }}
              animate={{ opacity: 1, r: 4 }}
              transition={{ delay: 0.5 + i * 0.1, duration: 0.3 }}
            />
          );
        })}

        {/* Labels */}
        {labels.map((label, i) => (
          <g key={i}>
            <text
              x={label.x}
              y={label.y - 6}
              textAnchor="middle"
              className="font-jetbrains"
              style={{
                fontSize: '11px',
                fill: '#8B9EB0',
                letterSpacing: '0.01em',
              }}
            >
              {label.name}
            </text>
            <text
              x={label.x}
              y={label.y + 8}
              textAnchor="middle"
              className="font-jetbrains"
              style={{
                fontSize: '11px',
                fill: '#00FF88',
                fontWeight: 600,
              }}
            >
              {label.score}%
            </text>
          </g>
        ))}

        {/* Center label */}
        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="middle"
          className="font-jetbrains"
          style={{
            fontSize: '10px',
            fill: '#788DA1',
          }}
        >
          {t('profile.overall')}
        </text>
        <text
          x={center}
          y={center + 14}
          textAnchor="middle"
          dominantBaseline="middle"
          className="font-jetbrains"
          style={{
            fontSize: '14px',
            fill: '#00FF88',
            fontWeight: 700,
          }}
        >
          {Math.round(displaySkills.reduce((s, sk) => s + sk.score, 0) / count)}%
        </text>
      </svg>
    </div>
  );
}
