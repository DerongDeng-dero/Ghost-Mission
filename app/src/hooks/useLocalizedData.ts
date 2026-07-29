import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ALL_LEVELS } from '@/engine/levels';
import { mapRiskLevel, type Mission } from '@/data/missions';
import type { Chapter } from '@/data/academy';
import { buildLocalizedChapters } from '@/data/academy';
import { useGameStore } from '@/store/gameStore';

export function useLocalizedMissions(): Mission[] {
  const { i18n } = useTranslation();
  const isZh = i18n.language?.startsWith('zh') ?? false;
  const missionProgress = useGameStore(state => state.missionProgress);

  return useMemo(() => {
    return ALL_LEVELS.map((level) => {
      const progress = missionProgress[level.id];
      const status: Mission['status'] = progress?.status === 'completed'
        ? 'completed'
        : progress?.active
          ? 'in-progress'
          : 'available';
      const chNum = level.chapter_id.replace(/\D/g, '').padStart(2, '0');
      const chapter = isZh
        ? `第${chNum}章：${level.chapter_title_zh}`
        : `Ch${chNum}: ${level.chapter_title_en}`;

      let mode: Mission['mode'] = 'academy';
      if (level.mode === 'boss') mode = 'red-zone';
      else if (level.mode === 'nightmare') mode = 'nightmare';
      else if (level.mode === 'operation') mode = 'operation';

      const diff = Math.max(1, Math.min(5, level.difficulty));
      return {
        id: level.id,
        title: isZh ? level.title_zh : level.title_en,
        chapter,
        mode,
        difficulty: diff,
        estimatedTime: level.estimated_time,
        summary: isZh ? level.summary_zh : level.summary_en,
        story: {
          briefing: isZh ? level.story.briefing_zh : level.story.briefing_en,
          success: isZh ? level.story.success_zh : level.story.success_en,
          failure: isZh ? level.story.failure_zh : level.story.failure_en,
        },
        skills: level.skills,
        riskLevel: mapRiskLevel(level.risk_level),
        objectives: level.objectives.map((obj) => ({
          id: obj.id,
          label: isZh ? obj.label_zh : obj.label_en,
          required: obj.required,
        })),
        status,
        score: status === 'completed' ? progress?.bestScore : undefined,
        _title_en: level.title_en,
        _title_zh: level.title_zh,
        _summary_en: level.summary_en,
        _summary_zh: level.summary_zh,
        _briefing_en: level.story.briefing_en,
        _briefing_zh: level.story.briefing_zh,
        _label_en: level.objectives.map(o => o.label_en),
        _label_zh: level.objectives.map(o => o.label_zh),
      };
    });
  }, [isZh, missionProgress]);
}

export function useLocalizedChapters(): Chapter[] {
  const { i18n } = useTranslation();
  const isZh = i18n.language?.startsWith('zh') ?? false;
  const missionProgress = useGameStore(state => state.missionProgress);

  return useMemo(() => {
    return buildLocalizedChapters(isZh, missionProgress);
  }, [isZh, missionProgress]);
}
