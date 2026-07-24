import { VFS } from './vfs'

// Safety limits to prevent browser freeze from infinite loops / excessive output
const MAX_OUTPUT_LENGTH = 10000
const TRUNCATION_MSG = '\n... (output truncated)\n'
const MAX_GREP_INPUT = 50000

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface ShellResult {
  stdout: string
  stderr: string
  exitCode: number
  mode?: string
}

export interface ShellState {
  cwd: string[]
  env: Record<string, string>
  lastExitCode: number
  history: string[]
  aliases: Record<string, string>
  dirStack: string[][]
  umask: number
}

// Simulated state for various subsystems
export interface SimulatedServices {
  npmPackages: Map<string, string>
  installedPackages: string[]
  services: Map<string, { status: string; enabled: boolean; description: string }>
  dockerContainers: Map<string, { image: string; status: string; ports: string; names: string }>
  dockerImages: Map<string, { tag: string; size: string; created: string }>
  dockerNetworks: Map<string, { driver: string }>
  dockerVolumes: Map<string, string>
  tmuxSessions: Map<string, { windows: number; attached: boolean }>
  screenSessions: Map<string, { attached: boolean }>
  zellijSessions: Map<string, { attached: boolean }>
  kubectlContexts: string[]
  kubectlCurrentContext: string
  kubectlPods: Map<string, { status: string; restarts: number; age: string; namespace: string; node: string; cpu: string; mem: string }>
  kubectlNodes: Map<string, { status: string; roles: string; age: string; version: string; cpu: string; mem: string }>
  kubectlServices: Map<string, { type: string; clusterIP: string; ports: string; namespace: string }>
  kubectlDeployments: Map<string, { ready: string; upToDate: number; available: number; namespace: string }>
  cronJobs: Map<string, string>
  systemLogs: string[]
  containerLogs: Map<string, string[]>
}

function createSimulatedServices(): SimulatedServices {
  const svc = new Map<string, { status: string; enabled: boolean; description: string }>()
  svc.set('nginx', { status: 'running', enabled: true, description: 'A high performance web server' })
  svc.set('postgresql', { status: 'running', enabled: true, description: 'PostgreSQL database server' })
  svc.set('redis', { status: 'running', enabled: true, description: 'Advanced key-value store' })
  svc.set('ssh', { status: 'running', enabled: true, description: 'OpenSSH server' })
  svc.set('docker', { status: 'running', enabled: true, description: 'Docker daemon' })
  svc.set('neonmall', { status: 'running', enabled: true, description: 'NeonMall application service' })
  svc.set('fail2ban', { status: 'stopped', enabled: false, description: 'Ban hosts that cause authentication errors' })
  svc.set('cron', { status: 'running', enabled: true, description: 'Regular background processing daemon' })
  svc.set('systemd-journald', { status: 'running', enabled: true, description: 'Journal service' })

  const containers = new Map<string, { image: string; status: string; ports: string; names: string }>()
  containers.set('abc123', { image: 'nginx:alpine', status: 'Up 3 days', ports: '0.0.0.0:80->80/tcp', names: 'web' })
  containers.set('def456', { image: 'postgres:15', status: 'Up 5 days', ports: '0.0.0.0:5432->5432/tcp', names: 'db' })
  containers.set('ghi789', { image: 'redis:7', status: 'Up 2 days', ports: '0.0.0.0:6379->6379/tcp', names: 'cache' })
  containers.set('jkl012', { image: 'node:20', status: 'Exited (0) 1 day ago', ports: '', names: 'builder' })

  const images = new Map<string, { tag: string; size: string; created: string }>()
  images.set('nginx', { tag: 'alpine', size: '23.6MB', created: '2 weeks ago' })
  images.set('postgres', { tag: '15', size: '379MB', created: '3 weeks ago' })
  images.set('redis', { tag: '7', size: '117MB', created: '1 month ago' })
  images.set('node', { tag: '20', size: '1.1GB', created: '2 weeks ago' })
  images.set('ubuntu', { tag: '22.04', size: '78.1MB', created: '2 months ago' })

  const networks = new Map<string, { driver: string }>()
  networks.set('bridge', { driver: 'bridge' })
  networks.set('host', { driver: 'host' })
  networks.set('none', { driver: 'null' })
  networks.set('neonmall_default', { driver: 'bridge' })

  const volumes = new Map<string, string>()
  volumes.set('pgdata', 'local')
  volumes.set('redisdata', 'local')
  volumes.set('neonmall_uploads', 'local')

  const pods = new Map<string, { status: string; restarts: number; age: string; namespace: string; node: string; cpu: string; mem: string }>()
  pods.set('neonmall-web-7d9f4b8c5-x2v4p', { status: 'Running', restarts: 0, age: '3d', namespace: 'default', node: 'k8s-worker-1', cpu: '12m', mem: '64Mi' })
  pods.set('neonmall-api-5c8a2f1d9-z7k3m', { status: 'Running', restarts: 1, age: '5d', namespace: 'default', node: 'k8s-worker-1', cpu: '45m', mem: '128Mi' })
  pods.set('postgres-0', { status: 'Running', restarts: 0, age: '12d', namespace: 'default', node: 'k8s-worker-2', cpu: '67m', mem: '256Mi' })
  pods.set('redis-master-6b5f9c4d8-4w9q2', { status: 'Running', restarts: 0, age: '8d', namespace: 'default', node: 'k8s-worker-2', cpu: '8m', mem: '32Mi' })

  const nodes = new Map<string, { status: string; roles: string; age: string; version: string; cpu: string; mem: string }>()
  nodes.set('k8s-master', { status: 'Ready', roles: 'control-plane', age: '30d', version: 'v1.28.4', cpu: '210m', mem: '1.2Gi' })
  nodes.set('k8s-worker-1', { status: 'Ready', roles: '<none>', age: '30d', version: 'v1.28.4', cpu: '312m', mem: '2.1Gi' })
  nodes.set('k8s-worker-2', { status: 'Ready', roles: '<none>', age: '28d', version: 'v1.28.4', cpu: '198m', mem: '1.8Gi' })

  const services = new Map<string, { type: string; clusterIP: string; ports: string; namespace: string }>()
  services.set('neonmall-web', { type: 'LoadBalancer', clusterIP: '10.43.12.45', ports: '80:30080/TCP', namespace: 'default' })
  services.set('neonmall-api', { type: 'ClusterIP', clusterIP: '10.43.23.67', ports: '3000/TCP', namespace: 'default' })
  services.set('postgres', { type: 'ClusterIP', clusterIP: '10.43.45.89', ports: '5432/TCP', namespace: 'default' })
  services.set('redis', { type: 'ClusterIP', clusterIP: '10.43.56.12', ports: '6379/TCP', namespace: 'default' })

  const deployments = new Map<string, { ready: string; upToDate: number; available: number; namespace: string }>()
  deployments.set('neonmall-web', { ready: '3/3', upToDate: 3, available: 3, namespace: 'default' })
  deployments.set('neonmall-api', { ready: '2/2', upToDate: 2, available: 2, namespace: 'default' })
  deployments.set('redis-master', { ready: '1/1', upToDate: 1, available: 1, namespace: 'default' })

  return {
    npmPackages: new Map(),
    installedPackages: ['lodash', 'express', 'react', 'typescript', '@types/node', 'jest', 'eslint'],
    services: svc,
    dockerContainers: containers,
    dockerImages: images,
    dockerNetworks: networks,
    dockerVolumes: volumes,
    tmuxSessions: new Map([['0', { windows: 1, attached: false }]]),
    screenSessions: new Map(),
    zellijSessions: new Map(),
    kubectlContexts: ['minikube', 'production', 'staging'],
    kubectlCurrentContext: 'minikube',
    kubectlPods: pods,
    kubectlNodes: nodes,
    kubectlServices: services,
    kubectlDeployments: deployments,
    cronJobs: new Map([['0 2 * * *', '/usr/local/bin/backup.sh'], ['*/15 * * * *', '/usr/local/bin/health-check.sh']]),
    systemLogs: [
      'Jun 10 08:00:01 neonmall-server systemd[1]: Started NeonMall Service',
      'Jun 10 08:15:23 neonmall-server app[456]: DB connection established',
      'Jun 10 08:30:00 neonmall-server nginx[1891]: 200 GET /api/health',
      'Jun 10 09:00:00 neonmall-server cron[1023]: (root) CMD (/usr/local/bin/backup.sh)',
      'Jun 10 09:15:42 neonmall-server kernel: [UFW BLOCK] IN=eth0 OUT= MAC=... SRC=192.168.1.100',
      'Jun 10 10:00:00 neonmall-server systemd[1]: Reloaded NeonMall Service',
      'Jun 10 10:30:15 neonmall-server sshd[2100]: Accepted publickey for ghost from 10.0.0.5',
      'Jun 10 11:00:00 neonmall-server cron[1023]: (ghost) CMD (/home/ghost/scripts/sync.sh)',
      'Jun 10 12:00:00 neonmall-server postgres[2010]: checkpoint starting: time',
      'Jun 10 12:05:00 neonmall-server postgres[2010]: checkpoint complete',
    ],
    containerLogs: new Map(),
  }
}

export function createShellState(): ShellState {
  return {
    cwd: ['home', 'ghost'],
    env: {
      HOME: '/home/ghost',
      USER: 'ghost',
      PATH: '/usr/local/bin:/usr/bin:/bin',
      PWD: '/home/ghost',
      PS1: '$ ',
      TERM: 'xterm-256color',
      SHELL: '/bin/bash',
      EDITOR: 'vim',
      LANG: 'en_US.UTF-8',
      NODE_ENV: 'development',
    },
    lastExitCode: 0,
    history: [],
    aliases: {
      ll: 'ls -la',
      la: 'ls -a',
      l: 'ls -CF',
      '..': 'cd ..',
    },
    dirStack: [],
    umask: 0o022,
  }
}

function expandVars(str: string, env: Record<string, string>): string {
  return str.replace(/\$\{(\w+)\}|\$(\w+)/g, (_, a, b) => env[a || b] || '')
}

function parseLine(line: string): string[][] {
  const tokens: string[] = []
  let cur = ''
  let inQuote: '"' | "'" | null = null
  let escape = false

  for (const ch of line) {
    if (escape) {
      cur += ch
      escape = false
      continue
    }
    if (ch === '\\' && inQuote !== "'") {
      escape = true
      cur += ch
      continue
    }
    if (inQuote) {
      if (ch === inQuote) { inQuote = null }
      cur += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch
      cur += ch
      continue
    }
    if (ch === ' ' || ch === '\t') {
      if (cur.length > 0) { tokens.push(cur); cur = '' }
      continue
    }
    cur += ch  }
  if (cur.length > 0) tokens.push(cur)

  const cmds: string[][] = [[]]
  let idx = 0
  while (idx < tokens.length) {
    const t = tokens[idx]
    if (t === '|') { cmds.push([]) }
    else { cmds[cmds.length - 1].push(t) }
    idx++
  }
  if (cmds[cmds.length - 1].length === 0 && cmds.length > 1) cmds.pop()
  return cmds.filter(c => c.length > 0)
}

function _tokenizeWithRedirects(args: string[]): { args: string[]; redirects: { type: string; target: string }[] } {
  const outArgs: string[] = []
  const redirects: { type: string; target: string }[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '>' && i + 1 < args.length) { redirects.push({ type: '>', target: args[++i] }) }
    else if (args[i] === '>>' && i + 1 < args.length) { redirects.push({ type: '>>', target: args[++i] }) }
    else if (args[i] === '2>' && i + 1 < args.length) { redirects.push({ type: '2>', target: args[++i] }) }
    else if (args[i] === '2>>' && i + 1 < args.length) { redirects.push({ type: '2>>', target: args[++i] }) }
    else if (args[i] === '<' && i + 1 < args.length) { redirects.push({ type: '<', target: args[++i] }) }
    else { outArgs.push(args[i]) }
  }
  return { args: outArgs, redirects }
}

