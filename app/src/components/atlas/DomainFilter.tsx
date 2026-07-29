import { motion } from 'framer-motion';
import { domains, riskLevels, commandTypes } from '@/data/commands';
import { useTranslation } from 'react-i18next';

interface DomainFilterProps {
  activeDomain: string;
  onDomainChange: (domain: string) => void;
  activeRisks: Set<string>;
  onRiskToggle: (risk: string) => void;
  activeTypes: Set<string>;
  onTypeToggle: (type: string) => void;
  commandCounts: Record<string, number>;
}

export default function DomainFilter({
  activeDomain,
  onDomainChange,
  activeRisks,
  onRiskToggle,
  activeTypes,
  onTypeToggle,
  commandCounts,
}: DomainFilterProps) {
  const { t } = useTranslation();
  const domainLabel = (domain: string) => domain === 'All'
    ? t('commandAtlas.domains.all')
    : t(`commandAtlas.domains.${domain.toLowerCase()}`, { defaultValue: domain });

  return (
    <div className="w-full max-w-[1200px] mx-auto space-y-3">
      {/* Domain tabs */}
      <div
        className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin"
        role="group"
        aria-label={t('commandAtlas.domainFilterLabel')}
        tabIndex={0}
      >
        {domains.map((domain) => {
          const isActive = activeDomain === domain;
          const count = commandCounts[domain] ?? 0;
          return (
            <button
              type="button"
              key={domain}
              onClick={() => onDomainChange(domain)}
              aria-pressed={isActive}
              className="relative min-h-11 flex-shrink-0 whitespace-nowrap px-4 font-jetbrains text-nav uppercase transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
              style={{
                color: isActive ? '#00E5FF' : '#8B9EB0',
                backgroundColor: isActive ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {domainLabel(domain)}
              {count > 0 && (
                <span
                  className="ml-1.5 font-jetbrains text-badge px-1.5 py-0.5 rounded-full"
                  style={{
                    color: isActive ? '#00E5FF' : '#788DA1',
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
        <div className="flex items-center gap-2 flex-wrap" role="group" aria-label={t('commandAtlas.riskFilterLabel')}>
          <span className="font-jetbrains text-body-sm text-[#788DA1] mr-1">{t('commandAtlas.riskFilterLabel')}:</span>
          {riskLevels.map(({ level, color }) => {
            const isActive = activeRisks.has(level);
            const label = t(`commandAtlas.riskLevels.${level}`);
            return (
              <button
                type="button"
                key={level}
                onClick={() => onRiskToggle(level)}
                title={label}
                aria-pressed={isActive}
                className="relative flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-radius-sm px-2.5 transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
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
                  className="sr-only font-jetbrains text-body-sm sm:not-sr-only"
                  style={{ color: isActive ? color : '#788DA1' }}
                >
                  {label}
                </span>
              </button>
            );
          })}
          {activeRisks.size > 0 && (
            <button
              type="button"
              onClick={() => { activeRisks.forEach(r => onRiskToggle(r)); }}
              className="ml-1 min-h-11 rounded-radius-sm px-2 font-jetbrains text-body-sm text-[#788DA1] transition-colors hover:text-[#E8EDF2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
            >
              {t('commandAtlas.clearFilters')}
            </button>
          )}
        </div>

        <div className="w-px h-5 bg-[#1E2D3D] hidden md:block" />

        {/* Type filters */}
        <div className="flex items-center gap-2 flex-wrap" role="group" aria-label={t('commandAtlas.typeFilterLabel')}>
          <span className="font-jetbrains text-body-sm text-[#788DA1] mr-1">{t('commandAtlas.typeFilterLabel')}:</span>
          {commandTypes.map(({ type }) => {
            const isActive = activeTypes.has(type);
            return (
              <button
                type="button"
                key={type}
                onClick={() => onTypeToggle(type)}
                aria-pressed={isActive}
                className="min-h-11 rounded-radius-sm px-2.5 font-jetbrains text-body-sm transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
                style={{
                  color: isActive ? '#00E5FF' : '#788DA1',
                  border: `1px solid ${isActive ? '#00E5FF' : '#1E2D3D'}`,
                  backgroundColor: isActive ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
                }}
              >
                {t(`commandAtlas.types.${type}`)}
              </button>
            );
          })}
          {activeTypes.size > 0 && (
            <button
              type="button"
              onClick={() => { activeTypes.forEach(t => onTypeToggle(t)); }}
              className="ml-1 min-h-11 rounded-radius-sm px-2 font-jetbrains text-body-sm text-[#788DA1] transition-colors hover:text-[#E8EDF2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
            >
              {t('commandAtlas.clearFilters')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
