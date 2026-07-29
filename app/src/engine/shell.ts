import { VFS } from './vfs'
import { createGitState, gitCommand, type GitState } from './git'

// Safety limits to prevent browser freeze from infinite loops / excessive output
const MAX_OUTPUT_LENGTH = 10000
const TRUNCATION_MSG = '\n... (output truncated)\n'
const MAX_GREP_INPUT = 50000
const MAX_ARCHIVE_ENTRIES = 512
const MAX_ARCHIVE_BYTES = 2_000_000
const SHELL_BUILTINS = new Set([
  'alias', 'cd', 'command', 'dirs', 'echo', 'env', 'exit', 'export', 'history', 'popd',
  'getopts', 'printenv', 'pushd', 'pwd', 'read', 'set', 'source', 'sudo', 'test', 'trap',
  'type', 'umask', 'unalias', 'unset', '.', ':',
])
const SIMULATED_EXECUTABLES = new Set([
  'apropos', 'apt', 'awk', 'bash', 'basename', 'bzip2', 'bunzip2', 'cargo', 'cat', 'chgrp', 'chmod', 'chown', 'clear',
  'comm', 'cp', 'crontab', 'csplit', 'curl', 'cut', 'date', 'df', 'diff', 'dig', 'dirname', 'dpkg',
  'dd', 'dmesg', 'docker', 'du', 'false', 'file', 'find', 'findmnt', 'free', 'go', 'grep', 'groups', 'gunzip',
  'gzip', 'head', 'hostname', 'id', 'install', 'journalctl', 'jq', 'kill', 'kubectl', 'fsck', 'getfacl',
  'ip', 'ldd', 'less', 'ln', 'logger', 'logrotate', 'losetup', 'ls', 'lsof', 'lsblk', 'make', 'man', 'md5sum', 'mkdir', 'mount', 'mv', 'nano', 'nc', 'netcat', 'nice', 'git',
  'node', 'nohup', 'npm', 'npx', 'paste', 'patch', 'pgrep', 'ping', 'pip', 'pkill', 'pnpm', 'ps',
  'python', 'python3', 'readlink', 'realpath', 'renice', 'rev', 'rm', 'rsync', 'scp', 'screen', 'sed', 'seq', 'service', 'setfacl', 'sha256sum', 'shred', 'sort', 'split', 'strace',
  'ssh', 'ssh-keygen', 'ss', 'stat', 'systemctl', 'tail', 'tar', 'tcpdump', 'tee', 'timeout', 'tmux', 'top', 'touch',
  'tr', 'tree', 'true', 'truncate', 'uname', 'uniq', 'unzip', 'unxz', 'uptime', 'vi', 'vim',
  'watch', 'wc', 'which', 'whoami', 'xargs', 'xz', 'yarn', 'zcat', 'zellij', 'zip',
])

export function isSupportedShellCommand(command: string): boolean {
  const name = command.trim().split(/\s+/)[0]?.split('/').pop() ?? ''
  return SHELL_BUILTINS.has(name) || SIMULATED_EXECUTABLES.has(name)
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface ShellResult {
  stdout: string
  stderr: string
  exitCode: number
  mode?: string
  successfulCommands?: string[]
  progressEligible?: boolean
}

export interface ShellState {
  cwd: string[]
  env: Record<string, string>
  lastExitCode: number
  history: string[]
  aliases: Record<string, string>
  dirStack: string[][]
  umask: number
  pipefail: boolean
}

interface SimulatedArchiveEntry {
  path: string
  type: 'file' | 'directory' | 'symlink'
  content?: string
  target?: string
  permissions: string
  owner: string
  group: string
  mtime: string
}

interface SimulatedArchive {
  format: 'ghost-archive-v1'
  kind: 'tar' | 'zip'
  compressed: boolean
  entries: SimulatedArchiveEntry[]
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
  openFiles: Array<{
    command: string
    pid: number
    user: string
    fd: string
    type: string
    name: string
    deleted?: boolean
  }>
  systemPackages: Map<string, { version: string; description: string; installed: boolean }>
  pythonPackages: Map<string, string>
  processNiceness: Map<number, number>
  terminatedProcesses: Set<number>
  stoppedProcesses: Set<number>
  remoteFiles: Map<string, string>
  mounts: Map<string, { source: string; type: string; options: string }>
  loopDevices: Map<string, string>
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
    tmuxSessions: new Map(),
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
    openFiles: [
      { command: 'node', pid: 1842, user: 'ghost', fd: '18u', type: 'IPv4', name: '*:3000 (LISTEN)' },
      { command: 'nginx', pid: 1891, user: 'www-data', fd: '4w', type: 'REG', name: '/var/log/nginx/access.log (deleted)', deleted: true },
      { command: 'postgres', pid: 2010, user: 'postgres', fd: '7u', type: 'IPv4', name: '127.0.0.1:5432 (LISTEN)' },
    ],
    systemPackages: new Map([
      ['nginx', { version: '1.18.0-6ubuntu14.4', description: 'small, powerful, scalable web/proxy server', installed: true }],
      ['curl', { version: '7.81.0-1ubuntu1.18', description: 'command line tool for transferring data with URL syntax', installed: true }],
      ['git', { version: '1:2.34.1-1ubuntu1.12', description: 'fast, scalable, distributed revision control system', installed: true }],
      ['ripgrep', { version: '13.0.0-2', description: 'recursively searches directories for a regex pattern', installed: false }],
    ]),
    pythonPackages: new Map([['pip', '23.2.1'], ['requests', '2.31.0'], ['flask', '3.0.0'], ['django', '5.0.0']]),
    processNiceness: new Map([[1, 0], [1842, 0], [1891, 0], [2010, 0], [2105, 0]]),
    terminatedProcesses: new Set(),
    stoppedProcesses: new Set(),
    remoteFiles: new Map(),
    mounts: new Map([
      ['/', { source: '/dev/sda1', type: 'ext4', options: 'rw,relatime' }],
      ['/home', { source: '/dev/sda2', type: 'ext4', options: 'rw,relatime' }],
      ['/tmp', { source: 'tmpfs', type: 'tmpfs', options: 'rw,nosuid,nodev' }],
    ]),
    loopDevices: new Map(),
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
    pipefail: false,
  }
}

function expandVars(str: string, env: Record<string, string>, lastExitCode: number): string {
  return str.replace(/\$\?|\$\{(\w+)\}|\$(\w+)/g, (match, a, b) => {
    if (match === '$?') return String(lastExitCode)
    return env[a || b] ?? ''
  })
}

function stripOuterQuotes(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function getShellSyntaxEvents(line: string): string[] {
  const events = new Set<string>()
  let quote: '"' | "'" | null = null
  for (let index = 0; index < line.length; index++) {
    const character = line[index]
    if (character === '\\' && quote !== "'") {
      events.add('\\')
      index++
      continue
    }
    if (character === '$' && quote !== "'") {
      if (line[index + 1] === '?') {
        events.add('$?')
        index++
      } else if (line[index + 1] === '{' || /[A-Za-z_]/.test(line[index + 1] ?? '')) {
        events.add('$VAR')
      }
    }
    if (quote) {
      if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") {
      events.add(character)
      quote = character
      continue
    }
    const pair = line.slice(index, index + 2)
    if (pair === '&&' || pair === '||' || pair === '>>' || pair === '2>') {
      events.add(pair)
      index++
      continue
    }
    if (character === '|' || character === '>') events.add(character)
  }
  return [...events]
}

function stripCodeLiteralsAndComments(source: string): string {
  let output = ''
  let quote: '"' | "'" | '`' | null = null
  let escaped = false
  let lineComment = false
  let blockComment = false
  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    const pair = source.slice(index, index + 2)
    if (lineComment) {
      if (character === '\n') {
        lineComment = false
        output += '\n'
      } else output += ' '
      continue
    }
    if (blockComment) {
      if (pair === '*/') {
        blockComment = false
        output += '  '
        index++
      } else output += character === '\n' ? '\n' : ' '
      continue
    }
    if (quote) {
      output += character === '\n' ? '\n' : ' '
      if (escaped) escaped = false
      else if (character === '\\' && quote !== '`') escaped = true
      else if (character === quote) quote = null
      continue
    }
    if (pair === '//') {
      lineComment = true
      output += '  '
      index++
      continue
    }
    if (pair === '/*') {
      blockComment = true
      output += '  '
      index++
      continue
    }
    if (character === '"' || character === '`' || (character === "'" && source[index + 2] === "'")) {
      quote = character as '"' | "'" | '`'
      output += '_'
      continue
    }
    output += character
  }
  return quote || blockComment ? '' : output
}

function hasBalancedCodeDelimiters(source: string): boolean {
  const stripped = stripCodeLiteralsAndComments(source)
  if (!stripped && source.trim()) return false
  const stack: string[] = []
  const closing: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
  for (const character of stripped) {
    if ('([{'.includes(character)) stack.push(character)
    else if (character in closing && stack.pop() !== closing[character]) return false
  }
  return stack.length === 0
}

function isBoundedExpression(expression: string): boolean {
  const value = expression.trim()
  return value.length > 0
    && !/[{};]/.test(value)
    && !/\b(?:if|else|for|while|loop|match|switch|select|range|let|var|func|fn|return)\b/.test(value)
    && !/(?:[=+\-*/%<>!&|?:,]|\b(?:and|or))\s*$/.test(value)
    && /^[\w\s._,+\-*/%!=<>&|()[\]:!?]*$/.test(value)
}

function isBoundedGoStatement(statement: string): boolean {
  const value = statement.trim()
  if (!value) return true
  if (/^return(?:\s+[\s\S]+)?$/.test(value)) {
    const expression = value.replace(/^return\b/, '').trim()
    return !expression || isBoundedExpression(expression)
  }
  const declaration = value.match(/^var\s+[A-Za-z_]\w*(?:\s+[A-Za-z_][\w.[\]*]*)?(?:\s*=\s*([\s\S]+))?$/)
  if (declaration) return declaration[1] === undefined || isBoundedExpression(declaration[1])
  const assignment = value.match(/^[A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*\s*(?::=|=)\s*([\s\S]+)$/)
  if (assignment) return isBoundedExpression(assignment[1])
  if (/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*\s*\([^{};]*\)$/.test(value)) return true
  return /^[A-Za-z_]\w*(?:\+\+|--)$/.test(value)
}

function isBoundedGoSource(source: string): boolean {
  if (!hasBalancedCodeDelimiters(source)) return false
  let stripped = stripCodeLiteralsAndComments(source)
  if (
    !stripped
    || /\b(?:if|else|for|switch|select|go|defer|range)\b/.test(stripped)
    || (stripped.match(/^\s*package\s+[A-Za-z_]\w*/gm)?.length ?? 0) !== 1
  ) return false

  stripped = stripped.replace(/^\s*package\s+[A-Za-z_]\w*\s*;?/m, '')
  stripped = stripped.replace(/^\s*import\s+(?:\([^(){}]*\)|[^\r\n;]+)\s*;?/gm, '')
  let functionCount = 0
  stripped = stripped.replace(
    /\bfunc\s+(?:\([^{}]*\)\s*)?[A-Za-z_]\w*\s*\([^{}]*\)\s*(?:\([^{}]*\)|[A-Za-z_][\w.[\]*]*\s*)?\{([^{}]*)\}/g,
    (_match, body: string) => {
      functionCount++
      return body.split(/[;\r\n]+/).every(isBoundedGoStatement) ? '' : '__INVALID_GO_BODY__'
    },
  )
  return functionCount > 0 && stripped.trim() === ''
}

function isBoundedRustStatement(statement: string): boolean {
  const value = statement.trim()
  if (!value) return true
  const declaration = value.match(/^let(?:\s+mut)?\s+[A-Za-z_]\w*(?:\s*:\s*[^=;]+)?\s*=\s*([\s\S]+)$/)
  if (declaration) return isBoundedExpression(declaration[1])
  if (/^return(?:\s+[\s\S]+)?$/.test(value)) {
    const expression = value.replace(/^return\b/, '').trim()
    return !expression || isBoundedExpression(expression)
  }
  if (/^[A-Za-z_]\w*(?:::[A-Za-z_]\w*)*(?:!)?\s*\([^{};]*\)$/.test(value)) return true
  return isBoundedExpression(value)
}

function isBoundedRustSource(source: string): boolean {
  if (!hasBalancedCodeDelimiters(source)) return false
  let stripped = stripCodeLiteralsAndComments(source)
  if (!stripped || /\b(?:if|else|for|while|loop|match)\b/.test(stripped)) return false
  stripped = stripped.replace(/^\s*(?:pub\s+)?use\s+[^;]+;\s*$/gm, '')
  let functionCount = 0
  stripped = stripped.replace(
    /\b(?:pub\s+)?(?:async\s+)?fn\s+[A-Za-z_]\w*\s*\([^{}]*\)\s*(?:->\s*[^{}]+)?\{([^{}]*)\}/g,
    (_match, body: string) => {
      functionCount++
      return body.split(/[;\r\n]+/).every(isBoundedRustStatement) ? '' : '__INVALID_RUST_BODY__'
    },
  )
  return functionCount > 0 && stripped.trim() === ''
}

function hasUnsafeControlCharacters(value: string): boolean {
  return [...value].some(character => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127 || code === 155
  })
}

type ControlOperator = 'always' | '&&' | '||'

function stripTrailingBackgroundOperator(line: string): string | null {
  let quote: '"' | "'" | null = null
  let escaped = false
  let lastUnquotedNonSpace = -1
  for (let index = 0; index < line.length; index++) {
    const character = line[index]
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
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (!/\s/.test(character)) lastUnquotedNonSpace = index
  }
  if (lastUnquotedNonSpace < 0 || line[lastUnquotedNonSpace] !== '&' || line[lastUnquotedNonSpace - 1] === '&') {
    return null
  }
  return line.slice(0, lastUnquotedNonSpace).trim()
}

function hasUnsupportedBackgroundOperator(line: string): boolean {
  let quote: '"' | "'" | null = null
  let escaped = false
  for (let index = 0; index < line.length; index++) {
    const character = line[index]
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
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character !== '&') continue

    let end = index + 1
    while (line[end] === '&') end++
    const runLength = end - index
    const isTrailingSingle = runLength === 1 && line.slice(end).trim() === ''
    if (runLength !== 2 && !isTrailingSingle) return true
    index = end - 1
  }
  return false
}

function splitControlCommands(line: string): { command: string; operator: ControlOperator }[] {
  const commands: { command: string; operator: ControlOperator }[] = []
  let current = ''
  let operator: ControlOperator = 'always'
  let inQuote: '"' | "'" | null = null
  let escaped = false
  let requiresFollowingCommand = false

  const pushCommand = () => {
    const command = current.trim()
    if (!command) throw new Error('syntax error near unexpected control operator')
    commands.push({ command, operator })
    current = ''
  }

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\' && inQuote !== "'") {
      current += char
      escaped = true
      continue
    }
    if (inQuote) {
      current += char
      if (char === inQuote) inQuote = null
      continue
    }
    if (char === '"' || char === "'") {
      inQuote = char
      current += char
      continue
    }
    const pair = line.slice(i, i + 2)
    if (pair === '&&' || pair === '||') {
      pushCommand()
      operator = pair
      requiresFollowingCommand = true
      i++
      continue
    }
    if (char === ';') {
      pushCommand()
      operator = 'always'
      requiresFollowingCommand = false
      continue
    }
    current += char
  }

  if (current.trim()) pushCommand()
  else if (requiresFollowingCommand) throw new Error('syntax error near unexpected end of command')
  return commands
}

function parseLine(line: string): string[][] {
  const tokens: string[] = []
  let cur = ''
  let inQuote: '"' | "'" | null = null
  let escape = false

  const pushCurrent = () => {
    if (cur.length > 0) {
      tokens.push(cur)
      cur = ''
    }
  }

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (escape) {
      cur += ch
      escape = false
      continue
    }
    if (ch === '\\' && inQuote !== "'") {
      escape = true
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
      pushCurrent()
      continue
    }
    if (ch === '|') {
      pushCurrent()
      if (line[i + 1] === '|') {
        tokens.push('||')
        i++
      } else {
        tokens.push('|')
      }
      continue
    }
    if (ch === '>' || ch === '<') {
      let operator = ch
      if (ch === '>' && line[i + 1] === '>') {
        operator = '>>'
        i++
      }
      if (cur === '2' && ch === '>') {
        cur = ''
        operator = `2${operator}`
      } else {
        pushCurrent()
      }
      tokens.push(operator)
      continue
    }
    cur += ch
  }
  if (escape) cur += '\\'
  if (inQuote) throw new Error(`unexpected EOF while looking for matching ${inQuote}`)
  pushCurrent()

  const cmds: string[][] = [[]]
  let idx = 0
  while (idx < tokens.length) {
    const t = tokens[idx]
    if (t === '|') {
      if (cmds[cmds.length - 1].length === 0) throw new Error("syntax error near unexpected token '|'")
      cmds.push([])
    }
    else { cmds[cmds.length - 1].push(t) }
    idx++
  }
  if (cmds[cmds.length - 1].length === 0 && cmds.length > 1) {
    throw new Error('syntax error near unexpected end of command')
  }
  return cmds
}

function validateBalancedShellStructures(line: string): string | null {
  const closers: string[] = []
  let quote: '"' | "'" | null = null
  let escaped = false
  let backtickOpen = false

  for (let index = 0; index < line.length; index++) {
    const character = line[index]
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
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '`') {
      backtickOpen = !backtickOpen
      continue
    }
    if (backtickOpen) continue

    const pair = line.slice(index, index + 2)
    if (pair === '$(' || pair === '<(' || pair === '>(') {
      closers.push(')')
      index++
      continue
    }
    if (pair === '${') {
      closers.push('}')
      index++
      continue
    }
    if (character === '(') closers.push(')')
    else if (character === '{') closers.push('}')
    else if (character === ')' || character === '}') {
      if (closers.pop() !== character) return `unexpected token '${character}'`
    }
  }

  if (escaped) return 'trailing escape character'
  if (quote) return `unexpected EOF while looking for matching ${quote}`
  if (backtickOpen) return 'unexpected EOF while looking for matching `'
  if (closers.length > 0) return `unexpected EOF while looking for matching ${closers.at(-1)}`
  return null
}

function isValidBoundedCompoundStatement(line: string): boolean | null {
  if (/^[A-Za-z_]\w*=\(/.test(line)) return /^[A-Za-z_]\w*=\([^()]*\)$/.test(line)
  if (/^(?:function\s+)?[A-Za-z_]\w*\s*(?:\(\s*\))?\s*\{/.test(line)) {
    return /^(?:function\s+)?[A-Za-z_]\w*\s*(?:\(\s*\))?\s*\{\s*[^{}]+?\s*;\s*\}\s*(?:;\s*.+)?$/.test(line)
  }
  if (/^if\b/.test(line)) {
    const match = line.match(/^if\s+(.+?)\s*;\s*then\s+(.+?)(?:\s*;\s*else\s+(.+?))?\s*;\s*fi$/)
    if (!match) return false
    return !match.slice(2).some(branch => branch && /(?:^|;)\s*(?:then|else|fi)\b/.test(branch))
  }
  if (/^for\b/.test(line)) return /^for\s+[A-Za-z_]\w*\s+in\s+.+?\s*;\s*do\s+.+?\s*;\s*done$/.test(line)
  if (/^while\b/.test(line)) {
    return /^while\s+read(?:\s+-r)?\s+[A-Za-z_]\w*\s*;\s*do\s+.+?\s*;\s*done\s*<\s*\S+$/.test(line)
      || /^while\s+(?:false|test\s+.+?)\s*;\s*do\s+.+?\s*;\s*done$/.test(line)
  }
  return null
}

function tokenizeWithRedirects(args: string[]): { args: string[]; redirects: { type: string; target: string }[]; error?: string } {
  const outArgs: string[] = []
  const redirects: { type: string; target: string }[] = []
  for (let i = 0; i < args.length; i++) {
    if (['>', '>>', '2>', '2>>', '<'].includes(args[i])) {
      if (i + 1 >= args.length || ['>', '>>', '2>', '2>>', '<', '|'].includes(args[i + 1])) {
        return { args: outArgs, redirects, error: `syntax error near unexpected token '${args[i]}'` }
      }
      redirects.push({ type: args[i], target: stripOuterQuotes(args[++i]) })
    } else { outArgs.push(args[i]) }
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

function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0
}

function rotateRight(value: number, shift: number): number {
  return ((value >>> shift) | (value << (32 - shift))) >>> 0
}

function md5Hex(content: string): string {
  const bytes = Array.from(new TextEncoder().encode(content))
  const bitLength = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  for (let i = 0; i < 8; i++) bytes.push(Math.floor(bitLength / 2 ** (8 * i)) & 0xff)

  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ]
  const constants = Array.from({ length: 64 }, (_, index) =>
    Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32) >>> 0)
  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = Array.from({ length: 16 }, (_, index) => {
      const base = offset + index * 4
      return (bytes[base] | bytes[base + 1] << 8 | bytes[base + 2] << 16 | bytes[base + 3] << 24) >>> 0
    })
    let a = a0
    let b = b0
    let c = c0
    let d = d0
    for (let i = 0; i < 64; i++) {
      let f: number
      let wordIndex: number
      if (i < 16) { f = (b & c) | (~b & d); wordIndex = i }
      else if (i < 32) { f = (d & b) | (~d & c); wordIndex = (5 * i + 1) % 16 }
      else if (i < 48) { f = b ^ c ^ d; wordIndex = (3 * i + 5) % 16 }
      else { f = c ^ (b | ~d); wordIndex = (7 * i) % 16 }
      const next = (b + rotateLeft((a + f + constants[i] + words[wordIndex]) >>> 0, shifts[i])) >>> 0
      a = d
      d = c
      c = b
      b = next
    }
    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }

  return [a0, b0, c0, d0].map(word =>
    [0, 8, 16, 24].map(shift => ((word >>> shift) & 0xff).toString(16).padStart(2, '0')).join('')).join('')
}

function sha256Hex(content: string): string {
  const bytes = Array.from(new TextEncoder().encode(content))
  const bitLength = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  for (let i = 7; i >= 0; i--) bytes.push(Math.floor(bitLength / 2 ** (8 * i)) & 0xff)

  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]
  const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Array<number>(64).fill(0)
    for (let i = 0; i < 16; i++) {
      const base = offset + i * 4
      words[i] = (bytes[base] << 24 | bytes[base + 1] << 16 | bytes[base + 2] << 8 | bytes[base + 3]) >>> 0
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotateRight(words[i - 15], 7) ^ rotateRight(words[i - 15], 18) ^ (words[i - 15] >>> 3)
      const s1 = rotateRight(words[i - 2], 17) ^ rotateRight(words[i - 2], 19) ^ (words[i - 2] >>> 10)
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = hash
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temp1 = (h + sigma1 + choice + constants[i] + words[i]) >>> 0
      const sigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (sigma0 + majority) >>> 0
      h = g; g = f; f = e; e = (d + temp1) >>> 0
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0
    }
    hash[0] = (hash[0] + a) >>> 0
    hash[1] = (hash[1] + b) >>> 0
    hash[2] = (hash[2] + c) >>> 0
    hash[3] = (hash[3] + d) >>> 0
    hash[4] = (hash[4] + e) >>> 0
    hash[5] = (hash[5] + f) >>> 0
    hash[6] = (hash[6] + g) >>> 0
    hash[7] = (hash[7] + h) >>> 0
  }
  return hash.map(word => word.toString(16).padStart(8, '0')).join('')
}

function permissionMode(permissions: string): number {
  const bit = (index: number, char: string) => permissions[index] === char ? 1 : 0
  let mode = bit(0, 'r') * 0o400 + bit(1, 'w') * 0o200
  mode += ['x', 's'].includes(permissions[2]) ? 0o100 : 0
  mode += bit(3, 'r') * 0o040 + bit(4, 'w') * 0o020
  mode += ['x', 's'].includes(permissions[5]) ? 0o010 : 0
  mode += bit(6, 'r') * 0o004 + bit(7, 'w') * 0o002
  mode += ['x', 't'].includes(permissions[8]) ? 0o001 : 0
  if (['s', 'S'].includes(permissions[2])) mode += 0o4000
  if (['s', 'S'].includes(permissions[5])) mode += 0o2000
  if (['t', 'T'].includes(permissions[8])) mode += 0o1000
  return mode
}

export function isRedCommand(cmd: string): boolean {
  const redCommands = new Set(['rm', 'dd', 'mkfs', 'fdisk', 'shutdown', 'reboot', 'kill', 'pkill', 'chmod', 'chown',
    'docker', 'kubectl', 'systemctl', 'shred', 'apt', 'yum', 'dnf', 'pacman'])
  const base = cmd.split('/').pop() || cmd
  return redCommands.has(base)
}


export class ShellEngine {
  state: ShellState
  vfs: VFS
  services: SimulatedServices
  gitState: GitState
  private onRedCommand?: (cmd: string) => void
  private makeDepth = 0
  private shellFunctions = new Map<string, string>()
  private shellTraps = new Map<string, string>()
  private shellArrays = new Map<string, string[]>()
  private shellCallDepth = 0

  constructor(
    vfs: VFS,
    state?: ShellState,
    onRedCommand?: (cmd: string) => void,
    gitState?: GitState,
  ) {
    this.vfs = vfs
    this.state = state ?? createShellState()
    this.services = createSimulatedServices()
    this.gitState = gitState ?? createGitState()
    this.onRedCommand = onRedCommand
  }

  private ensureDirectory(path: string, cwd: string[] = this.state.cwd): { error?: string } {
    const parts = this.vfs.resolvePath(path, cwd)
    for (let length = 1; length <= parts.length; length++) {
      const absolutePath = `/${parts.slice(0, length).join('/')}`
      const existing = this.vfs.stat(absolutePath, [])
      if (existing.node) {
        if (existing.node.type !== 'directory') return { error: `${absolutePath}: Not a directory` }
        continue
      }
      const created = this.vfs.createDirectory(absolutePath, [])
      if (created.error) return created
    }
    return {}
  }

  private writeExecutableAtomically(path: string, content: string): { error?: string } {
    const existing = this.vfs.stat(path, this.state.cwd).node
    const previous = existing?.type === 'file'
      ? {
          content: this.vfs.readFile(path, this.state.cwd).content,
          permissions: existing.permissions,
          mtime: new Date(existing.mtime),
        }
      : undefined
    if (
      existing
      && (
        existing.type !== 'file'
        || !this.vfs.hasPermission(path, this.state.cwd, 'write')
        || !this.vfs.hasPermission(path, this.state.cwd, 'read')
        || (this.vfs.getCurrentUser() !== 'root' && existing.owner !== this.vfs.getCurrentUser())
      )
    ) {
      return { error: `${path}: cannot replace executable safely: Permission denied` }
    }
    const written = this.vfs.writeFile(path, this.state.cwd, content)
    if (written.error) return written
    const executable = this.vfs.chmod(path, this.state.cwd, '755')
    if (!executable.error) return {}
    if (previous) {
      const restored = this.vfs.writeFile(path, this.state.cwd, previous.content)
      const restoredNode = this.vfs.stat(path, this.state.cwd).node
      if (!restored.error && restoredNode) {
        restoredNode.permissions = previous.permissions
        restoredNode.mtime = previous.mtime
      }
    } else {
      this.vfs.deleteFile(path, this.state.cwd)
    }
    return executable
  }

