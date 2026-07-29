import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';

interface Department {
  id: number;
  name: string;
  color: string;
  progress: number;
  subSkills: { name: string; progress: number }[];
}

const departments: Department[] = [
  { id: 1, name: 'Help & Discovery', color: '#00FF88', progress: 85, subSkills: [
    { name: 'man', progress: 90 }, { name: 'apropos', progress: 80 }, { name: 'tldr', progress: 85 },
  ]},
  { id: 2, name: 'Filesystem Movement', color: '#00FF88', progress: 92, subSkills: [
    { name: 'pwd/ls/cd', progress: 95 }, { name: 'pushd/popd', progress: 75 }, { name: 'Symlinks', progress: 85 }, { name: 'Glob patterns', progress: 90 },
  ]},
  { id: 3, name: 'File Manipulation', color: '#00FF88', progress: 78, subSkills: [
    { name: 'touch/mkdir', progress: 95 }, { name: 'cp/mv/rm', progress: 80 }, { name: 'find', progress: 70 }, { name: 'tar/gzip', progress: 65 },
  ]},
  { id: 4, name: 'Permissions & Identity', color: '#FFD166', progress: 65, subSkills: [
    { name: 'chmod/chown', progress: 60 }, { name: 'sudo', progress: 75 }, { name: 'umask', progress: 50 }, { name: 'ACLs', progress: 40 },
  ]},
  { id: 5, name: 'Text Intelligence', color: '#00E5FF', progress: 88, subSkills: [
    { name: 'grep', progress: 95 }, { name: 'awk', progress: 80 }, { name: 'sed', progress: 85 }, { name: 'regex', progress: 90 },
  ]},
  { id: 6, name: 'Bash Language', color: '#E8EDF2', progress: 72, subSkills: [
    { name: 'Variables', progress: 80 }, { name: 'Conditionals', progress: 70 }, { name: 'Loops', progress: 65 }, { name: 'Functions', progress: 60 },
  ]},
  { id: 7, name: 'Pipes & IO', color: '#E8EDF2', progress: 82, subSkills: [
    { name: '| (pipe)', progress: 95 }, { name: 'redirection > >>', progress: 85 }, { name: 'tee', progress: 75 }, { name: 'xargs', progress: 70 },
  ]},
  { id: 8, name: 'Keyboard Survival', color: '#C77DFF', progress: 55, subSkills: [
    { name: 'Ctrl+C/Z/D', progress: 90 }, { name: 'Job control', progress: 50 }, { name: 'readline', progress: 40 }, { name: 'bind', progress: 30 },
  ]},
  { id: 9, name: 'Process & Resource Ops', color: '#FF6B35', progress: 70, subSkills: [
    { name: 'ps/top/htop', progress: 85 }, { name: 'kill signals', progress: 75 }, { name: 'nice/renice', progress: 55 }, { name: 'ulimit', progress: 50 },
  ]},
  { id: 10, name: 'Storage & Filesystems', color: '#4488FF', progress: 45, subSkills: [
    { name: 'df/du', progress: 70 }, { name: 'mount', progress: 40 }, { name: 'lsblk/fdisk', progress: 30 }, { name: 'LVM', progress: 20 },
  ]},
  { id: 11, name: 'Archives & Integrity', color: '#00E5FF', progress: 60, subSkills: [
    { name: 'tar/zip', progress: 75 }, { name: 'gzip/bzip2', progress: 65 }, { name: 'md5sum/sha256', progress: 55 }, { name: 'rsync', progress: 45 },
  ]},
  { id: 12, name: 'Network Diagnostics', color: '#00E5FF', progress: 68, subSkills: [
    { name: 'ping/traceroute', progress: 85 }, { name: 'curl/wget', progress: 80 }, { name: 'netstat/ss', progress: 65 }, { name: 'nc/nmap', progress: 50 },
  ]},
  { id: 13, name: 'Services & Logs', color: '#FF6B35', progress: 58, subSkills: [
    { name: 'systemctl', progress: 65 }, { name: 'journalctl', progress: 70 }, { name: 'syslog', progress: 50 }, { name: 'cron', progress: 45 },
  ]},
  { id: 14, name: 'Package & Runtime', color: '#2496ED', progress: 62, subSkills: [
    { name: 'apt/yum', progress: 70 }, { name: 'npm/pip', progress: 75 }, { name: 'snap/flatpak', progress: 40 }, { name: 'AppImages', progress: 35 },
  ]},
  { id: 15, name: 'Editors & REPLs', color: '#C77DFF', progress: 48, subSkills: [
    { name: 'vim basics', progress: 55 }, { name: 'nano', progress: 80 }, { name: 'REPLs (python/node)', progress: 45 }, { name: 'emacs', progress: 15 },
  ]},
  { id: 16, name: 'Git Timeline', color: '#FF6B35', progress: 52, subSkills: [
    { name: 'add/commit/push', progress: 75 }, { name: 'branch/merge', progress: 60 }, { name: 'rebase', progress: 40 }, { name: 'cherry-pick', progress: 35 },
  ]},
  { id: 17, name: 'Multiplexer & Remote', color: '#C77DFF', progress: 42, subSkills: [
    { name: 'tmux basics', progress: 50 }, { name: 'ssh/scp', progress: 65 }, { name: 'screen', progress: 30 }, { name: 'mosh', progress: 20 },
  ]},
];

