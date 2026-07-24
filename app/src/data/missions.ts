import { ALL_LEVELS, type MissionLevel } from '@/engine/levels';
import i18n from '@/i18n/i18n';

export type MissionMode = 'academy' | 'operation' | 'nightmare' | 'red-zone';
export type MissionStatus = 'available' | 'in-progress' | 'completed' | 'locked';

const RISK_LEVEL_NUMBERS: Record<string, number> = {
  green: 1,
  blue: 2,
  yellow: 3,
  red: 4,
  purple: 5,
  black: 6,
};

export function mapRiskLevel(riskLevel: string): number {
  return RISK_LEVEL_NUMBERS[riskLevel.trim().toLowerCase()] ?? 0;
}

export interface Mission {
  id: string;
  title: string;
  chapter: string;
  mode: MissionMode;
  difficulty: number;
  estimatedTime: string;
  summary: string;
  story: { briefing: string; success: string; failure: string };
  skills: string[];
  riskLevel: number;
  objectives: { id: string; label: string; required: boolean }[];
  status: MissionStatus;
  score?: number;
  // Store bilingual data for dynamic switching
  _title_en: string;
  _title_zh: string;
  _summary_en: string;
  _summary_zh: string;
  _briefing_en: string;
  _briefing_zh: string;
  _label_en: string[];
  _label_zh: string[];
}

function mapMode(levelMode: string): Mission['mode'] {
  if (levelMode === 'boss') return 'red-zone';
  if (levelMode === 'nightmare') return 'nightmare';
  if (levelMode === 'operation') return 'operation';
  return 'academy';
}

function clampDifficulty(d: number): number {
  return Math.max(1, Math.min(5, d));
}

function formatChapter(level: MissionLevel): string {
  const chNum = level.chapter_id.replace(/\D/g, '');
  const padded = chNum.padStart(2, '0');
  const isZh = i18n.language?.startsWith('zh');
  return isZh ? `第${padded}章：${level.chapter_title_zh}` : `Ch${padded}: ${level.chapter_title_en}`;
}

function deriveMissions(): Mission[] {
  const isZh = i18n.language?.startsWith('zh');

  return ALL_LEVELS.map((level, index) => {
    let status: Mission['status'];
    if (index < 50) status = 'available';
    else status = 'locked';

    const score = undefined;

    return {
      id: level.id,
      title: isZh ? level.title_zh : level.title_en,
      chapter: formatChapter(level),
      mode: mapMode(level.mode),
      difficulty: clampDifficulty(level.difficulty),
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
      score,
      // Bilingual backup
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
}

export const missions: Mission[] = deriveMissions();

export interface SkillDomain {
  name: string;
  color: string;
}

export const skillDomains: SkillDomain[] = [
  { name: 'Filesystem', color: '#00FF88' },
  { name: 'Shell', color: '#E8EDF2' },
  { name: 'Git', color: '#FF6B35' },
  { name: 'Vim', color: '#C77DFF' },
  { name: 'Text Processing', color: '#00E5FF' },
  { name: 'Process', color: '#FFD166' },
  { name: 'Network', color: '#00E5FF' },
  { name: 'Docker', color: '#2496ED' },
  { name: 'Security', color: '#FF4757' },
  { name: 'tmux', color: '#2A9D8F' },
  { name: 'Services', color: '#FF6B6B' },
  { name: 'Package', color: '#4488FF' },
  { name: 'Editor', color: '#FF4757' },
  { name: 'Runtime', color: '#2A9D8F' },
  { name: 'Container', color: '#2496ED' },
];

export interface RiskColor {
  level: number;
  color: string;
}

export const riskColors: RiskColor[] = [
  { level: 0, color: '#00FF88' },
  { level: 1, color: '#00FF88' },
  { level: 2, color: '#00E5FF' },
  { level: 3, color: '#FFD166' },
  { level: 4, color: '#FF4757' },
  { level: 5, color: '#C77DFF' },
  { level: 6, color: '#FF4757' },
];

export const modeLabels: Record<string, string> = {
  academy: 'ACADEMY',
  operation: 'OPERATION',
  nightmare: 'NIGHTMARE',
  'red-zone': 'RED ZONE',
};
