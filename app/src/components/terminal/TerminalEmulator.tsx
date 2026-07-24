import { useCallback, useEffect, useRef, useState } from 'react'
import type { Terminal as XTermType } from '@xterm/xterm'
import type { FitAddon as FitAddonType } from '@xterm/addon-fit'
import type { ShellEngine } from '@/engine/shell'

export interface TerminalAction {
  command: string
  exitCode: number
  kind: 'command' | 'interaction'
}

interface TerminalEmulatorProps {
  shell: ShellEngine
  onModeChange: (mode: string) => void
  onCommandExecuted: (action: TerminalAction) => void
  successPulse: boolean
}

const MAX_OUTPUT = 5000
const REPL_MODES = ['node', 'python', 'psql', 'sqlite'] as const

function safeWrite(term: XTermType, data: string) {
  try { term.write(data) } catch { /* The terminal may already be disposed. */ }
}

function safeWriteLn(term: XTermType, data: string) {
  try { term.writeln(data) } catch { /* The terminal may already be disposed. */ }
}

export default function TerminalEmulator({
  shell,
  onModeChange,
  onCommandExecuted,
  successPulse,
}: TerminalEmulatorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTermType | null>(null)
  const fitRef = useRef<FitAddonType | null>(null)
  const inputBufferRef = useRef('')
  const currentModeRef = useRef('shell')
  const tmuxPrefixRef = useRef(false)
  const shellRef = useRef(shell)
  shellRef.current = shell

  // Callback refs keep the xterm instance stable while still using fresh props.
  const onModeChangeRef = useRef(onModeChange)
  const onCommandExecutedRef = useRef(onCommandExecuted)
  const writePromptRef = useRef<((term: XTermType) => void) | null>(null)
  onModeChangeRef.current = onModeChange
  onCommandExecutedRef.current = onCommandExecuted

  const [hasFocus, setHasFocus] = useState(false)
  const [loading, setLoading] = useState(true)

  const writePrompt = useCallback((term: XTermType) => {
    safeWrite(term, `\r\n${shellRef.current.getPrompt()}`)
  }, [])
  writePromptRef.current = writePrompt

  useEffect(() => {
    let disposed = false
    let cleanupFn: (() => void) | null = null
    setLoading(true)
    inputBufferRef.current = ''
    currentModeRef.current = 'shell'
    tmuxPrefixRef.current = false

    const cbRef = {
      get onModeChange() { return onModeChangeRef.current },
      get onCommandExecuted() { return onCommandExecutedRef.current },
      get writePrompt() { return writePromptRef.current ?? writePrompt },
    }

    async function initTerminal() {
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-web-links'),
      ])
      await import('@xterm/xterm/css/xterm.css')

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
          brightBlack: '#4A6072',
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

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.loadAddon(new WebLinksAddon())
      term.open(container)
      fitAddon.fit()

      safeWriteLn(term, '\x1b[2J\x1b[H')
      safeWriteLn(term, '\x1b[38;5;6m=== Terminal Ghost Ops ===\x1b[0m')
      safeWriteLn(term, '\x1b[38;5;10mWelcome, operative. Your mission awaits.\x1b[0m')
      safeWriteLn(term, '')
      cbRef.writePrompt(term)

      const setMode = (mode: string) => {
        currentModeRef.current = mode
        cbRef.onModeChange(mode)
      }

      const recordAction = (action: string) => {
        cbRef.onCommandExecuted({ command: action, exitCode: 0, kind: 'interaction' })
      }

      const writeBoundedOutput = (output: string, color = '') => {
        if (!output) return
        const bounded = output.length > MAX_OUTPUT
          ? `${output.slice(0, MAX_OUTPUT)}\n\x1b[38;5;3m... output truncated (${output.length} chars total)\x1b[0m`
          : output
        safeWrite(term, color ? `${color}${bounded}\x1b[0m` : bounded)
        if (!bounded.endsWith('\n')) safeWriteLn(term, '')
      }

      const returnToShell = (action?: string) => {
        if (action) recordAction(action)
        inputBufferRef.current = ''
        tmuxPrefixRef.current = false
        setMode('shell')
        cbRef.writePrompt(term)
      }

      const showInteractiveMode = (mode: string, stdout: string) => {
        if (mode === 'less' || mode === 'man') {
          setMode('less')
          safeWriteLn(term, '')
          safeWriteLn(term, '\x1b[38;5;3m--- less pager --- Press q to quit ---\x1b[0m')
          const bounded = stdout.length > MAX_OUTPUT
            ? `${stdout.slice(0, MAX_OUTPUT)}\n... output truncated (${stdout.length} chars total)`
            : stdout
          bounded.split('\n').slice(0, 24).forEach(line => safeWriteLn(term, line))
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
          setMode('tmux')
          safeWriteLn(term, '')
          safeWriteLn(term, '\x1b[38;5;6m[tmux] session attached. Use Ctrl-b d to detach.\x1b[0m')
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

      const executeShellLine = (line: string, stayInTmux = false) => {
        safeWriteLn(term, '')
        if (!line) {
          cbRef.writePrompt(term)
          return
        }

        const result = shellRef.current.execute(line)
        cbRef.onCommandExecuted({ command: line, exitCode: result.exitCode, kind: 'command' })
        if (result.mode) {
          showInteractiveMode(result.mode, result.stdout)
          return
        }

        writeBoundedOutput(result.stdout)
        writeBoundedOutput(result.stderr, '\x1b[38;5;9m')
        setMode(stayInTmux ? 'tmux' : 'shell')
        cbRef.writePrompt(term)
      }

      const writeReplPrompt = (mode: string) => {
        if (mode === 'node') safeWrite(term, '\x1b[38;5;10m> \x1b[0m')
        else if (mode === 'python') safeWrite(term, '\x1b[38;5;10m>>> \x1b[0m')
        else if (mode === 'psql') safeWrite(term, 'postgres=# ')
        else if (mode === 'sqlite') safeWrite(term, 'sqlite> ')
      }

      const handleTerminalData = (data: string) => {
        try {
          // xterm reports Alt-. as an escape-prefixed sequence.
          if (data === '\x1b.') {
            recordAction('Alt-.')
            return
          }
          // Arrow/function-key escape sequences are handled by xterm itself.
          if (data.startsWith('\x1b[')) return
          // Pasted text may arrive as one chunk; process it like typed input.
          if (data.length > 1) {
            for (const character of data) handleTerminalData(character)
            return
          }

          const code = data.charCodeAt(0)
          const mode = currentModeRef.current

          if (mode === 'less') {
            if (data === 'q' || data === 'Q') {
              returnToShell('q')
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
                inputBufferRef.current = inputBufferRef.current.slice(0, -1)
                safeWrite(term, '\b \b')
              }
              return
            }
            if (code >= 32) {
              inputBufferRef.current += data
              safeWrite(term, data)
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
              if ([':q', ':q!', ':wq'].includes(command)) returnToShell()
              else setMode('vim:normal')
              return
            }
            if (data === '\x7f' && inputBufferRef.current.length > 1) {
              inputBufferRef.current = inputBufferRef.current.slice(0, -1)
              safeWrite(term, '\b \b')
              return
            }
            if (inputBufferRef.current.startsWith(':') && code >= 32) {
              inputBufferRef.current += data
              safeWrite(term, data)
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
              returnToShell('Ctrl-X')
            }
            return
          }

          if (REPL_MODES.includes(mode as typeof REPL_MODES[number])) {
            if (code === 4) {
              safeWrite(term, '^D')
              returnToShell('Ctrl-D')
              return
            }
            if (code === 3) {
              recordAction('Ctrl-C')
              inputBufferRef.current = ''
              safeWriteLn(term, '^C')
              writeReplPrompt(mode)
              return
            }
            if (data === '\x7f') {
              if (inputBufferRef.current.length > 0) {
                inputBufferRef.current = inputBufferRef.current.slice(0, -1)
                safeWrite(term, '\b \b')
              }
              return
            }
            if (data === '\r') {
              const line = inputBufferRef.current.trim()
              inputBufferRef.current = ''
              safeWriteLn(term, '')
              if (line) {
                recordAction(line)
                const shouldExit = (
                  (mode === 'node' && line === '.exit')
                  || (mode === 'python' && ['exit()', 'quit()'].includes(line))
                  || (mode === 'psql' && line === '\\q')
                  || (mode === 'sqlite' && ['.exit', '.quit'].includes(line))
                )
                if (shouldExit) {
                  returnToShell()
                  return
                }
              }
              writeReplPrompt(mode)
              return
            }
            if (code >= 32) {
              inputBufferRef.current += data
              safeWrite(term, data)
            }
            return
          }

          if (mode === 'tmux' && code === 2) {
            tmuxPrefixRef.current = true
            return
          }
          if (mode === 'tmux' && tmuxPrefixRef.current) {
            tmuxPrefixRef.current = false
            if (data.toLowerCase() === 'd') {
              safeWriteLn(term, '')
              returnToShell('Ctrl-b d')
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
            recordAction(controlAction)
            if (code === 3 || code === 4 || code === 26) {
              safeWrite(term, code === 3 ? '^C' : code === 4 ? '^D' : '^Z')
              inputBufferRef.current = ''
              cbRef.writePrompt(term)
            } else if (code === 21) {
              while (inputBufferRef.current.length > 0) {
                safeWrite(term, '\b \b')
                inputBufferRef.current = inputBufferRef.current.slice(0, -1)
              }
            }
            return
          }

          if (data === '\r') {
            const line = inputBufferRef.current.trim()
            inputBufferRef.current = ''
            executeShellLine(line, mode === 'tmux')
          } else if (data === '\x7f') {
            if (inputBufferRef.current.length > 0) {
              inputBufferRef.current = inputBufferRef.current.slice(0, -1)
              safeWrite(term, '\b \b')
            }
          } else if (code >= 32) {
            inputBufferRef.current += data
            safeWrite(term, data)
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          safeWriteLn(term, '')
          safeWriteLn(term, `\x1b[38;5;9m[terminal error: ${message}]\x1b[0m`)
          inputBufferRef.current = ''
          try { cbRef.writePrompt(term) } catch { /* The terminal may be gone. */ }
        }
      }

      term.onData(handleTerminalData)
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

      termRef.current = term
      fitRef.current = fitAddon
      term.focus()
      setLoading(false)

      const handleResize = () => {
        try { fitAddon.fit() } catch { /* Ignore a resize during disposal. */ }
      }
      window.addEventListener('resize', handleResize)

      const handleFocus = () => setHasFocus(true)
      const handleBlur = () => setHasFocus(false)
      container.addEventListener('focusin', handleFocus)
      container.addEventListener('focusout', handleBlur)

      cleanupFn = () => {
        try {
          window.removeEventListener('resize', handleResize)
          container.removeEventListener('keydown', handleControlKeyDown, true)
          container.removeEventListener('focusin', handleFocus)
          container.removeEventListener('focusout', handleBlur)
        } catch { /* The container may already be gone. */ }
        try { term.dispose() } catch { /* Avoid a double-dispose crash. */ }
        termRef.current = null
        fitRef.current = null
      }
    }

    void initTerminal()

    return () => {
      disposed = true
      if (cleanupFn) cleanupFn()
    }
  }, [shell, writePrompt])

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
      {loading && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3"
          style={{ backgroundColor: 'var(--bg-terminal)' }}
        >
          <div className="w-6 h-6 border-2 border-[#00E5FF] border-t-transparent rounded-full animate-spin" />
          <span className="font-jetbrains text-body-sm text-[#4A6072]">Initializing terminal...</span>
        </div>
      )}
      <div
        ref={containerRef}
        className="w-full h-full overflow-hidden"
        style={{
          padding: '12px',
          ...focusStyle,
          transition: 'box-shadow 200ms var(--ease-default)',
        }}
        tabIndex={0}
        role="application"
        aria-label="Terminal input and output"
      />
    </div>
  )
}
