import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, Zap, ChevronRight, Terminal, AlertTriangle, Eye, Keyboard, Target, Lightbulb, CornerDownLeft } from 'lucide-react'
import type { MissionLevel } from '@/engine/levels'

interface BriefingModalProps {
  level: MissionLevel | null
  isOpen: boolean
  onStart: () => void
  onClose: () => void
}

const TYPE_COLORS: Record<string, string> = {
  academy: 'var(--neon-green)',
  operation: 'var(--neon-cyan)',
  nightmare: 'var(--status-purple)',
  redzone: 'var(--status-danger)',
}

const TYPE_LABELS: Record<string, string> = {
  academy: 'ACADEMY',
  operation: 'OPERATION',
  nightmare: 'NIGHTMARE',
  redzone: 'RED ZONE',
}

const COMMON_COMMANDS: Record<string, string[]> = {
  Filesystem: ['ls', 'cd', 'pwd', 'cat', 'touch', 'mkdir', 'rm', 'cp', 'mv'],
  Shell: ['echo', 'whoami', 'env', 'export', 'history', 'clear'],
  Git: ['git status', 'git log', 'git add', 'git commit', 'git diff', 'git branch'],
  Vim: ['vim', ':q', ':wq', ':q!', 'i', 'Esc'],
  Network: ['ping', 'curl', 'netstat', 'ssh', 'wget'],
  Process: ['ps', 'top', 'kill', 'killall'],
  Docker: ['docker ps', 'docker logs', 'docker exec', 'docker run'],
  Security: ['chmod', 'chown', 'sudo', 'find'],
  tmux: ['tmux', 'tmux new', 'tmux attach', 'Ctrl-b d'],
  'Text Processing': ['grep', 'sed', 'awk', 'sort', 'uniq', 'wc'],
  Services: ['systemctl', 'service', 'journalctl'],
}

function getExampleCommands(level: MissionLevel): string[] {
  const cmds: string[] = []
  for (const skill of level.skills) {
    const skillCmds = COMMON_COMMANDS[skill]
    if (skillCmds) cmds.push(...skillCmds)
  }
  return cmds.length > 0 ? cmds.slice(0, 8) : ['ls', 'cd', 'pwd', 'cat', 'echo', 'whoami']
}

