import { useId, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface ActivityDay {
  date: string;
  count: number;
}

function generateEmptyData(): ActivityDay[] {
  const data: ActivityDay[] = [];
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let i = 364; i >= 0; i--) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - i);
    data.push({
      date: date.toISOString().split('T')[0],
      count: 0,
    });
  }
  return data;
}

const EMPTY_ACTIVITY_DATA = generateEmptyData();

function getIntensityColor(count: number): string {
  if (count === 0) return '#1A2332';
  if (count <= 2) return 'rgba(0, 255, 136, 0.2)';
  if (count <= 4) return 'rgba(0, 255, 136, 0.4)';
  if (count <= 7) return 'rgba(0, 255, 136, 0.65)';
  return '#00FF88';
}

interface ActivityHeatmapProps {
  data?: ActivityDay[];
  isHistoryTruncated?: boolean;
}

export default function ActivityHeatmap({ data, isHistoryTruncated = false }: ActivityHeatmapProps) {
  const { t, i18n } = useTranslation();
  const historyNoteId = useId();
  const activityData = data && data.length > 0 ? data : EMPTY_ACTIVITY_DATA;
  const totalActivity = activityData.reduce((total, day) => total + Math.max(day.count, 0), 0);

  // Organize into weeks (columns) and days (rows)
  const weeks = useMemo(() => {
    const result: ActivityDay[][] = [];
    let currentWeek: ActivityDay[] = [];

    // Find first Sunday to align weeks
    const firstDay = new Date(`${activityData[0].date}T00:00:00Z`);
    const dayOffset = firstDay.getUTCDay(); // 0=Sun, 1=Mon, ...

    // Pad start with empty days
    for (let i = 0; i < dayOffset; i++) {
      currentWeek.push({ date: '', count: -1 });
    }

    for (const day of activityData) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        result.push(currentWeek);
        currentWeek = [];
      }
    }

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push({ date: '', count: -1 });
      }
      result.push(currentWeek);
    }

    return result;
  }, [activityData]);

  const dayLabels = Array.from({ length: 7 }, (_, day) => new Intl.DateTimeFormat(i18n.language, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + day))));
  const monthFormatter = new Intl.DateTimeFormat(i18n.language, { month: 'short', timeZone: 'UTC' });
  const lastActivityDate = new Date(`${activityData.at(-1)?.date ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const monthLabels = Array.from({ length: 12 }, (_, index) => {
    const month = new Date(Date.UTC(lastActivityDate.getUTCFullYear(), lastActivityDate.getUTCMonth() - 11 + index, 1));
    return monthFormatter.format(month);
  });

  return (
    <div className="w-full">
      <div
        className="w-full overflow-x-auto pb-2"
        tabIndex={0}
        role="img"
        aria-label={t('profile.activityHeatmapLabel', { count: totalActivity })}
        aria-describedby={isHistoryTruncated ? historyNoteId : undefined}
      >
        <div className="min-w-[720px]">
          {/* Month labels */}
          <div className="flex ml-9 mb-1">
            {monthLabels.map((m) => (
              <span
                key={m}
                className="flex-1 font-jetbrains text-xs text-[#788DA1] uppercase"
              >
                {m}
              </span>
            ))}
          </div>

          <div className="flex gap-1">
            {/* Day labels */}
            <div className="flex flex-col gap-[3px] mr-1">
              {dayLabels.map((d, index) => (
                <span
                  key={d}
                  className="font-jetbrains text-xs text-[#788DA1] h-3 flex items-center"
                  style={{ width: '28px' }}
                  aria-hidden={index % 2 !== 0}
                >
                  {index % 2 === 0 ? d : ''}
                </span>
              ))}
            </div>

            {/* Grid */}
            <div className="flex gap-[3px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((day, di) => (
                    <motion.div
                      key={`${wi}-${di}`}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        duration: 0.1,
                        delay: Math.min((wi * 7 + di) * 0.002, 0.8),
                      }}
                      className="w-3 h-3 rounded-sm cursor-default"
                      style={{
                        backgroundColor: day.count >= 0 ? getIntensityColor(day.count) : 'transparent',
                      }}
                      aria-hidden="true"
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-2 mt-3 ml-9">
            <span className="font-jetbrains text-xs text-[#788DA1]">{t('profile.less')}</span>
            {[0, 2, 4, 7, 10].map((count) => (
              <div
                key={count}
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: getIntensityColor(count) }}
              />
            ))}
            <span className="font-jetbrains text-xs text-[#788DA1]">{t('profile.more')}</span>
          </div>
        </div>
      </div>
      {isHistoryTruncated && (
        <p
          id={historyNoteId}
          role="note"
          className="mt-3 font-inter text-body-sm text-[#FFD166]"
        >
          {t('profile.activityHistoryTruncated')}
        </p>
      )}
    </div>
  );
}
