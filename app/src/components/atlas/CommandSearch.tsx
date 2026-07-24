import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { Search, X, Command } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface CommandSearchProps {
  value: string;
  onChange: (value: string) => void;
  resultCount?: number;
}

export default function CommandSearch({ value, onChange, resultCount }: CommandSearchProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const inputId = useId();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      inputRef.current?.focus();
    }
    if (e.key === 'Escape') {
      inputRef.current?.blur();
      onChange('');
    }
  }, [onChange]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
      className="w-full max-w-[640px] mx-auto relative"
    >
      <div
        className="relative flex items-center transition-all duration-fast"
        style={{
          borderRadius: 'var(--radius-md)',
          border: isFocused
            ? '1px solid #00E5FF'
            : '1px solid #1E2D3D',
          boxShadow: isFocused
            ? '0 0 20px rgba(0,229,255,0.1)'
            : 'none',
          backgroundColor: '#1A2332',
        }}
      >
        <Search
          size={20}
          className="absolute left-3 pointer-events-none transition-colors duration-fast"
          style={{ color: isFocused ? '#00E5FF' : '#4A6072' }}
        />

        <input
          id={inputId}
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={t('commandAtlas.search')}
          aria-label={t('commandAtlas.searchLabel')}
          aria-keyshortcuts="Control+K Meta+K"
          className="w-full h-12 pl-10 pr-20 bg-transparent font-fira text-base placeholder:text-[#4A6072] focus:outline-none"
          style={{ color: '#E8EDF2' }}
        />

        <div className="absolute right-3 flex items-center gap-2">
          <AnimatePresence>
            {value && (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                onClick={() => { onChange(''); inputRef.current?.focus(); }}
                aria-label={t('commandAtlas.clearSearch')}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-sm text-[#4A6072] transition-colors hover:text-[#E8EDF2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
              >
                <X size={16} />
              </motion.button>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {!value && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded-sm"
                style={{
                  backgroundColor: '#0F1419',
                  border: '1px solid #1E2D3D',
                }}
              >
                <Command size={10} className="text-[#4A6072]" />
                <span className="font-jetbrains text-[10px] text-[#4A6072] font-medium">K</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {resultCount !== undefined && (
        <p role="status" aria-live="polite" className="mt-2 font-jetbrains text-body-sm text-[#4A6072] text-center">
          {resultCount === 0
            ? t('commandAtlas.noCommandsFound')
            : t(resultCount === 1 ? 'commandAtlas.results' : 'commandAtlas.resultsPlural', { count: resultCount })}
        </p>
      )}
    </motion.div>
  );
}
