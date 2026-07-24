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
    unlocked: true,
    unlockedAt: '2024-01-15',
    category: 'Terminal Survival',
  },
  {
    id: 'pager-whisperer',
    title: 'Pager Whisperer',
    description: 'Master less — navigate, search, and filter within pagers',
    tier: 'silver',
    icon: 'BookOpen',
    unlocked: true,
    unlockedAt: '2024-01-20',
    category: 'Terminal Survival',
  },
  {
    id: 'vim-survivor',
    title: 'Vim Survivor',
    description: 'Survive the Vim Temple — complete all Vim escape challenges',
    tier: 'gold',
    icon: 'Sword',
    unlocked: true,
    unlockedAt: '2024-02-01',
    category: 'Vim Warrior',
  },
  {
    id: 'git-surgeon',
    title: 'Git Surgeon',
    description: 'Perform 50 successful git operations without errors',
    tier: 'gold',
    icon: 'GitBranch',
    unlocked: true,
    unlockedAt: '2024-02-10',
    category: 'Git Mastery',
  },
  {
    id: 'pane-dancer',
    title: 'Pane Dancer',
    description: 'Create and manage 20 tmux sessions with multiple panes',
    tier: 'silver',
    icon: 'LayoutGrid',
    unlocked: true,
    unlockedAt: '2024-02-15',
    category: 'Terminal Survival',
  },
  {
    id: 'pipe-alchemist',
    title: 'Pipe Alchemist',
    description: 'Chain 5+ commands in a single pipeline successfully',
    tier: 'silver',
    icon: 'Merge',
    unlocked: true,
    unlockedAt: '2024-01-25',
    category: 'Process Control',
  },
  {
    id: 'permission-minimalist',
    title: 'Permission Minimalist',
    description: 'Fix 10 permission issues using least-privilege principle',
    tier: 'bronze',
    icon: 'ShieldCheck',
    unlocked: true,
    unlockedAt: '2024-01-18',
    category: 'Process Control',
  },
  {
    id: 'log-hunter',
    title: 'Log Hunter',
    description: 'Extract critical intel from system logs under time pressure',
    tier: 'silver',
    icon: 'Search',
    unlocked: true,
    unlockedAt: '2024-02-05',
    category: 'Process Control',
  },
  {
    id: 'port-detective',
    title: 'Port Detective',
    description: 'Identify and resolve 5 network port conflicts',
    tier: 'silver',
    icon: 'Network',
    unlocked: true,
    unlockedAt: '2024-02-12',
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
    unlocked: true,
    unlockedAt: '2024-02-20',
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
    unlocked: true,
    unlockedAt: '2024-02-22',
    category: 'Explorer',
  },
  {
    id: 'week-warrior',
    title: 'Week Warrior',
    description: 'Maintain a 7-day training streak',
    tier: 'silver',
    icon: 'Flame',
    unlocked: true,
    unlockedAt: '2024-02-18',
    category: 'Speed Runners',
  },
  {
    id: 'command-encyclopedia',
    title: 'Command Encyclopedia',
    description: 'Learn 50+ commands in the Command Atlas',
    tier: 'gold',
    icon: 'BookMarked',
    unlocked: true,
    unlockedAt: '2024-03-01',
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
    unlocked: true,
    unlockedAt: '2024-03-05',
    category: 'Explorer',
  },
  {
    id: 'cleanup-crew',
    title: 'Cleanup Crew',
    description: 'Free up 10GB of disk space using terminal commands',
    tier: 'silver',
    icon: 'Trash2',
    unlocked: true,
    unlockedAt: '2024-03-10',
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

export function getUnlockedCount(): number {
  return achievements.filter((a) => a.unlocked).length;
}