  private cmdTest(args: string[]): ShellResult {
    if (args[0] === '!') {
      const nested = this.cmdTest(args.slice(1))
      return { stdout: '', stderr: nested.stderr, exitCode: nested.exitCode === 0 ? 1 : 0 }
    }
    let matched = false
    if (args.length === 1) {
      matched = args[0].length > 0
    } else if (args.length === 2 && ['-e', '-f', '-d', '-r', '-w', '-x', '-n', '-z'].includes(args[0])) {
      const [operator, value] = args
      const stat = this.vfs.stat(value, this.state.cwd).node
      if (operator === '-e') matched = Boolean(stat)
      else if (operator === '-f') matched = stat?.type === 'file'
      else if (operator === '-d') matched = stat?.type === 'directory'
      else if (operator === '-r') matched = Boolean(stat && this.vfs.hasPermission(value, this.state.cwd, 'read'))
      else if (operator === '-w') matched = Boolean(stat && this.vfs.hasPermission(value, this.state.cwd, 'write'))
      else if (operator === '-x') matched = Boolean(stat && this.vfs.hasPermission(value, this.state.cwd, 'execute'))
      else if (operator === '-n') matched = value.length > 0
      else matched = value.length === 0
    } else if (args.length === 3) {
      const [left, operator, right] = args
      if (operator === '=' || operator === '==') matched = left === right
      else if (operator === '!=') matched = left !== right
      else if (['-eq', '-ne', '-lt', '-le', '-gt', '-ge'].includes(operator)) {
        const leftNumber = Number(left)
        const rightNumber = Number(right)
        if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
          return { stdout: '', stderr: 'test: integer expression expected', exitCode: 2 }
        }
        matched = operator === '-eq' ? leftNumber === rightNumber
          : operator === '-ne' ? leftNumber !== rightNumber
            : operator === '-lt' ? leftNumber < rightNumber
              : operator === '-le' ? leftNumber <= rightNumber
                : operator === '-gt' ? leftNumber > rightNumber
                  : leftNumber >= rightNumber
      } else {
        return { stdout: '', stderr: `test: unsupported operator '${operator}'`, exitCode: 2 }
      }
    } else if (args.length > 0) {
      return { stdout: '', stderr: 'test: unsupported expression', exitCode: 2 }
    }
    return { stdout: '', stderr: '', exitCode: matched ? 0 : 1 }
  }

  private cmdRead(args: string[], stdin: string): ShellResult {
    let raw = false
    const operands: string[] = []
    for (const arg of args) {
      if (arg === '-r') raw = true
      else if (arg.startsWith('-')) return { stdout: '', stderr: `read: unsupported option '${arg}'`, exitCode: 2 }
      else operands.push(arg)
    }
    if (operands.length !== 1 || !/^[A-Za-z_]\w*$/.test(operands[0])) {
      return { stdout: '', stderr: 'read: exactly one variable name is required', exitCode: 2 }
    }
    if (!stdin) return { stdout: '', stderr: 'read: interactive input is unavailable; redirect or pipe input', exitCode: 1 }
    const value = stdin.split(/\r?\n/, 1)[0]
    this.state.env[operands[0]] = raw ? value : value.replace(/\\(.)/g, '$1')
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdTrap(args: string[]): ShellResult {
    if (args.length === 1 && args[0] === '-l') {
      return { stdout: 'HUP INT KILL TERM EXIT\n', stderr: '', exitCode: 0, progressEligible: false }
    }
    if (args.length === 0 || (args.length === 1 && args[0] === '-p')) {
      const stdout = [...this.shellTraps.entries()]
        .map(([signal, action]) => `trap -- '${action}' ${signal}`)
        .join('\n')
      return { stdout: stdout ? `${stdout}\n` : '', stderr: '', exitCode: 0, progressEligible: false }
    }
    const [action, ...signals] = args
    if (signals.length === 0) return { stdout: '', stderr: 'trap: signal specification required', exitCode: 2 }
    for (const signal of signals) {
      const normalized = signal.toUpperCase().replace(/^SIG/, '')
      if (!['EXIT', 'HUP', 'INT', 'TERM'].includes(normalized)) {
        return { stdout: '', stderr: `trap: ${signal}: invalid signal specification`, exitCode: 2 }
      }
    }
    for (const signal of signals) {
      const normalized = signal.toUpperCase().replace(/^SIG/, '')
      if (action === '-' || action === '') this.shellTraps.delete(normalized)
      else this.shellTraps.set(normalized, action)
    }
    return { stdout: '', stderr: '', exitCode: 0, successfulCommands: ['trap'] }
  }

  private cmdGetopts(args: string[]): ShellResult {
    const [specification, variable, optionToken, optionValue] = args
    if (!specification || !variable || !/^[A-Za-z_]\w*$/.test(variable)) {
      return { stdout: '', stderr: 'getopts: usage: getopts optstring name -x [value]', exitCode: 2 }
    }
    const optionMatch = optionToken?.match(/^-([A-Za-z])$/)
    if (!optionMatch) return { stdout: '', stderr: 'getopts: a bounded option token such as -a is required', exitCode: 1 }
    const option = optionMatch[1]
    const optionIndex = specification.replace(/^:/, '').indexOf(option)
    if (optionIndex < 0) return { stdout: '', stderr: `getopts: illegal option -- ${option}`, exitCode: 1 }
    const requiresValue = specification.replace(/^:/, '')[optionIndex + 1] === ':'
    if (requiresValue && !optionValue) return { stdout: '', stderr: `getopts: option requires an argument -- ${option}`, exitCode: 1 }
    this.state.env[variable] = option
    if (requiresValue) this.state.env.OPTARG = optionValue
    else delete this.state.env.OPTARG
    this.state.env.OPTIND = '2'
    return { stdout: '', stderr: '', exitCode: 0, successfulCommands: ['getopts'] }
  }

  private executeBoundedCompoundSyntax(line: string, depth: number): ShellResult | null {
    const processSubstitution = line.match(/^diff\s+<\(sort\s+(\S+)\)\s+<\(sort\s+(\S+)\)$/)
    if (processSubstitution) {
      const left = this.cmdSort([stripOuterQuotes(processSubstitution[1])], '')
      if (left.exitCode !== 0) return left
      const right = this.cmdSort([stripOuterQuotes(processSubstitution[2])], '')
      if (right.exitCode !== 0) return right
      const same = left.stdout === right.stdout
      return {
        stdout: same ? '' : `< ${left.stdout}> ${right.stdout}`,
        stderr: '',
        exitCode: same ? 0 : 1,
        successfulCommands: same ? ['<()', 'diff', 'sort'] : [],
      }
    }

    const arrayMatch = line.match(/^([A-Za-z_]\w*)=\(([^()]*)\)$/)
    if (arrayMatch) {
      let values: string[]
      try {
        values = parseLine(arrayMatch[2])[0]?.map(stripOuterQuotes) ?? []
      } catch (error) {
        return { stdout: '', stderr: `bash: ${error instanceof Error ? error.message : String(error)}`, exitCode: 2 }
      }
      if (values.length > 100) return { stdout: '', stderr: 'bash: array exceeds the 100-item simulator limit', exitCode: 2 }
      this.shellArrays.set(arrayMatch[1], values)
      this.state.env[arrayMatch[1]] = values.join(' ')
      return { stdout: '', stderr: '', exitCode: 0, successfulCommands: ['array'] }
    }

    const functionMatch = line.match(/^(?:function\s+)?([A-Za-z_]\w*)\s*(?:\(\s*\))?\s*\{\s*([^{}]*?)\s*;\s*\}\s*(?:;\s*(.*))?$/)
    if (functionMatch && (line.startsWith('function ') || line.includes('()'))) {
      const [, name, body, invocation] = functionMatch
      if (!body.trim()) return { stdout: '', stderr: 'bash: empty bounded function body', exitCode: 2 }
      this.shellFunctions.set(name, body.trim())
      if (!invocation) return { stdout: '', stderr: '', exitCode: 0, successfulCommands: ['function'] }
      const invoked = this.execute(invocation, depth + 1, false)
      return invoked.exitCode === 0
        ? { ...invoked, successfulCommands: ['function', ...(invoked.successfulCommands ?? [])] }
        : invoked
    }

    const ifMatch = line.match(/^if\s+(.+?)\s*;\s*then\s+(.+?)(?:\s*;\s*else\s+(.+?))?\s*;\s*fi$/)
    if (ifMatch) {
      const conditionText = ifMatch[1].trim()
      const conditionArgs = conditionText.startsWith('test ')
        ? parseLine(conditionText)[0].slice(1).map(stripOuterQuotes)
        : conditionText.match(/^\[\s+(.+?)\s+\]$/)?.[1]
          ? parseLine(conditionText.slice(1, -1).trim())[0].map(stripOuterQuotes)
          : null
      if (!conditionArgs) return { stdout: '', stderr: 'bash: bounded if conditions must use test or [ ... ]', exitCode: 2 }
      const condition = this.cmdTest(conditionArgs)
      if (condition.exitCode === 2) return condition
      const branch = condition.exitCode === 0 ? ifMatch[2] : ifMatch[3]
      if (!branch) return { stdout: '', stderr: '', exitCode: 0, successfulCommands: ['if', 'test'] }
      const result = this.execute(branch, depth + 1, false)
      return result.exitCode === 0
        ? { ...result, successfulCommands: ['if', 'test', ...(result.successfulCommands ?? [])] }
        : result
    }

    const forMatch = line.match(/^for\s+([A-Za-z_]\w*)\s+in\s+(.+?)\s*;\s*do\s+(.+?)\s*;\s*done$/)
    if (forMatch) {
      const [, variable, rawValues, body] = forMatch
      let values: string[]
      try {
        values = parseLine(rawValues)[0].map(stripOuterQuotes)
      } catch {
        return { stdout: '', stderr: 'bash: invalid for value list', exitCode: 2 }
      }
      if (values.length === 0 || values.length > 100) return { stdout: '', stderr: 'bash: for requires 1 to 100 values', exitCode: 2 }
      const previous = this.state.env[variable]
      let stdout = ''
      const events = new Set<string>(['for'])
      for (const value of values) {
        this.state.env[variable] = value
        const result = this.execute(body, depth + 1, false)
        stdout += result.stdout
        if (result.exitCode !== 0) {
          if (previous === undefined) delete this.state.env[variable]
          else this.state.env[variable] = previous
          return { stdout, stderr: result.stderr, exitCode: result.exitCode, successfulCommands: [] }
        }
        for (const event of result.successfulCommands ?? []) events.add(event)
      }
      if (previous === undefined) delete this.state.env[variable]
      else this.state.env[variable] = previous
      return { stdout, stderr: '', exitCode: 0, successfulCommands: [...events] }
    }

    const whileReadMatch = line.match(/^while\s+read(?:\s+-r)?\s+([A-Za-z_]\w*)\s*;\s*do\s+(.+?)\s*;\s*done\s*<\s*(\S+)$/)
    if (whileReadMatch) {
      const [, variable, body, file] = whileReadMatch
      const read = this.vfs.readFile(stripOuterQuotes(file), this.state.cwd)
      if (read.error) return { stdout: '', stderr: read.error, exitCode: 1 }
      const lines = read.content.split(/\r?\n/).filter((_, index, all) => index < all.length - 1 || all[index] !== '')
      if (lines.length > 1000) return { stdout: '', stderr: 'bash: while read input exceeds 1000 lines', exitCode: 2 }
      let stdout = ''
      const events = new Set<string>(['while', 'read', 'while read'])
      for (const value of lines) {
        this.state.env[variable] = value
        const result = this.execute(body, depth + 1, false)
        stdout += result.stdout
        if (result.exitCode !== 0) return { stdout, stderr: result.stderr, exitCode: result.exitCode, successfulCommands: [] }
        for (const event of result.successfulCommands ?? []) events.add(event)
      }
      return { stdout, stderr: '', exitCode: 0, successfulCommands: [...events] }
    }

    const whileMatch = line.match(/^while\s+(false|test\s+.+?)\s*;\s*do\s+(.+?)\s*;\s*done$/)
    if (whileMatch) {
      const condition = whileMatch[1] === 'false'
        ? { exitCode: 1 }
        : this.cmdTest(parseLine(whileMatch[1])[0].slice(1).map(stripOuterQuotes))
      if (condition.exitCode === 2) return { stdout: '', stderr: 'bash: invalid bounded while condition', exitCode: 2 }
      if (condition.exitCode === 0) {
        return { stdout: '', stderr: 'bash: refusing a potentially unbounded while loop; use a false condition or while read', exitCode: 2 }
      }
      return { stdout: '', stderr: '', exitCode: 0, successfulCommands: ['while'] }
    }
    return null
  }

  private cmdBash(args: string[]): ShellResult {
    if (this.shellCallDepth >= 10) {
      return { stdout: '', stderr: 'bash: maximum bounded call depth exceeded', exitCode: 2 }
    }
    this.shellCallDepth++
    try {
      return this.executeBashScript(args)
    } finally {
      this.shellCallDepth--
    }
  }

  private executeBashScript(args: string[]): ShellResult {
    let syntaxOnly = false
    let file = ''
    for (const arg of args) {
      if (arg === '-n') syntaxOnly = true
      else if (arg.startsWith('-')) return { stdout: '', stderr: `bash: unsupported option '${arg}'`, exitCode: 2 }
      else if (!file) file = arg
      else return { stdout: '', stderr: `bash: unexpected argument '${arg}'`, exitCode: 2 }
    }
    if (!file) return { stdout: '', stderr: 'bash: a script path is required in this bounded terminal', exitCode: 2 }
    const read = this.vfs.readFile(file, this.state.cwd)
    if (read.error) return { stdout: '', stderr: `bash: ${file}: No such readable file`, exitCode: 1 }
    const lines = read.content.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'))
    if (lines.length === 0 || lines.length > 100) return { stdout: '', stderr: 'bash: script must contain 1 to 100 bounded statements', exitCode: 2 }
    const events = new Set<string>(['bash'])
    let stdout = ''
    for (const line of lines) {
      if (syntaxOnly) {
        try {
          parseLine(line)
        } catch (error) {
          return {
            stdout: '',
            stderr: `bash: ${file}: ${error instanceof Error ? error.message : String(error)}`,
            exitCode: 2,
          }
        }
        const structureError = validateBalancedShellStructures(line)
        if (structureError) {
          return { stdout: '', stderr: `bash: ${file}: ${structureError}`, exitCode: 2 }
        }
        const compoundValidity = isValidBoundedCompoundStatement(line)
        if (compoundValidity === false) {
          return { stdout: '', stderr: `bash: ${file}: invalid bounded compound statement '${line}'`, exitCode: 2 }
        }
        if (compoundValidity === null && !isSupportedShellCommand(line.split(/\s+/, 1)[0])) {
          return { stdout: '', stderr: `bash: ${file}: unsupported statement '${line}'`, exitCode: 2 }
        }
        continue
      }
      const compound = this.executeBoundedCompoundSyntax(line, 0)
      const result = compound ?? this.execute(line, 1, false)
      stdout += result.stdout
      if (result.exitCode !== 0) return { stdout, stderr: result.stderr, exitCode: result.exitCode, successfulCommands: [] }
      for (const event of result.successfulCommands ?? []) events.add(event)
    }
    return { stdout, stderr: '', exitCode: 0, successfulCommands: [...events] }
  }

  private expandGlobToken(token: string): string[] {
    if (!token.includes('*') && !token.includes('?')) return []
    const slashIndex = token.lastIndexOf('/')
    const directory = slashIndex >= 0 ? (token.slice(0, slashIndex) || '/') : '.'
    const pattern = token.slice(slashIndex + 1)
    if (!pattern || pattern.includes('**')) return []
    const listed = this.vfs.listDirectory(directory, this.state.cwd)
    if (listed.error) return []
    const expression = new RegExp(
      `^${pattern.split('').map(character =>
        character === '*' ? '[^/]*' : character === '?' ? '[^/]' : escapeRegex(character),
      ).join('')}$`,
    )
    const prefix = slashIndex >= 0 ? token.slice(0, slashIndex + 1) : ''
    return listed.entries
      .map(entry => entry.name)
      .filter(name => (pattern.startsWith('.') || !name.startsWith('.')) && expression.test(name))
      .sort((left, right) => left.localeCompare(right))
      .map(name => `${prefix}${name}`)
  }

  execute(line: string, depth: number = 0, recordHistory = true): ShellResult {
    try {
      if (depth > 10) {
        return { stdout: '', stderr: 'alias: too many levels of recursion', exitCode: 1 }
      }
      if (line.trim() === '') return { stdout: '', stderr: '', exitCode: 0 }

      const trimmed = line.trim()
      if (hasUnsupportedBackgroundOperator(trimmed)) {
        if (recordHistory) this.state.history.push(line)
        const result = {
          stdout: '',
          stderr: "bash: only one trailing unquoted '&' is supported for background execution",
          exitCode: 2,
          successfulCommands: [],
        }
        this.state.lastExitCode = result.exitCode
        return result
      }
      const backgroundCommand = stripTrailingBackgroundOperator(trimmed)
      if (backgroundCommand !== null) {
        if (!backgroundCommand) {
          return { stdout: '', stderr: "bash: syntax error near unexpected token '&'", exitCode: 2, successfulCommands: [] }
        }
        if (recordHistory) this.state.history.push(line)
        const result = this.execute(backgroundCommand, depth, false)
        if (result.exitCode !== 0) return result
        return {
          ...result,
          mode: undefined,
          successfulCommands: [
            ...new Set([...(result.successfulCommands ?? []), '&', `${backgroundCommand} &`]),
          ],
        }
      }
      const compoundResult = this.executeBoundedCompoundSyntax(trimmed, depth)
      if (compoundResult) {
        if (recordHistory) this.state.history.push(line)
        this.state.lastExitCode = compoundResult.exitCode
        return compoundResult
      }
      const controlCommands = splitControlCommands(trimmed)
      if (controlCommands.length > 1) {
        if (recordHistory) this.state.history.push(line)
        let stdout = ''
        let stderr = ''
        let lastResult: ShellResult = { stdout: '', stderr: '', exitCode: 0 }
        const successfulCommands: string[] = []
        for (const controlCommand of controlCommands) {
          const shouldRun = controlCommand.operator === 'always' ||
            (controlCommand.operator === '&&' && lastResult.exitCode === 0) ||
            (controlCommand.operator === '||' && lastResult.exitCode !== 0)
          if (!shouldRun) continue
          lastResult = this.execute(controlCommand.command, depth, false)
          stdout += lastResult.stdout
          stderr += lastResult.stderr
          successfulCommands.push(...(lastResult.successfulCommands ?? []))
        }
        if (successfulCommands.length > 0) successfulCommands.push(...getShellSyntaxEvents(trimmed))
        return {
          stdout,
          stderr,
          exitCode: lastResult.exitCode,
          mode: lastResult.mode,
          successfulCommands: [...new Set(successfulCommands)],
        }
      }
      if (recordHistory) this.state.history.push(line)
      const aliasCmd = trimmed.split(' ')[0]
      if (this.state.aliases[aliasCmd]) {
        const expansion = this.state.aliases[aliasCmd] + trimmed.slice(aliasCmd.length)
        return this.execute(expansion, depth + 1, false)
      }

      const cmds = parseLine(trimmed)
      let prevStdout = ''
      let pipelineStderr = ''
      let pipelineFailure = 0
      let finalMode: string | undefined
      const successfulCommands: string[] = []

      for (let ci = 0; ci < cmds.length; ci++) {
        const globEvents = new Set<string>()
        const rawTokens = cmds[ci].flatMap(token => {
          if (token.startsWith("'") && token.endsWith("'")) return token
          const expanded = expandVars(token, this.state.env, this.state.lastExitCode)
          const quoted = (
            (expanded.startsWith('"') && expanded.endsWith('"'))
            || (expanded.startsWith("'") && expanded.endsWith("'"))
          )
          if (quoted) return expanded
          const matches = this.expandGlobToken(expanded)
          if (matches.length === 0) return expanded
          if (expanded.includes('*')) globEvents.add('*')
          if (expanded.includes('?')) globEvents.add('?')
          return matches
        })
        const { args, redirects, error: redirectSyntaxError } = tokenizeWithRedirects(rawTokens)
        if (redirectSyntaxError) {
          const result = { stdout: '', stderr: `bash: ${redirectSyntaxError}`, exitCode: 2 }
          this.state.lastExitCode = result.exitCode
          return result
        }
        let stdin = ci === 0 ? '' : prevStdout

        let redirectSetupError = ''
        for (const redirect of redirects) {
          if (redirect.type === '<') {
            const input = this.vfs.readFile(redirect.target, this.state.cwd)
            if (input.error) {
              redirectSetupError = input.error
              break
            }
            stdin = input.content
            continue
          }
          const append = redirect.type === '>>' || redirect.type === '2>>'
          const opened = this.vfs.writeFile(redirect.target, this.state.cwd, '', append)
          if (opened.error) {
            redirectSetupError = opened.error
            break
          }
        }

        let result: ShellResult
        if (redirectSetupError) {
          result = { stdout: '', stderr: redirectSetupError, exitCode: 1 }
        } else try {
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

        if (!redirectSetupError) {
          let stdoutRedirect: (typeof redirects)[number] | undefined
          let stderrRedirect: (typeof redirects)[number] | undefined
          for (const redirect of redirects) {
            if (redirect.type === '<') continue
            if (redirect.type === '2>' || redirect.type === '2>>') stderrRedirect = redirect
            else stdoutRedirect = redirect
          }
          for (const [redirect, content] of [
            [stdoutRedirect, result.stdout],
            [stderrRedirect, result.stderr],
          ] as const) {
            if (!redirect) continue
            const append = redirect.type === '>>' || redirect.type === '2>>'
            const written = this.vfs.writeFile(redirect.target, this.state.cwd, content, append)
            if (written.error) {
              result = { stdout: '', stderr: written.error, exitCode: 1 }
              break
            }
            if (redirect === stderrRedirect) result.stderr = ''
            else result.stdout = ''
          }
        }

        this.state.lastExitCode = result.exitCode
        if (result.exitCode === 0 && args.length > 0) {
          if (result.successfulCommands !== undefined) {
            successfulCommands.push(...result.successfulCommands)
          } else if (result.progressEligible !== false) {
            successfulCommands.push(args.map(stripOuterQuotes).join(' '))
          }
          if (result.progressEligible !== false) successfulCommands.push(...globEvents)
        }
        if (result.exitCode !== 0) pipelineFailure = result.exitCode
        prevStdout = result.stdout
        if (result.stderr) pipelineStderr += result.stderr
        finalMode = result.mode
      }

      // Truncate final output if too long
      if (prevStdout.length > MAX_OUTPUT_LENGTH) {
        prevStdout = prevStdout.slice(0, MAX_OUTPUT_LENGTH) + TRUNCATION_MSG
      }

      const exitCode = this.state.pipefail && pipelineFailure !== 0
        ? pipelineFailure
        : this.state.lastExitCode
      this.state.lastExitCode = exitCode
      if (successfulCommands.length > 0) successfulCommands.push(...getShellSyntaxEvents(trimmed))
      return {
        stdout: prevStdout,
        stderr: pipelineStderr,
        exitCode,
        mode: finalMode,
        successfulCommands: [...new Set(successfulCommands)],
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.state.lastExitCode = 1
      return { stdout: '', stderr: `shell error: ${msg}`, exitCode: 1, successfulCommands: [] }
    }
  }

  private runCommand(args: string[], stdin: string): ShellResult {
    try {
      if (args.length === 0) return { stdout: '', stderr: '', exitCode: 0 }

      const expanded = args.map(a => {
        return stripOuterQuotes(a)
      })
      const cmd = expanded[0]
      const cargs = expanded.slice(1)

      if (cmd !== 'sudo' && cargs.includes('--help') && isSupportedShellCommand(cmd)) {
        return { ...this.cmdHelp(cmd), successfulCommands: ['--help'] }
      }

      if (isRedCommand(cmd) && this.onRedCommand) {
        this.onRedCommand(expanded.join(' '))
      }

      switch (cmd) {
      // === NAVIGATION & FILESYSTEM ===
      case 'cd': return this.cmdCd(cargs)
      case 'pwd': return this.cmdPwd(cargs)
      case 'ls': return this.cmdLs(cargs)
      case 'cat': return this.cmdCat(cargs, stdin)
      case 'head': return this.cmdHead(cargs, stdin)
      case 'tail': return this.cmdTail(cargs, stdin)
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
      case 'split': return this.cmdSplit(cargs)
      case 'csplit': return this.cmdCsplit(cargs)
      case 'truncate': return this.cmdTruncate(cargs)
      case 'md5sum': return this.cmdChecksum(cargs, 'md5')
      case 'sha256sum': return this.cmdChecksum(cargs, 'sha256')
      case 'patch': return this.cmdPatch(cargs, stdin)
      case 'dd': return this.cmdDd(cargs, stdin)
      case 'chmod': return this.cmdChmod(cargs)
      case 'chown': return this.cmdChown(cargs)
      case 'chgrp': return this.cmdChgrp(cargs)
      case 'getfacl': return this.cmdGetfacl(cargs)
      case 'setfacl': return this.cmdSetfacl(cargs)
      case 'id': return this.cmdId(cargs)
      case 'whoami': return this.cmdWhoami(cargs)
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
      case 'nice': return this.cmdNice(cargs, stdin)
      case 'renice': return this.cmdRenice(cargs)
      case 'nohup': return this.cmdNohup(cargs, stdin)
      case 'strace': return this.cmdStrace(cargs, stdin)
      // === NETWORK TOOLS ===
      case 'ss': return this.cmdSs(cargs)
      case 'dig': return this.cmdDig(cargs)
      case 'ip': return this.cmdIp(cargs)
      case 'ssh': return this.cmdSsh(cargs)
      case 'ssh-keygen': return this.cmdSshKeygen(cargs)
      case 'scp': return this.cmdScp(cargs)
      case 'tcpdump': return this.cmdTcpdump(cargs)
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
      case 'file': return this.cmdFile(cargs)
      case 'readlink': return this.cmdReadlink(cargs)
      case 'realpath': return this.cmdRealpath(cargs)
      case 'shred': return this.cmdShred(cargs)
      case 'install': return this.cmdInstall(cargs)
      case 'rsync': return this.cmdRsync(cargs)
      case 'ldd': return this.cmdLdd(cargs)
      // === PACKAGE MANAGEMENT ===
      case 'apt': return this.cmdApt(cargs)
      case 'dpkg': return this.cmdDpkg(cargs)
      case 'pip': return this.cmdPip(cargs)
      case 'npm': return this.cmdNpm(cargs)
      case 'npx': return this.cmdNpx(cargs)
      case 'yarn': return this.cmdYarn(cargs)
      case 'pnpm': return this.cmdPnpm(cargs)
      // === SYSTEM SERVICES ===
      case 'systemctl': return this.cmdSystemctl(cargs)
      case 'journalctl': return this.cmdJournalctl(cargs)
      case 'dmesg': return this.cmdDmesg(cargs)
      case 'findmnt': return this.cmdFindmnt(cargs)
      case 'lsblk': return this.cmdLsblk(cargs)
      case 'lsof': return this.cmdLsof(cargs)
      case 'mount': return this.cmdMount(cargs)
      case 'fsck': return this.cmdFsck(cargs)
      case 'losetup': return this.cmdLosetup(cargs)
      case 'logrotate': return this.cmdLogrotate(cargs)
      case 'logger': return this.cmdLogger(cargs)
      case 'service': return this.cmdService(cargs)
      case 'crontab': return this.cmdCrontab(cargs)
      // === DOCKER ===
      case 'docker': return this.cmdDocker(cargs)
      // === KUBERNETES ===
      case 'kubectl': return this.cmdKubectl(cargs)
      // === DEVELOPMENT TOOLS ===
      case 'make': return this.cmdMake(cargs)
      case 'bash': return this.cmdBash(cargs)
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
      case 'set': return this.cmdSet(cargs)
      case 'test': return this.cmdTest(cargs)
      case 'read': return this.cmdRead(cargs, stdin)
      case 'trap': return this.cmdTrap(cargs)
      case 'getopts': return this.cmdGetopts(cargs)
      case 'umask': return this.cmdUmask(cargs)
      case 'command': return this.cmdCommand(cargs, stdin)
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
      case 'basename': return this.cmdBasename(cargs)
      case 'dirname': return this.cmdDirname(cargs)
      case 'hostname': return { stdout: 'neonmall-server', stderr: '', exitCode: 0 }
      case 'uptime': return { stdout: ' 08:00:00 up 15 days,  3:42,  1 user,  load average: 0.52, 0.58, 0.59', stderr: '', exitCode: 0 }
      case 'free': return { stdout: '              total        used        free\nMem:        8192000     4096000     4096000\nSwap:       2097152      104857     1992295', stderr: '', exitCode: 0 }
      case 'watch': return this.cmdWatch(cargs, stdin)
      case 'timeout': return this.cmdTimeout(cargs, stdin)
      case 'tee': return this.cmdTee(cargs, stdin)
      case 'date': return { stdout: new Date().toISOString().replace('T', ' ').slice(0, 19), stderr: '', exitCode: 0 }
      case 'true': return { stdout: '', stderr: '', exitCode: 0 }
      case 'false': return { stdout: '', stderr: '', exitCode: 1 }
      case ':': return { stdout: '', stderr: '', exitCode: 0 }
      // === INFO ===
      case 'man': return this.cmdMan(cargs)
      case 'apropos': return this.cmdApropos(cargs)
      case 'which': return this.cmdWhich(cargs)
      case 'type': return this.cmdType(cargs)
      case 'uname': return this.cmdUname(cargs)
      case 'clear': return { stdout: '\x1b[2J\x1b[H', stderr: '', exitCode: 0 }
      case 'exit': return { stdout: '', stderr: '', exitCode: 0, mode: 'exit' }
      // === EDITORS ===
      case 'less': return { stdout: '', stderr: '', exitCode: 0, mode: 'less' }
      case 'vim': case 'vi': return { stdout: '', stderr: '', exitCode: 0, mode: 'vim' }
      case 'nano': return { stdout: '', stderr: '', exitCode: 0, mode: 'nano' }
      // === GIT ===
      case 'git': {
        const gitArgs = args.slice(1)
        if (gitArgs[0] === 'add') {
          const paths = gitArgs.slice(1).filter(argument => !argument.startsWith('-') && argument !== '.')
          const missing = paths.find(path => !this.vfs.lstat(path, this.state.cwd).node)
          if (missing) {
            return {
              stdout: '',
              stderr: `fatal: pathspec '${missing}' did not match any files`,
              exitCode: 128,
            }
          }
        }
        const result = gitCommand(this.gitState, gitArgs, `/${this.state.cwd.join('/')}`)
        this.gitState = result.state
        return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode }
      }
      default:
        if (this.shellFunctions.has(cmd)) {
          if (cargs.length > 0) return { stdout: '', stderr: `${cmd}: bounded functions do not accept arguments`, exitCode: 2 }
          if (this.shellCallDepth >= 10) {
            return { stdout: '', stderr: `${cmd}: maximum bounded call depth exceeded`, exitCode: 2 }
          }
          this.shellCallDepth++
          try {
            return this.execute(this.shellFunctions.get(cmd)!, 1, false)
          } finally {
            this.shellCallDepth--
          }
        }
        if (cmd.startsWith('./') || cmd.startsWith('/')) {
          const parts = this.vfs.resolvePath(cmd, this.state.cwd)
          const st = this.vfs.stat(parts.join('/'), [])
          if (st.node?.type === 'directory') return { stdout: '', stderr: `bash: ${cmd}: Is a directory`, exitCode: 126 }
          if (st.node && !this.vfs.hasPermission(`/${parts.join('/')}`, [], 'execute')) {
            return { stdout: '', stderr: `bash: ${cmd}: Permission denied`, exitCode: 126 }
          }
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
    const requestedTarget = args[0] || this.state.env.HOME
    const previous = '/' + this.state.cwd.join('/')
    const target = requestedTarget === '-' ? this.state.env.OLDPWD : requestedTarget
    if (!target) return { stdout: '', stderr: 'bash: cd: OLDPWD not set', exitCode: 1 }
    if (target === '..') { if (this.state.cwd.length > 0) this.state.cwd.pop() }
    else if (target === '~' || target === this.state.env.HOME) { this.state.cwd = ['home', 'ghost'] }
    else {
      const parts = this.vfs.resolvePath(target, this.state.cwd)
      const st = this.vfs.stat(parts.join('/'), [])
      if (!st.node) return { stdout: '', stderr: `cd: ${target}: No such file or directory`, exitCode: 1 }
      if (st.node.type !== 'directory') return { stdout: '', stderr: `cd: ${target}: Not a directory`, exitCode: 1 }
      if (!this.vfs.hasPermission(`/${parts.join('/')}`, [], 'execute')) return { stdout: '', stderr: `cd: ${target}: Permission denied`, exitCode: 1 }
      this.state.cwd = parts
    }
    this.state.env.OLDPWD = previous
    this.state.env.PWD = '/' + this.state.cwd.join('/')
    return { stdout: requestedTarget === '-' ? `${this.state.env.PWD}\n` : '', stderr: '', exitCode: 0 }
  }

  private cmdPwd(args: string[]): ShellResult {
    let optionsEnded = false
    for (const arg of args) {
      if (!optionsEnded && arg === '--') {
        optionsEnded = true
      } else if (optionsEnded || !/^-[LP]+$/.test(arg)) {
        return { stdout: '', stderr: `pwd: invalid option or operand '${arg}'`, exitCode: 1 }
      }
    }
    return { stdout: '/' + this.state.cwd.join('/'), stderr: '', exitCode: 0 }
  }

  private cmdWhoami(args: string[]): ShellResult {
    if (args.length > 0) {
      return { stdout: '', stderr: `whoami: extra operand '${args[0]}'`, exitCode: 1 }
    }
    return { stdout: this.vfs.getCurrentUser(), stderr: '', exitCode: 0 }
  }

  private cmdBasename(args: string[]): ShellResult {
    const operands = args[0] === '--' ? args.slice(1) : args
    if (operands.length === 0) return { stdout: '', stderr: 'basename: missing operand', exitCode: 1 }
    const invalidOption = args[0] === '--' ? undefined : operands.find(operand => operand.startsWith('-'))
    if (invalidOption) {
      return { stdout: '', stderr: `basename: unrecognized option '${invalidOption}'`, exitCode: 1 }
    }
    if (operands.length > 2) return { stdout: '', stderr: `basename: extra operand '${operands[2]}'`, exitCode: 1 }
    let path = operands[0].replace(/\\/g, '/')
    path = path.replace(/\/+$/g, '') || '/'
    let base = path === '/' ? '/' : path.slice(path.lastIndexOf('/') + 1)
    const suffix = operands[1]
    if (suffix && suffix !== base && base.endsWith(suffix)) base = base.slice(0, -suffix.length)
    return { stdout: `${base}\n`, stderr: '', exitCode: 0 }
  }

  private cmdDirname(args: string[]): ShellResult {
    const operands = args[0] === '--' ? args.slice(1) : args
    if (operands.length === 0) return { stdout: '', stderr: 'dirname: missing operand', exitCode: 1 }
    const invalidOption = args[0] === '--' ? undefined : operands.find(operand => operand.startsWith('-'))
    if (invalidOption) {
      return { stdout: '', stderr: `dirname: unrecognized option '${invalidOption}'`, exitCode: 1 }
    }
    const output = operands.map(rawPath => {
      let path = rawPath.replace(/\\/g, '/').replace(/\/+$/g, '')
      if (!path) return '/'
      const last = path.lastIndexOf('/')
      if (last < 0) return '.'
      path = path.slice(0, last).replace(/\/+$/g, '')
      return path || '/'
    })
    return { stdout: `${output.join('\n')}\n`, stderr: '', exitCode: 0 }
  }

  private cmdLs(args: string[]): ShellResult {
    let showAll = false
    let longFormat = false
    let human = false
    let recursive = false
    let sortTime = false
    let sortSize = false
    const paths: string[] = []

    let optionsEnded = false
    for (const a of args) {
      if (!optionsEnded && a === '--') {
        optionsEnded = true
      } else if (!optionsEnded && a.startsWith('-') && a.length > 1) {
        for (const ch of a.slice(1)) {
          if (!'alhRtS1'.includes(ch)) {
            return { stdout: '', stderr: `ls: invalid option -- '${ch}'`, exitCode: 2 }
          }
          if (ch === 'a') showAll = true
          else if (ch === 'l') longFormat = true
          else if (ch === 'h') human = true
          else if (ch === 'R') recursive = true
          else if (ch === 't') sortTime = true
          else if (ch === 'S') sortSize = true
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

  private cmdCat(args: string[], stdin: string): ShellResult {
    if (args.length === 0) {
      return stdin
        ? { stdout: stdin, stderr: '', exitCode: 0 }
        : { stdout: '', stderr: 'cat: interactive stdin is unavailable in this simulator', exitCode: 1 }
    }
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

  private cmdHead(args: string[], stdin: string): ShellResult {
    let n = 10
    let idx = 0
    if (args[0] === '-n' && args[1]) { n = parseInt(args[1]); idx = 2 }
    else if (args[0]?.startsWith('-')) { n = parseInt(args[0].slice(1)); idx = 1 }
    if (!Number.isInteger(n) || n < 0 || n > 10000) return { stdout: '', stderr: 'head: invalid number of lines', exitCode: 1 }
    const f = args[idx]
    let content = stdin
    if (f) {
      const res = this.vfs.readFile(f, this.state.cwd)
      if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
      content = res.content
    } else if (!stdin) {
      return { stdout: '', stderr: 'head: interactive stdin is unavailable in this simulator', exitCode: 1 }
    }
    const lines = content.split('\n')
    return { stdout: lines.slice(0, n).join('\n') + '\n', stderr: '', exitCode: 0 }
  }

  private cmdTail(args: string[], stdin: string): ShellResult {
    let n = 10
    let idx = 0
    if (args[0] === '-n' && args[1]) { n = parseInt(args[1]); idx = 2 }
    else if (args[0]?.startsWith('-')) { n = parseInt(args[0].slice(1)); idx = 1 }
    if (!Number.isInteger(n) || n < 0 || n > 10000) return { stdout: '', stderr: 'tail: invalid number of lines', exitCode: 1 }
    const f = args[idx]
    let content = stdin
    if (f) {
      const res = this.vfs.readFile(f, this.state.cwd)
      if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
      content = res.content
    } else if (!stdin) {
      return { stdout: '', stderr: 'tail: interactive stdin is unavailable in this simulator', exitCode: 1 }
    }
    const lines = content.split('\n')
    if (lines[lines.length - 1] === '') lines.pop()
    return { stdout: lines.slice(-n).join('\n') + '\n', stderr: '', exitCode: 0 }
  }

  private cmdTouch(args: string[]): ShellResult {
    let noCreate = false
    let requestedMtime: Date | null = null
    let referencePath = ''
    let parsingOptions = true
    const files: string[] = []
    for (let index = 0; index < args.length; index++) {
      const arg = args[index]
      if (parsingOptions && arg === '--') {
        parsingOptions = false
      } else if (parsingOptions && arg === '--no-create') {
        noCreate = true
      } else if (parsingOptions && arg === '-t') {
        const stamp = args[++index] ?? ''
        const match = stamp.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d{2}))?$/)
        if (!match) return { stdout: '', stderr: `touch: invalid date format '${stamp}'`, exitCode: 1 }
        const [, year, month, day, hour, minute, second = '00'] = match
        const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)))
        if (
          parsed.getUTCFullYear() !== Number(year)
          || parsed.getUTCMonth() !== Number(month) - 1
          || parsed.getUTCDate() !== Number(day)
          || parsed.getUTCHours() !== Number(hour)
          || parsed.getUTCMinutes() !== Number(minute)
          || parsed.getUTCSeconds() !== Number(second)
        ) {
          return { stdout: '', stderr: `touch: invalid date '${stamp}'`, exitCode: 1 }
        }
        requestedMtime = parsed
      } else if (parsingOptions && arg === '-r') {
        referencePath = args[++index] ?? ''
        if (!referencePath) return { stdout: '', stderr: 'touch: option requires an argument -- r', exitCode: 1 }
      } else if (parsingOptions && arg.startsWith('--')) {
        return { stdout: '', stderr: `touch: unrecognized option '${arg}'`, exitCode: 1 }
      } else if (parsingOptions && /^-[^-]/.test(arg)) {
        for (const flag of arg.slice(1)) {
          if (flag === 'c') noCreate = true
          else return { stdout: '', stderr: `touch: invalid option -- '${flag}'`, exitCode: 1 }
        }
      } else {
        files.push(arg)
      }
    }
    if (files.length === 0) return { stdout: '', stderr: 'touch: missing file operand', exitCode: 1 }
    if (requestedMtime && referencePath) {
      return { stdout: '', stderr: 'touch: options -t and -r are mutually exclusive in this bounded terminal', exitCode: 1 }
    }
    if (referencePath) {
      const reference = this.vfs.stat(referencePath, this.state.cwd)
      if (!reference.node) {
        const reason = reference.error?.includes('Permission denied') ? 'Permission denied' : 'No such file or directory'
        return { stdout: '', stderr: `touch: failed to get attributes of '${referencePath}': ${reason}`, exitCode: 1 }
      }
      requestedMtime = new Date(reference.node.mtime)
    }
    let changed = false
    for (const f of files) {
      const st = this.vfs.stat(f, this.state.cwd)
      if (!st.node) {
        if (noCreate) continue
        const created = this.vfs.writeFile(f, this.state.cwd, '')
        if (created.error) return { stdout: '', stderr: created.error, exitCode: 1 }
        const mode = (0o666 & ~this.state.umask).toString(8).padStart(3, '0')
        const chmod = this.vfs.chmod(f, this.state.cwd, mode)
        if (chmod.error) return { stdout: '', stderr: chmod.error, exitCode: 1 }
        if (requestedMtime) {
          const touched = this.vfs.touch(f, this.state.cwd, requestedMtime)
          if (touched.error) return { stdout: '', stderr: touched.error, exitCode: 1 }
        }
        changed = true
      } else {
        const touched = this.vfs.touch(f, this.state.cwd, requestedMtime ?? new Date())
        if (touched.error) return { stdout: '', stderr: touched.error, exitCode: 1 }
        changed = true
      }
    }
    return { stdout: '', stderr: '', exitCode: 0, progressEligible: changed }
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
          if (st.node && st.node.type !== 'directory') {
            return { stdout: '', stderr: `mkdir: cannot create directory '${d}': Not a directory`, exitCode: 1 }
          }
          if (!st.node) {
            const created = this.vfs.createDirectory(sub, [])
            if (created.error) return { stdout: '', stderr: created.error, exitCode: 1 }
          }
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
    let interactive = false
    let noClobber = false
    let preserve = false
    let verbose = false
    const files: string[] = []
    for (const arg of args) {
      if (/^-[^-]/.test(arg)) {
        for (const flag of arg.slice(1)) {
          if (flag === 'r' || flag === 'R') recursive = true
          else if (flag === 'i') interactive = true
          else if (flag === 'n') noClobber = true
          else if (flag === 'p') preserve = true
          else if (flag === 'v') verbose = true
          else return { stdout: '', stderr: `cp: invalid option -- '${flag}'`, exitCode: 1 }
        }
      } else files.push(arg)
    }
    if (interactive && noClobber) {
      return { stdout: '', stderr: 'cp: -i and -n cannot be combined in this bounded terminal', exitCode: 1 }
    }
    if (files.length < 2) return { stdout: '', stderr: 'cp: missing destination file operand', exitCode: 1 }
    const dst = files.pop()!
    let stdout = ''
    let changed = false
    let safelyRefusedOverwrite = false
    for (const src of files) {
      const source = this.vfs.stat(src, this.state.cwd)
      if (!source.node) return { stdout, stderr: source.error ?? `cp: cannot stat '${src}'`, exitCode: 1 }
      const destination = this.vfs.stat(dst, this.state.cwd)
      const actualDestination = destination.node?.type === 'directory'
        ? `/${[...this.vfs.resolvePath(dst, this.state.cwd), this.vfs.resolvePath(src, this.state.cwd).at(-1)!].join('/')}`
        : dst
      const existing = this.vfs.stat(actualDestination, this.state.cwd).node
      if (existing && noClobber) {
        safelyRefusedOverwrite = true
        continue
      }
      if (existing && interactive) {
        safelyRefusedOverwrite = true
        stdout += `cp: overwrite '${actualDestination}'? n\n`
        continue
      }
      const res = this.vfs.copy(src, dst, this.state.cwd, recursive, preserve)
      if (res.error) return { stdout, stderr: res.error, exitCode: 1 }
      changed = true
      if (verbose) stdout += `'${src}' -> '${actualDestination}'\n`
    }
    return { stdout, stderr: '', exitCode: 0, progressEligible: changed || safelyRefusedOverwrite }
  }

  private cmdMv(args: string[]): ShellResult {
    let interactive = false
    let noClobber = false
    let verbose = false
    let parsingOptions = true
    const files: string[] = []
    for (const arg of args) {
      if (parsingOptions && arg === '--') {
        parsingOptions = false
      } else if (parsingOptions && /^-[^-]/.test(arg)) {
        for (const flag of arg.slice(1)) {
          if (flag === 'i') interactive = true
          else if (flag === 'n') noClobber = true
          else if (flag === 'v') verbose = true
          else if (flag === 'f') {
            interactive = false
            noClobber = false
          } else return { stdout: '', stderr: `mv: invalid option -- '${flag}'`, exitCode: 1 }
        }
      } else {
        files.push(arg)
      }
    }
    if (files.length < 2) return { stdout: '', stderr: 'mv: missing destination file operand', exitCode: 1 }
    const dst = files.pop()!
    let stdout = ''
    let changed = false
    for (const src of files) {
      const destination = this.vfs.stat(dst, this.state.cwd)
      const actualDestination = destination.node?.type === 'directory'
        ? `/${[...this.vfs.resolvePath(dst, this.state.cwd), this.vfs.resolvePath(src, this.state.cwd).at(-1)!].join('/')}`
        : dst
      const existing = this.vfs.lstat(actualDestination, this.state.cwd).node
      if (existing && noClobber) continue
      if (existing && interactive) {
        return {
          stdout,
          stderr: `mv: overwrite '${actualDestination}'? interactive input is unavailable; file left unchanged`,
          exitCode: 1,
        }
      }
      const res = this.vfs.move(src, dst, this.state.cwd)
      if (res.error) return { stdout, stderr: res.error, exitCode: 1 }
      changed = true
      if (verbose) stdout += `renamed '${src}' -> '${actualDestination}'\n`
    }
    return { stdout, stderr: '', exitCode: 0, progressEligible: changed }
  }

  private cmdRm(args: string[]): ShellResult {
    let recursive = false
    let force = false
    let interactive = false
    let parsingOptions = true
    const files: string[] = []
    for (const arg of args) {
      if (parsingOptions && arg === '--') {
        parsingOptions = false
        continue
      }
      if (parsingOptions && /^-[^-]/.test(arg)) {
        for (const flag of arg.slice(1)) {
          if (flag === 'r' || flag === 'R') recursive = true
          else if (flag === 'f') force = true
          else if (flag === 'i') interactive = true
          else if (flag !== 'v') {
            return { stdout: '', stderr: `rm: invalid option -- '${flag}'`, exitCode: 1 }
          }
        }
        continue
      }
      files.push(arg)
    }
    if (files.length === 0) {
      return force
        ? { stdout: '', stderr: '', exitCode: 0, progressEligible: false }
        : { stdout: '', stderr: 'rm: missing operand', exitCode: 1 }
    }
    if (interactive) {
      let stdout = ''
      let safelyRefused = false
      for (const file of files) {
        const stat = this.vfs.lstat(file, this.state.cwd)
        if (!stat.node) {
          if (!force) {
            return { stdout: '', stderr: `rm: cannot remove '${file}': No such file or directory`, exitCode: 1 }
          }
          continue
        }
        safelyRefused = true
        stdout += `rm: remove '${file}'? n\n`
      }
      return { stdout, stderr: '', exitCode: 0, progressEligible: safelyRefused }
    }
    let removed = false
    for (const f of files) {
      const st = this.vfs.lstat(f, this.state.cwd)
      if (!st.node) {
        if (!force) return { stdout: '', stderr: `rm: cannot remove '${f}': No such file or directory`, exitCode: 1 }
        continue
      }
      if (st.node.type === 'directory') {
        const res = this.vfs.deleteDirectory(f, this.state.cwd, recursive)
        if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
      } else {
        const res = this.vfs.deleteFile(f, this.state.cwd)
        if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
      }
      removed = true
    }
    return { stdout: '', stderr: '', exitCode: 0, progressEligible: removed }
  }

  private cmdLn(args: string[]): ShellResult {
    let sym = false
    let parsingOptions = true
    const files: string[] = []
    for (const arg of args) {
      if (parsingOptions && arg === '--') parsingOptions = false
      else if (parsingOptions && arg === '-s') sym = true
      else if (parsingOptions && arg.startsWith('-')) {
        return { stdout: '', stderr: `ln: unsupported option '${arg}'`, exitCode: 1 }
      } else files.push(arg)
    }
    if (files.length !== 2) return { stdout: '', stderr: 'ln: source and destination are required', exitCode: 1 }
    const target = files[0]
    const linkPath = files[1]
    if (sym) {
      const result = this.vfs.symlink(target, linkPath, this.state.cwd)
      if (result.error) return { stdout: '', stderr: result.error, exitCode: 1 }
      return { stdout: '', stderr: '', exitCode: 0 }
    }
    const result = this.vfs.hardlink(target, linkPath, this.state.cwd)
    return result.error
      ? { stdout: '', stderr: result.error, exitCode: 1 }
      : { stdout: '', stderr: '', exitCode: 0 }
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
      const addFile = (file: string, displayPath: string): string | undefined => {
        const stat = this.vfs.stat(file, this.state.cwd)
        if (!stat.node) return stat.error ?? `grep: ${file}: No such file or directory`
        if (stat.node.type === 'directory') {
          if (!recursive) return `grep: ${file}: Is a directory`
          const listed = this.vfs.listDirectory(file, this.state.cwd)
          if (listed.error) return listed.error
          for (const entry of listed.entries) {
            const child = `${file.replace(/\/$/, '')}/${entry.name}`
            const childDisplay = `${displayPath.replace(/\/$/, '')}/${entry.name}`
            const error = addFile(child, childDisplay)
            if (error) return error
          }
          return undefined
        }
        const res = this.vfs.readFile(file, this.state.cwd)
        if (res.error) return res.error
        let content = res.content || ''
        if (content.length > MAX_GREP_INPUT) content = content.slice(0, MAX_GREP_INPUT)
        content.split('\n').forEach((text, lineIndex) => lines.push({ text, file: displayPath, num: lineIndex + 1 }))
        return undefined
      }
      for (const f of files) {
        const error = addFile(f, f)
        if (error) return { stdout: '', stderr: error, exitCode: 2 }
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
    return { stdout, stderr: '', exitCode: stdout ? 0 : 1 }
  }

  private cmdFind(args: string[]): ShellResult {
    let namePattern = ''
    let typeFilter = ''
    let mtime = ''
    let size = ''
    let permission = ''
    let print0 = false
    let index = 0
    let startPath = '.'
    if (args[0] && !args[0].startsWith('-')) {
      startPath = args[0]
      index = 1
    }
    for (; index < args.length; index++) {
      const arg = args[index]
      if (['-name', '-type', '-mtime', '-size', '-perm'].includes(arg)) {
        const value = args[++index]
        if (!value) return { stdout: '', stderr: `find: missing argument to '${arg}'`, exitCode: 1 }
        if (arg === '-name') namePattern = value
        else if (arg === '-type') typeFilter = value
        else if (arg === '-mtime') mtime = value
        else if (arg === '-size') size = value
        else permission = value
      } else if (arg === '-print0') print0 = true
      else if (arg !== '-print') return { stdout: '', stderr: `find: unknown predicate '${arg}'`, exitCode: 1 }
    }

    const startParts = startPath === '.' ? this.state.cwd : this.vfs.resolvePath(startPath, this.state.cwd)
    const start = this.vfs.stat(`/${startParts.join('/')}`, [])
    if (!start.node) return { stdout: '', stderr: start.error ?? `find: '${startPath}': No such file or directory`, exitCode: 1 }
    const matches: string[] = []
    let traversalError = ''

    const numericMatch = (actual: number, expression: string) => {
      const parsed = expression.match(/^([+-]?)(\d+)$/)
      if (!parsed) return null
      const expected = Number(parsed[2])
      if (parsed[1] === '+') return actual > expected
      if (parsed[1] === '-') return actual < expected
      return actual === expected
    }

    const sizeInBytes = (expression: string) => {
      const parsed = expression.match(/^([+-]?)(\d+)([bcwkMG]?)$/)
      if (!parsed) return null
      const unit = parsed[3] || 'b'
      const multiplier: Record<string, number> = { c: 1, w: 2, b: 512, k: 1024, M: 1024 ** 2, G: 1024 ** 3 }
      return { sign: parsed[1], value: Number(parsed[2]) * multiplier[unit] }
    }

    const recurse = (path: string[]) => {
      const listed = this.vfs.listDirectory(path.join('/'), [])
      if (listed.error) { traversalError = listed.error; return }
      const entries = listed.entries
      for (const e of entries) {
        const fullPath = path.concat(e.name).join('/')
        let match = true
        if (namePattern) {
          const pat = escapeRegex(namePattern).replace(/\\\*/g, '.*').replace(/\\\?/g, '.')
          match = new RegExp('^' + pat + '$').test(e.name)
        }
        if (typeFilter) {
          if (typeFilter === 'f' && e.type !== 'file') match = false
          if (typeFilter === 'd' && e.type !== 'directory') match = false
          if (typeFilter === 'l' && e.type !== 'symlink') match = false
        }
        if (mtime) {
          const ageDays = Math.floor(Math.max(0, Date.now() - e.mtime.getTime()) / 86400000)
          const result = numericMatch(ageDays, mtime)
          if (result === null) { traversalError = `find: invalid argument '${mtime}' to -mtime`; return }
          if (!result) match = false
        }
        if (size) {
          const parsed = sizeInBytes(size)
          if (!parsed) { traversalError = `find: invalid -size type '${size}'`; return }
          if (parsed.sign === '+' ? e.size <= parsed.value : parsed.sign === '-' ? e.size >= parsed.value : e.size !== parsed.value) match = false
        }
        if (permission) {
          const parsed = permission.match(/^([/-]?)([0-7]{3,4})$/)
          if (!parsed) { traversalError = `find: invalid mode '${permission}'`; return }
          const expected = parseInt(parsed[2], 8)
          const actual = permissionMode(e.permissions)
          if (parsed[1] === '-' ? (actual & expected) !== expected : parsed[1] === '/' ? (actual & expected) === 0 : actual !== expected) match = false
        }
        if (match) matches.push('/' + fullPath)
        if (e.type === 'directory') recurse(path.concat(e.name))
        if (traversalError) return
      }
    }

    recurse(startParts)
    if (traversalError) return { stdout: '', stderr: traversalError, exitCode: 1 }
    const separator = print0 ? '\0' : '\n'
    return { stdout: matches.length ? matches.join(separator) + separator : '', stderr: '', exitCode: 0 }
  }

  private cmdSort(args: string[], stdin: string): ShellResult {
    let reverse = false
    let numeric = false
    let unique = false
    let optionsEnded = false
    const files: string[] = []
    for (const arg of args) {
      if (!optionsEnded && arg === '--') {
        optionsEnded = true
      } else if (!optionsEnded && arg.startsWith('-') && arg !== '-') {
        for (const option of arg.slice(1)) {
          if (!'rnu'.includes(option)) {
            return { stdout: '', stderr: `sort: invalid option -- '${option}'`, exitCode: 2 }
          }
          if (option === 'r') reverse = true
          else if (option === 'n') numeric = true
          else if (option === 'u') unique = true
        }
      } else {
        files.push(arg)
      }
    }
    let input = stdin
    if (files.length > 0) {
      input = ''
      for (const file of files) {
        if (file === '-') {
          input += stdin
          continue
        }
        const read = this.vfs.readFile(file, this.state.cwd)
        if (read.error) return { stdout: '', stderr: `sort: ${read.error.replace(/^[^:]+:\s*/, '')}`, exitCode: 2 }
        input += read.content
      }
    } else if (!stdin) {
      return { stdout: '', stderr: 'sort: standard input is unavailable in this terminal', exitCode: 1 }
    }
    if (input.length > MAX_GREP_INPUT) input = input.slice(0, MAX_GREP_INPUT)
    let lines = input.split('\n')
    if (lines[lines.length - 1] === '') lines.pop()
    lines.sort((left, right) => {
      const compared = numeric ? Number(left) - Number(right) : left.localeCompare(right)
      return reverse ? -compared : compared
    })
    if (unique) lines = lines.filter((line, index) => index === 0 || line !== lines[index - 1])
    return { stdout: lines.length > 0 ? `${lines.join('\n')}\n` : '', stderr: '', exitCode: 0 }
  }

  private cmdUniq(args: string[], stdin: string): ShellResult {
    let count = false
    let repeatedOnly = false
    let uniqueOnly = false
    let optionsEnded = false
    const files: string[] = []
    for (const arg of args) {
      if (!optionsEnded && arg === '--') {
        optionsEnded = true
      } else if (!optionsEnded && arg.startsWith('-') && arg !== '-') {
        for (const option of arg.slice(1)) {
          if (!'cdu'.includes(option)) {
            return { stdout: '', stderr: `uniq: invalid option -- '${option}'`, exitCode: 1 }
          }
          if (option === 'c') count = true
          else if (option === 'd') repeatedOnly = true
          else if (option === 'u') uniqueOnly = true
        }
      } else {
        files.push(arg)
      }
    }
    if (repeatedOnly && uniqueOnly) {
      return { stdout: '', stderr: 'uniq: options -d and -u are mutually exclusive', exitCode: 1 }
    }
    if (files.length > 2) return { stdout: '', stderr: `uniq: extra operand '${files[2]}'`, exitCode: 1 }
    let input = stdin
    if (files[0] && files[0] !== '-') {
      const read = this.vfs.readFile(files[0], this.state.cwd)
      if (read.error) return { stdout: '', stderr: `uniq: ${read.error.replace(/^[^:]+:\s*/, '')}`, exitCode: 1 }
      input = read.content
    } else if (!files[0] && !stdin) {
      return { stdout: '', stderr: 'uniq: standard input is unavailable in this terminal', exitCode: 1 }
    }
    if (input.length > MAX_GREP_INPUT) input = input.slice(0, MAX_GREP_INPUT)
    const lines = input.split('\n')
    if (lines[lines.length - 1] === '') lines.pop()
    let stdout = ''
    let i = 0
    while (i < lines.length) {
      let j = i + 1
      while (j < lines.length && lines[j] === lines[i]) j++
      const occurrences = j - i
      if ((!repeatedOnly || occurrences > 1) && (!uniqueOnly || occurrences === 1)) {
        if (count) stdout += `${String(occurrences).padStart(4)} ${lines[i]}\n`
        else stdout += lines[i] + '\n'
      }
      i = j
    }
    if (files[1]) {
      const written = this.vfs.writeFile(files[1], this.state.cwd, stdout)
      if (written.error) return { stdout: '', stderr: `uniq: ${written.error.replace(/^[^:]+:\s*/, '')}`, exitCode: 1 }
      stdout = ''
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
    let delimiter = /\s+/
    let maxArgs = Number.POSITIVE_INFINITY
    let replaceToken = ''
    const command: string[] = []
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-0') delimiter = /\0/
      else if (args[i] === '-n') {
        const parsed = Number(args[++i])
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
          return { stdout: '', stderr: 'xargs: invalid number for -n', exitCode: 1 }
        }
        maxArgs = parsed
      } else if (args[i] === '-I') {
        replaceToken = args[++i] ?? ''
        if (!replaceToken) return { stdout: '', stderr: 'xargs: option requires an argument -- I', exitCode: 1 }
      } else command.push(args[i])
    }
    const boundedInput = stdin.slice(0, MAX_GREP_INPUT)
    const items = boundedInput.split(delimiter).filter(Boolean)
    const base = command.length > 0 ? command : ['echo']
    let stdout = ''
    let stderr = ''
    let exitCode = 0
    const groups = replaceToken
      ? items.map(item => [item])
      : Number.isFinite(maxArgs)
        ? Array.from({ length: Math.ceil(items.length / maxArgs) }, (_, index) => items.slice(index * maxArgs, (index + 1) * maxArgs))
        : (items.length > 0 ? [items] : [])
    for (const group of groups) {
      const expanded = replaceToken
        ? base.map(part => part.split(replaceToken).join(group[0]))
        : [...base, ...group]
      const result = this.runCommand(expanded, '')
      stdout += result.stdout
      stderr += result.stderr
      if (result.exitCode !== 0) {
        exitCode = result.exitCode
        break
      }
    }
    return { stdout, stderr, exitCode }
  }

  private cmdAwk(args: string[], stdin: string): ShellResult {
    let separator: string | null = null
    let optionsEnded = false
    let script = ''
    const files: string[] = []
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      if (!optionsEnded && arg === '--') {
        optionsEnded = true
      } else if (!optionsEnded && arg === '-F') {
        separator = args[++i] ?? ''
        if (!separator) return { stdout: '', stderr: 'awk: option requires an argument -- F', exitCode: 2 }
      } else if (!optionsEnded && arg.startsWith('-F') && arg.length > 2) {
        separator = arg.slice(2)
      } else if (!script) {
        if (!optionsEnded && arg.startsWith('-')) {
          return { stdout: '', stderr: `awk: unsupported option '${arg}'`, exitCode: 2 }
        }
        script = arg
      } else {
        files.push(arg)
      }
    }
    if (!script) return { stdout: '', stderr: 'awk: missing program', exitCode: 2 }
    const program = script.match(/^\{\s*print(?:\s+\$(\d+))?\s*\}$/)
    if (!program) return { stdout: '', stderr: `awk: unsupported program '${script}'`, exitCode: 2 }
    let input = stdin
    if (files.length > 0) {
      input = ''
      for (const file of files) {
        if (file === '-') {
          input += stdin
          continue
        }
        const read = this.vfs.readFile(file, this.state.cwd)
        if (read.error) return { stdout: '', stderr: `awk: ${read.error.replace(/^[^:]+:\s*/, '')}`, exitCode: 2 }
        input += read.content
      }
    } else if (!stdin) {
      return { stdout: '', stderr: 'awk: standard input is unavailable in this terminal', exitCode: 1 }
    }
    if (input.length > MAX_GREP_INPUT) input = input.slice(0, MAX_GREP_INPUT)
    const colNum = program[1] ? Number(program[1]) : 0
    const lines = input.split('\n')
    if (lines[lines.length - 1] === '') lines.pop()
    let stdout = ''
    for (const line of lines) {
      const fields = separator === null ? line.trim().split(/\s+/) : line.split(separator)
      if (colNum === 0) stdout += line + '\n'
      else if (colNum <= fields.length) stdout += fields[colNum - 1] + '\n'
    }
    return { stdout, stderr: '', exitCode: 0 }
  }

  private cmdSed(args: string[], stdin: string): ShellResult {
    const quiet = args.includes('-n')
    const operands = args.filter(arg => arg !== '-n')
    const script = operands[0]
    if (!script) return { stdout: '', stderr: 'sed: missing script', exitCode: 1 }
    const files = operands.slice(1)
    let input = stdin
    if (files.length > 0) {
      input = ''
      for (const file of files) {
        const read = this.vfs.readFile(file, this.state.cwd)
        if (read.error) return { stdout: '', stderr: read.error, exitCode: 2 }
        input += read.content
      }
    }
    if (input.length > MAX_GREP_INPUT) input = input.slice(0, MAX_GREP_INPUT)

    const printRange = script.match(/^(\d+)(?:,(\d+))?p$/)
    if (printRange) {
      const from = Number(printRange[1])
      const to = Number(printRange[2] ?? printRange[1])
      if (from < 1 || to < from) return { stdout: '', stderr: `sed: invalid range '${script}'`, exitCode: 1 }
      const lines = input.split('\n')
      if (lines.at(-1) === '') lines.pop()
      const selected = lines.slice(from - 1, to).join('\n')
      const printed = selected ? `${selected}\n` : ''
      return { stdout: quiet ? printed : input + printed, stderr: '', exitCode: 0 }
    }

    const m = script.match(/^s\/(.*?)\/(.*?)\/([g]?)$/)
    if (!m) return { stdout: '', stderr: `sed: unsupported script '${script}'`, exitCode: 1 }
    const [, from, to] = m
    if (!from) return { stdout: stdin, stderr: 'sed: empty search pattern', exitCode: 1 }
    const result = m[3] === 'g' ? input.split(from).join(to) : input.replace(from, to)
    return { stdout: quiet ? '' : result, stderr: '', exitCode: 0 }
  }

  private splitSuffix(index: number): string | null {
    if (index < 0 || index >= 26 * 26) return null
    return String.fromCharCode(97 + Math.floor(index / 26), 97 + index % 26)
  }

  private cmdSplit(args: string[]): ShellResult {
    let linesPerFile = 1000
    let index = 0
    if (args[index] === '-l') {
      linesPerFile = Number(args[index + 1])
      index += 2
    }
    if (!Number.isInteger(linesPerFile) || linesPerFile < 1 || linesPerFile > 10000) {
      return { stdout: '', stderr: 'split: invalid number of lines', exitCode: 1 }
    }
    const file = args[index]
    const prefix = args[index + 1] ?? 'x'
    if (!file) return { stdout: '', stderr: 'split: missing operand', exitCode: 1 }
    if (args.length > index + 2) return { stdout: '', stderr: `split: extra operand '${args[index + 2]}'`, exitCode: 1 }
    const read = this.vfs.readFile(file, this.state.cwd)
    if (read.error) return { stdout: '', stderr: read.error, exitCode: 1 }
    const records = read.content.match(/[^\n]*\n|[^\n]+$/g) ?? []
    const chunks: Array<{ path: string; content: string }> = []
    for (let offset = 0, part = 0; offset < records.length; offset += linesPerFile, part++) {
      const suffix = this.splitSuffix(part)
      if (!suffix) return { stdout: '', stderr: 'split: output file suffixes exhausted', exitCode: 1 }
      chunks.push({ path: `${prefix}${suffix}`, content: records.slice(offset, offset + linesPerFile).join('') })
    }
    if (chunks.length === 0) chunks.push({ path: `${prefix}aa`, content: '' })
    for (const chunk of chunks) {
      const written = this.vfs.writeFile(chunk.path, this.state.cwd, chunk.content)
      if (written.error) return { stdout: '', stderr: written.error, exitCode: 1 }
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdCsplit(args: string[]): ShellResult {
    let prefix = 'xx'
    let digits = 2
    let index = 0
    while (args[index]?.startsWith('-')) {
      if (args[index] === '-f' && args[index + 1]) { prefix = args[index + 1]; index += 2 }
      else if (args[index] === '-n' && args[index + 1]) { digits = Number(args[index + 1]); index += 2 }
      else return { stdout: '', stderr: `csplit: unsupported option '${args[index]}'`, exitCode: 1 }
    }
    const file = args[index]
    const expression = args[index + 1]
    if (!file || !expression) return { stdout: '', stderr: 'csplit: missing operand', exitCode: 1 }
    if (!Number.isInteger(digits) || digits < 1 || digits > 6) return { stdout: '', stderr: 'csplit: invalid suffix length', exitCode: 1 }
    const match = expression.match(/^\/(.*)\/$/)
    if (!match) return { stdout: '', stderr: `csplit: unsupported expression '${expression}'`, exitCode: 1 }
    const rawPattern = match[1]
    if (
      rawPattern.length === 0
      || rawPattern.length > 128
      || /[()[\]{}+*?|]/.test(rawPattern)
      || /\\(?![\\/.^$-])/u.test(rawPattern)
    ) {
      return { stdout: '', stderr: 'csplit: only bounded literal patterns with optional ^/$ anchors are supported', exitCode: 1 }
    }
    const anchoredStart = rawPattern.startsWith('^')
    const anchoredEnd = rawPattern.endsWith('$') && !rawPattern.endsWith('\\$')
    const literal = rawPattern
      .slice(anchoredStart ? 1 : 0, anchoredEnd ? -1 : undefined)
      .replace(/\\([\\/.^$-])/g, '$1')
    if (!literal) return { stdout: '', stderr: 'csplit: empty patterns are not supported', exitCode: 1 }
    const read = this.vfs.readFile(file, this.state.cwd)
    if (read.error) return { stdout: '', stderr: read.error, exitCode: 1 }
    const records = read.content.match(/[^\n]*\n|[^\n]+$/g) ?? []
    const splitAt = records.findIndex(record => {
      const line = record.replace(/\n$/, '')
      if (anchoredStart && anchoredEnd) return line === literal
      if (anchoredStart) return line.startsWith(literal)
      if (anchoredEnd) return line.endsWith(literal)
      return line.includes(literal)
    })
    if (splitAt < 0) return { stdout: '', stderr: `csplit: '${expression}': match not found`, exitCode: 1 }
    const contents = [records.slice(0, splitAt).join(''), records.slice(splitAt).join('')]
    for (let part = 0; part < contents.length; part++) {
      const path = `${prefix}${String(part).padStart(digits, '0')}`
      const written = this.vfs.writeFile(path, this.state.cwd, contents[part])
      if (written.error) return { stdout: '', stderr: written.error, exitCode: 1 }
    }
    return { stdout: `${contents[0].length}\n${contents[1].length}\n`, stderr: '', exitCode: 0 }
  }

  private cmdTruncate(args: string[]): ShellResult {
    const noCreate = args.includes('-c') || args.includes('--no-create')
    const sizeIndex = args.findIndex(arg => arg === '-s' || arg === '--size')
    if (sizeIndex < 0 || !args[sizeIndex + 1]) return { stdout: '', stderr: 'truncate: missing size', exitCode: 1 }
    const expression = args[sizeIndex + 1]
    const parsed = expression.match(/^([+-]?)(\d+)([KMG]?)$/i)
    if (!parsed) return { stdout: '', stderr: `truncate: invalid number '${expression}'`, exitCode: 1 }
    const multiplier = parsed[3].toUpperCase() === 'K' ? 1024 : parsed[3].toUpperCase() === 'M' ? 1024 ** 2 : parsed[3].toUpperCase() === 'G' ? 1024 ** 3 : 1
    const amount = Number(parsed[2]) * multiplier
    const files = args.filter((arg, argIndex) =>
      argIndex !== sizeIndex && argIndex !== sizeIndex + 1 && !['-c', '--no-create'].includes(arg))
    if (files.length === 0) return { stdout: '', stderr: 'truncate: missing file operand', exitCode: 1 }
    for (const file of files) {
      const stat = this.vfs.stat(file, this.state.cwd)
      if (!stat.node) {
        if (noCreate) continue
        if (parsed[1]) return { stdout: '', stderr: `truncate: cannot open '${file}'`, exitCode: 1 }
      } else if (stat.node.type !== 'file') return { stdout: '', stderr: `truncate: cannot open '${file}': Is a directory`, exitCode: 1 }
      const existing = stat.node?.content ?? ''
      const target = parsed[1] === '+' ? existing.length + amount : parsed[1] === '-' ? Math.max(0, existing.length - amount) : amount
      if (target > 10 * 1024 * 1024) return { stdout: '', stderr: 'truncate: size exceeds simulator limit', exitCode: 1 }
      const content = target <= existing.length ? existing.slice(0, target) : existing + '\0'.repeat(target - existing.length)
      const written = this.vfs.writeFile(file, this.state.cwd, content)
      if (written.error) return { stdout: '', stderr: written.error, exitCode: 1 }
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdChecksum(args: string[], algorithm: 'md5' | 'sha256'): ShellResult {
    const files = args.filter(arg => !arg.startsWith('-'))
    if (files.length === 0) return { stdout: '', stderr: `${algorithm}sum: missing file operand`, exitCode: 1 }
    let stdout = ''
    for (const file of files) {
      const read = this.vfs.readFile(file, this.state.cwd)
      if (read.error) return { stdout, stderr: read.error, exitCode: 1 }
      const digest = algorithm === 'md5' ? md5Hex(read.content) : sha256Hex(read.content)
      stdout += `${digest}  ${file}\n`
    }
    return { stdout, stderr: '', exitCode: 0 }
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

  private cmdChgrp(args: string[]): ShellResult {
    if (args.length < 2) return { stdout: '', stderr: 'chgrp: missing operand', exitCode: 1 }
    const group = args[0]
    const knownGroups = new Set(['root', 'ghost', 'sudo', 'www-data', 'postgres', 'redis'])
    if (!knownGroups.has(group)) return { stdout: '', stderr: `chgrp: invalid group: '${group}'`, exitCode: 1 }
    for (const file of args.slice(1)) {
      const result = this.vfs.lstat(file, this.state.cwd)
      if (!result.node) return { stdout: '', stderr: result.error ?? `chgrp: cannot access '${file}'`, exitCode: 1 }
      const user = this.vfs.getCurrentUser()
      if (user !== 'root' && result.node.owner !== user) return { stdout: '', stderr: `chgrp: changing group of '${file}': Operation not permitted`, exitCode: 1 }
      if (user !== 'root' && !['ghost', 'sudo'].includes(group)) return { stdout: '', stderr: `chgrp: changing group of '${file}': Operation not permitted`, exitCode: 1 }
      result.node.group = group
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdGetfacl(args: string[]): ShellResult {
    const files = args.filter(arg => !arg.startsWith('-'))
    if (files.length === 0) return { stdout: '', stderr: 'getfacl: missing file operand', exitCode: 1 }
    let stdout = ''
    for (const file of files) {
      const result = this.vfs.lstat(file, this.state.cwd)
      if (!result.node) return { stdout, stderr: result.error ?? `getfacl: ${file}: No such file`, exitCode: 1 }
      const permission = result.node.permissions
      stdout += `# file: ${file}\n# owner: ${result.node.owner}\n# group: ${result.node.group}\nuser::${permission.slice(0, 3)}\ngroup::${permission.slice(3, 6)}\nother::${permission.slice(6, 9)}\n`
    }
    return { stdout, stderr: '', exitCode: 0 }
  }

  private cmdSetfacl(args: string[]): ShellResult {
    const modifyIndex = args.indexOf('-m')
    if (modifyIndex < 0 || !args[modifyIndex + 1]) return { stdout: '', stderr: 'setfacl: only base ACL modification with -m is supported', exitCode: 1 }
    const file = args.find((arg, index) => index > modifyIndex + 1 && !arg.startsWith('-'))
    if (!file) return { stdout: '', stderr: 'setfacl: missing file operand', exitCode: 1 }
    const result = this.vfs.stat(file, this.state.cwd)
    if (!result.node) return { stdout: '', stderr: result.error ?? `setfacl: ${file}: No such file`, exitCode: 1 }
    let mode = permissionMode(result.node.permissions)
    for (const entry of args[modifyIndex + 1].split(',')) {
      const match = entry.match(/^(u|g|o)::([r-][w-][x-])$/)
      if (!match) return { stdout: '', stderr: `setfacl: named or default ACL '${entry}' is not supported`, exitCode: 1 }
      const value = (match[2][0] === 'r' ? 4 : 0) + (match[2][1] === 'w' ? 2 : 0) + (match[2][2] === 'x' ? 1 : 0)
      if (match[1] === 'u') mode = (mode & ~0o700) | value << 6
      else if (match[1] === 'g') mode = (mode & ~0o070) | value << 3
      else mode = (mode & ~0o007) | value
    }
    const changed = this.vfs.chmod(file, this.state.cwd, mode.toString(8).padStart(mode > 0o777 ? 4 : 3, '0'))
    return changed.error
      ? { stdout: '', stderr: changed.error, exitCode: 1 }
      : { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdId(args: string[]): ShellResult {
    let flags = ''
    let user = ''
    let optionsEnded = false
    for (const arg of args) {
      if (!optionsEnded && arg === '--') {
        optionsEnded = true
      } else if (!optionsEnded && arg.startsWith('-') && arg !== '-') {
        for (const option of arg.slice(1)) {
          if (!'ugGn'.includes(option)) return { stdout: '', stderr: `id: invalid option -- '${option}'`, exitCode: 1 }
          flags += option
        }
      } else if (!user) {
        user = arg
      } else {
        return { stdout: '', stderr: `id: extra operand '${arg}'`, exitCode: 1 }
      }
    }
    user ||= this.vfs.getCurrentUser()
    const identities: Record<string, { uid: number; gid: number; groups: Array<[number, string]> }> = {
      root: { uid: 0, gid: 0, groups: [[0, 'root']] },
      ghost: { uid: 1000, gid: 1000, groups: [[1000, 'ghost'], [27, 'sudo']] },
      'www-data': { uid: 33, gid: 33, groups: [[33, 'www-data']] },
    }
    const identity = identities[user]
    if (!identity) return { stdout: '', stderr: `id: '${user}': no such user`, exitCode: 1 }
    const primarySelectors = ['u', 'g', 'G'].filter(flag => flags.includes(flag))
    if (primarySelectors.length > 1) return { stdout: '', stderr: 'id: cannot print multiple identity types at once', exitCode: 1 }
    if (flags.includes('n') && primarySelectors.length === 0) {
      return { stdout: '', stderr: 'id: cannot print only names in default format', exitCode: 1 }
    }
    if (flags.includes('u')) return { stdout: `${flags.includes('n') ? user : identity.uid}\n`, stderr: '', exitCode: 0 }
    if (flags.includes('g')) return { stdout: `${flags.includes('n') ? identity.groups[0][1] : identity.gid}\n`, stderr: '', exitCode: 0 }
    if (flags.includes('G')) {
      return {
        stdout: `${identity.groups.map(([gid, name]) => flags.includes('n') ? name : gid).join(' ')}\n`,
        stderr: '',
        exitCode: 0,
      }
    }
    const groups = identity.groups.map(([gid, name]) => `${gid}(${name})`).join(',')
    return { stdout: `uid=${identity.uid}(${user}) gid=${identity.gid}(${identity.groups[0][1]}) groups=${groups}`, stderr: '', exitCode: 0 }
  }

  private cmdSudo(args: string[]): ShellResult {
    if (args.length === 0) return { stdout: '', stderr: 'sudo: no command specified', exitCode: 1 }
    const prevUser = this.vfs.getCurrentUser()
    this.vfs.setCurrentUser('root')
    try {
      return this.runCommand(args, '')
    } finally {
      this.vfs.setCurrentUser(prevUser)
    }
  }

  private cmdPs(args: string[]): ShellResult {
    const rows = [
      { pid: 1, user: 'root', command: '/sbin/init' },
      { pid: 1842, user: 'ghost', command: 'node server.js' },
      { pid: 1891, user: 'www-data', command: 'nginx: worker' },
      { pid: 2010, user: 'postgres', command: 'postgres: main' },
      { pid: 2105, user: 'redis', command: 'redis-server' },
    ].filter(process => !this.services.terminatedProcesses.has(process.pid))
    if (args.includes('-o')) {
      return {
        stdout: `PID NI CMD\n${rows.map(({ pid, command }) => `${pid} ${this.services.processNiceness.get(pid) ?? 0} ${command}`).join('\n')}\n`,
        stderr: '', exitCode: 0,
      }
    }
    const aux = args.includes('aux') || args.includes('ef')
    if (aux) {
      const detail = rows.map(({ pid, user, command }) => {
        const stopped = this.services.stoppedProcesses.has(pid)
        const stat = stopped ? 'T' : pid === 1 ? 'Ss' : 'S'
        const cpu = pid === 1842 ? '0.5' : pid === 1891 ? '0.1' : '0.0'
        const mem = pid === 1842 ? '2.3' : pid === 2010 ? '1.2' : pid === 1891 ? '0.8' : pid === 2105 ? '0.3' : '0.1'
        return `${user.padEnd(9)} ${String(pid).padStart(5)} ${cpu.padStart(4)} ${mem.padStart(4)} 112340 32400 ?        ${stat.padEnd(4)} 08:00   0:05 ${command}`
      }).join('\n')
      return {
        stdout: `USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n${detail}\n` +
          `ghost      3421  0.0  0.1  12400  4500 pts/0    R+   10:00   0:00 ps aux\n`,
        stderr: '', exitCode: 0
      }
    }
    return {
      stdout: `  PID TTY          TIME CMD\n${String(3422).padStart(5)} pts/0    00:00:00 bash\n${String(3423).padStart(5)} pts/0    00:00:00 ps\n`,
      stderr: '', exitCode: 0
    }
  }

  private cmdTop(args: string[]): ShellResult {
    let batch = false
    for (let index = 0; index < args.length; index++) {
      const arg = args[index]
      if (arg === '-b' && !batch) {
        batch = true
      } else if (arg === '-n') {
        if (args[++index] !== '1') {
          return { stdout: '', stderr: 'top: bounded batch mode requires exactly `-n 1`', exitCode: 1 }
        }
      } else {
        return { stdout: '', stderr: `top: unsupported option '${arg}' in bounded batch mode`, exitCode: 1 }
      }
    }
    const processRows = [
      [1842, 'ghost', 'node', '5.3', '2.3'],
      [2010, 'postgres', 'postgres', '1.2', '1.2'],
      [1891, 'www-data', 'nginx', '0.5', '0.8'],
      [2105, 'redis', 'redis', '0.1', '0.3'],
    ].filter(([pid]) => !this.services.terminatedProcesses.has(pid as number))
    const rows = processRows.map(([pid, user, command, cpu, memory]) =>
      `${String(pid).padStart(5)} ${String(user).padEnd(9)} 20   0  112340  32400   5600 ${this.services.stoppedProcesses.has(pid as number) ? 'T' : 'S'}  ${String(cpu).padStart(4)}  ${String(memory).padStart(4)}   0:05.21 ${command}`,
    ).join('\n')
    const stopped = processRows.filter(([pid]) => this.services.stoppedProcesses.has(pid as number)).length
    const sleeping = processRows.length - stopped
    return {
      stdout:
`top - 10:00:00 up 15 days,  3:42,  1 user,  load average: 0.52, 0.58, 0.59
Tasks: ${processRows.length + 1} total,   1 running,  ${sleeping} sleeping,   ${stopped} stopped,   0 zombie
%Cpu(s):  2.3 us,  1.1 sy,  0.0 ni, 96.1 id,  0.3 wa,  0.0 hi,  0.2 si,  0.0 st
MiB Mem :   8000.0 total,   4000.0 free,   3200.0 used,    800.0 buff/cache
MiB Swap:   2048.0 total,   1950.0 free,     98.0 used.   4500.0 avail Mem

  PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND
${rows}
`,
      stderr: '', exitCode: 0
    }
  }

  private cmdKill(args: string[]): ShellResult {
    const usage = 'kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]'
    if (args.length === 0) return { stdout: '', stderr: usage, exitCode: 1 }
    if (args[0] === '-l') {
      if (args.length === 1) return { stdout: 'HUP INT KILL TERM CONT STOP\n', stderr: '', exitCode: 0, progressEligible: false }
      if (args.length > 2) return { stdout: '', stderr: usage, exitCode: 1 }
      const signalNumbers: Record<string, string> = {
        '1': 'HUP', '2': 'INT', '9': 'KILL', '15': 'TERM', '18': 'CONT', '19': 'STOP',
      }
      const signalNames = Object.fromEntries(Object.entries(signalNumbers).map(([number, name]) => [name, number]))
      const query = args[1].toUpperCase().replace(/^SIG/, '')
      const result = signalNumbers[query] ?? signalNames[query]
      return result
        ? { stdout: `${result}\n`, stderr: '', exitCode: 0, progressEligible: false }
        : { stdout: '', stderr: `kill: ${args[1]}: invalid signal specification`, exitCode: 1 }
    }
    const signalNumbers: Record<string, string> = {
      '0': '0', '1': 'HUP', '2': 'INT', '9': 'KILL', '15': 'TERM', '18': 'CONT', '19': 'STOP',
    }
    const supportedSignals = new Set(['0', 'HUP', 'INT', 'KILL', 'TERM', 'CONT', 'STOP'])
    let signal = 'TERM'
    const targets: string[] = []
    for (let index = 0; index < args.length; index++) {
      const arg = args[index]
      if (arg === '-s' || arg === '-n' || arg === '--signal') {
        const rawSignal = args[++index]
        if (!rawSignal) return { stdout: '', stderr: usage, exitCode: 1 }
        signal = signalNumbers[rawSignal] ?? rawSignal.toUpperCase().replace(/^SIG/, '')
      } else if (arg.startsWith('--signal=')) {
        const rawSignal = arg.slice('--signal='.length)
        if (!rawSignal) return { stdout: '', stderr: usage, exitCode: 1 }
        signal = signalNumbers[rawSignal] ?? rawSignal.toUpperCase().replace(/^SIG/, '')
      } else if (/^-(?:SIG)?[A-Za-z0-9]+$/.test(arg)) {
        const rawSignal = arg.slice(1)
        signal = signalNumbers[rawSignal] ?? rawSignal.toUpperCase().replace(/^SIG/, '')
      } else {
        targets.push(arg)
      }
    }
    if (!supportedSignals.has(signal)) return { stdout: '', stderr: `kill: ${signal}: invalid signal specification`, exitCode: 1 }
    if (targets.length === 0) return { stdout: '', stderr: usage, exitCode: 1 }

    const owners = new Map<number, string>([
      [1, 'root'], [1842, 'ghost'], [1891, 'www-data'], [2010, 'postgres'], [2105, 'redis'],
    ])
    for (const target of targets) {
      if (!/^[1-9]\d*$/.test(target)) return { stdout: '', stderr: `kill: ${target}: arguments must be process or job IDs`, exitCode: 1 }
      const pid = Number(target)
      if (pid === 1) return { stdout: '', stderr: `kill: killing pid ${pid} (init) is not allowed`, exitCode: 1 }
      const owner = owners.get(pid)
      if (!owner || this.services.terminatedProcesses.has(pid)) {
        return { stdout: '', stderr: `kill: (${pid}) - No such process`, exitCode: 1 }
      }
      if (this.vfs.getCurrentUser() !== 'root' && owner !== this.vfs.getCurrentUser()) {
        return { stdout: '', stderr: `kill: (${pid}) - Operation not permitted`, exitCode: 1 }
      }
      if (signal === '0') continue
      if (signal === 'STOP') this.services.stoppedProcesses.add(pid)
      else if (signal === 'CONT') this.services.stoppedProcesses.delete(pid)
      else {
        this.services.stoppedProcesses.delete(pid)
        this.services.terminatedProcesses.add(pid)
      }
    }
    return {
      stdout: '',
      stderr: '',
      exitCode: 0,
      progressEligible: signal !== '0',
      ...(signal === 'TERM' ? { successfulCommands: [`kill -TERM ${targets.join(' ')}`] } : {}),
    }
  }

  private cmdPgrep(args: string[], cmd: string): ShellResult {
    const name = args.filter(arg => !arg.startsWith('-')).at(-1)
    if (!name) return { stdout: '', stderr: '', exitCode: 1 }
    const procs: Record<string, string> = { node: '1842', nginx: '1891', postgres: '2010', redis: '2105' }
    const pid = procs[name]
    const runningPid = pid && !this.services.terminatedProcesses.has(Number(pid)) ? pid : ''
    if (cmd === 'pkill') {
      if (!runningPid) return { stdout: '', stderr: 'pkill: no process found', exitCode: 1 }
      const signal = args.find(arg => /^-(?:SIG)?[A-Za-z0-9]+$/.test(arg))
      const killed = this.cmdKill([...(signal ? [signal] : []), runningPid])
      return killed.exitCode === 0 ? killed : { ...killed, stderr: killed.stderr.replace(/^kill:/, 'pkill:') }
    }
    return { stdout: runningPid ? runningPid + '\n' : '', stderr: runningPid ? '' : 'pgrep: no process found', exitCode: runningPid ? 0 : 1 }
  }

  private cmdNice(args: string[], stdin: string): ShellResult {
    let priority = 10
    let commandIndex = 0
    if (args[0] === '-n') { priority = Number(args[1]); commandIndex = 2 }
    if (!Number.isInteger(priority) || priority < -20 || priority > 19) return { stdout: '', stderr: 'nice: invalid adjustment', exitCode: 1 }
    if (priority < 0 && this.vfs.getCurrentUser() !== 'root') return { stdout: '', stderr: 'nice: cannot set niceness: Permission denied', exitCode: 1 }
    const command = args.slice(commandIndex)
    if (command.length === 0) return { stdout: '', stderr: 'nice: a command must be given', exitCode: 1 }
    return this.runCommand(command, stdin)
  }

  private cmdRenice(args: string[]): ShellResult {
    const priority = Number(args[0])
    const pidIndex = args.indexOf('-p')
    const pid = Number(pidIndex >= 0 ? args[pidIndex + 1] : args[1])
    if (!Number.isInteger(priority) || priority < -20 || priority > 19 || !Number.isInteger(pid)) return { stdout: '', stderr: 'renice: invalid priority or process id', exitCode: 1 }
    const previous = this.services.terminatedProcesses.has(pid) ? undefined : this.services.processNiceness.get(pid)
    if (previous === undefined) return { stdout: '', stderr: `renice: failed to get priority for ${pid}: No such process`, exitCode: 1 }
    if (this.vfs.getCurrentUser() !== 'root' && (pid !== 1842 || priority < previous)) return { stdout: '', stderr: 'renice: failed to set priority: Permission denied', exitCode: 1 }
    this.services.processNiceness.set(pid, priority)
    return { stdout: `${pid} (process ID) old priority ${previous}, new priority ${priority}\n`, stderr: '', exitCode: 0 }
  }

  private cmdNohup(args: string[], stdin: string): ShellResult {
    if (args.length === 0) return { stdout: '', stderr: 'nohup: missing operand', exitCode: 125 }
    const result = this.runCommand(args, stdin)
    if (result.stdout) {
      const written = this.vfs.writeFile('nohup.out', this.state.cwd, result.stdout, true)
      if (written.error) return { stdout: '', stderr: written.error, exitCode: 1 }
    }
    return { stdout: '', stderr: `nohup: input ignored; output appended to 'nohup.out'\n${result.stderr}`, exitCode: result.exitCode }
  }

  private cmdStrace(args: string[], stdin: string): ShellResult {
    if (args.includes('-p')) return { stdout: '', stderr: 'strace: attaching to processes is disabled', exitCode: 1 }
    let outputFile = ''
    const command: string[] = []
    for (let index = 0; index < args.length; index++) {
      const arg = args[index]
      if (arg === '-o') {
        outputFile = args[++index] ?? ''
        if (!outputFile) return { stdout: '', stderr: 'strace: option requires an argument -- o', exitCode: 1 }
      } else if (arg === '-e') {
        if (!args[++index]) return { stdout: '', stderr: 'strace: option requires an argument -- e', exitCode: 1 }
      } else if (arg === '-f' || arg.startsWith('-e')) {
        continue
      } else if (arg.startsWith('-')) {
        return { stdout: '', stderr: `strace: unsupported option '${arg}'`, exitCode: 1 }
      } else {
        command.push(...args.slice(index))
        break
      }
    }
    if (command.length === 0) return { stdout: '', stderr: 'strace: must have PROG', exitCode: 1 }
    if (outputFile) {
      const opened = this.vfs.writeFile(outputFile, this.state.cwd, '')
      if (opened.error) return { stdout: '', stderr: opened.error, exitCode: 1 }
    }
    const result = this.runCommand(command, stdin)
    const trace = `execve("/usr/bin/${command[0]}", ["${command.join('", "')}"]) = 0\nwrite(1, ..., ${result.stdout.length}) = ${result.stdout.length}\nexit_group(${result.exitCode}) = ?\n+++ exited with ${result.exitCode} +++\n`
    if (outputFile) {
      const written = this.vfs.writeFile(outputFile, this.state.cwd, trace)
      if (written.error) return { stdout: result.stdout, stderr: written.error, exitCode: 1 }
      return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode }
    }
    return { stdout: result.stdout, stderr: trace + result.stderr, exitCode: result.exitCode }
  }

  private cmdDf(args: string[]): ShellResult {
    const paths: string[] = []
    let optionsEnded = false
    for (const arg of args) {
      if (!optionsEnded && arg === '--') {
        optionsEnded = true
      } else if (!optionsEnded && arg.startsWith('-') && arg !== '-') {
        if (!/^-[hHTiPk]+$/.test(arg)) return { stdout: '', stderr: `df: invalid option '${arg}'`, exitCode: 1 }
      } else {
        paths.push(arg)
      }
    }
    for (const path of paths) {
      const stat = this.vfs.stat(path, this.state.cwd)
      if (!stat.node) {
        return {
          stdout: '',
          stderr: `df: ${path}: ${stat.error?.includes('Permission denied') ? 'Permission denied' : 'No such file or directory'}`,
          exitCode: 1,
        }
      }
    }
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
    let human = false
    let summarize = false
    let all = false
    let optionsEnded = false
    const paths: string[] = []
    for (const arg of args) {
      if (!optionsEnded && arg === '--') {
        optionsEnded = true
      } else if (!optionsEnded && arg.startsWith('-') && arg !== '-') {
        for (const option of arg.slice(1)) {
          if (!'hsa'.includes(option)) return { stdout: '', stderr: `du: invalid option -- '${option}'`, exitCode: 1 }
          if (option === 'h') human = true
          else if (option === 's') summarize = true
          else if (option === 'a') all = true
        }
      } else {
        paths.push(arg)
      }
    }
    if (summarize && all) return { stdout: '', stderr: 'du: options -s and -a are mutually exclusive', exitCode: 1 }
    if (paths.length === 0) paths.push('.')
    let stdout = ''
    let visited = 0
    const render = (size: number) => human ? formatSize(size) : String(Math.ceil(size / 1024))
    const measure = (path: string, depth: number): { size: number; error?: string } => {
      if (depth > 20 || ++visited > 1000) return { size: 0, error: 'du: traversal limit exceeded' }
      const stat = this.vfs.stat(path, this.state.cwd)
      if (!stat.node) {
        const reason = stat.error?.includes('Permission denied') ? 'Permission denied' : 'No such file or directory'
        return { size: 0, error: `du: cannot access '${path}': ${reason}` }
      }
      if (stat.node.type !== 'directory') {
        if (all) stdout += `${render(stat.node.size)}\t${path}\n`
        return { size: stat.node.size }
      }
      const listed = this.vfs.listDirectory(path, this.state.cwd)
      if (listed.error) return { size: 0, error: listed.error.replace(/^ls:/, 'du:') }
      let total = 0
      for (const entry of listed.entries) {
        const child = `${path.replace(/\/+$/g, '')}/${entry.name}`
        const result = measure(child, depth + 1)
        if (result.error) return result
        total += result.size
      }
      if (!summarize && path !== paths[0]) stdout += `${render(total)}\t${path}\n`
      return { size: total }
    }
    for (const path of paths) {
      const result = measure(path, 0)
      if (result.error) return { stdout, stderr: result.error, exitCode: 1 }
      stdout += `${render(result.size)}\t${path}\n`
    }
    return { stdout, stderr: '', exitCode: 0 }
  }

  private cmdCurl(args: string[]): ShellResult {
    const urlText = args.find(arg => /^https?:\/\//.test(arg))
    if (!urlText) return { stdout: '', stderr: 'curl: no URL specified', exitCode: 2 }
    let url: URL
    try { url = new URL(urlText) } catch { return { stdout: '', stderr: `curl: (3) URL rejected: ${urlText}`, exitCode: 3 } }
    const knownHosts = new Set(['localhost', '127.0.0.1', 'neonmall-server', 'neonmall.local'])
    if (!knownHosts.has(url.hostname)) {
      return { stdout: '', stderr: `curl: (6) Could not resolve host: ${url.hostname}`, exitCode: 6 }
    }
    let body = '<!DOCTYPE html><html><head><title>NeonMall</title></head><body><h1>NeonMall Server</h1></body></html>'
    let contentType = 'text/html; charset=utf-8'
    if (url.pathname === '/health') {
      body = '{"status":"ok","uptime":15420,"version":"1.2.0"}\n'
      contentType = 'application/json'
    } else if (url.pathname.includes('/api')) {
      body = '{"message":"API response","status":200}\n'
      contentType = 'application/json'
    }
    if (args.includes('-I') || args.includes('--head')) {
      return {
        stdout: `HTTP/1.1 200 OK\r\nContent-Type: ${contentType}\r\nContent-Length: ${new TextEncoder().encode(body).length}\r\nConnection: close\r\n\r\n`,
        stderr: '',
        exitCode: 0,
      }
    }
    return { stdout: body, stderr: '', exitCode: 0 }
  }

  private cmdPing(args: string[]): ShellResult {
    const host = args[0]
    if (!host) return { stdout: '', stderr: 'ping: missing host operand', exitCode: 1 }
    return {
      stdout: `PING ${host} (127.0.0.1) 56(84) bytes of data.\n64 bytes from ${host}: icmp_seq=1 ttl=64 time=0.052 ms\n64 bytes from ${host}: icmp_seq=2 ttl=64 time=0.048 ms\n\n--- ${host} ping statistics ---\n2 packets transmitted, 2 received, 0% packet loss, time 1001ms\n`,
      stderr: '', exitCode: 0
    }
  }

  private cmdRsync(args: string[]): ShellResult {
    const flags = new Set<string>()
    const operands: string[] = []
    let parsingOptions = true
    for (const arg of args) {
      if (parsingOptions && arg === '--') {
        parsingOptions = false
      } else if (parsingOptions && arg === '--dry-run') {
        flags.add('n')
      } else if (parsingOptions && /^-[^-]/.test(arg)) {
        for (const flag of arg.slice(1)) {
          if (!['a', 'r', 'v', 'n', 'z'].includes(flag)) {
            return { stdout: '', stderr: `rsync: unsupported option '-${flag}'`, exitCode: 1 }
          }
          flags.add(flag)
        }
      } else {
        operands.push(arg)
      }
    }
    if (operands.length !== 2) return { stdout: '', stderr: 'rsync: source and destination are required', exitCode: 1 }
    const [source, destination] = operands
    if (source.includes(':') || destination.includes(':')) return { stdout: '', stderr: 'rsync: remote transport is not modeled; use local VFS paths', exitCode: 1 }
    const sourceNode = this.vfs.stat(source, this.state.cwd).node
    if (!sourceNode) return { stdout: '', stderr: `rsync: link_stat '${source}' failed`, exitCode: 23 }
    if (flags.has('n')) return { stdout: `${source}\n`, stderr: '', exitCode: 0 }
    const copied = this.vfs.copy(
      source,
      destination,
      this.state.cwd,
      flags.has('a') || flags.has('r'),
      flags.has('a'),
    )
    if (copied.error) return { stdout: '', stderr: copied.error, exitCode: 23 }
    return { stdout: flags.has('v') ? `${source}\n` : '', stderr: '', exitCode: 0 }
  }

  private parseRemotePath(value: string): { user: string; host: string; path: string } | null {
    const match = value.match(/^(?:([^@/:]+)@)?([^/:]+):(.+)$/)
    return match ? { user: match[1] || this.vfs.getCurrentUser(), host: match[2], path: match[3] } : null
  }

  private cmdScp(args: string[]): ShellResult {
    const recursive = args.includes('-r')
    const operands = args.filter(arg => !arg.startsWith('-'))
    if (operands.length !== 2) return { stdout: '', stderr: 'scp: source and destination are required', exitCode: 1 }
    const [source, destination] = operands
    const remoteSource = this.parseRemotePath(source)
    const remoteDestination = this.parseRemotePath(destination)
    if (remoteSource && remoteDestination) return { stdout: '', stderr: 'scp: remote-to-remote copies are disabled', exitCode: 1 }
    const remote = remoteSource ?? remoteDestination
    if (remote && !['neonmall-server', 'localhost', '127.0.0.1', '10.0.0.5'].includes(remote.host)) {
      return { stdout: '', stderr: `ssh: Could not resolve hostname ${remote.host}`, exitCode: 255 }
    }
    if (remote && remote.user !== 'ghost') {
      return { stdout: '', stderr: `scp: ${remote.user}@${remote.host}: Permission denied`, exitCode: 1 }
    }
    if (remoteDestination) {
      const stat = this.vfs.stat(source, this.state.cwd)
      if (!stat.node) return { stdout: '', stderr: `scp: ${source}: No such file or directory`, exitCode: 1 }
      if (stat.node.type === 'directory') return { stdout: '', stderr: recursive ? 'scp: recursive remote directory transfer is not modeled' : `scp: ${source}: not a regular file`, exitCode: 1 }
      const read = this.vfs.readFile(source, this.state.cwd)
      if (read.error) return { stdout: '', stderr: read.error, exitCode: 1 }
      if (read.content.length > 1024 * 1024) return { stdout: '', stderr: 'scp: file exceeds simulator limit', exitCode: 1 }
      this.services.remoteFiles.set(`${remoteDestination.user}@${remoteDestination.host}:${remoteDestination.path}`, read.content)
      return { stdout: '', stderr: '', exitCode: 0 }
    }
    if (remoteSource) {
      const content = this.services.remoteFiles.get(`${remoteSource.user}@${remoteSource.host}:${remoteSource.path}`)
      if (content === undefined) return { stdout: '', stderr: `scp: ${remoteSource.path}: No such file or directory`, exitCode: 1 }
      const written = this.vfs.writeFile(destination, this.state.cwd, content)
      return written.error ? { stdout: '', stderr: written.error, exitCode: 1 } : { stdout: '', stderr: '', exitCode: 0 }
    }
    const copied = this.vfs.copy(source, destination, this.state.cwd, recursive)
    return copied.error ? { stdout: '', stderr: copied.error, exitCode: 1 } : { stdout: '', stderr: '', exitCode: 0 }
  }


  // === PACKAGE MANAGEMENT ===

  private cmdApt(args: string[]): ShellResult {
    const subcommand = args[0]
    if (subcommand === 'search') {
      const query = (args[1] ?? '').toLowerCase()
      if (!query) return { stdout: '', stderr: 'apt: search requires a query', exitCode: 1 }
      const rows = [...this.services.systemPackages.entries()].filter(([name, pkg]) =>
        name.includes(query) || pkg.description.toLowerCase().includes(query))
      return { stdout: rows.map(([name, pkg]) => `${name}/jammy ${pkg.version} amd64\n  ${pkg.description}`).join('\n') + (rows.length ? '\n' : ''), stderr: '', exitCode: 0 }
    }
    if (subcommand === 'show') {
      const name = args[1]
      const pkg = this.services.systemPackages.get(name)
      if (!pkg) return { stdout: '', stderr: `E: No packages found for ${name}`, exitCode: 100 }
      return { stdout: `Package: ${name}\nVersion: ${pkg.version}\nDescription: ${pkg.description}\n`, stderr: '', exitCode: 0 }
    }
    if (subcommand === 'list' && args.includes('--installed')) {
      const rows = [...this.services.systemPackages.entries()].filter(([, pkg]) => pkg.installed)
      return { stdout: `Listing... Done\n${rows.map(([name, pkg]) => `${name}/jammy,now ${pkg.version} amd64 [installed]`).join('\n')}\n`, stderr: '', exitCode: 0 }
    }
    return { stdout: '', stderr: `apt: '${subcommand ?? ''}' is disabled in the browser simulator; use search/show/list --installed`, exitCode: 100 }
  }

  private cmdDpkg(args: string[]): ShellResult {
    if (args[0] === '-s') {
      const name = args[1]
      const pkg = this.services.systemPackages.get(name)
      if (!pkg?.installed) return { stdout: '', stderr: `dpkg-query: package '${name}' is not installed`, exitCode: 1 }
      return { stdout: `Package: ${name}\nStatus: install ok installed\nVersion: ${pkg.version}\nDescription: ${pkg.description}\n`, stderr: '', exitCode: 0 }
    }
    if (args[0] === '-l') {
      const query = args[1]?.replace(/\*/g, '') ?? ''
      const rows = [...this.services.systemPackages.entries()].filter(([name]) => name.includes(query))
      return { stdout: `Desired=Unknown/Install/Remove/Purge/Hold\n||/ Name           Version\n${rows.map(([name, pkg]) => `${pkg.installed ? 'ii' : 'un'}  ${name.padEnd(14)} ${pkg.version}`).join('\n')}\n`, stderr: '', exitCode: 0 }
    }
    return { stdout: '', stderr: 'dpkg: only read-only -s and -l queries are supported', exitCode: 2 }
  }

  private cmdNpm(args: string[]): ShellResult {
    const sub = args[0] || ''
    const pkgFile = this.vfs.readFile('package.json', this.state.cwd)
    let pkg: Record<string, unknown> = {}
    if (!pkgFile.error) {
      try {
        const parsed = JSON.parse(pkgFile.content)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('package.json must contain an object')
        pkg = parsed as Record<string, unknown>
      } catch {
        return { stdout: '', stderr: 'npm error code EJSONPARSE\nnpm error Invalid package.json\n', exitCode: 1 }
      }
    }
    switch (sub) {
      case 'install':
      case 'i': {
        const pkgs = args.slice(1).filter(a => !a.startsWith('-'))
        if (pkgs.length === 0 && pkgFile.error) {
          return { stdout: '', stderr: 'npm error code ENOENT\nnpm error Could not read package.json\n', exitCode: 254 }
        }
        const packageNames = pkgs.length > 0
          ? pkgs
          : Object.keys({
              ...((pkg.dependencies as Record<string, unknown>) ?? {}),
              ...((pkg.devDependencies as Record<string, unknown>) ?? {}),
            })
        for (const name of packageNames) {
          if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+(?:@[^\s]+)?$/i.test(name)) {
            return { stdout: '', stderr: `npm error Invalid package name "${name}"\n`, exitCode: 1 }
          }
        }
        const nodeModules = this.ensureDirectory('node_modules')
        if (nodeModules.error) return { stdout: '', stderr: `npm error ${nodeModules.error}\n`, exitCode: 1 }
        for (const rawName of packageNames) {
          const name = rawName.replace(/@[^/@]+$/, '')
          const packageDirectory = `node_modules/${name}`
          const created = this.ensureDirectory(packageDirectory)
          if (created.error) return { stdout: '', stderr: `npm error ${created.error}\n`, exitCode: 1 }
          const marker = this.vfs.writeFile(`${packageDirectory}/package.json`, this.state.cwd, JSON.stringify({ name, version: '1.0.0' }, null, 2))
          if (marker.error) return { stdout: '', stderr: `npm error ${marker.error}\n`, exitCode: 1 }
          this.services.installedPackages.push(name)
          this.services.npmPackages.set(name, '1.0.0')
        }
        const lock = this.vfs.writeFile(
          'package-lock.json',
          this.state.cwd,
          JSON.stringify({
            name: pkg.name ?? 'ghost-project',
            version: pkg.version ?? '0.0.0',
            lockfileVersion: 3,
            packages: {
              '': {
                name: pkg.name ?? 'ghost-project',
                version: pkg.version ?? '0.0.0',
                dependencies: pkgs.length > 0
                  ? Object.fromEntries(packageNames.map(name => [name.replace(/@[^/@]+$/, ''), '1.0.0']))
                  : {
                      ...((pkg.dependencies as Record<string, unknown>) ?? {}),
                      ...((pkg.optionalDependencies as Record<string, unknown>) ?? {}),
                    },
                devDependencies: pkgs.length > 0
                  ? {}
                  : ((pkg.devDependencies as Record<string, unknown>) ?? {}),
              },
            },
          }, null, 2),
        )
        if (lock.error) return { stdout: '', stderr: `npm error ${lock.error}\n`, exitCode: 1 }
        return {
          stdout: `added ${packageNames.length} package${packageNames.length === 1 ? '' : 's'}, and audited ${packageNames.length + 1} package${packageNames.length === 0 ? '' : 's'} in 1s\n\nfound 0 vulnerabilities\n`,
          stderr: '',
          exitCode: 0,
        }
      }
      case 'ci': {
        if (args.length !== 1) {
          return { stdout: '', stderr: `npm error code EUSAGE\nnpm error Unsupported npm ci argument '${args[1]}'\n`, exitCode: 1 }
        }
        if (pkgFile.error) return { stdout: '', stderr: 'npm error code ENOENT\nnpm error Could not read package.json\n', exitCode: 254 }
        const lockFile = this.vfs.readFile('package-lock.json', this.state.cwd)
        if (lockFile.error) {
          return { stdout: '', stderr: 'npm error code EUSAGE\nnpm error The `npm ci` command can only install with an existing package-lock.json\n', exitCode: 1 }
        }
        let lock: Record<string, unknown>
        try {
          const parsed = JSON.parse(lockFile.content)
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid lockfile')
          lock = parsed as Record<string, unknown>
        } catch {
          return { stdout: '', stderr: 'npm error code EJSONPARSE\nnpm error Invalid package-lock.json\n', exitCode: 1 }
        }
        if (!Number.isInteger(lock.lockfileVersion) || ![1, 2, 3].includes(lock.lockfileVersion as number)) {
          return { stdout: '', stderr: 'npm error code EUSAGE\nnpm error Invalid or unsupported lockfileVersion\n', exitCode: 1 }
        }
        const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
          Boolean(value && typeof value === 'object' && !Array.isArray(value))
        const dependencyFields = ['dependencies', 'devDependencies', 'optionalDependencies'] as const
        for (const field of dependencyFields) {
          const value = pkg[field]
          if (
            value !== undefined
            && (
              !isPlainRecord(value)
              || Object.entries(value).some(([name, version]) => !name || typeof version !== 'string' || !version)
            )
          ) {
            return { stdout: '', stderr: `npm error code EJSONPARSE\nnpm error package.json ${field} must be an object of version strings\n`, exitCode: 1 }
          }
        }
        if (
          pkg.name !== undefined && typeof pkg.name !== 'string'
          || pkg.version !== undefined && typeof pkg.version !== 'string'
          || lock.name !== undefined && typeof lock.name !== 'string'
          || lock.version !== undefined && typeof lock.version !== 'string'
        ) {
          return { stdout: '', stderr: 'npm error code EJSONPARSE\nnpm error Invalid package or lockfile name/version metadata\n', exitCode: 1 }
        }
        const lockfileVersion = lock.lockfileVersion as number
        if (lockfileVersion >= 2 && !isPlainRecord(lock.packages)) {
          return { stdout: '', stderr: 'npm error code EUSAGE\nnpm error v2/v3 lockfiles require a packages object\n', exitCode: 1 }
        }
        const packages = isPlainRecord(lock.packages) ? lock.packages : {}
        const lockHasRootPackage = Object.prototype.hasOwnProperty.call(packages, '')
        if (lockfileVersion >= 2 && (!lockHasRootPackage || !isPlainRecord(packages['']))) {
          return { stdout: '', stderr: 'npm error code EUSAGE\nnpm error package-lock.json is missing its root package\n', exitCode: 1 }
        }
        const rootPackage = isPlainRecord(packages['']) ? packages[''] : {}
        for (const field of dependencyFields) {
          const value = rootPackage[field]
          if (
            value !== undefined
            && (
              !isPlainRecord(value)
              || Object.entries(value).some(([name, version]) => !name || typeof version !== 'string' || !version)
            )
          ) {
            return { stdout: '', stderr: `npm error code EUSAGE\nnpm error package-lock root ${field} must be an object of version strings\n`, exitCode: 1 }
          }
        }
        if (
          (lock.name !== undefined && pkg.name !== undefined && lock.name !== pkg.name)
          || (lock.version !== undefined && pkg.version !== undefined && lock.version !== pkg.version)
          || (rootPackage.name !== undefined && pkg.name !== undefined && rootPackage.name !== pkg.name)
          || (rootPackage.version !== undefined && pkg.version !== undefined && rootPackage.version !== pkg.version)
        ) {
          return { stdout: '', stderr: 'npm error code EUSAGE\nnpm error package.json and package-lock.json are out of sync\n', exitCode: 1 }
        }
        const manifestRuntimeDependencies = {
          ...((pkg.dependencies as Record<string, unknown>) ?? {}),
          ...((pkg.optionalDependencies as Record<string, unknown>) ?? {}),
        }
        const manifestDevDependencies = ((pkg.devDependencies as Record<string, unknown>) ?? {})
        const manifestDependencies = { ...manifestRuntimeDependencies, ...manifestDevDependencies }
        const lockedRootDependencies = (rootPackage.dependencies && typeof rootPackage.dependencies === 'object' && !Array.isArray(rootPackage.dependencies))
          ? rootPackage.dependencies as Record<string, unknown>
          : {}
        const lockedRootDevDependencies = (rootPackage.devDependencies && typeof rootPackage.devDependencies === 'object' && !Array.isArray(rootPackage.devDependencies))
          ? rootPackage.devDependencies as Record<string, unknown>
          : {}
        const lockedRootOptionalDependencies = (rootPackage.optionalDependencies && typeof rootPackage.optionalDependencies === 'object' && !Array.isArray(rootPackage.optionalDependencies))
          ? rootPackage.optionalDependencies as Record<string, unknown>
          : {}
        if (lock.dependencies !== undefined && !isPlainRecord(lock.dependencies)) {
          return { stdout: '', stderr: 'npm error code EUSAGE\nnpm error package-lock dependencies must be an object\n', exitCode: 1 }
        }
        const legacyDependencies = isPlainRecord(lock.dependencies) ? lock.dependencies : {}
        if (
          (lock.lockfileVersion as number) === 1
          && Object.entries(legacyDependencies).some(([, entry]) =>
            !isPlainRecord(entry) || typeof entry.version !== 'string' || !entry.version)
        ) {
          return { stdout: '', stderr: 'npm error code EUSAGE\nnpm error legacy lock dependencies require non-empty versions\n', exitCode: 1 }
        }
        const mismatched = Object.entries(manifestDependencies).filter(([name, version]) => {
          if (!lockHasRootPackage) return !(name in legacyDependencies)
          const lockedVersion = name in manifestDevDependencies
            ? lockedRootDevDependencies[name]
            : name in ((pkg.optionalDependencies as Record<string, unknown>) ?? {})
              ? (lockedRootOptionalDependencies[name] ?? lockedRootDependencies[name])
              : lockedRootDependencies[name]
          return typeof version !== 'string' || lockedVersion !== version
        }).map(([name]) => name)
        const lockedManifestNames = new Set([
          ...Object.keys(lockedRootDependencies),
          ...Object.keys(lockedRootDevDependencies),
          ...Object.keys(lockedRootOptionalDependencies),
        ])
        const unexpected = lockHasRootPackage
          ? [...lockedManifestNames].filter(name => !(name in manifestDependencies))
          : Object.keys(legacyDependencies).filter(name => !(name in manifestDependencies))
        if (mismatched.length > 0 || unexpected.length > 0) {
          const details = [
            ...mismatched.map(name => `${name} missing or mismatched in lockfile`),
            ...unexpected.map(name => `${name} missing from package.json`),
          ]
          return {
            stdout: '',
            stderr: `npm error code EUSAGE\nnpm error package.json and package-lock.json are out of sync: ${details.join(', ')}\n`,
            exitCode: 1,
          }
        }
        const existingNodeModules = this.vfs.stat('node_modules', this.state.cwd).node
        if (existingNodeModules) {
          if (existingNodeModules.type !== 'directory') {
            return { stdout: '', stderr: 'npm error node_modules is not a directory\n', exitCode: 1 }
          }
          const removed = this.vfs.deleteDirectory('node_modules', this.state.cwd, true)
          if (removed.error) return { stdout: '', stderr: `npm error ${removed.error}\n`, exitCode: 1 }
        }
        const created = this.ensureDirectory('node_modules')
        if (created.error) return { stdout: '', stderr: `npm error ${created.error}\n`, exitCode: 1 }
        const snapshot = this.vfs.writeFile(
          'node_modules/.package-lock.json',
          this.state.cwd,
          JSON.stringify({ lockfileVersion: lock.lockfileVersion, installed: Object.keys(manifestDependencies).sort() }, null, 2),
        )
        if (snapshot.error) return { stdout: '', stderr: `npm error ${snapshot.error}\n`, exitCode: 1 }
        for (const name of Object.keys(manifestDependencies)) this.services.npmPackages.set(name, String(lockedRootDependencies[name] ?? 'locked'))
        return { stdout: `added ${Object.keys(manifestDependencies).length} packages in 1s\n`, stderr: '', exitCode: 0 }
      }
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
      case 'list-timers': {
        if (args.slice(1).some(arg => !['--all', '--no-pager'].includes(arg))) {
          return { stdout: '', stderr: 'systemctl list-timers: unsupported option', exitCode: 1 }
        }
        return {
          stdout: 'NEXT                        LEFT       LAST                        PASSED    UNIT                 ACTIVATES\nWed 2024-06-12 02:00:00 UTC  6h left    Tue 2024-06-11 02:00:00 UTC  18h ago   backup.timer         backup.service\nWed 2024-06-12 00:15:00 UTC  4h left    Tue 2024-06-11 00:15:00 UTC  20h ago   health-check.timer   health-check.service\n\n2 timers listed.\n',
          stderr: '',
          exitCode: 0,
        }
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
[    5.678901] Adding 2097148k swap on /dev/sda3
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
      if (args.length !== 1) return { stdout: '', stderr: 'crontab: invalid option combination', exitCode: 1 }
      let stdout = '# m h dom mon dow command\n'
      this.services.cronJobs.forEach((cmd, schedule) => { stdout += `${schedule} ${cmd}\n` })
      return { stdout, stderr: '', exitCode: 0 }
    }
    if (edit) {
      return {
        stdout: '',
        stderr: 'crontab: interactive editor persistence is unavailable; install a validated file with `crontab FILE`\n',
        exitCode: 1,
      }
    }
    if (args[0] === '-r') {
      if (args.length !== 1) return { stdout: '', stderr: 'crontab: invalid option combination', exitCode: 1 }
      this.services.cronJobs.clear()
      return { stdout: '', stderr: '', exitCode: 0 }
    }
    if (args.length === 0 || args[0] === '-') {
      return {
        stdout: '',
        stderr: 'crontab: interactive stdin is unavailable; use `crontab FILE`\n',
        exitCode: 1,
      }
    }
    if (args.length !== 1 || args[0].startsWith('-')) {
      return { stdout: '', stderr: 'Usage: crontab [-l|-r] | crontab FILE', exitCode: 1 }
    }
    const source = this.vfs.readFile(args[0], this.state.cwd)
    if (source.error) return { stdout: '', stderr: `crontab: ${args[0]}: No such file or unreadable`, exitCode: 1 }
    const nextJobs = new Map<string, string>()
    const validCronField = (field: string, minimum: number, maximum: number) => {
      return field.split(',').every(part => {
        const [base, stepText, ...extra] = part.split('/')
        if (extra.length > 0) return false
        if (stepText !== undefined && (!/^\d+$/.test(stepText) || Number(stepText) < 1)) return false
        if (base === '*') return true
        const bounds = base.split('-')
        if (bounds.length > 2 || bounds.some(value => !/^\d+$/.test(value))) return false
        const start = Number(bounds[0])
        const end = bounds.length === 2 ? Number(bounds[1]) : start
        return start >= minimum && end <= maximum && start <= end
      })
    }
    const cronRanges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]] as const
    const lines = source.content.split(/\r?\n/)
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const line = lines[lineNumber].trim()
      if (!line || line.startsWith('#')) continue
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) continue
      const fields = line.split(/\s+/)
      if (
        fields.length < 6
        || fields.slice(0, 5).some((field, index) => !validCronField(field, cronRanges[index][0], cronRanges[index][1]))
      ) {
        return {
          stdout: '',
          stderr: `"${args[0]}":${lineNumber + 1}: bad time field\nerrors in crontab file, can't install.\n`,
          exitCode: 1,
        }
      }
      const schedule = fields.slice(0, 5).join(' ')
      const command = fields.slice(5).join(' ')
      if (!command) {
        return {
          stdout: '',
          stderr: `"${args[0]}":${lineNumber + 1}: missing command\nerrors in crontab file, can't install.\n`,
          exitCode: 1,
        }
      }
      if (nextJobs.has(schedule)) {
        return {
          stdout: '',
          stderr: `"${args[0]}":${lineNumber + 1}: duplicate schedule is not representable in this bounded simulator\nerrors in crontab file, can't install.\n`,
          exitCode: 1,
        }
      }
      nextJobs.set(schedule, command)
    }
    if (nextJobs.size === 0) {
      return { stdout: '', stderr: 'crontab: refusing to install an empty schedule; use `crontab -r` to remove it\n', exitCode: 1 }
    }
    this.services.cronJobs = nextJobs
    return { stdout: '', stderr: '', exitCode: 0 }
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
    let makefile = ''
    let dryRun = false
    let silent = false
    const requestedTargets: string[] = []
    for (let index = 0; index < args.length; index++) {
      const arg = args[index]
      if (arg === '-f' || arg === '--file') {
        makefile = args[++index] ?? ''
        if (!makefile) return { stdout: '', stderr: 'make: option requires an argument -- f\n', exitCode: 2 }
      } else if (arg.startsWith('--file=')) {
        makefile = arg.slice('--file='.length)
      } else if (arg === '-n' || arg === '--just-print') {
        dryRun = true
      } else if (arg === '-s' || arg === '--silent') {
        silent = true
      } else if (arg.startsWith('-')) {
        return { stdout: '', stderr: `make: invalid option -- '${arg}'\n`, exitCode: 2 }
      } else if (arg.includes('=')) {
        continue
      } else {
        requestedTargets.push(arg)
      }
    }
    if (!makefile) {
      makefile = ['GNUmakefile', 'makefile', 'Makefile'].find(candidate => this.vfs.stat(candidate, this.state.cwd).node?.type === 'file') ?? ''
    }
    if (!makefile) return { stdout: '', stderr: 'make: *** No targets specified and no makefile found.  Stop.\n', exitCode: 2 }
    const source = this.vfs.readFile(makefile, this.state.cwd)
    if (source.error) return { stdout: '', stderr: `make: ${makefile}: No such file or directory\n`, exitCode: 2 }

    const rules = new Map<string, { prerequisites: string[]; recipes: string[] }>()
    let activeTargets: string[] = []
    for (const line of source.content.split(/\r?\n/)) {
      if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue
      if (/^\t/.test(line)) {
        if (activeTargets.length === 0) return { stdout: '', stderr: `${makefile}: recipe commences before first target.  Stop.\n`, exitCode: 2 }
        for (const target of activeTargets) rules.get(target)!.recipes.push(line.slice(1))
        continue
      }
      const match = line.match(/^([A-Za-z0-9_./ -]+)\s*:\s*(.*)$/)
      if (!match) {
        activeTargets = []
        continue
      }
      activeTargets = match[1].trim().split(/\s+/).filter(Boolean)
      const [prerequisiteText, ...inlineRecipeParts] = match[2].split(';')
      const prerequisites = prerequisiteText.split(/\s+/).filter(Boolean)
      const inlineRecipe = inlineRecipeParts.join(';').trim()
      for (const target of activeTargets) rules.set(target, {
        prerequisites,
        recipes: inlineRecipe ? [inlineRecipe] : [],
      })
    }
    const defaultTarget = [...rules.keys()].find(target => target !== '.PHONY')
    const targets = requestedTargets.length > 0 ? requestedTargets : defaultTarget ? [defaultTarget] : []
    if (targets.length === 0) return { stdout: '', stderr: 'make: *** No targets specified and no targets found.  Stop.\n', exitCode: 2 }
    if (this.makeDepth >= 4) return { stdout: '', stderr: 'make: *** Recursive make depth exceeded.  Stop.\n', exitCode: 2 }

    let stdout = ''
    this.makeDepth++
    try {
      const completedTargets = new Set<string>()
      const activeBuilds = new Set<string>()
      const buildTarget = (target: string): ShellResult | undefined => {
        if (completedTargets.has(target)) return undefined
        if (activeBuilds.has(target)) {
          return { stdout, stderr: `make: Circular dependency involving '${target}'.  Stop.\n`, exitCode: 2 }
        }
        const rule = rules.get(target)
        if (!rule) return { stdout, stderr: `make: *** No rule to make target '${target}'.  Stop.\n`, exitCode: 2 }
        activeBuilds.add(target)
        for (const prerequisite of rule.prerequisites) {
          if (rules.has(prerequisite)) {
            const dependencyFailure = buildTarget(prerequisite)
            if (dependencyFailure) {
              activeBuilds.delete(target)
              return dependencyFailure
            }
          } else if (!this.vfs.stat(prerequisite, this.state.cwd).node) {
            activeBuilds.delete(target)
            return {
              stdout,
              stderr: `make: *** No rule to make target '${prerequisite}', needed by '${target}'.  Stop.\n`,
              exitCode: 2,
            }
          }
        }
        if (rule.recipes.length === 0) {
          if (this.vfs.stat(target, this.state.cwd).node || rule.prerequisites.length > 0) {
            stdout += `make: '${target}' is up to date.\n`
            activeBuilds.delete(target)
            completedTargets.add(target)
            return undefined
          }
          activeBuilds.delete(target)
          return { stdout, stderr: `make: *** Target '${target}' has no runnable recipe.  Stop.\n`, exitCode: 2 }
        }
        for (const rawRecipe of rule.recipes) {
          let recipe = rawRecipe.trim()
          let ignoreFailure = false
          let echoRecipe = !silent
          while (recipe.startsWith('@') || recipe.startsWith('-')) {
            if (recipe[0] === '@') echoRecipe = false
            if (recipe[0] === '-') ignoreFailure = true
            recipe = recipe.slice(1).trimStart()
          }
          if (!recipe) continue
          if (/^(?:env\s+)?make(?:\s|$)/.test(recipe)) {
            activeBuilds.delete(target)
            return { stdout, stderr: 'make: recursive make recipes are not supported in this bounded simulator\n', exitCode: 2 }
          }
          if (echoRecipe) stdout += `${recipe}\n`
          if (dryRun) continue
          const result = this.execute(recipe, 1, false)
          stdout += result.stdout
          if (result.exitCode !== 0 && !ignoreFailure) {
            activeBuilds.delete(target)
            return {
              stdout,
              stderr: `${result.stderr}make: *** [${makefile}: ${target}] Error ${result.exitCode}\n`,
              exitCode: 2,
            }
          }
        }
        activeBuilds.delete(target)
        completedTargets.add(target)
        return undefined
      }
      for (const target of targets) {
        const failure = buildTarget(target)
        if (failure) return failure
      }
      return { stdout, stderr: '', exitCode: 0 }
    } finally {
      this.makeDepth--
    }
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
    if (args[0] === '-m' && args[1] === 'venv') {
      const target = args[2]
      if (!target) return { stdout: '', stderr: 'venv: error: the following arguments are required: ENV_DIR', exitCode: 2 }
      if (this.vfs.stat(target, this.state.cwd).node) return { stdout: '', stderr: `venv: '${target}' already exists`, exitCode: 1 }
      const parts = this.vfs.resolvePath(target, this.state.cwd)
      for (let length = 1; length <= parts.length; length++) {
        const path = `/${parts.slice(0, length).join('/')}`
        if (!this.vfs.stat(path, []).node) {
          const created = this.vfs.createDirectory(path, [])
          if (created.error) return { stdout: '', stderr: created.error, exitCode: 1 }
        }
      }
      const root = `/${parts.join('/')}`
      for (const directory of [`${root}/bin`, `${root}/lib`]) {
        const created = this.vfs.createDirectory(directory, [])
        if (created.error) return { stdout: '', stderr: created.error, exitCode: 1 }
      }
      const files = [
        [`${root}/pyvenv.cfg`, 'home = /usr/bin\ninclude-system-site-packages = false\nversion = 3.10.12\n'],
        [`${root}/bin/python`, '#!/bin/sh\n# GhostOS virtual Python shim\n'],
        [`${root}/bin/activate`, `VIRTUAL_ENV=${root}\nexport VIRTUAL_ENV\n`],
      ]
      for (const [path, content] of files) {
        const written = this.vfs.writeFile(path, [], content)
        if (written.error) return { stdout: '', stderr: written.error, exitCode: 1 }
      }
      const executable = this.vfs.chmod(`${root}/bin/python`, [], '755')
      if (executable.error) return { stdout: '', stderr: executable.error, exitCode: 1 }
      return { stdout: '', stderr: '', exitCode: 0 }
    }
    // pip subcommands
    if (args[0] === '-m' && args[1] === 'pip') {
      return this.cmdPip(args.slice(2))
    }
    if (args.length > 0 && !args[0].startsWith('-')) {
      const file = args[0]
      const res = this.vfs.readFile(file, this.state.cwd)
      if (res.error) return { stdout: '', stderr: `python3: ${res.error}`, exitCode: 1 }
      return { stdout: `Executed ${file}\n`, stderr: '', exitCode: 0 }
    }
    return { stdout: '', stderr: '', exitCode: 0, mode: 'python' }
  }

  private cmdPip(args: string[]): ShellResult {
    const subcommand = args[0]
    if (subcommand === 'freeze') {
      const rows = [...this.services.pythonPackages.entries()]
        .filter(([name]) => name !== 'pip')
        .sort(([left], [right]) => left.localeCompare(right))
      return { stdout: rows.map(([name, version]) => `${name}==${version}`).join('\n') + '\n', stderr: '', exitCode: 0 }
    }
    if (subcommand === 'list') {
      const rows = [...this.services.pythonPackages.entries()].sort(([left], [right]) => left.localeCompare(right))
      return { stdout: `Package    Version\n---------- -------\n${rows.map(([name, version]) => `${name.padEnd(10)} ${version}`).join('\n')}\n`, stderr: '', exitCode: 0 }
    }
    if (subcommand === 'install') {
      const packages = args.slice(1).filter(arg => !arg.startsWith('-'))
      if (packages.length === 0) return { stdout: '', stderr: 'pip: no requirement specified', exitCode: 1 }
      for (const name of packages) this.services.pythonPackages.set(name, '1.0.0')
      return { stdout: `Successfully installed ${packages.map(name => `${name}-1.0.0`).join(' ')}\n`, stderr: '', exitCode: 0 }
    }
    return { stdout: '', stderr: `pip: unknown command '${subcommand ?? ''}'`, exitCode: 1 }
  }

  private cmdGo(args: string[]): ShellResult {
    const sub = args[0] || ''
    const readModule = () => {
      const moduleFile = this.vfs.readFile('go.mod', this.state.cwd)
      if (moduleFile.error) return { error: 'go: cannot find main module; see `go help modules`' }
      const moduleName = moduleFile.content.match(/^\s*module\s+(\S+)/m)?.[1]
      if (!moduleName) return { error: 'go: errors parsing go.mod: missing module directive' }
      return { moduleName }
    }
    const goSources = (commandArgs: string[]) => {
      const listed = this.vfs.listDirectory('.', this.state.cwd)
      if (listed.error) return { error: listed.error }
      const operands: string[] = []
      for (let index = 0; index < commandArgs.length; index++) {
        const arg = commandArgs[index]
        if (arg === '-o') {
          index++
          continue
        }
        if (arg.startsWith('-')) continue
        operands.push(arg)
      }
      const explicitFiles = operands.filter(operand => operand.endsWith('.go'))
      const unsupportedOperand = operands.find(operand => !operand.endsWith('.go') && !['.', './...'].includes(operand))
      if (unsupportedOperand) return { error: `go: unsupported package operand ${unsupportedOperand}` }
      const fileNames = explicitFiles.length > 0
        ? explicitFiles
        : listed.entries.filter(entry => entry.type === 'file' && entry.name.endsWith('.go')).map(entry => entry.name)
      const sources: { name: string; content: string; packageName: string }[] = []
      for (const fileName of fileNames) {
        const read = this.vfs.readFile(fileName, this.state.cwd)
        if (read.error) return { error: `stat ${fileName}: no such file or directory` }
        const packageName = read.content.match(/^\s*package\s+([A-Za-z_]\w*)/m)?.[1]
        if (
          !packageName
          || !isBoundedGoSource(read.content)
        ) {
          return { error: `${fileName}: syntax error in bounded Go parser` }
        }
        sources.push({ name: fileName, content: read.content, packageName })
      }
      if (sources.length > 0 && new Set(sources.map(source => source.packageName)).size !== 1) {
        return { error: 'found packages with different names in the same directory' }
      }
      return { sources }
    }
    switch (sub) {
      case 'version':
        return { stdout: 'go version go1.21.5 linux/amd64\n', stderr: '', exitCode: 0 }
      case 'run': {
        const invalidOption = args.slice(1).find(arg => arg.startsWith('-'))
        if (invalidOption) return { stdout: '', stderr: `go: unsupported flag ${invalidOption}\n`, exitCode: 2 }
        const files = args.slice(1)
        if (files.length === 0) return { stdout: '', stderr: 'go run: no go files listed\n', exitCode: 1 }
        const sources = goSources(files)
        if (sources.error) return { stdout: '', stderr: `${sources.error}\n`, exitCode: 1 }
        if (!sources.sources || sources.sources.length === 0) return { stdout: '', stderr: 'go run: no go files listed\n', exitCode: 1 }
        if (
          sources.sources.some(source => source.packageName !== 'main')
          || !sources.sources.some(source => /\bfunc\s+main\s*\(/.test(stripCodeLiteralsAndComments(source.content)))
        ) {
          return { stdout: '', stderr: `${files.join(', ')}: syntax error or missing main function\n`, exitCode: 1 }
        }
        const printed = sources.sources
          .map(source => source.content.match(/fmt\.Println\(\s*["'`]([^"'`]*)["'`]\s*\)/)?.[1])
          .find(value => value !== undefined)
        return { stdout: `${printed ?? 'program completed'}\n`, stderr: '', exitCode: 0 }
      }
      case 'build': {
        for (let index = 1; index < args.length; index++) {
          const arg = args[index]
          if (arg === '-o') {
            if (!args[++index]) return { stdout: '', stderr: 'go: flag needs an argument: -o\n', exitCode: 2 }
          } else if (arg.startsWith('-')) {
            return { stdout: '', stderr: `go: unsupported flag ${arg}\n`, exitCode: 2 }
          }
        }
        const module = readModule()
        if (module.error) return { stdout: '', stderr: `${module.error}\n`, exitCode: 1 }
        const sources = goSources(args.slice(1))
        if (sources.error) return { stdout: '', stderr: `${sources.error}\n`, exitCode: 1 }
        if (!sources.sources || sources.sources.length === 0) return { stdout: '', stderr: `no Go files in /${this.state.cwd.join('/')}\n`, exitCode: 1 }
        if (
          sources.sources[0].packageName === 'main'
          && !sources.sources.some(source => /\bfunc\s+main\s*\(/.test(stripCodeLiteralsAndComments(source.content)))
        ) {
          return { stdout: '', stderr: 'runtime.main_main·f: function main is undeclared in the main package\n', exitCode: 1 }
        }
        const outputIndex = args.indexOf('-o')
        if (outputIndex >= 0 && !args[outputIndex + 1]) return { stdout: '', stderr: 'go: flag needs an argument: -o\n', exitCode: 2 }
        const output = outputIndex >= 0
          ? args[outputIndex + 1]
          : module.moduleName!.split('/').filter(Boolean).at(-1) ?? 'app'
        const written = this.writeExecutableAtomically(output, `#!/bin/sh\n# bounded Go build for ${module.moduleName}\n`)
        if (written.error) return { stdout: '', stderr: `${written.error}\n`, exitCode: 1 }
        return { stdout: '', stderr: '', exitCode: 0 }
      }
      case 'test': {
        const invalidOption = args.slice(1).find(arg => arg.startsWith('-'))
        if (invalidOption) return { stdout: '', stderr: `go: unsupported flag ${invalidOption}\n`, exitCode: 2 }
        const module = readModule()
        if (module.error) return { stdout: '', stderr: `${module.error}\n`, exitCode: 1 }
        const sources = goSources(args.slice(1))
        if (sources.error) return { stdout: '', stderr: `${sources.error}\n`, exitCode: 1 }
        if (!sources.sources || sources.sources.length === 0) return { stdout: '', stderr: `no Go files in /${this.state.cwd.join('/')}\n`, exitCode: 1 }
        return { stdout: 'PASS\nok      \t.\t0.023s\n', stderr: '', exitCode: 0 }
      }
      case 'mod': {
        const modSub = args[1] || ''
        switch (modSub) {
          case 'init': {
            const name = args[2]
            if (!name || !/^[A-Za-z0-9._~/-]+$/.test(name)) return { stdout: '', stderr: 'go: malformed module path\n', exitCode: 1 }
            if (this.vfs.stat('go.mod', this.state.cwd).node) return { stdout: '', stderr: `go: /${this.state.cwd.join('/')}/go.mod already exists\n`, exitCode: 1 }
            const written = this.vfs.writeFile('go.mod', this.state.cwd, `module ${name}\n\ngo 1.21\n`)
            if (written.error) return { stdout: '', stderr: `${written.error}\n`, exitCode: 1 }
            return { stdout: `go: creating new go.mod: module ${name}\n`, stderr: '', exitCode: 0 }
          }
          case 'download': {
            const module = readModule()
            if (module.error) return { stdout: '', stderr: `${module.error}\n`, exitCode: 1 }
            return { stdout: 'go: downloading modules...\n', stderr: '', exitCode: 0 }
          }
          case 'tidy': {
            const module = readModule()
            if (module.error) return { stdout: '', stderr: `${module.error}\n`, exitCode: 1 }
            return { stdout: '', stderr: '', exitCode: 0 }
          }
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
    const readProject = () => {
      const manifest = this.vfs.readFile('Cargo.toml', this.state.cwd)
      if (manifest.error) return { error: `error: could not find \`Cargo.toml\` in \`/${this.state.cwd.join('/')}\` or any parent directory` }
      const packageSection = manifest.content.match(/(?:^|\n)\s*\[package\]\s*\r?\n([\s\S]*?)(?=\r?\n\s*\[|$)/)?.[1]
      const name = packageSection?.match(/^\s*name\s*=\s*["']([A-Za-z0-9_-]+)["']/m)?.[1]
      const version = packageSection?.match(/^\s*version\s*=\s*["'](\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?)["']/m)?.[1]
      if (!packageSection || !name || !version) {
        return { error: 'error: failed to parse manifest: [package], package.name, and package.version are required' }
      }
      const main = this.vfs.readFile('src/main.rs', this.state.cwd)
      const library = this.vfs.readFile('src/lib.rs', this.state.cwd)
      if (main.error && library.error) return { error: 'error: no targets specified in the manifest' }
      const source = main.error ? library.content : main.content
      const stripped = stripCodeLiteralsAndComments(source)
      if (
        !isBoundedRustSource(source)
        || !/\b(?:fn|struct|enum|trait|impl|mod)\b/.test(stripped)
        || (!main.error && !/\bfn\s+main\s*\(/.test(stripped))
      ) {
        return { error: `error: could not compile ${name}: syntax error in bounded Rust parser` }
      }
      return { name, source, binary: !main.error }
    }
    const buildProject = (release: boolean) => {
      const project = readProject()
      if (project.error) return { result: { stdout: '', stderr: `${project.error}\n`, exitCode: 101 } as ShellResult }
      const profile = release ? 'release' : 'debug'
      const directory = this.ensureDirectory(`target/${profile}`)
      if (directory.error) return { result: { stdout: '', stderr: `error: ${directory.error}\n`, exitCode: 101 } as ShellResult }
      const artifact = project.binary
        ? `target/${profile}/${project.name}`
        : `target/${profile}/lib${project.name}.rlib`
      const written = project.binary
        ? this.writeExecutableAtomically(artifact, `#!/bin/sh\n# bounded Cargo build for ${project.name}\n`)
        : this.vfs.writeFile(artifact, this.state.cwd, `bounded Rust library for ${project.name}\n`)
      if (written.error) return { result: { stdout: '', stderr: `error: ${written.error}\n`, exitCode: 101 } as ShellResult }
      return { project, artifact }
    }
    switch (sub) {
      case '--version':
        return args.length === 1
          ? { stdout: 'cargo 1.75.0\n', stderr: '', exitCode: 0 }
          : { stdout: '', stderr: `error: unexpected argument '${args[1]}'\n`, exitCode: 1 }
      case 'build': {
        const invalid = args.slice(1).find(arg => arg !== '--release')
        if (invalid) return { stdout: '', stderr: `error: unexpected argument '${invalid}'\n`, exitCode: 1 }
        const release = args.includes('--release')
        const built = buildProject(release)
        if (built.result) return built.result
        return { stdout: `   Compiling ${built.project!.name} v0.1.0 (/${this.state.cwd.join('/')})\n    Finished ${release ? 'release' : 'dev'} profile target(s) in 0.01s\n`, stderr: '', exitCode: 0 }
      }
      case 'test': {
        const invalid = args.slice(1).find(arg => arg !== '--release')
        if (invalid) return { stdout: '', stderr: `error: unexpected argument '${invalid}'\n`, exitCode: 1 }
        const built = buildProject(args.includes('--release'))
        if (built.result) return built.result
        return { stdout: `   Compiling ${built.project!.name} v0.1.0 (/${this.state.cwd.join('/')})\n    Finished test profile target(s) in 0.01s\n\nrunning 0 tests\n\ntest result: ok. 0 passed; 0 failed\n`, stderr: '', exitCode: 0 }
      }
      case 'run': {
        const invalid = args.slice(1).find(arg => arg !== '--release')
        if (invalid) return { stdout: '', stderr: `error: unexpected argument '${invalid}'\n`, exitCode: 1 }
        const project = readProject()
        if (project.error) return { stdout: '', stderr: `${project.error}\n`, exitCode: 101 }
        if (!project.binary) return { stdout: '', stderr: 'error: a bin target must be available for `cargo run`\n', exitCode: 101 }
        const built = buildProject(args.includes('--release'))
        if (built.result) return built.result
        const printed = built.project!.source!.match(/println!\(\s*["']([^"']*)["']\s*\)/)?.[1] ?? 'program completed'
        return { stdout: `   Compiling ${built.project!.name} v0.1.0 (/${this.state.cwd.join('/')})\n    Finished dev profile target(s) in 0.01s\n     Running \`${built.artifact}\`\n${printed}\n`, stderr: '', exitCode: 0 }
      }
      case 'new': {
        const name = args[1]
        if (!name || !/^[A-Za-z0-9_-]+$/.test(name)) return { stdout: '', stderr: 'error: invalid package name', exitCode: 1 }
        if (this.vfs.stat(name, this.state.cwd).node) return { stdout: '', stderr: `error: destination \`${name}\` already exists`, exitCode: 1 }
        const directory = this.ensureDirectory(`${name}/src`)
        if (directory.error) return { stdout: '', stderr: `error: ${directory.error}`, exitCode: 1 }
        const manifest = this.vfs.writeFile(`${name}/Cargo.toml`, this.state.cwd, `[package]\nname = "${name}"\nversion = "0.1.0"\nedition = "2021"\n`)
        const main = manifest.error
          ? manifest
          : this.vfs.writeFile(`${name}/src/main.rs`, this.state.cwd, 'fn main() {\n    println!("Hello, world!");\n}\n')
        if (main.error) {
          this.vfs.deleteDirectory(name, this.state.cwd, true)
          return { stdout: '', stderr: `error: ${main.error}`, exitCode: 1 }
        }
        return { stdout: `     Created binary (application) \`${name}\` package\n`, stderr: '', exitCode: 0 }
      }
      default:
        return { stdout: '', stderr: `cargo: unknown command '${sub}'\n`, exitCode: 1 }
    }
  }

  // === NETWORK TOOLS ===

  private cmdSs(args: string[]): ShellResult {
    const options = new Set<string>()
    for (const arg of args) {
      if (!/^-[tlnps]+$/.test(arg)) {
        return { stdout: '', stderr: `ss: invalid option '${arg}'`, exitCode: 1 }
      }
      for (const option of arg.slice(1)) options.add(option)
    }
    if (args.length === 0) {
      options.add('t')
      options.add('n')
    }
    const signature = [...options].sort().join('')
    if (signature === 's') {
      return {
        stdout: 'Total: 128\nTCP:   42 (estab 2, closed 31, orphaned 0, timewait 9)\nUDP:   6\nRAW:   0\nFRAG:  0\n',
        stderr: '',
        exitCode: 0,
      }
    }
    const tlnp = signature === 'lnpt'
    const tln = signature === 'lnt'
    const tn = signature === 'nt'

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
    return { stdout: '', stderr: 'ss: unsupported option combination\nUsage: ss -tlnp, ss -tln, ss -tn', exitCode: 1 }
  }

  private cmdDig(args: string[]): ShellResult {
    let short = false
    let reverseIp = ''
    const operands: string[] = []
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      if (arg === '+short') {
        short = true
      } else if (arg === '-x') {
        reverseIp = args[++i] ?? ''
        if (!reverseIp) return { stdout: '', stderr: 'dig: option -x requires an address', exitCode: 1 }
      } else if (arg.startsWith('-') || arg.startsWith('+')) {
        return { stdout: '', stderr: `dig: unsupported option '${arg}'`, exitCode: 1 }
      } else {
        operands.push(arg)
      }
    }

    if (reverseIp) {
      if (operands.length > 0) return { stdout: '', stderr: `dig: extra operand '${operands[0]}'`, exitCode: 1 }
      const octets = reverseIp.split('.').map(Number)
      if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
        return { stdout: '', stderr: `dig: '${reverseIp}' is not a valid IPv4 address`, exitCode: 1 }
      }
      if (short) return { stdout: `dns.google.\n`, stderr: '', exitCode: 0 }
      return {
        stdout:
`; <<>> DiG 9.18.12 <<>> -x ${reverseIp}
;; global options: +cmd
;; ->>HEADER<<- opcode: QUERY, status: NOERROR
;; QUESTION SECTION:
;${reverseIp}.in-addr.arpa. IN PTR
;; ANSWER SECTION:
${reverseIp}.in-addr.arpa. 3600 IN PTR dns.google.
`, stderr: '', exitCode: 0
      }
    }

    if (operands.length > 2) return { stdout: '', stderr: `dig: extra operand '${operands[2]}'`, exitCode: 1 }
    const domain = operands[0] || 'example.com'
    if (!/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?|\.)$/.test(domain)) {
      return { stdout: '', stderr: `dig: '${domain}' is not a valid domain name`, exitCode: 1 }
    }
    const recordType = (operands[1] || 'A').toUpperCase()
    if (!['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT'].includes(recordType)) {
      return { stdout: '', stderr: `dig: unknown query type '${recordType}'`, exitCode: 1 }
    }
    if (short) return { stdout: `93.184.216.34\n`, stderr: '', exitCode: 0 }
    return {
      stdout:
`; <<>> DiG 9.18.12 <<>> ${domain} ${recordType}
;; global options: +cmd
;; Got answer:
;; ->>HEADER<<- opcode: QUERY, status: NOERROR
;; QUESTION SECTION:
;${domain}.    IN ${recordType}
;; ANSWER SECTION:
${domain}.  86400  IN  ${recordType}  93.184.216.34
;; Query time: 45 msec
`, stderr: '', exitCode: 0
    }
  }

  private cmdNc(args: string[]): ShellResult {
    let zeroIo = false
    let verbose = false
    let listen = false
    let explicitPort = ''
    let timeoutSeconds = 0
    const operands: string[] = []
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      if (arg === '-p') {
        explicitPort = args[++i] ?? ''
        if (!explicitPort) return { stdout: '', stderr: 'nc: option requires an argument -- p', exitCode: 1 }
      } else if (arg === '-w') {
        const timeout = Number(args[++i])
        if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 300) {
          return { stdout: '', stderr: 'nc: -w requires a timeout from 1 to 300 seconds', exitCode: 1 }
        }
        timeoutSeconds = timeout
      } else if (arg.startsWith('-') && arg !== '-') {
        for (const option of arg.slice(1)) {
          if (!'zvl'.includes(option)) return { stdout: '', stderr: `nc: invalid option -- '${option}'`, exitCode: 1 }
          if (option === 'z') zeroIo = true
          else if (option === 'v') verbose = true
          else if (option === 'l') listen = true
        }
      } else {
        operands.push(arg)
      }
    }
    const portText = explicitPort || (listen ? operands[operands.length - 1] : operands[1])
    const portMatch = portText?.match(/^(\d+)(?:-(\d+))?$/)
    const firstPort = Number(portMatch?.[1])
    const lastPort = Number(portMatch?.[2] ?? portMatch?.[1])
    if (
      !portMatch
      || !Number.isInteger(firstPort)
      || !Number.isInteger(lastPort)
      || firstPort < 1
      || lastPort > 65535
      || firstPort > lastPort
      || (firstPort !== lastPort && (!zeroIo || listen))
    ) {
      return { stdout: '', stderr: `nc: invalid or missing port '${portText || ''}'`, exitCode: 1 }
    }
    if (listen) {
      if (zeroIo) return { stdout: '', stderr: 'nc: -z cannot be used with -l', exitCode: 1 }
      const validCount = explicitPort ? operands.length <= 1 : operands.length === 1 || operands.length === 2
      if (!validCount) return { stdout: '', stderr: 'nc: usage: nc -l [bind-address] [-p] port', exitCode: 1 }
      const bindAddress = explicitPort ? operands[0] || '0.0.0.0' : operands.length === 2 ? operands[0] : '0.0.0.0'
      return { stdout: `Listening on ${bindAddress} ${firstPort} (simulated)\n`, stderr: '', exitCode: 0 }
    }
    if (operands.length !== 2 || explicitPort) return { stdout: '', stderr: 'nc: usage: nc [-zv] host port | nc -l port', exitCode: 1 }
    const host = operands[0]
    if (!host || /^\d+$/.test(host)) return { stdout: '', stderr: `nc: invalid host '${host || ''}'`, exitCode: 1 }
    if (zeroIo || verbose) {
      const range = firstPort === lastPort ? String(firstPort) : `${firstPort}-${lastPort}`
      return { stdout: `Connection to ${host} ${range} port [tcp] succeeded!${timeoutSeconds ? ` (timeout ${timeoutSeconds}s)` : ''}\n`, stderr: '', exitCode: 0 }
    }
    return { stdout: `Connected to ${host}:${firstPort}\n`, stderr: '', exitCode: 0 }
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
    let showAll = false
    let dirsOnly = false
    let maxDepth = Infinity
    let optionsEnded = false
    const paths: string[] = []
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      if (!optionsEnded && arg === '--') {
        optionsEnded = true
      } else if (!optionsEnded && arg === '-L') {
        const parsed = Number(args[++i])
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
          return { stdout: '', stderr: 'tree: -L requires a depth from 1 to 20', exitCode: 1 }
        }
        maxDepth = parsed
      } else if (!optionsEnded && arg.startsWith('-') && arg !== '-') {
        for (const option of arg.slice(1)) {
          if (!'ad'.includes(option)) return { stdout: '', stderr: `tree: invalid option -- '${option}'`, exitCode: 1 }
          if (option === 'a') showAll = true
          else if (option === 'd') dirsOnly = true
        }
      } else {
        paths.push(arg)
      }
    }
    if (paths.length > 1) return { stdout: '', stderr: `tree: extra operand '${paths[1]}'`, exitCode: 1 }
    const path = paths[0] || '.'

    const startParts = path === '.' ? this.state.cwd : this.vfs.resolvePath(path, this.state.cwd)
    const start = this.vfs.stat(path, this.state.cwd)
    if (!start.node) {
      const reason = start.error?.includes('Permission denied') ? 'Permission denied' : 'No such file or directory'
      return { stdout: '', stderr: `tree: '${path}': ${reason}`, exitCode: 1 }
    }
    let stdout = `${startParts[startParts.length - 1] || '.'}\n`
    if (start.node.type !== 'directory') return { stdout, stderr: '', exitCode: 0 }
    let traversalError = ''
    let visited = 0

    const walk = (parts: string[], prefix: string, depth: number) => {
      if (depth >= maxDepth || traversalError) return
      if (++visited > 1000) {
        traversalError = 'tree: traversal limit exceeded'
        return
      }
      const listed = this.vfs.listDirectory(parts.join('/'), [])
      if (listed.error) {
        traversalError = listed.error.replace(/^ls:/, 'tree:')
        return
      }
      const { entries } = listed
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
    if (traversalError) return { stdout, stderr: traversalError, exitCode: 1 }
    return { stdout, stderr: '', exitCode: 0 }
  }

  private cmdStat(args: string[]): ShellResult {
    let customFormat: string | null = null
    let optionsEnded = false
    const files: string[] = []
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      if (!optionsEnded && arg === '--') {
        optionsEnded = true
      } else if (!optionsEnded && (arg === '-c' || arg === '--format')) {
        customFormat = args[++i] ?? ''
        if (!customFormat) return { stdout: '', stderr: `stat: option '${arg}' requires an argument`, exitCode: 1 }
      } else if (!optionsEnded && arg.startsWith('--format=')) {
        customFormat = arg.slice('--format='.length)
        if (!customFormat) return { stdout: '', stderr: "stat: option '--format' requires an argument", exitCode: 1 }
      } else if (!optionsEnded && arg.startsWith('-')) {
        return { stdout: '', stderr: `stat: invalid option '${arg}'`, exitCode: 1 }
      } else {
        files.push(arg)
      }
    }
    if (files.length === 0) return { stdout: '', stderr: 'stat: missing operand', exitCode: 1 }
    let stdout = ''
    let stderr = ''
    let exitCode = 0
    for (const file of files) {
      const st = this.vfs.stat(file, this.state.cwd)
      if (!st.node) {
        const reason = st.error?.includes('Permission denied') ? 'Permission denied' : 'No such file or directory'
        stderr += `stat: cannot statx '${file}': ${reason}\n`
        exitCode = 1
        continue
      }
      const n = st.node
      if (customFormat !== null) {
        let fmt = customFormat
        fmt = fmt.replace(/%A/g, (n.type === 'directory' ? 'd' : '-') + n.permissions)
        fmt = fmt.replace(/%n/g, file)
        fmt = fmt.replace(/%s/g, String(n.size))
        fmt = fmt.replace(/%U/g, n.owner)
        fmt = fmt.replace(/%G/g, n.group)
        fmt = fmt.replace(/%y/g, n.mtime.toISOString())
        stdout += `${fmt}\n`
        continue
      }
      stdout +=
`  File: ${file}
  Size: ${n.size}       Blocks: ${Math.ceil(n.size / 512)}       IO Block: 4096   ${n.type === 'directory' ? 'directory' : 'regular file'}
Device: 801h/2049d    Inode: ${Math.floor(Math.random() * 1000000)}         Links: 1
Access: (${n.permissions})  Uid: ( 1000/ ${n.owner})   Gid: ( 1000/ ${n.group})
Access: ${n.mtime.toISOString()}
Modify: ${n.mtime.toISOString()}
Change: ${n.mtime.toISOString()}
 Birth: ${n.mtime.toISOString()}
`
    }
    return { stdout, stderr, exitCode }
  }

  private cmdShred(args: string[]): ShellResult {
    let verbose = false
    let remove = false
    let passes = 3
    const files: string[] = []
    for (let index = 0; index < args.length; index++) {
      const arg = args[index]
      if (arg === '-v') verbose = true
      else if (arg === '-u') remove = true
      else if (arg === '-n') {
        const count = Number(args[++index])
        if (!Number.isInteger(count) || count < 1 || count > 100) {
          return { stdout: '', stderr: 'shred: -n requires an integer from 1 to 100', exitCode: 1 }
        }
        passes = count
      } else if (arg.startsWith('-')) {
        return { stdout: '', stderr: `shred: unsupported option '${arg}'`, exitCode: 1 }
      } else files.push(arg)
    }
    if (files.length === 0) return { stdout: '', stderr: 'shred: missing file operand', exitCode: 1 }
    const nodes = []
    for (const file of files) {
      const stat = this.vfs.stat(file, this.state.cwd)
      if (!stat.node || stat.node.type !== 'file') {
        return { stdout: '', stderr: `shred: ${file}: cannot stat: No such regular file`, exitCode: 1 }
      }
      if (!this.vfs.hasPermission(file, this.state.cwd, 'write')) {
        return { stdout: '', stderr: `shred: ${file}: Permission denied`, exitCode: 1 }
      }
      nodes.push({ file, size: stat.node.size })
    }
    let stdout = ''
    for (const { file, size } of nodes) {
      if (verbose) {
        for (let i = 1; i <= passes; i++) stdout += `${file}: pass ${i}/${passes} (random)...\n`
      }
      const written = this.vfs.writeFile(file, this.state.cwd, '\x00'.repeat(size))
      if (written.error) return { stdout, stderr: written.error, exitCode: 1 }
      if (remove) {
        const deleted = this.vfs.deleteFile(file, this.state.cwd)
        if (deleted.error) return { stdout, stderr: deleted.error, exitCode: 1 }
        if (verbose) stdout += `${file}: removed\n`
      }
    }
    return { stdout, stderr: '', exitCode: 0 }
  }

  private cmdInstall(args: string[]): ShellResult {
    let mode: string | undefined
    const files: string[] = []
    for (let index = 0; index < args.length; index++) {
      const arg = args[index]
      if (arg === '-m') {
        mode = args[++index]
        if (!mode || !/^[0-7]{3,4}$/.test(mode)) {
          return { stdout: '', stderr: 'install: -m requires an octal mode', exitCode: 1 }
        }
      } else if (arg.startsWith('-')) {
        return { stdout: '', stderr: `install: unsupported option '${arg}'`, exitCode: 1 }
      } else files.push(arg)
    }
    if (files.length < 2) return { stdout: '', stderr: 'install: missing destination', exitCode: 1 }
    const dst = files.pop()!
    const destination = this.vfs.stat(dst, this.state.cwd).node
    if (files.length > 1 && destination?.type !== 'directory') {
      return { stdout: '', stderr: `install: target '${dst}' is not a directory`, exitCode: 1 }
    }
    for (const src of files) {
      const res = this.vfs.readFile(src, this.state.cwd)
      if (res.error) return { stdout: '', stderr: res.error, exitCode: 1 }
      const target = destination?.type === 'directory' ? `${dst}/${src.split('/').pop()}` : dst
      const written = this.vfs.writeFile(target, this.state.cwd, res.content)
      if (written.error) return { stdout: '', stderr: written.error, exitCode: 1 }
      if (mode) {
        const changed = this.vfs.chmod(target, this.state.cwd, mode)
        if (changed.error) return { stdout: '', stderr: changed.error, exitCode: 1 }
      }
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  // === COMPRESSION / ARCHIVES ===

  private isSafeArchivePath(path: string): boolean {
    if (!path || path.startsWith('/') || path.includes('\\') || hasUnsafeControlCharacters(path)) return false
    const segments = path.split('/')
    return segments.every(segment => segment !== '' && segment !== '.' && segment !== '..')
  }

  private collectArchiveEntries(
    sources: string[],
    cwd: string[],
    recursive: boolean,
  ): { entries?: SimulatedArchiveEntry[]; error?: string } {
    const entries: SimulatedArchiveEntry[] = []
    const storedPaths = new Set<string>()
    let totalBytes = 0

    const visit = (absolutePath: string, storedPath: string): string | undefined => {
      if (!this.isSafeArchivePath(storedPath)) return `unsafe archive member name: ${storedPath}`
      if (storedPaths.has(storedPath)) return `duplicate archive member: ${storedPath}`
      const result = this.vfs.lstat(absolutePath, [])
      const node = result.node
      if (!node) return result.error ?? `${absolutePath}: No such file or directory`
      if (entries.length >= MAX_ARCHIVE_ENTRIES) return `archive exceeds the ${MAX_ARCHIVE_ENTRIES}-entry safety limit`
      const entry: SimulatedArchiveEntry = {
        path: storedPath,
        type: node.type,
        permissions: node.permissions,
        owner: node.owner,
        group: node.group,
        mtime: node.mtime.toISOString(),
      }
      storedPaths.add(storedPath)
      if (node.type === 'file') {
        const read = this.vfs.readFile(absolutePath, [])
        if (read.error) return read.error
        totalBytes += new TextEncoder().encode(read.content).length
        if (totalBytes > MAX_ARCHIVE_BYTES) return `archive exceeds the ${MAX_ARCHIVE_BYTES}-byte safety limit`
        entry.content = read.content
        entries.push(entry)
        return undefined
      }
      if (node.type === 'symlink') {
        if (
          !node.target
          || node.target.startsWith('/')
          || node.target.includes('\\')
          || node.target.split('/').includes('..')
          || hasUnsafeControlCharacters(node.target)
        ) {
          return `unsafe symbolic-link target in archive member: ${storedPath}`
        }
        entry.target = node.target
        entries.push(entry)
        return undefined
      }
      if (!recursive) return `${absolutePath}: is a directory (use -r to recurse)`
      const listed = this.vfs.listDirectory(absolutePath, [])
      if (listed.error) return listed.error
      entries.push(entry)
      for (const child of listed.entries) {
        const childError = visit(`${absolutePath}/${child.name}`, `${storedPath}/${child.name}`)
        if (childError) return childError
      }
      return undefined
    }

    for (const source of sources) {
      const parts = this.vfs.resolvePath(source, cwd)
      const storedPath = parts.at(-1)
      if (!storedPath) return { error: `refusing to archive filesystem root: ${source}` }
      const error = visit(`/${parts.join('/')}`, storedPath)
      if (error) return { error }
    }
    return { entries }
  }

  private readArchive(path: string, kind: 'tar' | 'zip'): { archive?: SimulatedArchive; error?: string } {
    const read = this.vfs.readFile(path, this.state.cwd)
    if (read.error) return { error: read.error }
    if (new TextEncoder().encode(read.content).length > MAX_ARCHIVE_BYTES * 2) {
      return { error: 'archive metadata exceeds the safety limit' }
    }
    let value: unknown
    try {
      value = JSON.parse(read.content)
    } catch {
      return { error: `${path}: invalid or corrupt archive` }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: `${path}: invalid or corrupt archive` }
    const candidate = value as Partial<SimulatedArchive>
    if (
      candidate.format !== 'ghost-archive-v1'
      || candidate.kind !== kind
      || typeof candidate.compressed !== 'boolean'
      || !Array.isArray(candidate.entries)
      || candidate.entries.length === 0
      || candidate.entries.length > MAX_ARCHIVE_ENTRIES
    ) {
      return { error: `${path}: unsupported or corrupt ${kind} archive` }
    }
    const paths = new Set<string>()
    const entryTypes = new Map<string, SimulatedArchiveEntry['type']>()
    let totalBytes = 0
    for (const rawEntry of candidate.entries) {
      if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) return { error: `${path}: corrupt archive entry` }
      const entry = rawEntry as Partial<SimulatedArchiveEntry>
      if (
        typeof entry.path !== 'string'
        || !this.isSafeArchivePath(entry.path)
        || paths.has(entry.path)
        || !['file', 'directory', 'symlink'].includes(entry.type ?? '')
        || typeof entry.permissions !== 'string'
        || !/^[r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-]$/.test(entry.permissions)
        || typeof entry.owner !== 'string'
        || hasUnsafeControlCharacters(entry.owner)
        || typeof entry.group !== 'string'
        || hasUnsafeControlCharacters(entry.group)
        || typeof entry.mtime !== 'string'
        || Number.isNaN(Date.parse(entry.mtime))
      ) {
        return { error: `${path}: unsafe or corrupt archive entry` }
      }
      if (entry.type === 'file') {
        if (typeof entry.content !== 'string') return { error: `${path}: corrupt file entry` }
        totalBytes += new TextEncoder().encode(entry.content).length
      }
      if (
        entry.type === 'symlink'
        && (
          typeof entry.target !== 'string'
          || entry.target.length === 0
          || entry.target.startsWith('/')
          || entry.target.includes('\\')
          || entry.target.split('/').includes('..')
          || hasUnsafeControlCharacters(entry.target)
        )
      ) {
        return { error: `${path}: unsafe symbolic-link entry` }
      }
      if (totalBytes > MAX_ARCHIVE_BYTES) return { error: `${path}: expanded archive exceeds the safety limit` }
      paths.add(entry.path)
      entryTypes.set(entry.path, entry.type!)
    }
    for (const entry of candidate.entries) {
      const segments = entry.path.split('/')
      for (let length = 1; length < segments.length; length++) {
        const parentType = entryTypes.get(segments.slice(0, length).join('/'))
        if (parentType && parentType !== 'directory') return { error: `${path}: non-directory archive member used as a parent` }
      }
    }
    return { archive: candidate as SimulatedArchive }
  }

  private extractArchive(
    archive: SimulatedArchive,
    destination: string,
    preservePermissions: boolean,
  ): { paths?: string[]; error?: string } {
    const destinationParts = this.vfs.resolvePath(destination, this.state.cwd)
    const destinationPath = `/${destinationParts.join('/')}`
    const destinationNode = this.vfs.stat(destinationPath, []).node
    if (!destinationNode || destinationNode.type !== 'directory') return { error: `${destination}: Not a directory` }
    if (!this.vfs.hasPermission(destinationPath, [], 'write') || !this.vfs.hasPermission(destinationPath, [], 'execute')) {
      return { error: `${destination}: Permission denied` }
    }

    for (const entry of archive.entries) {
      const target = `/${[...destinationParts, ...entry.path.split('/')].join('/')}`
      if (this.vfs.lstat(target, []).node) return { error: `${entry.path}: destination already exists; extraction left unchanged` }
      const parentSegments = entry.path.split('/').slice(0, -1)
      for (let length = 1; length <= parentSegments.length; length++) {
        const parentPath = `/${[...destinationParts, ...parentSegments.slice(0, length)].join('/')}`
        const parent = this.vfs.lstat(parentPath, []).node
        if (parent && parent.type !== 'directory') return { error: `${entry.path}: parent is not a directory` }
      }
    }

    const createdPaths: string[] = []
    const rollback = (): string | undefined => {
      let firstError: string | undefined
      for (const path of createdPaths) {
        const node = this.vfs.lstat(path, []).node
        if (node?.type !== 'directory') continue
        const restored = this.vfs.chmod(path, [], '755')
        if (restored.error && !firstError) firstError = restored.error
      }
      for (const path of [...createdPaths].reverse()) {
        const node = this.vfs.lstat(path, []).node
        if (!node) continue
        const removed = node.type === 'directory'
          ? this.vfs.deleteDirectory(path, [], false)
          : this.vfs.deleteFile(path, [])
        if (removed.error && !firstError) firstError = removed.error
      }
      return firstError
    }
    const ensureParents = (entryPath: string): string | undefined => {
      const parentSegments = entryPath.split('/').slice(0, -1)
      for (let length = 1; length <= parentSegments.length; length++) {
        const parentPath = `/${[...destinationParts, ...parentSegments.slice(0, length)].join('/')}`
        if (this.vfs.lstat(parentPath, []).node) continue
        const created = this.vfs.createDirectory(parentPath, [])
        if (created.error) return created.error
        createdPaths.push(parentPath)
      }
      return undefined
    }
    const ordered = [...archive.entries].sort((left, right) => {
      const depthDifference = left.path.split('/').length - right.path.split('/').length
      if (depthDifference !== 0) return depthDifference
      if (left.type === right.type) return left.path.localeCompare(right.path)
      return left.type === 'directory' ? -1 : right.type === 'directory' ? 1 : left.type === 'file' ? -1 : 1
    })
    for (const entry of ordered) {
      const parentError = ensureParents(entry.path)
      if (parentError) {
        const rollbackError = rollback()
        return { error: rollbackError ? `${parentError}; rollback failed: ${rollbackError}` : parentError }
      }
      const target = `/${[...destinationParts, ...entry.path.split('/')].join('/')}`
      let error: string | undefined
      if (entry.type === 'directory') error = this.vfs.createDirectory(target, []).error
      else if (entry.type === 'file') error = this.vfs.writeFile(target, [], entry.content ?? '').error
      else error = this.vfs.symlink(entry.target ?? '', target, []).error
      if (error) {
        const rollbackError = rollback()
        return { error: rollbackError ? `${error}; rollback failed: ${rollbackError}` : error }
      }
      createdPaths.push(target)
    }

    const metadataOrder = [...ordered].sort((left, right) => {
      if (left.type === 'directory' && right.type !== 'directory') return 1
      if (left.type !== 'directory' && right.type === 'directory') return -1
      if (left.type !== 'directory') return left.path.localeCompare(right.path)
      return right.path.split('/').length - left.path.split('/').length
    })
    for (const entry of metadataOrder) {
      const target = `/${[...destinationParts, ...entry.path.split('/')].join('/')}`
      const node = this.vfs.lstat(target, []).node
      if (!node) {
        const error = `${entry.path}: extracted entry disappeared`
        const rollbackError = rollback()
        return { error: rollbackError ? `${error}; rollback failed: ${rollbackError}` : error }
      }
      node.mtime = new Date(entry.mtime)
      if (preservePermissions && entry.type !== 'symlink') {
        const chmod = this.vfs.chmod(target, [], permissionMode(entry.permissions).toString(8).padStart(3, '0'))
        if (chmod.error) {
          const rollbackError = rollback()
          return { error: rollbackError ? `${chmod.error}; rollback failed: ${rollbackError}` : chmod.error }
        }
      }
    }
    return { paths: archive.entries.map(entry => entry.path) }
  }

  private cmdTar(args: string[]): ShellResult {
    let mode: 'create' | 'extract' | 'list' | '' = ''
    let archiveFile = ''
    let directory = '.'
    let compressed = false
    let preservePermissions = false
    let verbose = false
    let parsingOptions = true
    const members: string[] = []
    const setMode = (next: 'create' | 'extract' | 'list'): string | undefined => {
      if (mode && mode !== next) return 'tar: You may not specify more than one operation'
      mode = next
      return undefined
    }
    const consumeValue = (option: string, index: number, remainder = ''): { value?: string; next: number; error?: string } => {
      if (remainder) return { value: remainder, next: index }
      const value = args[index + 1]
      return value
        ? { value, next: index + 1 }
        : { next: index, error: `tar: option requires an argument -- '${option}'` }
    }

    for (let index = 0; index < args.length; index++) {
      const arg = args[index]
      if (parsingOptions && arg === '--') {
        parsingOptions = false
        continue
      }
      if (parsingOptions && arg.startsWith('--')) {
        if (arg === '--create' || arg === '--extract' || arg === '--list') {
          const error = setMode(arg === '--create' ? 'create' : arg === '--extract' ? 'extract' : 'list')
          if (error) return { stdout: '', stderr: `${error}\n`, exitCode: 2 }
        } else if (arg === '--preserve-permissions') {
          preservePermissions = true
        } else if (arg === '--gzip' || arg === '--bzip2' || arg === '--xz') {
          compressed = true
        } else if (arg === '--verbose') {
          verbose = true
        } else if (arg === '--file' || arg === '--directory') {
          const consumed = consumeValue(arg, index)
          if (consumed.error) return { stdout: '', stderr: `${consumed.error}\n`, exitCode: 2 }
          index = consumed.next
          if (arg === '--file') archiveFile = consumed.value!
          else directory = consumed.value!
        } else if (arg.startsWith('--file=')) {
          archiveFile = arg.slice('--file='.length)
        } else if (arg.startsWith('--directory=')) {
          directory = arg.slice('--directory='.length)
        } else {
          return { stdout: '', stderr: `tar: unrecognized option '${arg}'\n`, exitCode: 2 }
        }
        continue
      }
      if (parsingOptions && /^-[^-]/.test(arg)) {
        const flags = arg.slice(1)
        for (let flagIndex = 0; flagIndex < flags.length; flagIndex++) {
          const flag = flags[flagIndex]
          if (flag === 'c' || flag === 'x' || flag === 't') {
            const error = setMode(flag === 'c' ? 'create' : flag === 'x' ? 'extract' : 'list')
            if (error) return { stdout: '', stderr: `${error}\n`, exitCode: 2 }
          } else if (flag === 'z' || flag === 'j' || flag === 'J') compressed = true
          else if (flag === 'p') preservePermissions = true
          else if (flag === 'v') verbose = true
          else if (flag === 'f' || flag === 'C') {
            const consumed = consumeValue(flag, index, flags.slice(flagIndex + 1))
            if (consumed.error) return { stdout: '', stderr: `${consumed.error}\n`, exitCode: 2 }
            index = consumed.next
            if (flag === 'f') archiveFile = consumed.value!
            else directory = consumed.value!
            flagIndex = flags.length
          } else {
            return { stdout: '', stderr: `tar: invalid option -- '${flag}'\n`, exitCode: 2 }
          }
        }
        continue
      }
      members.push(arg)
    }
    if (!mode) return { stdout: '', stderr: 'tar: You must specify one of the -c, -x, or -t options\n', exitCode: 2 }
    if (!archiveFile) return { stdout: '', stderr: 'tar: an archive file is required in this bounded simulator (use -f)\n', exitCode: 2 }

    if (mode === 'create') {
      if (members.length === 0) return { stdout: '', stderr: 'tar: Cowardly refusing to create an empty archive\n', exitCode: 2 }
      const sourceDirectory = this.vfs.stat(directory, this.state.cwd)
      if (!sourceDirectory.node || sourceDirectory.node.type !== 'directory') {
        return { stdout: '', stderr: `tar: ${directory}: Cannot open: Not a directory\n`, exitCode: 2 }
      }
      const collected = this.collectArchiveEntries(members, this.vfs.resolvePath(directory, this.state.cwd), true)
      if (collected.error) return { stdout: '', stderr: `tar: ${collected.error}\n`, exitCode: 2 }
      const archive: SimulatedArchive = {
        format: 'ghost-archive-v1',
        kind: 'tar',
        compressed,
        entries: collected.entries!,
      }
      const serialized = JSON.stringify(archive)
      if (new TextEncoder().encode(serialized).length > MAX_ARCHIVE_BYTES * 2) {
        return { stdout: '', stderr: 'tar: archive metadata exceeds the safety limit\n', exitCode: 2 }
      }
      const written = this.vfs.writeFile(archiveFile, this.state.cwd, serialized)
      if (written.error) return { stdout: '', stderr: `tar: ${written.error}\n`, exitCode: 2 }
      return { stdout: verbose ? `${archive.entries.map(entry => entry.path).join('\n')}\n` : '', stderr: '', exitCode: 0 }
    }

    const read = this.readArchive(archiveFile, 'tar')
    if (read.error) return { stdout: '', stderr: `tar: ${read.error}\n`, exitCode: 2 }
    let archive = read.archive!
    if (members.length > 0) {
      const selected = archive.entries.filter(entry =>
        members.some(member => entry.path === member || entry.path.startsWith(`${member.replace(/\/$/, '')}/`)),
      )
      if (selected.length === 0) return { stdout: '', stderr: `tar: ${members[0]}: Not found in archive\n`, exitCode: 2 }
      archive = { ...archive, entries: selected }
    }
    if (mode === 'list') {
      return {
        stdout: `${archive.entries.map(entry =>
          verbose
            ? `${entry.type === 'directory' ? 'd' : entry.type === 'symlink' ? 'l' : '-'}${entry.permissions} ${entry.owner}/${entry.group} ${String(entry.content?.length ?? 0).padStart(7)} ${entry.path}${entry.type === 'directory' ? '/' : ''}`
            : `${entry.path}${entry.type === 'directory' ? '/' : ''}`,
        ).join('\n')}\n`,
        stderr: '',
        exitCode: 0,
      }
    }
    const extracted = this.extractArchive(archive, directory, preservePermissions)
    if (extracted.error) return { stdout: '', stderr: `tar: ${extracted.error}\n`, exitCode: 2 }
    return { stdout: verbose ? `${extracted.paths!.join('\n')}\n` : '', stderr: '', exitCode: 0 }
  }

  private cmdCompressionTransform(
    args: string[],
    tool: string,
    suffix: string,
    decompress: boolean,
  ): ShellResult {
    let keep = false
    let force = false
    let parsingOptions = true
    const files: string[] = []
    for (const arg of args) {
      if (parsingOptions && arg === '--') {
        parsingOptions = false
      } else if (parsingOptions && (arg === '--keep' || arg === '--force')) {
        if (arg === '--keep') keep = true
        else force = true
      } else if (parsingOptions && /^-[^-]/.test(arg)) {
        for (const flag of arg.slice(1)) {
          if (flag === 'k') keep = true
          else if (flag === 'f') force = true
          else return { stdout: '', stderr: `${tool}: invalid option -- '${flag}'\n`, exitCode: 1 }
        }
      } else if (parsingOptions && arg.startsWith('--')) {
        return { stdout: '', stderr: `${tool}: unrecognized option '${arg}'\n`, exitCode: 1 }
      } else {
        files.push(arg)
      }
    }
    if (files.length === 0) {
      return { stdout: '', stderr: `${tool}: compressed data not written to a terminal\n`, exitCode: 1 }
    }

    type CompressionMetadata = {
      permissions: string
      owner: string
      group: string
      mtime: Date
    }
    type CompressionPlan = {
      source: string
      target: string
      content: string
      sourceMetadata: CompressionMetadata
      targetSnapshot?: CompressionMetadata & { content: string }
    }
    const plans: CompressionPlan[] = []
    const sourcePaths = new Set<string>()
    const targetPaths = new Set<string>()
    for (const file of files) {
      const source = decompress ? (file.endsWith(suffix) ? file : `${file}${suffix}`) : file
      const target = decompress ? source.slice(0, -suffix.length) : `${source}${suffix}`
      const sourceNode = this.vfs.lstat(source, this.state.cwd).node
      if (!sourceNode || sourceNode.type !== 'file') {
        return { stdout: '', stderr: `${tool}: ${source}: No such regular file\n`, exitCode: 1 }
      }
      const read = this.vfs.readFile(source, this.state.cwd)
      if (read.error) return { stdout: '', stderr: `${read.error}\n`, exitCode: 1 }
      const targetNode = this.vfs.lstat(target, this.state.cwd).node
      if (targetNode && (!force || targetNode.type !== 'file')) {
        return { stdout: '', stderr: `${tool}: ${target} already exists; not overwritten\n`, exitCode: 1 }
      }
      const writable = this.vfs.canWriteFile(target, this.state.cwd)
      if (writable.error) return { stdout: '', stderr: `${writable.error}\n`, exitCode: 1 }
      if (!keep) {
        const removable = this.vfs.canDeleteFile(source, this.state.cwd)
        if (removable.error) return { stdout: '', stderr: `${removable.error}\n`, exitCode: 1 }
      }
      let targetSnapshot: CompressionPlan['targetSnapshot']
      if (targetNode) {
        const targetRead = this.vfs.readFile(target, this.state.cwd)
        if (targetRead.error) return { stdout: '', stderr: `${targetRead.error}\n`, exitCode: 1 }
        targetSnapshot = {
          content: targetRead.content,
          permissions: targetNode.permissions,
          owner: targetNode.owner,
          group: targetNode.group,
          mtime: new Date(targetNode.mtime),
        }
      }
      const sourceKey = `/${this.vfs.resolvePath(source, this.state.cwd).join('/')}`
      const targetKey = `/${this.vfs.resolvePath(target, this.state.cwd).join('/')}`
      if (sourcePaths.has(sourceKey) || targetPaths.has(targetKey)) {
        return { stdout: '', stderr: `${tool}: duplicate input or output path\n`, exitCode: 1 }
      }
      sourcePaths.add(sourceKey)
      targetPaths.add(targetKey)
      plans.push({
        source,
        target,
        content: read.content,
        sourceMetadata: {
          permissions: sourceNode.permissions,
          owner: sourceNode.owner,
          group: sourceNode.group,
          mtime: new Date(sourceNode.mtime),
        },
        targetSnapshot,
      })
    }
    if ([...targetPaths].some(path => sourcePaths.has(path))) {
      return { stdout: '', stderr: `${tool}: input and output paths overlap\n`, exitCode: 1 }
    }

    const restoreMetadata = (
      path: string,
      metadata: CompressionMetadata,
    ) => {
      const node = this.vfs.stat(path, this.state.cwd).node
      if (!node) return
      node.permissions = metadata.permissions
      if (this.vfs.getCurrentUser() === 'root') {
        node.owner = metadata.owner
        node.group = metadata.group
      }
      node.mtime = new Date(metadata.mtime)
    }
    const appliedPlans: CompressionPlan[] = []
    const rollback = () => {
      for (const plan of [...appliedPlans].reverse()) {
        if (!keep && !this.vfs.lstat(plan.source, this.state.cwd).node) {
          this.vfs.writeFile(plan.source, this.state.cwd, plan.content)
          restoreMetadata(plan.source, plan.sourceMetadata)
        }
        if (plan.targetSnapshot) {
          this.vfs.writeFile(plan.target, this.state.cwd, plan.targetSnapshot.content)
          restoreMetadata(plan.target, plan.targetSnapshot)
        } else if (this.vfs.lstat(plan.target, this.state.cwd).node) {
          this.vfs.deleteFile(plan.target, this.state.cwd)
        }
      }
    }

    for (const plan of plans) {
      const written = this.vfs.writeFile(plan.target, this.state.cwd, plan.content)
      if (written.error) {
        rollback()
        return { stdout: '', stderr: `${written.error}\n`, exitCode: 1 }
      }
      appliedPlans.push(plan)
      restoreMetadata(plan.target, plan.sourceMetadata)
      if (!keep) {
        const deleted = this.vfs.deleteFile(plan.source, this.state.cwd)
        if (deleted.error) {
          rollback()
          return { stdout: '', stderr: `${deleted.error}\n`, exitCode: 1 }
        }
      }
    }
    const stdout = tool === 'gzip'
      ? plans.map(plan => `${plan.source}: replaced with ${plan.target}`).join('\n') + '\n'
      : ''
    return { stdout, stderr: '', exitCode: 0 }
  }

  private cmdGzip(args: string[]): ShellResult {
    return this.cmdCompressionTransform(args, 'gzip', '.gz', false)
  }

  private cmdGunzip(args: string[]): ShellResult {
    return this.cmdCompressionTransform(args, 'gunzip', '.gz', true)
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
    return this.cmdCompressionTransform(args, 'bzip2', '.bz2', false)
  }

  private cmdBunzip2(args: string[]): ShellResult {
    return this.cmdCompressionTransform(args, 'bunzip2', '.bz2', true)
  }

  private cmdXz(args: string[]): ShellResult {
    return this.cmdCompressionTransform(args, 'xz', '.xz', false)
  }

  private cmdUnxz(args: string[]): ShellResult {
    return this.cmdCompressionTransform(args, 'unxz', '.xz', true)
  }

  private cmdZip(args: string[]): ShellResult {
    let recursive = false
    let quiet = false
    let parsingOptions = true
    const operands: string[] = []
    for (const arg of args) {
      if (parsingOptions && arg === '--') {
        parsingOptions = false
      } else if (parsingOptions && /^-[^-]/.test(arg)) {
        for (const flag of arg.slice(1)) {
          if (flag === 'r') recursive = true
          else if (flag === 'q') quiet = true
          else if (!/[0-9]/.test(flag)) return { stdout: '', stderr: `zip error: Invalid command arguments (unknown option -${flag})\n`, exitCode: 16 }
        }
      } else if (parsingOptions && arg.startsWith('--')) {
        return { stdout: '', stderr: `zip error: Invalid command arguments (${arg})\n`, exitCode: 16 }
      } else {
        operands.push(arg)
      }
    }
    const [archiveFile, ...sources] = operands
    if (!archiveFile || sources.length === 0) return { stdout: '', stderr: 'zip error: Nothing to do! (archive requires at least one input)\n', exitCode: 12 }
    const collected = this.collectArchiveEntries(sources, this.state.cwd, recursive)
    if (collected.error) return { stdout: '', stderr: `zip warning: ${collected.error}\nzip error: Could not create output file\n`, exitCode: 12 }
    const archive: SimulatedArchive = {
      format: 'ghost-archive-v1',
      kind: 'zip',
      compressed: true,
      entries: collected.entries!,
    }
    const written = this.vfs.writeFile(archiveFile, this.state.cwd, JSON.stringify(archive))
    if (written.error) return { stdout: '', stderr: `zip error: ${written.error}\n`, exitCode: 15 }
    return {
      stdout: quiet ? '' : `${archive.entries.map(entry => `  adding: ${entry.path}${entry.type === 'directory' ? '/' : ''}`).join('\n')}\n`,
      stderr: '',
      exitCode: 0,
    }
  }

  private cmdUnzip(args: string[]): ShellResult {
    let list = false
    let quiet = false
    let destination = '.'
    let parsingOptions = true
    const operands: string[] = []
    for (let index = 0; index < args.length; index++) {
      const arg = args[index]
      if (parsingOptions && arg === '--') {
        parsingOptions = false
      } else if (parsingOptions && arg === '-d') {
        destination = args[++index] ?? ''
        if (!destination) return { stdout: '', stderr: 'unzip: option -d requires a directory\n', exitCode: 10 }
      } else if (parsingOptions && /^-[^-]/.test(arg)) {
        for (const flag of arg.slice(1)) {
          if (flag === 'l') list = true
          else if (flag === 'q') quiet = true
          else return { stdout: '', stderr: `unzip: unsupported option -${flag}\n`, exitCode: 10 }
        }
      } else if (parsingOptions && arg.startsWith('--')) {
        return { stdout: '', stderr: `unzip: unsupported option ${arg}\n`, exitCode: 10 }
      } else {
        operands.push(arg)
      }
    }
    const [archiveFile, ...members] = operands
    if (!archiveFile) return { stdout: '', stderr: 'unzip: cannot find or open archive\n', exitCode: 9 }
    const read = this.readArchive(archiveFile, 'zip')
    if (read.error) return { stdout: '', stderr: `unzip: ${read.error}\n`, exitCode: 9 }
    let archive = read.archive!
    if (members.length > 0) {
      const selected = archive.entries.filter(entry =>
        members.some(member => entry.path === member || entry.path.startsWith(`${member.replace(/\/$/, '')}/`)),
      )
      if (selected.length === 0) return { stdout: '', stderr: `caution: filename not matched: ${members[0]}\n`, exitCode: 11 }
      archive = { ...archive, entries: selected }
    }
    if (list) {
      const total = archive.entries.reduce((sum, entry) => sum + (entry.content?.length ?? 0), 0)
      return {
        stdout: `Archive: ${archiveFile}\n  Length      Name\n---------     ----\n${archive.entries.map(entry => `${String(entry.content?.length ?? 0).padStart(9)}     ${entry.path}${entry.type === 'directory' ? '/' : ''}`).join('\n')}\n---------\n${String(total).padStart(9)}     ${archive.entries.length} files\n`,
        stderr: '',
        exitCode: 0,
      }
    }
    const destinationBefore = this.vfs.stat(destination, this.state.cwd).node
    if (!destinationBefore) {
      const created = this.ensureDirectory(destination)
      if (created.error) return { stdout: '', stderr: `unzip: ${created.error}\n`, exitCode: 50 }
    }
    const extracted = this.extractArchive(archive, destination, false)
    if (extracted.error) {
      if (!destinationBefore) this.vfs.deleteDirectory(destination, this.state.cwd, false)
      return { stdout: '', stderr: `unzip: ${extracted.error}\n`, exitCode: 50 }
    }
    return {
      stdout: quiet ? '' : `Archive: ${archiveFile}\n${extracted.paths!.map(path => `  inflating: ${path}`).join('\n')}\n`,
      stderr: '',
      exitCode: 0,
    }
  }


  // === TERMINAL MULTIPLEXERS ===

  private cmdTmux(args: string[]): ShellResult {
    const sub = args[0] || ''
    const targetIdx = args.indexOf('-t')
    const target = targetIdx >= 0 ? (args[targetIdx + 1] ?? '').split(':')[0] : ''
    const attachedSession = [...this.services.tmuxSessions.entries()].find(([, session]) => session.attached)?.[0]
    const selectedSession = target || attachedSession || [...this.services.tmuxSessions.keys()].at(-1) || ''

    switch (sub) {
      case '': {
        const name = `session-${this.services.tmuxSessions.size}`
        this.services.tmuxSessions.set(name, { windows: 1, attached: true })
        return { stdout: '', stderr: '', exitCode: 0, mode: 'tmux' }
      }
      case 'new':
      case 'new-session': {
        const sIdx = args.indexOf('-s')
        const name = sIdx >= 0 ? args[sIdx + 1] : `session-${this.services.tmuxSessions.size}`
        if (!name) return { stdout: '', stderr: 'tmux: -s expects a session name', exitCode: 1 }
        if (this.services.tmuxSessions.has(name)) return { stdout: '', stderr: `duplicate session: ${name}`, exitCode: 1 }
        this.services.tmuxSessions.set(name, { windows: 1, attached: true })
        return { stdout: '', stderr: '', exitCode: 0, mode: 'tmux' }
      }
      case 'ls':
      case 'list-sessions': {
        let stdout = ''
        this.services.tmuxSessions.forEach((s, name) => {
          stdout += `${name}: ${s.windows} window${s.windows > 1 ? 's' : ''}${s.attached ? ' (attached)' : ''}\n`
        })
        if (!stdout) return { stdout: '', stderr: 'no server running on /tmp/tmux-1000/default', exitCode: 1 }
        return { stdout, stderr: '', exitCode: 0 }
      }
      case 'attach':
      case 'attach-session': {
        if (!selectedSession) return { stdout: '', stderr: 'no sessions', exitCode: 1 }
        const s = this.services.tmuxSessions.get(selectedSession)
        if (!s) return { stdout: '', stderr: `tmux: session ${selectedSession} not found`, exitCode: 1 }
        s.attached = true
        return { stdout: '', stderr: '', exitCode: 0, mode: 'tmux' }
      }
      case 'detach':
      case 'detach-client': {
        if (!selectedSession) return { stdout: '', stderr: 'tmux: no current client', exitCode: 1 }
        const session = this.services.tmuxSessions.get(selectedSession)
        if (!session?.attached) return { stdout: '', stderr: 'tmux: no current client', exitCode: 1 }
        session.attached = false
        return { stdout: '', stderr: '', exitCode: 0 }
      }
      case 'kill-session': {
        if (!target) return { stdout: '', stderr: 'tmux: target session required (-t)', exitCode: 1 }
        if (!this.services.tmuxSessions.has(target)) return { stdout: '', stderr: `tmux: session ${target} not found`, exitCode: 1 }
        this.services.tmuxSessions.delete(target)
        return { stdout: '', stderr: '', exitCode: 0 }
      }
      case 'rename-session': {
        const oldName = target
        const newName = args[args.length - 1]
        if (!oldName || !newName) return { stdout: '', stderr: 'tmux: rename-session -t old new', exitCode: 1 }
        const s = this.services.tmuxSessions.get(oldName)
        if (!s) return { stdout: '', stderr: `tmux: session ${oldName} not found`, exitCode: 1 }
        if (this.services.tmuxSessions.has(newName)) return { stdout: '', stderr: `duplicate session: ${newName}`, exitCode: 1 }
        this.services.tmuxSessions.delete(oldName)
        this.services.tmuxSessions.set(newName, s)
        return { stdout: '', stderr: '', exitCode: 0 }
      }
      case 'source-file': {
        const file = args[1]
        if (!file) return { stdout: '', stderr: 'tmux: source-file <path>', exitCode: 1 }
        if (!this.vfs.stat(file, this.state.cwd).node) return { stdout: '', stderr: `${file}: No such file or directory`, exitCode: 1 }
        return { stdout: '', stderr: '', exitCode: 0 }
      }
      case 'split':
      case 'split-window':
      case 'splitw':
        if (!selectedSession || !this.services.tmuxSessions.has(selectedSession)) return { stdout: '', stderr: 'tmux: no current pane', exitCode: 1 }
        return { stdout: '', stderr: '', exitCode: 0 }
      case 'neww':
      case 'new-window':
        if (!selectedSession) return { stdout: '', stderr: 'tmux: no current session', exitCode: 1 }
        if (!this.services.tmuxSessions.has(selectedSession)) return { stdout: '', stderr: `tmux: session ${selectedSession} not found`, exitCode: 1 }
        this.services.tmuxSessions.get(selectedSession)!.windows++
        return { stdout: '', stderr: '', exitCode: 0 }
      case 'copy-mode':
        if (!selectedSession || !this.services.tmuxSessions.get(selectedSession)?.attached) return { stdout: '', stderr: 'tmux: no current client', exitCode: 1 }
        return { stdout: '', stderr: '', exitCode: 0 }
      case '-V':
      case '-v':
        return { stdout: 'tmux 3.2a\n', stderr: '', exitCode: 0 }
      default:
        return { stdout: '', stderr: `tmux: unknown command: ${sub}`, exitCode: 1 }
    }
  }

  private cmdScreen(args: string[]): ShellResult {
    const sub = args[0] || ''
    const name = sub === '-S' ? args[1] : (sub === '-r' || sub === '-d') ? args[1] : ''

    switch (sub) {
      case '-S': {
        if (!name) return { stdout: '', stderr: 'screen: session name required', exitCode: 1 }
        if (args.length !== 2) return { stdout: '', stderr: 'screen: unsupported arguments after session name', exitCode: 1 }
        if (this.services.screenSessions.has(name)) return { stdout: '', stderr: `There is already a screen on: ${name}`, exitCode: 1 }
        this.services.screenSessions.set(name, { attached: true })
        return { stdout: `Screen session '${name}' created.\n`, stderr: '', exitCode: 0, mode: 'screen' }
      }
      case '-ls': {
        if (args.length !== 1) return { stdout: '', stderr: 'screen: -ls does not accept a session name', exitCode: 1 }
        let stdout = ''
        this.services.screenSessions.forEach((s, n) => {
          stdout += `\t${Math.floor(Math.random() * 9000 + 1000)}.${n}\t(${s.attached ? 'Attached' : 'Detached'})\n`
        })
        if (!stdout) return { stdout: 'No Sockets found in /run/screens/S-ghost.\n', stderr: '', exitCode: 1 }
        return { stdout, stderr: '', exitCode: 0 }
      }
      case '-r': {
        if (!name) return { stdout: '', stderr: 'screen: session name required', exitCode: 1 }
        if (args.length !== 2) return { stdout: '', stderr: 'screen: unsupported arguments after session name', exitCode: 1 }
        const s = this.services.screenSessions.get(name)
        if (!s) return { stdout: '', stderr: `There is no screen to be resumed matching ${name}.`, exitCode: 1 }
        if (s.attached) return { stdout: '', stderr: `There is a screen on: ${name} (Attached).`, exitCode: 1 }
        s.attached = true
        return { stdout: `Screen session '${name}' resumed.\n`, stderr: '', exitCode: 0, mode: 'screen' }
      }
      case '-d': {
        if (!name) return { stdout: '', stderr: 'screen: session name required', exitCode: 1 }
        if (args.length !== 2) return { stdout: '', stderr: 'screen: unsupported arguments after session name', exitCode: 1 }
        const s = this.services.screenSessions.get(name)
        if (!s) return { stdout: '', stderr: `There is no screen to be detached matching ${name}.`, exitCode: 1 }
        if (!s.attached) return { stdout: '', stderr: `Screen session ${name} is already detached.`, exitCode: 1 }
        s.attached = false
        return { stdout: '', stderr: '', exitCode: 0 }
      }
      case '': {
        const generatedName = `screen-${this.services.screenSessions.size}`
        this.services.screenSessions.set(generatedName, { attached: true })
        return { stdout: `Screen session '${generatedName}' created.\n`, stderr: '', exitCode: 0, mode: 'screen' }
      }
      default:
        return { stdout: '', stderr: `screen: unsupported option or command '${sub}'`, exitCode: 1 }
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

  private cmdTee(args: string[], stdin: string): ShellResult {
    let append = false
    let parsingOptions = true
    const files: string[] = []
    for (const arg of args) {
      if (parsingOptions && arg === '--') {
        parsingOptions = false
        continue
      }
      if (parsingOptions && arg === '-a') {
        append = true
        continue
      }
      if (parsingOptions && arg.startsWith('-')) {
        return { stdout: '', stderr: `tee: invalid option -- '${arg.slice(1)}'`, exitCode: 1 }
      }
      files.push(arg)
    }
    let stderr = ''
    let exitCode = 0
    for (const file of files) {
      const written = this.vfs.writeFile(file, this.state.cwd, stdin, append)
      if (written.error) {
        stderr += `${written.error}\n`
        exitCode = 1
      }
    }
    return { stdout: stdin, stderr, exitCode }
  }

  private cmdWatch(args: string[], stdin: string): ShellResult {
    let interval = 2
    let commandIndex = 0
    if (args[0] === '-n') {
      interval = Number(args[1])
      commandIndex = 2
      if (!Number.isFinite(interval) || interval < 0.1 || interval > 3600) {
        return { stdout: '', stderr: 'watch: -n requires an interval from 0.1 to 3600 seconds', exitCode: 1 }
      }
    } else if (args[0]?.startsWith('-')) {
      return { stdout: '', stderr: `watch: unsupported option '${args[0]}'`, exitCode: 1 }
    }
    const command = args.slice(commandIndex)
    if (command.length === 0) return { stdout: '', stderr: 'watch: a command is required', exitCode: 1 }
    const result = this.runCommand(command, stdin)
    if (result.exitCode !== 0) return result
    return {
      stdout: `Every ${interval.toFixed(1)}s: ${command.join(' ')}\n\n${result.stdout}`,
      stderr: result.stderr,
      exitCode: 0,
    }
  }

  private cmdTimeout(args: string[], stdin: string): ShellResult {
    if (args.length < 2) return { stdout: '', stderr: 'timeout: missing operand', exitCode: 125 }
    const duration = args[0].match(/^(\d+(?:\.\d+)?)([smhd]?)$/)
    if (!duration) return { stdout: '', stderr: `timeout: invalid time interval '${args[0]}'`, exitCode: 125 }
    const amount = Number(duration[1])
    if (!Number.isFinite(amount) || amount < 0) {
      return { stdout: '', stderr: `timeout: invalid time interval '${args[0]}'`, exitCode: 125 }
    }
    // All simulator commands are synchronous and independently bounded, so a
    // valid timeout delegates once without pretending that a real process ran.
    return this.runCommand(args.slice(1), stdin)
  }

  private cmdHelp(command: string): ShellResult {
    const usages: Record<string, string> = {
      apropos: 'apropos KEYWORD...',
      command: 'command [-v|-V] COMMAND [ARG...]',
      dd: 'dd [if=FILE] [of=FILE] [bs=BYTES] [count=N]',
      file: 'file FILE...',
      findmnt: 'findmnt [TARGET]',
      ip: 'ip { address | link | route }',
      lsof: 'lsof [-i [ADDRESS]] [+L1] [PATH]',
      ls: 'ls [OPTION]... [FILE]...',
      lsblk: 'lsblk [-f] [DEVICE]',
      readlink: 'readlink [-f] FILE',
      realpath: 'realpath FILE...',
      set: 'set [-o|+o pipefail]',
      ssh: 'ssh [-p PORT] [-i IDENTITY] [USER@]HOST [COMMAND]',
      'ssh-keygen': 'ssh-keygen [-t ed25519|rsa] [-f OUTPUT_FILE]',
      umask: 'umask [MODE]',
    }
    const synopsis = usages[command] ?? `${command} [OPTION]...`
    return {
      stdout: `Usage: ${synopsis}\nGhostOS provides a bounded in-browser simulation of this command.\n`,
      stderr: '',
      exitCode: 0,
    }
  }

  private cmdApropos(args: string[]): ShellResult {
    if (args.length === 0) {
      return { stdout: '', stderr: 'apropos what?', exitCode: 1 }
    }
    const manuals: Array<[string, string]> = [
      ['apropos', 'search the manual page names and descriptions'],
      ['cat', 'concatenate files and print them'],
      ['chmod', 'change file mode bits'],
      ['find', 'search for files in a directory hierarchy'],
      ['grep', 'print lines that match patterns'],
      ['ls', 'list directory contents'],
      ['man', 'display system manual pages'],
      ['mkdir', 'make directories'],
      ['readlink', 'print resolved symbolic links'],
      ['ssh', 'open a secure remote shell'],
    ]
    const terms = args.filter(arg => !arg.startsWith('-')).map(arg => arg.toLowerCase())
    if (terms.length === 0) return { stdout: '', stderr: 'apropos: missing keyword', exitCode: 1 }
    const matches = manuals.filter(([name, description]) => {
      const text = `${name} ${description}`.toLowerCase()
      return terms.some(term => text.includes(term))
    })
    if (matches.length === 0) {
      return { stdout: '', stderr: `${args.join(' ')}: nothing appropriate.`, exitCode: 1 }
    }
    return {
      stdout: matches.map(([name, description]) => `${name.padEnd(12)} - ${description}`).join('\n') + '\n',
      stderr: '',
      exitCode: 0,
    }
  }

  private cmdCommand(args: string[], stdin: string): ShellResult {
    if (args.length === 0) return { stdout: '', stderr: '', exitCode: 0 }
    if (args[0] === '-v') {
      const name = args[1]
      if (!name) return { stdout: '', stderr: '', exitCode: 1 }
      if (this.state.aliases[name] || SHELL_BUILTINS.has(name)) {
        return { stdout: `${name}\n`, stderr: '', exitCode: 0 }
      }
      if (SIMULATED_EXECUTABLES.has(name)) {
        return { stdout: `/usr/bin/${name}\n`, stderr: '', exitCode: 0 }
      }
      const which = this.cmdWhich([name])
      return which.exitCode === 0
        ? { stdout: `${which.stdout.trim()}\n`, stderr: '', exitCode: 0 }
        : { stdout: '', stderr: '', exitCode: 1 }
    }
    if (args[0] === '-V') return this.cmdType(args.slice(1))
    if (args[0] === 'command') {
      return { stdout: '', stderr: 'command: recursive invocation is not supported', exitCode: 2 }
    }
    return this.runCommand(args, stdin)
  }

  private cmdSet(args: string[]): ShellResult {
    if (args.length === 0 || (args.length === 1 && args[0] === '-o')) {
      return { stdout: `pipefail\t${this.state.pipefail ? 'on' : 'off'}\n`, stderr: '', exitCode: 0 }
    }
    if (args.length === 2 && args[1] === 'pipefail' && (args[0] === '-o' || args[0] === '+o')) {
      this.state.pipefail = args[0] === '-o'
      return { stdout: '', stderr: '', exitCode: 0 }
    }
    return { stdout: '', stderr: `set: ${args.join(' ')}: invalid option`, exitCode: 2 }
  }

  private cmdUmask(args: string[]): ShellResult {
    if (args.length === 0) {
      return { stdout: `${this.state.umask.toString(8).padStart(4, '0')}\n`, stderr: '', exitCode: 0 }
    }
    if (args.length !== 1 || !/^[0-7]{3,4}$/.test(args[0])) {
      return { stdout: '', stderr: `umask: ${args.join(' ')}: invalid octal number`, exitCode: 1 }
    }
    const mode = parseInt(args[0], 8)
    if (mode > 0o777) return { stdout: '', stderr: `umask: ${args[0]}: invalid octal number`, exitCode: 1 }
    this.state.umask = mode
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private canonicalPath(input: string): { path?: string; error?: string } {
    let pending = this.vfs.resolvePath(input, this.state.cwd)
    let resolved: string[] = []
    const seen = new Set<string>()
    let links = 0

    while (pending.length > 0) {
      const part = pending.shift()!
      const candidate = [...resolved, part]
      const absolute = `/${candidate.join('/')}`
      const entry = this.vfs.lstat(absolute, [])
      if (entry.error) return { error: entry.error }
      if (!entry.node) return { error: `realpath: ${input}: No such file or directory` }
      if (entry.node.type !== 'symlink') {
        resolved.push(part)
        continue
      }
      if (!entry.node.target || seen.has(absolute) || ++links > 16) {
        return { error: `realpath: ${input}: Too many levels of symbolic links` }
      }
      seen.add(absolute)
      const target = this.vfs.resolvePath(entry.node.target, entry.node.target.startsWith('/') ? [] : resolved)
      pending = [...target, ...pending]
      resolved = []
    }
    return { path: `/${resolved.join('/')}` }
  }

  private cmdReadlink(args: string[]): ShellResult {
    const canonical = args.includes('-f') || args.includes('-e')
    const files = args.filter(arg => !arg.startsWith('-'))
    if (files.length !== 1) return { stdout: '', stderr: 'readlink: missing operand', exitCode: 1 }
    const procFd = files[0].match(/^\/proc\/(\d+)\/fd\/(\d+)$/)
    if (procFd) {
      const row = this.services.openFiles.find(candidate =>
        candidate.pid === Number(procFd[1]) && candidate.fd.match(/^\d+/)?.[0] === procFd[2],
      )
      return row
        ? { stdout: `${row.name}\n`, stderr: '', exitCode: 0 }
        : { stdout: '', stderr: `readlink: ${files[0]}: No such file or directory`, exitCode: 1 }
    }
    if (canonical) return this.cmdRealpath(files)
    const result = this.vfs.lstat(files[0], this.state.cwd)
    if (result.error) return { stdout: '', stderr: result.error, exitCode: 1 }
    if (!result.node || result.node.type !== 'symlink' || !result.node.target) {
      return { stdout: '', stderr: `readlink: ${files[0]}: Invalid argument`, exitCode: 1 }
    }
    return { stdout: `${result.node.target}\n`, stderr: '', exitCode: 0 }
  }

  private cmdRealpath(args: string[]): ShellResult {
    const files = args.filter(arg => !arg.startsWith('-'))
    if (files.length === 0) return { stdout: '', stderr: 'realpath: missing operand', exitCode: 1 }
    const paths: string[] = []
    for (const file of files) {
      const resolved = this.canonicalPath(file)
      if (resolved.error || !resolved.path) return { stdout: '', stderr: resolved.error ?? 'realpath: failed', exitCode: 1 }
      paths.push(resolved.path)
    }
    return { stdout: `${paths.join('\n')}\n`, stderr: '', exitCode: 0 }
  }

  private cmdFile(args: string[]): ShellResult {
    const files = args.filter(arg => !arg.startsWith('-'))
    if (files.length === 0) return { stdout: '', stderr: 'file: missing operand', exitCode: 1 }
    const output: string[] = []
    for (const file of files) {
      const result = this.vfs.lstat(file, this.state.cwd)
      if (result.error || !result.node) {
        output.push(`${file}: cannot open (No such file or directory)`)
        continue
      }
      const node = result.node
      if (node.type === 'directory') output.push(`${file}: directory`)
      else if (node.type === 'symlink') output.push(`${file}: symbolic link to ${node.target ?? ''}`)
      else if ((node.content ?? '').startsWith('#!')) output.push(`${file}: script text executable`)
      else if (/^\s*[[{]/.test(node.content ?? '')) output.push(`${file}: JSON or structured text data`)
      else output.push(`${file}: UTF-8 Unicode text`)
    }
    const failed = output.some(line => line.includes('cannot open'))
    return { stdout: `${output.join('\n')}\n`, stderr: '', exitCode: failed ? 1 : 0 }
  }

  private cmdLsblk(args: string[]): ShellResult {
    let device = ''
    let outputColumns: string[] = []
    let full = false
    for (let index = 0; index < args.length; index++) {
      const arg = args[index]
      if (arg === '-f' || arg === '--fs') {
        full = true
      } else if (arg === '-o' || arg === '--output') {
        const value = args[++index]
        if (!value) return { stdout: '', stderr: `lsblk: option '${arg}' requires an argument`, exitCode: 1 }
        outputColumns = value.split(',').map(column => column.toUpperCase())
      } else if (arg.startsWith('--output=')) {
        outputColumns = arg.slice('--output='.length).split(',').map(column => column.toUpperCase())
      } else if (arg.startsWith('-')) {
        return { stdout: '', stderr: `lsblk: unsupported option '${arg}'`, exitCode: 1 }
      } else if (device) {
        return { stdout: '', stderr: `lsblk: extra operand '${arg}'`, exitCode: 1 }
      } else {
        device = arg
      }
    }
    if (device && !['sda', '/dev/sda', 'sda1', '/dev/sda1', 'sda2', '/dev/sda2', 'sda3', '/dev/sda3'].includes(device)) {
      return { stdout: '', stderr: `lsblk: ${device}: not a block device`, exitCode: 32 }
    }
    if (outputColumns.length > 0) {
      const allowed = new Set(['NAME', 'MAJ:MIN', 'RM', 'SIZE', 'RO', 'TYPE', 'MOUNTPOINTS', 'FSTYPE', 'LABEL', 'UUID'])
      const unknown = outputColumns.find(column => !allowed.has(column))
      if (unknown) return { stdout: '', stderr: `lsblk: unknown column: ${unknown}`, exitCode: 1 }
      const rows = [
        { NAME: 'sda', 'MAJ:MIN': '8:0', RM: '0', SIZE: '152G', RO: '0', TYPE: 'disk', MOUNTPOINTS: '', FSTYPE: '', LABEL: '', UUID: '' },
        { NAME: 'sda1', 'MAJ:MIN': '8:1', RM: '0', SIZE: '50G', RO: '0', TYPE: 'part', MOUNTPOINTS: '/', FSTYPE: 'ext4', LABEL: '', UUID: '11111111-1111-1111-1111-111111111111' },
        { NAME: 'sda2', 'MAJ:MIN': '8:2', RM: '0', SIZE: '100G', RO: '0', TYPE: 'part', MOUNTPOINTS: '/home', FSTYPE: 'ext4', LABEL: '', UUID: '22222222-2222-2222-2222-222222222222' },
        { NAME: 'sda3', 'MAJ:MIN': '8:3', RM: '0', SIZE: '2G', RO: '0', TYPE: 'part', MOUNTPOINTS: '[SWAP]', FSTYPE: 'swap', LABEL: '', UUID: '33333333-3333-3333-3333-333333333333' },
        ...[...this.services.loopDevices.entries()].map(([loopDevice]) => ({
          NAME: loopDevice.replace('/dev/', ''), 'MAJ:MIN': '7:0', RM: '0', SIZE: '5M', RO: '0', TYPE: 'loop',
          MOUNTPOINTS: [...this.services.mounts.entries()].find(([, mount]) => mount.source === loopDevice)?.[0] ?? '',
          FSTYPE: 'ext4', LABEL: '', UUID: '',
        })),
      ]
      const normalizedDevice = device.replace('/dev/', '')
      const selected = !device || normalizedDevice === 'sda'
        ? rows
        : rows.filter(row => row.NAME === normalizedDevice)
      return {
        stdout: `${outputColumns.join(' ')}\n${selected.map(row => outputColumns.map(column => row[column as keyof typeof row]).join(' ')).join('\n')}\n`,
        stderr: '',
        exitCode: 0,
      }
    }
    const rows = full
      ? 'NAME   FSTYPE LABEL UUID                                 MOUNTPOINTS\nsda\n├─sda1 ext4         11111111-1111-1111-1111-111111111111 /\n├─sda2 ext4         22222222-2222-2222-2222-222222222222 /home\n└─sda3 swap         33333333-3333-3333-3333-333333333333 [SWAP]\n'
      : 'NAME   MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS\nsda      8:0    0  152G  0 disk\n├─sda1   8:1    0   50G  0 part /\n├─sda2   8:2    0  100G  0 part /home\n└─sda3   8:3    0    2G  0 part [SWAP]\n'
    const loops = [...this.services.loopDevices.entries()].map(([device, file]) => `${device.replace('/dev/', '').padEnd(8)} 7:0    0    5M  0 loop ${file}`).join('\n')
    return { stdout: rows + (loops ? loops + '\n' : ''), stderr: '', exitCode: 0 }
  }

  private cmdFindmnt(args: string[]): ShellResult {
    let target = ''
    let noHeadings = false
    let outputColumns = ['TARGET', 'SOURCE', 'FSTYPE', 'OPTIONS']
    for (let index = 0; index < args.length; index++) {
      const arg = args[index]
      if (arg === '-n' || arg === '--noheadings') {
        noHeadings = true
      } else if (arg === '-o' || arg === '--output') {
        const value = args[++index]
        if (!value) return { stdout: '', stderr: `findmnt: option '${arg}' requires an argument`, exitCode: 1 }
        outputColumns = value.split(',').map(column => column.toUpperCase())
      } else if (arg.startsWith('--output=')) {
        outputColumns = arg.slice('--output='.length).split(',').map(column => column.toUpperCase())
      } else if (arg.startsWith('-')) {
        return { stdout: '', stderr: `findmnt: unsupported option '${arg}'`, exitCode: 1 }
      } else if (target) {
        return { stdout: '', stderr: `findmnt: extra operand '${arg}'`, exitCode: 1 }
      } else {
        target = arg
      }
    }
    const allowed = new Set(['TARGET', 'SOURCE', 'FSTYPE', 'OPTIONS'])
    const unknown = outputColumns.find(column => !allowed.has(column))
    if (unknown) return { stdout: '', stderr: `findmnt: unknown column: ${unknown}`, exitCode: 1 }
    const mounts = [...this.services.mounts.entries()].map(([mountTarget, mount]) => ({ target: mountTarget, ...mount }))
    const selected = target ? mounts.filter(mount => mount.target === target) : mounts
    if (selected.length === 0) return { stdout: '', stderr: '', exitCode: 1 }
    const value = (mount: typeof selected[number], column: string) => (
      column === 'TARGET' ? mount.target
        : column === 'SOURCE' ? mount.source
          : column === 'FSTYPE' ? mount.type
            : mount.options
    )
    const header = noHeadings ? '' : `${outputColumns.join(' ')}\n`
    const rows = selected.map(mount => outputColumns.map(column => value(mount, column)).join(' '))
    return { stdout: `${header}${rows.join('\n')}\n`, stderr: '', exitCode: 0 }
  }

  private cmdMount(args: string[]): ShellResult {
    if (args.length === 0) {
      const rows = [...this.services.mounts.entries()].map(([target, mount]) => `${mount.source} on ${target} type ${mount.type} (${mount.options})`)
      return { stdout: rows.join('\n') + '\n', stderr: '', exitCode: 0 }
    }
    if (this.vfs.getCurrentUser() !== 'root') return { stdout: '', stderr: 'mount: only root can modify the mount table', exitCode: 32 }
    const operands: string[] = []
    const mountOptions = new Set<string>()
    let filesystemType = 'ext4'
    for (let index = 0; index < args.length; index++) {
      const arg = args[index]
      if (arg === '-o') {
        const value = args[++index]
        if (!value) return { stdout: '', stderr: 'mount: option -o requires an argument', exitCode: 1 }
        value.split(',').filter(Boolean).forEach(option => mountOptions.add(option))
      } else if (arg.startsWith('-o') && arg.length > 2) {
        arg.slice(2).split(',').filter(Boolean).forEach(option => mountOptions.add(option))
      } else if (arg === '-t') {
        filesystemType = args[++index] ?? ''
        if (!filesystemType) return { stdout: '', stderr: 'mount: option -t requires an argument', exitCode: 1 }
      } else if (arg.startsWith('-')) {
        return { stdout: '', stderr: `mount: unsupported option '${arg}'`, exitCode: 1 }
      } else {
        operands.push(arg)
      }
    }
    if (operands.length !== 2) return { stdout: '', stderr: 'mount: source and target are required', exitCode: 1 }
    const [source, target] = operands
    const targetNode = this.vfs.stat(target, this.state.cwd).node
    if (!targetNode || targetNode.type !== 'directory') return { stdout: '', stderr: `mount: ${target}: mount point does not exist`, exitCode: 32 }
    const absoluteTarget = `/${this.vfs.resolvePath(target, this.state.cwd).join('/')}`
    if (this.services.mounts.has(absoluteTarget)) return { stdout: '', stderr: `mount: ${absoluteTarget}: already mounted`, exitCode: 32 }
    let mountSource = source
    let loopDevice = ''
    const knownDevice = ['/dev/sda1', '/dev/sda2', '/dev/sda3'].includes(source) || this.services.loopDevices.has(source)
    if (!knownDevice && mountOptions.has('loop')) {
      const backing = this.vfs.stat(source, this.state.cwd).node
      if (!backing || backing.type !== 'file') return { stdout: '', stderr: `mount: ${source}: failed to set up loop device`, exitCode: 32 }
      loopDevice = Array.from({ length: 8 }, (_, index) => `/dev/loop${index}`).find(device => !this.services.loopDevices.has(device)) ?? ''
      if (!loopDevice) return { stdout: '', stderr: 'mount: failed to find an unused loop device', exitCode: 32 }
      mountSource = loopDevice
    } else if (!knownDevice) {
      return { stdout: '', stderr: `mount: ${source}: special device does not exist`, exitCode: 32 }
    }
    const allowedOptions = new Set(['loop', 'ro', 'rw', 'nosuid', 'nodev', 'noexec', 'relatime'])
    const unsupported = [...mountOptions].find(option => !allowedOptions.has(option))
    if (unsupported) return { stdout: '', stderr: `mount: unsupported option '${unsupported}'`, exitCode: 1 }
    const storedOptions = [...mountOptions].filter(option => option !== 'loop')
    if (!storedOptions.includes('ro') && !storedOptions.includes('rw')) storedOptions.unshift('rw')
    if (!storedOptions.includes('relatime')) storedOptions.push('relatime')
    if (loopDevice) {
      this.services.loopDevices.set(loopDevice, `/${this.vfs.resolvePath(source, this.state.cwd).join('/')}`)
    }
    this.services.mounts.set(absoluteTarget, { source: mountSource, type: filesystemType, options: storedOptions.join(',') })
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdLosetup(args: string[]): ShellResult {
    if (args.includes('-a')) {
      const rows = [...this.services.loopDevices.entries()].map(([device, file]) => `${device}: [0000]:0 (${file})`)
      return { stdout: rows.join('\n') + (rows.length ? '\n' : ''), stderr: '', exitCode: 0 }
    }
    const free = Array.from({ length: 8 }, (_, index) => `/dev/loop${index}`).find(device => !this.services.loopDevices.has(device))
    if (args.length === 1 && args[0] === '-f') return free ? { stdout: `${free}\n`, stderr: '', exitCode: 0 } : { stdout: '', stderr: 'losetup: cannot find an unused loop device', exitCode: 1 }
    if (this.vfs.getCurrentUser() !== 'root') return { stdout: '', stderr: 'losetup: permission denied', exitCode: 1 }
    if (args[0] === '-d') {
      const device = args[1]
      if (!this.services.loopDevices.has(device)) return { stdout: '', stderr: `losetup: ${device}: failed to use device`, exitCode: 1 }
      if ([...this.services.mounts.values()].some(mount => mount.source === device)) return { stdout: '', stderr: `losetup: ${device}: device is busy`, exitCode: 1 }
      this.services.loopDevices.delete(device)
      return { stdout: '', stderr: '', exitCode: 0 }
    }
    const [device, file] = args
    if (!/^\/dev\/loop[0-7]$/.test(device ?? '') || !file) return { stdout: '', stderr: 'losetup: loop device and backing file are required', exitCode: 1 }
    if (this.services.loopDevices.has(device)) return { stdout: '', stderr: `losetup: ${device}: device is busy`, exitCode: 1 }
    if (!this.vfs.stat(file, this.state.cwd).node) return { stdout: '', stderr: `losetup: ${file}: failed to set up loop device`, exitCode: 1 }
    this.services.loopDevices.set(device, `/${this.vfs.resolvePath(file, this.state.cwd).join('/')}`)
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdFsck(args: string[]): ShellResult {
    if (this.vfs.getCurrentUser() !== 'root') return { stdout: '', stderr: 'fsck: must be root', exitCode: 8 }
    if (!args.includes('-n')) return { stdout: '', stderr: 'fsck: only read-only -n checks are enabled', exitCode: 8 }
    const device = args.find(arg => !arg.startsWith('-'))
    const known = !!device && (['/dev/sda1', '/dev/sda2', '/dev/sda3'].includes(device) || this.services.loopDevices.has(device))
    if (!known) return { stdout: '', stderr: `fsck: ${device ?? ''}: No such file or directory`, exitCode: 8 }
    if ([...this.services.mounts.values()].some(mount => mount.source === device)) return { stdout: '', stderr: `fsck: ${device} is mounted; refusing even read-only simulation`, exitCode: 8 }
    return { stdout: `${device}: clean, 12/65536 files, 4096/262144 blocks\n`, stderr: '', exitCode: 0 }
  }

  private cmdLdd(args: string[]): ShellResult {
    const file = args.find(arg => !arg.startsWith('-'))
    if (!file) return { stdout: '', stderr: 'ldd: missing file arguments', exitCode: 1 }
    if (!['/usr/bin/node', '/usr/bin/python', '/usr/bin/python3', '/usr/bin/nginx'].includes(file)) {
      return { stdout: '', stderr: `\tnot a dynamic executable: ${file}`, exitCode: 1 }
    }
    return { stdout: '\tlinux-vdso.so.1 (0x00007fff00000000)\n\tlibc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x00007f0000000000)\n\t/lib64/ld-linux-x86-64.so.2 (0x00007f0000200000)\n', stderr: '', exitCode: 0 }
  }

  private cmdTcpdump(args: string[]): ShellResult {
    const countIndex = args.indexOf('-c')
    const count = Number(countIndex >= 0 ? args[countIndex + 1] : NaN)
    if (!Number.isInteger(count) || count < 1 || count > 100) return { stdout: '', stderr: 'tcpdump: a bounded -c count from 1 to 100 is required', exitCode: 1 }
    const interfaceIndex = args.indexOf('-i')
    const iface = interfaceIndex >= 0 ? args[interfaceIndex + 1] : 'eth0'
    if (!['eth0', 'lo', 'any'].includes(iface)) return { stdout: '', stderr: `tcpdump: ${iface}: No such device exists`, exitCode: 1 }
    const packets = Array.from({ length: count }, (_, index) => `10:00:0${index}.000000 IP 10.0.0.5.${3000 + index} > 10.0.0.1.443: Flags [P.], length 64`)
    return { stdout: packets.join('\n') + '\n', stderr: `tcpdump: listening on ${iface}, link-type EN10MB (Ethernet), snapshot length 262144 bytes\n${count} packets captured\n`, exitCode: 0 }
  }

  private cmdIp(args: string[]): ShellResult {
    const subcommand = args.find(arg => !arg.startsWith('-')) ?? ''
    if (subcommand === 'addr' || subcommand === 'address' || subcommand === 'a') {
      return { stdout: '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536\n    inet 127.0.0.1/8 scope host lo\n2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500\n    inet 10.0.0.5/24 brd 10.0.0.255 scope global eth0\n', stderr: '', exitCode: 0 }
    }
    if (subcommand === 'route' || subcommand === 'r') {
      return { stdout: 'default via 10.0.0.1 dev eth0\n10.0.0.0/24 dev eth0 proto kernel scope link src 10.0.0.5\n', stderr: '', exitCode: 0 }
    }
    if (subcommand === 'link' || subcommand === 'l') {
      return { stdout: '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 state UNKNOWN\n2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP\n', stderr: '', exitCode: 0 }
    }
    return { stdout: '', stderr: 'Usage: ip { address | link | route }', exitCode: 1 }
  }

  private cmdLsof(args: string[]): ShellResult {
    let rows = [...this.services.openFiles]
    if (args.includes('+L1')) rows = rows.filter(row => row.deleted)
    const internetIndex = args.indexOf('-i')
    const compactInternet = args.find(arg => arg.startsWith('-i') && arg.length > 2)
    if (internetIndex >= 0 || compactInternet) {
      const selector = compactInternet?.slice(2) || (internetIndex >= 0 && args[internetIndex + 1]?.startsWith(':') ? args[internetIndex + 1] : '')
      rows = rows.filter(row => row.type.startsWith('IPv'))
      if (selector) rows = rows.filter(row => row.name.includes(selector))
    }
    const selectorIndex = internetIndex >= 0 && args[internetIndex + 1]?.startsWith(':') ? internetIndex + 1 : -1
    const paths = args.filter((arg, index) => !arg.startsWith('-') && !arg.startsWith('+') && index !== selectorIndex)
    if (paths.length > 0) rows = rows.filter(row => paths.some(path => row.name.startsWith(path)))
    if (rows.length === 0) return { stdout: '', stderr: '', exitCode: 1 }
    const output = rows.map(row => `${row.command.padEnd(10)} ${String(row.pid).padEnd(6)} ${row.user.padEnd(9)} ${row.fd.padEnd(5)} ${row.type.padEnd(5)} ${row.name}`)
    return { stdout: `COMMAND    PID    USER      FD    TYPE  NAME\n${output.join('\n')}\n`, stderr: '', exitCode: 0 }
  }

  private normalizeHomePath(path: string): string {
    if (path === '~') return this.state.env.HOME
    return path.startsWith('~/') ? `${this.state.env.HOME}/${path.slice(2)}` : path
  }

  private cmdSshKeygen(args: string[]): ShellResult {
    let type = 'ed25519'
    let output = `${this.state.env.HOME}/.ssh/id_ed25519`
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-t') {
        if (!args[i + 1]) return { stdout: '', stderr: 'ssh-keygen: option requires an argument -- t', exitCode: 1 }
        type = args[++i]
      } else if (args[i] === '-f') {
        if (!args[i + 1]) return { stdout: '', stderr: 'ssh-keygen: option requires an argument -- f', exitCode: 1 }
        output = this.normalizeHomePath(args[++i])
      } else if (['-N', '-C'].includes(args[i])) {
        if (!args[i + 1]) return { stdout: '', stderr: `ssh-keygen: option requires an argument -- ${args[i].slice(1)}`, exitCode: 1 }
        i++
      } else if (args[i].startsWith('-')) {
        return { stdout: '', stderr: `ssh-keygen: unsupported option ${args[i]}`, exitCode: 1 }
      }
    }
    if (!['ed25519', 'rsa'].includes(type)) return { stdout: '', stderr: `unknown key type ${type}`, exitCode: 1 }
    if (this.vfs.lstat(output, this.state.cwd).node || this.vfs.lstat(`${output}.pub`, this.state.cwd).node) {
      return { stdout: '', stderr: `${output} already exists.`, exitCode: 1 }
    }
    const parts = this.vfs.resolvePath(output, this.state.cwd)
    const parent = `/${parts.slice(0, -1).join('/')}`
    if (!this.vfs.stat(parent, []).node) {
      const created = this.vfs.createDirectory(parent, [])
      if (created.error) return { stdout: '', stderr: created.error, exitCode: 1 }
    }
    const privateKey = `-----BEGIN GHOSTOS SIMULATED ${type.toUpperCase()} PRIVATE KEY-----\ntraining-only-key-material\n-----END GHOSTOS SIMULATED ${type.toUpperCase()} PRIVATE KEY-----\n`
    const publicType = type === 'rsa' ? 'ssh-rsa' : 'ssh-ed25519'
    const publicKey = `${publicType} R2hvc3RPUy1zaW11bGF0ZWQta2V5 ghost@neonmall-server\n`
    const privateResult = this.vfs.writeFile(output, this.state.cwd, privateKey)
    if (privateResult.error) return { stdout: '', stderr: privateResult.error, exitCode: 1 }
    const modeResult = this.vfs.chmod(output, this.state.cwd, '600')
    if (modeResult.error) return { stdout: '', stderr: modeResult.error, exitCode: 1 }
    const publicResult = this.vfs.writeFile(`${output}.pub`, this.state.cwd, publicKey)
    if (publicResult.error) return { stdout: '', stderr: publicResult.error, exitCode: 1 }
    return { stdout: `Your simulated public key has been saved in ${output}.pub\n`, stderr: '', exitCode: 0 }
  }

  private cmdSsh(args: string[]): ShellResult {
    let port = 22
    let identity = ''
    let target = ''
    let command: string[] = []
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      if (arg === '-p' || arg === '-i') {
        const value = args[++i]
        if (!value) return { stdout: '', stderr: `ssh: option requires an argument -- ${arg.slice(1)}`, exitCode: 255 }
        if (arg === '-p') {
          port = Number(value)
          if (!Number.isInteger(port) || port < 1 || port > 65535) return { stdout: '', stderr: `Bad port '${value}'`, exitCode: 255 }
        } else identity = this.normalizeHomePath(value)
        continue
      }
      if (arg.startsWith('-')) return { stdout: '', stderr: `ssh: unsupported option ${arg}`, exitCode: 255 }
      target = arg
      command = args.slice(i + 1)
      break
    }
    if (!target) return { stdout: '', stderr: 'usage: ssh [user@]hostname [command]', exitCode: 255 }
    if (identity && !this.vfs.stat(identity, this.state.cwd).node) {
      return { stdout: '', stderr: `Warning: Identity file ${identity} not accessible.`, exitCode: 255 }
    }
    const at = target.lastIndexOf('@')
    const user = at >= 0 ? target.slice(0, at) : this.state.env.USER
    const host = at >= 0 ? target.slice(at + 1) : target
    if (!['localhost', '127.0.0.1', 'neonmall-server', '10.0.0.5'].includes(host)) {
      return { stdout: '', stderr: `ssh: Could not resolve hostname ${host}: Name or service not known`, exitCode: 255 }
    }
    if (port !== 22) return { stdout: '', stderr: `ssh: connect to host ${host} port ${port}: Connection refused`, exitCode: 255 }
    if (command.length === 0) {
      return { stdout: `Simulated SSH session to ${user}@${host} opened and closed.\n`, stderr: '', exitCode: 0 }
    }
    if (command[0] === 'whoami') return { stdout: `${user}\n`, stderr: '', exitCode: 0 }
    if (command[0] === 'hostname') return { stdout: 'neonmall-server\n', stderr: '', exitCode: 0 }
    if (command[0] === 'pwd') return { stdout: `/home/${user}\n`, stderr: '', exitCode: 0 }
    return { stdout: '', stderr: `bash: ${command[0]}: command not found`, exitCode: 127 }
  }

  private parseDdSize(value: string): number | null {
    const match = value.match(/^(\d+)([kKmM]?)$/)
    if (!match) return null
    const multiplier = match[2].toLowerCase() === 'k' ? 1024 : match[2].toLowerCase() === 'm' ? 1024 * 1024 : 1
    const size = Number(match[1]) * multiplier
    return Number.isSafeInteger(size) ? size : null
  }

  private cmdDd(args: string[], stdin: string): ShellResult {
    const options = new Map<string, string>()
    for (const arg of args) {
      const separator = arg.indexOf('=')
      if (separator <= 0) return { stdout: '', stderr: `dd: unrecognized operand '${arg}'`, exitCode: 1 }
      const key = arg.slice(0, separator)
      if (!['if', 'of', 'bs', 'count'].includes(key)) return { stdout: '', stderr: `dd: unrecognized operand '${arg}'`, exitCode: 1 }
      options.set(key, arg.slice(separator + 1))
    }
    const blockSize = this.parseDdSize(options.get('bs') ?? '512')
    const countText = options.get('count')
    const count = countText === undefined ? null : Number(countText)
    if (blockSize === null || blockSize < 1 || blockSize > 1024 * 1024 || (count !== null && (!Number.isInteger(count) || count < 0 || count > 1024))) {
      return { stdout: '', stderr: 'dd: invalid or unsafe block size/count', exitCode: 1 }
    }
    const maximum = count === null ? 10 * 1024 * 1024 : blockSize * count
    if (maximum > 10 * 1024 * 1024) return { stdout: '', stderr: 'dd: requested copy exceeds the 10 MiB simulator limit', exitCode: 1 }
    let content = stdin
    const input = options.get('if')
    if (input) {
      if (input === '/dev/zero') content = '\0'.repeat(maximum)
      else {
        const read = this.vfs.readFile(input, this.state.cwd)
        if (read.error) return { stdout: '', stderr: `dd: failed to open '${input}': No such file or directory`, exitCode: 1 }
        content = read.content
      }
    }
    if (content.length > 10 * 1024 * 1024) content = content.slice(0, 10 * 1024 * 1024)
    const copied = count === null ? content : content.slice(0, maximum)
    const output = options.get('of')
    if (output?.startsWith('/dev/') && output !== '/dev/null') {
      return { stdout: '', stderr: `dd: writing to ${output} is disabled in the browser simulator`, exitCode: 1 }
    }
    if (output && output !== '/dev/null') {
      const written = this.vfs.writeFile(output, this.state.cwd, copied)
      if (written.error) return { stdout: '', stderr: written.error, exitCode: 1 }
    }
    return {
      stdout: output ? '' : copied,
      stderr: `${copied.length} bytes copied (GhostOS simulated)\n`,
      exitCode: 0,
    }
  }

  private cmdLogrotate(args: string[]): ShellResult {
    const force = args.includes('-f')
    const dryRun = args.includes('-d')
    const config = args.find(arg => !arg.startsWith('-'))
    if (!config) return { stdout: '', stderr: 'logrotate: missing config file', exitCode: 1 }
    const read = this.vfs.readFile(config, this.state.cwd)
    if (read.error) return { stdout: '', stderr: read.error, exitCode: 1 }
    if (/\b(postrotate|prerotate|firstaction|lastaction|include|compress|mail)\b/.test(read.content)) {
      return { stdout: '', stderr: 'logrotate: hooks, includes, compression, and mail are disabled', exitCode: 1 }
    }
    const parsed = read.content.trim().match(/^(\S+)\s*\{\s*rotate\s+(\d+)\s*\}$/s)
    if (!parsed) return { stdout: '', stderr: 'logrotate: unsupported or malformed configuration', exitCode: 1 }
    const [, logPath, rotateText] = parsed
    const rotate = Number(rotateText)
    if (!Number.isInteger(rotate) || rotate < 1 || rotate > 20) return { stdout: '', stderr: 'logrotate: rotate count must be from 1 to 20', exitCode: 1 }
    const log = this.vfs.stat(logPath, this.state.cwd).node
    if (!log || log.type !== 'file') return { stdout: '', stderr: `logrotate: ${logPath}: No such regular file`, exitCode: 1 }
    if (!force && log.size === 0) return { stdout: '', stderr: '', exitCode: 0 }
    if (dryRun) return { stdout: `rotating pattern: ${logPath} ${rotate} rotations\n`, stderr: '', exitCode: 0 }
    const oldest = `${logPath}.${rotate}`
    if (this.vfs.lstat(oldest, this.state.cwd).node) {
      const removed = this.vfs.deleteFile(oldest, this.state.cwd)
      if (removed.error) return { stdout: '', stderr: removed.error, exitCode: 1 }
    }
    for (let index = rotate - 1; index >= 1; index--) {
      const source = `${logPath}.${index}`
      if (!this.vfs.lstat(source, this.state.cwd).node) continue
      const moved = this.vfs.move(source, `${logPath}.${index + 1}`, this.state.cwd)
      if (moved.error) return { stdout: '', stderr: moved.error, exitCode: 1 }
    }
    const content = log.content ?? ''
    const mode = log.permissions
    const owner = log.owner
    const group = log.group
    const moved = this.vfs.move(logPath, `${logPath}.1`, this.state.cwd)
    if (moved.error) return { stdout: '', stderr: moved.error, exitCode: 1 }
    const created = this.vfs.writeFile(logPath, this.state.cwd, '')
    if (created.error) return { stdout: '', stderr: created.error, exitCode: 1 }
    const fresh = this.vfs.stat(logPath, this.state.cwd).node
    if (fresh) {
      fresh.permissions = mode
      fresh.owner = owner
      fresh.group = group
    }
    void content
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  private cmdPatch(args: string[], stdin: string): ShellResult {
    if (args.some(arg => !['-p0', '--dry-run', '-i'].includes(arg) && arg.startsWith('-'))) {
      return { stdout: '', stderr: 'patch: unsupported option', exitCode: 1 }
    }
    const inputIndex = args.indexOf('-i')
    let patchText = stdin
    if (inputIndex >= 0) {
      const file = args[inputIndex + 1]
      if (!file) return { stdout: '', stderr: 'patch: -i requires a file', exitCode: 1 }
      const read = this.vfs.readFile(file, this.state.cwd)
      if (read.error) return { stdout: '', stderr: read.error, exitCode: 1 }
      patchText = read.content
    }
    if (!patchText || patchText.length > MAX_GREP_INPUT) return { stdout: '', stderr: 'patch: missing or oversized patch input', exitCode: 1 }
    const lines = patchText.split('\n')
    if (!lines[0]?.startsWith('--- ') || !lines[1]?.startsWith('+++ ')) return { stdout: '', stderr: 'patch: only unified diffs are supported', exitCode: 1 }
    const target = lines[1].slice(4).trim().split(/\s/)[0]
    if (!target || target.startsWith('/') || target.split('/').includes('..')) return { stdout: '', stderr: 'patch: unsafe target path', exitCode: 1 }
    const header = lines[2]?.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
    if (!header || lines.slice(3).some(line => line.startsWith('@@ '))) return { stdout: '', stderr: 'patch: exactly one valid hunk is supported', exitCode: 1 }
    const body = lines.slice(3).filter((line, index, all) => !(index === all.length - 1 && line === ''))
    if (body.some(line => ![' ', '+', '-'].includes(line[0]))) return { stdout: '', stderr: 'patch: malformed hunk', exitCode: 1 }
    const read = this.vfs.readFile(target, this.state.cwd)
    if (read.error) return { stdout: '', stderr: read.error, exitCode: 1 }
    const hadNewline = read.content.endsWith('\n')
    const original = read.content.split('\n')
    if (hadNewline) original.pop()
    const oldStart = Number(header[1])
    const oldCount = Number(header[2] ?? 1)
    const newStart = Number(header[3])
    const newCount = Number(header[4] ?? 1)
    if (
      !Number.isSafeInteger(oldStart)
      || !Number.isSafeInteger(oldCount)
      || !Number.isSafeInteger(newStart)
      || !Number.isSafeInteger(newCount)
      || oldStart < 0
      || oldCount < 0
      || newStart < 0
      || newCount < 0
      || (oldStart === 0 && oldCount !== 0)
      || (newStart === 0 && newCount !== 0)
    ) {
      return { stdout: '', stderr: 'patch: invalid hunk range', exitCode: 1 }
    }
    const start = oldStart === 0 ? 0 : oldStart - 1
    const expected = body.filter(line => line[0] !== '+').map(line => line.slice(1))
    const replacement = body.filter(line => line[0] !== '-').map(line => line.slice(1))
    if (expected.length !== oldCount || replacement.length !== newCount || start > original.length) {
      return { stdout: '', stderr: 'patch: hunk line counts do not match the header', exitCode: 1 }
    }
    if (original.slice(start, start + expected.length).join('\n') !== expected.join('\n')) {
      return { stdout: '', stderr: 'patch: hunk FAILED -- context mismatch', exitCode: 1 }
    }
    const result = [...original.slice(0, start), ...replacement, ...original.slice(start + expected.length)].join('\n') + (hadNewline ? '\n' : '')
    if (!args.includes('--dry-run')) {
      const written = this.vfs.writeFile(target, this.state.cwd, result)
      if (written.error) return { stdout: '', stderr: written.error, exitCode: 1 }
    }
    return { stdout: `patching file ${target}\n`, stderr: '', exitCode: 0 }
  }

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
    const cmd = args[0]
    if (!cmd) return { stdout: '', stderr: '', exitCode: 1 }
    if (SHELL_BUILTINS.has(cmd)) return { stdout: '', stderr: `${cmd}: shell builtin`, exitCode: 1 }
    if (SIMULATED_EXECUTABLES.has(cmd)) return { stdout: `/usr/bin/${cmd}\n`, stderr: '', exitCode: 0 }
    const paths = ['/bin', '/usr/bin', '/usr/local/bin']
    for (const p of paths) {
      const st = this.vfs.stat(p + '/' + cmd, [])
      if (st.node) return { stdout: p + '/' + cmd, stderr: '', exitCode: 0 }
    }
    return { stdout: '', stderr: `which: no ${cmd} in (${this.state.env.PATH})`, exitCode: 1 }
  }

  private cmdType(args: string[]): ShellResult {
    const all = args[0] === '-a'
    const cmd = all ? args[1] : args[0]
    if (!cmd) return { stdout: '', stderr: 'type: missing operand', exitCode: 1 }
    if (all) {
      const resolutions: string[] = []
      if (this.state.aliases[cmd]) resolutions.push(`${cmd} is aliased to '${this.state.aliases[cmd]}'`)
      if (SHELL_BUILTINS.has(cmd)) resolutions.push(`${cmd} is a shell builtin`)
      if (SIMULATED_EXECUTABLES.has(cmd)) resolutions.push(`${cmd} is /usr/bin/${cmd}`)
      for (const path of ['/bin', '/usr/bin', '/usr/local/bin']) {
        if (this.vfs.stat(`${path}/${cmd}`, []).node && !resolutions.includes(`${cmd} is ${path}/${cmd}`)) {
          resolutions.push(`${cmd} is ${path}/${cmd}`)
        }
      }
      return resolutions.length > 0
        ? { stdout: `${resolutions.join('\n')}\n`, stderr: '', exitCode: 0 }
        : { stdout: '', stderr: `bash: type: ${cmd}: not found`, exitCode: 1 }
    }
    if (this.state.aliases[cmd]) return { stdout: `${cmd} is aliased to '${this.state.aliases[cmd]}'\n`, stderr: '', exitCode: 0 }
    if (SHELL_BUILTINS.has(cmd)) return { stdout: `${cmd} is a shell builtin\n`, stderr: '', exitCode: 0 }
    const which = this.cmdWhich([cmd])
    if (which.exitCode === 0) return { stdout: `${cmd} is ${which.stdout.trim()}\n`, stderr: '', exitCode: 0 }
    return { stdout: '', stderr: `bash: type: ${cmd}: not found`, exitCode: 1 }
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
    if (args[0] === '-c') {
      if (args.length > 1) return { stdout: '', stderr: `history: extra operand '${args[1]}'`, exitCode: 1 }
      this.state.history = []
      return { stdout: '', stderr: '', exitCode: 0 }
    }
    if (args[0] === '-d') {
      if (args.length !== 2 || !/^\d+$/.test(args[1])) {
        return { stdout: '', stderr: 'history: -d requires one positive history offset', exitCode: 1 }
      }
      const offset = Number(args[1])
      if (offset < 1 || offset > this.state.history.length) {
        return { stdout: '', stderr: `history: ${offset}: history position out of range`, exitCode: 1 }
      }
      this.state.history.splice(offset - 1, 1)
      return { stdout: '', stderr: '', exitCode: 0 }
    }
    let start = 0
    if (args.length > 0) {
      if (args.length > 1 || !/^\d+$/.test(args[0])) {
        return { stdout: '', stderr: `history: ${args[0]}: invalid option or count`, exitCode: 1 }
      }
      start = Math.max(0, this.state.history.length - Number(args[0]))
    }
    let stdout = ''
    this.state.history.slice(start).forEach((h, i) => { stdout += `${String(i + start + 1).padStart(4)}  ${h}\n` })
    return { stdout, stderr: '', exitCode: 0 }
  }

  private cmdAlias(args: string[]): ShellResult {
    if (args.length === 0) {
      let stdout = ''
      for (const [k, v] of Object.entries(this.state.aliases)) stdout += `alias ${k}='${v}'\n`
      return { stdout, stderr: '', exitCode: 0 }
    }
    let stdout = ''
    let stderr = ''
    let exitCode = 0
    for (const a of args) {
      if (a.startsWith('-')) {
        stderr += `alias: invalid option '${a}'\n`
        exitCode = 1
        continue
      }
      const eq = a.indexOf('=')
      if (eq > 0) {
        const name = a.slice(0, eq)
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
          stderr += `alias: '${name}': invalid alias name\n`
          exitCode = 1
          continue
        }
        const val = a.slice(eq + 1).replace(/^['"]|['"]$/g, '')
        this.state.aliases[name] = val
      } else if (eq === -1 && this.state.aliases[a] !== undefined) {
        stdout += `alias ${a}='${this.state.aliases[a]}'\n`
      } else {
        stderr += `alias: ${a}: not found\n`
        exitCode = 1
      }
    }
    return { stdout, stderr, exitCode }
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
    const operands = args[0] === '--' ? args.slice(1) : args
    if (args[0] !== '--' && operands.some(operand => operand.startsWith('-'))) {
      return { stdout: '', stderr: `pushd: invalid option '${operands.find(operand => operand.startsWith('-'))}'`, exitCode: 1 }
    }
    if (operands.length > 1) return { stdout: '', stderr: `pushd: too many arguments`, exitCode: 1 }
    if (operands.length === 0) {
      if (this.state.dirStack.length === 0) return { stdout: '', stderr: 'pushd: no other directory', exitCode: 1 }
      const previous = [...this.state.cwd]
      const target = this.state.dirStack[this.state.dirStack.length - 1]
      this.state.dirStack[this.state.dirStack.length - 1] = previous
      this.state.cwd = target
      this.state.env.OLDPWD = '/' + previous.join('/')
      this.state.env.PWD = '/' + target.join('/')
      return { stdout: this.state.dirStack.map(d => '/' + d.join('/')).join(' ') + ' ' + '/' + this.state.cwd.join('/') + '\n', stderr: '', exitCode: 0 }
    }
    const path = operands[0]
    const parts = this.vfs.resolvePath(path, this.state.cwd)
    const target = this.vfs.stat(`/${parts.join('/')}`, [])
    if (!target.node) return { stdout: '', stderr: `pushd: ${path}: No such file or directory`, exitCode: 1 }
    if (target.node.type !== 'directory') return { stdout: '', stderr: `pushd: ${path}: Not a directory`, exitCode: 1 }
    if (!this.vfs.hasPermission(`/${parts.join('/')}`, [], 'execute')) return { stdout: '', stderr: `pushd: ${path}: Permission denied`, exitCode: 1 }
    const previous = [...this.state.cwd]
    this.state.dirStack.push(previous)
    this.state.cwd = parts
    this.state.env.OLDPWD = '/' + previous.join('/')
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
