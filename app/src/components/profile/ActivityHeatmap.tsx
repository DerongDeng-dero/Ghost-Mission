import { useMemo } from 'react';
import { motion } from 'framer-motion';

interface ActivityDay {
  date: string;
  count: number;
}

function generateEmptyData(): ActivityDay[] {
  const data: ActivityDay[] = [];
  const today = new Date();
  for (let i = 364; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
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
}

export default function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const activityData = data ?? EMPTY_ACTIVITY_DATA;

  // Organize into weeks (columns) and days (rows)
  const weeks = useMemo(() => {
    const result: ActivityDay[][] = [];
    let currentWeek: ActivityDay[] = [];

    // Find first Sunday to align weeks
    const firstDay = new Date(activityData[0].date);
    const dayOffset = firstDay.getDay(); // 0=Sun, 1=Mon, ...

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

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div className="w-full overflow-x-auto pb-2">
      <div className="min-w-[720px]">
        {/* Month labels */}
        <div className="flex ml-9 mb-1">
          {monthLabels.map((m) => (
            <span
              key={m}
              className="flex-1 font-jetbrains text-[9px] text-[#4A6072] uppercase"
            >
              {m}
            </span>
          ))}
        </div>

        <div className="flex gap-1">
          {/* Day labels */}
          <div className="flex flex-col gap-1 mr-1">
            {dayLabels.filter((_, i) => i % 2 === 0).map((d) => (
              <span
                key={d}
                className="font-jetbrains text-[9px] text-[#4A6072] h-3 flex items-center"
                style={{ width: '28px' }}
              >
                {d}
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
                    title={day.date ? `${day.date}: ${day.count} commands used` : ''}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 mt-3 ml-9">
          <span className="font-jetbrains text-[9px] text-[#4A6072]">Less</span>
          {[0, 2, 4, 7, 10].map((count) => (
            <div
              key={count}
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: getIntensityColor(count) }}
            />
          ))}
          <span className="font-jetbrains text-[9px] text-[#4A6072]">More</span>
        </div>
      </div>
    </div>
  );
}
