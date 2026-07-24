import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Copy,
  Check,
  AlertTriangle,
  Shield,
  BookOpen,
  Flag,
  Terminal,
} from 'lucide-react';
import type { CommandData } from '@/data/commands';

interface CommandCardProps {
  command: CommandData;
  isLearned: boolean;
  index: number;
}

const riskColorMap: Record<string, string> = {
  green: '#00FF88',
  blue: '#00E5FF',
  yellow: '#FFD166',
  red: '#FF4757',
  purple: '#C77DFF',
  black: '#FF6B35',
};

const domainColorMap: Record<string, string> = {
  File: '#00FF88',
  Text: '#00E5FF',
  Process: '#FFD166',
  Network: '#00E5FF',
  Git: '#FF6B35',
  Editor: '#C77DFF',
  Runtime: '#4488FF',
  Package: '#2496ED',
  Container: '#2496ED',
  Database: '#C77DFF',
  Services: '#FF6B35',
  Shell: '#E8EDF2',
};

export default function CommandCard({ command, isLearned, index }: CommandCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const riskColor = riskColorMap[command.riskLevel] || '#00FF88';
  const domainColor = domainColorMap[command.domain] || '#8B9EB0';

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.25,
        delay: Math.min(index * 0.05, 0.5),
        ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
      }}
      className="relative group"
      style={{
        backgroundColor: '#0F1419',
        border: `1px solid ${expanded ? '#2A4365' : '#1E2D3D'}`,
        borderRadius: 'var(--radius-md)',
        borderLeft: isLearned && !expanded ? `3px solid ${riskColor}` : undefined,
        transition: 'border-color 150ms, transform 150ms, box-shadow 150ms',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = '#2A4365';
        el.style.transform = 'translateY(-2px)';
        el.style.boxShadow = '0 8px 32px rgba(0,0,0,0.5)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        if (!expanded) {
          el.style.borderColor = '#1E2D3D';
        }
        el.style.transform = 'translateY(0)';
        el.style.boxShadow = '0 4px 24px rgba(0,0,0,0.4)';
      }}
    >
      {/* Risk stripe */}
      <div
        className="absolute top-0 left-0 right-0 h-[3px] rounded-t-radius-md"
        style={{ backgroundColor: riskColor, opacity: 0.6 }}
      />

      {/* Card Header - Always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 pt-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E14] rounded-radius-md"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="font-fira text-code" style={{ color: '#00FF88' }}>
                {command.displayName}
              </code>
              <span
                className="font-jetbrains text-badge uppercase px-1.5 py-0.5 rounded-radius-sm"
                style={{
                  color: domainColor,
                  backgroundColor: `${domainColor}15`,
                  border: `1px solid ${domainColor}30`,
                }}
              >
                {command.domain}
              </span>
              {isLearned && (
                <span
                  className="font-jetbrains text-badge uppercase px-1.5 py-0.5 rounded-radius-sm flex items-center gap-1"
                  style={{
                    color: '#00FF88',
                    backgroundColor: 'rgba(0, 255, 136, 0.1)',
                    border: '1px solid rgba(0, 255, 136, 0.2)',
                  }}
                >
                  <Check size={10} />
                  Learned
                </span>
              )}
            </div>
            <p className="font-inter text-body text-[#8B9EB0] mt-1.5">
              {command.summary}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Risk dot */}
            <div className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: riskColor,
                  boxShadow: `0 0 6px ${riskColor}40`,
                }}
              />
              <span
                className="font-jetbrains text-body-sm hidden sm:inline capitalize"
                style={{ color: riskColor }}
              >
                {command.riskLevel}
              </span>
            </div>

            <motion.div
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown size={16} className="text-[#4A6072]" />
            </motion.div>
          </div>
        </div>

        {/* Syntax line */}
        <div
          className="mt-2 px-3 py-1.5 rounded-radius-sm font-fira text-code-sm inline-block max-w-full truncate"
          style={{
            backgroundColor: 'rgba(0, 229, 255, 0.05)',
            color: '#00E5FF',
          }}
        >
          {command.syntax}
        </div>

        {/* Flags preview (2-col) */}
        {!expanded && command.commonFlags.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
            {command.commonFlags.slice(0, 4).map((f) => (
              <div key={f.flag} className="flex items-start gap-2 min-w-0">
                <code
                  className="font-fira text-code-sm flex-shrink-0 px-1 py-0.5 rounded-sm"
                  style={{
                    backgroundColor: '#1A2332',
                    color: '#E8EDF2',
                    border: '1px solid #1E2D3D',
                  }}
                >
                  {f.flag}
                </code>
                <span className="font-inter text-body-sm text-[#8B9EB0] truncate">
                  {f.meaning}
                </span>
              </div>
            ))}
          </div>
        )}
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div ref={contentRef} className="px-4 pb-4 space-y-4 border-t border-[#1E2D3D] pt-4">
              {/* Full flags grid */}
              {command.commonFlags.length > 0 && (
                <div>
                  <h4 className="font-jetbrains text-body-sm text-[#4A6072] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Flag size={12} />
                    Common Flags
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {command.commonFlags.map((f) => (
                      <div
                        key={f.flag}
                        className="flex items-start gap-2 p-2 rounded-radius-sm"
                        style={{ backgroundColor: 'rgba(26, 35, 50, 0.5)' }}
                      >
                        <code
                          className="font-fira text-code-sm flex-shrink-0 px-1.5 py-0.5 rounded-sm"
                          style={{
                            backgroundColor: '#1A2332',
                            color: '#E8EDF2',
                            border: '1px solid #1E2D3D',
                          }}
                        >
                          {f.flag}
                        </code>
                        <span className="font-inter text-body-sm text-[#8B9EB0]">
                          {f.meaning}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Examples */}
              {command.examples.length > 0 && (
                <div>
                  <h4 className="font-jetbrains text-body-sm text-[#4A6072] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Terminal size={12} />
                    Examples
                  </h4>
                  <div className="space-y-2">
                    {command.examples.map((ex, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-radius-sm"
                        style={{ backgroundColor: 'rgba(0, 229, 255, 0.05)' }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <code className="font-fira text-code-sm text-[#00E5FF] break-all flex-1">
                            $ {ex.command}
                          </code>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(ex.command, `ex-${command.id}-${i}`);
                            }}
                            className="flex-shrink-0 p-1 rounded-sm transition-colors"
                            style={{ color: copiedId === `ex-${command.id}-${i}` ? '#00FF88' : '#4A6072' }}
                          >
                            {copiedId === `ex-${command.id}-${i}` ? (
                              <Check size={14} />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                        </div>
                        <p className="font-inter text-body-sm text-[#8B9EB0] mt-1">
                          {ex.explanation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Anti-patterns */}
              {command.antiPatterns.length > 0 && (
                <div>
                  <h4 className="font-jetbrains text-body-sm uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: '#FF4757' }}>
                    <AlertTriangle size={12} />
                    Anti-Patterns
                  </h4>
                  <div className="space-y-2">
                    {command.antiPatterns.map((ap, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-radius-sm"
                        style={{
                          backgroundColor: 'rgba(255, 71, 87, 0.05)',
                          borderLeft: '2px solid #FF4757',
                        }}
                      >
                        <code className="font-fira text-code-sm text-[#FF4757]">
                          {ap.pattern}
                        </code>
                        <p className="font-inter text-body-sm text-[#8B9EB0] mt-1">
                          {ap.whyBad}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Safe patterns */}
              {command.safePatterns.length > 0 && (
                <div>
                  <h4 className="font-jetbrains text-body-sm text-[#00FF88] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Shield size={12} />
                    Safe Patterns
                  </h4>
                  <div className="space-y-1.5">
                    {command.safePatterns.map((sp, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-2 rounded-radius-sm"
                        style={{
                          backgroundColor: 'rgba(0, 255, 136, 0.05)',
                          borderLeft: '2px solid #00FF88',
                        }}
                      >
                        <span className="font-inter text-body-sm text-[#8B9EB0]">
                          {sp.pattern}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Related commands */}
              {command.related.length > 0 && (
                <div>
                  <h4 className="font-jetbrains text-body-sm text-[#4A6072] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <BookOpen size={12} />
                    Related Commands
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {command.related.map((rel) => (
                      <span
                        key={rel}
                        className="font-fira text-code-sm px-2.5 py-1 rounded-radius-sm cursor-default"
                        style={{
                          color: '#4488FF',
                          backgroundColor: 'rgba(68, 136, 255, 0.08)',
                          border: '1px solid rgba(68, 136, 255, 0.2)',
                        }}
                      >
                        {rel}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Mission references */}
              {command.missions.length > 0 && (
                <div>
                  <h4 className="font-jetbrains text-body-sm text-[#4A6072] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <BookOpen size={12} />
                    Used in Missions
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {command.missions.map((m) => (
                      <span
                        key={m}
                        className="font-inter text-body-sm px-2.5 py-1 rounded-radius-sm"
                        style={{
                          color: '#8B9EB0',
                          backgroundColor: '#1A2332',
                          border: '1px solid #1E2D3D',
                        }}
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
