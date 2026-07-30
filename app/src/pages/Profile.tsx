import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  TreePine,
  Trophy,
  Clock,
  Zap,
  Target,
  BookOpen,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '@/store/gameStore';
import SkillRadar from '@/components/profile/SkillRadar';
import AchievementGrid from '@/components/profile/AchievementGrid';
import StatsPanel from '@/components/profile/StatsPanel';
import ActivityHeatmap from '@/components/profile/ActivityHeatmap';
import SkillTreeMini from '@/components/profile/SkillTreeMini';
import {
  calculateTotalXP,
  deriveProgressRank,
  getUnlockedCount,
  resolveAchievements,
  tierColors,
} from '@/data/achievements';
import { publicAssetUrl } from '@/lib/publicAsset';
import {
  PROGRESS_CATALOG,
  buildProgressChapters,
  buildProgressMissions,
} from '@/data/progressCatalog';
import {
  deriveMissionActivity,
  deriveProgressMetrics,
  deriveSkillGroups,
} from '@/lib/progressMetrics';
import { useCurrentLocalDay } from '@/hooks/useCurrentLocalDay';

const rankLabels: Record<string, { titleKey: string; color: string }> = {
  recruit: { titleKey: 'profile.rank.recruit', color: '#CD7F32' },
  operator: { titleKey: 'profile.rank.operator', color: '#C0C0C0' },
  ghost: { titleKey: 'profile.rank.ghost', color: '#00FF88' },
};

function ProfileSkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto px-space-4 py-space-8 space-y-8">
      <div className="animate-pulse rounded-radius-md h-40" style={{ backgroundColor: '#0F1419', border: '1px solid #1E2D3D' }} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="animate-pulse rounded-radius-md h-48" style={{ backgroundColor: '#0F1419', border: '1px solid #1E2D3D' }} />
        ))}
      </div>
    </div>
  )
}

