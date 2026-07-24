import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, Zap, ChevronRight, Terminal, AlertTriangle, Eye, Keyboard, Target, Lightbulb, CornerDownLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
  boss: 'var(--status-danger)',
  nightmare: 'var(--status-purple)',
}

const TYPE_LABELS: Record<'en' | 'zh', Record<string, string>> = {
  en: {
    academy: 'ACADEMY',
    operation: 'OPERATION',
    boss: 'BOSS',
    nightmare: 'NIGHTMARE',
  },
  zh: {
    academy: '学院',
    operation: '行动',
    boss: '首领战',
    nightmare: '梦魇',
  },
}

const BRIEFING_COPY = {
  en: {
    close: 'Close mission briefing',
    tabs: ['Story', 'Mission', 'Parameters', 'How to Play'],
    required: 'Required',
    restricted: 'Restricted Commands',
    howToPlay: 'This is a terminal command training game. Use the simulated terminal to complete the mission objectives.',
    steps: [
      'Read the objectives in the left panel',
      'Type commands in the terminal',
      'Complete every required objective',
      'Use the hint button in the top bar if you get stuck',
    ],
    commonCommands: 'Common Commands for This Mission',
    showMission: 'Got it! Show me the Mission',
    begin: 'Begin Mission',
    difficulty: (value: number) => `Difficulty: ${value} of 5`,
  },
  zh: {
    close: '关闭任务简报',
    tabs: ['故事', '任务', '参数', '玩法说明'],
    required: '必需',
    restricted: '受限命令',
    howToPlay: '这是一款终端命令训练游戏。请使用模拟终端完成全部任务目标。',
    steps: [
      '阅读左侧面板中的任务目标',
      '在终端中输入命令',
      '完成所有必需目标',
      '遇到困难时使用顶部栏的提示按钮',
    ],
    commonCommands: '本任务常用命令',
    showMission: '明白了，查看任务',
    begin: '开始任务',
    difficulty: (value: number) => `难度：5 级中的第 ${value} 级`,
  },
} as const

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
  const { i18n } = useTranslation()
  const language: 'en' | 'zh' = i18n.resolvedLanguage?.startsWith('zh') ? 'zh' : 'en'
  const copy = BRIEFING_COPY[language]
  const dialogRef = useRef<HTMLDivElement>(null)
  // Default to "How to Play" tab for easy levels (first-time players)
  const isFirstTime = level ? level.difficulty <= 1 : false
  const [step, setStep] = useState(isFirstTime ? 3 : 0)

  useEffect(() => {
    if (!isOpen) return
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const dialog = dialogRef.current
    const getFocusable = () => Array.from(
      dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    )
    const focusTimer = window.setTimeout(() => getFocusable()[0]?.focus(), 0)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = getFocusable()
      if (focusable.length === 0) {
        event.preventDefault()
        dialog?.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [isOpen, onClose])

  if (!level) return null

  const typeColor = TYPE_COLORS[level.mode] || 'var(--neon-green)'
  const typeLabel = TYPE_LABELS[language][level.mode] || level.mode.toUpperCase()
  const titleId = `briefing-title-${level.id}`
  const panelId = `briefing-panel-${level.id}`

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
            ref={dialogRef}
            className="w-full max-w-[560px] max-h-[calc(100dvh-2rem)] rounded-lg overflow-y-auto"
            style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
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
                  className="min-h-11 min-w-11 -mr-3 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  aria-label={copy.close}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Title */}
              <h2 id={titleId} className="font-jetbrains text-h2 mb-1" style={{ color: 'var(--text-primary)' }}>
                {level.getTitle(language)}
              </h2>
              <p className="font-jetbrains text-body-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                {level.chapter_id}: {language === 'zh' ? level.chapter_title_zh : level.chapter_title_en}
              </p>

              {/* Meta info */}
              <div className="flex items-center gap-4 mb-6">
                <div className="flex items-center gap-1.5">
                  <Zap size={14} style={{ color: 'var(--status-warning)' }} aria-hidden="true" />
                  <span
                    className="font-jetbrains text-body-sm"
                    style={{ color: 'var(--text-secondary)' }}
                    aria-label={copy.difficulty(level.difficulty)}
                  >
                    {'★'.repeat(level.difficulty)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock size={14} style={{ color: 'var(--neon-cyan)' }} aria-hidden="true" />
                  <span className="font-jetbrains text-body-sm" style={{ color: 'var(--text-secondary)' }}>{level.estimated_time}</span>
                </div>
              </div>

              {/* Content tabs */}
              <div className="flex gap-2 mb-4 flex-wrap" role="tablist">
                {copy.tabs.map((label, i) => (
                  <button
                    key={label}
                    onClick={() => setStep(i)}
                    className="min-h-11 font-jetbrains text-body-sm px-3 py-1.5 rounded-md transition-all"
                    role="tab"
                    aria-selected={step === i}
                    aria-controls={panelId}
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
              <div
                id={panelId}
                className="min-h-[100px]"
                role="tabpanel"
                aria-live="polite"
              >
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
                      {level.story.getBriefing(language)}
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
                        {level.getSummary(language)}
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
                      {level.objectives.map(obj => (
                        <div key={obj.id} className="flex items-start gap-2">
                          <Terminal size={12} className="mt-1 flex-shrink-0" style={{ color: obj.required ? 'var(--neon-cyan)' : 'var(--text-muted)' }} />
                          <span className="font-jetbrains text-body-sm" style={{ color: 'var(--text-primary)' }}>
                            {obj.required && <span style={{ color: 'var(--neon-cyan)' }}>[{copy.required}] </span>}
                            {obj.getLabel(language)}
                          </span>
                        </div>
                      ))}
                      {(level.redCommands ?? []).length > 0 && (
                        <div className="mt-3 p-2.5 rounded-md" style={{ backgroundColor: 'rgba(255, 71, 87, 0.06)', border: '1px solid rgba(255, 71, 87, 0.2)' }}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <AlertTriangle size={12} style={{ color: 'var(--status-danger)' }} />
                            <span className="font-jetbrains text-[10px] font-semibold uppercase" style={{ color: 'var(--status-danger)' }}>
                              {copy.restricted}
                            </span>
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
                        {copy.howToPlay}
                      </p>

                      {/* Step-by-step guide */}
                      <div className="space-y-3">
                        {[
                          { icon: Eye, color: '#00E5FF' },
                          { icon: Keyboard, color: '#C77DFF' },
                          { icon: Target, color: '#00FF88' },
                          { icon: Lightbulb, color: '#FFD166' },
                        ].map((item, i) => (
                          <div key={copy.steps[i]} className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-8 h-8 rounded-md flex-shrink-0" style={{ backgroundColor: item.color + '15' }}>
                              <item.icon size={16} style={{ color: item.color }} aria-hidden="true" />
                            </div>
                            <span className="font-jetbrains text-body-sm" style={{ color: 'var(--text-secondary)' }}>
                              <span style={{ color: item.color }}>{i + 1}.</span> {copy.steps[i]}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Example commands for this level */}
                      <div>
                        <p className="font-jetbrains text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                          {copy.commonCommands}
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
                        className="flex min-h-11 items-center gap-2 font-jetbrains text-body-sm px-4 py-2 rounded-md transition-all"
                        style={{
                          backgroundColor: 'var(--neon-green)',
                          color: '#0A0E14',
                        }}
                      >
                        <CornerDownLeft size={14} />
                        {copy.showMission}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Action button */}
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => onStart()}
                  className="flex min-h-11 items-center gap-2 px-5 py-2.5 rounded-md font-jetbrains text-body font-semibold transition-all"
                  style={{
                    backgroundColor: typeColor,
                    color: '#0A0E14',
                  }}
                >
                  {copy.begin}
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
