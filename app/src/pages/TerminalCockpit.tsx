import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { HelpCircle, ArrowLeft, Timer, Trophy } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { VFS, type VNode } from '@/engine/vfs'
import { ShellEngine } from '@/engine/shell'
import { getLevelById } from '@/engine/levels'
import { validateMission, calculateScore, isMissionComplete, type ValidationResult, type MissionState } from '@/engine/validator'
import { createHintState, revealHint, getTotalPenalty } from '@/engine/hints'

import TerminalEmulator, { type TerminalAction } from '@/components/terminal/TerminalEmulator'
import ObjectivesPanel from '@/components/terminal/ObjectivesPanel'
import ModeHUD from '@/components/terminal/ModeHUD'
import HintPanel from '@/components/terminal/HintPanel'
import RedCommandWarning from '@/components/terminal/RedCommandWarning'
import BriefingModal from '@/components/terminal/BriefingModal'
import TutorialOverlay from '@/components/terminal/TutorialOverlay'
import TerminalHelpTip from '@/components/terminal/TerminalHelpTip'

type CockpitPhase = 'loading' | 'briefing' | 'active' | 'completed' | 'failed'
type HudHintMode = 'hidden' | 'contextual' | 'training'

interface CockpitState {
  phase: CockpitPhase
  mode: string
  score: number
  timerSeconds: number
  commandCount: number
  redCommandsUsed: string[]
  commandHistory: string[]
  completedObjectiveIds: Set<string>
  hintsRevealed: Set<number>
  hintState: ReturnType<typeof createHintState>
  hudHintMode: HudHintMode
  isHintPanelOpen: boolean
  isObjectivesCollapsed: boolean
  successPulse: boolean
  lastRedCommand: string
  showRedWarning: boolean
  showTutorial: boolean
  showTerminalHelp: boolean
}

function createInitialCockpitState(phase: CockpitState['phase'] = 'loading'): CockpitState {
  return {
    phase,
    mode: 'shell',
    score: 0,
    timerSeconds: 0,
    commandCount: 0,
    redCommandsUsed: [],
    commandHistory: [],
    completedObjectiveIds: new Set(),
    hintsRevealed: new Set(),
    hintState: createHintState(),
    hudHintMode: 'contextual',
    isHintPanelOpen: false,
    isObjectivesCollapsed: false,
    successPulse: false,
    lastRedCommand: '',
    showRedWarning: false,
    showTutorial: false,
    showTerminalHelp: true,
  }
}

const TYPE_COLORS: Record<string, string> = {
  academy: '#00FF88',
  operation: '#00E5FF',
  nightmare: '#C77DFF',
  boss: '#C77DFF',
  redzone: '#FF4757',
}

const TYPE_LABELS: Record<string, string> = {
  academy: 'ACADEMY',
  operation: 'OPERATION',
  nightmare: 'NIGHTMARE',
  boss: 'BOSS',
  redzone: 'RED ZONE',
}

function consumeFirstRunTutorial(): boolean {
  const key = 'ghostops_tutorial_seen'
  try {
    if (localStorage.getItem(key) === 'true') return false
    localStorage.setItem(key, 'true')
    return true
  } catch {
    // Storage may be unavailable in a hardened browser. Showing the tutorial
    // again is safer than blocking mission start.
    return true
  }
}

