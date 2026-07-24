import { useState, useMemo, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, BookOpen, X, Network, List } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CommandSearch from '@/components/atlas/CommandSearch';
import DomainFilter from '@/components/atlas/DomainFilter';
import CommandGrid from '@/components/atlas/CommandGrid';
import CommandGraph3D from '@/components/atlas/CommandGraph3D';
import { commands, getCommandStats } from '@/data/commands';

function AtlasSkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto px-space-4 py-space-6 space-y-6">
      <div className="animate-pulse rounded-radius-md h-12" style={{ backgroundColor: '#0F1419', border: '1px solid #1E2D3D' }} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse rounded-radius-md h-24" style={{ backgroundColor: '#0F1419', border: '1px solid #1E2D3D' }} />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="animate-pulse rounded-radius-md h-40" style={{ backgroundColor: '#0F1419', border: '1px solid #1E2D3D' }} />
        ))}
      </div>
    </div>
  )
}

export default function CommandAtlas() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDomain, setActiveDomain] = useState('All');
  const [activeRisks, setActiveRisks] = useState<Set<string>>(new Set());
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 150)
    return () => clearTimeout(timer)
  }, [])

  const handleRiskToggle = useCallback((risk: string) => {
    setActiveRisks((prev) => {
      const next = new Set(prev);
      if (next.has(risk)) {
        next.delete(risk);
      } else {
        next.add(risk);
      }
      return next;
    });
  }, []);

  const handleTypeToggle = useCallback((type: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const handleCommandClick = useCallback((commandName: string) => {
    setSearchQuery(commandName);
    setViewMode('list');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Compute command counts per domain
  const commandCounts = useMemo(() => {
    const counts: Record<string, number> = { All: commands.length };
    for (const cmd of commands) {
      counts[cmd.domain] = (counts[cmd.domain] || 0) + 1;
    }
    return counts;
  }, []);

  // Filter commands
  const filteredCommands = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return commands.filter((cmd) => {
      // Domain filter
      if (activeDomain !== 'All' && cmd.domain !== activeDomain) return false;

      // Risk filter
      if (activeRisks.size > 0 && !activeRisks.has(cmd.riskLevel)) return false;

      // Type filter
      if (activeTypes.size > 0 && !activeTypes.has(cmd.type)) return false;

      // Search
      if (query) {
        const inName = cmd.name.toLowerCase().includes(query);
        const inDisplay = cmd.displayName.toLowerCase().includes(query);
        const inSummary = cmd.summary.toLowerCase().includes(query);
        const inFlags = cmd.commonFlags.some(
          (f) => f.flag.toLowerCase().includes(query) || f.meaning.toLowerCase().includes(query)
        );
        const inExamples = cmd.examples.some(
          (e) => e.command.toLowerCase().includes(query) || e.explanation.toLowerCase().includes(query)
        );
        const inAnti = cmd.antiPatterns.some(
          (a) => a.pattern.toLowerCase().includes(query) || a.whyBad.toLowerCase().includes(query)
        );
        const inRelated = cmd.related.some((r) => r.toLowerCase().includes(query));
        if (!inName && !inDisplay && !inSummary && !inFlags && !inExamples && !inAnti && !inRelated) {
          return false;
        }
      }

      return true;
    });
  }, [searchQuery, activeDomain, activeRisks, activeTypes]);

  // Stats
  const stats = useMemo(() => {
    const stats = getCommandStats();
    const danger = commands.filter((c) => c.riskLevel === 'red' || c.riskLevel === 'black').length;
    return [
      {
        label: t('commandAtlas.stats.totalCommands'),
        value: stats.total,
        subtitle: t('commandAtlas.stats.domains', { count: Object.keys(commandCounts).length - 1 }),
        color: '#00FF88',
      },
      {
        label: t('commandAtlas.stats.youLearned'),
        value: stats.learned,
        subtitle: t('commandAtlas.stats.coverage', { percent: Math.round((stats.learned / stats.total) * 100) }),
        color: '#00E5FF',
      },
      {
        label: t('commandAtlas.stats.dangerCommands'),
        value: danger,
        subtitle: t('commandAtlas.stats.ofTotal', { percent: Math.round((danger / stats.total) * 100) }),
        color: '#FF4757',
      },
    ];
  }, [commandCounts, t]);

  return (
    <div className="min-h-[100dvh]" style={{ backgroundColor: '#0A0E14' }}>
      {/* Page Header */}
      <div
        className="w-full py-10 px-space-4"
        style={{ backgroundColor: '#0F1419' }}
      >
        <div className="max-w-[1200px] mx-auto">
          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
            className="text-center mb-6"
          >
            <div className="flex items-center justify-center gap-3 mb-2">
              <Search size={32} className="text-[#00E5FF]" />
              <h1 className="font-jetbrains text-h1 text-[#E8EDF2]">
                {t('commandAtlas.title')}
              </h1>
            </div>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
              className="font-inter text-body text-[#8B9EB0]"
            >
              {t('commandAtlas.subtitle', { domains: Object.keys(commandCounts).length - 1 })}
            </motion.p>
          </motion.div>

          {/* Search */}
          <CommandSearch
            value={searchQuery}
            onChange={setSearchQuery}
            resultCount={filteredCommands.length}
          />
        </div>
      </div>

      {/* Main Content */}
      {isLoading ? (
        <AtlasSkeleton />
      ) : (
      <div className="max-w-[1200px] mx-auto px-space-4 py-space-6 space-y-6">
        {/* Filters */}
        <DomainFilter
          activeDomain={activeDomain}
          onDomainChange={setActiveDomain}
          activeRisks={activeRisks}
          onRiskToggle={handleRiskToggle}
          activeTypes={activeTypes}
          onTypeToggle={handleTypeToggle}
          commandCounts={commandCounts}
        />

        {/* Stats Row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-5"
        >
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                delay: 0.15 + i * 0.15,
                ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
              }}
              className="p-5 rounded-radius-md"
              style={{
                backgroundColor: '#0F1419',
                border: '1px solid #1E2D3D',
              }}
            >
              <div
                className="font-jetbrains text-h2"
                style={{ color: stat.color }}
              >
                {stat.value.toLocaleString()}
              </div>
              <div className="font-jetbrains text-h4 text-[#E8EDF2] mt-1">
                {stat.label}
              </div>
              <div className="font-inter text-body-sm text-[#8B9EB0] mt-0.5">
                {stat.subtitle}
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* View Toggle */}
        <div className="flex items-center justify-end gap-2">
          <div
            className="inline-flex rounded-lg border overflow-hidden"
            style={{ backgroundColor: '#0F1419', borderColor: '#1E2D3D' }}
          >
            <button
              onClick={() => setViewMode('list')}
              className="flex items-center gap-1.5 px-3 py-1.5 font-jetbrains text-body-sm transition-colors"
              style={{
                backgroundColor: viewMode === 'list' ? '#1E2D3D' : 'transparent',
                color: viewMode === 'list' ? '#E8EDF2' : '#4A6072',
              }}
            >
              <List size={14} />
              {t('commandAtlas.listView')}
            </button>
            <button
              onClick={() => setViewMode('graph')}
              className="flex items-center gap-1.5 px-3 py-1.5 font-jetbrains text-body-sm transition-colors"
              style={{
                backgroundColor: viewMode === 'graph' ? '#1E2D3D' : 'transparent',
                color: viewMode === 'graph' ? '#E8EDF2' : '#4A6072',
              }}
            >
              <Network size={14} />
              {t('commandAtlas.graphView')}
            </button>
          </div>
        </div>

        {/* Graph View */}
        {viewMode === 'graph' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <CommandGraph3D onCommandSelect={handleCommandClick} />
          </motion.div>
        )}

        {/* Command Grid */}
        {viewMode === 'list' && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-jetbrains text-h4 text-[#E8EDF2] flex items-center gap-2">
              <BookOpen size={18} className="text-[#00E5FF]" />
              {t('commandAtlas.commands')}
            </h2>
            <span className="font-jetbrains text-body-sm text-[#4A6072]">
              {t('commandAtlas.results', { count: filteredCommands.length })}
            </span>
          </div>
          {filteredCommands.length === 0 && (searchQuery || activeDomain !== 'All' || activeRisks.size > 0 || activeTypes.size > 0) ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center justify-center py-16 gap-3 text-center"
            >
              <Search size={48} className="opacity-30" style={{ color: 'var(--text-muted, #4A6072)' }} />
              <p className="font-jetbrains text-body text-[#8B9EB0]">{t('commandAtlas.noCommandsMatch')}</p>
              <button
                onClick={() => {
                  setSearchQuery('')
                  setActiveDomain('All')
                  setActiveRisks(new Set());
                  setActiveTypes(new Set());
                }}
                className="flex items-center gap-1 font-jetbrains text-body-sm underline transition-colors"
                style={{ color: '#00E5FF' }}
              >
                <X size={14} />
                {t('commandAtlas.clearFilters')}
              </button>
            </motion.div>
          ) : (
            <CommandGrid commands={filteredCommands} />
          )}
        </div>
        )}
      </div>
      )}
    </div>
  );
}
