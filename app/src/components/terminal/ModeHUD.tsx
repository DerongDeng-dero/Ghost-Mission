import { motion, AnimatePresence } from 'framer-motion'

interface ModeHUDProps {
  mode: string
  cwd: string
  gitBranch: string | null
  gitDirty: boolean
  processName: string
  tmuxSession: string | null
  hudMode: 'hidden' | 'contextual' | 'training'
  onCycleHudMode: () => void
}

function getModeColor(mode: string): string {
  if (mode.startsWith('vim')) return 'var(--status-purple)'
  if (mode.startsWith('less') || mode === 'man') return 'var(--text-yellow)'
  if (mode === 'nano') return 'var(--neon-cyan)'
  if (mode === 'node' || mode === 'python') return 'var(--neon-green)'
  if (mode === 'psql' || mode === 'sqlite') return 'var(--neon-blue)'
  if (mode === 'tmux') return 'var(--neon-cyan)'
  return 'var(--neon-green)'
}

export default function ModeHUD({ mode, cwd, gitBranch, gitDirty, processName, tmuxSession, hudMode, onCycleHudMode }: ModeHUDProps) {
  const displayMode = mode.toUpperCase()
  const modeColor = getModeColor(mode)
  const displayCwd = cwd.replace(/^\/home\/ghost/, '~')

  return (
    <div
      className="flex items-center gap-2 sm:gap-4 px-2 sm:px-4 border-t h-12 flex-shrink-0 overflow-hidden"
      style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-subtle)' }}
      role="group"
      aria-label="Terminal status and shortcuts"
    >
      {/* cwd */}
      <div className="flex min-w-0 flex-1 sm:flex-none items-center gap-1 font-jetbrains text-code-sm" style={{ color: 'var(--neon-cyan)' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <span className="max-w-[42vw] sm:max-w-[200px] truncate" title={displayCwd}>{displayCwd}</span>
      </div>

      <span className="hidden sm:inline" style={{ color: 'var(--border-subtle)' }} aria-hidden="true">|</span>

      {/* Git */}
      {gitBranch && (
        <>
          <div className="hidden md:flex items-center gap-1 font-jetbrains text-code-sm" style={{ color: 'var(--neon-green)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            <span>{gitBranch}</span>
            {gitDirty && <span style={{ color: 'var(--status-warning)' }}>&#8226;</span>}
          </div>
          <span className="hidden md:inline" style={{ color: 'var(--border-subtle)' }} aria-hidden="true">|</span>
        </>
      )}

      {/* Process */}
      <div className="hidden sm:flex items-center gap-1 font-jetbrains text-code-sm" style={{ color: mode.startsWith('vim') || mode.startsWith('less') ? 'var(--status-purple)' : 'var(--text-secondary)' }}>
        <span>proc:</span>
        <span>{processName}</span>
      </div>

      <span className="hidden sm:inline" style={{ color: 'var(--border-subtle)' }} aria-hidden="true">|</span>

      {/* tmux */}
      {tmuxSession && (
        <>
          <div className="hidden sm:flex items-center gap-1 font-jetbrains text-code-sm" style={{ color: 'var(--neon-blue)' }}>
            <span>tmux: {tmuxSession}</span>
          </div>
          <span className="hidden sm:inline" style={{ color: 'var(--border-subtle)' }} aria-hidden="true">|</span>
        </>
      )}

      {/* Mode badge */}
      <motion.div
        className="flex-shrink-0 px-2 py-0.5 rounded-full font-jetbrains text-[10px] font-semibold uppercase tracking-wider"
        role="status"
        aria-live="polite"
        style={{
          color: modeColor,
          backgroundColor: modeColor.replace(')', ', 0.12)').replace('var(', 'rgba(').replace('--neon-green', '0, 255, 136').replace('--neon-cyan', '0, 229, 255').replace('--neon-blue', '68, 136, 255').replace('--status-purple', '199, 125, 255').replace('--text-yellow', '255, 209, 102').replace('--text-secondary', '139, 158, 176'),
          border: `1px solid ${modeColor.replace(')', ', 0.4)').replace('var(', 'rgba(').replace('--neon-green', '0, 255, 136').replace('--neon-cyan', '0, 229, 255').replace('--neon-blue', '68, 136, 255').replace('--status-purple', '199, 125, 255').replace('--text-yellow', '255, 209, 102').replace('--text-secondary', '139, 158, 176')}`,
        }}
        key={displayMode}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
      >
        {displayMode}
      </motion.div>

      <div className="hidden md:block flex-1" />

      {/* Mode hints */}
      <AnimatePresence mode="wait">
        {hudMode !== 'hidden' && (
          <motion.div
            key={mode + hudMode}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="hidden md:flex items-center gap-2 font-jetbrains text-[11px]"
            style={{ color: 'var(--text-muted)' }}
          >
            {hudMode === 'training' ? (
              <>
                <span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>q</span><span>quit</span>
                <span style={{ color: 'var(--border-subtle)' }}>|</span>
                <span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>h/j/k/l</span><span>navigate</span>
                <span style={{ color: 'var(--border-subtle)' }}>|</span>
                <span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>/</span><span>search</span>
                <span style={{ color: 'var(--border-subtle)' }}>|</span>
                <span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>n/N</span><span>next/prev</span>
                <span style={{ color: 'var(--border-subtle)' }}>|</span>
                <span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>Space</span><span>page</span>
              </>
            ) : (
              <>
                {mode === 'shell' && <><span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>Ctrl+C</span><span>interrupt</span><span style={{ color: 'var(--border-subtle)' }}>|</span><span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>Ctrl+D</span><span>EOF</span><span style={{ color: 'var(--border-subtle)' }}>|</span><span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>&#8593;</span><span>history</span></>}
                {(mode.startsWith('less') || mode === 'man') && <><span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>q</span><span>quit</span><span style={{ color: 'var(--border-subtle)' }}>|</span><span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>/</span><span>search</span><span style={{ color: 'var(--border-subtle)' }}>|</span><span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>Space</span><span>page</span></>}
                {mode.startsWith('vim') && <><span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>i</span><span>insert</span><span style={{ color: 'var(--border-subtle)' }}>|</span><span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>:q</span><span>quit</span><span style={{ color: 'var(--border-subtle)' }}>|</span><span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>:wq</span><span>save+quit</span></>}
                {mode === 'nano' && <><span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>Ctrl+O</span><span>save</span><span style={{ color: 'var(--border-subtle)' }}>|</span><span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>Ctrl+X</span><span>exit</span></>}
                {mode === 'tmux' && <><span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>Ctrl+b</span><span>prefix</span><span style={{ color: 'var(--border-subtle)' }}>|</span><span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>c</span><span>new</span><span style={{ color: 'var(--border-subtle)' }}>|</span><span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>d</span><span>detach</span></>}
                {mode === 'node' && <><span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>.exit</span><span>quit</span><span style={{ color: 'var(--border-subtle)' }}>|</span><span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>.help</span><span>help</span></>}
                {mode === 'python' && <><span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>exit()</span><span>quit</span><span style={{ color: 'var(--border-subtle)' }}>|</span><span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>help()</span><span>help</span></>}
                {mode === 'psql' && <><span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>\q</span><span>quit</span><span style={{ color: 'var(--border-subtle)' }}>|</span><span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>\l</span><span>list</span></>}
                {mode === 'sqlite' && <><span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>.exit</span><span>quit</span><span style={{ color: 'var(--border-subtle)' }}>|</span><span className="px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>.tables</span><span>tables</span></>}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={onCycleHudMode}
        className="flex-shrink-0 min-h-11 min-w-11 inline-flex items-center justify-center rounded-sm text-[var(--text-muted)] hover:text-[var(--neon-cyan)] hover:bg-[var(--bg-input)] transition-all"
        title="Cycle HUD mode (hidden/contextual/training)"
        aria-label="Cycle HUD mode"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
          <circle cx="5" cy="12" r="1" />
        </svg>
      </button>
    </div>
  )
}