export default function BriefingModal({ level, isOpen, onStart, onClose }: BriefingModalProps) {
  // Default to "How to Play" tab for easy levels (first-time players)
  const isFirstTime = level ? level.difficulty <= 1 : false
  const [step, setStep] = useState(isFirstTime ? 3 : 0)

  if (!level) return null

  const typeColor = TYPE_COLORS[level.mode] || 'var(--neon-green)'
  const typeLabel = TYPE_LABELS[level.mode] || 'ACADEMY'

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[35] flex items-center justify-center px-4"
          style={{ backgroundColor: 'rgba(10, 14, 20, 0.8)', backdropFilter: 'blur(4px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-[560px] rounded-lg overflow-hidden"
            style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header stripe */}
            <div className="h-1 w-full" style={{ backgroundColor: typeColor }} />

            <div className="p-6">
              {/* Type badge */}
              <div className="flex items-center justify-between mb-4">
                <span
                  className="font-jetbrains text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full"
                  style={{ color: typeColor, border: `1px solid ${typeColor}40`, backgroundColor: typeColor + '15' }}
                >
                  {typeLabel}
                </span>
                <button
                  onClick={onClose}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  aria-label="Close briefing"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Title */}
              <h2 className="font-jetbrains text-h2 mb-1" style={{ color: 'var(--text-primary)' }}>
                {level.getTitle('en')}
              </h2>
              <p className="font-jetbrains text-body-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                {level.chapter_id}: {level.chapter_title_en}
              </p>

              {/* Meta info */}
              <div className="flex items-center gap-4 mb-6">
                <div className="flex items-center gap-1.5">
                  <Zap size={14} style={{ color: 'var(--status-warning)' }} />
                  <span className="font-jetbrains text-body-sm" style={{ color: 'var(--text-secondary)' }}>
                    {Array(level.difficulty).fill('&#9733;').join('')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock size={14} style={{ color: 'var(--neon-cyan)' }} />
                  <span className="font-jetbrains text-body-sm" style={{ color: 'var(--text-secondary)' }}>{level.estimated_time}</span>
                </div>
              </div>

              {/* Content tabs */}
              <div className="flex gap-2 mb-4 flex-wrap">
                {['Story', 'Mission', 'Parameters', 'How to Play'].map((label, i) => (
                  <button
                    key={label}
                    onClick={() => setStep(i)}
                    className="font-jetbrains text-body-sm px-3 py-1.5 rounded-md transition-all"
                    style={{
                      color: step === i ? 'var(--text-primary)' : 'var(--text-secondary)',
                      backgroundColor: step === i ? 'var(--bg-input)' : 'transparent',
                      border: `1px solid ${step === i ? 'var(--border-active)' : 'transparent'}`,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="min-h-[100px]">
                <AnimatePresence mode="wait">
                  {step === 0 && (
                    <motion.p
                      key="story"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.2 }}
                      className="font-inter text-body leading-relaxed italic"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {level.story.getBriefing('en')}
                    </motion.p>
                  )}
                  {step === 1 && (
                    <motion.div
                      key="mission"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <p className="font-jetbrains text-body" style={{ color: 'var(--text-primary)' }}>
                        {level.getSummary('en')}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {level.skills.map(skill => (
                          <span
                            key={skill}
                            className="font-jetbrains text-[10px] font-semibold uppercase px-2 py-1 rounded-full"
                            style={{
                              color: `var(--skill-${skill.toLowerCase()}, var(--neon-green))`,
                              border: `1px solid var(--skill-${skill.toLowerCase()}, var(--neon-green))30`,
                              backgroundColor: `var(--skill-${skill.toLowerCase()}, var(--neon-green))10`,
                            }}
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  )}
                  {step === 2 && (
                    <motion.div
                      key="params"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-2"
                    >
                      {level.objectives.map((obj, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <Terminal size={12} className="mt-1 flex-shrink-0" style={{ color: obj.required ? 'var(--neon-cyan)' : 'var(--text-muted)' }} />
                          <span className="font-jetbrains text-body-sm" style={{ color: 'var(--text-primary)' }}>
                            {obj.required && <span style={{ color: 'var(--neon-cyan)' }}>[Required] </span>}
                            {obj.getLabel('en')}
                          </span>
                        </div>
                      ))}
                      {(level.redCommands ?? []).length > 0 && (
                        <div className="mt-3 p-2.5 rounded-md" style={{ backgroundColor: 'rgba(255, 71, 87, 0.06)', border: '1px solid rgba(255, 71, 87, 0.2)' }}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <AlertTriangle size={12} style={{ color: 'var(--status-danger)' }} />
                            <span className="font-jetbrains text-[10px] font-semibold uppercase" style={{ color: 'var(--status-danger)' }}>Restricted Commands</span>
                          </div>
                          <p className="font-jetbrains text-body-sm" style={{ color: 'var(--status-danger)' }}>
                            {(level.redCommands ?? []).join(', ')}
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}
                  {step === 3 && (
                    <motion.div
                      key="howtoplay"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-4"
                    >
                      <p className="font-jetbrains text-body leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                        This is a <strong style={{ color: 'var(--neon-cyan)' }}>terminal command training game</strong>. You will use a simulated terminal to complete objectives.
                      </p>

                      {/* Step-by-step guide */}
                      <div className="space-y-3">
                        {[
                          { icon: Eye, color: '#00E5FF', text: 'Read the objectives on the left panel' },
                          { icon: Keyboard, color: '#C77DFF', text: 'Type commands in the terminal below' },
                          { icon: Target, color: '#00FF88', text: 'Complete all objectives to finish the mission' },
                          { icon: Lightbulb, color: '#FFD166', text: 'Use the ? hint button in the top bar if stuck' },
                        ].map((item, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-8 h-8 rounded-md flex-shrink-0" style={{ backgroundColor: item.color + '15' }}>
                              <item.icon size={16} style={{ color: item.color }} />
                            </div>
                            <span className="font-jetbrains text-body-sm" style={{ color: 'var(--text-secondary)' }}>
                              <span style={{ color: item.color }}>{i + 1}.</span> {item.text}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Example commands for this level */}
                      <div>
                        <p className="font-jetbrains text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                          Common Commands for This Mission
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {getExampleCommands(level).map(cmd => (
                            <code
                              key={cmd}
                              className="font-jetbrains text-[11px] px-2 py-1 rounded"
                              style={{
                                backgroundColor: 'var(--bg-input)',
                                color: 'var(--neon-green)',
                                border: '1px solid var(--border-subtle)',
                              }}
                            >
                              {cmd}
                            </code>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={() => setStep(1)}
                        className="flex items-center gap-2 font-jetbrains text-body-sm px-4 py-2 rounded-md transition-all"
                        style={{
                          backgroundColor: 'var(--neon-green)',
                          color: '#0A0E14',
                        }}
                      >
                        <CornerDownLeft size={14} />
                        Got it! Show me the Mission
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Action button */}
              <div className="mt-6 flex justify-end">
                <motion.button
                  onClick={onStart}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-md font-jetbrains text-body font-semibold transition-all"
                  style={{
                    backgroundColor: typeColor,
                    color: '#0A0E14',
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Begin Mission
                  <ChevronRight size={16} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
