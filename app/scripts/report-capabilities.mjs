import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SHELL_PATTERNS = new Set([
  '--help', '.env', 'alias', 'apropos', 'apt', 'apt search nginx', 'awk', 'basename', 'bash', 'bg', 'cargo',
  'cd', 'cd -', 'cd ..', 'chgrp', 'chgrp sudo ownership.txt', 'chmod', 'chmod +t', 'chmod 640 lockdown.conf',
  'chmod 640 secure.conf', 'chmod 640 service.conf', 'chmod 644', 'chmod 755', 'chmod g-w', 'chmod u+x',
  'chmod u+x run.sh', 'chown', 'chown root:root lockdown.conf', 'chown root:root ownership.txt',
  'chown www-data:www-data service.conf',
  'command -v', 'cp', 'cp -i', 'cp -n', 'cp -p', 'crontab', 'csplit', 'curl', 'curl -I', 'dd',
  'dd if=/etc/hostname of=hostname.backup', 'dd if=input.bin of=copy.bin',
  'df', 'diff', 'dig', 'dirname', 'dmesg', 'dpkg', 'du', 'fg', 'file', 'find', "find drill -name '*.tmp'", 'find -mtime',
  'find -name', 'find -perm', 'find -print0', 'find -size', 'findmnt', 'fsck', 'getfacl', 'getopts',
  'git', 'git add', 'git add resolved.txt', 'git bisect', 'git branch', 'git checkout', 'git diff',
  'git merge', 'git merge incident', 'git rebase',
  'git reflog', 'git reset', 'git restore', 'git revert', 'git stash', 'git status', 'git switch', 'go test',
  'grep', 'grep -n', 'grep -R', 'gzip', 'history', 'id', 'ip', 'journalctl', 'journalctl -u nginx', 'jq',
  'kill', 'kill -CONT 1842', 'kill -STOP 1842', 'kill -TERM', 'kill -TERM 1842',
  'ldd', 'less', 'ln', 'ln -s', 'logger', 'logrotate', 'losetup', 'ls', 'ls -a', 'ls -l', 'lsblk',
  'lsof', 'lsof +L1', 'make', 'man', 'md5sum', 'mkdir -p', 'mount', 'mv', 'nc', 'nice', 'node',
  'nohup', 'nohup true &', 'npm', 'npm ci', 'npm run', 'patch', 'pgrep', 'pgrep node', 'ping',
  'pip freeze', 'popd',
  'ps', 'ps -ef', 'pushd', 'pwd', 'python -m venv', 'read', 'readlink', 'readlink /proc/1891/fd/4', 'realpath',
  'renice', 'rm', 'rm -i', 'rm -i drill/nested/decoy.tmp', 'rm decoy.txt', 'rsync', 'scp', 'screen',
  'screen -S', 'screen -r', 'sed -n',
  'set -o pipefail', 'setfacl', 'sha256sum', 'sort', 'split', 'ss', 'ssh', 'ssh-keygen', 'stat',
  'stat signal.conf', 'strace', 'sudo', 'systemctl', 'systemctl list-timers', 'systemctl restart',
  'systemctl status nginx', 'tail',
  'tail -f', 'tar', 'tar -c', 'tar -p', 'tar -x', 'tcpdump', 'tee', 'test', 'timeout', 'tmux',
  'tmux attach', 'tmux copy-mode', 'tmux detach', 'tmux new-window', 'tmux split', 'top', 'touch',
  'touch -t', 'touch -t 202401010830 signal.conf', 'trap', 'tree', 'truncate', 'type', 'type -a',
  'umask', 'uniq -c', 'unzip', 'watch', 'which', 'whoami', 'xargs -0', 'xz', 'zellij', 'zip',
  'ls -l secure.conf',
])

const TERMINAL_PATTERNS = new Set([
  '.editor', '.exit', '.quit', '/', ':%s', ':q', ':q!', ':wq', '?', '\\q', 'Alt-.', 'Ctrl-C', 'Ctrl-D', 'Ctrl-G',
  'Ctrl-K', 'Ctrl-O', 'Ctrl-Q', 'Ctrl-R', 'Ctrl-S', 'Ctrl-U', 'Ctrl-X', 'Ctrl-Z', 'Ctrl-a d', 'Esc',
  'exit()', 'q',
])

const SYNTAX_PATTERNS = new Set([
  '"', '$?', '$VAR', '&&', "'", '2>', '>', '>>', '\\', '|', '||',
])

// Ambiguous tokens such as `?` have different runtimes depending on the level.
// Keep those classifications contextual instead of promoting a token globally.
const CONTEXT_CATEGORIES = new Map([
  ['array-vault\u0000array', 'syntax'],
  ['function-token\u0000function', 'syntax'],
  ['glob-storm\u0000*', 'syntax'],
  ['glob-storm\u0000?', 'syntax'],
  ['heredoc-msg\u0000<<', 'syntax'],
  ['if-gate\u0000if', 'syntax'],
  ['long-task\u0000&', 'syntax'],
  ['loop-patrol\u0000for', 'syntax'],
  ['loop-patrol\u0000while', 'syntax'],
  ['op-broken-deploy\u0000if', 'syntax'],
  ['process-sub\u0000<()', 'syntax'],
  ['read-lines\u0000while read', 'syntax'],
])

