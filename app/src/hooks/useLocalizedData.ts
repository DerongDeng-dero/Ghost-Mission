import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ALL_LEVELS } from '@/engine/levels';
import { mapRiskLevel, type Mission } from '@/data/missions';
import type { TrainingDrill, Chapter } from '@/data/academy';
import { chapterMetaList, deriveDrillFromLevel } from '@/data/academy';

export function useLocalizedMissions(): Mission[] {
  const { i18n } = useTranslation();
  const isZh = i18n.language?.startsWith('zh') ?? false;

  return useMemo(() => {
    return ALL_LEVELS.map((level, index) => {
      const chNum = level.chapter_id.replace(/\D/g, '').padStart(2, '0');
      const chapter = isZh
        ? `第${chNum}章：${level.chapter_title_zh}`
        : `Ch${chNum}: ${level.chapter_title_en}`;

      let mode: Mission['mode'] = 'academy';
      if (level.mode === 'boss') mode = 'red-zone';
      else if (level.mode === 'nightmare') mode = 'nightmare';
      else if (level.mode === 'operation') mode = 'operation';

      const diff = Math.max(1, Math.min(5, level.difficulty));
      const status = index < 50 ? 'available' as const : 'locked' as const;

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
        score: undefined,
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
  }, [isZh]);
}

export function useLocalizedChapters(): Chapter[] {
  const { i18n } = useTranslation();
  const isZh = i18n.language?.startsWith('zh') ?? false;

  return useMemo(() => {
    return chapterMetaList.map((meta) => {
      const chapterLevels = ALL_LEVELS.filter(
        (l) => l.chapter_id === meta.chapterId
      );
      const drills: TrainingDrill[] = chapterLevels.map((level, chapterIndex) =>
        deriveDrillFromLevel(level, chapterIndex + 1, isZh)
      );

      const completedDrills = drills.filter((d) => d.status === 'completed').length;
      const totalXP = completedDrills * 100;

      return {
        id: meta.id,
        number: meta.number,
        title: isZh ? meta.title : meta.title.replace(/系统启动|文件系统基础|文件操作|分页器|Vim神庙|Git迷宫|进程追踪|暗影网络|Docker港湾|Shell精通|监控器|红区|777博士|逃脱|幽灵协议|终极终端|多路复用器/g, (m) => {
          const map: Record<string, string> = {
            '系统启动': 'System Boot', '文件系统基础': 'Filesystem Basics', '文件操作': 'File Manipulation',
            '分页器': 'The Pager', 'Vim神庙': 'Vim Temple', 'Git迷宫': 'Git Labyrinth',
            '进程追踪': 'Process Hunt', '暗影网络': 'Shadow Network', 'Docker港湾': 'Docker Bay',
            'Shell精通': 'Shell Mastery', '监控器': 'The Monitor', '红区': 'Red Zone',
            '777博士': 'Doctor 777', '逃脱': 'The Escape', '幽灵协议': 'Ghost Protocol',
            '终极终端': 'Final Terminal', '多路复用器': 'Multiplexer',
          };
          return map[m] || m;
        }),
        subtitle: meta.subtitle,
        description: isZh ? meta.description : meta.description, // Keep Chinese for now
        drills,
        totalDrills: drills.length,
        completedDrills,
        domain: meta.domain,
        domainColor: meta.domainColor,
        totalXP,
      };
    });
  }, [isZh]);
}
