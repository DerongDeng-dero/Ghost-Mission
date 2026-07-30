import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Terminal as XTermType } from '@xterm/xterm'
import type { FitAddon as FitAddonType } from '@xterm/addon-fit'
import {
  MAX_SHELL_COMMAND_LENGTH,
  MAX_SHELL_HISTORY_ENTRIES,
  type ShellEngine,
  type ShellResult,
} from '@/engine/shell'
import {
  MAX_TERMINAL_PASTE_SUBMISSIONS,
  planTerminalInputChunk,
  truncateTextToUtf16Limit,
} from '@/lib/textSegmentation'

export interface TerminalAction {
  command: string
  exitCode: number
  kind: 'command' | 'interaction'
  successfulCommands?: string[]
}

interface TerminalEmulatorProps {
  shell: ShellEngine
  onModeChange: (mode: string) => void
  onCommandExecuted: (action: TerminalAction) => void
  successPulse: boolean
  initialJobScenario?: InitialJobScenario
}

const MAX_TERMINAL_OUTPUT_CODE_UNITS = 5_000
const REPL_MODES = ['node', 'python', 'psql', 'sqlite'] as const

type ReplMode = typeof REPL_MODES[number]
type CommandMode = 'shell' | 'tmux' | 'screen'
export type InitialJobScenario = 'none' | 'foreground' | 'stopped'

interface TerminalJob {
  id: number
  command: string
  state: 'running' | 'stopped'
  background: boolean
  hostMode: CommandMode
}

interface TmuxSessionState {
  exists: boolean
  name: string
  attached: boolean
  windows: number
  panes: number
}

interface TerminalModules {
  Terminal: typeof import('@xterm/xterm').Terminal
  FitAddon: typeof import('@xterm/addon-fit').FitAddon
  WebLinksAddon: typeof import('@xterm/addon-web-links').WebLinksAddon
}

let terminalModulesPromise: Promise<TerminalModules> | null = null

function loadTerminalModules(): Promise<TerminalModules> {
  if (terminalModulesPromise) return terminalModulesPromise

  const pendingLoad = (async () => {
    const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
      import('@xterm/addon-web-links'),
      import('@xterm/xterm/css/xterm.css'),
    ])
    return { Terminal, FitAddon, WebLinksAddon }
  })()

  terminalModulesPromise = pendingLoad
  void pendingLoad.catch(() => {
    // A rejected import Promise cannot be reused. Let the next retry perform a
    // fresh dynamic import instead of replaying the cached rejection forever.
    if (terminalModulesPromise === pendingLoad) terminalModulesPromise = null
  })
  return pendingLoad
}

