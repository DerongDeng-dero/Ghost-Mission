import { ALL_LEVELS } from '@/engine/levels';
import type { MissionLevel } from '@/engine/levels';
import { publicAssetUrl } from '@/lib/publicAsset';
import type { MissionProgressMap } from '@/store/gameStore';

export interface TrainingDrill {
  id: string;
  number: number;
  title: string;
  description: string;
  type: 'command' | 'shortcut' | 'escape' | 'pipe' | 'git' | 'tmux' | 'operation' | 'boss' | 'nightmare' | 'combo';
  duration: string;
  skills: string[];
  riskLevel: 'green' | 'blue' | 'yellow' | 'red' | 'purple' | 'black';
  status: 'locked' | 'available' | 'in-progress' | 'completed';
  score?: number;
}

export interface Chapter {
  id: number;
  number: string;
  title: string;
  subtitle: string;
  description: string;
  domain: string;
  domainColor: string;
  drills: TrainingDrill[];
  totalDrills: number;
  completedDrills: number;
}

export interface Enemy {
  id: string;
  name: string;
  description: string;
  portrait: string;
  color: string;
  skills: string[];
  chapter: string;
}

export interface SkillTreeNode {
  id: string;
  label: string;
  chapter: number;
  status: 'locked' | 'available' | 'completed';
  domain: string;
  domainColor: string;
}

function mapDrillType(levelMode: string): TrainingDrill['type'] {
  switch (levelMode) {
    case 'academy': return 'command';
    case 'operation': return 'operation';
    case 'nightmare': return 'nightmare';
    case 'boss': return 'boss';
    default: return 'command';
  }
}

export function deriveDrillFromLevel(
  level: MissionLevel,
  numberInChapter: number,
  isZh: boolean = true,
  missionProgress: MissionProgressMap = {},
): TrainingDrill {
  const progress = missionProgress[level.id]
  const status: TrainingDrill['status'] = progress?.status === 'completed'
    ? 'completed'
    : progress?.active
      ? 'in-progress'
      : 'available'

  return {
    id: level.id,
    number: numberInChapter,
    title: isZh ? level.title_zh : level.title_en,
    description: isZh ? level.summary_zh : level.summary_en,
    type: mapDrillType(level.mode),
    duration: level.estimated_time,
    skills: level.skills,
    riskLevel: level.risk_level as TrainingDrill['riskLevel'],
    status,
    score: status === 'completed' ? progress?.bestScore : undefined,
  };
}

/* ──────────────────────────────────────────────
   Presentation-only chapter metadata. Titles, skills, and drill content come
   from all_levels.json so the Academy cannot drift from the mission catalog.
   ────────────────────────────────────────────── */

export interface ChapterMeta {
  id: number;
  number: string;
  domainColor: string;
  chapterId: string; // matches level.chapter_id from JSON
}

export const chapterMetaList: ChapterMeta[] = [
  { id: 1, number: 'Ch01', domainColor: '#E8EDF2', chapterId: 'ch01' },
  { id: 2, number: 'Ch02', domainColor: '#00FF88', chapterId: 'ch02' },
  { id: 3, number: 'Ch03', domainColor: '#00FF88', chapterId: 'ch03' },
  { id: 4, number: 'Ch04', domainColor: '#FF4757', chapterId: 'ch04' },
  { id: 5, number: 'Ch05', domainColor: '#00E5FF', chapterId: 'ch05' },
  { id: 6, number: 'Ch06', domainColor: '#E8EDF2', chapterId: 'ch06' },
  { id: 7, number: 'Ch07', domainColor: '#00E5FF', chapterId: 'ch07' },
  { id: 8, number: 'Ch08', domainColor: '#C77DFF', chapterId: 'ch08' },
  { id: 9, number: 'Ch09', domainColor: '#FFD166', chapterId: 'ch09' },
  { id: 10, number: 'Ch10', domainColor: '#4488FF', chapterId: 'ch10' },
  { id: 11, number: 'Ch11', domainColor: '#00FF88', chapterId: 'ch11' },
  { id: 12, number: 'Ch12', domainColor: '#00E5FF', chapterId: 'ch12' },
  { id: 13, number: 'Ch13', domainColor: '#FFD166', chapterId: 'ch13' },
  { id: 14, number: 'Ch14', domainColor: '#FF6B35', chapterId: 'ch14' },
  { id: 15, number: 'Ch15', domainColor: '#C77DFF', chapterId: 'ch15' },
  { id: 16, number: 'Ch16', domainColor: '#FF6B35', chapterId: 'ch16' },
  { id: 17, number: 'Ch17', domainColor: '#2A9D8F', chapterId: 'ch17' },
];

/* ──────────────────────────────────────────────
   Build chapters with dynamically-generated drills
   ────────────────────────────────────────────── */

export function buildLocalizedChapters(
  isZh: boolean = true,
  missionProgress: MissionProgressMap = {},
): Chapter[] {
  const levelsByChapter = new Map<string, MissionLevel[]>();
  for (const level of ALL_LEVELS) {
    const cid = level.chapter_id;
    if (!levelsByChapter.has(cid)) {
      levelsByChapter.set(cid, []);
    }
    levelsByChapter.get(cid)!.push(level);
  }

  return chapterMetaList.map((meta): Chapter => {
    const levels = levelsByChapter.get(meta.chapterId) ?? [];
    const firstLevel = levels[0];
    if (!firstLevel) throw new Error(`Academy chapter ${meta.chapterId} has no mission levels`);
    const drills = levels.map((level, idx) =>
      deriveDrillFromLevel(level, idx + 1, isZh, missionProgress)
    );
    const completedDrills = drills.filter((d) => d.status === 'completed').length;
    const featuredSkills = [...new Set(levels.flatMap(level => level.skills))].slice(0, 6);
    const title = isZh ? firstLevel.chapter_title_zh : firstLevel.chapter_title_en;
    const description = isZh
      ? `${levels.length} 个“${title}”训练任务，覆盖 ${featuredSkills.join('、')} 等技能。`
      : `${levels.length} ${title} missions covering ${featuredSkills.join(', ')} and related skills.`;

    return {
      id: meta.id,
      number: meta.number,
      title,
      subtitle: firstLevel.chapter_skill,
      description,
      domain: firstLevel.chapter_skill,
      domainColor: meta.domainColor,
      drills,
      totalDrills: drills.length,
      completedDrills,
    };
  });
}