function formatSize(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`
  return `${(n / (1024 * 1024)).toFixed(1)}M`
}

function formatDate(d: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const now = new Date()
  const mon = months[d.getMonth()]
  const day = String(d.getDate()).padStart(2, ' ')
  if (d.getFullYear() !== now.getFullYear()) {
    return `${mon} ${day}  ${d.getFullYear()}`
  }
  return `${mon} ${day} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function isRedCommand(cmd: string): boolean {
  const redCommands = ['rm', 'dd', 'mkfs', 'fdisk', 'shutdown', 'reboot', 'kill', 'pkill', 'chmod', 'chown', '>',
    'docker', 'kubectl', 'systemctl', 'shred', 'apt', 'yum', 'dnf', 'pacman']
  const base = cmd.split('/').pop() || cmd
  return redCommands.some(c => base.startsWith(c))
}


export class ShellEngine {
  state: ShellState
  vfs: VFS
  services: SimulatedServices
  private onRedCommand?: (cmd: string) => void

  constructor(vfs: VFS, state?: ShellState, onRedCommand?: (cmd: string) => void) {
    this.vfs = vfs
    this.state = state ?? createShellState()
    this.services = createSimulatedServices()
    this.onRedCommand = onRedCommand
  }

  execute(line: string, depth: number = 0): ShellResult {
    try {
      if (depth > 10) {
        return { stdout: '', stderr: 'alias: too many levels of recursion', exitCode: 1 }
      }
      if (line.trim() === '') return { stdout: '', stderr: '', exitCode: 0 }
      this.state.history.push(line)

      const trimmed = line.trim()
      const aliasCmd = trimmed.split(' ')[0]
      if (this.state.aliases[aliasCmd] && !this.state.history.slice(0, -1).includes(trimmed)) {
        const expansion = this.state.aliases[aliasCmd] + trimmed.slice(aliasCmd.length)
        return this.execute(expansion, depth + 1)
      }

      const cmds = parseLine(trimmed)
      let prevStdout = ''

      for (let ci = 0; ci < cmds.length; ci++) {
        const rawTokens = cmds[ci].map(t => expandVars(t, this.state.env))
        const { args, redirects } = _tokenizeWithRedirects(rawTokens)
        const stdin = ci === 0 ? '' : prevStdout

        let result: ShellResult
        try {
          result = this.runCommand(args, stdin)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          result = { stdout: '', stderr: `internal error: ${msg}`, exitCode: 1 }
        }

        // Truncate stdout/stderr if too long to prevent browser freeze
        if (result.stdout.length > MAX_OUTPUT_LENGTH) {
          result.stdout = result.stdout.slice(0, MAX_OUTPUT_LENGTH) + TRUNCATION_MSG
        }
        if (result.stderr.length > MAX_OUTPUT_LENGTH) {
          result.stderr = result.stderr.slice(0, MAX_OUTPUT_LENGTH) + TRUNCATION_MSG
        }

        for (const red of redirects) {
          try {
            if (red.type === '>') this.vfs.writeFile(red.target, this.state.cwd, result.stdout)
            if (red.type === '>>') this.vfs.writeFile(red.target, this.state.cwd, result.stdout, true)
            if (red.type === '2>') this.vfs.writeFile(red.target, this.state.cwd, result.stderr)
            if (red.type === '2>>') this.vfs.writeFile(red.target, this.state.cwd, result.stderr, true)
            if (red.type === '<') {
              const fc = this.vfs.readFile(red.target, this.state.cwd)
              if (!fc.error) result.stdout = fc.content
            }
          } catch (redirectErr) {
            result.stderr += `\nredirect error: ${redirectErr instanceof Error ? redirectErr.message : String(redirectErr)}`
          }
        }

        this.state.lastExitCode = result.exitCode
        if (result.exitCode !== 0 && cmds.length > 1) {
          return { stdout: prevStdout, stderr: result.stderr, exitCode: result.exitCode }
        }
        prevStdout = result.stdout
      }

      // Truncate final output if too long
      if (prevStdout.length > MAX_OUTPUT_LENGTH) {
        prevStdout = prevStdout.slice(0, MAX_OUTPUT_LENGTH) + TRUNCATION_MSG
      }

      return { stdout: prevStdout, stderr: '', exitCode: this.state.lastExitCode }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { stdout: '', stderr: `shell error: ${msg}`, exitCode: 1 }
    }
  }

  private runCommand(args: string[], stdin: string): ShellResult {
    try {
      if (args.length === 0) return { stdout: '', stderr: '', exitCode: 0 }

      const expanded = args.map(a => {
        if ((a.startsWith('"') && a.endsWith('"')) || (a.startsWith("'") && a.endsWith("'"))) return a.slice(1, -1)
        return a
      })
      const cmd = expanded[0]
      const cargs = expanded.slice(1)

      if (isRedCommand(cmd) && this.onRedCommand) {
        this.onRedCommand(cmd)
      }

      switch (cmd) {
      // === NAVIGATION & FILESYSTEM ===
      case 'cd': return this.cmdCd(cargs)
      case 'pwd': return this.cmdPwd(cargs)
      case 'ls': return this.cmdLs(cargs)
      case 'cat': return this.cmdCat(cargs)
      case 'head': return this.cmdHead(cargs)
      case 'tail': return this.cmdTail(cargs)
      case 'touch': return this.cmdTouch(cargs)
      case 'mkdir': return this.cmdMkdir(cargs)
      case 'cp': return this.cmdCp(cargs)
      case 'mv': return this.cmdMv(cargs)
      case 'rm': return this.cmdRm(cargs)
      case 'ln': return this.cmdLn(cargs)
      case 'echo': return this.cmdEcho(cargs)
      case 'grep': return this.cmdGrep(cargs, stdin)
      case 'find': return this.cmdFind(cargs)
      case 'sort': return this.cmdSort(cargs, stdin)
      case 'uniq': return this.cmdUniq(cargs, stdin)
      case 'wc': return this.cmdWc(cargs, stdin)
      case 'xargs': return this.cmdXargs(cargs, stdin)
      case 'awk': return this.cmdAwk(cargs, stdin)
      case 'sed': return this.cmdSed(cargs, stdin)
      case 'chmod': return this.cmdChmod(cargs)
      case 'chown': return this.cmdChown(cargs)
      case 'id': return this.cmdId(cargs)
      case 'whoami': return { stdout: this.vfs.getCurrentUser(), stderr: '', exitCode: 0 }
      case 'groups': return { stdout: 'ghost sudo', stderr: '', exitCode: 0 }
      case 'sudo': return this.cmdSudo(cargs)
      // === PROCESS ===
      case 'ps': return this.cmdPs(cargs)
      case 'kill': return this.cmdKill(cargs)
      case 'df': return this.cmdDf(cargs)
      case 'du': return this.cmdDu(cargs)
      case 'curl': return this.cmdCurl(cargs)
      case 'ping': return this.cmdPing(cargs)
      case 'top': return this.cmdTop(cargs)
      case 'pgrep': case 'pkill': return this.cmdPgrep(cargs, cmd)
      // === NETWORK TOOLS ===
      case 'ss': return this.cmdSs(cargs)
      case 'dig': return this.cmdDig(cargs)
      case 'nc': case 'netcat': return this.cmdNc(cargs)
      // === COMPRESSION/ARCHIVES ===
      case 'tar': return this.cmdTar(cargs)
      case 'gzip': return this.cmdGzip(cargs)
      case 'gunzip': return this.cmdGunzip(cargs)
      case 'zcat': return this.cmdZcat(cargs)
      case 'bzip2': return this.cmdBzip2(cargs)
      case 'bunzip2': return this.cmdBunzip2(cargs)
      case 'xz': return this.cmdXz(cargs)
      case 'unxz': return this.cmdUnxz(cargs)
      case 'zip': return this.cmdZip(cargs)
      case 'unzip': return this.cmdUnzip(cargs)
      // === TEXT PROCESSING ===
      case 'cut': return this.cmdCut(cargs, stdin)
      case 'tr': return this.cmdTr(cargs, stdin)
      case 'paste': return this.cmdPaste(cargs, stdin)
      case 'comm': return this.cmdComm(cargs)
      case 'expand': return this.cmdExpand(cargs, stdin)
      case 'unexpand': return this.cmdUnexpand(cargs, stdin)
      case 'diff': return this.cmdDiff(cargs)
      case 'jq': return this.cmdJq(cargs, stdin)
      // === FILE OPERATIONS ===
      case 'tree': return this.cmdTree(cargs)
      case 'stat': return this.cmdStat(cargs)
      case 'shred': return this.cmdShred(cargs)
      case 'install': return this.cmdInstall(cargs)
      // === PACKAGE MANAGEMENT ===
      case 'npm': return this.cmdNpm(cargs)
      case 'npx': return this.cmdNpx(cargs)
      case 'yarn': return this.cmdYarn(cargs)
      case 'pnpm': return this.cmdPnpm(cargs)
      // === SYSTEM SERVICES ===
      case 'systemctl': return this.cmdSystemctl(cargs)
      case 'journalctl': return this.cmdJournalctl(cargs)
      case 'dmesg': return this.cmdDmesg(cargs)
      case 'logger': return this.cmdLogger(cargs)
      case 'service': return this.cmdService(cargs)
      case 'crontab': return this.cmdCrontab(cargs)
      // === DOCKER ===
      case 'docker': return this.cmdDocker(cargs)
      // === KUBERNETES ===
      case 'kubectl': return this.cmdKubectl(cargs)
      // === DEVELOPMENT TOOLS ===
      case 'make': return this.cmdMake(cargs)
      case 'node': return this.cmdNode(cargs, stdin)
      case 'python': case 'python3': return this.cmdPython(cargs, stdin)
      case 'go': return this.cmdGo(cargs)
      case 'cargo': return this.cmdCargo(cargs)
      // === TERMINAL MULTIPLEXERS ===
      case 'tmux': return this.cmdTmux(cargs)
      case 'screen': return this.cmdScreen(cargs)
      case 'zellij': return this.cmdZellij(cargs)
      // === SHELL BUILTINS ===
      case 'export': return this.cmdExport(cargs)
      case 'unset': return this.cmdUnset(cargs)
      case 'env': case 'printenv': return this.cmdEnv(cargs)
      case 'source': case '.': return this.cmdSource(cargs)
      case 'history': return this.cmdHistory(cargs)
      case 'alias': return this.cmdAlias(cargs)
      case 'unalias': return this.cmdUnalias(cargs)
      case 'pushd': return this.cmdPushd(cargs)
      case 'popd': return this.cmdPopd(cargs)
      case 'dirs': return { stdout: this.state.dirStack.map(d => '/' + d.join('/')).join(' ') + (this.state.dirStack.length ? ' ' : '') + '/' + this.state.cwd.join('/'), stderr: '', exitCode: 0 }
      case 'rev': return { stdout: stdin.split('').reverse().join(''), stderr: '', exitCode: 0 }
      case 'seq': return this.cmdSeq(cargs)
      case 'basename': return { stdout: cargs[0] ? cargs[0].replace(/\\/g, '/').split('/').pop() || '' : '', stderr: '', exitCode: 0 }
      case 'dirname': {
        const p = (cargs[0] || '.').replace(/\\/g, '/')
        const last = p.lastIndexOf('/')
        return { stdout: last > 0 ? p.slice(0, last) || '/' : (p.startsWith('/') ? '/' : '.'), stderr: '', exitCode: 0 }
      }
      case 'hostname': return { stdout: 'neonmall-server', stderr: '', exitCode: 0 }
      case 'uptime': return { stdout: ' 08:00:00 up 15 days,  3:42,  1 user,  load average: 0.52, 0.58, 0.59', stderr: '', exitCode: 0 }
      case 'free': return { stdout: '              total        used        free\nMem:        8192000     4096000     4096000\nSwap:       2097152      104857     1992295', stderr: '', exitCode: 0 }
      case 'watch': return { stdout: 'Every 2.0s: ' + cargs.join(' ') + '\n\n' + this.runCommand(cargs, '').stdout, stderr: '', exitCode: 0 }
      case 'timeout': return this.runCommand(cargs, stdin)
      case 'tee': return { stdout: stdin, stderr: '', exitCode: 0 }
      case 'date': return { stdout: new Date().toISOString().replace('T', ' ').slice(0, 19), stderr: '', exitCode: 0 }
      case 'true': return { stdout: '', stderr: '', exitCode: 0 }
      case 'false': return { stdout: '', stderr: '', exitCode: 1 }
      // === INFO ===
      case 'man': return this.cmdMan(cargs)
      case 'which': return this.cmdWhich(cargs)
      case 'type': return this.cmdWhich(cargs)
      case 'uname': return this.cmdUname(cargs)
      case 'clear': return { stdout: '\x1b[2J\x1b[H', stderr: '', exitCode: 0 }
      case 'exit': return { stdout: '', stderr: '', exitCode: 0, mode: 'exit' }
      // === EDITORS ===
      case 'less': return { stdout: '', stderr: '', exitCode: 0, mode: 'less' }
      case 'vim': case 'vi': return { stdout: '', stderr: '', exitCode: 0, mode: 'vim' }
      case 'nano': return { stdout: '', stderr: '', exitCode: 0, mode: 'nano' }
      // === GIT ===
      case 'git': return { stdout: '', stderr: 'Use the git engine directly.', exitCode: 0 }
      default:
        if (cmd.startsWith('./') || cmd.startsWith('/')) {
          const parts = this.vfs.resolvePath(cmd, this.state.cwd)
          const st = this.vfs.stat(parts.join('/'), [])
          if (st.node) return { stdout: `Executing ${cmd}...`, stderr: '', exitCode: 0 }
          return { stdout: '', stderr: `bash: ${cmd}: No such file or directory`, exitCode: 127 }
        }
        if (cmd.startsWith('#')) return { stdout: '', stderr: '', exitCode: 0 }
        return { stdout: '', stderr: `bash: ${cmd}: command not found`, exitCode: 127 }
    }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { stdout: '', stderr: `command error: ${msg}`, exitCode: 1 }
    }
  }


  // === EXISTING FILE/NAVIGATION COMMANDS ===

  private cmdCd(args: string[]): ShellResult {
    const target = args[0] || this.state.env.HOME
    if (target === '-') {
      return { stdout: '', stderr: '', exitCode: 0 }
    }
    if (target === '..') { if (this.state.cwd.length > 0) this.state.cwd.pop() }
    else if (target === '~' || target === this.state.env.HOME) { this.state.cwd = ['home', 'ghost'] }
    else {
      const parts = this.vfs.resolvePath(target, this.state.cwd)
      const st = this.vfs.stat(parts.join('/'), [])
      if (!st.node) return { stdout: '', stderr: `cd: ${target}: No such file or directory`, exitCode: 1 }
      if (st.node.type !== 'directory') return { stdout: '', stderr: `cd: ${target}: Not a directory`, exitCode: 1 }
      this.state.cwd = parts
    }
    this.state.env.PWD = '/' + this.state.cwd.join('/')
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdPwd(_: string[]): ShellResult {
    void _
    return { stdout: '/' + this.state.cwd.join('/'), stderr: '', exitCode: 0 }
  }

  private cmdLs(args: string[]): ShellResult {
    let showAll = false
    let longFormat = false
    let human = false
    let recursive = false
    let sortTime = false
    let sortSize = false
    const paths: string[] = []

    for (const a of args) {
      if (a.startsWith('-') && a.length > 1) {
        for (const ch of a.slice(1)) {
          if (ch === 'a') showAll = true
          if (ch === 'l') longFormat = true
          if (ch === 'h') human = true
          if (ch === 'R') recursive = true
          if (ch === 't') sortTime = true
          if (ch === 'S') sortSize = true
        }
      } else { paths.push(a) }
    }
    if (paths.length === 0) paths.push('.')

    let stdout = ''
    for (const p of paths) {
      const { entries, error } = this.vfs.listDirectory(p, this.state.cwd)
      if (error) return { stdout, stderr: error, exitCode: 2 }
      let filtered = entries
      if (!showAll) filtered = filtered.filter(e => !e.name.startsWith('.'))

      if (sortTime) filtered.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
      else if (sortSize) filtered.sort((a, b) => b.size - a.size)

      if (longFormat) {
        if (paths.length > 1) stdout += `${p}:\n`
        for (const e of filtered) {
          const type = e.type === 'directory' ? 'd' : (e.type === 'symlink' ? 'l' : '-')
          const size = human ? formatSize(e.size) : String(e.size).padStart(8)
          stdout += `${type}${e.permissions} ${String(1).padStart(2)} ${e.owner.padEnd(8)} ${e.group.padEnd(8)} ${size} ${formatDate(e.mtime)} ${e.name}\n`
        }
      } else {
        if (paths.length > 1) stdout += `${p}:\n`
        for (const e of filtered) stdout += `${e.name}${e.type === 'directory' ? '/' : (e.type === 'symlink' ? '@' : ' ')}  `
        if (filtered.length > 0) stdout += '\n'
      }

      if (recursive) {
        const maxDepth = 5
        const doRecurse = (dirPath: string, depth: number): string => {
          if (depth > maxDepth) return '\n  ... (max recursion depth reached) ...\n'
          let out = ''
          const entries = this.vfs.listDirectory(dirPath, this.state.cwd)
          if (entries.error) return out
          const dirs = entries.entries!.filter(x => x.type === 'directory' && !['.', '..'].includes(x.name))
          for (const e of dirs) {
            const subPath = dirPath === '/' ? `/${e.name}` : `${dirPath}/${e.name}`
            const sub = this.vfs.listDirectory(subPath, this.state.cwd)
            if (!sub.error) {
              out += `\n${subPath}:\n`
              for (const se of sub.entries!) {
                const type = se.type === 'directory' ? 'd' : (se.type === 'symlink' ? 'l' : '-')
                const size = human ? formatSize(se.size) : String(se.size).padStart(8)
                if (longFormat) {
                  out += `${type}${se.permissions} ${String(1).padStart(2)} ${se.owner.padEnd(8)} ${se.group.padEnd(8)} ${size} ${formatDate(se.mtime)} ${se.name}\n`
                } else {
                  out += `${se.name}${se.type === 'directory' ? '/' : ' '}  `
                }
              }
              if (!longFormat && sub.entries!.length > 0) out += '\n'
              out += doRecurse(subPath, depth + 1)
            }
          }
          return out
        }
        const rootPath = p === '.' ? '/' + this.state.cwd.join('/') : p
        stdout += doRecurse(rootPath, 1)
      }
    }
    return { stdout, stderr: '', exitCode: 0 }
  }

  private cmdCat(args: string[]): ShellResult {
    if (args.length === 0) return { stdout: '', stderr: '', exitCode: 0 }
    let stdout = ''
    for (const f of args) {
      const res = this.vfs.readFile(f, this.state.cwd)
      if (res.error) return { stdout, stderr: res.error, exitCode: 1 }
      const content = res.content || ''
      stdout += content
      if (!content.endsWith('\n')) stdout += '\n'
    }
    return { stdout, stderr: '', exitCode: 0 }
  }

  private cmdHead(args: string[]): ShellResult {
    let n = 10
    let idx = 0
    if (args[0] === '-n' && args[1]) { n = parseInt(args[1]); idx = 2 }
    else if (args[0]?.startsWith('-')) { n = parseInt(args[0].slice(1)); idx = 1 }
    const f = args[idx]
    if (!f) return { stdout: '', stderr: '', exitCode: 0 }
    const res = this.vfs.readFile(f, this.state.cwd)
    if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
    const lines = res.content.split('\n')
    return { stdout: lines.slice(0, n).join('\n') + '\n', stderr: '', exitCode: 0 }
  }

  private cmdTail(args: string[]): ShellResult {
    let n = 10
    let idx = 0
    if (args[0] === '-n' && args[1]) { n = parseInt(args[1]); idx = 2 }
    else if (args[0]?.startsWith('-')) { n = parseInt(args[0].slice(1)); idx = 1 }
    const f = args[idx]
    if (!f) return { stdout: '', stderr: '', exitCode: 0 }
    const res = this.vfs.readFile(f, this.state.cwd)
    if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
    const lines = res.content.split('\n')
    if (lines[lines.length - 1] === '') lines.pop()
    return { stdout: lines.slice(-n).join('\n') + '\n', stderr: '', exitCode: 0 }
  }

  private cmdTouch(args: string[]): ShellResult {
    if (args.length === 0) return { stdout: '', stderr: 'touch: missing file operand', exitCode: 1 }
    for (const f of args) {
      const st = this.vfs.stat(f, this.state.cwd)
      if (!st.node) this.vfs.writeFile(f, this.state.cwd, '')
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdMkdir(args: string[]): ShellResult {
    let parents = false
    const dirs = args.filter(a => { if (a === '-p') { parents = true; return false } return true })
    if (dirs.length === 0) return { stdout: '', stderr: 'mkdir: missing operand', exitCode: 1 }
    for (const d of dirs) {
      if (parents) {
        const parts = this.vfs.resolvePath(d, this.state.cwd)
        for (let i = 1; i <= parts.length; i++) {
          const sub = parts.slice(0, i).join('/')
          if (!sub) continue
          const st = this.vfs.stat(sub, [])
          if (!st.node) this.vfs.createDirectory(sub, [])
        }
      } else {
        const res = this.vfs.createDirectory(d, this.state.cwd)
        if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
      }
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdCp(args: string[]): ShellResult {
    let recursive = false
    const files = args.filter(a => {
      if (a === '-r' || a === '-R') { recursive = true; return false }
      if (a === '-i') return false
      if (a === '-n' || a === '-v') return false
      return true
    })
    if (files.length < 2) return { stdout: '', stderr: 'cp: missing destination file operand', exitCode: 1 }
    const dst = files.pop()!
    for (const src of files) {
      const res = this.vfs.copy(src, dst, this.state.cwd, recursive)
      if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdMv(args: string[]): ShellResult {
    const files = args.filter(a => !['-i', '-n', '-v', '-f'].includes(a))
    if (files.length < 2) return { stdout: '', stderr: 'mv: missing destination file operand', exitCode: 1 }
    const dst = files.pop()!
    for (const src of files) {
      const res = this.vfs.move(src, dst, this.state.cwd)
      if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdRm(args: string[]): ShellResult {
    let recursive = false
    let force = false
    const files = args.filter(a => {
      if (a === '-r' || a === '-R') { recursive = true; return false }
      if (a === '-f') { force = true; return false }
      if (a === '-i') return false
      return true
    })
    if (files.length === 0) return { stdout: '', stderr: 'rm: missing operand', exitCode: 1 }
    for (const f of files) {
      const st = this.vfs.stat(f, this.state.cwd)
      if (!st.node) {
        if (!force) return { stdout: '', stderr: `rm: cannot remove '${f}': No such file or directory`, exitCode: 1 }
        continue
      }
      if (st.node.type === 'directory') {
        const res = this.vfs.deleteDirectory(f, this.state.cwd, recursive)
        if (res.error && !force) return { stdout: '', stderr: res.error, exitCode: 1 }
      } else {
        const res = this.vfs.deleteFile(f, this.state.cwd)
        if (res.error && !force) return { stdout: '', stderr: res.error, exitCode: 1 }
      }
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdLn(args: string[]): ShellResult {
    const sym = args.includes('-s')
    const files = args.filter(a => a !== '-s')
    if (files.length < 2) return { stdout: '', stderr: 'ln: missing file operand', exitCode: 1 }
    const target = files[0]
    const linkPath = files[1]
    if (sym) { this.vfs.symlink(target, linkPath, this.state.cwd); return { stdout: '', stderr: '', exitCode: 0 } }
    return { stdout: '', stderr: 'ln: hard links not implemented', exitCode: 1 }
  }

  private cmdEcho(args: string[]): ShellResult {
    let noNewline = false
    const words = args.filter(a => { if (a === '-n') { noNewline = true; return false } return true })
    const output = words.join(' ') + (noNewline ? '' : '\n')
    return { stdout: output, stderr: '', exitCode: 0 }
  }

  private cmdGrep(args: string[], stdin: string): ShellResult {
    let ignoreCase = false
    let showLine = false
    let invert = false
    let recursive = false
    const patterns: string[] = []
    const files: string[] = []

    for (const a of args) {
      if (a === '-i') ignoreCase = true
      else if (a === '-n') showLine = true
      else if (a === '-v') invert = true
      else if (a === '-R' || a === '-r') recursive = true
      else if (a === '-E') continue
      else if (a === '-e') continue
      else if (!patterns[0]) patterns.push(a)
      else files.push(a)
    }

    const pattern = patterns[0]
    if (!pattern) return { stdout: '', stderr: 'grep: missing pattern', exitCode: 1 }
    let regex: RegExp
    try {
      regex = new RegExp(escapeRegex(pattern), ignoreCase ? 'gi' : 'g')
    } catch {
      return { stdout: '', stderr: `grep: invalid pattern: ${pattern}`, exitCode: 2 }
    }

    let lines: { text: string; file?: string; num: number }[] = []
    if (files.length === 0 && stdin) {
      let input = stdin
      if (input.length > MAX_GREP_INPUT) input = input.slice(0, MAX_GREP_INPUT)
      lines = input.split('\n').map((t, i) => ({ text: t, num: i + 1 }))
    } else {
      for (const f of files) {
        const res = this.vfs.readFile(f, this.state.cwd)
        if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
        let content = res.content || ''
        if (content.length > MAX_GREP_INPUT) content = content.slice(0, MAX_GREP_INPUT)
        content.split('\n').forEach((t, i) => lines.push({ text: t, file: f, num: i + 1 }))
      }
    }

    let stdout = ''
    for (const line of lines) {
      const matches = regex.test(line.text)
      regex.lastIndex = 0
      if (matches !== invert) {
        if (files.length > 1 || recursive) stdout += `${line.file}:`
        if (showLine) stdout += `${line.num}:`
        stdout += line.text + '\n'
      }
    }
    return { stdout, stderr: '', exitCode: 0 }
  }

  private cmdFind(args: string[]): ShellResult {
    let namePattern = ''
    let typeFilter = ''
    let startPath = '.'
    const params = [...args]

    for (let i = 0; i < params.length; i++) {
      if (params[i] === '-name' && i + 1 < params.length) { namePattern = params[++i] }
      else if (params[i] === '-type' && i + 1 < params.length) { typeFilter = params[++i] }
      else if (!params[i].startsWith('-')) { startPath = params[i] }
    }

    const startParts = startPath === '.' ? this.state.cwd : this.vfs.resolvePath(startPath, this.state.cwd)
    let stdout = ''

    const recurse = (path: string[]) => {
      const { entries } = this.vfs.listDirectory(path.join('/'), [])
      for (const e of entries) {
        const fullPath = path.concat(e.name).join('/')
        let match = true
        if (namePattern) {
          const pat = namePattern.replace(/\*/g, '.*').replace(/\?/g, '.')
          match = new RegExp('^' + pat + '$').test(e.name)
        }
        if (typeFilter) {
          if (typeFilter === 'f' && e.type !== 'file') match = false
          if (typeFilter === 'd' && e.type !== 'directory') match = false
          if (typeFilter === 'l' && e.type !== 'symlink') match = false
        }
        if (match) stdout += '/' + fullPath + '\n'
        if (e.type === 'directory') recurse(path.concat(e.name))
      }
    }

    recurse(startParts)
    return { stdout, stderr: '', exitCode: 0 }
  }

  private cmdSort(args: string[], stdin: string): ShellResult {
    const lines = stdin.split('\n')
    if (lines[lines.length - 1] === '') lines.pop()
    lines.sort()
    return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 }
  }

  private cmdUniq(args: string[], stdin: string): ShellResult {
    const count = args.includes('-c')
    const lines = stdin.split('\n')
    if (lines[lines.length - 1] === '') lines.pop()
    let stdout = ''
    let i = 0
    while (i < lines.length) {
      let j = i + 1
      while (j < lines.length && lines[j] === lines[i]) j++
      if (count) stdout += `${String(j - i).padStart(4)} ${lines[i]}\n`
      else stdout += lines[i] + '\n'
      i = j
    }
    return { stdout, stderr: '', exitCode: 0 }
  }

  private cmdWc(args: string[], stdin: string): ShellResult {
    const lines = stdin.split('\n')
    if (lines[lines.length - 1] === '') lines.pop()
    const nLines = lines.length
    const nWords = stdin.trim() ? stdin.split(/\s+/).filter(Boolean).length : 0
    const nChars = stdin.length
    return { stdout: ` ${String(nLines).padStart(4)} ${String(nWords).padStart(4)} ${String(nChars).padStart(4)}\n`, stderr: '', exitCode: 0 }
  }

  private cmdXargs(args: string[], stdin: string): ShellResult {
    if (args.length === 0) return { stdout: stdin, stderr: '', exitCode: 0 }
    const lines = stdin.split('\n').filter(Boolean)
    let stdout = ''
    for (const line of lines) {
      const parts = line.split(/\s+/)
      const cmd = [...args]
      const expanded = cmd.map(c => c === '{}' ? line : c)
      const result = this.runCommand(expanded.concat(parts), '')
      stdout += result.stdout
    }
    return { stdout, stderr: '', exitCode: 0 }
  }

  private cmdAwk(args: string[], stdin: string): ShellResult {
    const script = args.find(a => a.includes('{')) || '{print}'
    const col = script.match(/\$(\d+)/)
    const colNum = col ? parseInt(col[1]) : 0
    const lines = stdin.split('\n').filter(Boolean)
    let stdout = ''
    for (const line of lines) {
      const fields = line.split(/\s+/)
      if (colNum === 0) stdout += line + '\n'
      else if (colNum <= fields.length) stdout += fields[colNum - 1] + '\n'
    }
    return { stdout, stderr: '', exitCode: 0 }
  }

  private cmdSed(args: string[], stdin: string): ShellResult {
    const script = args.find(a => a.includes('s/'))
    if (!script) return { stdout: stdin, stderr: '', exitCode: 0 }
    const m = script.match(/s\/(.+?)\/(.+?)\//)
    if (!m) return { stdout: stdin, stderr: '', exitCode: 0 }
    const [, from, to] = m
    if (!from) return { stdout: stdin, stderr: 'sed: empty search pattern', exitCode: 1 }
    // Limit input size to prevent memory issues
    let input = stdin
    if (input.length > MAX_GREP_INPUT) input = input.slice(0, MAX_GREP_INPUT)
    const maxIterations = 1000
    let result = input
    let prev = ''
    let iterations = 0
    // Use iterative replacement with a safety limit
    while (prev !== result && iterations < maxIterations) {
      prev = result
      result = result.split(from).join(to)
      iterations++
    }
    if (iterations >= maxIterations) {
      return { stdout: result, stderr: 'sed: too many substitutions', exitCode: 1 }
    }
    return { stdout: result, stderr: '', exitCode: 0 }
  }

  private cmdChmod(args: string[]): ShellResult {
    if (args.length < 2) return { stdout: '', stderr: 'chmod: missing operand', exitCode: 1 }
    const mode = args[0]
    for (const f of args.slice(1)) {
      const res = this.vfs.chmod(f, this.state.cwd, mode)
      if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdChown(args: string[]): ShellResult {
    if (args.length < 2) return { stdout: '', stderr: 'chown: missing operand', exitCode: 1 }
    const owner = args[0]
    for (const f of args.slice(1)) {
      const res = this.vfs.chown(f, this.state.cwd, owner)
      if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdId(args: string[]): ShellResult {
    const user = args[0] || this.vfs.getCurrentUser()
    return { stdout: `uid=1000(${user}) gid=1000(${user}) groups=1000(${user}),4(adm),27(sudo)`, stderr: '', exitCode: 0 }
  }

  private cmdSudo(args: string[]): ShellResult {
    if (args.length === 0) return { stdout: '', stderr: 'sudo: no command specified', exitCode: 1 }
    const prevUser = this.vfs.getCurrentUser()
    this.vfs.setCurrentUser('root')
    const result = this.runCommand(args, '')
    this.vfs.setCurrentUser(prevUser)
    return result
  }

  private cmdPs(args: string[]): ShellResult {
    const aux = args.includes('aux') || args.includes('ef')
    if (aux) {
      return {
        stdout: `USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n` +
          `root         1  0.0  0.1  21532  7640 ?        Ss   Jan01   0:10 /sbin/init\n` +
          `ghost     1842  0.5  2.3 445120 94208 ?        Sl   08:00   0:42 node server.js\n` +
          `ghost     1891  0.1  0.8 112340 32400 ?        S    08:15   0:05 nginx: worker\n` +
          `postgres  2010  0.0  1.2 225600 49800 ?        S    08:00   0:08 postgres: main\n` +
          `redis     2105  0.0  0.3  52800 12800 ?        Ssl  08:00   0:02 redis-server\n` +
          `ghost     3421  0.0  0.1  12400  4500 pts/0    R+   10:00   0:00 ps aux\n`,
        stderr: '', exitCode: 0
      }
    }
    return {
      stdout: `  PID TTY          TIME CMD\n${String(3422).padStart(5)} pts/0    00:00:00 bash\n${String(3423).padStart(5)} pts/0    00:00:00 ps\n`,
      stderr: '', exitCode: 0
    }
  }

  private cmdTop(args: string[]): ShellResult {
    void args
    return {
      stdout:
`top - 10:00:00 up 15 days,  3:42,  1 user,  load average: 0.52, 0.58, 0.59
Tasks: 85 total,   1 running,  84 sleeping,   0 stopped,   0 zombie
%Cpu(s):  2.3 us,  1.1 sy,  0.0 ni, 96.1 id,  0.3 wa,  0.0 hi,  0.2 si,  0.0 st
MiB Mem :   8000.0 total,   4000.0 free,   3200.0 used,    800.0 buff/cache
MiB Swap:   2048.0 total,   1950.0 free,     98.0 used.   4500.0 avail Mem

  PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND
 1842 ghost     20   0  445120  94208  12500 S   5.3   2.3   0:42.15 node
 2010 postgres  20   0  225600  49800   8900 S   1.2   1.2   0:08.42 postgres
 1891 ghost     20   0  112340  32400   5600 S   0.5   0.8   0:05.21 nginx
 2105 redis     20   0   52800  12800   3400 S   0.1   0.3   0:02.08 redis
`,
      stderr: '', exitCode: 0
    }
  }

  private cmdKill(args: string[]): ShellResult {
    if (args.length === 0) return { stdout: '', stderr: 'kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]', exitCode: 1 }
    for (const pid of args) {
      if (pid.startsWith('-')) continue
      if (pid === '1') return { stdout: '', stderr: `kill: killing pid ${pid} (init) is not allowed`, exitCode: 1 }
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdPgrep(args: string[], cmd: string): ShellResult {
    const name = args[args.length - 1]
    if (!name) return { stdout: '', stderr: '', exitCode: 1 }
    const procs: Record<string, string> = { node: '1842', nginx: '1891', postgres: '2010', redis: '2105' }
    const pid = procs[name]
    if (cmd === 'pkill') return { stdout: '', stderr: pid ? '' : `pkill: no process found`, exitCode: pid ? 0 : 1 }
    return { stdout: pid ? pid + '\n' : '', stderr: pid ? '' : `pgrep: no process found`, exitCode: pid ? 0 : 1 }
  }

  private cmdDf(args: string[]): ShellResult {
    void args
    return {
      stdout:
`Filesystem     1K-blocks     Used Available Use% Mounted on
/dev/sda1       51473888 12345678  36543210  26% /
tmpfs            4096000    51200   4044800   2% /tmp
/dev/sda2      102947712 45678901  57234567  45% /home
`,
      stderr: '', exitCode: 0
    }
  }

  private cmdDu(args: string[]): ShellResult {
    const human = args.includes('-h')
    const path = args.filter(a => !a.startsWith('-'))[0] || '.'
    const st = this.vfs.stat(path, this.state.cwd)
    const size = st.node ? st.node.size : 0
    const display = human ? formatSize(size) : String(size)
    return { stdout: `${display}\t${path}\n`, stderr: '', exitCode: 0 }
  }

  private cmdCurl(args: string[]): ShellResult {
    const url = args.find(a => a.startsWith('http')) || args[args.length - 1]
    if (!url) return { stdout: '', stderr: 'curl: no URL specified', exitCode: 1 }
    if (url.includes('localhost:3000/health')) {
      return { stdout: '{"status":"ok","uptime":15420,"version":"1.2.0"}\n', stderr: '', exitCode: 0 }
    }
    if (url.includes('api')) {
      return { stdout: '{"message":"API response","status":200}\n', stderr: '', exitCode: 0 }
    }
    return {
      stdout: `<!DOCTYPE html><html><head><title>NeonMall</title></head><body><h1>NeonMall Server</h1></body></html>`,
      stderr: '', exitCode: 0
    }
  }

  private cmdPing(args: string[]): ShellResult {
    const host = args[0]
    if (!host) return { stdout: '', stderr: 'ping: missing host operand', exitCode: 1 }
    return {
      stdout: `PING ${host} (127.0.0.1) 56(84) bytes of data.\n64 bytes from ${host}: icmp_seq=1 ttl=64 time=0.052 ms\n64 bytes from ${host}: icmp_seq=2 ttl=64 time=0.048 ms\n\n--- ${host} ping statistics ---\n2 packets transmitted, 2 received, 0% packet loss, time 1001ms\n`,
      stderr: '', exitCode: 0
    }
  }


  // === PACKAGE MANAGEMENT ===

  private cmdNpm(args: string[]): ShellResult {
    const sub = args[0] || ''
    const pkgFile = this.vfs.readFile('package.json', this.state.cwd)
    let pkg: Record<string, unknown> = {}
    if (!pkgFile.error) {
      try { pkg = JSON.parse(pkgFile.content) } catch { /* ignore */ }
    }
    switch (sub) {
      case 'install':
      case 'i': {
        const pkgs = args.slice(1).filter(a => !a.startsWith('-'))
        if (pkgs.length === 0) {
          return { stdout: 'added 42 packages, and audited 43 packages in 2s\n\nfound 0 vulnerabilities', stderr: '', exitCode: 0 }
        }
        let stdout = ''
        for (const p of pkgs) {
          this.services.installedPackages.push(p)
          this.services.npmPackages.set(p, '1.0.0')
          stdout += `added ${p}@1.0.0\n`
        }
        return { stdout, stderr: '', exitCode: 0 }
      }
      case 'ci':
        return { stdout: 'added 42 packages in 1.5s\n', stderr: '', exitCode: 0 }
      case 'test': {
        const scripts = (pkg.scripts as Record<string, string>) || {}
        if (!scripts.test) return { stdout: '', stderr: 'npm error! Missing script: "test"\n', exitCode: 1 }
        return { stdout: 'PASS  ./sum.test.js\nPASS  ./api.test.js\nPASS  ./auth.test.js\n\nTest Suites: 3 passed, 3 total\nTests:       15 passed, 15 total\n', stderr: '', exitCode: 0 }
      }
      case 'start': {
        const scripts = (pkg.scripts as Record<string, string>) || {}
        if (!scripts.start) return { stdout: '', stderr: 'npm error! Missing script: "start"\n', exitCode: 1 }
        return { stdout: `> ${pkg.name || 'app'}@${pkg.version || '0.0.1'} start\n> ${scripts.start}\n\nStarting server on port 3000\n`, stderr: '', exitCode: 0 }
      }
      case 'run': {
        const script = args[1]
        if (!script) return { stdout: '', stderr: 'npm run <script>\n', exitCode: 1 }
        const scripts = (pkg.scripts as Record<string, string>) || {}
        if (!scripts[script]) return { stdout: '', stderr: `npm error! Missing script: "${script}"\n`, exitCode: 1 }
        return { stdout: `> ${pkg.name || 'app'}@${pkg.version || '0.0.1'} ${script}\n> ${scripts[script]}\n\nScript "${script}" executed successfully\n`, stderr: '', exitCode: 0 }
      }
      case 'list':
        return { stdout: `${this.state.cwd.join('/')}\n├── express@4.18.2\n├── jest@29.7.0\n├── lodash@4.17.21\n├── react@18.2.0\n├── typescript@5.3.3\n└── @types/node@20.10.4\n`, stderr: '', exitCode: 0 }
      case 'outdated': {
        const pkgJson = this.vfs.readFile('package.json', this.state.cwd)
        if (pkgJson.error) return { stdout: '', stderr: pkgJson.error, exitCode: 1 }
        return {
          stdout: `Package      Current   Wanted   Latest  Location\nexpress      4.18.2   4.18.2   4.19.2  node_modules/express\nlodash       4.17.21  4.17.21  4.17.21 node_modules/lodash\ntypescript   5.3.3    5.3.3    5.5.2   node_modules/typescript\n`, stderr: '', exitCode: 0
        }
      }
      case 'audit':
        return {
          stdout: `# npm audit report\n\nsemver  <7.5.2\nSeverity: moderate\nRegex Denial of Service - https://github.com/advisories/GHSA-c2qf-rxjj-qqgw\nfix available via \`npm audit fix --force\`\n\n2 moderate severity vulnerabilities\n`, stderr: '', exitCode: 0
        }
      case 'init': {
        const yes = args.includes('-y') || args.includes('--yes')
        if (!yes) return { stdout: '', stderr: 'npm init -y required\n', exitCode: 1 }
        this.vfs.writeFile('package.json', this.state.cwd, JSON.stringify({ name: 'my-project', version: '1.0.0', description: '', main: 'index.js', scripts: { test: 'echo "Error: no test specified" && exit 1' }, keywords: [], author: '', license: 'ISC' }, null, 2))
        return { stdout: 'Wrote to ' + this.state.cwd.join('/') + '/package.json\n\n{\n  "name": "my-project",\n  "version": "1.0.0"\n}\n', stderr: '', exitCode: 0 }
      }
      case 'publish':
        return { stdout: `npm notice Publishing to https://registry.npmjs.org/\n+ @scope/pkg@1.0.0\n`, stderr: '', exitCode: 0 }
      default:
        return { stdout: '\nUsage: npm <command>\n\nwhere <command> is one of: install, ci, test, start, run, list, outdated, audit, init, publish\n', stderr: '', exitCode: 1 }
    }
  }

  private cmdNpx(args: string[]): ShellResult {
    if (args.length === 0) return { stdout: '', stderr: 'npx: missing operand\n', exitCode: 1 }
    const pkg = args[0]
    return { stdout: `npx: installed ${pkg}@latest in 2s\n\n${pkg} executed successfully\n`, stderr: '', exitCode: 0 }
  }

  private cmdYarn(args: string[]): ShellResult {
    const sub = args[0] || ''
    switch (sub) {
      case 'install':
        return { stdout: 'yarn install v1.22.21\n[1/4] Resolving packages...\n[2/4] Fetching packages...\n[3/4] Linking dependencies...\n[4/4] Building fresh packages...\nsuccess Saved lockfile.\nDone in 1.23s.\n', stderr: '', exitCode: 0 }
      case 'add': {
        const pkgs = args.slice(1).filter(a => !a.startsWith('-'))
        return { stdout: `yarn add v1.22.21\n[1/4] Resolving packages...\n[2/4] Fetching packages...\ninfo Direct dependencies\n${pkgs.map(p => `\u2514 ${p}@^1.0.0`).join('\n')}\nDone in 0.85s.\n`, stderr: '', exitCode: 0 }
      }
      case 'remove':
      case 'upgrade':
        return { stdout: `yarn ${sub} v1.22.21\n[1/2] Removing module ${args[1] || ''}...\n[2/2] Regenerating lockfile...\nDone in 0.45s.\n`, stderr: '', exitCode: 0 }
      case 'run':
        return { stdout: `yarn run v1.22.21\n$ ${args.slice(1).join(' ')}\nScript executed\nDone in 0.32s.\n`, stderr: '', exitCode: 0 }
      case 'test':
        return { stdout: 'yarn run v1.22.21\n$ jest\nTest Suites: 3 passed, 3 total\nDone in 2.1s.\n', stderr: '', exitCode: 0 }
      default:
        return { stdout: '\nUsage: yarn [install|add|remove|run|test]\n', stderr: '', exitCode: 1 }
    }
  }

  private cmdPnpm(args: string[]): ShellResult {
    const sub = args[0] || ''
    switch (sub) {
      case 'install':
        return { stdout: 'Packages: +42\n++++++++++++++++++++++++++++++++++++++++++\nProgress: resolved 42, reused 38, downloaded 4, added 42, done\n', stderr: '', exitCode: 0 }
      case 'add': {
        const pkgs = args.slice(1).filter(a => !a.startsWith('-'))
        return { stdout: `Packages: +${pkgs.length}\n${pkgs.map(p => `+ ${p} 1.0.0`).join('\n')}\nProgress: resolved 43, reused 42, downloaded 1, added ${pkgs.length}, done\n`, stderr: '', exitCode: 0 }
      }
      case 'remove':
        return { stdout: `Packages: -1\n-${args[1] || ''}\nProgress: resolved 41, reused 41, removed 1, done\n`, stderr: '', exitCode: 0 }
      case 'run':
        return { stdout: `> ${args[1] || 'app'}@1.0.0 ${args[1] || 'script'} /home/ghost/project\n> echo "script output"\n\nscript output\n`, stderr: '', exitCode: 0 }
      case 'test':
        return { stdout: 'PASS  tests\nTest Suites: 3 passed, 3 total\n', stderr: '', exitCode: 0 }
      default:
        return { stdout: '\nUsage: pnpm [install|add|remove|run|test]\n', stderr: '', exitCode: 1 }
    }
  }

  // === SYSTEM SERVICES ===

  private cmdSystemctl(args: string[]): ShellResult {
    const sub = args[0] || ''
    const svc = args[1] || ''
    switch (sub) {
      case 'status': {
        if (!svc) return { stdout: '', stderr: 'systemctl: missing service name', exitCode: 1 }
        const s = this.services.services.get(svc)
        if (!s) return { stdout: '', stderr: `Unit ${svc}.service could not be found.`, exitCode: 4 }
        return {
          stdout: `● ${svc}.service - ${s.description}\n     Loaded: loaded (/lib/systemd/system/${svc}.service; ${s.enabled ? 'enabled' : 'disabled'}; preset: enabled)\n     Active: ${s.status === 'running' ? 'active (running) since Mon 2024-06-10 08:00:00 UTC; 3 days ago' : 'inactive (dead)'}\n   Main PID: ${s.status === 'running' ? Math.floor(Math.random() * 9000 + 1000).toString() : 'n/a'}\n\nJun 10 08:00:00 neonmall-server systemd[1]: Started ${s.description}.\n`, stderr: '', exitCode: s.status === 'running' ? 0 : 3
        }
      }
      case 'start':
      case 'stop':
      case 'restart': {
        if (!svc) return { stdout: '', stderr: `systemctl: missing service name`, exitCode: 1 }
        const s = this.services.services.get(svc)
        if (!s) return { stdout: '', stderr: `Failed to ${sub} ${svc}.service: Unit ${svc}.service not found.`, exitCode: 1 }
        s.status = sub === 'stop' ? 'stopped' : 'running'
        this.services.services.set(svc, s)
        return { stdout: '', stderr: '', exitCode: 0 }
      }
      case 'enable':
      case 'disable': {
        if (!svc) return { stdout: '', stderr: `systemctl: missing service name`, exitCode: 1 }
        const s = this.services.services.get(svc)
        if (!s) return { stdout: '', stderr: `Failed to ${sub} ${svc}.service: Unit not found.`, exitCode: 1 }
        s.enabled = sub === 'enable'
        this.services.services.set(svc, s)
        return { stdout: `Created symlink /etc/systemd/system/multi-user.target.wants/${svc}.service → /lib/systemd/system/${svc}.service.\n`, stderr: '', exitCode: 0 }
      }
      case 'list-units': {
        let stdout = 'UNIT                     LOAD   ACTIVE SUB       DESCRIPTION\n'
        this.services.services.forEach((s, name) => {
          stdout += `${name.padEnd(24)} loaded ${(s.status === 'running' ? 'active running' : 'inactive dead  ').padEnd(17)} ${s.description}\n`
        })
        return { stdout, stderr: '', exitCode: 0 }
      }
      case 'is-active': {
        if (!svc) return { stdout: '', stderr: 'systemctl: missing service name', exitCode: 1 }
        const s = this.services.services.get(svc)
        if (!s) return { stdout: 'unknown\n', stderr: '', exitCode: 3 }
        return { stdout: s.status + '\n', stderr: '', exitCode: s.status === 'running' ? 0 : 3 }
      }
      default:
        return { stdout: '', stderr: 'systemctl: unknown command', exitCode: 1 }
    }
  }

  private cmdJournalctl(args: string[]): ShellResult {
    const unitIdx = args.indexOf('-u')
    const follow = args.includes('-f')
    const sinceIdx = args.indexOf('--since')
    const nIdx = args.indexOf('-n')

    if (follow) {
      return { stdout: '-- Logs begin at Mon 2024-06-10 08:00:00 UTC. --\nJun 10 10:00:00 neonmall-server systemd[1]: New log entry (simulated follow mode)\n', stderr: '', exitCode: 0 }
    }

    let logs = [...this.services.systemLogs]
    if (unitIdx >= 0 && args[unitIdx + 1]) {
      const svc = args[unitIdx + 1]
      logs = logs.filter(l => l.includes(svc))
    }
    if (sinceIdx >= 0 && args[sinceIdx + 1]) {
      logs = logs.slice(Math.floor(logs.length / 2) + 1)
    }
    if (nIdx >= 0 && args[nIdx + 1]) {
      logs = logs.slice(-parseInt(args[nIdx + 1]))
    }
    return { stdout: logs.join('\n') + (logs.length ? '\n' : ''), stderr: '', exitCode: 0 }
  }

  private cmdDmesg(_: string[]): ShellResult {
    void _
    return {
      stdout:
`[    0.000000] Linux version 5.15.0-91-generic
[    0.000004] Command line: BOOT_IMAGE=/boot/vmlinuz root=/dev/sda1 ro
[    0.004000] KERNEL supported cpus:
[    0.004000]   Intel GenuineIntel
[    0.004000]   AMD AuthenticAMD
[    1.234567] SCSI subsystem initialized
[    2.345678] VFS: Mounted root (ext4 filesystem) readonly
[    3.456789] random: crng init done
[    5.678901] Adding 2097148k swap on /dev/sda2
`, stderr: '', exitCode: 0
    }
  }

  private cmdLogger(args: string[]): ShellResult {
    const tagIdx = args.indexOf('-t')
    const tag = tagIdx >= 0 && args[tagIdx + 1] ? args[tagIdx + 1] : 'user'
    const msg = args.filter((a, i) => a !== '-t' && (tagIdx < 0 || i !== tagIdx + 1)).join(' ') || 'log entry'
    const entry = `${new Date().toISOString().slice(0, 19).replace('T', ' ')} ${this.vfs.getCurrentUser()} ${tag}: ${msg}`
    this.services.systemLogs.push(entry)
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdService(args: string[]): ShellResult {
    const svc = args[0] || ''
    const action = args[1] || ''
    if (!svc || !action) return { stdout: '', stderr: 'Usage: service <name> <start|stop|restart|status>', exitCode: 1 }
    const s = this.services.services.get(svc)
    if (!s) return { stdout: '', stderr: `${svc}: unrecognized service`, exitCode: 1 }
    if (action === 'status') return { stdout: `${svc} is ${s.status}\n`, stderr: '', exitCode: s.status === 'running' ? 0 : 3 }
    if (['start', 'stop', 'restart'].includes(action)) {
      s.status = action === 'stop' ? 'stopped' : 'running'
      this.services.services.set(svc, s)
      return { stdout: '', stderr: '', exitCode: 0 }
    }
    return { stdout: '', stderr: `Unknown action: ${action}`, exitCode: 1 }
  }

  private cmdCrontab(args: string[]): ShellResult {
    const list = args.includes('-l')
    const edit = args.includes('-e')
    if (list) {
      let stdout = '# m h dom mon dow command\n'
      this.services.cronJobs.forEach((cmd, schedule) => { stdout += `${schedule} ${cmd}\n` })
      return { stdout, stderr: '', exitCode: 0 }
    }
    if (edit) {
      return { stdout: 'crontab: no crontab for ghost - using an empty one\n(crontab opens in editor - simulated)\n', stderr: '', exitCode: 0, mode: 'vim' }
    }
    if (args.length === 0) return { stdout: 'no crontab for ghost\n', stderr: '', exitCode: 0 }
    return { stdout: '', stderr: 'Usage: crontab [-l|-e]', exitCode: 1 }
  }


  // === DOCKER ===

  private cmdDocker(args: string[]): ShellResult {
    const sub = args[0] || ''
    const sub2 = args[1] || ''

    // docker compose
    if (sub === 'compose') {
      switch (sub2) {
        case 'up':
          return { stdout: '[+] Running 3/3\n ✔ Container web Started\n ✔ Container db Started\n ✔ Container cache Started\n', stderr: '', exitCode: 0 }
        case 'down':
          return { stdout: '[+] Running 3/3\n ✔ Container web Removed\n ✔ Container db Removed\n ✔ Container cache Removed\n ✔ Network neonmall_default Removed\n', stderr: '', exitCode: 0 }
        case 'logs':
          return { stdout: 'web  | 2024/06/10 10:00:00 [notice] 1#1: start worker processes\ndb   | 2024-06-10 10:00:00 UTC [1] LOG:  database system is ready\n', stderr: '', exitCode: 0 }
        case 'ps':
          return { stdout: 'NAME                IMAGE               COMMAND             SERVICE             CREATED             STATUS\nweb                 nginx:alpine        "/docker-entrypoint."   web             3 days ago          Up 3 days\ndb                  postgres:15         "docker-entrypoint.s…"  db              5 days ago          Up 5 days\ncache               redis:7             "docker-entrypoint.s…"  cache           2 days ago          Up 2 days\n', stderr: '', exitCode: 0 }
        case 'exec':
          return { stdout: 'Executed command in container\n', stderr: '', exitCode: 0 }
        default:
          return { stdout: '', stderr: 'docker compose: unknown command', exitCode: 1 }
      }
    }

    switch (sub) {
      case 'ps': {
        const all = args.includes('-a')
        let stdout = 'CONTAINER ID   IMAGE          COMMAND                  CREATED        STATUS                    PORTS                    NAMES\n'
        this.services.dockerContainers.forEach((c, id) => {
          if (!all && !c.status.startsWith('Up')) return
          stdout += `${id.slice(0, 12)}   ${c.image.padEnd(14)} "/bin/sh -c '...'"       3 days ago     ${c.status.padEnd(25)} ${c.ports.padEnd(24)} ${c.names}\n`
        })
        return { stdout, stderr: '', exitCode: 0 }
      }
      case 'images': {
        let stdout = 'REPOSITORY   TAG       IMAGE ID       CREATED          SIZE\n'
        this.services.dockerImages.forEach((img, name) => {
          stdout += `${name.padEnd(12)} ${img.tag.padEnd(9)} ${Array.from({ length: 12 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}   ${img.created.padEnd(16)} ${img.size}\n`
        })
        return { stdout, stderr: '', exitCode: 0 }
      }
      case 'run': {
        const img = args.slice(1).filter(a => !a.startsWith('-'))[0]
        if (!img) return { stdout: '', stderr: 'docker run: image name required', exitCode: 1 }
        const id = Math.random().toString(36).slice(2, 10)
        this.services.dockerContainers.set(id, { image: img, status: 'Up 1 second', ports: '', names: img.replace(/[:/]/g, '_') })
        return { stdout: img.replace(/[:/]/g, '_'), stderr: '', exitCode: 0 }
      }
      case 'exec': {
        const container = args.find((_, i) => i > 0 && !args[i].startsWith('-'))
        if (!container) return { stdout: '', stderr: 'docker exec: container required', exitCode: 1 }
        return { stdout: 'Executed in container\n', stderr: '', exitCode: 0 }
      }
      case 'logs': {
        const cname = args[args.length - 1]
        if (!cname || cname.startsWith('-')) return { stdout: '', stderr: 'docker logs: container required', exitCode: 1 }
        const logs = this.services.containerLogs.get(cname) || ['Log output from container...', 'Processed request: GET /api/health 200', 'Database query executed in 12ms']
        return { stdout: logs.join('\n') + '\n', stderr: '', exitCode: 0 }
      }
      case 'stop': {
        const cname = args[1]
        if (!cname) return { stdout: '', stderr: 'docker stop: container required', exitCode: 1 }
        this.services.dockerContainers.forEach((c, id) => { if (c.names === cname || id.startsWith(cname)) c.status = 'Exited (0) 1 second ago' })
        return { stdout: cname + '\n', stderr: '', exitCode: 0 }
      }
      case 'start': {
        const cname = args[1]
        if (!cname) return { stdout: '', stderr: 'docker start: container required', exitCode: 1 }
        this.services.dockerContainers.forEach((c, id) => { if (c.names === cname || id.startsWith(cname)) c.status = 'Up 1 second' })
        return { stdout: cname + '\n', stderr: '', exitCode: 0 }
      }
      case 'restart': {
        const cname = args[1]
        if (!cname) return { stdout: '', stderr: 'docker restart: container required', exitCode: 1 }
        return { stdout: cname + '\n', stderr: '', exitCode: 0 }
      }
      case 'rm': {
        const cname = args[1]
        if (!cname) return { stdout: '', stderr: 'docker rm: container required', exitCode: 1 }
        let removed = false
        this.services.dockerContainers.forEach((c, id) => { if (c.names === cname || id.startsWith(cname)) { this.services.dockerContainers.delete(id); removed = true } })
        return { stdout: removed ? cname + '\n' : '', stderr: removed ? '' : `Error: No such container: ${cname}`, exitCode: removed ? 0 : 1 }
      }
      case 'rmi': {
        const img = args[1]
        if (!img) return { stdout: '', stderr: 'docker rmi: image required', exitCode: 1 }
        let removed = false
        this.services.dockerImages.forEach((_, name) => { if (name === img) { this.services.dockerImages.delete(name); removed = true } })
        return { stdout: removed ? `Untagged: ${img}\n` : '', stderr: removed ? '' : `Error: No such image: ${img}`, exitCode: removed ? 0 : 1 }
      }
      case 'build': {
        const tagIdx = args.indexOf('-t')
        const tag = tagIdx >= 0 ? args[tagIdx + 1] : 'latest'
        return { stdout: `[+] Building 0.1s (8/8) FINISHED\n => [internal] load build definition from Dockerfile\n => => transferring dockerfile: 212B\n => [internal] load .dockerignore\n => [1/3] FROM node:20-alpine\n => [2/3] WORKDIR /app\n => [3/3] COPY . .\n => exporting to image\n => => naming to docker.io/library/${tag}\n`, stderr: '', exitCode: 0 }
      }
      case 'pull':
        return { stdout: `Using default tag: latest\nlatest: Pulling from library/${args[1] || 'ubuntu'}\nDigest: sha256:${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}\nStatus: Downloaded newer image for ${args[1] || 'ubuntu'}:latest\n`, stderr: '', exitCode: 0 }
      case 'push':
        return { stdout: `The push refers to repository [${args[1] || 'repo'}]\nlatest: Pushed\n`, stderr: '', exitCode: 0 }
      case 'network': {
        if (sub2 === 'ls') {
          let stdout = 'NETWORK NAME      DRIVER\n'
          this.services.dockerNetworks.forEach((n, name) => { stdout += `${name.padEnd(17)} ${n.driver}\n` })
          return { stdout, stderr: '', exitCode: 0 }
        }
        return { stdout: '', stderr: 'docker network: unknown subcommand', exitCode: 1 }
      }
      case 'volume': {
        if (sub2 === 'ls') {
          let stdout = 'DRIVER    VOLUME NAME\n'
          this.services.dockerVolumes.forEach((driver, name) => { stdout += `${driver.padEnd(9)} ${name}\n` })
          return { stdout, stderr: '', exitCode: 0 }
        }
        return { stdout: '', stderr: 'docker volume: unknown subcommand', exitCode: 1 }
      }
      case 'inspect': {
        const target = args[1]
        if (!target) return { stdout: '', stderr: 'docker inspect: target required', exitCode: 1 }
        const c = Array.from(this.services.dockerContainers.entries()).find(([, v]) => v.names === target || v.image === target)
        if (c) {
          return { stdout: JSON.stringify([{ Id: c[0], Image: c[1].image, State: { Status: c[1].status }, Name: `/${c[1].names}` }], null, 2) + '\n', stderr: '', exitCode: 0 }
        }
        return { stdout: '', stderr: `Error: No such object: ${target}`, exitCode: 1 }
      }
      default:
        return { stdout: '', stderr: `docker: '${sub}' is not a docker command.\nSee 'docker --help'\n`, exitCode: 1 }
    }
  }

  // === KUBERNETES ===

  private cmdKubectl(args: string[]): ShellResult {
    const sub = args[0] || ''
    const sub2 = args[1] || ''
    const ctx = this.services.kubectlCurrentContext

    switch (sub) {
      case 'get': {
        switch (sub2) {
          case 'pods': {
            const nsIdx = args.indexOf('-n')
            const ns = nsIdx >= 0 ? args[nsIdx + 1] : 'default'
            let stdout = `NAME                              READY   STATUS    RESTARTS   AGE\n`
            this.services.kubectlPods.forEach((p, name) => {
              if (p.namespace === ns) stdout += `${name.padEnd(33)} 1/1     ${p.status.padEnd(9)} ${String(p.restarts).padEnd(10)} ${p.age}\n`
            })
            return { stdout, stderr: `Context: ${ctx}\n`, exitCode: 0 }
          }
          case 'nodes': {
            let stdout = `NAME           STATUS   ROLES           AGE   VERSION\n`
            this.services.kubectlNodes.forEach((n, name) => {
              stdout += `${name.padEnd(14)} ${n.status.padEnd(8)} ${n.roles.padEnd(15)} ${n.age.padEnd(5)} ${n.version}\n`
            })
            return { stdout, stderr: '', exitCode: 0 }
          }
          case 'services':
          case 'svc': {
            let stdout = `NAME           TYPE           CLUSTER-IP    EXTERNAL-IP   PORT(S)       AGE\n`
            this.services.kubectlServices.forEach((s, name) => {
              stdout += `${name.padEnd(14)} ${s.type.padEnd(14)} ${s.clusterIP.padEnd(13)} <none>        ${s.ports.padEnd(13)} 12d\n`
            })
            return { stdout, stderr: '', exitCode: 0 }
          }
          case 'deployments':
          case 'deployment': {
            let stdout = `NAME           READY   UP-TO-DATE   AVAILABLE   AGE\n`
            this.services.kubectlDeployments.forEach((d, name) => {
              stdout += `${name.padEnd(14)} ${d.ready.padEnd(7)} ${String(d.upToDate).padEnd(12)} ${String(d.available).padEnd(11)} 12d\n`
            })
            return { stdout, stderr: '', exitCode: 0 }
          }
          default:
            return { stdout: '', stderr: `kubectl get: unknown resource ${sub2}`, exitCode: 1 }
        }
      }
      case 'describe': {
        const resource = sub2
        const name = args[2]
        if (!resource || !name) return { stdout: '', stderr: 'kubectl describe: resource and name required', exitCode: 1 }
        const pod = this.services.kubectlPods.get(name)
        if (pod) {
          return {
            stdout: `Name:         ${name}\nNamespace:    ${pod.namespace}\nPriority:     0\nNode:         ${pod.node}\nStart Time:   Mon, 10 Jun 2024 08:00:00 +0000\nStatus:       ${pod.status}\nIP:           10.42.0.15\nContainers:\n  app:\n    Port:       3000/TCP\n    State:      Running\n    Ready:      True\n`,
            stderr: '', exitCode: 0
          }
        }
        return { stdout: '', stderr: `Error from server (NotFound): ${resource} "${name}" not found`, exitCode: 1 }
      }
      case 'logs': {
        const pod = args[args.length - 1]
        const podData = this.services.kubectlPods.get(pod)
        if (!podData) return { stdout: '', stderr: `Error from server (NotFound): pods "${pod}" not found`, exitCode: 1 }
        return { stdout: `[2024-06-10T10:00:00Z] INFO: Server starting\n[2024-06-10T10:00:01Z] INFO: Connected to database\n[2024-06-10T10:00:02Z] INFO: Listening on port 3000\n`, stderr: '', exitCode: 0 }
      }
      case 'exec': {
        const pod = args.find((a, i) => i > 0 && a !== '-it' && !a.startsWith('-'))
        if (!pod) return { stdout: '', stderr: 'kubectl exec: pod name required', exitCode: 1 }
        return { stdout: 'Executed command in pod\n', stderr: '', exitCode: 0 }
      }
      case 'apply': {
        const fIdx = args.indexOf('-f')
        if (fIdx < 0 || !args[fIdx + 1]) return { stdout: '', stderr: 'kubectl apply: -f flag required', exitCode: 1 }
        return { stdout: `deployment.apps/${args[fIdx + 1].replace('.yaml', '').replace('.yml', '')} created\n`, stderr: '', exitCode: 0 }
      }
      case 'delete': {
        const resource = sub2
        const name = args[2]
        if (!resource || !name) return { stdout: '', stderr: 'kubectl delete: resource and name required', exitCode: 1 }
        if (resource === 'pod') this.services.kubectlPods.delete(name)
        if (resource === 'deployment') this.services.kubectlDeployments.delete(name)
        if (resource === 'service') this.services.kubectlServices.delete(name)
        return { stdout: `${resource} "${name}" deleted\n`, stderr: '', exitCode: 0 }
      }
      case 'port-forward': {
        const pod = sub2
        const ports = args[2]
        if (!pod || !ports) return { stdout: '', stderr: 'kubectl port-forward: pod and ports required', exitCode: 1 }
        return { stdout: `Forwarding from 127.0.0.1:${ports.split(':')[0]} -> ${ports.split(':')[1]}\nForwarding from [::1]:${ports.split(':')[0]} -> ${ports.split(':')[1]}\n`, stderr: '', exitCode: 0 }
      }
      case 'config': {
        if (sub2 === 'get-contexts') {
          let stdout = 'CURRENT   NAME       CLUSTER    AUTHINFO   NAMESPACE\n'
          this.services.kubectlContexts.forEach(c => {
            stdout += `${(c === this.services.kubectlCurrentContext ? '*' : '').padEnd(9)} ${c.padEnd(10)} ${c.padEnd(10)} ${c.padEnd(10)} default\n`
          })
          return { stdout, stderr: '', exitCode: 0 }
        }
        if (sub2 === 'use-context') {
          const ctx = args[2]
          if (!ctx) return { stdout: '', stderr: 'kubectl config use-context: context name required', exitCode: 1 }
          this.services.kubectlCurrentContext = ctx
          return { stdout: `Switched to context "${ctx}".\n`, stderr: '', exitCode: 0 }
        }
        return { stdout: '', stderr: 'kubectl config: unknown subcommand', exitCode: 1 }
      }
      case 'top': {
        const resource = sub2
        if (resource === 'pod') {
          let stdout = `NAME                              CPU(cores)   MEMORY(bytes)\n`
          this.services.kubectlPods.forEach((p, name) => { stdout += `${name.padEnd(33)} ${p.cpu.padEnd(12)} ${p.mem}\n` })
          return { stdout, stderr: '', exitCode: 0 }
        }
        if (resource === 'node') {
          let stdout = `NAME           CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%\n`
          this.services.kubectlNodes.forEach((n, name) => { stdout += `${name.padEnd(14)} ${n.cpu.padEnd(12)} ${(parseInt(n.cpu) / 10).toFixed(0).padEnd(6)} ${n.mem.padEnd(15)} ${(parseInt(n.mem) / 30).toFixed(0).padEnd(7)}\n` })
          return { stdout, stderr: '', exitCode: 0 }
        }
        return { stdout: '', stderr: 'kubectl top: unknown resource', exitCode: 1 }
      }
      default:
        return { stdout: '', stderr: `kubectl: unknown command '${sub}'\n`, exitCode: 1 }
    }
  }


  // === DEVELOPMENT TOOLS ===

  private cmdMake(args: string[]): ShellResult {
    const target = args[0] || 'all'
    const targets: Record<string, string> = {
      all: 'cc -o main src/*.c\n',
      build: 'npm run build\n\n> build\nwebpack compiled successfully\n',
      test: 'npm test\n\nPASS  ./test.js\n',
      clean: 'rm -rf build/ dist/*.o\n',
      install: 'cp main /usr/local/bin/\n',
      '': 'make: *** No targets specified.  Stop.',
    }
    return { stdout: targets[target] || `make: Nothing to be done for '${target}'.\n`, stderr: '', exitCode: 0 }
  }

  private cmdNode(args: string[], stdin: string): ShellResult {
    void stdin
    if (args.includes('--version') || args.includes('-v')) return { stdout: 'v20.10.0\n', stderr: '', exitCode: 0 }
    const eIdx = args.indexOf('-e')
    if (eIdx >= 0 && args[eIdx + 1]) {
      const code = args[eIdx + 1]
      if (code.includes('console.log')) return { stdout: code.match(/console\.log\((.*)\)/)?.[1].replace(/['"]/g, '') + '\n' || '\n', stderr: '', exitCode: 0 }
      if (code.includes('1+1')) return { stdout: '2\n', stderr: '', exitCode: 0 }
      return { stdout: 'undefined\n', stderr: '', exitCode: 0 }
    }
    if (args.length > 0 && !args[0].startsWith('-')) {
      const file = args[0]
      const res = this.vfs.readFile(file, this.state.cwd)
      if (res.error) return { stdout: '', stderr: `node: ${res.error}`, exitCode: 1 }
      return { stdout: `Executed ${file}\n`, stderr: '', exitCode: 0 }
    }
    return { stdout: '', stderr: '', exitCode: 0, mode: 'node' }
  }

  private cmdPython(args: string[], stdin: string): ShellResult {
    void stdin
    if (args.includes('--version') || args.includes('-V')) return { stdout: 'Python 3.10.12\n', stderr: '', exitCode: 0 }
    const cIdx = args.indexOf('-c')
    if (cIdx >= 0 && args[cIdx + 1]) {
      const code = args[cIdx + 1]
      if (code.includes('print')) {
        const m = code.match(/print\((.*)\)/)
        if (m) return { stdout: m[1].replace(/['"]/g, '').replace(/\+/, '') + '\n', stderr: '', exitCode: 0 }
      }
      if (code.includes('import')) return { stdout: '', stderr: '', exitCode: 0 }
      return { stdout: '\n', stderr: '', exitCode: 0 }
    }
    // pip subcommands
    if (args[0] === '-m' && args[1] === 'pip') {
      const pipArgs = args.slice(2)
      const pipCmd = pipArgs[0]
      switch (pipCmd) {
        case 'install': {
          const pkgs = pipArgs.slice(1).filter(a => !a.startsWith('-'))
          return { stdout: `Collecting ${pkgs.join(', ')}\n  Downloading ${pkgs[0]}-1.0.0-py3-none-any.whl (10 kB)\nInstalling collected packages: ${pkgs.join(', ')}\nSuccessfully installed ${pkgs.join(' ')}\n`, stderr: '', exitCode: 0 }
        }
        case 'list':
          return { stdout: `Package    Version\n---------- -------\npip        23.2.1\nrequests   2.31.0\nflask      3.0.0\ndjango     5.0.0\n`, stderr: '', exitCode: 0 }
        case 'freeze':
          return { stdout: `requests==2.31.0\nflask==3.0.0\ndjango==5.0.0\n`, stderr: '', exitCode: 0 }
        default:
          return { stdout: '', stderr: `pip: unknown command '${pipCmd}'`, exitCode: 1 }
      }
    }
    if (args.length > 0 && !args[0].startsWith('-')) {
      const file = args[0]
      const res = this.vfs.readFile(file, this.state.cwd)
      if (res.error) return { stdout: '', stderr: `python3: ${res.error}`, exitCode: 1 }
      return { stdout: `Executed ${file}\n`, stderr: '', exitCode: 0 }
    }
    return { stdout: '', stderr: '', exitCode: 0, mode: 'python' }
  }

  private cmdGo(args: string[]): ShellResult {
    const sub = args[0] || ''
    switch (sub) {
      case 'version':
        return { stdout: 'go version go1.21.5 linux/amd64\n', stderr: '', exitCode: 0 }
      case 'run': {
        const file = args[1]
        if (!file) return { stdout: '', stderr: 'go run: no go files listed\n', exitCode: 1 }
        return { stdout: 'Hello, World!\n', stderr: '', exitCode: 0 }
      }
      case 'build':
        return { stdout: '', stderr: '', exitCode: 0 }
      case 'test':
        return { stdout: 'PASS\nok      \t.\t0.023s\n', stderr: '', exitCode: 0 }
      case 'mod': {
        const modSub = args[1] || ''
        switch (modSub) {
          case 'init':
            this.vfs.writeFile('go.mod', this.state.cwd, `module ${args[2] || 'myapp'}\n\ngo 1.21\n`)
            return { stdout: `go: creating new go.mod: module ${args[2] || 'myapp'}\n`, stderr: '', exitCode: 0 }
          case 'download':
            return { stdout: 'go: downloading modules...\n', stderr: '', exitCode: 0 }
          case 'tidy':
            return { stdout: '', stderr: '', exitCode: 0 }
          default:
            return { stdout: '', stderr: 'go mod: unknown command', exitCode: 1 }
        }
      }
      default:
        return { stdout: '', stderr: `go: unknown command '${sub}'\n`, exitCode: 1 }
    }
  }

  private cmdCargo(args: string[]): ShellResult {
    const sub = args[0] || ''
    switch (sub) {
      case '--version':
        return { stdout: 'cargo 1.75.0\n', stderr: '', exitCode: 0 }
      case 'build': {
        const release = args.includes('--release')
        return { stdout: `   Compiling myapp v0.1.0 (/home/ghost/projects/myapp)\n    Finished ${release ? 'release' : 'dev'} [unoptimized + debuginfo] target(s) in 2.34s\n`, stderr: '', exitCode: 0 }
      }
      case 'test':
        return { stdout: `   Compiling myapp v0.1.0 (/home/ghost/projects/myapp)\n    Finished test [unoptimized + debuginfo] target(s) in 1.87s\n     Running unittests src/lib.rs\n\nrunning 3 tests\ntest tests::it_works ... ok\ntest tests::test_add ... ok\n\ntest result: ok. 3 passed; 0 failed\n`, stderr: '', exitCode: 0 }
      case 'run':
        return { stdout: `   Compiling myapp v0.1.0 (/home/ghost/projects/myapp)\n    Finished dev [unoptimized + debuginfo] target(s) in 2.12s\n     Running \`target/debug/myapp\`\nHello, Rust!\n`, stderr: '', exitCode: 0 }
      case 'new': {
        const name = args[1]
        if (!name) return { stdout: '', stderr: 'cargo new: project name required', exitCode: 1 }
        this.vfs.createDirectory(name, this.state.cwd)
        return { stdout: `     Created binary (application) \`${name}\` package\n`, stderr: '', exitCode: 0 }
      }
      default:
        return { stdout: '', stderr: `cargo: unknown command '${sub}'\n`, exitCode: 1 }
    }
  }

  // === NETWORK TOOLS ===

  private cmdSs(args: string[]): ShellResult {
    const tlnp = args.includes('-tlnp')
    const tln = args.includes('-tln')
    const tn = args.includes('-tn')

    if (tlnp) {
      return {
        stdout:
`State   Recv-Q  Send-Q   Local Address:Port    Peer Address:Port  Process
LISTEN  0       4096           0.0.0.0:22           0.0.0.0:*      users:(("sshd",pid=1200,fd=3))
LISTEN  0       511            0.0.0.0:80           0.0.0.0:*      users:(("nginx",pid=1891,fd=6))
LISTEN  0       4096     127.0.0.53%lo:53           0.0.0.0:*      users:(("systemd-resolve",pid=980,fd=12))
LISTEN  0       128          127.0.0.1:5432         0.0.0.0:*      users:(("postgres",pid=2010,fd=5))
LISTEN  0       511          127.0.0.1:6379         0.0.0.0:*      users:(("redis-server",pid=2105,fd=6))
LISTEN  0       511          127.0.0.1:3000         0.0.0.0:*      users:(("node",pid=1842,fd=18))
`, stderr: '', exitCode: 0
      }
    }
    if (tln) {
      return {
        stdout: `State  Recv-Q  Send-Q  Local Address:Port  Peer Address:Port\nLISTEN 0       4096    0.0.0.0:22         0.0.0.0:*\nLISTEN 0       511     0.0.0.0:80         0.0.0.0:*\nLISTEN 0       128     127.0.0.1:5432     0.0.0.0:*\nLISTEN 0       511     127.0.0.1:6379     0.0.0.0:*\nLISTEN 0       511     127.0.0.1:3000     0.0.0.0:*\n`, stderr: '', exitCode: 0
      }
    }
    if (tn) {
      return {
        stdout: `State  Recv-Q  Send-Q  Local Address:Port  Peer Address:Port\nESTAB  0       0       192.168.1.10:43522  192.168.1.1:443\nESTAB  0       0       192.168.1.10:54322  127.0.0.1:5432\n`, stderr: '', exitCode: 0
      }
    }
    return { stdout: '', stderr: 'ss: display socket statistics\nUsage: ss -tlnp, ss -tln, ss -tn', exitCode: 0 }
  }

  private cmdDig(args: string[]): ShellResult {
    const short = args.includes('+short')
    const reverse = args.includes('-x')
    const domain = args.find(a => !a.startsWith('-') && a !== '+short') || 'example.com'

    if (reverse) {
      const ip = args[args.indexOf('-x') + 1] || '8.8.8.8'
      if (short) return { stdout: `dns.google.\n`, stderr: '', exitCode: 0 }
      return {
        stdout:
`; <<>> DiG 9.18.12 <<>> -x ${ip}
;; global options: +cmd
;; ->>HEADER<<- opcode: QUERY, status: NOERROR
;; QUESTION SECTION:
;${ip}.in-addr.arpa. IN PTR
;; ANSWER SECTION:
${ip}.in-addr.arpa. 3600 IN PTR dns.google.
`, stderr: '', exitCode: 0
      }
    }

    if (short) return { stdout: `93.184.216.34\n`, stderr: '', exitCode: 0 }
    return {
      stdout:
`; <<>> DiG 9.18.12 <<>> ${domain}
;; global options: +cmd
;; Got answer:
;; ->>HEADER<<- opcode: QUERY, status: NOERROR
;; QUESTION SECTION:
;${domain}.    IN A
;; ANSWER SECTION:
${domain}.  86400  IN  A  93.184.216.34
;; Query time: 45 msec
`, stderr: '', exitCode: 0
    }
  }

  private cmdNc(args: string[]): ShellResult {
    const zv = args.includes('-zv')
    const listen = args.includes('-l')
    if (zv) {
      const host = args.find(a => !a.startsWith('-')) || 'localhost'
      const port = args.find(a => /^\d+$/.test(a)) || '80'
      return { stdout: `Connection to ${host} ${port} port [tcp/http] succeeded!\n`, stderr: '', exitCode: 0 }
    }
    if (listen) {
      const port = args.find(a => /^\d+$/.test(a)) || '8080'
      return { stdout: `Listening on 0.0.0.0 ${port} (simulated)\n`, stderr: '', exitCode: 0 }
    }
    const host = args.find(a => !a.startsWith('-'))
    const port = args.find(a => /^\d+$/.test(a))
    if (host && port) {
      return { stdout: `Connected to ${host}:${port}\n`, stderr: '', exitCode: 0 }
    }
    return { stdout: '', stderr: 'nc: usage: nc [-zv] host port | nc -l port', exitCode: 1 }
  }


  // === TEXT PROCESSING ===

  private cmdTr(args: string[], stdin: string): ShellResult {
    const deleteMode = args.includes('-d')
    const squeeze = args.includes('-s')
    const set1 = args.find(a => !a.startsWith('-') && a !== args[args.indexOf('-d') + 1]) || ''
    const set2 = args[args.length - 1] || ''
    if (deleteMode) {
      const delSet = args[args.indexOf('-d') + 1] || ''
      return { stdout: stdin.split('').filter(c => !delSet.includes(c)).join(''), stderr: '', exitCode: 0 }
    }
    if (squeeze) {
      const squeezeSet = args[args.indexOf('-s') + 1] || ' '
      let result = stdin
      for (const ch of squeezeSet) {
        const re = new RegExp(ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '+', 'g')
        result = result.replace(re, ch)
      }
      return { stdout: result, stderr: '', exitCode: 0 }
    }
    // translate
    if (set1 === 'a-z' && set2 === 'A-Z') return { stdout: stdin.toUpperCase(), stderr: '', exitCode: 0 }
    if (set1 === 'A-Z' && set2 === 'a-z') return { stdout: stdin.toLowerCase(), stderr: '', exitCode: 0 }
    return { stdout: stdin, stderr: '', exitCode: 0 }
  }

  private cmdPaste(args: string[], stdin: string): ShellResult {
    const dIdx = args.indexOf('-d')
    const delimiter = dIdx >= 0 && args[dIdx + 1] ? args[dIdx + 1] : '\t'
    const files = args.filter(a => !a.startsWith('-') && a !== delimiter)
    if (files.length === 0) {
      return { stdout: stdin.split('\n').join(delimiter), stderr: '', exitCode: 0 }
    }
    const contents: string[][] = []
    for (const f of files) {
      const res = this.vfs.readFile(f, this.state.cwd)
      if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
      contents.push(res.content.split('\n').filter(l => l.length > 0))
    }
    const maxLen = Math.max(...contents.map(c => c.length))
    let stdout = ''
    for (let i = 0; i < maxLen; i++) {
      stdout += contents.map(c => c[i] || '').join(delimiter) + '\n'
    }
    return { stdout, stderr: '', exitCode: 0 }
  }

  private cmdComm(args: string[]): ShellResult {
    const suppress1 = args.includes('-1')
    const suppress2 = args.includes('-2')
    const suppress3 = args.includes('-3')
    const files = args.filter(a => !a.startsWith('-'))
    if (files.length < 2) return { stdout: '', stderr: 'comm: missing operand', exitCode: 1 }
    const f1 = this.vfs.readFile(files[0], this.state.cwd)
    const f2 = this.vfs.readFile(files[1], this.state.cwd)
    if (f1.error) return { stdout: '', stderr: f1.error, exitCode: 1 }
    if (f2.error) return { stdout: '', stderr: f2.error, exitCode: 1 }
    const lines1 = f1.content.split('\n').filter(Boolean)
    const lines2 = f2.content.split('\n').filter(Boolean)
    let stdout = ''
    for (const l of lines1) {
      const in2 = lines2.includes(l)
      if (in2 && !suppress3) stdout += `\t\t${l}\n`
      else if (!in2 && !suppress1) stdout += `${l}\n`
    }
    for (const l of lines2) {
      if (!lines1.includes(l) && !suppress2) stdout += `\t${l}\n`
    }
    return { stdout, stderr: '', exitCode: 0 }
  }

  private cmdExpand(args: string[], stdin: string): ShellResult {
    const tIdx = args.indexOf('-t')
    const tabSize = tIdx >= 0 && args[tIdx + 1] ? parseInt(args[tIdx + 1]) : 8
    if (stdin) {
      return { stdout: stdin.replace(/\t/g, ' '.repeat(tabSize)), stderr: '', exitCode: 0 }
    }
    const file = args.find(a => !a.startsWith('-'))
    if (!file) return { stdout: '', stderr: '', exitCode: 0 }
    const res = this.vfs.readFile(file, this.state.cwd)
    if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
    return { stdout: res.content.replace(/\t/g, ' '.repeat(tabSize)), stderr: '', exitCode: 0 }
  }

  private cmdUnexpand(args: string[], stdin: string): ShellResult {
    const tIdx = args.indexOf('-t')
    const tabSize = tIdx >= 0 && args[tIdx + 1] ? parseInt(args[tIdx + 1]) : 8
    const spaces = ' '.repeat(tabSize)
    if (stdin) {
      return { stdout: stdin.replace(new RegExp(spaces, 'g'), '\t'), stderr: '', exitCode: 0 }
    }
    const file = args.find(a => !a.startsWith('-'))
    if (!file) return { stdout: '', stderr: '', exitCode: 0 }
    const res = this.vfs.readFile(file, this.state.cwd)
    if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
    return { stdout: res.content.replace(new RegExp(spaces, 'g'), '\t'), stderr: '', exitCode: 0 }
  }

  private cmdDiff(args: string[]): ShellResult {
    const unified = args.includes('-u')
    const recursive = args.includes('-r')
    const files = args.filter(a => !a.startsWith('-'))
    if (files.length < 2) return { stdout: '', stderr: 'diff: missing operand', exitCode: 1 }
    const f1 = this.vfs.readFile(files[0], this.state.cwd)
    const f2 = this.vfs.readFile(files[1], this.state.cwd)
    if (f1.error || f2.error) return { stdout: '', stderr: `diff: ${f1.error || f2.error}`, exitCode: 2 }
    const lines1 = f1.content.split('\n')
    const lines2 = f2.content.split('\n')
    if (unified) {
      let stdout = `--- ${files[0]}\t2024-01-01 00:00:00\n+++ ${files[1]}\t2024-01-02 00:00:00\n@@ -1,${lines1.length} +1,${lines2.length} @@\n`
      for (const l of lines1) { if (l && !lines2.includes(l)) stdout += `-${l}\n` }
      for (const l of lines2) { if (l && !lines1.includes(l)) stdout += `+${l}\n` }
      return { stdout, stderr: '', exitCode: 1 }
    }
    if (recursive) {
      return { stdout: `Only in ${files[0]}: extra.txt\nCommon subdirectories: ${files[0]}/sub and ${files[1]}/sub\n`, stderr: '', exitCode: 1 }
    }
    let stdout = ''
    for (const l of lines1) { if (l && !lines2.includes(l)) stdout += `< ${l}\n` }
    for (const l of lines2) { if (l && !lines1.includes(l)) stdout += `> ${l}\n` }
    return { stdout, stderr: '', exitCode: stdout ? 1 : 0 }
  }

  private cmdJq(args: string[], stdin: string): ShellResult {
    const query = args[0] || '.'
    let input = stdin
    if (!input && args.length > 1) {
      const res = this.vfs.readFile(args[args.length - 1], this.state.cwd)
      if (!res.error) input = res.content
    }
    if (!input.trim()) return { stdout: '', stderr: 'jq: no input', exitCode: 1 }
    try {
      const json = JSON.parse(input)
      if (query === '.') return { stdout: JSON.stringify(json, null, 2) + '\n', stderr: '', exitCode: 0 }
      if (query.startsWith('.') && query !== '.') {
        const key = query.slice(1)
        if (key === '[]' && Array.isArray(json)) {
          let stdout = ''
          for (const item of json) stdout += JSON.stringify(item) + '\n'
          return { stdout, stderr: '', exitCode: 0 }
        }
        const val = json[key as keyof typeof json]
        if (val !== undefined) return { stdout: JSON.stringify(val, null, 2) + '\n', stderr: '', exitCode: 0 }
        // Handle nested key like .key.subkey
        const parts = key.split('.')
        let current: unknown = json
        for (const part of parts) {
          if (current && typeof current === 'object' && part in current) current = (current as Record<string, unknown>)[part]
          else return { stdout: 'null\n', stderr: '', exitCode: 0 }
        }
        return { stdout: JSON.stringify(current, null, 2) + '\n', stderr: '', exitCode: 0 }
      }
      if (query === 'length') return { stdout: String(Array.isArray(json) ? json.length : Object.keys(json).length) + '\n', stderr: '', exitCode: 0 }
      if (query === 'keys') return { stdout: JSON.stringify(Object.keys(json)) + '\n', stderr: '', exitCode: 0 }
      return { stdout: JSON.stringify(json, null, 2) + '\n', stderr: '', exitCode: 0 }
    } catch {
      return { stdout: '', stderr: 'jq: parse error\n', exitCode: 1 }
    }
  }

  // === FILE OPERATIONS ===

  private cmdTree(args: string[]): ShellResult {
    const showAll = args.includes('-a')
    const dirsOnly = args.includes('-d')
    let maxDepth = Infinity
    const lIdx = args.indexOf('-L')
    if (lIdx >= 0 && args[lIdx + 1]) maxDepth = parseInt(args[lIdx + 1])
    const path = args.find(a => !a.startsWith('-')) || '.'

    const startParts = path === '.' ? this.state.cwd : this.vfs.resolvePath(path, this.state.cwd)
    let stdout = startParts[startParts.length - 1] || '.' + '\n'

    const walk = (parts: string[], prefix: string, depth: number) => {
      if (depth >= maxDepth) return
      const { entries } = this.vfs.listDirectory(parts.join('/'), [])
      let filtered = entries
      if (!showAll) filtered = filtered.filter(e => !e.name.startsWith('.'))
      if (dirsOnly) filtered = filtered.filter(e => e.type === 'directory')
      for (let i = 0; i < filtered.length; i++) {
        const e = filtered[i]
        const isLast = i === filtered.length - 1
        stdout += `${prefix}${isLast ? '\u2514' : '\u251C'}\u2500\u2500 ${e.name}${e.type === 'directory' ? '/' : ''}\n`
        if (e.type === 'directory') {
          walk(parts.concat(e.name), prefix + (isLast ? '    ' : '\u2502   '), depth + 1)
        }
      }
    }
    walk(startParts, '', 0)
    return { stdout, stderr: '', exitCode: 0 }
  }

  private cmdStat(args: string[]): ShellResult {
    const formatIdx = args.indexOf('-c')
    const customFormat = formatIdx >= 0 ? args[formatIdx + 1] : null
    const file = args.find((a, i) => !a.startsWith('-') && i !== formatIdx && i !== formatIdx + 1) || '.'
    const st = this.vfs.stat(file, this.state.cwd)
    if (!st.node) return { stdout: '', stderr: `stat: cannot statx '${file}': No such file or directory`, exitCode: 1 }
    const n = st.node
    if (customFormat) {
      let fmt = customFormat
      fmt = fmt.replace(/%A/, (n.type === 'directory' ? 'd' : '-') + n.permissions)
      fmt = fmt.replace(/%n/, n.name)
      fmt = fmt.replace(/%s/, String(n.size))
      fmt = fmt.replace(/%U/, n.owner)
      fmt = fmt.replace(/%G/, n.group)
      fmt = fmt.replace(/%y/, n.mtime.toISOString())
      return { stdout: fmt + '\n', stderr: '', exitCode: 0 }
    }
    return {
      stdout:
`  File: ${n.name}
  Size: ${n.size}       Blocks: ${Math.ceil(n.size / 512)}       IO Block: 4096   ${n.type === 'directory' ? 'directory' : 'regular file'}
Device: 801h/2049d    Inode: ${Math.floor(Math.random() * 1000000)}         Links: 1
Access: (${n.permissions})  Uid: ( 1000/ ${n.owner})   Gid: ( 1000/ ${n.group})
Access: ${n.mtime.toISOString()}
Modify: ${n.mtime.toISOString()}
Change: ${n.mtime.toISOString()}
 Birth: ${n.mtime.toISOString()}
`, stderr: '', exitCode: 0
    }
  }

  private cmdShred(args: string[]): ShellResult {
    const verbose = args.includes('-v')
    const nIdx = args.indexOf('-n')
    const passes = nIdx >= 0 ? parseInt(args[nIdx + 1]) : 3
    const files = args.filter((a, i) => !a.startsWith('-') && i !== nIdx && i !== nIdx + 1)
    if (files.length === 0) return { stdout: '', stderr: 'shred: missing file operand', exitCode: 1 }
    let stdout = ''
    for (const f of files) {
      const st = this.vfs.stat(f, this.state.cwd)
      if (!st.node) return { stdout: '', stderr: `shred: ${f}: cannot stat: No such file or directory`, exitCode: 1 }
      if (verbose) {
        for (let i = 1; i <= passes; i++) stdout += `${f}: pass ${i}/${passes} (random)...\n`
        stdout += `${f}: removing\n${f}: renamed to ${Math.random().toString(36).slice(2, 10)}\n${f}: removed\n`
      }
      this.vfs.writeFile(f, this.state.cwd, '\x00'.repeat(st.node.size))
    }
    return { stdout, stderr: '', exitCode: 0 }
  }

  private cmdInstall(args: string[]): ShellResult {
    const modeIdx = args.indexOf('-m')
    const files = args.filter((a, i) => !a.startsWith('-') && i !== modeIdx && i !== modeIdx + 1)
    if (files.length < 2) return { stdout: '', stderr: 'install: missing destination', exitCode: 1 }
    const dst = files.pop()!
    for (const src of files) {
      const res = this.vfs.readFile(src, this.state.cwd)
      if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
      const writeRes = this.vfs.writeFile(dst + '/' + src.split('/').pop(), this.state.cwd, res.content)
      if (writeRes.error) this.vfs.writeFile(dst, this.state.cwd, res.content)
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  // === COMPRESSION / ARCHIVES ===

  private cmdTar(args: string[]): ShellResult {
    const cCreate = args.includes('-c') || args.includes('--create')
    const xExtract = args.includes('-x') || args.includes('--extract')
    const tList = args.includes('-t') || args.includes('--list')
    const fIdx = args.indexOf('-f')
    const files = args.filter((a, i) => !a.startsWith('-') && i !== fIdx && i !== fIdx + 1)

    if (cCreate) {
      // Simulate creating archive
      return { stdout: files.join('\n') + '\n', stderr: '', exitCode: 0 }
    }
    if (xExtract) {
      return { stdout: '', stderr: '', exitCode: 0 }
    }
    if (tList) {
      return { stdout: `-rw-r--r-- ghost/ghost  1024 2024-01-01 file.txt\n-rw-r--r-- ghost/ghost  2048 2024-01-01 data.json\ndrwxr-xr-x ghost/ghost     0 2024-01-01 src/\n`, stderr: '', exitCode: 0 }
    }
    return { stdout: '', stderr: 'tar: invalid option\nUsage: tar -czf archive.tar.gz files | tar -xzf archive.tar.gz | tar -tf archive.tar', exitCode: 1 }
  }

  private cmdGzip(args: string[]): ShellResult {
    const keep = args.includes('-k') || args.includes('--keep')
    const files = args.filter(a => !a.startsWith('-'))
    if (files.length === 0) return { stdout: '', stderr: 'gzip: compressed data not written to a terminal', exitCode: 1 }
    let stdout = ''
    for (const f of files) {
      const res = this.vfs.readFile(f, this.state.cwd)
      if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
      this.vfs.writeFile(f + '.gz', this.state.cwd, res.content)
      if (!keep) this.vfs.deleteFile(f, this.state.cwd)
      stdout += `${f}:       ${Math.floor(res.content.length * 0.3)}.${Math.floor(Math.random() * 9)}% -- replaced with ${f}.gz\n`
    }
    return { stdout, stderr: '', exitCode: 0 }
  }

  private cmdGunzip(args: string[]): ShellResult {
    const files = args.filter(a => !a.startsWith('-'))
    if (files.length === 0) return { stdout: '', stderr: 'gunzip: compressed data not written to a terminal', exitCode: 1 }
    for (const f of files) {
      const fname = f.endsWith('.gz') ? f : f + '.gz'
      const res = this.vfs.readFile(fname, this.state.cwd)
      if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
      this.vfs.writeFile(fname.replace('.gz', ''), this.state.cwd, res.content)
      this.vfs.deleteFile(fname, this.state.cwd)
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdZcat(args: string[]): ShellResult {
    const files = args.filter(a => !a.startsWith('-'))
    if (files.length === 0) return { stdout: '', stderr: 'zcat: compressed data not written to a terminal', exitCode: 1 }
    let stdout = ''
    for (const f of files) {
      const res = this.vfs.readFile(f, this.state.cwd)
      if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
      stdout += res.content
    }
    return { stdout, stderr: '', exitCode: 0 }
  }

  private cmdBzip2(args: string[]): ShellResult {
    const keep = args.includes('-k')
    const files = args.filter(a => !a.startsWith('-'))
    if (files.length === 0) return { stdout: '', stderr: 'bzip2: compressed data not written to a terminal', exitCode: 1 }
    for (const f of files) {
      const res = this.vfs.readFile(f, this.state.cwd)
      if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
      this.vfs.writeFile(f + '.bz2', this.state.cwd, res.content)
      if (!keep) this.vfs.deleteFile(f, this.state.cwd)
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdBunzip2(args: string[]): ShellResult {
    const files = args.filter(a => !a.startsWith('-'))
    for (const f of files) {
      const fname = f.endsWith('.bz2') ? f : f + '.bz2'
      const res = this.vfs.readFile(fname, this.state.cwd)
      if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
      this.vfs.writeFile(fname.replace('.bz2', ''), this.state.cwd, res.content)
      this.vfs.deleteFile(fname, this.state.cwd)
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdXz(args: string[]): ShellResult {
    const keep = args.includes('-k')
    const files = args.filter(a => !a.startsWith('-'))
    if (files.length === 0) return { stdout: '', stderr: 'xz: compressed data not written to a terminal', exitCode: 1 }
    for (const f of files) {
      const res = this.vfs.readFile(f, this.state.cwd)
      if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
      this.vfs.writeFile(f + '.xz', this.state.cwd, res.content)
      if (!keep) this.vfs.deleteFile(f, this.state.cwd)
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdUnxz(args: string[]): ShellResult {
    const files = args.filter(a => !a.startsWith('-'))
    for (const f of files) {
      const fname = f.endsWith('.xz') ? f : f + '.xz'
      const res = this.vfs.readFile(fname, this.state.cwd)
      if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
      this.vfs.writeFile(fname.replace('.xz', ''), this.state.cwd, res.content)
      this.vfs.deleteFile(fname, this.state.cwd)
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdZip(args: string[]): ShellResult {
    const files = args.filter(a => !a.startsWith('-'))
    if (files.length < 1) return { stdout: '', stderr: 'zip: nothing to do', exitCode: 12 }
    return { stdout: `  adding: ${files.slice(1).join('\n  adding: ')}\n`, stderr: '', exitCode: 0 }
  }

  private cmdUnzip(args: string[]): ShellResult {
    const list = args.includes('-l')
    const files = args.filter(a => !a.startsWith('-'))
    if (files.length === 0) return { stdout: '', stderr: 'unzip: cannot find or open', exitCode: 9 }
    if (list) {
      return { stdout: `  Length      Date    Time    Name\n---------  ---------- -----   ----\n     1024  01-01-2024 00:00   file.txt\n     2048  01-01-2024 00:00   data.json\n---------                     -------\n     3072                     2 files\n`, stderr: '', exitCode: 0 }
    }
    return { stdout: `Archive: ${files[0]}\n  inflating: file.txt\n  inflating: data.json\n`, stderr: '', exitCode: 0 }
  }


  // === TERMINAL MULTIPLEXERS ===

  private cmdTmux(args: string[]): ShellResult {
    const sub = args[0] || ''
    const targetIdx = args.indexOf('-t')
    const target = targetIdx >= 0 ? args[targetIdx + 1] : ''

    switch (sub) {
      case 'new':
      case 'new-session': {
        const sIdx = args.indexOf('-s')
        const name = sIdx >= 0 ? args[sIdx + 1] : `session-${this.services.tmuxSessions.size}`
        this.services.tmuxSessions.set(name, { windows: 1, attached: true })
        return { stdout: '', stderr: '', exitCode: 0, mode: 'tmux' }
      }
      case 'ls':
      case 'list-sessions': {
        let stdout = ''
        this.services.tmuxSessions.forEach((s, name) => {
          stdout += `${name}: ${s.windows} window${s.windows > 1 ? 's' : ''}${s.attached ? ' (attached)' : ''}\n`
        })
        if (!stdout) stdout = 'no server running on /tmp/tmux-1000/default\n'
        return { stdout, stderr: '', exitCode: 0 }
      }
      case 'attach':
      case 'attach-session': {
        if (!target) return { stdout: '', stderr: 'tmux: target session required (-t)', exitCode: 1 }
        const s = this.services.tmuxSessions.get(target)
        if (!s) return { stdout: '', stderr: `tmux: session ${target} not found`, exitCode: 1 }
        s.attached = true
        return { stdout: '', stderr: '', exitCode: 0, mode: 'tmux' }
      }
      case 'kill-session': {
        if (!target) return { stdout: '', stderr: 'tmux: target session required (-t)', exitCode: 1 }
        this.services.tmuxSessions.delete(target)
        return { stdout: '', stderr: '', exitCode: 0 }
      }
      case 'rename-session': {
        const oldName = target
        const newName = args[args.length - 1]
        if (!oldName || !newName) return { stdout: '', stderr: 'tmux: rename-session -t old new', exitCode: 1 }
        const s = this.services.tmuxSessions.get(oldName)
        if (s) { this.services.tmuxSessions.delete(oldName); this.services.tmuxSessions.set(newName, s) }
        return { stdout: '', stderr: '', exitCode: 0 }
      }
      case 'source-file': {
        const file = args[1]
        if (!file) return { stdout: '', stderr: 'tmux: source-file <path>', exitCode: 1 }
        return { stdout: '', stderr: '', exitCode: 0 }
      }
      case 'split-window':
        return { stdout: '', stderr: '', exitCode: 0 }
      case 'new-window':
        return { stdout: '', stderr: '', exitCode: 0 }
      default:
        return { stdout: '', stderr: '', exitCode: 0, mode: 'tmux' }
    }
  }

  private cmdScreen(args: string[]): ShellResult {
    const sub = args[0] || ''
    const name = sub === '-S' ? args[1] : (sub === '-r' || sub === '-d') ? args[1] : ''

    switch (sub) {
      case '-S': {
        if (!name) return { stdout: '', stderr: 'screen: session name required', exitCode: 1 }
        this.services.screenSessions.set(name, { attached: true })
        return { stdout: '', stderr: '', exitCode: 0, mode: 'screen' }
      }
      case '-ls': {
        let stdout = ''
        this.services.screenSessions.forEach((s, n) => {
          stdout += `\t${Math.floor(Math.random() * 9000 + 1000)}.${n}\t(${s.attached ? 'Attached' : 'Detached'})\n`
        })
        if (!stdout) stdout = 'No Sockets found in /run/screens/S-ghost.\n'
        return { stdout, stderr: '', exitCode: 0 }
      }
      case '-r': {
        if (!name) return { stdout: '', stderr: 'screen: session name required', exitCode: 1 }
        const s = this.services.screenSessions.get(name)
        if (!s) return { stdout: '', stderr: `There is no screen to be resumed matching ${name}.`, exitCode: 1 }
        s.attached = true
        return { stdout: '', stderr: '', exitCode: 0, mode: 'screen' }
      }
      case '-d': {
        if (name) {
          const s = this.services.screenSessions.get(name)
          if (s) s.attached = false
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      }
      default:
        return { stdout: '', stderr: '', exitCode: 0, mode: 'screen' }
    }
  }

  private cmdZellij(args: string[]): ShellResult {
    const sub = args[0] || ''
    switch (sub) {
      case '':
        return { stdout: '', stderr: '', exitCode: 0, mode: 'zellij' }
      case 'ls':
      case 'list-sessions': {
        let stdout = ''
        this.services.zellijSessions.forEach((s, n) => {
          stdout += `${n}: ${s.attached ? 'current' : 'EXITED'}\n`
        })
        if (!stdout) stdout = 'No active zellij sessions found.\n'
        return { stdout, stderr: '', exitCode: 0 }
      }
      case 'attach': {
        const name = args[1]
        if (!name) return { stdout: '', stderr: 'zellij: session name required', exitCode: 1 }
        const s = this.services.zellijSessions.get(name)
        if (!s) return { stdout: '', stderr: `Session: ${name} does not exist`, exitCode: 1 }
        s.attached = true
        return { stdout: '', stderr: '', exitCode: 0, mode: 'zellij' }
      }
      case 'new-session': {
        const name = args[args.indexOf('-s') + 1] || 'zellij-session'
        this.services.zellijSessions.set(name, { attached: true })
        return { stdout: '', stderr: '', exitCode: 0, mode: 'zellij' }
      }
      default:
        return { stdout: '', stderr: `zellij: unknown option -- ${sub}`, exitCode: 1 }
    }
  }

  // === ENVIRONMENT ===

  private cmdUnset(args: string[]): ShellResult {
    if (args.length === 0) return { stdout: '', stderr: 'unset: missing operand', exitCode: 1 }
    for (const name of args) {
      if (name.startsWith('-')) continue
      delete this.state.env[name]
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdSource(args: string[]): ShellResult {
    const file = args[0]
    if (!file) return { stdout: '', stderr: 'source: filename argument required', exitCode: 2 }
    const res = this.vfs.readFile(file, this.state.cwd)
    if (res.error) return { stdout: '', stderr: `source: ${file}: No such file or directory`, exitCode: 1 }
    return { stdout: `(sourcing ${file})\n`, stderr: '', exitCode: 0 }
  }

  private cmdUnalias(args: string[]): ShellResult {
    if (args.length === 0) return { stdout: '', stderr: 'unalias: missing operand', exitCode: 1 }
    for (const name of args) {
      delete this.state.aliases[name]
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  // === EXISTING UTILITIES ===

  private cmdMan(args: string[]): ShellResult {
    const page = args[0]
    const pages: Record<string, string> = {
      ls: 'LS(1)\n\nNAME\n       ls - list directory contents\n\nSYNOPSIS\n       ls [OPTION]... [FILE]...\n\nDESCRIPTION\n       List information about files.\n\n       -a    do not ignore entries starting with .\n       -l    use a long listing format\n       -h    human-readable sizes\n       -R    list subdirectories recursively\n',
      grep: 'GREP(1)\n\nNAME\n       grep, egrep, fgrep - print lines that match patterns\n\nSYNOPSIS\n       grep [OPTION] PATTERN [FILE]...\n\n       -i    ignore case\n       -n    print line number\n       -v    invert match\n       -r    recursive\n',
      cd: 'CD(1)\n\nNAME\n       cd - change the working directory\n\nSYNOPSIS\n       cd [DIRECTORY]\n',
      chmod: 'CHMOD(1)\n\nNAME\n       chmod - change file mode bits\n\nSYNOPSIS\n       chmod MODE FILE...\n\n       Numeric: 777, 755, 644, etc.\n       Symbolic: u+r, g-w, etc.\n',
      git: 'GIT(1)\n\nNAME\n       git - the stupid content tracker\n\nSYNOPSIS\n       git <command> [<args>]\n\n       init, status, add, commit, log, branch, switch, merge, stash...\n',
      docker: 'DOCKER(1)\n\nNAME\n       docker - container management tool\n\n       ps, images, run, exec, stop, build, pull, push...\n',
      kubectl: 'KUBECTL(1)\n\nNAME\n       kubectl - Kubernetes command line tool\n\n       get, describe, logs, exec, apply, delete...\n',
      npm: 'NPM(1)\n\nNAME\n       npm - Node package manager\n\n       install, test, run, list, audit, publish...\n',
      systemctl: 'SYSTEMCTL(1)\n\nNAME\n       systemctl - Control systemd services\n\n       status, start, stop, restart, enable, disable...\n',
    }
    return {
      stdout: pages[page] || `No manual entry for ${page}\n`,
      stderr: '',
      exitCode: pages[page] ? 0 : 1,
      mode: pages[page] ? 'man' : undefined
    }
  }

  private cmdWhich(args: string[]): ShellResult {
    const builtins = ['cd', 'echo', 'pwd', 'alias', 'export', 'history', 'source', '.', 'exit', 'help', 'unset', 'type']
    const cmd = args[0]
    if (!cmd) return { stdout: '', stderr: '', exitCode: 1 }
    if (builtins.includes(cmd)) return { stdout: '', stderr: `${cmd}: shell builtin`, exitCode: 1 }
    const paths = ['/bin', '/usr/bin', '/usr/local/bin']
    for (const p of paths) {
      const st = this.vfs.stat(p + '/' + cmd, [])
      if (st.node) return { stdout: p + '/' + cmd, stderr: '', exitCode: 0 }
    }
    return { stdout: '', stderr: `which: no ${cmd} in (${this.state.env.PATH})`, exitCode: 1 }
  }

  private cmdUname(args: string[]): ShellResult {
    let flags = ''
    for (const a of args) { if (a.startsWith('-')) flags += a.slice(1) }
    if (flags.includes('a')) return { stdout: 'Linux neonmall-server 5.15.0-91-generic #101-Ubuntu SMP x86_64 GNU/Linux\n', stderr: '', exitCode: 0 }
    if (flags.includes('r')) return { stdout: '5.15.0-91-generic\n', stderr: '', exitCode: 0 }
    if (flags.includes('n')) return { stdout: 'neonmall-server\n', stderr: '', exitCode: 0 }
    return { stdout: 'Linux\n', stderr: '', exitCode: 0 }
  }

  private cmdHistory(args: string[]): ShellResult {
    void args
    let stdout = ''
    this.state.history.forEach((h, i) => { stdout += `${String(i + 1).padStart(4)}  ${h}\n` })
    return { stdout, stderr: '', exitCode: 0 }
  }

  private cmdAlias(args: string[]): ShellResult {
    if (args.length === 0) {
      let stdout = ''
      for (const [k, v] of Object.entries(this.state.aliases)) stdout += `alias ${k}='${v}'\n`
      return { stdout, stderr: '', exitCode: 0 }
    }
    for (const a of args) {
      const eq = a.indexOf('=')
      if (eq > 0) {
        const name = a.slice(0, eq)
        const val = a.slice(eq + 1).replace(/^['"]|['"]$/g, '')
        this.state.aliases[name] = val
      }
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdExport(args: string[]): ShellResult {
    if (args.length === 0) return this.cmdEnv(args)
    for (const a of args) {
      const eq = a.indexOf('=')
      if (eq > 0) {
        const name = a.slice(0, eq)
        const val = a.slice(eq + 1).replace(/^['"]|['"]$/g, '')
        this.state.env[name] = val
      }
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdEnv(args: string[]): ShellResult {
    if (args.length > 0) {
      const name = args[0]
      return { stdout: this.state.env[name] || '', stderr: '', exitCode: 0 }
    }
    let stdout = ''
    for (const [k, v] of Object.entries(this.state.env)) stdout += `${k}=${v}\n`
    return { stdout, stderr: '', exitCode: 0 }
  }

  private cmdPushd(args: string[]): ShellResult {
    const path = args[0] || '/home/ghost'
    this.state.dirStack.push([...this.state.cwd])
    const parts = this.vfs.resolvePath(path, this.state.cwd)
    this.state.cwd = parts
    this.state.env.PWD = '/' + parts.join('/')
    return { stdout: this.state.dirStack.map(d => '/' + d.join('/')).join(' ') + ' ' + '/' + this.state.cwd.join('/') + '\n', stderr: '', exitCode: 0 }
  }

  private cmdPopd(_: string[]): ShellResult {
    void _
    if (this.state.dirStack.length === 0) return { stdout: '', stderr: 'popd: directory stack empty', exitCode: 1 }
    this.state.cwd = this.state.dirStack.pop()!
    this.state.env.PWD = '/' + this.state.cwd.join('/')
    return { stdout: this.state.dirStack.map(d => '/' + d.join('/')).join(' ') + ' ' + '/' + this.state.cwd.join('/') + '\n', stderr: '', exitCode: 0 }
  }

  private cmdSeq(args: string[]): ShellResult {
    let from = 1
    let to = 1
    if (args.length === 1) to = parseInt(args[0])
    else if (args.length >= 2) { from = parseInt(args[0]); to = parseInt(args[1]) }
    let stdout = ''
    for (let i = from; i <= to; i++) stdout += i + '\n'
    return { stdout, stderr: '', exitCode: 0 }
  }

  private cmdCut(args: string[], stdin: string): ShellResult {
    let field = 1
    let delimiter = '\t'
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-f' && i + 1 < args.length) field = parseInt(args[++i])
      if (args[i] === '-d' && i + 1 < args.length) delimiter = args[++i]
    }
    const lines = stdin.split('\n')
    let stdout = ''
    for (const line of lines) {
      const parts = line.split(delimiter)
      if (parts[field - 1] !== undefined) stdout += parts[field - 1] + '\n'
    }
    return { stdout, stderr: '', exitCode: 0 }
  }

  getPrompt(): string {
    const path = '~' + (this.state.cwd.length > 2 ? '/' + this.state.cwd.slice(2).join('/') : '')
    return `${this.state.env.USER}@neonmall:${path}$ `
  }

  getModeFromCommand(cmd: string): string | undefined {
    if (cmd.startsWith('less') || cmd.startsWith('man ')) return 'less'
    if (cmd.startsWith('vim') || cmd.startsWith('vi ')) return 'vim:normal'
    if (cmd.startsWith('nano')) return 'nano'
    if (cmd.startsWith('node')) return 'node'
    if (cmd.startsWith('python')) return 'python'
    if (cmd.startsWith('psql')) return 'psql'
    if (cmd.startsWith('sqlite')) return 'sqlite'
    if (cmd.startsWith('tmux')) return 'tmux'
    if (cmd.startsWith('screen')) return 'screen'
    if (cmd.startsWith('zellij')) return 'zellij'
    return undefined
  }
}
