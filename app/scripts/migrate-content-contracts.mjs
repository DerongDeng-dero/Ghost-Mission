import { readFile, writeFile } from 'node:fs/promises'
import { getEffectiveActionRows, renderGuidedSolution, resolveCatalogChecks } from './content-contracts.mjs'

const catalogUrl = new URL('../src/data/all_levels.json', import.meta.url)

// These legacy template missions completed from a fresh simulator when their
// effective command patterns were executed in order. validate-engine.mjs
// independently replays every `verified_command` H5, so this allowlist cannot
// silently promote a stale or non-executable transcript.
const verifiedLegacyTemplates = new Set([
  'whoami-shell',
  'history-echo',
  'wake-in-srv',
  'hidden-door',
  'backtrack',
  'tree-clues',
  'boss-recursive-maze',
  'nightmare-wrong-dir',
  'tee-report',
  'who-owns-door',
  'umask-shadow',
  'safe-xargs',
  'tee-mirror',
  'pipefail-lab',
  'ps-snapshot',
  'top-watchtower',
  'dont-kill-pid1',
  'lsof-port',
  'op-cpu-hydra',
  'df-overview',
  'du-drilldown',
  'lsblk-map',
  'mount-trap',
  'findmnt-maze',
  'op-disk-full',
  'boss-vanishing-space',
  'nightmare-wrong-device',
  'port-listening',
  'dns-dig',
  'boss-dns-mirage',
  'systemctl-status',
  'journalctl-unit',
  'dmesg-clue',
  'logger-test',
  'boss-dies-midnight',
  'apt-search',
  'node-repl',
  'pip-freeze',
  'git-status-add',
  'git-diff-staged',
  'git-stash',
  'git-reflog',
  'tmux-first',
  'zellij-basics',
  'lost-session',
  'boss-session-never-dies',
  'nightmare-nested-mux',
])

// These hand-authored H5s describe multi-step or mode-specific interaction,
// not one shell transcript. Keep that boundary explicit instead of claiming
// the simulator can replay prose as a command.
const guidedLegacyIds = new Set([
  'loop-patrol',
  'heredoc-msg',
  'screen-basics',
])

const reviewedTranscripts = new Map([
  ['touch-signal', 'touch -t 202401010830 signal.conf && stat signal.conf'],
])

const levels = JSON.parse(await readFile(catalogUrl, 'utf8'))
let migratedBindings = 0
let verifiedSolutions = 0
let guidedSolutions = 0

for (const level of levels) {
  const hadLegacyBindings = level.checks.some(check => check.objectiveId === undefined)
  level.checks = resolveCatalogChecks(level)
  if (hadLegacyBindings) migratedBindings += 1

  const h5 = level.hints.find(hint => hint.level === 5)
  if (!h5) throw new Error(`${level.id}: missing H5`)
  const actionRows = getEffectiveActionRows(level, level.checks)

  if (verifiedLegacyTemplates.has(level.id) || reviewedTranscripts.has(level.id)) {
    const transcript = reviewedTranscripts.get(level.id)
      ?? actionRows.map(action => action.pattern).join(' && ')
    h5.solution_type = 'verified_command'
    h5.text_en = `Full solution: ${transcript}`
    h5.text_zh = `完整解答：${transcript}`
  } else if (h5.solution_type === 'verified_command' && !guidedLegacyIds.has(level.id)) {
    h5.solution_type = 'verified_command'
  } else if (h5.solution_type === 'guided_actions') {
    const guided = renderGuidedSolution(level, actionRows)
    h5.text_en = guided.text_en
    h5.text_zh = guided.text_zh
  } else if (!guidedLegacyIds.has(level.id) && !/^Full solution:\s*Use '/i.test(h5.text_en)) {
    h5.solution_type = 'verified_command'
  } else {
    const guided = renderGuidedSolution(level, actionRows)
    h5.solution_type = 'guided_actions'
    h5.text_en = guided.text_en
    h5.text_zh = guided.text_zh
  }

  if (h5.solution_type === 'verified_command') verifiedSolutions += 1
  else guidedSolutions += 1
}

await writeFile(catalogUrl, `${JSON.stringify(levels, null, 2)}\n`, 'utf8')
console.log(
  `Migrated ${migratedBindings} legacy level bindings; ` +
    `${verifiedSolutions} verified command solutions, ${guidedSolutions} guided action checklists.`,
)
