import { ALL_LEVELS } from '@/engine/levels';
import type { MissionLevel } from '@/engine/levels';

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

function getGlobalLevelIndex(level: MissionLevel): number {
  return ALL_LEVELS.findIndex((l) => l.id === level.id);
}

export function deriveDrillFromLevel(level: MissionLevel, numberInChapter: number, isZh: boolean = true): TrainingDrill {
  const globalIndex = getGlobalLevelIndex(level);

  let status: TrainingDrill['status'];
  if (globalIndex < 50) {
    status = 'available';
  } else {
    status = 'locked';
  }

  const score = undefined;

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
    score,
  };
}

/* ──────────────────────────────────────────────
   Static chapter metadata (preserved from original)
   ────────────────────────────────────────────── */

interface ChapterMeta {
  id: number;
  number: string;
  title: string;
  subtitle: string;
  description: string;
  domain: string;
  domainColor: string;
  chapterId: string; // matches level.chapter_id from JSON
}

export const chapterMetaList: ChapterMeta[] = [
  {
    id: 1, number: 'Ch01', title: '系统启动', subtitle: '帮助与基础',
    description: '你的旅程从这里开始。学会寻求帮助、在终端中导航，理解命令行的基础概念。',
    domain: 'Shell', domainColor: '#E8EDF2', chapterId: 'ch01',
  },
  {
    id: 2, number: 'Ch02', title: '文件系统基础', subtitle: 'ls, cd, pwd',
    description: '文件系统是你的战场。学会查看、移动和理解目录结构。',
    domain: 'Filesystem', domainColor: '#00FF88', chapterId: 'ch02',
  },
  {
    id: 3, number: 'Ch03', title: '文件操作', subtitle: 'cat, cp, mv, rm',
    description: '创建、复制、移动和删除文件。能力越大，责任越大。',
    domain: 'Filesystem', domainColor: '#00FF88', chapterId: 'ch03',
  },
  {
    id: 4, number: 'Ch04', title: '分页器', subtitle: 'less, more, head, tail',
    description: '不是所有文件都能一次性读完。学会翻页浏览内容，查看开头和结尾，永远不要被困住。',
    domain: 'Text Processing', domainColor: '#00E5FF', chapterId: 'ch04',
  },
  {
    id: 5, number: 'Ch05', title: 'Vim神庙', subtitle: '编辑与生存',
    description: '终端世界最令人畏惧的编辑器。进入神庙，学会各种模式，带着理智逃出来。',
    domain: 'Vim', domainColor: '#C77DFF', chapterId: 'ch05',
  },
  {
    id: 6, number: 'Ch06', title: 'Git迷宫', subtitle: '版本控制',
    description: 'Git是一个由分支、提交和合并组成的迷宫。在不丢失代码的情况下穿越迷宫。',
    domain: 'Git', domainColor: '#FF6B35', chapterId: 'ch06',
  },
  {
    id: 7, number: 'Ch07', title: '进程追踪', subtitle: 'ps, top, kill',
    description: '每个进程都会留下痕迹。学会追踪它们、监控它们，必要时终止它们。',
    domain: 'Process', domainColor: '#FFD166', chapterId: 'ch07',
  },
  {
    id: 8, number: 'Ch08', title: '暗影网络', subtitle: 'ping, curl, ssh',
    description: '网络是一片黑暗的森林。学会探测它、连接它，在其中无声无息地穿行。',
    domain: 'Network', domainColor: '#00E5FF', chapterId: 'ch08',
  },
  {
    id: 9, number: 'Ch09', title: 'Docker港湾', subtitle: '容器',
    description: '容器是部署的未来。学会构建、运行和管理它们。',
    domain: 'Docker', domainColor: '#2496ED', chapterId: 'ch09',
  },
  {
    id: 10, number: 'Ch10', title: 'Shell精通', subtitle: '脚本与变量',
    description: 'Shell不仅仅是一个命令解释器，它是一门编程语言。掌握变量、循环和条件语句。',
    domain: 'Shell', domainColor: '#E8EDF2', chapterId: 'ch10',
  },
  {
    id: 11, number: 'Ch11', title: '监控器', subtitle: 'df, du, free',
    description: '系统资源是有限的。监控磁盘使用、内存，了解系统何时处于压力之下。',
    domain: 'Process', domainColor: '#FFD166', chapterId: 'ch11',
  },
  {
    id: 12, number: 'Ch12', title: '红区', subtitle: '高级操作',
    description: '危险地带。高级文件操作、权限管理和系统级命令。',
    domain: 'Security', domainColor: '#FF4757', chapterId: 'ch12',
  },
  {
    id: 13, number: 'Ch13', title: '777博士', subtitle: '权限噩梦',
    description: '777博士是最危险的敌人。他们把所有权限设为777。学会反击并恢复安全。',
    domain: 'Security', domainColor: '#FF4757', chapterId: 'ch13',
  },
  {
    id: 14, number: 'Ch14', title: '逃脱', subtitle: '逃离被困程序',
    description: '每个操作员有时都会被困住。学会每个程序的通用退出序列。',
    domain: 'Shell', domainColor: '#E8EDF2', chapterId: 'ch14',
  },
  {
    id: 15, number: 'Ch15', title: '幽灵协议', subtitle: '高级组合',
    description: '将所有技能组合成复杂操作。幽灵操作员的真正考验是无缝地组合工具。',
    domain: 'Shell', domainColor: '#E8EDF2', chapterId: 'ch15',
  },
  {
    id: 16, number: 'Ch16', title: '终极终端', subtitle: '最终考验',
    description: '你所学到的一切。每项技能、每次演练、每个敌人——准备最终考试。',
    domain: 'Shell', domainColor: '#E8EDF2', chapterId: 'ch16',
  },
  {
    id: 17, number: 'Ch17', title: '多路复用器', subtitle: 'tmux精通',
    description: '分割你的终端，管理会话，成为真正的多任务操作员。',
    domain: 'tmux', domainColor: '#2A9D8F', chapterId: 'ch17',
  },
];

