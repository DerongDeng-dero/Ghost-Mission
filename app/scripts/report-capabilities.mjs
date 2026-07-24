import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SHELL_PATTERNS = new Set([
  '--help', '.env', 'alias', 'apropos', 'awk', 'basename', 'cargo', 'cd', 'cd -', 'cd ..',
  'chmod', 'chmod +t', 'chmod 644', 'chmod 755', 'chmod g-w', 'chmod u+x', 'chown',
  'command -v', 'cp', 'crontab', 'curl', 'dd', 'df', 'diff', 'dig', 'dirname', 'dmesg',
  'du', 'file', 'find', 'find -name', 'findmnt', 'git', 'git add', 'git branch',
  'git checkout', 'git diff', 'git merge', 'git rebase', 'git reflog', 'git reset',
  'git restore', 'git revert', 'git stash', 'git status', 'git switch', 'go test', 'grep',
  'grep -n', 'gzip', 'history', 'id', 'ip', 'journalctl', 'jq', 'kill', 'kill -TERM',
  'less', 'ln -s', 'logger', 'ls', 'ls -a', 'ls -l', 'lsblk', 'lsof', 'make', 'man',
  'mkdir -p', 'mv', 'nc', 'node', 'npm', 'npm ci', 'npm run', 'pgrep', 'ping', 'popd',
  'ps', 'pushd', 'pwd', 'readlink', 'realpath', 'rm', 'screen', 'set -o pipefail', 'sort',
  'ss', 'ssh', 'ssh-keygen', 'stat', 'sudo', 'systemctl', 'systemctl restart', 'tail',
  'tar', 'tar -c', 'tar -x', 'tee', 'timeout', 'tmux', 'tmux attach', 'top', 'touch',
  'tree', 'type', 'type -a', 'umask', 'uniq -c', 'unzip', 'which', 'whoami', 'xargs -0',
  'xz', 'zellij', 'zip',
])

const TERMINAL_PATTERNS = new Set([
  '.editor', '/', ':%s', ':q', ':q!', ':wq', '?', 'Alt-.', 'Ctrl-C', 'Ctrl-D', 'Ctrl-G',
  'Ctrl-K', 'Ctrl-O', 'Ctrl-Q', 'Ctrl-R', 'Ctrl-S', 'Ctrl-U', 'Ctrl-X', 'Ctrl-Z', 'Esc',
  'exit()', 'q',
])

const SYNTAX_PATTERNS = new Set([
  '"', '$?', '$VAR', '&&', "'", '2>', '>', '>>', '\\', '|', '||',
])

// `?` is a supported less interaction in less-search, but an unsupported shell
// glob in glob-storm. Keep contextual exceptions explicit instead of promoting
// a token globally just because another subsystem understands it.
const UNSUPPORTED_CONTEXTS = new Set(['glob-storm\u0000?'])

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
  if (UNSUPPORTED_CONTEXTS.has(`${row.levelId}\u0000${row.pattern}`)) return 'unsupported'
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
  shell: 'Shell engine',
  terminal: 'Terminal interaction',
  syntax: 'Shell syntax',
  unsupported: 'Unsupported',
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
  console.log('GhostOps capability report (strict, curated allowlist)')
  console.log(`Catalog: ${levelIds.length} levels, ${rows.length} command checks, ${uniquePatterns.size} unique patterns`)
  console.log(`Fully executable: ${executableLevels.length}/${levelIds.length} (${(executableLevels.length / levelIds.length * 100).toFixed(1)}%)`)
  console.log(`Blocked: ${blockedLevels.length}/${levelIds.length}`)
  console.log('')
  console.log('Capability classes:')

  for (const category of categoryOrder) {
    const categoryRows = rows.filter(row => row.category === category)
    const patterns = new Set(categoryRows.map(row => row.pattern))
    const levels = new Set(categoryRows.map(row => row.levelId))
    console.log(`- ${categoryNames[category]}: ${patterns.size} patterns, ${levels.size} levels, ${categoryRows.length} checks`)
  }

  console.log('')
  console.log(`Unsupported patterns (${unsupportedEntries.length}):`)
  for (const [pattern, entry] of unsupportedEntries) {
    const levels = [...entry.levels].sort(compareText)
    console.log(`- ${JSON.stringify(pattern)}: ${entry.checks} check(s), ${levels.length} level(s) — ${levels.join(', ')}`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) printReport()