function getRuntimeCommandRows(catalog) {
  const rows = []
  for (const raw of catalog) {
    const objectives = (raw.o ?? raw.objectives ?? []).map(objective => ({
      id: objective.i ?? objective.id ?? 'obj',
      label: objective.l ?? objective.label_en ?? objective.label ?? '',
    }))
    const legacyObjectives = objectives.filter(objective => /^obj-\d+$/.test(objective.id))
    let progressCheckIndex = 0

    for (const rawCheck of raw.c ?? raw.checks ?? []) {
      const type = rawCheck.t ?? rawCheck.type ?? 'command_used'
      let pattern = rawCheck.p ?? rawCheck.pattern ?? ''
      const objective = type === 'no_red_command_used'
        ? undefined
        : legacyObjectives[progressCheckIndex++]

      if (type === 'command_used' && objective) {
        const expected = objective.label.match(/^Master the use of (.+)$/i)?.[1]?.trim()
        if (
          expected
          && pattern
          && expected.toLocaleLowerCase().startsWith(`${pattern.toLocaleLowerCase()} `)
        ) {
          pattern = expected
        }
      }

      if (type === 'command_used') rows.push({ levelId: raw.id, pattern })
    }
  }
  return rows
}

function classify(row) {
  const contextual = CONTEXT_CATEGORIES.get(`${row.levelId}\u0000${row.pattern}`)
  if (contextual) return contextual
  if (SHELL_PATTERNS.has(row.pattern)) return 'shell'
  if (TERMINAL_PATTERNS.has(row.pattern)) return 'terminal'
  if (SYNTAX_PATTERNS.has(row.pattern)) return 'syntax'
  return 'unsupported'
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

const catalogPath = fileURLToPath(new URL('../src/data/all_levels.json', import.meta.url))
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
const rows = getRuntimeCommandRows(catalog).map(row => ({ ...row, category: classify(row) }))
const levelIds = catalog.map(level => level.id)
const blockedByLevel = new Map(levelIds.map(levelId => [levelId, []]))

for (const row of rows) {
  if (row.category === 'unsupported') blockedByLevel.get(row.levelId)?.push(row.pattern)
}

const executableLevels = levelIds.filter(levelId => blockedByLevel.get(levelId)?.length === 0)
const blockedLevels = levelIds.filter(levelId => (blockedByLevel.get(levelId)?.length ?? 0) > 0)
const uniquePatterns = new Set(rows.map(row => row.pattern))
const categoryOrder = ['shell', 'terminal', 'syntax', 'unsupported']
const categoryNames = {
  shell: 'Command runtime',
  terminal: 'Terminal interaction',
  syntax: 'Shell syntax',
  unsupported: 'Unsupported invocation',
}

const unsupported = new Map()
for (const row of rows.filter(row => row.category === 'unsupported')) {
  const entry = unsupported.get(row.pattern) ?? { checks: 0, levels: new Set() }
  entry.checks++
  entry.levels.add(row.levelId)
  unsupported.set(row.pattern, entry)
}

const unsupportedEntries = [...unsupported.entries()].sort(([leftPattern, left], [rightPattern, right]) => {
  if (left.levels.size !== right.levels.size) return right.levels.size - left.levels.size
  if (left.checks !== right.checks) return right.checks - left.checks
  return compareText(leftPattern, rightPattern)
})

export const capabilityMetrics = Object.freeze({
  levels: levelIds.length,
  commandChecks: rows.length,
  uniquePatterns: uniquePatterns.size,
  executableLevels: executableLevels.length,
  blockedLevels: blockedLevels.length,
  unsupportedPatterns: unsupportedEntries.length,
  unsupportedChecks: rows.filter(row => row.category === 'unsupported').length,
})

function printReport() {
  console.log('GhostOps runtime invocation coverage (strict, curated allowlist)')
  console.log(`Catalog: ${levelIds.length} levels, ${rows.length} command checks, ${uniquePatterns.size} unique patterns`)
  console.log(`Invocation-covered: ${executableLevels.length}/${levelIds.length} (${(executableLevels.length / levelIds.length * 100).toFixed(1)}%; not mission E2E)`)
  console.log(`Unmapped levels: ${blockedLevels.length}/${levelIds.length}`)
  console.log('')
  console.log('Capability classes:')

  for (const category of categoryOrder) {
    const categoryRows = rows.filter(row => row.category === category)
    const patterns = new Set(categoryRows.map(row => row.pattern))
    const levels = new Set(categoryRows.map(row => row.levelId))
    console.log(`- ${categoryNames[category]}: ${patterns.size} patterns, ${levels.size} levels, ${categoryRows.length} checks`)
  }

  console.log('')
  console.log(`Unsupported invocation patterns (${unsupportedEntries.length}):`)
  for (const [pattern, entry] of unsupportedEntries) {
    const levels = [...entry.levels].sort(compareText)
    console.log(`- ${JSON.stringify(pattern)}: ${entry.checks} check(s), ${levels.length} level(s) — ${levels.join(', ')}`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) printReport()