function ProgressRing({
  progress,
  color,
  size = 36,
}: {
  progress: number;
  color: string;
  size?: number;
}) {
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const ref = useRef<SVGSVGElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const duration = 800;
          const animate = (now: number) => {
            const elapsed = now - start;
            const p = Math.min(elapsed / duration, 1);
            const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
            setAnimatedProgress(Math.round(eased * progress));
            if (p < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [progress]);

  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dashOffset = c - (animatedProgress / 100) * c;

  return (
    <svg ref={ref} width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#1E2D3D"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 100ms' }}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        className="font-jetbrains"
        style={{ fontSize: '9px', fill: '#8B9EB0' }}
      >
        {animatedProgress}%
      </text>
    </svg>
  );
}

export default function SkillTreeMini() {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      {departments.map((dept) => {
        const isExpanded = expandedId === dept.id;
        return (
          <div
            key={dept.id}
            className="rounded-radius-md overflow-hidden"
            style={{
              backgroundColor: '#0F1419',
              border: '1px solid #1E2D3D',
            }}
          >
            {/* Header */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : dept.id)}
              className="w-full flex items-center gap-3 p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E14]"
            >
              <ProgressRing progress={dept.progress} color={dept.color} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="font-jetbrains text-badge px-1.5 py-0.5 rounded-sm"
                    style={{
                      color: dept.color,
                      backgroundColor: `${dept.color}15`,
                    }}
                  >
                    {String(dept.id).padStart(2, '0')}
                  </span>
                  <span className="font-jetbrains text-body font-semibold text-[#E8EDF2]">
                    {dept.name}
                  </span>
                </div>
                {/* Mini progress bar */}
                <div className="mt-1.5 w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#1A2332' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${dept.progress}%`,
                      backgroundColor: dept.color,
                    }}
                  />
                </div>
              </div>
              <motion.div
                animate={{ rotate: isExpanded ? 90 : 0 }}
                transition={{ duration: 0.2 }}
                className="text-[#788DA1] flex-shrink-0"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </motion.div>
            </button>

            {/* Expanded sub-skills */}
            <motion.div
              initial={false}
              animate={{ height: isExpanded ? 'auto' : 0, opacity: isExpanded ? 1 : 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              {isExpanded && (
                <div className="px-3 pb-3 pt-1 border-t border-[#1E2D3D] space-y-2">
                  {dept.subSkills.map((skill, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.25 }}
                      className="flex items-center gap-2"
                    >
                      <span className="font-fira text-body-sm text-[#8B9EB0] w-28 truncate flex-shrink-0">
                        {skill.name}
                      </span>
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: '#1A2332' }}>
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: dept.color }}
                          initial={{ width: 0 }}
                          animate={{ width: `${skill.progress}%` }}
                          transition={{ delay: 0.1 + i * 0.05, duration: 0.4 }}
                        />
                      </div>
                      <span className="font-jetbrains text-[10px] text-[#788DA1] w-7 text-right flex-shrink-0">
                        {skill.progress}%
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