export default function TerminalCockpit() {
  const { missionId } = useParams<{ missionId: string }>()
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const language: 'en' | 'zh' = i18n.resolvedLanguage?.startsWith('zh') ? 'zh' : 'en'
  const labels = language === 'zh'
    ? {
        dashboard: '控制台',
        missionNotFound: '未找到任务',
        returnToMissions: '返回任务面板',
        connected: '已连接',
        hints: '切换提示面板',
        expandObjectives: '展开任务目标',
        missionComplete: '任务完成',
        time: '用时',
        score: '得分',
        commandsUsed: '使用命令数',
        requiredObjectives: '必需目标',
        viewDebrief: '查看复盘',
        replay: '重新挑战',
      }
    : {
        dashboard: 'Dashboard',
        missionNotFound: 'Mission Not Found',
        returnToMissions: 'Return to Mission Board',
        connected: 'Connected',
        hints: 'Toggle hint panel',
        expandObjectives: 'Expand objectives',
        missionComplete: 'Mission Complete',
        time: 'Time',
        score: 'Score',
        commandsUsed: 'Commands Used',
        requiredObjectives: 'Required Objectives',
        viewDebrief: 'View Debrief',
        replay: 'Replay',
      }
  const level = useMemo(() => getLevelById(missionId || ''), [missionId])

  const vfsRef = useRef(new VFS())
  const shellRef = useRef<ShellEngine | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const redWarningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const validationResultsRef = useRef<ValidationResult[]>([])
  const validationTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const missionCompleteRef = useRef(false)
  const successfulActionHistoryRef = useRef<string[]>([])
  const attemptedActionHistoryRef = useRef<string[]>([])

  function getVfsStateSnapshot(): Record<string, string> {
    try {
      const vfs = vfsRef.current
      // Recursively walk VFS and collect file contents
      const files: Record<string, string> = {}
      const walk = (node: VNode, path: string) => {
        if (!node) return
        if (node.type === 'file' && node.content !== undefined) {
          files[path] = node.content
        }
        if (node.children) {
          node.children.forEach((child, name) => {
            walk(child, path ? `${path}/${name}` : name)
          })
        }
      }
      const { root } = vfs as unknown as { root: VNode }
      walk(root, '')
      return files
    } catch {
      return {}
    }
  }

  const [state, setState] = useState<CockpitState>(() => createInitialCockpitState())
  const stateRef = useRef(state)
  const [shell, setShell] = useState<ShellEngine | null>(null)
  const [runVersion, setRunVersion] = useState(0)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  // Initialize shell and load level
  useEffect(() => {
    if (!level) return
    const vfs = new VFS()
    vfsRef.current = vfs
    const nextShell = new ShellEngine(vfs, undefined, (cmd) => {
      setState(s => {
        if (s.redCommandsUsed.includes(cmd)) return s
        return {
          ...s,
          lastRedCommand: cmd,
          showRedWarning: true,
          redCommandsUsed: [...s.redCommandsUsed, cmd],
       }
     })
      if (redWarningTimeoutRef.current) clearTimeout(redWarningTimeoutRef.current)
      redWarningTimeoutRef.current = setTimeout(() => {
        setState(s => ({ ...s, showRedWarning: false }))
     }, 4000)
   })
    shellRef.current = nextShell
    setShell(nextShell)

    if (level.startingState?.cwd) {
      nextShell.state.cwd = [...level.startingState.cwd]
      nextShell.state.env.PWD = '/' + level.startingState.cwd.join('/')
    }
    if (level.startingState?.env) {
      Object.assign(nextShell.state.env, level.startingState.env)
   }
    // Git lessons model work inside an existing repository. Initialize that
    // repository silently so the first taught command (for example `git status`)
    // can succeed without requiring an undocumented prerequisite.
    if (level.chapter_skill.toLowerCase() === 'git') {
      nextShell.execute('git init', 0, false)
    }

    // Populate VFS files from starting state
    // (VFS already initialized with default files)

    setState(createInitialCockpitState('briefing'))
    missionCompleteRef.current = false
    validationResultsRef.current = []
    successfulActionHistoryRef.current = []
    attemptedActionHistoryRef.current = []
    validationTimersRef.current.forEach(t => clearTimeout(t))
    validationTimersRef.current = []

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (redWarningTimeoutRef.current) clearTimeout(redWarningTimeoutRef.current)
      validationTimersRef.current.forEach(t => clearTimeout(t))
      validationTimersRef.current = []
      timerRef.current = null
      redWarningTimeoutRef.current = null
   }
  }, [level, runVersion])

  // Timer
  useEffect(() => {
    if (state.phase === 'active') {
      timerRef.current = setInterval(() => {
        setState(s => ({ ...s, timerSeconds: s.timerSeconds + 1 }))
     }, 1000)
   }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
   }
 }, [state.phase])

  const handleCommandExecuted = useCallback((action: TerminalAction) => {
    const { command, exitCode } = action
    attemptedActionHistoryRef.current = [...attemptedActionHistoryRef.current, command]
    if (exitCode === 0) {
      successfulActionHistoryRef.current = [...successfulActionHistoryRef.current, command]
    }

    // Step 1: Update command history immediately
    setState(s => ({
      ...s,
      commandHistory: [...attemptedActionHistoryRef.current],
      commandCount: s.commandCount + 1,
      showTerminalHelp: false,
      showTutorial: false,
    }))

    // Step 2: After state settles, run validation
    const validationTimer = setTimeout(() => {
      if (!level || !shellRef.current) return

      // Build mission state from CURRENT refs
      const currentCmdHistory = [...successfulActionHistoryRef.current]
      const missionState: MissionState = {
        commandHistory: currentCmdHistory,
        attemptedCommandHistory: [...attemptedActionHistoryRef.current],
        gitState: shellRef.current.gitState,
        vfs: { files: getVfsStateSnapshot() },
        redCommandsUsed: [],
        hintsUsed: 0,
        objectivesCompleted: new Set(),
      }

      const currentState = stateRef.current
      const currentTimerSeconds = currentState.timerSeconds
      const currentCommandCount = attemptedActionHistoryRef.current.length
      missionState.redCommandsUsed = [...currentState.redCommandsUsed]
      missionState.hintsUsed = currentState.hintsRevealed.size
      missionState.objectivesCompleted = new Set(currentState.completedObjectiveIds)

      try {
        const results = validateMission(level, missionState)
        validationResultsRef.current = results
        const completedIds = new Set(results.filter(r => r.completed).map(r => r.objectiveId))
        missionState.objectivesCompleted = completedIds

        // Step 3: Update completed objectives and pulse
        setState(s => ({ ...s, completedObjectiveIds: completedIds, successPulse: true }))

        // Step 4: Check mission completion (separate setState)
        if (isMissionComplete(level, results) && !missionCompleteRef.current) {
          missionCompleteRef.current = true
          const scoreResult = calculateScore(level, results, missionState, currentTimerSeconds, currentCommandCount)
          const completionTimer = setTimeout(() => {
            setState(s2 => ({ ...s2, phase: 'completed', score: scoreResult.total }))
          }, 500)
          validationTimersRef.current.push(completionTimer)
        }

        // Step 5: Clear success pulse
        const pulseTimer = setTimeout(() => {
          setState(s => ({ ...s, successPulse: false }))
        }, 600)
        validationTimersRef.current.push(pulseTimer)
      } catch (err) {
        console.error('Validation error:', err)
      }
    }, 100)

    validationTimersRef.current.push(validationTimer)
  }, [level])

  const handleModeChange = useCallback((mode: string) => {
    setState(s => ({ ...s, mode }))
  }, [])

  const handleStartMission = useCallback(() => {
    const showTutorial = consumeFirstRunTutorial()
    setState(s => ({ ...s, phase: 'active', showTutorial }))
    if (!showTutorial) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('[aria-label="Terminal input"]')?.focus()
      })
    }
  }, [])

  const handleCloseBriefing = useCallback(() => {
    navigate('/missions')
  }, [navigate])

  const handleDismissTutorial = useCallback(() => {
    setState(s => ({ ...s, showTutorial: false }))
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[aria-label="Terminal input"]')?.focus()
    })
  }, [])

  const handleReplay = useCallback(() => {
    setRunVersion(version => version + 1)
  }, [])

  const handleToggleHintPanel = useCallback(() => {
    setState(s => ({ ...s, isHintPanelOpen: !s.isHintPanelOpen }))
 }, [])

  const handleRevealHint = useCallback((hintLevel: number) => {
    setState(s => ({
      ...s,
      hintsRevealed: new Set([...s.hintsRevealed, hintLevel]),
      hintState: revealHint(s.hintState, hintLevel),
   }))
 }, [])

  const handleCycleHudMode = useCallback(() => {
    setState(s => ({
      ...s,
      hudHintMode: s.hudHintMode === 'hidden' ? 'contextual' : s.hudHintMode === 'contextual' ? 'training' : 'hidden',
   }))
 }, [])

  const handleToggleObjectives = useCallback(() => {
    setState(s => ({ ...s, isObjectivesCollapsed: !s.isObjectivesCollapsed }))
 }, [])

  // Format timer
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
 }

  if (!level) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="text-center">
          <h1 className="font-jetbrains text-h3 mb-4" style={{ color: 'var(--text-primary)' }}>
            {labels.missionNotFound}
          </h1>
          <button
            onClick={() => navigate('/missions')}
            className="px-4 py-2 rounded-md font-jetbrains text-body transition-colors"
            style={{ backgroundColor: 'var(--neon-cyan)', color: '#0A0E14' }}
          >
            {labels.returnToMissions}
          </button>
        </div>
      </div>
    )
 }

  const typeColor = TYPE_COLORS[level.mode] || '#00FF88'
  const typeLabel = TYPE_LABELS[level.mode] || 'ACADEMY'
  const requiredObjectives = level.objectives.filter(objective => objective.required)
  const completedRequiredCount = requiredObjectives.filter(objective => state.completedObjectiveIds.has(objective.id)).length
  const requiredProgress = completedRequiredCount / Math.max(1, requiredObjectives.length)

  const cwd = shell ? '/' + shell.state.cwd.join('/') : '/home/ghost'
  const gitBranch = shell?.gitState.initialized ? shell.gitState.currentBranch : null
  const gitDirty = Boolean(
    shell?.gitState.initialized
    && (shell.gitState.workingDirectory.size > 0 || shell.gitState.stagingArea.size > 0),
  )

  return (
    <div className="flex flex-col h-[calc(100dvh-52px)]" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <h1 className="sr-only">{level.getTitle(language)}</h1>
      {/* Cockpit Header */}
      <div
        className="flex items-center gap-2 sm:gap-4 px-2 sm:px-4 h-12 flex-shrink-0 border-b"
        style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-subtle)' }}
      >
        <button
          onClick={() => navigate('/')}
          className="min-h-11 flex items-center gap-1 px-2 font-jetbrains text-code-sm transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--neon-cyan)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)' }}
        >
          <ArrowLeft size={14} />
          <span className="hidden sm:inline">{labels.dashboard}</span>
        </button>

        <span
          className="font-jetbrains text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{ color: typeColor, border: `1px solid ${typeColor}40` }}
        >
          {typeLabel}
        </span>

        <span
          className="font-jetbrains text-code-sm truncate max-w-[200px]"
          style={{ color: 'var(--text-primary)' }}
          title={level.getTitle(language)}
        >
          {level.getTitle(language)}
        </span>

        <div className="flex-1" />

        {/* Timer */}
        <div className="flex items-center gap-1.5">
          <Timer size={14} style={{ color: 'var(--text-secondary)' }} />
          <span className="font-jetbrains text-code-sm tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            {formatTime(state.timerSeconds)}
          </span>
        </div>

        {/* Score */}
        <div className="flex items-center gap-1.5">
          <Trophy size={14} style={{ color: 'var(--neon-green)' }} />
          <span className="font-jetbrains text-code-sm tabular-nums" style={{ color: 'var(--neon-green)' }}>
            {state.score}
          </span>
        </div>

        {/* Mode indicator */}
        <motion.div
          key={state.mode}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: state.mode === 'shell' ? 'rgba(0, 255, 136, 0.1)' : 'rgba(0, 229, 255, 0.1)',
            border: `1px solid ${state.mode === 'shell' ? 'rgba(0, 255, 136, 0.3)' : 'rgba(0, 229, 255, 0.3)'}`,
         }}
        >
          <span className="font-jetbrains text-[10px] font-semibold uppercase" style={{ color: state.mode === 'shell' ? 'var(--neon-green)' : 'var(--neon-cyan)' }}>
            {state.mode.toUpperCase()}
          </span>
        </motion.div>

        {/* Connection status */}
        <div className="hidden sm:flex items-center gap-1.5" title={labels.connected}>
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#00FF88' }} />
          <span className="hidden md:inline font-jetbrains text-[10px]" style={{ color: 'var(--text-muted)' }}>{labels.connected}</span>
        </div>

        {/* Hint button */}
        <button
          onClick={handleToggleHintPanel}
          className="relative min-h-11 min-w-11 inline-flex items-center justify-center rounded-md transition-all"
          style={{
            backgroundColor: state.isHintPanelOpen ? 'var(--bg-hover)' : 'var(--bg-input)',
            border: `1px solid ${state.isHintPanelOpen ? 'var(--neon-cyan)' : 'var(--border-subtle)'}`,
            color: state.isHintPanelOpen ? 'var(--neon-cyan)' : 'var(--text-muted)',
         }}
          aria-label={labels.hints}
          aria-expanded={state.isHintPanelOpen}
        >
          <HelpCircle size={16} />
          {state.hintsRevealed.size === 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--status-danger)' }} />
          )}
        </button>
      </div>

      {/* Main cockpit area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left panel - Objectives */}
        {!state.isObjectivesCollapsed && (
          <ObjectivesPanel
            objectives={level.objectives}
            completedIds={state.completedObjectiveIds}
            progress={requiredProgress}
            isCollapsed={state.isObjectivesCollapsed}
            onToggleCollapse={handleToggleObjectives}
          />
        )}
        {state.isObjectivesCollapsed && (
          <div
            className="flex flex-col items-center py-4 gap-4 border-r"
            style={{ width: 44, minWidth: 44, backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}
          >
            <button
              onClick={handleToggleObjectives}
              className="min-h-11 min-w-11 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--neon-cyan)] transition-colors"
              aria-label={labels.expandObjectives}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </div>
        )}

        {/* Center - Terminal */}
        <div className="flex-1 relative flex flex-col min-w-0">
          <div className="flex-1 relative">
            {shell ? (
              <TerminalEmulator
                shell={shell}
                onModeChange={handleModeChange}
                onCommandExecuted={handleCommandExecuted}
                successPulse={state.successPulse}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="w-6 h-6 border-2 border-[#00E5FF] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <RedCommandWarning isActive={state.showRedWarning} command={state.lastRedCommand} />
          </div>

          {/* Mode HUD */}
          <ModeHUD
            mode={state.mode}
            cwd={cwd}
            gitBranch={gitBranch}
            gitDirty={gitDirty}
            processName={state.mode === 'shell' ? 'bash' : state.mode}
            tmuxSession={state.mode === 'tmux' ? 'session-0' : null}
            hudMode={state.hudHintMode}
            onCycleHudMode={handleCycleHudMode}
          />
        </div>
      </div>

      {/* Hint Panel Overlay */}
      <HintPanel
        isOpen={state.isHintPanelOpen}
        onClose={handleToggleHintPanel}
        hints={level.hints}
        revealedLevels={state.hintsRevealed}
        onRevealHint={handleRevealHint}
        hintsUsed={state.hintsRevealed.size}
        totalPenalty={getTotalPenalty(level.hints, state.hintState)}
      />

      {/* Briefing Modal */}
      <BriefingModal
        key={level.id}
        level={level}
        isOpen={state.phase === 'briefing'}
        onStart={handleStartMission}
        onClose={handleCloseBriefing}
      />

      {/* Tutorial Overlay - shown when mission starts */}
      <TutorialOverlay
        isVisible={state.showTutorial}
        onDismiss={handleDismissTutorial}
      />

      {/* Terminal Help Tip - shown until first command */}
      <TerminalHelpTip visible={state.showTerminalHelp && state.phase === 'active'} />

      {/* Mission Complete Overlay */}
      <AnimatePresence>
        {state.phase === 'completed' && (
          <motion.div
            className="fixed inset-0 z-[30] flex items-center justify-center px-4"
            style={{ backgroundColor: 'rgba(10, 14, 20, 0.9)', backdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-[480px] rounded-lg p-8"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="mission-complete-title"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
            >
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 255, 136, 0.12)', border: '2px solid var(--neon-green)' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--neon-green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              </div>
              <h2 id="mission-complete-title" className="font-jetbrains text-h1 text-center mb-1" style={{ color: 'var(--neon-green)' }}>
                {labels.missionComplete}
              </h2>
              <p className="font-jetbrains text-h3 text-center mb-6" style={{ color: 'var(--text-primary)' }}>
                {level.getTitle(language)}
              </p>

              <div className="grid grid-cols-2 gap-4 mb-6">
                {[
                  { label: labels.time, value: formatTime(state.timerSeconds) },
                  { label: labels.score, value: `${state.score} / 100` },
                  { label: labels.commandsUsed, value: String(state.commandCount) },
                  { label: labels.requiredObjectives, value: `${completedRequiredCount}/${requiredObjectives.length}` },
                ].map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    className="p-3 rounded-md text-center"
                    style={{ backgroundColor: 'var(--bg-tertiary)' }}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.1, duration: 0.3 }}
                  >
                    <p className="font-jetbrains text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
                    <p className="font-jetbrains text-code font-semibold" style={{ color: 'var(--text-primary)' }}>{stat.value}</p>
                  </motion.div>
                ))}
              </div>

              <div className="flex justify-center gap-3">
                <button
                  onClick={() => navigate(`/debrief/${missionId}`)}
                  className="min-h-11 px-5 py-2.5 rounded-md font-jetbrains text-body font-semibold transition-all"
                  style={{ backgroundColor: 'var(--neon-green)', color: '#0A0E14' }}
                  autoFocus
                >
                  {labels.viewDebrief} &rarr;
                </button>
                <button
                  onClick={handleReplay}
                  className="min-h-11 px-4 py-2.5 rounded-md font-jetbrains text-body transition-colors"
                  style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
                >
                  {labels.replay}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