export const chapters: Chapter[] = buildLocalizedChapters();

export const enemies: Enemy[] = [
  {
    id: 'e001', name: '分页幽灵',
    description: '将操作员困在滚动的文本页面中。一旦进入，很少有人记得按q键。',
    portrait: publicAssetUrl('enemy-pager-phantom.png'), color: '#00E5FF',
    skills: ['less', 'more', 'man'], chapter: '第15章：编辑器与REPL',
  },
  {
    id: 'e002', name: 'Vim陷阱僧侣',
    description: '一个沉默的守护者，将你锁定在各种模式中。许多人在尝试退出时倒下了。',
    portrait: publicAssetUrl('enemy-vim-trap.png'), color: '#C77DFF',
    skills: ['vim', 'nano'], chapter: '第15章：编辑器与REPL',
  },
  {
    id: 'e003', name: '重置恶魔',
    description: '以丢失的提交和强制推送为食。它把你的Git历史变成一片荒地。',
    portrait: publicAssetUrl('enemy-doctor-777.png'), color: '#FF6B35',
    skills: ['git reset', 'git push --force'], chapter: '第16章：Git时间线',
  },
  {
    id: 'e004', name: '合并冲突九头蛇',
    description: '每当你解决一个冲突，就会有另外两个出现在它的位置。',
    portrait: publicAssetUrl('enemy-pager-phantom.png'), color: '#FF4757',
    skills: ['git merge', 'git rebase'], chapter: '第16章：Git时间线',
  },
  {
    id: 'e005', name: '后台作业幽灵',
    description: '在黑暗中消耗资源的静默进程。你永远看不到它们的到来。',
    portrait: publicAssetUrl('enemy-doctor-777.png'), color: '#2A9D8F',
    skills: ['bg', 'fg', 'jobs'], chapter: '第09章：进程与资源',
  },
  {
    id: 'e006', name: '猫队长',
    description: '在文件系统中散布随机名称的文件。混乱的猫科动物形态。',
    portrait: publicAssetUrl('enemy-doctor-777.png'), color: '#FFD166',
    skills: ['cat', 'find'], chapter: '第05章：文本智能',
  },
  {
    id: 'e007', name: '符号链接幽灵',
    description: '创建通向虚无的幻影符号链接——或者通向灾难。',
    portrait: publicAssetUrl('enemy-pager-phantom.png'), color: '#00E5FF',
    skills: ['ln', 'find'], chapter: '第03章：文件操控',
  },
  {
    id: 'e008', name: '磁盘九头蛇',
    description: '九个吞噬磁盘空间的头。砍掉一个，两个重新长出来。',
    portrait: publicAssetUrl('enemy-vim-trap.png'), color: '#4488FF',
    skills: ['df', 'du'], chapter: '第10章：存储与文件系统',
  },
  {
    id: 'e009', name: '端口模仿者',
    description: '隐藏在随机非标准端口上。移动、闪避、让你的连接超时。',
    portrait: publicAssetUrl('enemy-doctor-777.png'), color: '#00FF88',
    skills: ['netstat', 'curl'], chapter: '第12章：网络诊断',
  },
];

export const skillTreeNodes: SkillTreeNode[] = chapters.flatMap((ch) =>
  ch.drills.map((drill) => ({
    id: drill.id,
    label: drill.title,
    chapter: ch.id,
    status: drill.status as 'locked' | 'available' | 'completed',
    domain: ch.domain,
    domainColor: ch.domainColor,
  }))
);

export const drillTypeConfig: Record<string, { label: string; icon: string; color: string }> = {
  command: { label: '命令', icon: 'Target', color: '#00FF88' },
  shortcut: { label: '快捷键', icon: 'Keyboard', color: '#00E5FF' },
  escape: { label: '逃脱', icon: 'DoorOpen', color: '#FFD166' },
  pipe: { label: '管道', icon: 'GitBranch', color: '#00E5FF' },
  git: { label: 'Git', icon: 'GitBranch', color: '#FF6B35' },
  tmux: { label: 'tmux', icon: 'LayoutGrid', color: '#C77DFF' },
  operation: { label: '行动', icon: 'Shield', color: '#00E5FF' },
  boss: { label: '首领', icon: 'Skull', color: '#C77DFF' },
  nightmare: { label: '噩梦', icon: 'Flame', color: '#FF4757' },
  combo: { label: '组合', icon: 'Zap', color: '#FFD166' },
};

export const chapterAbbreviations: Record<number, string> = {
  1: '手册',
  2: '导航',
  3: '文件',
  4: '权限',
  5: '文本',
  6: 'Bash',
  7: '管道',
  8: '快捷键',
  9: '进程',
  10: '存储',
  11: '归档',
  12: '网络',
  13: '服务',
  14: '包',
  15: '编辑器',
  16: 'Git',
  17: '复用',
};
