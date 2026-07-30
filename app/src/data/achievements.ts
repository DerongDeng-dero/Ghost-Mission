export interface Achievement {
  id: string;
  title: string;
  description: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  icon: string; // lucide icon name
  unlocked: boolean;
  unlockedAt?: string;
  category: string;
}

export const achievements: Achievement[] = [
  {
    id: 'escape-artist',
    title: 'Escape Artist',
    description: 'Exit 10 terminal traps using proper escape sequences',
    tier: 'bronze',
    icon: 'KeyRound',
    unlocked: false,
    category: 'Terminal Survival',
  },
  {
    id: 'pager-whisperer',
    title: 'Pager Whisperer',
    description: 'Master less — navigate, search, and filter within pagers',
    tier: 'silver',
    icon: 'BookOpen',
    unlocked: false,
    category: 'Terminal Survival',
  },
  {
    id: 'vim-survivor',
    title: 'Vim Survivor',
    description: 'Survive the Vim Temple — complete all Vim escape challenges',
    tier: 'gold',
    icon: 'Sword',
    unlocked: false,
    category: 'Vim Warrior',
  },
  {
    id: 'git-surgeon',
    title: 'Git Surgeon',
    description: 'Perform 50 successful git operations without errors',
    tier: 'gold',
    icon: 'GitBranch',
    unlocked: false,
    category: 'Git Mastery',
  },
  {
    id: 'pane-dancer',
    title: 'Pane Dancer',
    description: 'Create and manage 20 tmux sessions with multiple panes',
    tier: 'silver',
    icon: 'LayoutGrid',
    unlocked: false,
    category: 'Terminal Survival',
  },
  {
    id: 'pipe-alchemist',
    title: 'Pipe Alchemist',
    description: 'Chain 5+ commands in a single pipeline successfully',
    tier: 'silver',
    icon: 'Merge',
    unlocked: false,
    category: 'Process Control',
  },
  {
    id: 'permission-minimalist',
    title: 'Permission Minimalist',
    description: 'Fix 10 permission issues using least-privilege principle',
    tier: 'bronze',
    icon: 'ShieldCheck',
    unlocked: false,
    category: 'Process Control',
  },
  {
    id: 'log-hunter',
    title: 'Log Hunter',
    description: 'Extract critical intel from system logs under time pressure',
    tier: 'silver',
    icon: 'Search',
    unlocked: false,
    category: 'Process Control',
  },
  {
    id: 'port-detective',
    title: 'Port Detective',
    description: 'Identify and resolve 5 network port conflicts',
    tier: 'silver',
    icon: 'Network',
    unlocked: false,
    category: 'Process Control',
  },
  {
    id: 'red-zone-defuser',
    title: 'Red Zone Defuser',
    description: 'Safely neutralize 3 high-risk destructive commands',
    tier: 'platinum',
    icon: 'Bomb',
    unlocked: false,
    category: 'Perfectionist',
  },
  {
    id: 'speed-runner',
    title: 'Speed Runner',
    description: 'Complete a mission in under 30 seconds',
    tier: 'gold',
    icon: 'Zap',
    unlocked: false,
    category: 'Speed Runners',
  },
  {
    id: 'perfect-score',
    title: 'Ghost Protocol',
    description: 'Achieve 100% score on any mission',
    tier: 'platinum',
    icon: 'Target',
    unlocked: false,
    category: 'Perfectionist',
  },
  {
    id: 'explorer',
    title: 'Deep Explorer',
    description: 'Unlock commands in 10 different domains',
    tier: 'bronze',
    icon: 'Compass',
    unlocked: false,
    category: 'Explorer',
  },
  {
    id: 'week-warrior',
    title: 'Week Warrior',
    description: 'Maintain a 7-day training streak',
    tier: 'silver',
    icon: 'Flame',
    unlocked: false,
    category: 'Speed Runners',
  },
  {
    id: 'command-encyclopedia',
    title: 'Command Encyclopedia',
    description: 'Validate 50 distinct command patterns by completing missions',
    tier: 'gold',
    icon: 'BookMarked',
    unlocked: false,
    category: 'Explorer',
  },
  {
    id: 'docker-captain',
    title: 'Docker Captain',
    description: 'Deploy and manage 10 containers successfully',
    tier: 'silver',
    icon: 'Container',
    unlocked: false,
    category: 'Explorer',
  },
  {
    id: 'database-admin',
    title: 'Database Admin',
    description: 'Execute 20 safe database queries',
    tier: 'bronze',
    icon: 'Database',
    unlocked: false,
    category: 'Explorer',
  },
  {
    id: 'shell-master',
    title: 'Shell Master',
    description: 'Write 5 efficient bash scripts',
    tier: 'gold',
    icon: 'Terminal',
    unlocked: false,
    category: 'Terminal Survival',
  },
  {
    id: 'night-owl',
    title: 'Night Owl',
    description: 'Complete missions after midnight local time',
    tier: 'bronze',
    icon: 'Moon',
    unlocked: false,
    category: 'Explorer',
  },
  {
    id: 'cleanup-crew',
    title: 'Cleanup Crew',
    description: 'Free up 10GB of disk space using terminal commands',
    tier: 'silver',
    icon: 'Trash2',
    unlocked: false,
    category: 'Process Control',
  },
];

export const tierColors: Record<string, string> = {
  bronze: '#CD7F32',
  silver: '#C0C0C0',
  gold: '#FFD700',
  platinum: '#00E5FF',
};

export const tierOrder = ['bronze', 'silver', 'gold', 'platinum'] as const;

export const achievementCategories = [
  'All',
  'Terminal Survival',
  'Git Mastery',
  'Vim Warrior',
  'Process Control',
  'Speed Runners',
  'Perfectionist',
  'Explorer',
];

export function getTierCount(tier: string): number {
  return achievements.filter((a) => a.tier === tier).length;
}

export interface AchievementEvidence {
  hasPerfectScore: boolean;
  currentStreak: number;
  longestStreak: number;
  validatedActions: number;
}

const EVIDENCE_BACKED_ACHIEVEMENT_IDS = new Set([
  'perfect-score',
  'week-warrior',
  'command-encyclopedia',
]);

export function resolveAchievements(evidence: AchievementEvidence): Achievement[] {
  const unlockedIds = new Set<string>();
  if (evidence.hasPerfectScore) unlockedIds.add('perfect-score');
  if (evidence.longestStreak >= 7) unlockedIds.add('week-warrior');
  if (evidence.validatedActions >= 50) unlockedIds.add('command-encyclopedia');

  return achievements
    .filter((achievement) => EVIDENCE_BACKED_ACHIEVEMENT_IDS.has(achievement.id))
    .map((achievement) => ({
      ...achievement,
      unlocked: unlockedIds.has(achievement.id),
    }));
}

export function getUnlockedCount(items: Achievement[] = achievements): number {
  return items.filter((achievement) => achievement.unlocked).length;
}

export const MISSION_COMPLETION_XP = 120;
export const ACHIEVEMENT_XP = 100;

export function calculateTotalXP(missionsCompleted: number, items: Achievement[]): number {
  return Math.max(0, Math.trunc(missionsCompleted)) * MISSION_COMPLETION_XP
    + getUnlockedCount(items) * ACHIEVEMENT_XP;
}

export type ProgressRank = 'recruit' | 'operator' | 'ghost';

export function deriveProgressRank(totalXP: number): ProgressRank {
  if (totalXP >= 20_000) return 'ghost';
  if (totalXP >= 10_000) return 'operator';
  return 'recruit';
}
