import { motion } from 'framer-motion';
import { domains, riskLevels, commandTypes } from '@/data/commands';

interface DomainFilterProps {
  activeDomain: string;
  onDomainChange: (domain: string) => void;
  activeRisks: Set<string>;
  onRiskToggle: (risk: string) => void;
  activeTypes: Set<string>;
  onTypeToggle: (type: string) => void;
  commandCounts: Record<string, number>;
}

const domainLabels: Record<string, string> = {
  All: '全部',
  File: '文件',
  Text: '文本',
  Process: '进程',
  Network: '网络',
  Git: 'Git',
  Editor: '编辑器',
  Runtime: '运行时',
  Package: '包管理',
  Container: '容器',
  Database: '数据库',
  Services: '服务',
  Shell: 'Shell',
};

export default function DomainFilter({
  activeDomain,
  onDomainChange,
  activeRisks,
  onRiskToggle,
  activeTypes,
  onTypeToggle,
  commandCounts,
}: DomainFilterProps) {
  return (
    <div className="w-full max-w-[1200px] mx-auto space-y-3">
      {/* Domain tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
        {domains.map((domain) => {
          const isActive = activeDomain === domain;
          const count = commandCounts[domain] ?? 0;
          return (
            <button
              key={domain}
              onClick={() => onDomainChange(domain)}
              className="relative flex-shrink-0 px-4 py-2.5 font-jetbrains text-nav uppercase transition-colors duration-fast whitespace-nowrap"
              style={{
                color: isActive ? '#00E5FF' : '#8B9EB0',
                backgroundColor: isActive ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {domainLabels[domain] || domain}
              {count > 0 && (
                <span
                  className="ml-1.5 font-jetbrains text-badge px-1.5 py-0.5 rounded-full"
                  style={{
                    color: isActive ? '#00E5FF' : '#4A6072',
                    backgroundColor: isActive ? 'rgba(0, 229, 255, 0.12)' : 'rgba(30, 45, 61, 0.5)',
                  }}
                >
                  {count}
                </span>
              )}
              {isActive && (
                <motion.div
                  layoutId="activeDomainIndicator"
                  className="absolute bottom-0 left-2 right-2 h-[2px] bg-[#00E5FF]"
                  style={{ borderRadius: '1px' }}
                  transition={{ duration: 0.2 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Risk + Type filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Risk level toggles */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-jetbrains text-body-sm text-[#4A6072] mr-1">风险:</span>
          {riskLevels.map(({ level, color, label }) => {
            const isActive = activeRisks.has(level);
            return (
              <button
                key={level}
                onClick={() => onRiskToggle(level)}
                title={label}
                className="relative flex items-center gap-1.5 px-2.5 py-1.5 transition-all duration-fast rounded-radius-sm"
                style={{
                  border: `1px solid ${isActive ? color : '#1E2D3D'}`,
                  backgroundColor: isActive ? `${color}15` : 'transparent',
                }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: color,
                    boxShadow: isActive ? `0 0 6px ${color}40` : 'none',
                  }}
                />
                <span
                  className="font-jetbrains text-body-sm hidden sm:inline"
                  style={{ color: isActive ? color : '#4A6072' }}
                >
                  {label}
                </span>
              </button>
            );
          })}
          {activeRisks.size > 0 && (
            <button
              onClick={() => { activeRisks.forEach(r => onRiskToggle(r)); }}
              className="font-jetbrains text-body-sm text-[#4A6072] hover:text-[#E8EDF2] transition-colors ml-1"
            >
              清除
            </button>
          )}
        </div>

        <div className="w-px h-5 bg-[#1E2D3D] hidden md:block" />

        {/* Type filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-jetbrains text-body-sm text-[#4A6072] mr-1">类型:</span>
          {commandTypes.map(({ type, label }) => {
            const isActive = activeTypes.has(type);
            return (
              <button
                key={type}
                onClick={() => onTypeToggle(type)}
                className="px-2.5 py-1 font-jetbrains text-body-sm transition-all duration-fast rounded-radius-sm"
                style={{
                  color: isActive ? '#00E5FF' : '#4A6072',
                  border: `1px solid ${isActive ? '#00E5FF' : '#1E2D3D'}`,
                  backgroundColor: isActive ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
                }}
              >
                {label}
              </button>
            );
          })}
          {activeTypes.size > 0 && (
            <button
              onClick={() => { activeTypes.forEach(t => onTypeToggle(t)); }}
              className="font-jetbrains text-body-sm text-[#4A6072] hover:text-[#E8EDF2] transition-colors ml-1"
            >
              清除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