/* ──────────────────────────────────────────────
   Build chapters with dynamically-generated drills
   ────────────────────────────────────────────── */

function buildChapters(): Chapter[] {
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
    const drills = levels.map((level, idx) =>
      deriveDrillFromLevel(level, idx + 1)
    );
    const completedDrills = drills.filter((d) => d.status === 'completed').length;

    return {
      id: meta.id,
      number: meta.number,
      title: meta.title,
      subtitle: meta.subtitle,
      description: meta.description,
      domain: meta.domain,
      domainColor: meta.domainColor,
      drills,
      totalDrills: drills.length,
      completedDrills,
    };
  });
}

export const chapters: Chapter[] = buildChapters();

export const enemies: Enemy[] = [
  {
    id: 'e001', name: '分页幽灵',
    description: '将操作员困在滚动的文本页面中。一旦进入，很少有人记得按q键。',
    portrait: '/enemy-pager-phantom.png', color: '#00E5FF',
    skills: ['less', 'more', 'man'], chapter: '第04章：分页器',
  },
  {
    id: 'e002', name: 'Vim陷阱僧侣',
    description: '一个沉默的守护者，将你锁定在各种模式中。许多人在尝试退出时倒下了。',
    portrait: '/enemy-vim-trap.png', color: '#C77DFF',
    skills: ['vim', 'nano'], chapter: '第05章：Vim神庙',
  },
  {
    id: 'e003', name: '重置恶魔',
    description: '以丢失的提交和强制推送为食。它把你的Git历史变成一片荒地。',
    portrait: '/enemy-doctor-777.png', color: '#FF6B35',
    skills: ['git reset', 'git push --force'], chapter: '第06章：Git迷宫',
  },
  {
    id: 'e004', name: '合并冲突九头蛇',
    description: '每当你解决一个冲突，就会有另外两个出现在它的位置。',
    portrait: '/enemy-pager-phantom.png', color: '#FF4757',
    skills: ['git merge', 'git rebase'], chapter: '第06章：Git迷宫',
  },
  {
    id: 'e005', name: '后台作业幽灵',
    description: '在黑暗中消耗资源的静默进程。你永远看不到它们的到来。',
    portrait: '/enemy-doctor-777.png', color: '#2A9D8F',
    skills: ['bg', 'fg', 'jobs'], chapter: '第15章：幽灵协议',
  },
  {
    id: 'e006', name: '猫队长',
    description: '在文件系统中散布随机名称的文件。混乱的猫科动物形态。',
    portrait: '/enemy-doctor-777.png', color: '#FFD166',
    skills: ['cat', 'find'], chapter: '第10章：Shell精通',
  },
  {
    id: 'e007', name: '符号链接幽灵',
    description: '创建通向虚无的幻影符号链接——或者通向灾难。',
    portrait: '/enemy-pager-phantom.png', color: '#00E5FF',
    skills: ['ln', 'find'], chapter: '第15章：幽灵协议',
  },
  {
    id: 'e008', name: '磁盘九头蛇',
    description: '九个吞噬磁盘空间的头。砍掉一个，两个重新长出来。',
    portrait: '/enemy-vim-trap.png', color: '#4488FF',
    skills: ['df', 'du'], chapter: '第11章：监控器',
  },
  {
    id: 'e009', name: '端口模仿者',
    description: '隐藏在随机非标准端口上。移动、闪避、让你的连接超时。',
    portrait: '/enemy-doctor-777.png', color: '#00FF88',
    skills: ['netstat', 'curl'], chapter: '第12章：红区',
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
  1: '帮助',
  2: '文件',
  3: '操作',
  4: '分页',
  5: 'Vim',
  6: 'Git',
  7: '进程',
  8: '网络',
  9: 'Docker',
  10: 'Shell',
  11: '监控',
  12: '红区',
  13: '博士',
  14: '逃脱',
  15: '协议',
  16: '终极',
  17: '复用',
};