export default function Profile() {
  const { t, i18n } = useTranslation()
  const [activeTab, setActiveTab] = useState('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [historyVisibleCount, setHistoryVisibleCount] = useState(50);
  const callsign = useGameStore((state) => state.callsign);
  const missionProgress = useGameStore((state) => state.missionProgress);
  const progressMilestones = useGameStore((state) => state.progressMilestones);
  const currentLocalDay = useCurrentLocalDay();
  const progressLanguage = i18n.resolvedLanguage ?? i18n.language;
  const missions = useMemo(
    () => buildProgressMissions(progressLanguage, missionProgress),
    [missionProgress, progressLanguage],
  );
  const chapters = useMemo(
    () => buildProgressChapters(progressLanguage, missionProgress),
    [missionProgress, progressLanguage],
  );

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 150)
    return () => clearTimeout(timer)
  }, [])

  const progressMetrics = useMemo(
    () => deriveProgressMetrics(
      PROGRESS_CATALOG,
      missionProgress,
      `${currentLocalDay}T12:00:00`,
      progressMilestones,
    ),
    [currentLocalDay, missionProgress, progressMilestones],
  );
  const skills = useMemo(() => deriveSkillGroups(chapters).map((skill) => ({
    ...skill,
    name: t(`skills.${skill.domain}`),
  })), [chapters, t]);
  const resolvedAchievements = useMemo(
    () => resolveAchievements(progressMetrics),
    [progressMetrics],
  );
  const unlockedCount = getUnlockedCount(resolvedAchievements);
  const totalAchievements = resolvedAchievements.length;
  const totalXP = calculateTotalXP(progressMetrics.missionsCompleted, resolvedAchievements);
  const level = Math.floor(totalXP / 1000) + 1;
  const currentLevelXP = totalXP % 1000;
  const xpToNextLevel = 1000;
  const rank = deriveProgressRank(totalXP);
  const rankInfo = rankLabels[rank];
  const dateTimeFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language],
  );
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }),
    [i18n.language],
  );
  const operativeSinceLabel = progressMetrics.firstStartedAt
    ? t('profile.operativeSince', { date: dateFormatter.format(new Date(progressMetrics.firstStartedAt)) })
    : t('profile.notStarted');
  const completedMissions = useMemo(() => missions.flatMap((mission) => {
    const progress = missionProgress[mission.id];
    return progress?.status === 'completed' ? [{ mission, progress }] : [];
  }).sort((left, right) => Date.parse(right.progress.completedAt) - Date.parse(left.progress.completedAt)), [missionProgress, missions]);
  const activities = useMemo(() => missions.flatMap((mission) => {
    const progress = missionProgress[mission.id];
    if (!progress) return [];
    if (progress.status === 'completed') {
      return progress.completionHistory.map((attempt, index) => ({
        id: `${mission.id}-${attempt.completedAt}-${index}`,
        description: t('profile.activity.completed', { title: mission.title, score: attempt.score }),
        type: 'complete',
        timestamp: dateTimeFormatter.format(new Date(attempt.completedAt)),
        sortTime: Date.parse(attempt.completedAt),
      }));
    }
    return [{
      id: mission.id,
      description: t('profile.activity.started', { title: mission.title }),
      type: 'in-progress',
      timestamp: dateTimeFormatter.format(new Date(progress.startedAt)),
      sortTime: Date.parse(progress.startedAt),
    }];
  }).sort((left, right) => right.sortTime - left.sortTime), [dateTimeFormatter, missionProgress, missions, t]);
  const completionLog = useMemo(() => completedMissions.flatMap(({ mission, progress }) => {
    const firstStoredAttemptNumber = progress.completedAttempts - progress.completionHistory.length + 1;
    return progress.completionHistory.map((attempt, index) => ({
      mission,
      attempt,
      attemptNumber: firstStoredAttemptNumber + index,
    }));
  }).sort((left, right) => Date.parse(right.attempt.completedAt) - Date.parse(left.attempt.completedAt)), [completedMissions]);
  const activityData = useMemo(
    () => deriveMissionActivity(PROGRESS_CATALOG, missionProgress, `${currentLocalDay}T12:00:00`),
    [currentLocalDay, missionProgress],
  );
  const hasTruncatedCompletionHistory = useMemo(
    () => missions.some((mission) => {
      const progress = missionProgress[mission.id];
      return progress?.status === 'completed'
        && progress.completedAttempts > progress.completionHistory.length;
    }),
    [missionProgress, missions],
  );
  const topSkills = useMemo(
    () => progressMetrics.missionsCompleted === 0
      ? []
      : [...skills].filter((skill) => skill.score > 0).sort((a, b) => b.score - a.score).slice(0, 3),
    [progressMetrics.missionsCompleted, skills],
  );
  const focusSkills = useMemo(
    () => [...skills].filter((skill) => skill.score < 100).sort((a, b) => a.score - b.score).slice(0, 3),
    [skills],
  );
  const missionModePresentation = (mode: string) => {
    if (mode === 'operation') return { label: t('academy.operations'), color: '#FF6B35' };
    if (mode === 'nightmare') return { label: t('academy.nightmareMode'), color: '#C77DFF' };
    if (mode === 'red-zone') return { label: t('academy.bossBattles'), color: '#FF4757' };
    return { label: t('academy.trainingDrills'), color: '#00E5FF' };
  };

  const tabs = [
    { id: 'overview', label: t('profile.tabs.overview'), icon: BarChart3 },
    { id: 'skills', label: t('profile.tabs.skills'), icon: TreePine },
    { id: 'achievements', label: t('profile.tabs.achievements'), icon: Trophy },
    { id: 'history', label: t('profile.tabs.history'), icon: Clock },
  ];

  return (
    <div className="min-h-[100dvh]" style={{ backgroundColor: '#0A0E14' }}>
      {/* Profile Header */}
      <div
        className="w-full px-space-4 py-8"
        style={{ backgroundColor: '#0F1419' }}
      >
        <div className="max-w-[1200px] mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            {/* Avatar */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
              className="relative flex-shrink-0"
            >
              <div
                className="w-24 h-24 rounded-full overflow-hidden"
                style={{
                  border: `3px solid ${rankInfo.color}`,
                  backgroundColor: '#0A0E14',
                  boxShadow: `0 0 20px ${rankInfo.color}30`,
                }}
              >
                <img
                  src={publicAssetUrl('avatar-default.png')}
                  alt={t('profile.avatarAlt', { callsign })}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              </div>
              {/* Rank badge overlay */}
              <div
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center font-jetbrains text-[9px] font-bold"
                style={{
                  backgroundColor: rankInfo.color,
                  color: '#0A0E14',
                  border: '2px solid #0F1419',
                }}
              >
                {rank === 'recruit' ? 'R' : rank === 'operator' ? 'O' : 'G'}
              </div>
            </motion.div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
              >
                <h1 className="max-w-full break-words font-jetbrains text-h1 text-[#E8EDF2]">
                  {callsign}
                </h1>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span
                    className="font-jetbrains text-badge uppercase px-2.5 py-1 rounded-full"
                    style={{
                      color: rankInfo.color,
                      backgroundColor: `${rankInfo.color}15`,
                      border: `1px solid ${rankInfo.color}40`,
                    }}
                  >
                    {t(rankInfo.titleKey)}
                  </span>
                  <span className="font-jetbrains text-body-sm text-[#788DA1]">
                    {operativeSinceLabel}
                  </span>
                </div>
              </motion.div>

              {/* XP + Stats */}
              <div className="mt-4">
                <StatsPanel
                  missionsCompleted={progressMetrics.missionsCompleted}
                  commandsLearned={progressMetrics.validatedActions}
                  currentStreak={progressMetrics.currentStreak}
                  currentLevelXP={currentLevelXP}
                  level={level}
                  xpToNextLevel={xpToNextLevel}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div
        className="sticky top-[52px] z-elevated w-full overflow-x-auto overscroll-x-contain border-b"
        style={{
          backgroundColor: '#0A0E14',
          borderColor: '#1E2D3D',
        }}
      >
        <div className="mx-auto flex w-max min-w-full max-w-[1200px] items-center px-space-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-pressed={isActive}
                className="relative flex min-h-11 shrink-0 items-center gap-2 px-4 py-3 font-jetbrains text-nav uppercase transition-colors duration-fast sm:px-6"
                style={{
                  color: isActive ? '#00E5FF' : '#8B9EB0',
                }}
              >
                <Icon size={16} />
                {tab.label}
                {isActive && (
                  <motion.div
                    layoutId="activeProfileTab"
                    className="absolute bottom-0 left-3 right-3 h-[2px] bg-[#00E5FF]"
                    style={{ borderRadius: '1px' }}
                    transition={{ duration: 0.2 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      {isLoading ? (
        <ProfileSkeleton />
      ) : (
      <div className="max-w-[1200px] mx-auto px-space-4 py-space-8">
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="space-y-8"
            >
              {/* Skill Radar */}
              <section>
                <h2 className="font-jetbrains text-h3 text-[#E8EDF2] mb-4 flex items-center gap-2">
                  <Target size={20} className="text-[#00FF88]" />
                  {t('profile.skillRadar')}
                </h2>
                <div className="flex justify-center">
                  <SkillRadar skills={skills.map((s) => ({ name: s.name, score: s.score }))} size={480} />
                </div>
              </section>

              {/* Strengths & Weaknesses */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Strengths */}
                <div
                  className="p-5 rounded-radius-md"
                  style={{
                    backgroundColor: '#0F1419',
                    border: '1px solid #1E2D3D',
                    borderLeft: '3px solid #00FF88',
                  }}
                >
                  <h3 className="font-jetbrains text-h4 text-[#00FF88] mb-3 flex items-center gap-2">
                    <Zap size={16} />
                    {t('profile.topSkills')}
                  </h3>
                  <div className="space-y-3">
                    {topSkills.length === 0 ? (
                      <p className="font-inter text-body text-[#8B9EB0]">{t('profile.noSkillData')}</p>
                    ) : topSkills.map((skill) => (
                        <div key={skill.name} className="flex items-center gap-3">
                          <span className="font-jetbrains text-body text-[#E8EDF2] w-28 flex-shrink-0">
                            {skill.name}
                          </span>
                          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#1A2332' }}>
                            <motion.div
                              className="h-full rounded-full"
                              style={{ backgroundColor: '#00FF88' }}
                              initial={{ width: 0 }}
                              animate={{ width: `${skill.score}%` }}
                              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
                            />
                          </div>
                          <span className="font-jetbrains text-body-sm text-[#00FF88] w-10 text-right">
                            {skill.score}%
                          </span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Weaknesses */}
                <div
                  className="p-5 rounded-radius-md"
                  style={{
                    backgroundColor: '#0F1419',
                    border: '1px solid #1E2D3D',
                    borderLeft: '3px solid #FFD166',
                  }}
                >
                  <h3 className="font-jetbrains text-h4 text-[#FFD166] mb-3 flex items-center gap-2">
                    <Target size={16} />
                    {t('profile.focusAreas')}
                  </h3>
                  <div className="space-y-3">
                    {focusSkills.length === 0 ? (
                      <p className="font-inter text-body text-[#8B9EB0]">{t('profile.allSkillsMastered')}</p>
                    ) : focusSkills.map((skill) => (
                        <div key={skill.name} className="flex items-center gap-3">
                          <span className="font-jetbrains text-body text-[#E8EDF2] w-28 flex-shrink-0">
                            {skill.name}
                          </span>
                          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#1A2332' }}>
                            <motion.div
                              className="h-full rounded-full"
                              style={{ backgroundColor: '#FFD166' }}
                              initial={{ width: 0 }}
                              animate={{ width: `${skill.score}%` }}
                              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
                            />
                          </div>
                          <span className="font-jetbrains text-body-sm text-[#FFD166] w-10 text-right">
                            {skill.score}%
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* Recent Activity Timeline */}
              <section>
                <h2 className="font-jetbrains text-h3 text-[#E8EDF2] mb-4 flex items-center gap-2">
                  <Clock size={20} className="text-[#00E5FF]" />
                  {t('profile.tabs.history')}
                </h2>
                <div
                  className="p-5 rounded-radius-md"
                  style={{
                    backgroundColor: '#0F1419',
                    border: '1px solid #1E2D3D',
                  }}
                >
                  {activities.length === 0 ? (
                    <p className="font-inter text-body text-[#8B9EB0]">
                      {t('profile.activity.empty')}
                    </p>
                  ) : (
                  <div className="relative pl-6">
                    {/* Timeline line */}
                    <div
                      className="absolute left-[5px] top-2 bottom-2 w-[2px]"
                      style={{ backgroundColor: '#1E2D3D' }}
                    />
                    {activities.slice(0, 8).map((activity, i) => {
                      const colorMap: Record<string, string> = {
                        complete: '#00FF88',
                        failed: '#FF4757',
                        achievement: '#FFD166',
                        'in-progress': '#00E5FF',
                        learning: '#C77DFF',
                      };
                      const color = colorMap[activity.type] || '#8B9EB0';
                      return (
                        <motion.div
                          key={activity.id}
                          initial={{ opacity: 0, x: 16 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.1, duration: 0.3 }}
                          className="relative mb-4 last:mb-0"
                        >
                          {/* Node */}
                          <div
                            className="absolute -left-6 top-1 w-3 h-3 rounded-full"
                            style={{
                              backgroundColor: color,
                              boxShadow: `0 0 6px ${color}40`,
                            }}
                          />
                          <p className="font-inter text-body text-[#E8EDF2]">
                            {activity.description}
                          </p>
                          <p className="font-jetbrains text-body-sm text-[#788DA1] mt-0.5">
                            {activity.timestamp}
                          </p>
                        </motion.div>
                      );
                    })}
                  </div>
                  )}
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'skills' && (
            <motion.div
              key="skills"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
            >
              <h2 className="font-jetbrains text-h3 text-[#E8EDF2] mb-4 flex items-center gap-2">
                <TreePine size={20} className="text-[#00FF88]" />
                {t('profile.skillDepartments')}
              </h2>
              <SkillTreeMini chapters={chapters} />
            </motion.div>
          )}

          {activeTab === 'achievements' && (
            <motion.div
              key="achievements"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* Summary bar */}
              <div
                className="flex flex-wrap items-center gap-6 p-5 rounded-radius-md"
                style={{
                  backgroundColor: '#0F1419',
                  border: '1px solid #1E2D3D',
                }}
              >
                <div>
                  <span className="font-jetbrains text-h2 text-[#E8EDF2]">
                    {unlockedCount}
                  </span>
                  <span className="font-jetbrains text-body text-[#788DA1] ml-2">
                    / {totalAchievements} {t('profile.achievements.unlocked')}
                  </span>
                </div>
                <div className="w-px h-8 bg-[#1E2D3D] hidden sm:block" />
                <div className="flex items-center gap-4">
                  {(['platinum', 'gold', 'silver', 'bronze'] as const).map((tier) => {
                    const count = resolvedAchievements.filter((achievement) => achievement.tier === tier && achievement.unlocked).length;
                    return (
                      <div key={tier} className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: tierColors[tier] }}
                        />
                        <span className="font-jetbrains text-body-sm text-[#8B9EB0] capitalize">
                          {t(`profile.achievementTiers.${tier}`)}: {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <AchievementGrid items={resolvedAchievements} />
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="space-y-8"
            >
              {/* Activity Heatmap */}
              <section>
                <h2 className="font-jetbrains text-h3 text-[#E8EDF2] mb-4 flex items-center gap-2">
                  <BarChart3 size={20} className="text-[#00FF88]" />
                  {t('profile.commandUsageHeatmap')}
                </h2>
                <div
                  className="p-5 rounded-radius-md overflow-x-auto"
                  style={{
                    backgroundColor: '#0F1419',
                    border: '1px solid #1E2D3D',
                  }}
                >
                  <ActivityHeatmap
                    data={activityData}
                    isHistoryTruncated={hasTruncatedCompletionHistory}
                  />
                </div>
              </section>

              {/* Mission Log */}
              <section>
                <h2 className="font-jetbrains text-h3 text-[#E8EDF2] mb-4 flex items-center gap-2">
                  <BookOpen size={20} className="text-[#00E5FF]" />
                  {t('profile.missionCompletionLog')}
                </h2>
                <div
                  className="rounded-radius-md overflow-hidden"
                  style={{
                    backgroundColor: '#0F1419',
                    border: '1px solid #1E2D3D',
                  }}
                >
                  <div
                    className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
                    tabIndex={0}
                    role="region"
                    aria-label={t('profile.missionCompletionLog')}
                  >
                    <table className="w-full">
                      <thead>
                        <tr style={{ borderBottom: '1px solid #1E2D3D' }}>
                          {[
                            t('profile.tableHeaders.mission'),
                            t('profile.tableHeaders.type'),
                            t('profile.tableHeaders.score'),
                            t('profile.tableHeaders.time'),
                            t('profile.tableHeaders.date'),
                            t('profile.tableHeaders.status'),
                          ].map((h) => (
                            <th
                              key={h}
                              scope="col"
                              className="px-4 py-3 text-left font-jetbrains text-body-sm text-[#788DA1] uppercase tracking-wider"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {completionLog.slice(0, historyVisibleCount).map(({ mission, attempt, attemptNumber }, i) => {
                          const presentation = missionModePresentation(mission.mode)
                          return (
                          <motion.tr
                            key={`${mission.id}-${attempt.completedAt}-${attemptNumber}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: Math.min(i * 0.03, 0.6) }}
                            className="transition-colors hover:bg-[#1E2A3A]"
                            style={{ borderBottom: '1px solid #1E2D3D' }}
                          >
                            <td className="px-4 py-3 font-jetbrains text-body text-[#E8EDF2]">
                              {mission.title}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className="font-jetbrains text-badge uppercase px-1.5 py-0.5 rounded-sm"
                                style={{
                                  color: presentation.color,
                                  backgroundColor: `${presentation.color}1A`,
                                }}
                              >
                                {presentation.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-jetbrains text-body" style={{ color: attempt.score >= 70 ? '#00FF88' : '#FFD166' }}>
                              {attempt.score}
                            </td>
                            <td className="px-4 py-3 font-jetbrains text-body-sm text-[#8B9EB0]">
                              #{attemptNumber}
                            </td>
                            <td className="px-4 py-3 font-jetbrains text-body-sm text-[#788DA1]">
                              {dateFormatter.format(new Date(attempt.completedAt))}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className="font-jetbrains text-badge uppercase"
                                style={{ color: '#00FF88' }}
                              >
                                {`\u2713 ${t('profile.pass')}`}
                              </span>
                            </td>
                          </motion.tr>
                          )
                        })}
                        {completionLog.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center font-inter text-body text-[#8B9EB0]">
                              {t('profile.historyEmpty')}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {completionLog.length > historyVisibleCount && (
                    <div className="flex justify-center border-t border-[#1E2D3D] p-3">
                      <button
                        type="button"
                        onClick={() => setHistoryVisibleCount((count) => Math.min(count + 50, completionLog.length))}
                        className="min-h-11 rounded-radius-sm px-4 font-jetbrains text-body-sm text-[#00E5FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
                      >
                        {t('missionBoard.loadMore', { count: Math.min(50, completionLog.length - historyVisibleCount) })}
                      </button>
                    </div>
                  )}
                </div>
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      )}
    </div>
  );
}