function tokenizeCommandLine(line: string): string[] {
  const tokens: string[] = []
  let token = ''
  let quote: '"' | "'" | null = null
  let escaped = false

  const pushToken = () => {
    if (token) tokens.push(token)
    token = ''
  }

  for (const character of line.trim()) {
    if (escaped) {
      token += character
      escaped = false
      continue
    }
    if (character === '\\' && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (character === quote) quote = null
      else token += character
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (/\s/.test(character)) {
      pushToken()
      continue
    }
    token += character
  }

  if (escaped) token += '\\'
  pushToken()
  return tokens
}

function validateCommandLineSyntax(line: string): string | null {
  let quote: '"' | "'" | null = null
  let escaped = false
  for (const character of line) {
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\' && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") quote = character
  }
  if (escaped) return 'bash: syntax error: trailing escape character\n'
  if (quote) return `bash: syntax error: unmatched ${quote} quote\n`
  return null
}

function quoteCommandToken(token: string): string {
  if (/^[\w./:@%+=,-]+$/.test(token)) return token
  return `"${token.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

function validateDatabaseLauncher(tokens: string[]): { mode: 'psql' | 'sqlite'; error?: string } {
  const command = tokens[0]?.toLowerCase()
  const args = tokens.slice(1)
  if (command === 'sqlite' || command === 'sqlite3') {
    if (args.length > 1) {
      return { mode: 'sqlite', error: `${command}: expected at most one database path\n` }
    }
    if (args[0]?.startsWith('-')) {
      return { mode: 'sqlite', error: `${command}: unsupported option: ${args[0]}\n` }
    }
    return { mode: 'sqlite' }
  }

  let databaseSeen = false
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '-U' || arg === '--username' || arg === '-d' || arg === '--dbname') {
      const value = args[++index]
      if (!value || value.startsWith('-')) {
        return { mode: 'psql', error: `psql: option ${arg} requires a value\n` }
      }
      if (arg === '-d' || arg === '--dbname') databaseSeen = true
      continue
    }
    if (arg.startsWith('--username=') || arg.startsWith('--dbname=')) {
      if (!arg.slice(arg.indexOf('=') + 1)) {
        return { mode: 'psql', error: `psql: option ${arg.split('=')[0]} requires a value\n` }
      }
      if (arg.startsWith('--dbname=')) databaseSeen = true
      continue
    }
    if (arg.startsWith('-')) {
      return { mode: 'psql', error: `psql: unsupported option: ${arg}\n` }
    }
    if (databaseSeen) {
      return { mode: 'psql', error: `psql: unexpected extra argument: ${arg}\n` }
    }
    databaseSeen = true
  }
  return { mode: 'psql' }
}

function parseTailFollowCommand(line: string) {
  const tokens = tokenizeCommandLine(line)
  if (tokens[0] !== 'tail') return null

  const background = tokens.at(-1) === '&'
  const commandTokens = background ? tokens.slice(0, -1) : tokens
  const validationTokens: string[] = ['tail']
  let follows = false
  let hasFileOperand = false

  for (let index = 1; index < commandTokens.length; index++) {
    const token = commandTokens[index]
    if (token === '-f' || token === '-F' || token === '--follow' || token.startsWith('--follow=')) {
      follows = true
      continue
    }
    validationTokens.push(token)
    if (token === '-n' || token === '--lines') {
      const count = commandTokens[index + 1]
      if (count) {
        validationTokens.push(count)
        index++
      }
      continue
    }
    if (!token.startsWith('-') && !['|', '>', '>>', '2>'].includes(token)) hasFileOperand = true
  }

  if (!follows) return null
  return {
    background,
    hasFileOperand,
    validationLine: validationTokens.map(quoteCommandToken).join(' '),
  }
}

function safeWrite(term: XTermType, data: string) {
  try { term.write(data) } catch { /* The terminal may already be disposed. */ }
}

function safeWriteLn(term: XTermType, data: string) {
  try { term.writeln(data) } catch { /* The terminal may already be disposed. */ }
}

function dropLastCodePoint(value: string): string {
  const codePoints = Array.from(value)
  codePoints.pop()
  return codePoints.join('')
}

export default function TerminalEmulator({
  shell,
  onModeChange,
  onCommandExecuted,
  successPulse,
  initialJobScenario = 'none',
}: TerminalEmulatorProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTermType | null>(null)
  const fitRef = useRef<FitAddonType | null>(null)
  const inputBufferRef = useRef('')
  const currentModeRef = useRef('shell')
  const tmuxPrefixRef = useRef(false)
  const screenPrefixRef = useRef(false)
  const shellRef = useRef(shell)

  // Callback refs keep the xterm instance stable while still using fresh props.
  const onModeChangeRef = useRef(onModeChange)
  const onCommandExecutedRef = useRef(onCommandExecuted)

  const [hasFocus, setHasFocus] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [readyTerminal, setReadyTerminal] = useState<{
    shell: ShellEngine
    scenario: typeof initialJobScenario
    attempt: number
  } | null>(null)
  const [terminalLoadFailure, setTerminalLoadFailure] = useState<{
    shell: ShellEngine
    scenario: typeof initialJobScenario
    attempt: number
  } | null>(null)

  const writePrompt = useCallback((term: XTermType) => {
    safeWrite(term, `\r\n${shellRef.current.getPrompt()}`)
  }, [])
  const writePromptRef = useRef(writePrompt)
  const loading = !readyTerminal
    || readyTerminal.shell !== shell
    || readyTerminal.scenario !== initialJobScenario
    || readyTerminal.attempt !== loadAttempt
  const loadFailed = terminalLoadFailure?.shell === shell
    && terminalLoadFailure.scenario === initialJobScenario
    && terminalLoadFailure.attempt === loadAttempt

  useEffect(() => {
    shellRef.current = shell
    onModeChangeRef.current = onModeChange
    onCommandExecutedRef.current = onCommandExecuted
    writePromptRef.current = writePrompt
  }, [onCommandExecuted, onModeChange, shell, writePrompt])

  useEffect(() => {
    let disposed = false
    let cleanedUp = false
    const cleanupTasks: Array<() => void> = []
    const cleanupFn = () => {
      if (cleanedUp) return
      cleanedUp = true
      for (let index = cleanupTasks.length - 1; index >= 0; index--) {
        try { cleanupTasks[index]() } catch { /* Continue rolling back the remaining resources. */ }
      }
      cleanupTasks.length = 0
    }
    inputBufferRef.current = ''
    currentModeRef.current = 'shell'
    tmuxPrefixRef.current = false
    screenPrefixRef.current = false

    const cbRef = {
      get onModeChange() { return onModeChangeRef.current },
      get onCommandExecuted() { return onCommandExecutedRef.current },
      get writePrompt() { return writePromptRef.current ?? writePrompt },
    }
    const jobs = new Map<number, TerminalJob>()
    let nextJobId = 1
    let foregroundJobId: number | null = null
    let replHostMode: CommandMode = 'shell'
    let tmuxHostMode: CommandMode = 'shell'
    let nodeInterruptCount = 0
    let nodeEditorLines: string[] = []
    let screenSessionName = ''
    let screenHostMode: CommandMode = 'shell'
    const screenFrameStack: Array<{ name: string; hostMode: CommandMode }> = []
    let flowPaused = false
    const terminalCommandHistory: string[] = []
    let heredocDelimiter = ''
    let heredocOriginal = ''
    let heredocHostMode: CommandMode = 'shell'
    let heredocLines: string[] = []
    if (initialJobScenario === 'foreground') {
      jobs.set(nextJobId, {
        id: nextJobId,
        command: 'tail -f /var/log/syslog',
        state: 'running',
        background: false,
        hostMode: 'shell',
      })
      foregroundJobId = nextJobId++
    } else if (initialJobScenario === 'stopped') {
      for (const command of [
        'tail -f /var/log/syslog',
        'tail -f /var/log/nginx/access.log',
        'tail -f /var/log/auth.log',
      ]) {
        jobs.set(nextJobId, {
          id: nextJobId,
          command,
          state: 'stopped',
          background: false,
          hostMode: 'shell',
        })
        nextJobId++
      }
    }
    const tmuxSession: TmuxSessionState = {
      exists: false,
      name: 'ghost',
      attached: false,
      windows: 1,
      panes: 1,
    }

    async function initTerminal() {
      const { Terminal, FitAddon, WebLinksAddon } = await loadTerminalModules()

      if (disposed || !containerRef.current) return
      const container = containerRef.current

      const term = new Terminal({
        fontFamily: '"Fira Code", monospace',
        fontSize: 13,
        lineHeight: 1.5,
        theme: {
          background: '#0C1117',
          foreground: '#E6DCCF',
          cursor: '#00E5FF',
          selectionBackground: 'rgba(0, 229, 255, 0.3)',
          black: '#0A0E14',
          red: '#FF4757',
          green: '#00FF88',
          yellow: '#FFD166',
          blue: '#4488FF',
          magenta: '#C77DFF',
          cyan: '#00E5FF',
          white: '#E8EDF2',
          brightBlack: '#788DA1',
          brightRed: '#FF6B6B',
          brightGreen: '#51FFB3',
          brightYellow: '#FFE08A',
          brightBlue: '#6AA5FF',
          brightMagenta: '#D9A3FF',
          brightCyan: '#57EDFF',
          brightWhite: '#FFFFFF',
        },
        cursorBlink: true,
        cursorStyle: 'block',
        scrollback: 5000,
        convertEol: true,
      })
      cleanupTasks.push(() => container.replaceChildren())
      cleanupTasks.push(() => term.dispose())

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.loadAddon(new WebLinksAddon())
      term.open(container)
      fitAddon.fit()

      const setMode = (mode: string) => {
        currentModeRef.current = mode
        cbRef.onModeChange(mode)
      }

      safeWriteLn(term, '\x1b[2J\x1b[H')
      safeWriteLn(term, '\x1b[38;5;6m=== Terminal Ghost Ops ===\x1b[0m')
      safeWriteLn(term, '\x1b[38;5;10mWelcome, operative. Your mission awaits.\x1b[0m')
      safeWriteLn(term, '')
      if (initialJobScenario === 'foreground') {
        setMode('tail-follow')
        safeWriteLn(term, '$ tail -f /var/log/syslog')
        safeWriteLn(term, '\x1b[38;5;3m==> foreground monitor is running; Ctrl-C stops, Ctrl-Z suspends <==\x1b[0m')
      } else {
        if (initialJobScenario === 'stopped') {
          for (const job of jobs.values()) {
            safeWriteLn(term, `[${job.id}]  Stopped  ${job.command}`)
          }
        }
        cbRef.writePrompt(term)
      }

      const recordAction = (action: string, exitCode = 0) => {
        cbRef.onCommandExecuted({ command: action, exitCode, kind: 'interaction' })
      }

      const recordCommand = (command: string, result: number | Pick<ShellResult, 'exitCode' | 'successfulCommands'>) => {
        const exitCode = typeof result === 'number' ? result : result.exitCode
        shellRef.current.state.lastExitCode = exitCode
        const successfulCommands = typeof result === 'number'
          ? (result === 0 ? [command] : [])
          : (result.successfulCommands ?? (result.exitCode === 0 ? [command] : []))
        if (command.trim()) {
          terminalCommandHistory.push(command)
          if (terminalCommandHistory.length > MAX_SHELL_HISTORY_ENTRIES) {
            terminalCommandHistory.splice(0, terminalCommandHistory.length - MAX_SHELL_HISTORY_ENTRIES)
          }
        }
        cbRef.onCommandExecuted({ command, exitCode, kind: 'command', successfulCommands })
      }

      const appendToInputBuffer = (value: string): boolean => {
        if (inputBufferRef.current.length + value.length > MAX_SHELL_COMMAND_LENGTH) {
          safeWrite(term, '\x07')
          return false
        }
        inputBufferRef.current += value
        safeWrite(term, value)
        return true
      }

      const insertPreviousArgument = () => {
        const previousCommand = terminalCommandHistory.at(-1)
        const previousArgument = previousCommand
          ? tokenizeCommandLine(previousCommand).filter(token => token !== '&').at(-1)
          : undefined
        if (!previousArgument || !['shell', 'tmux', 'screen'].includes(currentModeRef.current)) {
          recordAction('Alt-.', 1)
          safeWrite(term, '\x07')
          return
        }
        const insertion = quoteCommandToken(previousArgument)
        recordAction('Alt-.', appendToInputBuffer(insertion) ? 0 : 1)
      }

      const writeBoundedOutput = (output: string, color = '') => {
        if (!output) return
        const truncation = truncateTextToUtf16Limit(output, MAX_TERMINAL_OUTPUT_CODE_UNITS)
        const displayOutput = truncation.wasTruncated
          ? `${truncation.text}\n\x1b[38;5;3m... output truncated (${truncation.totalCodeUnits} UTF-16 units total)\x1b[0m`
          : output
        safeWrite(term, color ? `${color}${displayOutput}\x1b[0m` : displayOutput)
        if (!displayOutput.endsWith('\n')) safeWriteLn(term, '')
      }

      const restorePreviousScreenFrame = () => {
        const previous = screenFrameStack.pop()
        if (!previous) return
        screenSessionName = previous.name
        screenHostMode = previous.hostMode
      }

      const syncTmuxSessionFromServices = () => {
        const sessions = shellRef.current.services.tmuxSessions
        const selected = [...sessions.entries()].find(([, session]) => session.attached)
          ?? [...sessions.entries()][0]
        if (!selected) {
          tmuxSession.exists = false
          tmuxSession.attached = false
          return
        }
        const [name, session] = selected
        tmuxSession.exists = true
        tmuxSession.name = name
        tmuxSession.attached = session.attached
        tmuxSession.windows = session.windows
        tmuxSession.panes = Math.max(1, tmuxSession.panes)
      }

      const resolveAttachedHostMode = (requested: CommandMode): CommandMode => {
        let mode = requested
        for (let guard = 0; guard < 8; guard++) {
          if (mode === 'screen') {
            const session = shellRef.current.services.screenSessions.get(screenSessionName)
            if (session?.attached) return mode
            mode = screenHostMode
            restorePreviousScreenFrame()
            continue
          }
          if (mode === 'tmux') {
            syncTmuxSessionFromServices()
            if (tmuxSession.attached) return mode
            mode = tmuxHostMode
            continue
          }
          return 'shell'
        }
        return 'shell'
      }

      const returnToCommandMode = (mode: CommandMode, action?: string, exitCode = 0) => {
        if (action) recordAction(action, exitCode)
        inputBufferRef.current = ''
        tmuxPrefixRef.current = false
        screenPrefixRef.current = false
        setMode(resolveAttachedHostMode(mode))
        cbRef.writePrompt(term)
      }

      const returnToShell = (action?: string, exitCode = 0) => {
        returnToCommandMode('shell', action, exitCode)
      }

      const showInteractiveMode = (mode: string, stdout: string) => {
        if (mode === 'less' || mode === 'man') {
          setMode('less')
          safeWriteLn(term, '')
          safeWriteLn(term, '\x1b[38;5;3m--- less pager --- Press q to quit ---\x1b[0m')
          const truncation = truncateTextToUtf16Limit(stdout, MAX_TERMINAL_OUTPUT_CODE_UNITS)
          const displayOutput = truncation.wasTruncated
            ? `${truncation.text}\n... output truncated (${truncation.totalCodeUnits} UTF-16 units total)`
            : stdout
          displayOutput.split('\n').slice(0, 24).forEach(line => safeWriteLn(term, line))
          safeWriteLn(term, '\x1b[38;5;3m(END)\x1b[0m')
          return
        }

        if (mode === 'vim' || mode === 'vim:normal') {
          setMode('vim:normal')
          safeWriteLn(term, '')
          safeWriteLn(term, '\x1b[38;5;5m=== VIM - NORMAL MODE ===\x1b[0m')
          safeWriteLn(term, '')
          safeWriteLn(term, '\x1b[38;5;8mType :q and press Enter to quit\x1b[0m')
          safeWriteLn(term, '')
          safeWriteLn(term, '\x1b[38;5;5m~\x1b[0m')
          safeWriteLn(term, '\x1b[38;5;5m~\x1b[0m')
          return
        }

        if (mode === 'nano') {
          setMode('nano')
          safeWriteLn(term, '')
          safeWriteLn(term, '\x1b[48;5;4m\x1b[38;5;15m  GNU nano 6.2                    New Buffer                    \x1b[0m')
          safeWriteLn(term, '')
          safeWriteLn(term, '\x1b[38;5;8m^O Write Out  ^X Exit\x1b[0m')
          return
        }

        if (mode === 'tmux') {
          syncTmuxSessionFromServices()
          setMode('tmux')
          safeWriteLn(term, '')
          safeWriteLn(term, `\x1b[38;5;6m[tmux] ${tmuxSession.name}:0 attached. Use Ctrl-b d to detach.\x1b[0m`)
          cbRef.writePrompt(term)
          return
        }

        if (mode === 'screen') {
          setMode('screen')
          safeWriteLn(term, '')
          writeBoundedOutput(stdout)
          safeWriteLn(term, `\x1b[38;5;6m[screen] ${screenSessionName} attached. Use Ctrl-a d to detach.\x1b[0m`)
          cbRef.writePrompt(term)
          return
        }

        if (mode === 'node') {
          setMode('node')
          safeWriteLn(term, '\x1b[38;5;10mWelcome to Node.js v18.17.0\x1b[0m')
          safeWriteLn(term, 'Type .exit or Ctrl+D to quit')
          safeWrite(term, '\x1b[38;5;10m> \x1b[0m')
          return
        }

        if (mode === 'python') {
          setMode('python')
          safeWriteLn(term, 'Python 3.10.12 (default, Jun  1 2024)')
          safeWriteLn(term, 'Type "exit()" or Ctrl+D to quit')
          safeWrite(term, '\x1b[38;5;10m>>> \x1b[0m')
          return
        }

        if (mode === 'psql') {
          setMode('psql')
          safeWriteLn(term, 'psql (14.9)')
          safeWriteLn(term, 'Type "\\q" to quit.')
          safeWrite(term, 'postgres=# ')
          return
        }

        if (mode === 'sqlite') {
          setMode('sqlite')
          safeWriteLn(term, 'SQLite version 3.37.2')
          safeWriteLn(term, 'Enter ".help" for usage hints.')
          safeWrite(term, 'sqlite> ')
        }
      }

      const findJob = (rawSpec: string | undefined, requiredState?: TerminalJob['state']) => {
        const candidates = [...jobs.values()]
          .filter(job => !requiredState || job.state === requiredState)
          .sort((left, right) => right.id - left.id)
        if (!rawSpec) return candidates[0]
        const match = rawSpec.match(/^%?(\d+)$/)
        if (!match) return undefined
        const job = jobs.get(Number(match[1]))
        return job && (!requiredState || job.state === requiredState) ? job : undefined
      }

      const executeJobControlLine = (line: string, hostMode: CommandMode) => {
        const tokens = tokenizeCommandLine(line)
        const command = tokens[0]
        if (!['jobs', 'fg', 'bg'].includes(command)) return false

        if (command === 'jobs') {
          const invalidArgument = tokens.slice(1).find(token => token !== '-l')
          if (invalidArgument) {
            recordCommand(line, 2)
            writeBoundedOutput(
              invalidArgument.startsWith('-')
                ? `jobs: invalid option: ${invalidArgument}\n`
                : `jobs: ${invalidArgument}: no such job\n`,
              '\x1b[38;5;9m',
            )
          } else {
            recordCommand(line, 0)
            const showPid = tokens.includes('-l')
            for (const job of [...jobs.values()].sort((left, right) => left.id - right.id)) {
              const marker = job.id === Math.max(0, ...jobs.keys()) ? '+' : '-'
              const pid = showPid ? `${3000 + job.id} ` : ''
              safeWriteLn(term, `[${job.id}]${marker} ${pid}${job.state === 'stopped' ? 'Stopped' : 'Running'}  ${job.command}${job.background ? ' &' : ''}`)
            }
          }
          setMode(hostMode)
          cbRef.writePrompt(term)
          return true
        }

        if (tokens.length > 2) {
          recordCommand(line, 1)
          writeBoundedOutput(`${command}: too many arguments\n`, '\x1b[38;5;9m')
          setMode(hostMode)
          cbRef.writePrompt(term)
          return true
        }

        const job = findJob(tokens[1], command === 'bg' ? 'stopped' : undefined)
        if (!job) {
          recordCommand(line, 1)
          writeBoundedOutput(`bash: ${command}: ${tokens[1] ?? 'current'}: no such job\n`, '\x1b[38;5;9m')
          setMode(hostMode)
          cbRef.writePrompt(term)
          return true
        }

        recordCommand(line, 0)
        job.state = 'running'
        job.hostMode = hostMode
        if (command === 'bg') {
          job.background = true
          safeWriteLn(term, `[${job.id}]+ ${job.command} &`)
          setMode(hostMode)
          cbRef.writePrompt(term)
        } else {
          job.background = false
          foregroundJobId = job.id
          safeWriteLn(term, job.command)
          setMode('tail-follow')
          safeWriteLn(term, '\x1b[38;5;3m==> following output; Ctrl-C stops, Ctrl-Z suspends <==\x1b[0m')
        }
        return true
      }

      const executeTailFollowLine = (line: string, hostMode: CommandMode) => {
        const parsed = parseTailFollowCommand(line)
        if (!parsed) return false
        if (!parsed.hasFileOperand) {
          recordCommand(line, 1)
          writeBoundedOutput('tail: missing file operand\n', '\x1b[38;5;9m')
          setMode(hostMode)
          cbRef.writePrompt(term)
          return true
        }

        const result = shellRef.current.execute(parsed.validationLine)
        recordCommand(
          line,
          result.exitCode === 0
            ? {
                exitCode: 0,
                successfulCommands: [
                  line.replace(/\s*&\s*$/, '').trim(),
                  ...(parsed.background ? ['&'] : []),
                ],
              }
            : result,
        )
        writeBoundedOutput(result.stdout)
        writeBoundedOutput(result.stderr, '\x1b[38;5;9m')
        if (result.exitCode !== 0) {
          setMode(hostMode)
          cbRef.writePrompt(term)
          return true
        }

        const job: TerminalJob = {
          id: nextJobId++,
          command: line.replace(/\s*&\s*$/, '').trim(),
          state: 'running',
          background: parsed.background,
          hostMode,
        }
        jobs.set(job.id, job)
        if (parsed.background) {
          safeWriteLn(term, `[${job.id}] ${3000 + job.id}`)
          setMode(hostMode)
          cbRef.writePrompt(term)
        } else {
          foregroundJobId = job.id
          setMode('tail-follow')
          safeWriteLn(term, '\x1b[38;5;3m==> following output; Ctrl-C stops, Ctrl-Z suspends <==\x1b[0m')
        }
        return true
      }

      const finishTmuxCommand = (
        line: string,
        exitCode: number,
        hostMode: CommandMode,
        stdout = '',
        stderr = '',
      ) => {
        recordCommand(line, exitCode)
        writeBoundedOutput(stdout)
        writeBoundedOutput(stderr, '\x1b[38;5;9m')
        setMode(hostMode)
        cbRef.writePrompt(term)
      }

      const executeTmuxLine = (line: string, hostMode: CommandMode) => {
        const tokens = tokenizeCommandLine(line)
        if (tokens[0] !== 'tmux') return false
        const subcommand = tokens[1] ?? ''

        if (!subcommand || ['new', 'new-session'].includes(subcommand)) {
          const sessionNameIndex = tokens.indexOf('-s')
          if (sessionNameIndex >= 0 && !tokens[sessionNameIndex + 1]) {
            finishTmuxCommand(line, 1, hostMode, '', 'tmux: -s expects a session name\n')
            return true
          }
          if (tmuxSession.exists) {
            finishTmuxCommand(line, 1, hostMode, '', 'tmux: this bounded terminal models one session at a time\n')
            return true
          }
          const result = shellRef.current.execute(line)
          recordCommand(line, result)
          writeBoundedOutput(result.stdout)
          writeBoundedOutput(result.stderr, '\x1b[38;5;9m')
          if (result.exitCode === 0) {
            tmuxSession.exists = true
            tmuxSession.name = sessionNameIndex >= 0 ? tokens[sessionNameIndex + 1] : 'session-0'
            tmuxSession.windows = 1
            tmuxSession.panes = 1
            tmuxHostMode = hostMode
            showInteractiveMode('tmux', result.stdout)
          } else {
            setMode(hostMode)
            cbRef.writePrompt(term)
          }
          return true
        }

        if (['ls', 'list-sessions'].includes(subcommand)) {
          if (!tmuxSession.exists) {
            finishTmuxCommand(line, 1, hostMode, '', 'no server running on /tmp/tmux-1000/default\n')
          } else {
            finishTmuxCommand(
              line,
              0,
              hostMode,
              `${tmuxSession.name}: ${tmuxSession.windows} window${tmuxSession.windows === 1 ? '' : 's'}${tmuxSession.attached ? ' (attached)' : ''}\n`,
            )
          }
          return true
        }

        if (['attach', 'attach-session'].includes(subcommand)) {
          const targetIndex = tokens.indexOf('-t')
          const target = targetIndex >= 0 ? tokens[targetIndex + 1] : undefined
          const targetSession = target?.split(':')[0]
          if (targetIndex >= 0 && !target) {
            finishTmuxCommand(line, 1, hostMode, '', 'tmux: -t expects a session name\n')
            return true
          }
          if (tmuxSession.exists && (!target || targetSession === tmuxSession.name)) {
            if (tmuxSession.attached) {
              finishTmuxCommand(line, 1, hostMode, '', `tmux: session ${tmuxSession.name} is already attached\n`)
              return true
            }
            recordCommand(line, 0)
            tmuxSession.attached = true
            const serviceSession = shellRef.current.services.tmuxSessions.get(tmuxSession.name)
            if (serviceSession) serviceSession.attached = true
            tmuxHostMode = hostMode
            showInteractiveMode('tmux', '')
            return true
          }
          const result = shellRef.current.execute(line)
          recordCommand(line, result)
          writeBoundedOutput(result.stdout)
          writeBoundedOutput(result.stderr, '\x1b[38;5;9m')
          if (result.exitCode === 0) {
            tmuxSession.exists = true
            tmuxSession.name = target ?? '0'
            tmuxSession.windows = 1
            tmuxSession.panes = 1
            tmuxHostMode = hostMode
            showInteractiveMode('tmux', result.stdout)
          } else {
            setMode(hostMode)
            cbRef.writePrompt(term)
          }
          return true
        }

        if (['detach', 'detach-client'].includes(subcommand)) {
          if (hostMode !== 'tmux' || !tmuxSession.attached) {
            finishTmuxCommand(line, 1, hostMode, '', 'tmux: no current client\n')
            return true
          }
          recordCommand(line, 0)
          tmuxSession.attached = false
          const serviceSession = shellRef.current.services.tmuxSessions.get(tmuxSession.name)
          if (serviceSession) serviceSession.attached = false
          safeWriteLn(term, `[detached (from session ${tmuxSession.name})]`)
          returnToCommandMode(tmuxHostMode)
          return true
        }

        if (['new-window', 'neww'].includes(subcommand)) {
          const targetIndex = tokens.indexOf('-t')
          const target = targetIndex >= 0 ? tokens[targetIndex + 1] : undefined
          const targetSession = target?.split(':')[0]
          if (targetIndex >= 0 && !target) {
            finishTmuxCommand(line, 1, hostMode, '', 'tmux: -t expects a session name\n')
            return true
          }
          if (!tmuxSession.exists || (hostMode !== 'tmux' && !target) || (targetSession && targetSession !== tmuxSession.name)) {
            finishTmuxCommand(line, 1, hostMode, '', 'tmux: no current session\n')
            return true
          }
          tmuxSession.windows++
          finishTmuxCommand(line, 0, hostMode, `[tmux] created window ${tmuxSession.windows - 1}; ${tmuxSession.windows} windows\n`)
          return true
        }

        if (['split', 'split-window', 'splitw'].includes(subcommand)) {
          const targetIndex = tokens.indexOf('-t')
          const target = targetIndex >= 0 ? tokens[targetIndex + 1] : undefined
          const targetSession = target?.split(':')[0]
          if (targetIndex >= 0 && !target) {
            finishTmuxCommand(line, 1, hostMode, '', 'tmux: -t expects a session name\n')
            return true
          }
          if (!tmuxSession.exists || (hostMode !== 'tmux' && !target) || (targetSession && targetSession !== tmuxSession.name)) {
            finishTmuxCommand(line, 1, hostMode, '', 'tmux: no current pane\n')
            return true
          }
          tmuxSession.panes++
          finishTmuxCommand(line, 0, hostMode, `[tmux] split pane; ${tmuxSession.panes} panes\n`)
          return true
        }

        if (subcommand === 'copy-mode') {
          if (hostMode !== 'tmux' || !tmuxSession.attached) {
            finishTmuxCommand(line, 1, hostMode, '', 'tmux: no current client\n')
            return true
          }
          recordCommand(line, 0)
          setMode('tmux:copy')
          safeWriteLn(term, '\x1b[38;5;3m[tmux copy-mode] q or Esc returns to the pane\x1b[0m')
          return true
        }

        if (subcommand === '-V' || subcommand === '-v') {
          finishTmuxCommand(line, 0, hostMode, 'tmux 3.2a\n')
          return true
        }

        if (['kill-session', 'rename-session', 'source-file'].includes(subcommand)) {
          const previousName = tmuxSession.name
          const result = shellRef.current.execute(line)
          recordCommand(line, result)
          writeBoundedOutput(result.stdout)
          writeBoundedOutput(result.stderr, '\x1b[38;5;9m')
          if (result.exitCode === 0 && subcommand === 'kill-session') {
            tmuxSession.exists = shellRef.current.services.tmuxSessions.size > 0
            tmuxSession.attached = false
            if (hostMode === 'tmux') {
              safeWriteLn(term, `[exited session ${previousName}]`)
              returnToCommandMode(tmuxHostMode)
              return true
            }
          } else if (result.exitCode === 0 && subcommand === 'rename-session') {
            const renamed = [...shellRef.current.services.tmuxSessions.entries()]
              .find(([, session]) => session.attached)?.[0]
              ?? [...shellRef.current.services.tmuxSessions.keys()].at(-1)
            if (renamed) tmuxSession.name = renamed
          }
          setMode(hostMode)
          cbRef.writePrompt(term)
          return true
        }

        finishTmuxCommand(line, 1, hostMode, '', `tmux: unknown command: ${subcommand}\n`)
        return true
      }

      const executeShellLine = (line: string, hostMode: CommandMode = 'shell') => {
        safeWriteLn(term, '')
        if (!line) {
          setMode(hostMode)
          cbRef.writePrompt(term)
          return
        }

        const syntaxError = validateCommandLineSyntax(line)
        if (syntaxError) {
          recordCommand(line, 2)
          writeBoundedOutput(syntaxError, '\x1b[38;5;9m')
          setMode(hostMode)
          cbRef.writePrompt(term)
          return
        }

        const heredocMatch = line.match(/^cat\s+<<([A-Za-z_]\w*)$/)
        if (heredocMatch) {
          heredocDelimiter = heredocMatch[1]
          heredocOriginal = line
          heredocHostMode = hostMode
          heredocLines = []
          setMode('heredoc')
          safeWrite(term, '> ')
          return
        }

        if (executeJobControlLine(line, hostMode)) return
        if (executeTailFollowLine(line, hostMode)) return
        if (executeTmuxLine(line, hostMode)) return

        const commandTokens = tokenizeCommandLine(line)
        const commandName = commandTokens[0]?.toLowerCase()
        if (commandName === 'psql' || commandName === 'sqlite' || commandName === 'sqlite3') {
          const launcher = validateDatabaseLauncher(commandTokens)
          if (launcher.error) {
            recordCommand(line, 2)
            writeBoundedOutput(launcher.error, '\x1b[38;5;9m')
            setMode(hostMode)
            cbRef.writePrompt(term)
            return
          }
          recordCommand(line, 0)
          replHostMode = hostMode
          showInteractiveMode(launcher.mode, '')
          return
        }
        if (commandName === 'screen' && hostMode === 'screen') {
          const screenSubcommand = tokenizeCommandLine(line)[1] ?? ''
          if (!screenSubcommand || ['-S', '-r', '-d'].includes(screenSubcommand)) {
            recordCommand(line, 1)
            writeBoundedOutput('screen: nested screen sessions are not supported in this bounded terminal\n', '\x1b[38;5;9m')
            setMode('screen')
            cbRef.writePrompt(term)
            return
          }
        }

        const result = shellRef.current.execute(line)
        recordCommand(line, result)
        if (hostMode === 'tmux' && result.exitCode === 0) {
          const attachedName = [...shellRef.current.services.tmuxSessions.entries()]
            .find(([, session]) => session.attached)?.[0]
          if (attachedName && attachedName !== tmuxSession.name) {
            tmuxSession.name = attachedName
          } else if (!attachedName) {
            tmuxSession.exists = shellRef.current.services.tmuxSessions.size > 0
            tmuxSession.attached = false
            writeBoundedOutput(result.stdout)
            writeBoundedOutput(result.stderr, '\x1b[38;5;9m')
            returnToCommandMode(tmuxHostMode)
            return
          }
        }
        if (
          hostMode === 'screen'
          && result.exitCode === 0
          && screenSessionName
          && shellRef.current.services.screenSessions.get(screenSessionName)?.attached === false
        ) {
          writeBoundedOutput(result.stdout)
          writeBoundedOutput(result.stderr, '\x1b[38;5;9m')
          const returnMode = screenHostMode
          restorePreviousScreenFrame()
          returnToCommandMode(returnMode)
          return
        }
        if (
          commandName === 'screen'
          && hostMode === 'screen'
          && result.exitCode === 0
          && tokenizeCommandLine(line)[1] === '-d'
          && tokenizeCommandLine(line)[2] === screenSessionName
        ) {
          writeBoundedOutput(result.stdout)
          writeBoundedOutput(result.stderr, '\x1b[38;5;9m')
          const returnMode = screenHostMode
          restorePreviousScreenFrame()
          returnToCommandMode(returnMode)
          return
        }
        if (result.mode) {
          if (result.mode === 'tmux') {
            tmuxHostMode = hostMode
            syncTmuxSessionFromServices()
          }
          if (result.mode === 'screen') {
            const tokens = tokenizeCommandLine(line)
            const nameIndex = tokens.findIndex(token => token === '-S' || token === '-r')
            const nextScreenName = nameIndex >= 0
              ? (tokens[nameIndex + 1] ?? '')
              : ([...shellRef.current.services.screenSessions.entries()].find(([, session]) => session.attached)?.[0] ?? 'screen')
            if (
              screenSessionName
              && nextScreenName !== screenSessionName
              && shellRef.current.services.screenSessions.get(screenSessionName)?.attached
            ) {
              screenFrameStack.push({ name: screenSessionName, hostMode: screenHostMode })
            }
            screenSessionName = nextScreenName
            screenHostMode = hostMode
          }
          replHostMode = hostMode
          showInteractiveMode(result.mode, result.stdout)
          return
        }

        writeBoundedOutput(result.stdout)
        writeBoundedOutput(result.stderr, '\x1b[38;5;9m')
        setMode(hostMode)
        cbRef.writePrompt(term)
      }

      const writeReplPrompt = (mode: string) => {
        if (mode === 'node') safeWrite(term, '\x1b[38;5;10m> \x1b[0m')
        else if (mode === 'python') safeWrite(term, '\x1b[38;5;10m>>> \x1b[0m')
        else if (mode === 'psql') safeWrite(term, 'postgres=# ')
        else if (mode === 'sqlite') safeWrite(term, 'sqlite> ')
      }

      const executeReplLine = (mode: ReplMode, line: string) => {
        const exitCommand = (
          (mode === 'node' && line === '.exit')
          || (mode === 'python' && ['exit()', 'quit()'].includes(line))
          || (mode === 'psql' && line === '\\q')
          || (mode === 'sqlite' && ['.exit', '.quit'].includes(line))
        )
        if (exitCommand) {
          recordAction(line, 0)
          returnToCommandMode(replHostMode)
          return
        }

        if (mode === 'psql') {
          const metaOutput: Record<string, string> = {
            '\\?': 'General\n  \\q                     quit psql\n  \\l                     list databases\n  \\dt                    list tables\n',
            '\\l': '   Name    |  Owner\n-----------+----------\n postgres  | postgres\n',
            '\\dt': 'Did not find any relations.\n',
            '\\d': 'Did not find any relations.\n',
          }
          if (line in metaOutput) {
            recordAction(line, 0)
            writeBoundedOutput(metaOutput[line])
            writeReplPrompt(mode)
            return
          }
          if (/^(select|with|insert|update|delete|create|drop|alter)\b[\s\S]*;$/i.test(line)) {
            recordAction(line, 0)
            writeBoundedOutput(/^select\b/i.test(line) ? '?column?\n----------\n        1\n(1 row)\n' : 'Query OK\n')
            writeReplPrompt(mode)
            return
          }
          recordAction(line, 1)
          writeBoundedOutput(line.startsWith('\\')
            ? `invalid command ${line}\nTry \\? for help.\n`
            : 'ERROR: syntax error; terminate SQL statements with ;\n', '\x1b[38;5;9m')
          writeReplPrompt(mode)
          return
        }

        if (mode === 'sqlite') {
          const metaOutput: Record<string, string> = {
            '.help': '.exit                   Exit this program\n.quit                   Exit this program\n.tables                 List names of tables\n.schema                  Show CREATE statements\n',
            '.tables': 'users  missions\n',
            '.schema': 'CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT);\n',
          }
          if (line in metaOutput) {
            recordAction(line, 0)
            writeBoundedOutput(metaOutput[line])
            writeReplPrompt(mode)
            return
          }
          if (/^(select|with|pragma|insert|update|delete|create|drop|alter)\b[\s\S]*;$/i.test(line)) {
            recordAction(line, 0)
            if (/^(select|pragma)\b/i.test(line)) writeBoundedOutput('1\n')
            writeReplPrompt(mode)
            return
          }
          recordAction(line, 1)
          writeBoundedOutput(line.startsWith('.')
            ? `Error: unknown command or invalid arguments: "${line}". Enter ".help" for help\n`
            : 'Parse error: incomplete or invalid SQL statement\n', '\x1b[38;5;9m')
          writeReplPrompt(mode)
          return
        }

        if (mode === 'node') {
          if (line === '.editor') {
            nodeInterruptCount = 0
            nodeEditorLines = []
            setMode('node:editor')
            writeBoundedOutput('// Entering editor mode (Ctrl+D to finish, Ctrl+C to cancel)\n')
            return
          }
          nodeInterruptCount = 0
          const isKnownCommand = ['.help', '.break', '.clear'].includes(line)
          const isExpression = /^(?:console\.log\s*\(|(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=|JSON\.|Math\.|[\d'"`[{(]|true\b|false\b|null\b|undefined\b)/.test(line)
          const exitCode = isKnownCommand || isExpression ? 0 : 1
          recordAction(line, exitCode)
          if (line === '.help') writeBoundedOutput('.break  .clear  .editor  .exit  .help\n')
          else if (exitCode !== 0) writeBoundedOutput(`Uncaught ReferenceError: ${line.split(/\W/, 1)[0] || line} is not defined\n`, '\x1b[38;5;9m')
          writeReplPrompt(mode)
          return
        }

        const isPythonExpression = /^(?:print\s*\(|(?:import|from)\s+|[A-Za-z_]\w*\s*=|[\d'"[{(]|True\b|False\b|None\b|len\s*\(|range\s*\()/.test(line)
        const exitCode = line === 'help()' || isPythonExpression ? 0 : 1
        recordAction(line, exitCode)
        if (line === 'help()') writeBoundedOutput('Type help(object) for help about object.\n')
        else if (exitCode !== 0) writeBoundedOutput(`NameError: name '${line.split(/\W/, 1)[0] || line}' is not defined\n`, '\x1b[38;5;9m')
        writeReplPrompt(mode)
      }

      const handleTerminalData = (data: string) => {
        try {
          if (data.length > MAX_SHELL_COMMAND_LENGTH) {
            safeWrite(term, '\x07')
            return
          }
          const inputPlan = planTerminalInputChunk(data, MAX_TERMINAL_PASTE_SUBMISSIONS)
          if (!inputPlan.accepted) {
            // Reject the complete paste before recursive dispatch: no prefix executes.
            safeWrite(term, '\x07')
            return
          }
          const characters = inputPlan.characters
          const code = characters.length === 1 ? (characters[0].codePointAt(0) ?? -1) : -1
          if (flowPaused) {
            if (code === 17) {
              flowPaused = false
              safeWrite(term, '^Q\r\n\x1b[38;5;10m[terminal output resumed]\x1b[0m')
              recordAction('Ctrl-Q')
              cbRef.writePrompt(term)
            }
            return
          }
          // xterm reports Alt-. as an escape-prefixed sequence.
          if (data === '\x1b.') {
            insertPreviousArgument()
            return
          }
          // Arrow/function-key escape sequences are handled by xterm itself.
          if (data.startsWith('\x1b[')) {
            tmuxPrefixRef.current = false
            screenPrefixRef.current = false
            return
          }
          // Pasted text may arrive as one chunk; process only a preflighted batch.
          if (characters.length > 1) {
            for (const character of characters) handleTerminalData(character)
            return
          }

          const mode = currentModeRef.current

          if (mode === 'heredoc') {
            if (code === 3) {
              safeWriteLn(term, '^C')
              recordAction('Ctrl-C', 1)
              heredocDelimiter = ''
              heredocOriginal = ''
              heredocLines = []
              inputBufferRef.current = ''
              returnToCommandMode(heredocHostMode)
              return
            }
            if (data === '\r') {
              const line = inputBufferRef.current
              inputBufferRef.current = ''
              safeWriteLn(term, '')
              if (line === heredocDelimiter) {
                const content = heredocLines.join('\n') + (heredocLines.length > 0 ? '\n' : '')
                recordCommand(heredocOriginal, {
                  exitCode: 0,
                  successfulCommands: [heredocOriginal, '<<'],
                })
                heredocDelimiter = ''
                heredocOriginal = ''
                heredocLines = []
                writeBoundedOutput(content)
                returnToCommandMode(heredocHostMode)
              } else {
                heredocLines.push(line)
                safeWrite(term, '> ')
              }
            } else if (data === '\x7f') {
              if (inputBufferRef.current.length > 0) {
                inputBufferRef.current = dropLastCodePoint(inputBufferRef.current)
                safeWrite(term, '\b \b')
              }
            } else if (code >= 32) {
              appendToInputBuffer(data)
            }
            return
          }

          if (mode === 'less') {
            if (data === 'q' || data === 'Q') {
              returnToCommandMode(replHostMode, 'q')
            } else if (data === '/' || data === '?') {
              recordAction(data)
              inputBufferRef.current = ''
              setMode('less:search')
              safeWrite(term, data)
            }
            return
          }

          if (mode === 'less:search') {
            if (data === '\x1b') {
              inputBufferRef.current = ''
              setMode('less')
              safeWriteLn(term, '')
              return
            }
            if (data === '\r') {
              inputBufferRef.current = ''
              safeWriteLn(term, '')
              setMode('less')
              return
            }
            if (data === '\x7f') {
              if (inputBufferRef.current.length > 0) {
                inputBufferRef.current = dropLastCodePoint(inputBufferRef.current)
                safeWrite(term, '\b \b')
              }
              return
            }
            if (code >= 32) {
              appendToInputBuffer(data)
            }
            return
          }

          if (mode.startsWith('vim')) {
            if (data === '\x1b') {
              recordAction('Esc')
              inputBufferRef.current = ''
              setMode('vim:normal')
              return
            }
            if (data === ':' && !inputBufferRef.current) {
              inputBufferRef.current = ':'
              setMode('vim:command')
              safeWrite(term, ':')
              return
            }
            if (data === '\r') {
              const command = inputBufferRef.current.trim()
              inputBufferRef.current = ''
              safeWriteLn(term, '')
              if (command) recordAction(command)
              if ([':q', ':q!', ':wq'].includes(command)) returnToCommandMode(replHostMode)
              else setMode('vim:normal')
              return
            }
            if (data === '\x7f' && inputBufferRef.current.length > 1) {
              inputBufferRef.current = dropLastCodePoint(inputBufferRef.current)
              safeWrite(term, '\b \b')
              return
            }
            if (inputBufferRef.current.startsWith(':') && code >= 32) {
              appendToInputBuffer(data)
            }
            return
          }

          if (mode === 'nano') {
            if (code === 15) {
              recordAction('Ctrl-O')
              safeWriteLn(term, '')
              safeWriteLn(term, '\x1b[38;5;10m[ Wrote buffer ]\x1b[0m')
            } else if (code === 24) {
              safeWriteLn(term, '')
              returnToCommandMode(replHostMode, 'Ctrl-X')
            }
            return
          }

          if (mode === 'node:editor') {
            if (code === 4) {
              const source = [...nodeEditorLines, inputBufferRef.current].filter(Boolean).join('\n')
              recordAction('.editor', 0)
              inputBufferRef.current = ''
              nodeEditorLines = []
              safeWriteLn(term, '')
              if (source) writeBoundedOutput(`[editor] executed ${source.split('\n').length} line${source.includes('\n') ? 's' : ''}\n`)
              setMode('node')
              writeReplPrompt('node')
              return
            }
            if (code === 3) {
              recordAction('.editor', 1)
              inputBufferRef.current = ''
              nodeEditorLines = []
              safeWriteLn(term, '^C')
              setMode('node')
              writeReplPrompt('node')
              return
            }
            if (data === '\x7f') {
              if (inputBufferRef.current.length > 0) {
                inputBufferRef.current = dropLastCodePoint(inputBufferRef.current)
                safeWrite(term, '\b \b')
              }
              return
            }
            if (data === '\r') {
              nodeEditorLines.push(inputBufferRef.current)
              inputBufferRef.current = ''
              safeWriteLn(term, '')
              return
            }
            if (code >= 32) {
              appendToInputBuffer(data)
            }
            return
          }

          if (REPL_MODES.includes(mode as typeof REPL_MODES[number])) {
            if (code === 4) {
              safeWrite(term, '^D')
              recordAction('Ctrl-D', 0)
              nodeInterruptCount = 0
              returnToCommandMode(replHostMode)
              return
            }
            if (code === 3) {
              if (mode === 'node' && inputBufferRef.current.length === 0) {
                nodeInterruptCount++
                recordAction('Ctrl-C', 0)
                safeWriteLn(term, '^C')
                if (nodeInterruptCount >= 2) {
                  nodeInterruptCount = 0
                  returnToCommandMode(replHostMode)
                } else {
                  safeWriteLn(term, '(To exit, press Ctrl+C again or Ctrl+D)')
                  writeReplPrompt(mode)
                }
                return
              }
              nodeInterruptCount = 0
              recordAction('Ctrl-C', 0)
              inputBufferRef.current = ''
              safeWriteLn(term, '^C')
              writeReplPrompt(mode)
              return
            }
            if (data === '\x7f') {
              if (inputBufferRef.current.length > 0) {
                inputBufferRef.current = dropLastCodePoint(inputBufferRef.current)
                safeWrite(term, '\b \b')
              }
              return
            }
            if (data === '\r') {
              const line = inputBufferRef.current.trim()
              inputBufferRef.current = ''
              if (mode === 'node') nodeInterruptCount = 0
              safeWriteLn(term, '')
              if (line) executeReplLine(mode as ReplMode, line)
              else writeReplPrompt(mode)
              return
            }
            if (code >= 32) {
              if (mode === 'node') nodeInterruptCount = 0
              appendToInputBuffer(data)
            }
            return
          }

          if (mode === 'tail-follow') {
            const job = foregroundJobId === null ? undefined : jobs.get(foregroundJobId)
            if (!job) {
              foregroundJobId = null
              returnToShell()
              return
            }
            if (code === 3) {
              recordAction('Ctrl-C', 0)
              safeWrite(term, '^C')
              jobs.delete(job.id)
              foregroundJobId = null
              returnToCommandMode(job.hostMode)
            } else if (code === 26) {
              recordAction('Ctrl-Z', 0)
              safeWriteLn(term, '^Z')
              job.state = 'stopped'
              job.background = false
              foregroundJobId = null
              safeWriteLn(term, `[${job.id}]+ Stopped  ${job.command}`)
              returnToCommandMode(job.hostMode)
            }
            return
          }

          if (mode.startsWith('tmux') && code === 2) {
            tmuxPrefixRef.current = true
            return
          }
          if (mode.startsWith('tmux') && tmuxPrefixRef.current) {
            tmuxPrefixRef.current = false
            const key = data.toLowerCase()
            if (key === 'd') {
              recordAction('Ctrl-b d', 0)
              tmuxSession.attached = false
              const serviceSession = shellRef.current.services.tmuxSessions.get(tmuxSession.name)
              if (serviceSession) serviceSession.attached = false
              safeWriteLn(term, '')
              safeWriteLn(term, `[detached (from session ${tmuxSession.name})]`)
              returnToCommandMode(tmuxHostMode)
            } else if (key === 'c') {
              recordAction('Ctrl-b c', 0)
              tmuxSession.windows++
              const serviceSession = shellRef.current.services.tmuxSessions.get(tmuxSession.name)
              if (serviceSession) serviceSession.windows = tmuxSession.windows
              safeWriteLn(term, '')
              safeWriteLn(term, `[tmux] created window ${tmuxSession.windows - 1}; ${tmuxSession.windows} windows`)
              setMode('tmux')
              cbRef.writePrompt(term)
            } else if (data === '%' || data === '"') {
              recordAction(`Ctrl-b ${data}`, 0)
              tmuxSession.panes++
              safeWriteLn(term, '')
              safeWriteLn(term, `[tmux] split pane; ${tmuxSession.panes} panes`)
              setMode('tmux')
              cbRef.writePrompt(term)
            } else if (data === '[') {
              recordAction('Ctrl-b [', 0)
              setMode('tmux:copy')
              safeWriteLn(term, '')
              safeWriteLn(term, '\x1b[38;5;3m[tmux copy-mode] q or Esc returns to the pane\x1b[0m')
            } else {
              const action = `Ctrl-b ${data || '?'}`
              recordAction(action, 1)
              safeWriteLn(term, '')
              safeWriteLn(term, `\x1b[38;5;9m[tmux] unsupported prefix key: ${JSON.stringify(data)}\x1b[0m`)
              setMode(mode === 'tmux:copy' ? 'tmux:copy' : 'tmux')
            }
            return
          }

          if (mode === 'screen' && code === 1) {
            screenPrefixRef.current = true
            return
          }
          if (mode === 'screen' && screenPrefixRef.current) {
            screenPrefixRef.current = false
            if (data.toLowerCase() === 'd') {
              const session = shellRef.current.services.screenSessions.get(screenSessionName)
              if (!session?.attached) {
                recordAction('Ctrl-a d', 1)
                safeWriteLn(term, '')
                safeWriteLn(term, '\x1b[38;5;9m[screen] no attached session to detach\x1b[0m')
                cbRef.writePrompt(term)
                return
              }
              session.attached = false
              recordAction('Ctrl-a d', 0)
              safeWriteLn(term, '')
              safeWriteLn(term, `[detached from ${screenSessionName}]`)
              const returnMode = screenHostMode
              restorePreviousScreenFrame()
              returnToCommandMode(returnMode)
            } else {
              recordAction(`Ctrl-a ${data || '?'}`, 1)
              safeWriteLn(term, '')
              safeWriteLn(term, `\x1b[38;5;9m[screen] unsupported prefix key: ${JSON.stringify(data)}\x1b[0m`)
              setMode('screen')
              cbRef.writePrompt(term)
            }
            return
          }

          if (mode === 'tmux:copy') {
            if (data === 'q' || data === 'Q' || data === '\x1b') {
              recordAction(data === '\x1b' ? 'Esc' : 'q', 0)
              setMode('tmux')
              safeWriteLn(term, '')
              cbRef.writePrompt(term)
            }
            return
          }

          if (data === '\x1b') {
            recordAction('Esc')
            return
          }

          const controlActions: Record<number, string> = {
            3: 'Ctrl-C',
            4: 'Ctrl-D',
            7: 'Ctrl-G',
            11: 'Ctrl-K',
            17: 'Ctrl-Q',
            18: 'Ctrl-R',
            19: 'Ctrl-S',
            21: 'Ctrl-U',
            26: 'Ctrl-Z',
          }
          const controlAction = controlActions[code]
          if (controlAction) {
            if (code === 19) {
              flowPaused = true
              safeWrite(term, '^S\r\n\x1b[38;5;3m[terminal output paused; press Ctrl-Q to resume]\x1b[0m')
              recordAction('Ctrl-S')
              return
            }
            if (code === 17) {
              recordAction('Ctrl-Q', 1)
              safeWrite(term, '\x07')
              return
            }
            const exitCode = code === 3 || code === 26 ? 1 : 0
            recordAction(controlAction, exitCode)
            if (code === 3 || code === 4 || code === 26) {
              safeWrite(term, code === 3 ? '^C' : code === 4 ? '^D' : '^Z')
              inputBufferRef.current = ''
              if (code === 26) safeWrite(term, '\r\nbash: suspend: no current job')
              cbRef.writePrompt(term)
            } else if (code === 21) {
              while (inputBufferRef.current.length > 0) {
                safeWrite(term, '\b \b')
                inputBufferRef.current = dropLastCodePoint(inputBufferRef.current)
              }
            }
            return
          }

          if (data === '\r') {
            const line = inputBufferRef.current.trim()
            inputBufferRef.current = ''
            executeShellLine(line, mode === 'tmux' ? 'tmux' : mode === 'screen' ? 'screen' : 'shell')
          } else if (data === '\x7f') {
            if (inputBufferRef.current.length > 0) {
              inputBufferRef.current = dropLastCodePoint(inputBufferRef.current)
              safeWrite(term, '\b \b')
            }
          } else if (code >= 32) {
            appendToInputBuffer(data)
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          safeWriteLn(term, '')
          safeWriteLn(term, `\x1b[38;5;9m[terminal error: ${message}]\x1b[0m`)
          inputBufferRef.current = ''
          try { cbRef.writePrompt(term) } catch { /* The terminal may be gone. */ }
        }
      }

      const dataSubscription = term.onData(handleTerminalData)
      cleanupTasks.push(() => dataSubscription.dispose())
      const handleControlKeyDown = (event: KeyboardEvent) => {
        if (event.type !== 'keydown') return true
        const key = event.key.toLowerCase()

        if (event.ctrlKey && key === 'l') {
          event.preventDefault()
          event.stopPropagation()
          term.clear()
          cbRef.writePrompt(term)
          return
        }

        const controlCodes: Record<string, number> = {
          b: 2,
          c: 3,
          d: 4,
          g: 7,
          k: 11,
          o: 15,
          q: 17,
          r: 18,
          s: 19,
          u: 21,
          x: 24,
          z: 26,
        }
        if (event.ctrlKey && controlCodes[key]) {
          event.preventDefault()
          event.stopPropagation()
          handleTerminalData(String.fromCharCode(controlCodes[key]))
          return
        }

        if (event.altKey && key === '.') {
          event.preventDefault()
          event.stopPropagation()
          handleTerminalData('\x1b.')
        }
      }
      container.addEventListener('keydown', handleControlKeyDown, true)
      cleanupTasks.push(() => container.removeEventListener('keydown', handleControlKeyDown, true))

      termRef.current = term
      fitRef.current = fitAddon
      cleanupTasks.push(() => {
        if (termRef.current === term) termRef.current = null
        if (fitRef.current === fitAddon) fitRef.current = null
      })
      term.focus()

      const handleResize = () => {
        try { fitAddon.fit() } catch { /* Ignore a resize during disposal. */ }
      }
      window.addEventListener('resize', handleResize)
      cleanupTasks.push(() => window.removeEventListener('resize', handleResize))

      const handleFocus = () => setHasFocus(true)
      const handleBlur = () => setHasFocus(false)
      container.addEventListener('focusin', handleFocus)
      cleanupTasks.push(() => container.removeEventListener('focusin', handleFocus))
      container.addEventListener('focusout', handleBlur)
      cleanupTasks.push(() => container.removeEventListener('focusout', handleBlur))

      setReadyTerminal({ shell, scenario: initialJobScenario, attempt: loadAttempt })
    }

    void initTerminal().catch((error: unknown) => {
      cleanupFn()
      if (disposed) return
      console.error('Failed to initialize the terminal runtime.', error)
      setTerminalLoadFailure({ shell, scenario: initialJobScenario, attempt: loadAttempt })
    })

    return () => {
      disposed = true
      cleanupFn()
    }
  }, [initialJobScenario, loadAttempt, shell, writePrompt])

  useEffect(() => {
    if (!successPulse || !containerRef.current) return
    containerRef.current.style.boxShadow = 'inset 0 0 0 2px rgba(0, 255, 136, 0.4)'
    const timer = setTimeout(() => {
      if (containerRef.current) containerRef.current.style.boxShadow = 'none'
    }, 400)
    return () => clearTimeout(timer)
  }, [successPulse])

  const focusStyle: React.CSSProperties = hasFocus
    ? { boxShadow: 'inset 0 0 12px rgba(0, 229, 255, 0.05)' }
    : {}

  return (
    <div className="relative w-full h-full" style={{ backgroundColor: 'var(--bg-terminal)' }}>
      {loadFailed ? (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center"
          style={{ backgroundColor: 'var(--bg-terminal)' }}
          role="alert"
          aria-live="assertive"
        >
          <span className="font-jetbrains text-body-md font-semibold text-[#FF6B6B]">
            {t('terminal.loadFailed')}
          </span>
          <span className="max-w-md font-inter text-body-sm text-[#A8B8C8]">
            {t('terminal.loadFailedDescription')}
          </span>
          <button
            type="button"
            className="mt-1 min-h-11 rounded border border-[#00E5FF]/60 bg-[#00E5FF]/10 px-5 py-2 font-jetbrains text-body-sm font-semibold text-[#57EDFF] transition-colors hover:bg-[#00E5FF]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0C1117]"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
          >
            {t('common.retry')}
          </button>
        </div>
      ) : loading ? (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3"
          style={{ backgroundColor: 'var(--bg-terminal)' }}
          role="status"
          aria-live="polite"
        >
          <div className="w-6 h-6 border-2 border-[#00E5FF] border-t-transparent rounded-full animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <span className="font-jetbrains text-body-sm text-[#788DA1]">{t('terminal.initializing')}</span>
        </div>
      ) : null}
      <div
        ref={containerRef}
        className="w-full h-full overflow-hidden"
        style={{
          padding: '12px',
          ...focusStyle,
          transition: 'box-shadow 200ms var(--ease-default)',
        }}
        tabIndex={loading ? -1 : 0}
        role="application"
        aria-label={t('terminal.inputOutputLabel')}
        aria-hidden={loading}
      />
    </div>
  )
}
