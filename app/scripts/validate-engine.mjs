import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

async function loadEngineModule(relativePath) {
  const entryPoint = fileURLToPath(new URL(`../${relativePath}`, import.meta.url))
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    write: false,
    logLevel: 'silent',
    plugins: [{
      name: 'vite-raw-imports',
      setup(context) {
        context.onResolve({ filter: /\?raw$/ }, args => ({
          path: resolve(args.resolveDir, args.path.slice(0, -'?raw'.length)),
          namespace: 'vite-raw',
        }))
        context.onLoad({ filter: /.*/, namespace: 'vite-raw' }, args => ({
          contents: `export default ${JSON.stringify(readFileSync(args.path, 'utf8'))}`,
          loader: 'js',
        }))
      },
    }],
  })
  const source = result.outputFiles[0].text
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

const [
  vfsModule,
  shellModule,
  gitModule,
  validatorModule,
  runReportModule,
  levelsModule,
  textSegmentationModule,
] = await Promise.all([
  loadEngineModule('src/engine/vfs.ts'),
  loadEngineModule('src/engine/shell.ts'),
  loadEngineModule('src/engine/git.ts'),
  loadEngineModule('src/engine/validator.ts'),
  loadEngineModule('src/engine/runReport.ts'),
  loadEngineModule('src/engine/levels.ts'),
  loadEngineModule('src/lib/textSegmentation.ts'),
])

const {
  MAX_VFS_DEPTH,
  MAX_VFS_FILE_CODE_UNITS,
  MAX_VFS_SYMLINK_HOPS,
  MAX_VFS_TOTAL_CODE_UNITS,
  VFS,
} = vfsModule
const {
  MAX_SIMULATOR_STATE_CODE_UNITS,
  MAX_SHELL_COMMAND_LENGTH,
  MAX_SHELL_HISTORY_CODE_UNITS,
  MAX_SHELL_COMMAND_SEGMENTS,
  MAX_SHELL_HISTORY_ENTRIES,
  MAX_SHELL_OUTPUT_CODE_UNITS,
  MAX_SYSTEM_LOG_CODE_UNITS,
  MAX_SYSTEM_LOG_ENTRIES,
  ShellEngine,
  createShellState,
  seedGitBisectTrainingRepository,
} = shellModule
const { createGitState, gitCommand } = gitModule
const { validateMission, calculateScore, getObjectiveChecks, isMissionComplete } = validatorModule
const { loadMissionRunReport, saveMissionRunReport } = runReportModule
const { getLevelById } = levelsModule
const {
  MAX_TERMINAL_PASTE_SUBMISSIONS,
  planTerminalInputChunk,
  truncateTextToUtf16Limit,
} = textSegmentationModule
const catalog = JSON.parse(readFileSync(fileURLToPath(new URL('../src/data/all_levels.json', import.meta.url)), 'utf8'))

const tests = []
function test(name, run) {
  tests.push({ name, run })
}

function hasUnpairedSurrogate(text) {
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index)
    if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
      const next = text.charCodeAt(index + 1)
      if (next < 0xDC00 || next > 0xDFFF) return true
      index += 1
    } else if (codeUnit >= 0xDC00 && codeUnit <= 0xDFFF) {
      return true
    }
  }
  return false
}

function mission({ objectives, checks }) {
  return {
    id: 'regression-mission',
    objectives: objectives.map(objective => ({
      ...objective,
      label_en: objective.id,
      label_zh: objective.id,
      getLabel: () => objective.id,
    })),
    checks,
  }
}

function missionState(overrides = {}) {
  return {
    commandHistory: [],
    gitState: createGitState(),
    vfs: { files: {} },
    redCommandsUsed: [],
    hintsUsed: 0,
    objectivesCompleted: new Set(),
    ...overrides,
  }
}

function catalogMission(id) {
  const raw = catalog.find(level => level.id === id)
  assert.ok(raw, `missing catalog mission: ${id}`)
  return {
    ...raw,
    objectives: raw.objectives.map(objective => ({
      ...objective,
      getLabel: () => objective.label_en,
    })),
  }
}

test('VFS: ghost can create files in its home directory', () => {
  const vfs = new VFS()
  assert.equal(vfs.createFile('/home/ghost/note.txt', [], 'hello').error, undefined)
  assert.equal(vfs.readFile('/home/ghost/note.txt', []).content, 'hello')
})

test('VFS: sticky /tmp remains world-writable', () => {
  const vfs = new VFS()
  assert.equal(vfs.createFile('/tmp/ghost.tmp', [], 'ok').error, undefined)
  assert.match(vfs.deleteFile('/tmp/.X11-unix', []).error ?? '', /Permission denied/)
})

test('VFS: an owner-writable file does not require parent write permission', () => {
  const vfs = new VFS()
  assert.equal(vfs.writeFile('/srv/neonmall/package.json', [], '{}').error, undefined)
  assert.equal(vfs.readFile('/srv/neonmall/package.json', []).content, '{}')
})

test('VFS: symbolic chmod changes mode and non-owners cannot chmod', () => {
  const vfs = new VFS()
  assert.equal(vfs.createFile('/home/ghost/run.sh', [], 'echo ok').error, undefined)
  assert.equal(vfs.chmod('/home/ghost/run.sh', [], 'u+x').error, undefined)
  assert.equal(vfs.stat('/home/ghost/run.sh', []).node?.permissions, 'rwxr--r--')
  assert.match(vfs.chmod('/etc/hostname', [], '777').error ?? '', /Operation not permitted/)
})

test('VFS: chown validates the complete owner-group tuple before mutation', () => {
  const vfs = new VFS()
  vfs.setCurrentUser('root')
  const before = vfs.stat('/etc/hostname', []).node
  assert.match(vfs.chown('/etc/hostname', [], 'ghost:not-a-group').error ?? '', /invalid group/)
  assert.equal(vfs.stat('/etc/hostname', []).node?.owner, before?.owner)
  assert.equal(vfs.stat('/etc/hostname', []).node?.group, before?.group)
})

test('VFS: relative symlinks resolve from the link parent', () => {
  const vfs = new VFS()
  assert.equal(vfs.createDirectory('/home/ghost/links', []).error, undefined)
  assert.equal(vfs.createFile('/home/ghost/links/target.txt', [], 'target').error, undefined)
  assert.equal(vfs.symlink('target.txt', '/home/ghost/links/link.txt', []).error, undefined)
  assert.equal(vfs.readFile('/home/ghost/links/link.txt', []).content, 'target')
  assert.match(vfs.symlink('/etc/passwd', '/etc/forbidden-link', []).error ?? '', /Permission denied/)
})

test('VFS: cyclic symlinks fail closed instead of overflowing', () => {
  const vfs = new VFS()
  assert.equal(vfs.symlink('cycle-b', '/home/ghost/cycle-a', []).error, undefined)
  assert.equal(vfs.symlink('cycle-a', '/home/ghost/cycle-b', []).error, undefined)
  assert.doesNotThrow(() => vfs.readFile('/home/ghost/cycle-a', []))
  assert.match(vfs.readFile('/home/ghost/cycle-a', []).error ?? '', /No such file or directory/)
  assert.match(vfs.symlink('', '/home/ghost/empty-target', []).error ?? '', /Invalid argument/)
  assert.equal(vfs.lstat('/home/ghost/empty-target', []).node, null)
  assert.equal(vfs.getUsage().valid, true)
})

test('VFS: writing through a dangling symlink creates its target without replacing the link', () => {
  const vfs = new VFS()
  assert.equal(vfs.symlink('created-target.txt', '/home/ghost/dangling-link', []).error, undefined)
  assert.equal(vfs.writeFile('/home/ghost/dangling-link', [], 'created through link').error, undefined)
  assert.equal(vfs.lstat('/home/ghost/dangling-link', []).node?.type, 'symlink')
  assert.equal(vfs.readFile('/home/ghost/created-target.txt', []).content, 'created through link')
})

test('VFS: intermediate directory symlinks resolve like real paths', () => {
  const vfs = new VFS()
  assert.equal(vfs.createDirectory('/home/ghost/real-dir', []).error, undefined)
  assert.equal(vfs.createFile('/home/ghost/real-dir/file.txt', [], 'through-link').error, undefined)
  assert.equal(vfs.symlink('real-dir', '/home/ghost/link-dir', []).error, undefined)
  assert.equal(vfs.readFile('/home/ghost/link-dir/file.txt', []).content, 'through-link')
})

test('VFS: directory execute permission gates traversal', () => {
  const vfs = new VFS()
  vfs.setCurrentUser('root')
  assert.equal(vfs.createDirectory('/home/ghost/vault', []).error, undefined)
  assert.equal(vfs.createFile('/home/ghost/vault/public.txt', [], 'not actually public').error, undefined)
  assert.equal(vfs.chmod('/home/ghost/vault/public.txt', [], '644').error, undefined)
  assert.equal(vfs.chmod('/home/ghost/vault', [], '700').error, undefined)
  vfs.setCurrentUser('ghost')
  assert.match(vfs.readFile('/home/ghost/vault/public.txt', []).error ?? '', /Permission denied/)
  assert.equal(vfs.stat('/home/ghost/vault/public.txt', []).node, null)
  assert.match(vfs.writeFile('/home/ghost/vault/new.txt', [], 'blocked').error ?? '', /Permission denied/)
})

test('VFS: path normalization cannot escape above root', () => {
  const vfs = new VFS()
  assert.equal(
    vfs.readFile('../../../../etc/hostname', ['home', 'ghost']).content,
    vfs.readFile('/etc/hostname', []).content,
  )
  assert.deepEqual(vfs.resolvePath('/home/ghost/./projects/../note', []), ['home', 'ghost', 'note'])
})

test('VFS: move keeps the directory key and node name consistent', () => {
  const vfs = new VFS()
  assert.equal(vfs.createFile('/home/ghost/old.txt', [], 'x').error, undefined)
  assert.equal(vfs.move('/home/ghost/old.txt', '/home/ghost/new.txt', []).error, undefined)
  assert.equal(vfs.stat('/home/ghost/new.txt', []).node?.name, 'new.txt')
})

test('VFS: recursive copy works from a non-root cwd', () => {
  const vfs = new VFS()
  const cwd = ['home', 'ghost']
  assert.equal(vfs.createDirectory('source', cwd).error, undefined)
  assert.equal(vfs.createFile('source/file.txt', cwd, 'copied').error, undefined)
  assert.equal(vfs.copy('source', 'destination', cwd, true).error, undefined)
  assert.equal(vfs.readFile('destination/file.txt', cwd).content, 'copied')
})

test('VFS: copy follows a destination symlink without replacing the link', () => {
  const vfs = new VFS()
  assert.equal(vfs.createFile('/home/ghost/source.txt', [], 'new content').error, undefined)
  assert.equal(vfs.createFile('/home/ghost/target.txt', [], 'old content').error, undefined)
  assert.equal(vfs.symlink('target.txt', '/home/ghost/destination.txt', []).error, undefined)
  assert.equal(vfs.copy('/home/ghost/source.txt', '/home/ghost/destination.txt', []).error, undefined)
  assert.equal(vfs.lstat('/home/ghost/destination.txt', []).node?.type, 'symlink')
  assert.equal(vfs.readFile('/home/ghost/target.txt', []).content, 'new content')
})

test('VFS: recursive copy fails atomically before creating an unreadable root', () => {
  const vfs = new VFS()
  assert.equal(vfs.createDirectory('/home/ghost/private', []).error, undefined)
  assert.equal(vfs.createFile('/home/ghost/private/secret.txt', [], 'secret').error, undefined)
  assert.equal(vfs.chmod('/home/ghost/private', [], '000').error, undefined)
  assert.match(vfs.copy('/home/ghost/private', '/home/ghost/leak', [], true).error ?? '', /Permission denied/)
  assert.equal(vfs.stat('/home/ghost/leak', []).node, null)
})

test('VFS: a directory cannot be moved into its own descendant', () => {
  const vfs = new VFS()
  assert.equal(vfs.createDirectory('/home/ghost/tree', []).error, undefined)
  assert.equal(vfs.createDirectory('/home/ghost/tree/child', []).error, undefined)
  assert.match(vfs.move('/home/ghost/tree', '/home/ghost/tree/child/moved', []).error ?? '', /subdirectory of itself/)
  assert.equal(vfs.stat('/home/ghost/tree', []).node?.type, 'directory')
})

test('VFS: deleting root fails closed instead of throwing', () => {
  const vfs = new VFS()
  assert.doesNotThrow(() => vfs.deleteDirectory('/', [], true))
  assert.match(vfs.deleteDirectory('/', [], true).error ?? '', /Permission denied/)
})

test('Shell: stderr and exit code survive execute()', () => {
  const shell = new ShellEngine(new VFS())
  const result = shell.execute('cat /missing')
  assert.equal(result.exitCode, 1)
  assert.match(result.stderr, /No such file or directory/)
  assert.equal(shell.state.lastExitCode, 1)
})

test('Shell: oversized commands fail closed before history or execution', () => {
  const shell = new ShellEngine(new VFS())
  const oversized = 'x'.repeat(MAX_SHELL_COMMAND_LENGTH + 1)
  const result = shell.execute(oversized)
  assert.equal(result.exitCode, 2)
  assert.match(result.stderr, /command exceeds/)
  assert.deepEqual(result.successfulCommands, [])
  assert.deepEqual(shell.state.history, [])
  assert.equal(shell.state.lastExitCode, 2)
})

test('Shell: command history retains only the latest bounded window', () => {
  const shell = new ShellEngine(new VFS())
  shell.execute('echo oldest')
  for (let index = 0; index < MAX_SHELL_HISTORY_ENTRIES; index++) shell.execute(`echo ${index}`)
  assert.equal(shell.state.history.length, MAX_SHELL_HISTORY_ENTRIES)
  assert.equal(shell.state.history.includes('echo oldest'), false)
  assert.equal(shell.state.history.at(-1), `echo ${MAX_SHELL_HISTORY_ENTRIES - 1}`)
  const largeHistoryPayload = 'h'.repeat(19_000)
  for (let index = 0; index < 60; index += 1) shell.execute(`echo ${largeHistoryPayload}${index}`)
  assert.ok(
    shell.state.history.reduce((total, entry) => total + entry.length, 0) <= MAX_SHELL_HISTORY_CODE_UNITS,
  )
  assert.equal(shell.state.history.at(-1), `echo ${largeHistoryPayload}59`)
})

test('Unicode bounds: UTF-16 budgets never bisect a surrogate pair', () => {
  const splitBoundary = `${'a'.repeat(4_999)}\u{1F600}z`
  const splitResult = truncateTextToUtf16Limit(splitBoundary, 5_000)
  assert.equal(splitResult.wasTruncated, true)
  assert.equal(splitResult.totalCodeUnits, 5_002)
  assert.equal(splitResult.text, 'a'.repeat(4_999))
  assert.ok(splitResult.text.length <= 5_000)
  assert.equal(hasUnpairedSurrogate(splitResult.text), false)

  const completePairBoundary = `${'a'.repeat(4_998)}\u{1F600}z`
  const completePairResult = truncateTextToUtf16Limit(completePairBoundary, 5_000)
  assert.equal(completePairResult.text, `${'a'.repeat(4_998)}\u{1F600}`)
  assert.equal(completePairResult.text.length, 5_000)
  assert.equal(hasUnpairedSurrogate(completePairResult.text), false)

  const exactBudget = `${'a'.repeat(4_998)}\u{1F600}`
  assert.deepEqual(truncateTextToUtf16Limit(exactBudget, 5_000), {
    text: exactBudget,
    wasTruncated: false,
    totalCodeUnits: 5_000,
  })
  assert.throws(() => truncateTextToUtf16Limit('x', -1), RangeError)
})

test('Shell: output truncation preserves the UTF-16 budget and Unicode pairs', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  const content = `${'a'.repeat(MAX_SHELL_OUTPUT_CODE_UNITS - 1)}\u{1F600}z`
  assert.equal(vfs.writeFile('/home/ghost/unicode-boundary.txt', [], content).error, undefined)
  const result = shell.execute('cat /home/ghost/unicode-boundary.txt')
  assert.equal(result.exitCode, 0)
  assert.match(result.stdout, /output truncated/)
  assert.equal(hasUnpairedSurrogate(result.stdout), false)
  assert.ok(result.stdout.startsWith('a'.repeat(MAX_SHELL_OUTPUT_CODE_UNITS - 1)))
})

test('Terminal paste plan rejects excessive submissions atomically', () => {
  const directTrigger = ':\r'.repeat(10_000)
  const rejected = planTerminalInputChunk(directTrigger, MAX_TERMINAL_PASTE_SUBMISSIONS)
  assert.equal(rejected.accepted, false)
  assert.equal(rejected.submissionCount, 10_000)
  assert.deepEqual(rejected.characters, [], 'a rejected paste must expose no executable prefix')

  const atLimit = planTerminalInputChunk(':\r\n'.repeat(MAX_TERMINAL_PASTE_SUBMISSIONS))
  assert.equal(atLimit.accepted, true)
  assert.equal(atLimit.submissionCount, MAX_TERMINAL_PASTE_SUBMISSIONS)
  assert.ok(atLimit.characters.length > 0)
  assert.deepEqual(
    planTerminalInputChunk('first\r\nsecond\nthird').characters,
    [...'first\rsecond\rthird'],
    'CRLF and bare LF must normalize to one executable terminal submission',
  )
  const overLimit = planTerminalInputChunk('\n'.repeat(MAX_TERMINAL_PASTE_SUBMISSIONS + 1))
  assert.equal(overLimit.accepted, false)
  assert.deepEqual(overLimit.characters, [])
})

test('Shell: command segment budgets reject control and pipeline floods atomically', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  const controlFlood = [
    'touch /tmp/segment-limit-must-be-atomic',
    ...Array.from({ length: MAX_SHELL_COMMAND_SEGMENTS }, () => ':'),
  ].join(';')
  const controlResult = shell.execute(controlFlood)
  assert.equal(controlResult.exitCode, 2)
  assert.match(controlResult.stderr, /segment simulator limit/)
  assert.deepEqual(controlResult.successfulCommands, [])
  assert.equal(vfs.lstat('/tmp/segment-limit-must-be-atomic', []).node, null)

  const pipelineFlood = [
    'printf x',
    ...Array.from({ length: MAX_SHELL_COMMAND_SEGMENTS }, () => 'cat'),
  ].join(' | ')
  const pipelineResult = shell.execute(pipelineFlood)
  assert.equal(pipelineResult.exitCode, 2)
  assert.match(pipelineResult.stderr, /segment simulator limit|pipeline exceeds/)
  assert.deepEqual(pipelineResult.successfulCommands, [])
})

test('Shell: one root execution budget bounds nested loops and delegated commands', () => {
  const values = Array.from({ length: MAX_SHELL_COMMAND_SEGMENTS }, () => 'x').join(' ')
  const pipeline = Array.from({ length: MAX_SHELL_COMMAND_SEGMENTS }, () => ':').join(' | ')
  const nestedVfs = new VFS()
  const shell = new ShellEngine(nestedVfs)
  const nested = shell.execute(`touch /tmp/nested-budget-must-be-atomic; for i in ${values}; do for j in ${values}; do ${pipeline}; done; done`)
  assert.equal(nested.exitCode, 2)
  assert.match(nested.stderr, /segment simulator limit/)
  assert.equal(nestedVfs.lstat('/tmp/nested-budget-must-be-atomic', []).node, null)

  const delegatedVfs = new VFS()
  const delegatedState = createShellState()
  const delegatedShell = new ShellEngine(delegatedVfs, delegatedState)
  const delegatedServices = delegatedShell.services
  const delegatedGitState = delegatedShell.gitState
  const items = Array.from(
    { length: MAX_SHELL_COMMAND_SEGMENTS + 1 },
    (_, index) => `/tmp/xargs-budget-side-${index}`,
  ).join('\n')
  assert.equal(delegatedVfs.writeFile('/tmp/xargs-items.txt', [], `${items}\n`).error, undefined)
  assert.equal(delegatedVfs.writeFile('/tmp/hardlink-source', [], 'stable').error, undefined)
  assert.equal(delegatedVfs.hardlink('/tmp/hardlink-source', '/tmp/hardlink-alias', []).error, undefined)
  const delegated = delegatedShell.execute(
    'export BUDGET_SIDE=changed; service nginx stop; git init; echo changed > /tmp/hardlink-source; cat /tmp/xargs-items.txt | xargs -n 1 touch',
  )
  assert.equal(delegated.exitCode, 2)
  assert.match(delegated.stderr, /segment execution budget/)
  assert.equal(delegatedShell.state.env.BUDGET_SIDE, undefined)
  assert.equal(delegatedShell.services.services.get('nginx')?.status, 'running')
  assert.equal(delegatedShell.gitState.initialized, false)
  assert.equal(delegatedShell.state, delegatedState, 'rollback must preserve a constructor-supplied state reference')
  assert.equal(delegatedShell.services, delegatedServices, 'rollback must preserve the public services reference')
  assert.equal(delegatedShell.gitState, delegatedGitState, 'rollback must preserve the public Git state reference')
  assert.ok(items.split('\n').every(path => delegatedVfs.lstat(path, []).node === null))
  assert.equal(delegatedVfs.readFile('/tmp/xargs-items.txt', []).content, `${items}\n`)
  assert.equal(delegatedVfs.readFile('/tmp/hardlink-source', []).content, 'stable')
  assert.equal(delegatedVfs.readFile('/tmp/hardlink-alias', []).content, 'stable')
  assert.equal(delegatedVfs.writeFile('/tmp/hardlink-alias', [], 'shared-after-rollback').error, undefined)
  assert.equal(delegatedVfs.readFile('/tmp/hardlink-source', []).content, 'shared-after-rollback')

  const functionVfs = new VFS()
  const functionShell = new ShellEngine(functionVfs)
  const invocations = Array.from({ length: 40 }, () => 'f').join(';')
  const functionResult = functionShell.execute(
    `function f() { export FUNCTION_SIDE=changed; touch /tmp/function-budget-side; :; }; ${invocations}`,
  )
  assert.equal(functionResult.exitCode, 2)
  assert.match(functionResult.stderr, /segment execution budget/)
  assert.equal(functionShell.state.env.FUNCTION_SIDE, undefined)
  assert.equal(functionVfs.lstat('/tmp/function-budget-side', []).node, null)

  const scriptVfs = new VFS()
  const scriptShell = new ShellEngine(scriptVfs)
  const dynamicScript = [
    `seq 1 ${MAX_SHELL_COMMAND_SEGMENTS + 1} > /tmp/generated-budget-lines`,
    'while read -r item; do touch /tmp/bash-budget-side; done < /tmp/generated-budget-lines',
  ].join('\n')
  assert.equal(scriptVfs.writeFile('/tmp/dynamic-budget.sh', [], `${dynamicScript}\n`).error, undefined)
  const scriptResult = scriptShell.execute('bash /tmp/dynamic-budget.sh')
  assert.equal(scriptResult.exitCode, 2)
  assert.match(scriptResult.stderr, /segment execution budget/)
  assert.equal(scriptVfs.lstat('/tmp/generated-budget-lines', []).node, null)
  assert.equal(scriptVfs.lstat('/tmp/bash-budget-side', []).node, null)

  const makeVfs = new VFS()
  const makeShell = new ShellEngine(makeVfs)
  const recipes = Array.from({ length: MAX_SHELL_COMMAND_SEGMENTS + 1 }, () => '\ttouch /tmp/make-budget-side')
  assert.equal(makeVfs.writeFile('/tmp/BudgetMakefile', [], `all:\n${recipes.join('\n')}\n`).error, undefined)
  const makeResult = makeShell.execute('make -f /tmp/BudgetMakefile all')
  assert.equal(makeResult.exitCode, 2)
  assert.match(makeResult.stderr, /segment execution budget/)
  assert.equal(makeVfs.lstat('/tmp/make-budget-side', []).node, null)

  const capacityVfs = new VFS()
  const oneMiB = 'x'.repeat(1_024 * 1_024)
  let capacityError = ''
  for (let index = 0; index < 64; index += 1) {
    const result = capacityVfs.writeFile(`/tmp/capacity-${index}`, [], oneMiB)
    if (result.error) {
      capacityError = result.error
      break
    }
  }
  assert.match(capacityError, /No space left on device/)
  assert.ok(capacityVfs.getUsage().storageCodeUnits <= MAX_VFS_TOTAL_CODE_UNITS)
  assert.equal(new ShellEngine(capacityVfs).execute('pwd').exitCode, 0)

  const batchedCapacityVfs = new VFS()
  const splitChunk = 's'.repeat(700_000)
  assert.equal(
    batchedCapacityVfs.writeFile('/tmp/capacity-source', [], `${splitChunk}\n${splitChunk}\n`).error,
    undefined,
  )
  const desiredRemaining = 900_000
  for (let index = 0; ; index += 1) {
    const usage = batchedCapacityVfs.getUsage()
    const remaining = MAX_VFS_TOTAL_CODE_UNITS - usage.storageCodeUnits
    const entryName = `capacity-fill-${index}`
    const contentLength = Math.min(
      MAX_VFS_FILE_CODE_UNITS,
      remaining - desiredRemaining - entryName.length,
    )
    if (contentLength <= 0) break
    assert.equal(
      batchedCapacityVfs.writeFile(`/tmp/${entryName}`, [], 'f'.repeat(contentLength)).error,
      undefined,
    )
  }
  const usageBeforeSplit = batchedCapacityVfs.getUsage()
  assert.equal(MAX_VFS_TOTAL_CODE_UNITS - usageBeforeSplit.storageCodeUnits, desiredRemaining)
  const capacityShell = new ShellEngine(batchedCapacityVfs)
  const splitResult = capacityShell.execute('split -l 1 /tmp/capacity-source /tmp/capacity-split-')
  assert.equal(splitResult.exitCode, 1)
  assert.match(splitResult.stderr, /No space left on device/)
  assert.equal(batchedCapacityVfs.lstat('/tmp/capacity-split-aa', []).node, null)
  assert.equal(batchedCapacityVfs.lstat('/tmp/capacity-split-ab', []).node, null)
  assert.deepEqual(batchedCapacityVfs.getUsage(), usageBeforeSplit, 'a failed batch write must roll back atomically')

  const deepVfs = new VFS()
  assert.equal(deepVfs.createDirectory('/home/ghost/depth-tree', []).error, undefined)
  assert.equal(deepVfs.createDirectory('/home/ghost/depth-tree/child', []).error, undefined)
  const deepSegments = ['/tmp']
  for (let index = 0; index < MAX_VFS_DEPTH - 1; index += 1) {
    deepSegments.push(`d${index}`)
    assert.equal(deepVfs.createDirectory(deepSegments.join('/'), []).error, undefined)
  }
  assert.equal(deepVfs.getUsage().maxDepth, MAX_VFS_DEPTH)
  assert.equal(deepVfs.getUsage().valid, true)
  const tooDeepPath = `${deepSegments.join('/')}/overflow`
  assert.match(deepVfs.createDirectory(tooDeepPath, []).error ?? '', /File name too long/)
  assert.equal(deepVfs.lstat(tooDeepPath, []).node, null)
  const deepestDirectory = deepSegments.join('/')
  assert.equal(deepVfs.symlink(deepestDirectory, '/tmp/deep-link', []).error, undefined)
  assert.equal(deepVfs.writeFile('/home/ghost/depth-source', [], 'bounded').error, undefined)
  assert.equal(deepVfs.createDirectory('/home/ghost/depth-move-source', []).error, undefined)
  for (const result of [
    deepVfs.createDirectory('/tmp/deep-link/child', []),
    deepVfs.writeFile('/tmp/deep-link/file', [], 'bounded'),
    deepVfs.copy('/home/ghost/depth-source', '/tmp/deep-link/copied', []),
    deepVfs.move('/home/ghost/depth-move-source', '/tmp/deep-link/moved', []),
  ]) {
    assert.match(result.error ?? '', /File name too long/)
  }
  assert.equal(deepVfs.lstat(`${deepestDirectory}/child`, []).node, null)
  assert.equal(deepVfs.lstat(`${deepestDirectory}/file`, []).node, null)
  assert.equal(deepVfs.lstat(`${deepestDirectory}/copied`, []).node, null)
  assert.notEqual(deepVfs.lstat('/home/ghost/depth-move-source', []).node, null)
  assert.equal(deepVfs.getUsage().valid, true)
  const depthLimitedMove = deepVfs.move(
    '/home/ghost/depth-tree',
    deepSegments.slice(0, -1).join('/'),
    [],
  )
  assert.match(depthLimitedMove.error ?? '', /File name too long/)
  assert.notEqual(deepVfs.lstat('/home/ghost/depth-tree', []).node, null)
  assert.equal(deepVfs.createDirectory('/home/ghost/self-copy-source', []).error, undefined)
  assert.equal(deepVfs.symlink('/home/ghost/self-copy-source', '/tmp/self-copy-link', []).error, undefined)
  assert.match(deepVfs.copy('/home/ghost/self-copy-source', '/tmp/self-copy-link', [], true).error ?? '', /into itself/)
  assert.equal(deepVfs.lstat('/home/ghost/self-copy-source/self-copy-source', []).node, null)
  assert.match(deepVfs.move('/home/ghost/self-copy-source', '/tmp/self-copy-link', []).error ?? '', /subdirectory of itself/)
  assert.notEqual(deepVfs.lstat('/home/ghost/self-copy-source', []).node, null)
  assert.doesNotThrow(() => deepVfs.createSnapshot())

  const symlinkVfs = new VFS()
  assert.equal(symlinkVfs.writeFile('/tmp/symlink-target', [], 'bounded').error, undefined)
  for (let index = MAX_VFS_SYMLINK_HOPS; index >= 0; index -= 1) {
    const target = index === MAX_VFS_SYMLINK_HOPS ? '/tmp/symlink-target' : `/tmp/symlink-${index + 1}`
    assert.equal(symlinkVfs.symlink(target, `/tmp/symlink-${index}`, []).error, undefined)
  }
  assert.match(symlinkVfs.readFile('/tmp/symlink-0', []).error ?? '', /No such file or directory/)

  const invalidGraphVfs = new VFS()
  const mutableTmpNode = invalidGraphVfs.lstat('/tmp', []).node
  assert.equal(mutableTmpNode?.type, 'directory')
  mutableTmpNode.children.set('cycle', mutableTmpNode)
  assert.equal(invalidGraphVfs.getUsage().valid, false)
  const invalidGraphResult = new ShellEngine(invalidGraphVfs).execute('pwd')
  assert.equal(invalidGraphResult.exitCode, 1)
  assert.match(invalidGraphResult.stderr, /filesystem graph violates simulator limits/)
  mutableTmpNode.children.delete('cycle')
  assert.equal(invalidGraphVfs.getUsage().valid, true)

  const boundedStateVfs = new VFS()
  const boundedStateShell = new ShellEngine(boundedStateVfs)
  const boundedStateTarget = boundedStateShell.state
  const boundedServicesTarget = boundedStateShell.services
  const stateUsageBeforeFill = boundedStateShell.getPersistentStateUsage()
  const reserve = 10
  const seedKey = 'budget-seed'
  const fillerLength = MAX_SIMULATOR_STATE_CODE_UNITS
    - stateUsageBeforeFill.codeUnits
    - seedKey.length
    - reserve
  assert.ok(fillerLength > 0)
  boundedStateShell.services.remoteFiles.set(seedKey, 'r'.repeat(fillerLength))
  const stateUsageNearLimit = boundedStateShell.getPersistentStateUsage()
  assert.equal(stateUsageNearLimit.valid, true)
  assert.equal(MAX_SIMULATOR_STATE_CODE_UNITS - stateUsageNearLimit.codeUnits, reserve)
  const stateLimitResult = boundedStateShell.execute('export STATE_BUDGET=overflow')
  assert.equal(stateLimitResult.exitCode, 1)
  assert.match(stateLimitResult.stderr, /persistent state limit exceeded/)
  assert.equal(boundedStateShell.state.env.STATE_BUDGET, undefined)
  assert.equal(boundedStateShell.state, boundedStateTarget)
  assert.equal(boundedStateShell.services, boundedServicesTarget)
  assert.equal(boundedStateShell.services.remoteFiles.get(seedKey)?.length, fillerLength)
  assert.equal(boundedStateShell.getPersistentStateUsage().valid, true)

  const boundedLogShell = new ShellEngine(new VFS())
  boundedLogShell.services.systemLogs = ['l'.repeat(MAX_SYSTEM_LOG_CODE_UNITS)]
  assert.equal(boundedLogShell.execute('logger newest-entry').exitCode, 0)
  assert.ok(
    boundedLogShell.services.systemLogs.reduce((total, entry) => total + entry.length, 0)
      <= MAX_SYSTEM_LOG_CODE_UNITS,
  )
  assert.match(boundedLogShell.services.systemLogs.at(-1) ?? '', /newest-entry/)
  boundedLogShell.services.systemLogs = Array.from({ length: MAX_SYSTEM_LOG_ENTRIES }, (_, index) => `old-${index}`)
  assert.equal(boundedLogShell.execute('logger ring-entry').exitCode, 0)
  assert.equal(boundedLogShell.services.systemLogs.length, MAX_SYSTEM_LOG_ENTRIES)
  assert.match(boundedLogShell.services.systemLogs.at(-1) ?? '', /ring-entry/)
})

test('Shell: report-incompatible expanded traces are not emitted as progress evidence', () => {
  const shell = new ShellEngine(new VFS())
  assert.equal(shell.execute(`export BIG=${'a'.repeat(11_000)}`).exitCode, 0)
  const expanded = shell.execute('echo $BIG$BIG')
  assert.equal(expanded.exitCode, 0)
  assert.equal(expanded.stdout.length, MAX_SHELL_OUTPUT_CODE_UNITS + '\n... (output truncated)\n'.length)
  assert.deepEqual(expanded.successfulCommands, [])
})

test('Shell: bash and loop failures preserve exact successful-prefix traces', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(vfs.writeFile('/home/ghost/prefix.sh', [], 'whoami\nfalse\n').error, undefined)
  const script = shell.execute('bash prefix.sh')
  assert.equal(script.exitCode, 1)
  assert.deepEqual(script.successfulCommands, ['whoami'])

  const forLoop = shell.execute('for f in /etc/hostname /missing; do cat "$f"; done')
  assert.equal(forLoop.exitCode, 1)
  assert.deepEqual(forLoop.successfulCommands, ['cat /etc/hostname', '"', '$VAR'])

  assert.equal(vfs.writeFile('/home/ghost/paths.txt', [], '/etc/hostname\n/missing\n').error, undefined)
  const whileLoop = shell.execute('while read -r f; do cat "$f"; done < paths.txt')
  assert.equal(whileLoop.exitCode, 1)
  assert.deepEqual(whileLoop.successfulCommands, ['cat /etc/hostname', '"', '$VAR'])
})

test('Shell: aggregate control output remains Unicode-safe and bounded', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  const content = `${'a'.repeat(5_999)}\u{1F600}`
  assert.equal(vfs.writeFile('/home/ghost/control-output.txt', [], content).error, undefined)
  const result = shell.execute('cat control-output.txt; cat control-output.txt')
  assert.equal(result.exitCode, 0)
  assert.match(result.stdout, /output truncated/)
  assert.equal(hasUnpairedSurrogate(result.stdout), false)
  assert.ok(result.stdout.length <= MAX_SHELL_OUTPUT_CODE_UNITS + 32)
})

test('Shell: unknown commands expose command-not-found stderr', () => {
  const shell = new ShellEngine(new VFS())
  const result = shell.execute('definitely-not-a-command')
  assert.equal(result.exitCode, 127)
  assert.match(result.stderr, /command not found/)
})

test('Shell: Git commands share a live repository state', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(shell.execute('git status').exitCode, 128)
  assert.equal(shell.execute('git init').exitCode, 0)
  assert.equal(vfs.createFile('/home/ghost/README.md', [], '# GhostOps\n').error, undefined)
  assert.equal(shell.execute('git add README.md').exitCode, 0)
  assert.equal(shell.execute('git commit -m "initial"').exitCode, 0)
  assert.equal(shell.gitState.initialized, true)
  assert.equal(shell.gitState.commits.length, 1)
  assert.match(shell.execute('git status').stdout, /working tree clean/)
})

test('Shell/Git: VFS is the worktree source for add, status, deletion, and duplicate commits', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(shell.execute('mkdir /tmp/repo-sync').exitCode, 0)
  assert.equal(shell.execute('cd /tmp/repo-sync').exitCode, 0)
  assert.equal(shell.execute('git init').exitCode, 0)
  assert.equal(shell.execute('touch tracked.txt').exitCode, 0)
  assert.equal(shell.execute('git add .').exitCode, 0)
  assert.equal(shell.gitState.stagingArea.get('tracked.txt'), '')
  assert.equal(shell.execute('git commit -m first').exitCode, 0)

  assert.equal(shell.execute('git add tracked.txt').exitCode, 0)
  assert.equal(shell.gitState.stagingArea.size, 0)
  assert.notEqual(shell.execute('git commit -m duplicate').exitCode, 0)

  assert.equal(shell.execute('echo changed > tracked.txt').exitCode, 0)
  assert.match(shell.execute('git status').stdout, /modified:\s+tracked\.txt/)
  assert.equal(shell.execute('git add tracked.txt').exitCode, 0)
  assert.equal(shell.gitState.stagingArea.get('tracked.txt'), 'changed\n')
  assert.equal(shell.execute('git commit -m changed').exitCode, 0)

  assert.equal(shell.execute('rm tracked.txt').exitCode, 0)
  assert.match(shell.execute('git status').stdout, /deleted:\s+tracked\.txt/)
})

test('Shell/Git: clean removes only VFS-untracked files and preserves tracked modifications', () => {
  const vfs = new VFS()
  const redCommands = []
  const shell = new ShellEngine(vfs, undefined, command => redCommands.push(command))
  shell.execute('mkdir /tmp/repo-clean')
  shell.execute('cd /tmp/repo-clean')
  shell.execute('git init')
  shell.execute('echo original > tracked.txt')
  shell.execute('git add tracked.txt')
  shell.execute('git commit -m baseline')
  shell.execute('echo modified > tracked.txt')
  shell.execute('touch untracked.txt')
  shell.execute('mkdir untracked-dir')
  shell.execute('touch untracked-dir/nested.txt')

  const preview = shell.execute('git clean -n')
  assert.equal(preview.exitCode, 0)
  assert.match(preview.stdout, /Would remove untracked\.txt/)
  assert.doesNotMatch(preview.stdout, /untracked-dir/)
  assert.ok(vfs.lstat('/tmp/repo-clean/untracked.txt', []).node)
  assert.ok(vfs.lstat('/tmp/repo-clean/untracked-dir/nested.txt', []).node)

  const combinedPreview = shell.execute('git clean -nf')
  assert.equal(combinedPreview.exitCode, 0)
  assert.match(combinedPreview.stdout, /Would remove untracked\.txt/)
  assert.doesNotMatch(combinedPreview.stdout, /untracked-dir/)
  assert.ok(vfs.lstat('/tmp/repo-clean/untracked.txt', []).node)
  assert.ok(vfs.lstat('/tmp/repo-clean/untracked-dir/nested.txt', []).node)

  const recursivePreview = shell.execute('git clean -dfn')
  assert.equal(recursivePreview.exitCode, 0)
  assert.match(recursivePreview.stdout, /Would remove untracked-dir\//)
  assert.match(recursivePreview.stdout, /Would remove untracked\.txt/)
  assert.ok(vfs.lstat('/tmp/repo-clean/untracked-dir/nested.txt', []).node)

  const unsupportedIgnoredMode = shell.execute('git clean -x')
  assert.equal(unsupportedIgnoredMode.exitCode, 129)
  assert.ok(vfs.lstat('/tmp/repo-clean/untracked.txt', []).node)
  assert.ok(vfs.lstat('/tmp/repo-clean/untracked-dir/nested.txt', []).node)

  const cleaned = shell.execute('git clean -f')
  assert.equal(cleaned.exitCode, 0)
  assert.equal(vfs.lstat('/tmp/repo-clean/untracked.txt', []).node, null)
  assert.ok(vfs.lstat('/tmp/repo-clean/untracked-dir/nested.txt', []).node)
  assert.equal(vfs.readFile('/tmp/repo-clean/tracked.txt', []).content, 'modified\n')
  assert.match(shell.execute('git status').stdout, /modified:\s+tracked\.txt/)

  const recursiveCleaned = shell.execute('git clean -fd')
  assert.equal(recursiveCleaned.exitCode, 0)
  assert.match(recursiveCleaned.stdout, /Removing untracked-dir\//)
  assert.equal(vfs.lstat('/tmp/repo-clean/untracked-dir', []).node, null)
  assert.equal(vfs.readFile('/tmp/repo-clean/tracked.txt', []).content, 'modified\n')
  assert.deepEqual(redCommands, ['git clean -f', 'git clean -fd'])
})

test('Shell/Git: both bisect missions seed five real VFS-backed commits', () => {
  for (const missionId of ['git-bisect', 'op-broken-timeline']) {
    const level = getLevelById(missionId)
    assert.ok(level, `${missionId}: level missing`)
    assert.ok(
      level.checks.some(check => check.pattern?.toLowerCase().startsWith('git bisect')),
      `${missionId}: runtime contract must trigger bisect seeding`,
    )

    const vfs = new VFS()
    const shell = new ShellEngine(vfs)
    assert.equal(shell.execute('git init', 0, false).exitCode, 0)
    const seeded = seedGitBisectTrainingRepository(shell)
    assert.deepEqual(seeded, { ok: true, commitCount: 5 }, `${missionId}: ${seeded.error ?? ''}`)
    assert.equal(shell.gitState.commits.length, 5)
    assert.equal(shell.gitState.branches.get('main')?.length, 5)
    assert.equal(shell.gitState.tags.get('v1.0')?.hash, shell.gitState.commits[0].hash)
    assert.equal(shell.gitState.commits[0].changes.get('training-base.txt'), 'known-good baseline\n')
    assert.equal(vfs.readFile('/home/ghost/training-base.txt', []).content, 'known-good baseline\n')
    assert.equal(vfs.readFile('/home/ghost/checkpoint-4.txt', []).content, 'checkpoint 4: regression reproduced\n')
    assert.equal(shell.execute('git bisect start HEAD v1.0').exitCode, 0)
  }
})

test('Shell: interactive command mode survives execute()', () => {
  const shell = new ShellEngine(new VFS())
  assert.equal(shell.execute('less /etc/hosts').mode, 'less')
  assert.notEqual(shell.execute('tmux ls').exitCode, 0)
  assert.equal(shell.execute('tmux new -s audit').mode, 'tmux')
  assert.notEqual(shell.execute('tmux new-window -t missing').exitCode, 0)
  assert.equal(shell.execute('tmux new-window -t audit:0').exitCode, 0)
  assert.equal(shell.execute('tmux detach -t audit').exitCode, 0)
  assert.doesNotMatch(shell.execute('tmux ls').stdout, /\(attached\)/)
  assert.notEqual(shell.execute('tmux definitely-unknown').exitCode, 0)
})

test('Shell: aliases expand on every invocation without recursion', () => {
  const shell = new ShellEngine(new VFS())
  assert.equal(shell.execute('ll').exitCode, 0)
  assert.equal(shell.execute('ll').exitCode, 0)
})

test('Shell: input redirection is applied before command execution', () => {
  const shell = new ShellEngine(new VFS())
  const result = shell.execute('grep ERROR < /srv/neonmall/logs/app.log')
  assert.equal(result.exitCode, 0)
  assert.match(result.stdout, /ERROR: Database connection failed/)
  assert.doesNotMatch(result.stdout, /INFO: Server started/)
})

test('Shell: failed input redirection prevents command side effects', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  const result = shell.execute('touch /home/ghost/should-not-exist < /missing')
  assert.notEqual(result.exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/should-not-exist', []).node, null)
})

test('Shell: output redirection suppresses stdout and supports adjacent operators', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  const result = shell.execute('echo hello>/home/ghost/output.txt')
  assert.equal(result.exitCode, 0)
  assert.equal(result.stdout, '')
  assert.equal(vfs.readFile('/home/ghost/output.txt', []).content, 'hello\n')
  assert.equal(shell.execute('echo spaced > "/home/ghost/file name.txt"').exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/file name.txt', []).content, 'spaced\n')
})

test('Shell: failed output redirection returns failure without claiming output', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  const result = shell.execute('touch /home/ghost/side-effect > /etc/blocked')
  assert.notEqual(result.exitCode, 0)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /Permission denied/)
  assert.equal(vfs.stat('/home/ghost/side-effect', []).node, null)
})

test('Shell: the last redirect receives output while earlier redirects are only opened', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  const result = shell.execute('echo final > /home/ghost/first.txt > /home/ghost/second.txt')
  assert.equal(result.exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/first.txt', []).content, '')
  assert.equal(vfs.readFile('/home/ghost/second.txt', []).content, 'final\n')
})

test('Shell: stderr redirection writes diagnostics while preserving exit status', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  const result = shell.execute('missing-command 2>/home/ghost/error.log')
  assert.equal(result.exitCode, 127)
  assert.equal(result.stderr, '')
  assert.match(vfs.readFile('/home/ghost/error.log', []).content, /command not found/)
})

test('Shell: grep returns 1 when no line matches', () => {
  const shell = new ShellEngine(new VFS())
  const result = shell.execute('echo info | grep ERROR')
  assert.equal(result.exitCode, 1)
  assert.equal(result.stdout, '')
})

test('Shell: mutating commands propagate VFS failures', () => {
  const shell = new ShellEngine(new VFS())
  const result = shell.execute('touch /etc/blocked')
  assert.notEqual(result.exitCode, 0)
  assert.match(result.stderr, /Permission denied/)
})

test('Shell: failed pushd leaves cwd and stack unchanged', () => {
  const shell = new ShellEngine(new VFS())
  assert.notEqual(shell.execute('cd -').exitCode, 0)
  assert.equal(shell.execute('cd /tmp').exitCode, 0)
  assert.equal(shell.execute('cd -').stdout, '/home/ghost\n')
  assert.equal(shell.execute('pwd').stdout, '/home/ghost')
  const before = [...shell.state.cwd]
  const result = shell.execute('pushd /missing')
  assert.notEqual(result.exitCode, 0)
  assert.deepEqual(shell.state.cwd, before)
  assert.deepEqual(shell.state.dirStack, [])
})

test('Shell: stream readers consume pipelines and fail closed without input', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(vfs.createFile('/home/ghost/stream.txt', [], 'one\ntwo\n').error, undefined)
  assert.equal(shell.execute('cat stream.txt | cat').stdout, 'one\ntwo\n')
  assert.equal(shell.execute('cat stream.txt | head -n 1').stdout, 'one\n')
  assert.equal(shell.execute('cat stream.txt | tail -n 1').stdout, 'two\n')
  assert.notEqual(shell.execute('cat').exitCode, 0)
  assert.notEqual(shell.execute('head').exitCode, 0)
  assert.notEqual(shell.execute('tail').exitCode, 0)
})

test('Shell: bounded utility commands reject missing input, files, operands, and unknown options', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(vfs.createFile('/home/ghost/rows.txt', [], 'b 2\na 1\na 1\n').error, undefined)
  assert.equal(shell.execute("awk '{print $1}' rows.txt").stdout, 'b\na\na\n')
  assert.equal(shell.execute('sort rows.txt').exitCode, 0)
  assert.equal(shell.execute('uniq rows.txt').exitCode, 0)
  assert.equal(shell.execute('stat -c %s rows.txt').exitCode, 0)
  assert.equal(shell.execute('tree -L 1 /home/ghost').exitCode, 0)
  assert.equal(shell.execute('ss -s').exitCode, 0)
  assert.equal(shell.execute('nc -zv -w 2 localhost 80').exitCode, 0)
  assert.equal(shell.execute('dig +short example.com').exitCode, 0)

  for (const command of [
    "awk '{print $1}' missing",
    'sort missing',
    'uniq missing',
    'basename',
    'dirname',
    'stat',
    'stat -c',
    'df /missing',
    'du /missing',
    'tree /missing',
    'tree -L',
    'pushd',
    'ss --garbage',
    'dig -x',
    'nc -zv',
    'id no-such-user',
    'whoami extra',
    'pwd -- -P',
    'alias missing',
    'history -d',
  ]) {
    assert.notEqual(shell.execute(command).exitCode, 0, command)
  }
})

test('Shell: escaping and single quotes preserve literal intent', () => {
  const shell = new ShellEngine(new VFS())
  assert.equal(shell.execute('echo hello\\ world').stdout, 'hello world\n')
  assert.equal(shell.execute("echo '$HOME'").stdout, '$HOME\n')
})

test('Shell: $? expands to the previous command exit code', () => {
  const shell = new ShellEngine(new VFS())
  assert.equal(shell.execute('false').exitCode, 1)
  assert.equal(shell.execute('echo $?').stdout, '1\n')
})

test('Shell: &&, ||, and ; honor prior exit status and side effects', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  const result = shell.execute('false && touch /home/ghost/skipped || echo recovered; echo done')
  assert.equal(result.exitCode, 0)
  assert.equal(result.stdout, 'recovered\ndone\n')
  assert.equal(vfs.stat('/home/ghost/skipped', []).node, null)
})

test('Shell: successful command traces exclude failed pipeline segments and short-circuited branches', () => {
  const shell = new ShellEngine(new VFS())
  const pipeline = shell.execute('cat missing | true')
  assert.equal(pipeline.exitCode, 0)
  assert.deepEqual(pipeline.successfulCommands, ['true', '|'])
  const shortCircuit = shell.execute('true || touch never-created')
  assert.equal(shortCircuit.exitCode, 0)
  assert.deepEqual(shortCircuit.successfulCommands, ['true', '||'])
  assert.equal(shell.vfs.stat('/home/ghost/never-created', []).node, null)
  const recovered = shell.execute('false && touch skipped || echo recovered')
  assert.equal(recovered.exitCode, 0)
  assert.deepEqual(recovered.successfulCommands, ['echo recovered', '&&', '||'])
  assert.equal(shell.vfs.stat('/home/ghost/skipped', []).node, null)
})

test('Shell: malformed quotes fail with a non-zero exit code', () => {
  const shell = new ShellEngine(new VFS())
  const result = shell.execute("echo 'unterminated")
  assert.notEqual(result.exitCode, 0)
  assert.match(result.stderr, /unexpected EOF/)
})

test('Shell: empty pipeline segments are syntax errors', () => {
  for (const command of ['| echo nope', 'echo nope |', 'echo nope | | grep nope']) {
    const result = new ShellEngine(new VFS()).execute(command)
    assert.notEqual(result.exitCode, 0)
    assert.match(result.stderr, /syntax error/)
  }
})

test('Shell: red-command detection uses command boundaries', () => {
  assert.equal(shellModule.isRedCommand('rm'), true)
  assert.equal(shellModule.isRedCommand('/bin/rm'), true)
  assert.equal(shellModule.isRedCommand('rmate'), false)
  assert.equal(shellModule.isRedCommand('systemctl', ['status', 'nginx']), false)
  assert.equal(shellModule.isRedCommand('systemctl', ['list-timers']), false)
  assert.equal(shellModule.isRedCommand('systemctl', ['restart', 'nginx']), true)
  assert.equal(shellModule.isRedCommand('docker', ['ps']), false)
  assert.equal(shellModule.isRedCommand('docker', ['rm', 'api']), true)
  assert.equal(shellModule.isRedCommand('docker', ['logs', 'rm']), false)
  assert.equal(shellModule.isRedCommand('kubectl', ['get', 'pods']), false)
  assert.equal(shellModule.isRedCommand('kubectl', ['delete', 'pod', 'api']), true)
  assert.equal(shellModule.isRedCommand('kubectl', ['--context', 'production', 'delete', 'pod', 'api']), true)
  assert.equal(shellModule.isRedCommand('kubectl', ['get', 'pod', 'delete']), false)
  assert.equal(shellModule.isRedCommand('apt', ['search', 'nginx']), false)
  assert.equal(shellModule.isRedCommand('apt', ['install', 'nginx']), true)
  assert.equal(shellModule.isRedCommand('git', ['clean', '-df']), true)
  assert.equal(shellModule.isRedCommand('git', ['clean', '--force']), true)
  assert.equal(shellModule.isRedCommand('kill', ['-0', '1842']), false)
})

test('Shell: executable paths require execute permission', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(vfs.createFile('/home/ghost/script.sh', [], 'echo ok').error, undefined)
  assert.equal(shell.execute('./script.sh').exitCode, 126)
  assert.equal(vfs.chmod('/home/ghost/script.sh', [], 'u+x').error, undefined)
  assert.equal(shell.execute('./script.sh').exitCode, 0)
})

test('Shell: type and which recognize simulated commands', () => {
  const shell = new ShellEngine(new VFS())
  assert.match(shell.execute('type whoami').stdout, /whoami is \/usr\/bin\/whoami/)
  assert.equal(shell.execute('which grep').stdout, '/usr/bin/grep\n')
})

test('Shell: literal find globs cannot become invalid regular expressions', () => {
  const shell = new ShellEngine(new VFS())
  const result = shell.execute("find . -name '['")
  assert.equal(result.exitCode, 0)
  assert.doesNotMatch(result.stderr, /internal error|command error/)
})

test('Shell: rm removes a symlink without traversing a directory target', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(vfs.symlink('/srv/neonmall/logs', '/home/ghost/log-link', []).error, undefined)
  assert.equal(shell.execute('rm /home/ghost/log-link').exitCode, 0)
  assert.equal(vfs.lstat('/home/ghost/log-link', []).node, null)
  assert.equal(vfs.stat('/srv/neonmall/logs', []).node?.type, 'directory')
})

test('Shell: rm parses common grouped recursive-force flags', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(vfs.createDirectory('/home/ghost/remove-tree', []).error, undefined)
  assert.equal(vfs.createFile('/home/ghost/remove-tree/file.txt', [], 'x').error, undefined)
  assert.equal(shell.execute('rm -rf /home/ghost/remove-tree').exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/remove-tree', []).node, null)
})

test('Shell: rm -i models an explicit no response and preserves the target', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(vfs.createFile('/home/ghost/keep.txt', [], 'important').error, undefined)
  const result = shell.execute('rm -i /home/ghost/keep.txt')
  assert.equal(result.exitCode, 0)
  assert.match(result.stdout, /remove .*keep\.txt.* n/)
  assert.equal(result.stderr, '')
  assert.equal(vfs.readFile('/home/ghost/keep.txt', []).content, 'important')
})

test('Shell: --help and apropos return real discovery output', () => {
  const shell = new ShellEngine(new VFS())
  const help = shell.execute('ls --help')
  assert.equal(help.exitCode, 0)
  assert.match(help.stdout, /Usage: ls/)
  assert.equal(shell.execute('missing-tool --help').exitCode, 127)
  const apropos = shell.execute('apropos directory')
  assert.equal(apropos.exitCode, 0)
  assert.match(apropos.stdout, /^ls\s+-/m)
  assert.notEqual(shell.execute('apropos definitely-no-match').exitCode, 0)
})

test('Shell: command -v resolves builtins and simulated executables', () => {
  const shell = new ShellEngine(new VFS())
  assert.equal(shell.execute('command -v cd').stdout, 'cd\n')
  assert.equal(shell.execute('command -v grep').stdout, '/usr/bin/grep\n')
  assert.notEqual(shell.execute('command -v missing-tool').exitCode, 0)
})

test('Shell: readlink, realpath, and file inspect actual VFS nodes', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(vfs.createFile('/home/ghost/target.txt', [], 'text').error, undefined)
  assert.equal(vfs.symlink('target.txt', '/home/ghost/link.txt', []).error, undefined)
  assert.equal(shell.execute('readlink /home/ghost/link.txt').stdout, 'target.txt\n')
  assert.equal(shell.execute('realpath /home/ghost/link.txt').stdout, '/home/ghost/target.txt\n')
  assert.match(shell.execute('file /home/ghost/link.txt').stdout, /symbolic link to target\.txt/)
  assert.notEqual(shell.execute('readlink /home/ghost/target.txt').exitCode, 0)
})

test('Shell: set -o pipefail changes pipeline exit semantics', () => {
  const shell = new ShellEngine(new VFS())
  assert.equal(shell.execute('false | true').exitCode, 0)
  assert.equal(shell.execute('set -o pipefail').exitCode, 0)
  assert.equal(shell.execute('false | true').exitCode, 1)
  assert.equal(shell.execute('set +o pipefail').exitCode, 0)
  assert.equal(shell.execute('false | true').exitCode, 0)
})

test('Shell: umask is stateful and affects newly touched files', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(shell.execute('umask').stdout, '0022\n')
  assert.equal(shell.execute('umask 077').exitCode, 0)
  assert.equal(shell.execute('touch /home/ghost/private.txt').exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/private.txt', []).node?.permissions, 'rw-------')
  assert.notEqual(shell.execute('umask 999').exitCode, 0)
})

test('Shell: system inventory commands expose bounded simulated state', () => {
  const shell = new ShellEngine(new VFS())
  assert.match(shell.execute('lsblk').stdout, /sda/)
  assert.match(shell.execute('findmnt /').stdout, /\/dev\/sda1/)
  assert.match(shell.execute('ip addr').stdout, /10\.0\.0\.5/)
  assert.match(shell.execute('lsof -i :3000').stdout, /LISTEN/)
  assert.match(shell.execute('lsof +L1').stdout, /deleted/)
  assert.notEqual(shell.execute('findmnt /definitely-missing').exitCode, 0)
})

test('Shell: ssh and ssh-keygen validate hosts and persist simulated keys', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  const generated = shell.execute('ssh-keygen -t ed25519 -f /home/ghost/.ssh/training_key')
  assert.equal(generated.exitCode, 0)
  assert.match(vfs.readFile('/home/ghost/.ssh/training_key.pub', []).content, /^ssh-ed25519 /)
  assert.notEqual(shell.execute('ssh-keygen -t ed25519 -f /home/ghost/.ssh/training_key').exitCode, 0)
  assert.match(shell.execute('ssh ghost@neonmall-server whoami').stdout, /ghost/)
  assert.equal(shell.execute('ssh unknown.invalid').exitCode, 255)
})

test('Shell: dd performs bounded VFS copies and propagates failures', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(vfs.createFile('/home/ghost/input.bin', [], 'abcdef').error, undefined)
  const copied = shell.execute('dd if=/home/ghost/input.bin of=/home/ghost/output.bin bs=1 count=3')
  assert.equal(copied.exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/output.bin', []).content, 'abc')
  assert.match(copied.stderr, /3 bytes copied/)
  assert.notEqual(shell.execute('dd if=/missing of=/home/ghost/untouched').exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/untouched', []).node, null)
})

test('Shell: tee mirrors stdin and persists or appends to VFS files', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  const first = shell.execute('echo alpha | tee /home/ghost/report.txt')
  assert.equal(first.exitCode, 0)
  assert.equal(first.stdout, 'alpha\n')
  assert.equal(vfs.readFile('/home/ghost/report.txt', []).content, 'alpha\n')
  assert.equal(shell.execute('echo beta | tee -a /home/ghost/report.txt').exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/report.txt', []).content, 'alpha\nbeta\n')
  assert.notEqual(shell.execute('echo denied | tee /etc/report.txt').exitCode, 0)
})

test('Shell: type -a lists every modeled resolution and timeout runs a bounded command', () => {
  const shell = new ShellEngine(new VFS())
  assert.match(shell.execute('type -a ls').stdout, /ls is \/usr\/bin\/ls/)
  assert.equal(shell.execute('timeout 1 true').exitCode, 0)
  assert.equal(shell.execute('timeout 1 false').exitCode, 1)
  assert.notEqual(shell.execute('timeout 1').exitCode, 0)
})

test('Shell: xargs -0 consumes NUL-delimited VFS input', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(vfs.createFile('/home/ghost/items.bin', [], 'one\0two\0').error, undefined)
  const result = shell.execute('xargs -0 echo < /home/ghost/items.bin')
  assert.equal(result.exitCode, 0)
  assert.equal(result.stdout, 'one two\n')
})

test('Shell: cp options preserve data, metadata, and no-clobber intent', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(vfs.createFile('/home/ghost/source.txt', [], 'source').error, undefined)
  assert.equal(vfs.chmod('/home/ghost/source.txt', [], '600').error, undefined)
  assert.equal(vfs.createFile('/home/ghost/existing.txt', [], 'keep').error, undefined)
  assert.equal(shell.execute('cp -n source.txt existing.txt').exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/existing.txt', []).content, 'keep')
  const interactiveRefusal = shell.execute('cp -i source.txt existing.txt')
  assert.equal(interactiveRefusal.exitCode, 0)
  assert.match(interactiveRefusal.stdout, /overwrite .*existing\.txt.* n/)
  assert.equal(vfs.readFile('/home/ghost/existing.txt', []).content, 'keep')
  assert.equal(shell.execute('cp -i source.txt interactive-new.txt').exitCode, 0)
  assert.equal(shell.execute('cp -p source.txt preserved.txt').exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/preserved.txt', []).node?.permissions, 'rw-------')
  assert.equal(shell.execute('cp -p /etc/hostname root-source-copy.txt').exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/root-source-copy.txt', []).node?.owner, 'ghost')
  assert.equal(vfs.writeFile('/home/ghost/root-source-copy.txt', [], 'still writable').error, undefined)
})

test('Shell: curl HEAD and find predicates expose bounded real metadata', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  const head = shell.execute('curl -I http://localhost:3000/health')
  assert.equal(head.exitCode, 0)
  assert.match(head.stdout, /^HTTP\/1\.1 200 OK/m)
  assert.doesNotMatch(head.stdout, /"status"/)
  assert.equal(vfs.createFile('/home/ghost/old-large.bin', [], 'abcdef').error, undefined)
  const node = vfs.stat('/home/ghost/old-large.bin', []).node
  node.mtime = new Date(Date.now() - 3 * 86400000)
  assert.equal(vfs.chmod('/home/ghost/old-large.bin', [], '4755').error, undefined)
  assert.match(shell.execute('find . -mtime +1').stdout, /old-large\.bin/)
  assert.match(shell.execute('find . -size +3c').stdout, /old-large\.bin/)
  assert.match(shell.execute('find . -perm -4000').stdout, /old-large\.bin/)
  const print0 = shell.execute('find . -name old-large.bin -print0')
  assert.equal(print0.exitCode, 0)
  assert.match(print0.stdout, /old-large\.bin\0/)
})

test('Shell: recursive grep, sed windows, split, csplit, and truncate mutate VFS accurately', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(vfs.createDirectory('/home/ghost/nested', []).error, undefined)
  assert.equal(vfs.createFile('/home/ghost/nested/log.txt', [], 'one\nneedle\nthree\nfour\n').error, undefined)
  assert.match(shell.execute('grep -R needle nested').stdout, /nested\/log\.txt:needle/)
  assert.equal(shell.execute("sed -n '2,3p' nested/log.txt").stdout, 'needle\nthree\n')
  assert.equal(shell.execute('split -l 2 nested/log.txt chunk-').exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/chunk-aa', []).content, 'one\nneedle\n')
  assert.equal(shell.execute("csplit nested/log.txt '/three/'").exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/xx00', []).content, 'one\nneedle\n')
  assert.equal(shell.execute('truncate -s 3 nested/log.txt').exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/nested/log.txt', []).content, 'one')
})

test('Shell: group and base ACL commands update permissions instead of faking success', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(vfs.createFile('/home/ghost/access.txt', [], 'secret').error, undefined)
  assert.equal(shell.execute('chgrp sudo access.txt').exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/access.txt', []).node?.group, 'sudo')
  assert.equal(shell.execute('setfacl -m o::--- access.txt').exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/access.txt', []).node?.permissions, 'rw-r-----')
  const acl = shell.execute('getfacl access.txt')
  assert.match(acl.stdout, /# group: sudo/)
  assert.match(acl.stdout, /other::---/)
  assert.notEqual(shell.execute('setfacl -m u:alice:r access.txt').exitCode, 0)
})

test('Shell: checksum commands hash actual VFS bytes', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(vfs.createFile('/home/ghost/abc.txt', [], 'abc').error, undefined)
  assert.equal(shell.execute('md5sum abc.txt').stdout, '900150983cd24fb0d6963f7d28e17f72  abc.txt\n')
  assert.equal(shell.execute('sha256sum abc.txt').stdout, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  abc.txt\n')
})

test('Shell: package inspection and Python environments have persistent fixtures', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.match(shell.execute('apt search nginx').stdout, /nginx\/jammy/)
  assert.match(shell.execute('dpkg -s nginx').stdout, /Status: install ok installed/)
  assert.match(shell.execute('pip freeze').stdout, /requests==2\.31\.0/)
  assert.equal(shell.execute('python -m venv /home/ghost/venv').exitCode, 0)
  assert.match(vfs.readFile('/home/ghost/venv/pyvenv.cfg', []).content, /version = 3\.10\.12/)
  assert.equal(vfs.stat('/home/ghost/venv/bin/python', []).node?.permissions, 'rwxr-xr-x')
})

test('Shell: rsync and virtual-host scp transfer real bytes', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(vfs.createFile('/home/ghost/evidence.txt', [], 'evidence').error, undefined)
  assert.equal(shell.execute('rsync evidence.txt mirror.txt').exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/mirror.txt', []).content, 'evidence')
  assert.equal(vfs.createDirectory('/home/ghost/archive', []).error, undefined)
  assert.equal(shell.execute('rsync -av evidence.txt archive').exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/archive/evidence.txt', []).content, 'evidence')
  assert.equal(vfs.stat('/home/ghost/archive', []).node?.permissions, 'rwxr-xr-x')
  assert.equal(shell.execute('rsync -avzn evidence.txt dry-run-copy.txt').exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/dry-run-copy.txt', []).node, null)
  assert.equal(shell.execute('scp evidence.txt ghost@neonmall-server:/tmp/evidence.txt').exitCode, 0)
  assert.equal(shell.execute('scp ghost@neonmall-server:/tmp/evidence.txt recovered.txt').exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/recovered.txt', []).content, 'evidence')
  assert.notEqual(shell.execute('scp evidence.txt unknown.invalid:/tmp/evidence.txt').exitCode, 0)
})

test('Shell: bounded system diagnostics share modeled process, mount, loop, and network state', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(shell.execute('renice 8 -p 1842').exitCode, 0)
  assert.match(shell.execute('ps -o pid,ni,cmd').stdout, /1842 8 node server\.js/)
  assert.equal(shell.execute('nice -n 5 true').exitCode, 0)
  assert.equal(shell.execute('nohup echo durable').exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/nohup.out', []).content, 'durable\n')
  assert.equal(vfs.createDirectory('/home/ghost/mnt', []).error, undefined)
  assert.notEqual(shell.execute('mount /dev/sda1 /home/ghost/mnt').exitCode, 0)
  assert.equal(shell.execute('sudo mount /dev/sda1 /home/ghost/mnt').exitCode, 0)
  assert.match(shell.execute('mount').stdout, /\/home\/ghost\/mnt/)
  assert.equal(vfs.createFile('/home/ghost/disk.img', [], 'image').error, undefined)
  assert.notEqual(shell.execute('losetup /dev/loop0 disk.img').exitCode, 0)
  assert.equal(shell.execute('sudo losetup /dev/loop0 disk.img').exitCode, 0)
  assert.match(shell.execute('losetup -a').stdout, /disk\.img/)
  assert.match(shell.execute('sudo fsck -n /dev/loop0').stdout, /clean/)
  assert.match(shell.execute('findmnt -o SOURCE,TARGET,FSTYPE /').stdout, /\/dev\/sda1 \/ ext4/)
  assert.match(shell.execute('lsblk -o NAME,SIZE /dev/sda').stdout, /^NAME SIZE/m)
  assert.equal(vfs.createDirectory('/home/ghost/loop-mnt', []).error, undefined)
  assert.equal(vfs.createFile('/home/ghost/second.img', [], 'image').error, undefined)
  assert.equal(shell.execute('sudo mount -o loop second.img loop-mnt').exitCode, 0)
  assert.match(shell.execute('findmnt /home/ghost/loop-mnt').stdout, /\/dev\/loop1/)
  assert.match(shell.execute('ldd /usr/bin/node').stdout, /libc\.so\.6/)
  assert.match(shell.execute('strace true').stderr, /execve/)
  assert.equal(shell.execute('strace -e trace=open echo traced').stdout, 'traced\n')
  assert.notEqual(shell.execute('strace -o /root/trace touch strace-side-effect.txt').exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/strace-side-effect.txt', []).node, null)
  assert.match(shell.execute('tcpdump -c 1').stdout, /IP 10\.0\.0\.5/)
})

test('Shell: logrotate and unified patch apply observable, failure-safe file changes', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(vfs.createFile('/home/ghost/app.log', [], 'line\n').error, undefined)
  assert.equal(vfs.createFile('/home/ghost/rotate.conf', [], '/home/ghost/app.log {\n  rotate 2\n}\n').error, undefined)
  assert.equal(shell.execute('logrotate -f rotate.conf').exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/app.log.1', []).content, 'line\n')
  assert.equal(vfs.readFile('/home/ghost/app.log', []).content, '')
  assert.equal(vfs.createFile('/home/ghost/message.txt', [], 'old\nkeep\n').error, undefined)
  const diff = '--- message.txt\n+++ message.txt\n@@ -1,2 +1,2 @@\n-old\n+new\n keep\n'
  assert.equal(vfs.createFile('/home/ghost/change.patch', [], diff).error, undefined)
  assert.equal(shell.execute('patch < change.patch').exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/message.txt', []).content, 'new\nkeep\n')
  assert.notEqual(shell.execute('patch < change.patch').exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/message.txt', []).content, 'new\nkeep\n')
})

test('Shell: touch updates metadata while mv and compressors preserve data on refusal', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(vfs.createFile('/home/ghost/signal', [], 'ready').error, undefined)
  const previousMtime = vfs.stat('/home/ghost/signal', []).node.mtime.getTime()
  assert.equal(shell.execute('touch signal').exitCode, 0)
  assert.ok(vfs.stat('/home/ghost/signal', []).node.mtime.getTime() > previousMtime)
  assert.notEqual(shell.execute('touch /etc/hostname').exitCode, 0)
  assert.notEqual(shell.execute('touch --unknown signal').exitCode, 0)
  assert.equal(shell.execute('touch -t 202401010830 signal.conf').exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/signal.conf', []).node?.mtime.toISOString(), '2024-01-01T08:30:00.000Z')
  assert.equal(shell.execute('touch -r signal.conf copied-time.conf').exitCode, 0)
  assert.equal(
    vfs.stat('/home/ghost/copied-time.conf', []).node?.mtime.toISOString(),
    vfs.stat('/home/ghost/signal.conf', []).node?.mtime.toISOString(),
  )
  assert.notEqual(shell.execute('touch -t 202413010830 invalid.conf').exitCode, 0)
  assert.deepEqual(shell.execute('touch -c absent.conf').successfulCommands, [])

  assert.equal(vfs.createFile('/home/ghost/source-move', [], 'source').error, undefined)
  assert.equal(vfs.createFile('/home/ghost/destination-move', [], 'keep').error, undefined)
  assert.equal(shell.execute('mv -n source-move destination-move').exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/source-move', []).content, 'source')
  assert.equal(vfs.readFile('/home/ghost/destination-move', []).content, 'keep')
  assert.notEqual(shell.execute('mv -i source-move destination-move').exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/source-move', []).content, 'source')
  assert.equal(vfs.readFile('/home/ghost/destination-move', []).content, 'keep')

  for (const [command, suffix] of [['gzip', '.gz'], ['bzip2', '.bz2'], ['xz', '.xz']]) {
    const source = `${command}-source`
    const destination = `${source}${suffix}`
    assert.equal(vfs.createFile(`/home/ghost/${source}`, [], 'important').error, undefined)
    assert.equal(vfs.createFile(`/home/ghost/${destination}`, [], 'old archive').error, undefined)
    assert.equal(vfs.chmod(`/home/ghost/${destination}`, [], '444').error, undefined)
    assert.notEqual(shell.execute(`${command} ${source}`).exitCode, 0)
    assert.equal(vfs.readFile(`/home/ghost/${source}`, []).content, 'important')
    assert.equal(vfs.readFile(`/home/ghost/${destination}`, []).content, 'old archive')
  }
})

test('Shell: process signals validate targets and mutate bounded process state', () => {
  const shell = new ShellEngine(new VFS())
  assert.notEqual(shell.execute('kill -TERM').exitCode, 0)
  assert.notEqual(shell.execute('kill 99999').exitCode, 0)
  assert.notEqual(shell.execute('kill 1').exitCode, 0)
  assert.deepEqual(shell.execute('kill -0 1842').successfulCommands, [])
  assert.equal(shell.execute('kill -l 9').stdout, 'KILL\n')
  assert.notEqual(shell.execute('top -n').exitCode, 0)
  assert.equal(shell.execute('kill -STOP 1842').exitCode, 0)
  assert.match(shell.execute('ps aux').stdout, /1842[\s\S]*\sT\s/)
  assert.match(shell.execute('top -b -n 1').stdout, /Tasks:\s+5 total,\s+1 running,\s+3 sleeping,\s+1 stopped/)
  assert.equal(shell.execute('kill -CONT 1842').exitCode, 0)
  assert.equal(shell.execute('kill --signal=TERM 1842').exitCode, 0)
  assert.notEqual(shell.execute('pgrep node').exitCode, 0)
  assert.doesNotMatch(shell.execute('ps -o pid,ni,cmd').stdout, /1842/)
  assert.doesNotMatch(shell.execute('top -b -n 1').stdout, /1842/)
  assert.notEqual(shell.execute('kill -TERM 1842').exitCode, 0)
})

test('Shell: npm ci requires a synchronized lockfile and persists an install snapshot', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.notEqual(shell.execute('npm ci').exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/node_modules', []).node, null)
  const manifest = {
    name: 'locked-app',
    version: '1.0.0',
    dependencies: { chalk: '^5.0.0' },
    devDependencies: { vitest: '^1.0.0' },
    optionalDependencies: { fsevents: '^2.0.0' },
  }
  assert.equal(vfs.createFile('/home/ghost/package.json', [], JSON.stringify(manifest)).error, undefined)
  assert.equal(vfs.createFile('/home/ghost/package-lock.json', [], JSON.stringify({
    name: 'different-app',
    version: '1.0.0',
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'different-app',
        version: '1.0.0',
        dependencies: { chalk: '^5.0.0' },
        devDependencies: { vitest: '^1.0.0' },
        optionalDependencies: { fsevents: '^2.0.0' },
      },
    },
  })).error, undefined)
  assert.notEqual(shell.execute('npm ci').exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/node_modules', []).node, null)
  assert.notEqual(shell.execute('npm ci --garbage').exitCode, 0)
  assert.equal(vfs.writeFile('/home/ghost/package-lock.json', [], JSON.stringify({
    name: 'locked-app',
    version: '1.0.0',
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'locked-app',
        version: '1.0.0',
        dependencies: { chalk: '^5.0.0', unexpected: '1.0.0' },
        devDependencies: { vitest: '^1.0.0' },
        optionalDependencies: { fsevents: '^2.0.0' },
      },
    },
  })).error, undefined)
  assert.notEqual(shell.execute('npm ci').exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/node_modules', []).node, null)
  assert.equal(vfs.writeFile('/home/ghost/package-lock.json', [], JSON.stringify({
    name: 'locked-app',
    version: '1.0.0',
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'locked-app',
        version: '1.0.0',
        dependencies: { chalk: '^5.0.0' },
        devDependencies: { vitest: '^1.0.0' },
        optionalDependencies: { fsevents: '^2.0.0' },
      },
    },
  })).error, undefined)
  assert.equal(shell.execute('npm ci').exitCode, 0)
  assert.match(vfs.readFile('/home/ghost/node_modules/.package-lock.json', []).content, /chalk/)
  assert.match(vfs.readFile('/home/ghost/node_modules/.package-lock.json', []).content, /vitest/)
  assert.match(vfs.readFile('/home/ghost/node_modules/.package-lock.json', []).content, /fsevents/)
  assert.deepEqual(shell.services.installedPackages.sort(), ['chalk', 'fsevents', 'vitest'])
  assert.equal(shell.services.npmPackages.size, 3)
  assert.equal(shell.execute('npm install chalk').exitCode, 0)
  assert.equal(shell.execute('npm install chalk').exitCode, 0)
  assert.equal(shell.services.installedPackages.filter(name => name === 'chalk').length, 1)
})

test('Shell: npm ci validates manifest and lockfile schemas before creating node_modules', () => {
  const cases = [
    {
      manifest: { name: 'x', version: '1.0.0', dependencies: [] },
      lock: { name: 'x', version: '1.0.0', lockfileVersion: 3, packages: { '': { dependencies: {} } } },
    },
    {
      manifest: { name: 'x', version: '1.0.0' },
      lock: { name: 'x', version: '1.0.0', lockfileVersion: 3, packages: [] },
    },
    {
      manifest: { name: 'x', version: '1.0.0' },
      lock: { name: 'other', version: '9.0.0', lockfileVersion: 3, packages: { '': {} } },
    },
    {
      manifest: { name: 'x', version: '1.0.0', dependencies: { chalk: '^5.0.0' } },
      lock: { name: 'x', version: '1.0.0', lockfileVersion: 1, dependencies: { chalk: {} } },
    },
  ]
  for (const { manifest, lock } of cases) {
    const vfs = new VFS()
    const shell = new ShellEngine(vfs)
    assert.equal(vfs.createFile('/home/ghost/package.json', [], JSON.stringify(manifest)).error, undefined)
    assert.equal(vfs.createFile('/home/ghost/package-lock.json', [], JSON.stringify(lock)).error, undefined)
    assert.notEqual(shell.execute('npm ci').exitCode, 0)
    assert.equal(vfs.stat('/home/ghost/node_modules', []).node, null)
  }
  const legacyVfs = new VFS()
  const legacyShell = new ShellEngine(legacyVfs)
  assert.equal(legacyVfs.createFile('/home/ghost/package.json', [], JSON.stringify({ name: 'x', version: '1.0.0' })).error, undefined)
  assert.equal(legacyVfs.createFile('/home/ghost/package-lock.json', [], JSON.stringify({
    name: 'x',
    version: '1.0.0',
    lockfileVersion: 1,
    dependencies: { leftpad: { version: '1.0.0' } },
  })).error, undefined)
  assert.equal(legacyVfs.createDirectory('/home/ghost/node_modules', []).error, undefined)
  assert.equal(legacyVfs.createFile('/home/ghost/node_modules/sentinel', [], 'KEEP').error, undefined)
  assert.notEqual(legacyShell.execute('npm ci').exitCode, 0)
  assert.equal(legacyVfs.readFile('/home/ghost/node_modules/sentinel', []).content, 'KEEP')
})

test('Shell: crontab installs only validated, non-empty schedule files atomically', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.notEqual(shell.execute('crontab').exitCode, 0)
  const originalJobs = [...shell.services.cronJobs.entries()]
  assert.equal(vfs.createFile('/home/ghost/bad.cron', [], 'not a cron line\n').error, undefined)
  assert.notEqual(shell.execute('crontab bad.cron').exitCode, 0)
  assert.deepEqual([...shell.services.cronJobs.entries()], originalJobs)
  assert.equal(vfs.writeFile('/home/ghost/bad.cron', [], '99 2 * * * /home/ghost/backup.sh\n').error, undefined)
  assert.notEqual(shell.execute('crontab bad.cron').exitCode, 0)
  assert.equal(vfs.writeFile('/home/ghost/bad.cron', [], '0 2 * * * first\n0 2 * * * second\n').error, undefined)
  assert.notEqual(shell.execute('crontab bad.cron').exitCode, 0)
  assert.equal(vfs.createFile('/home/ghost/good.cron', [], '0 2 * * * /home/ghost/backup.sh\n*/15 * * * * /home/ghost/health.sh\n').error, undefined)
  assert.equal(shell.execute('crontab good.cron').exitCode, 0)
  assert.deepEqual([...shell.services.cronJobs.entries()], [
    ['0 2 * * *', '/home/ghost/backup.sh'],
    ['*/15 * * * *', '/home/ghost/health.sh'],
  ])
  assert.match(shell.execute('crontab -l').stdout, /health\.sh/)
})

test('Shell: make requires real rules and runs bounded recipes against the VFS', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.notEqual(shell.execute('make build').exitCode, 0)
  assert.equal(vfs.createFile('/home/ghost/Makefile', [], 'build:\n\tmkdir -p build\n\ttouch build/app\n').error, undefined)
  assert.notEqual(shell.execute('make missing').exitCode, 0)
  assert.equal(shell.execute('make -n build').exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/build', []).node, null)
  assert.equal(shell.execute('make build').exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/build/app', []).node?.type, 'file')
  assert.equal(vfs.writeFile('/home/ghost/Makefile', [], 'all: generated\n\ttouch all\ngenerated:\n\ttouch generated\n').error, undefined)
  assert.equal(shell.execute('make all').exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/generated', []).node?.type, 'file')
  assert.equal(vfs.stat('/home/ghost/all', []).node?.type, 'file')
})

test('Shell: Go and Cargo builds require projects and create bounded artifacts', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.notEqual(shell.execute('go build').exitCode, 0)
  assert.notEqual(shell.execute('cargo build').exitCode, 0)
  assert.notEqual(shell.execute('go build -bogus').exitCode, 0)
  assert.notEqual(shell.execute('cargo build --bogus').exitCode, 0)
  assert.equal(shell.execute('go mod init example.com/godemo').exitCode, 0)
  assert.equal(vfs.createFile('/home/ghost/main.go', [], 'package main\nfunc main() { var x = }\n').error, undefined)
  assert.notEqual(shell.execute('go build').exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/godemo', []).node, null)
  assert.equal(vfs.createFile('/home/ghost/main.go', [], 'package main\nimport "fmt"\nfunc main() { fmt.Println("hello") }\n').error, undefined)
  assert.notEqual(shell.execute('go run main.go missing.go').exitCode, 0)
  assert.equal(shell.execute('go test').exitCode, 0)
  assert.equal(shell.execute('go build').exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/godemo', []).node?.permissions, 'rwxr-xr-x')
  assert.equal(shell.execute('cargo new rustdemo').exitCode, 0)
  assert.notEqual(shell.execute('cargo new rustdemo').exitCode, 0)
  assert.equal(shell.execute('cd rustdemo').exitCode, 0)
  assert.equal(vfs.writeFile('/home/ghost/rustdemo/src/main.rs', [], 'fn main() { let x = ; }\n').error, undefined)
  assert.notEqual(shell.execute('cargo build').exitCode, 0)
  assert.equal(vfs.writeFile('/home/ghost/rustdemo/src/main.rs', [], 'fn main() { println!("hello"); }\n').error, undefined)
  assert.equal(shell.execute('cargo build').exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/rustdemo/target/debug/rustdemo', []).node?.permissions, 'rwxr-xr-x')
})

test('Shell: cargo run validates a binary before touching existing library artifacts', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(vfs.createDirectory('/home/ghost/libdemo', []).error, undefined)
  assert.equal(vfs.createDirectory('/home/ghost/libdemo/src', []).error, undefined)
  assert.equal(vfs.createDirectory('/home/ghost/libdemo/target', []).error, undefined)
  assert.equal(vfs.createDirectory('/home/ghost/libdemo/target/debug', []).error, undefined)
  assert.equal(vfs.createFile('/home/ghost/libdemo/Cargo.toml', [], '[package]\nname = "libdemo"\nversion = "0.1.0"\n').error, undefined)
  assert.equal(vfs.createFile('/home/ghost/libdemo/src/lib.rs', [], 'pub fn answer() -> i32 { 42 }\n').error, undefined)
  assert.equal(vfs.createFile('/home/ghost/libdemo/target/debug/liblibdemo.rlib', [], 'ORIGINAL').error, undefined)
  assert.equal(shell.execute('cd libdemo').exitCode, 0)
  assert.notEqual(shell.execute('cargo run').exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/libdemo/target/debug/liblibdemo.rlib', []).content, 'ORIGINAL')
  assert.equal(vfs.createDirectory('/home/ghost/fakecargo', []).error, undefined)
  assert.equal(vfs.createDirectory('/home/ghost/fakecargo/src', []).error, undefined)
  assert.equal(vfs.createFile('/home/ghost/fakecargo/Cargo.toml', [], '[dependencies.foo]\nname = "demo"\n').error, undefined)
  assert.equal(vfs.createFile('/home/ghost/fakecargo/src/main.rs', [], 'fn main() {}\n').error, undefined)
  assert.equal(shell.execute('cd /home/ghost/fakecargo').exitCode, 0)
  assert.notEqual(shell.execute('cargo build').exitCode, 0)
})

test('Shell: tar archives are round-trippable, permission-aware, and traversal-safe', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.notEqual(shell.execute('tar -c').exitCode, 0)
  assert.equal(vfs.createDirectory('/home/ghost/source-dir', []).error, undefined)
  assert.equal(vfs.createFile('/home/ghost/source-dir/secret.txt', [], 'classified').error, undefined)
  assert.equal(vfs.chmod('/home/ghost/source-dir/secret.txt', [], '600').error, undefined)
  assert.equal(shell.execute('tar -czf bundle.tar.gz source-dir').exitCode, 0)
  assert.match(shell.execute('tar -tf bundle.tar.gz').stdout, /source-dir\/secret\.txt/)
  assert.equal(vfs.deleteDirectory('/home/ghost/source-dir', [], true).error, undefined)
  assert.equal(shell.execute('tar -xpf bundle.tar.gz').exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/source-dir/secret.txt', []).content, 'classified')
  assert.equal(vfs.stat('/home/ghost/source-dir/secret.txt', []).node?.permissions, 'rw-------')
  assert.notEqual(shell.execute('tar -xf missing.tar').exitCode, 0)
  const malicious = JSON.stringify({
    format: 'ghost-archive-v1',
    kind: 'tar',
    compressed: false,
    entries: [{
      path: '../escape.txt',
      type: 'file',
      content: 'escape',
      permissions: 'rw-r--r--',
      owner: 'ghost',
      group: 'ghost',
      mtime: new Date().toISOString(),
    }],
  })
  assert.equal(vfs.createFile('/home/ghost/malicious.tar', [], malicious).error, undefined)
  assert.notEqual(shell.execute('tar -xf malicious.tar').exitCode, 0)
  assert.equal(vfs.stat('/home/escape.txt', []).node, null)
  const lockedDirectory = JSON.stringify({
    format: 'ghost-archive-v1',
    kind: 'tar',
    compressed: false,
    entries: [
      {
        path: 'locked',
        type: 'directory',
        permissions: 'rw-------',
        owner: 'ghost',
        group: 'ghost',
        mtime: new Date().toISOString(),
      },
      {
        path: 'locked/child.txt',
        type: 'file',
        content: 'inside',
        permissions: '---------',
        owner: 'ghost',
        group: 'ghost',
        mtime: new Date().toISOString(),
      },
    ],
  })
  assert.equal(vfs.createFile('/home/ghost/locked.tar', [], lockedDirectory).error, undefined)
  assert.equal(shell.execute('tar -xpf locked.tar').exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/locked', []).node?.permissions, 'rw-------')
  assert.equal(vfs.stat('/home/ghost/locked/child.txt', []).node, null)
  vfs.setCurrentUser('root')
  assert.equal(vfs.stat('/home/ghost/locked/child.txt', []).node?.permissions, '---------')
  assert.equal(vfs.readFile('/home/ghost/locked/child.txt', []).content, 'inside')
  vfs.setCurrentUser('ghost')
})

test('Shell: zip and unzip validate inputs and round-trip bounded archives', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.notEqual(shell.execute('zip empty.zip').exitCode, 0)
  assert.equal(vfs.createDirectory('/home/ghost/zip-source', []).error, undefined)
  assert.equal(vfs.createFile('/home/ghost/zip-source/file.txt', [], 'zipped').error, undefined)
  assert.notEqual(shell.execute('zip files.zip zip-source').exitCode, 0)
  assert.equal(shell.execute('zip -r files.zip zip-source').exitCode, 0)
  assert.match(shell.execute('unzip -l files.zip').stdout, /zip-source\/file\.txt/)
  assert.equal(vfs.deleteDirectory('/home/ghost/zip-source', [], true).error, undefined)
  assert.equal(shell.execute('unzip -d restored files.zip').exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/restored/zip-source/file.txt', []).content, 'zipped')
  assert.notEqual(shell.execute('unzip missing.zip').exitCode, 0)
})

test('Shell: screen session commands fail closed on missing or contradictory state', () => {
  const shell = new ShellEngine(new VFS())
  assert.notEqual(shell.execute('screen -d missing').exitCode, 0)
  assert.notEqual(shell.execute('screen -ls').exitCode, 0)
  assert.equal(shell.execute('screen -S work').exitCode, 0)
  assert.notEqual(shell.execute('screen -S work').exitCode, 0)
  assert.notEqual(shell.execute('screen -d work extra').exitCode, 0)
  assert.equal(shell.execute('screen -d work').exitCode, 0)
  assert.notEqual(shell.execute('screen -d work').exitCode, 0)
  assert.equal(shell.execute('screen -r work').exitCode, 0)
  assert.match(shell.execute('screen -ls').stdout, /work\s+\(Attached\)/)
})

test('Git: init does not mutate the input state', () => {
  const initial = createGitState()
  const result = gitCommand(initial, ['init'], '/repo')
  assert.equal(initial.initialized, false)
  assert.equal(initial.branches.size, 0)
  assert.equal(result.state.branches.has('main'), true)
})

test('Git: switch -c creates and selects the requested branch', () => {
  const initialized = gitCommand(createGitState(), ['init'], '/repo').state
  const result = gitCommand(initialized, ['switch', '-c', 'feature'], '/repo')
  assert.equal(result.exitCode, 0)
  assert.equal(result.state.currentBranch, 'feature')
  assert.equal(result.state.branches.has('feature'), true)
  assert.equal(result.state.branches.has('-c'), false)
})

test('Git: add and commit preserve unrelated unstaged changes', () => {
  const initialized = gitCommand(createGitState(), ['init'], '/repo').state
  const dirty = {
    ...initialized,
    workingDirectory: new Map([['a.txt', 'a'], ['b.txt', 'b']]),
  }
  const added = gitCommand(dirty, ['add', 'a.txt'], '/repo').state
  assert.deepEqual([...added.workingDirectory.keys()], ['b.txt'])
  const committed = gitCommand(added, ['commit', '-m', 'add a'], '/repo')
  assert.equal(committed.exitCode, 0)
  assert.deepEqual([...committed.state.workingDirectory.keys()], ['b.txt'])
  assert.equal(added.branches.get('main')?.length, 0)
  assert.equal(committed.state.branches.get('main')?.length, 1)
})

test('Git: deleting a missing branch is an error', () => {
  const initialized = gitCommand(createGitState(), ['init'], '/repo').state
  assert.notEqual(gitCommand(initialized, ['branch', '-d', 'missing'], '/repo').exitCode, 0)
})

test('Git: revert rejects an unknown commit', () => {
  const initialized = gitCommand(createGitState(), ['init'], '/repo').state
  assert.notEqual(gitCommand(initialized, ['revert', 'deadbeef'], '/repo').exitCode, 0)
})

test('Git: repository commands reject an uninitialized state', () => {
  assert.equal(gitCommand(createGitState(), ['fetch'], '/repo').exitCode, 128)
})

test('Git: switching branches restores that branch head', () => {
  let state = gitCommand(createGitState(), ['init'], '/repo').state
  state = { ...state, workingDirectory: new Map([['main.txt', 'main']]) }
  state = gitCommand(state, ['add', '.'], '/repo').state
  state = gitCommand(state, ['commit', '-m', 'main'], '/repo').state
  const mainHead = state.head
  state = gitCommand(state, ['switch', '-c', 'feature'], '/repo').state
  state = { ...state, workingDirectory: new Map([['feature.txt', 'feature']]) }
  state = gitCommand(state, ['add', '.'], '/repo').state
  state = gitCommand(state, ['commit', '-m', 'feature'], '/repo').state
  assert.notEqual(state.head, mainHead)
  state = gitCommand(state, ['switch', 'main'], '/repo').state
  assert.equal(state.head, mainHead)
})

test('Git: merge updates HEAD, branch history, commits, and reflog together', () => {
  let state = gitCommand(createGitState(), ['init'], '/repo').state
  state = { ...state, workingDirectory: new Map([['base.txt', 'base']]) }
  state = gitCommand(state, ['add', '.'], '/repo').state
  state = gitCommand(state, ['commit', '-m', 'base'], '/repo').state
  state = gitCommand(state, ['switch', '-c', 'feature'], '/repo').state
  state = { ...state, workingDirectory: new Map([['feature.txt', 'feature']]) }
  state = gitCommand(state, ['add', '.'], '/repo').state
  state = gitCommand(state, ['commit', '-m', 'feature'], '/repo').state
  state = gitCommand(state, ['switch', 'main'], '/repo').state
  const before = { commits: state.commits.length, branch: state.branches.get('main').length, reflog: state.reflog.length }
  state = gitCommand(state, ['merge', 'feature'], '/repo').state
  assert.equal(state.commits.length, before.commits + 1)
  assert.equal(state.branches.get('main').length, before.branch + 1)
  assert.equal(state.reflog.length, before.reflog + 1)
  assert.equal(state.head, state.branches.get('main').at(-1).hash)
})

test('Git: rebase replays divergent commits and advances every current-branch pointer', () => {
  let state = gitCommand(createGitState(), ['init'], '/repo').state
  state = { ...state, workingDirectory: new Map([['base.txt', 'base']]) }
  state = gitCommand(state, ['add', '.'], '/repo').state
  state = gitCommand(state, ['commit', '-m', 'base'], '/repo').state
  state = gitCommand(state, ['switch', '-c', 'feature'], '/repo').state
  state = { ...state, workingDirectory: new Map([['feature.txt', 'feature']]) }
  state = gitCommand(state, ['add', '.'], '/repo').state
  state = gitCommand(state, ['commit', '-m', 'feature'], '/repo').state
  const oldFeatureHead = state.head
  state = gitCommand(state, ['switch', 'main'], '/repo').state
  state = { ...state, workingDirectory: new Map([['main.txt', 'main']]) }
  state = gitCommand(state, ['add', '.'], '/repo').state
  state = gitCommand(state, ['commit', '-m', 'main'], '/repo').state
  state = gitCommand(state, ['switch', 'feature'], '/repo').state
  const before = { commits: state.commits.length, reflog: state.reflog.length }
  const result = gitCommand(state, ['rebase', 'main'], '/repo')
  assert.equal(result.exitCode, 0)
  assert.notEqual(result.state.head, oldFeatureHead)
  assert.equal(result.state.head, result.state.branches.get('feature').at(-1).hash)
  assert.deepEqual(result.state.branches.get('feature').map(commit => commit.message), ['base', 'main', 'feature'])
  assert.equal(result.state.commits.length, before.commits + 1)
  assert.equal(result.state.reflog.length, before.reflog + 1)
})

test('Git: reset validates and moves HEAD and the current branch atomically', () => {
  let state = gitCommand(createGitState(), ['init'], '/repo').state
  state = { ...state, workingDirectory: new Map([['one.txt', 'one']]) }
  state = gitCommand(state, ['add', '.'], '/repo').state
  state = gitCommand(state, ['commit', '-m', 'one'], '/repo').state
  const firstHead = state.head
  state = { ...state, workingDirectory: new Map([['two.txt', 'two']]) }
  state = gitCommand(state, ['add', '.'], '/repo').state
  state = gitCommand(state, ['commit', '-m', 'two'], '/repo').state
  state = { ...state, stagingArea: new Map([['staged.txt', 'staged']]), workingDirectory: new Map([['dirty.txt', 'dirty']]) }
  const reset = gitCommand(state, ['reset', '--hard', firstHead.slice(0, 8)], '/repo')
  assert.equal(reset.exitCode, 0)
  assert.equal(reset.state.head, firstHead)
  assert.equal(reset.state.branches.get('main').at(-1).hash, firstHead)
  assert.equal(reset.state.stagingArea.size, 0)
  assert.equal(reset.state.workingDirectory.size, 0)
  const invalid = gitCommand(reset.state, ['reset', '--hard', 'deadbeef'], '/repo')
  assert.notEqual(invalid.exitCode, 0)
  assert.equal(invalid.state, reset.state)
})

test('Git: stash round-trips staged and unstaged changes', () => {
  let state = gitCommand(createGitState(), ['init'], '/repo').state
  state = {
    ...state,
    stagingArea: new Map([['staged.txt', 'staged']]),
    workingDirectory: new Map([['working.txt', 'working']]),
  }
  state = gitCommand(state, ['stash', 'push', '-m', 'snapshot'], '/repo').state
  assert.equal(state.stagingArea.size, 0)
  assert.equal(state.workingDirectory.size, 0)
  assert.equal(state.stash.at(-1).message, 'snapshot')
  state = gitCommand(state, ['stash', 'pop'], '/repo').state
  assert.equal(state.stagingArea.get('staged.txt'), 'staged')
  assert.equal(state.workingDirectory.get('working.txt'), 'working')
})

test('Git: clean clears simulated untracked working files', () => {
  let state = gitCommand(createGitState(), ['init'], '/repo').state
  state = { ...state, workingDirectory: new Map([['untracked.txt', 'x']]) }
  const result = gitCommand(state, ['clean', '-f'], '/repo')
  assert.equal(result.exitCode, 0)
  assert.equal(result.state.workingDirectory.size, 0)
})

test('Git: a tag cannot target an unborn HEAD', () => {
  const state = gitCommand(createGitState(), ['init'], '/repo').state
  assert.notEqual(gitCommand(state, ['tag', 'v1.0.0'], '/repo').exitCode, 0)
})

test('Git: duplicate refs and unsupported stateful subcommands fail closed', () => {
  let state = gitCommand(createGitState(), ['init'], '/repo').state
  state = gitCommand(state, ['branch', 'feature'], '/repo').state
  assert.notEqual(gitCommand(state, ['branch', 'feature'], '/repo').exitCode, 0)
  assert.notEqual(gitCommand(state, ['remote', 'add', 'origin', 'https://example.test/repo.git'], '/repo').exitCode, 0)
  assert.notEqual(gitCommand(state, ['stash', 'definitely-unsupported'], '/repo').exitCode, 0)
  assert.notEqual(gitCommand(state, ['restore'], '/repo').exitCode, 0)
})

test('Git: dirty rebase and pull without a remote preserve their input states', () => {
  let state = gitCommand(createGitState(), ['init'], '/repo').state
  state = gitCommand(state, ['branch', 'upstream'], '/repo').state
  state = { ...state, workingDirectory: new Map([['dirty.txt', 'dirty']]) }
  const dirtyRebase = gitCommand(state, ['rebase', 'upstream'], '/repo')
  assert.notEqual(dirtyRebase.exitCode, 0)
  assert.equal(dirtyRebase.state, state)
  const withoutRemote = { ...state, remotes: new Map() }
  const pull = gitCommand(withoutRemote, ['pull'], '/repo')
  assert.notEqual(pull.exitCode, 0)
  assert.equal(pull.state, withoutRemote)
})

test('Git: restore --staged preserves the file as an unstaged change', () => {
  let state = gitCommand(createGitState(), ['init'], '/repo').state
  state = { ...state, stagingArea: new Map([['change.txt', 'content']]) }
  const restored = gitCommand(state, ['restore', '--staged', 'change.txt'], '/repo')
  assert.equal(restored.exitCode, 0)
  assert.equal(restored.state.stagingArea.has('change.txt'), false)
  assert.equal(restored.state.workingDirectory.get('change.txt'), 'content')
})

test('Git: bisect validates history, narrows a seeded range, logs, and resets', () => {
  let state = gitCommand(createGitState(), ['init'], '/repo').state
  const emptyStart = gitCommand(state, ['bisect', 'start'], '/repo')
  assert.equal(emptyStart.exitCode, 128)
  assert.equal(emptyStart.state, state)

  for (let index = 0; index < 5; index++) {
    state = gitCommand(state, ['add', `checkpoint-${index}.txt`], '/repo').state
    state = gitCommand(state, ['commit', '-m', `checkpoint ${index}`], '/repo').state
    if (index === 0) state = gitCommand(state, ['tag', 'v1.0'], '/repo').state
  }

  const started = gitCommand(state, ['bisect', 'start', 'HEAD', 'v1.0'], '/repo')
  assert.equal(started.exitCode, 0)
  assert.match(started.stdout, /Bisecting:/)
  assert.equal(started.state.bisect?.good.length, 1)
  assert.equal(started.state.bisect?.bad.length, 1)
  assert.equal(started.state.head, started.state.bisect?.current)
  assert.notEqual(started.state.head, state.head)
  const refusedRun = gitCommand(started.state, ['bisect', 'run', 'false'], '/repo')
  assert.notEqual(refusedRun.exitCode, 0)
  assert.equal(refusedRun.state, started.state)

  const marked = gitCommand(started.state, ['bisect', 'bad'], '/repo')
  assert.equal(marked.exitCode, 0)
  assert.match(marked.stdout, /Bisecting:|first bad commit/)
  const log = gitCommand(marked.state, ['bisect', 'log'], '/repo')
  assert.equal(log.exitCode, 0)
  assert.match(log.stdout, /git bisect start HEAD v1\.0/)
  assert.match(log.stdout, /git bisect bad/)

  const reset = gitCommand(marked.state, ['bisect', 'reset'], '/repo')
  assert.equal(reset.exitCode, 0)
  assert.equal(reset.state.bisect, null)
  assert.equal(reset.state.head, state.head)
})

test('Validator: an empty file still satisfies file_exists', () => {
  const level = mission({
    objectives: [{ id: 'required', required: true }],
    checks: [{ type: 'file_exists', pattern: '/empty', objectiveId: 'required' }],
  })
  const results = validateMission(level, missionState({ vfs: { files: { '/empty': '' } } }))
  assert.equal(results[0].completed, true)
})

test('Validator: malformed content patterns fail closed without throwing', () => {
  const level = mission({
    objectives: [{ id: 'required', required: true }],
    checks: [{ type: 'file_contains', pattern: '/file:[', objectiveId: 'required' }],
  })
  assert.doesNotThrow(() => validateMission(level, missionState({ vfs: { files: { '/file': 'text' } } })))
  assert.equal(validateMission(level, missionState({ vfs: { files: { '/file': 'text' } } }))[0].completed, false)
})

test('Validator: file_not_contains requires the target file to exist', () => {
  const level = mission({
    objectives: [{ id: 'required', required: true }],
    checks: [{ type: 'file_not_contains', pattern: '/missing:secret', objectiveId: 'required' }],
  })
  assert.equal(validateMission(level, missionState())[0].completed, false)
})

test('Validator: global file_not_contains does not pass an empty filesystem', () => {
  const level = mission({
    objectives: [{ id: 'required', required: true }],
    checks: [{ type: 'file_not_contains', pattern: 'secret', objectiveId: 'required' }],
  })
  assert.equal(validateMission(level, missionState())[0].completed, false)
})

test('Validator: omitted required results cannot complete a mission', () => {
  const level = mission({
    objectives: [{ id: 'one', required: true }, { id: 'two', required: true }],
    checks: [],
  })
  assert.equal(isMissionComplete(level, [{ objectiveId: 'one', completed: true, label: 'one' }]), false)
})

test('Validator: optional objectives do not block completion', () => {
  const level = mission({
    objectives: [{ id: 'required', required: true }, { id: 'optional', required: false }],
    checks: [],
  })
  assert.equal(isMissionComplete(level, [
    { objectiveId: 'required', completed: true, label: 'required' },
    { objectiveId: 'optional', completed: false, label: 'optional' },
  ]), true)
})

test('Validator: explicitly bound safety checks fail when red commands were used', () => {
  const level = mission({
    objectives: [{ id: 'safe', required: true }],
    checks: [{ type: 'no_red_command_used', objectiveId: 'safe' }],
  })
  const results = validateMission(level, missionState({ redCommandsUsed: ['rm'] }))
  assert.equal(results[0].completed, false)
  assert.equal(isMissionComplete(level, results), false)
})

test('Validator: legacy aggregate objectives include safety checks', () => {
  const level = mission({
    objectives: [
      { id: 'obj-1', required: true },
      { id: 'obj-practice', required: true },
    ],
    checks: [
      { type: 'command_used', pattern: 'echo' },
      { type: 'no_red_command_used' },
    ],
  })
  const results = validateMission(level, missionState({
    commandHistory: ['echo ok'],
    redCommandsUsed: ['rm'],
  }))
  assert.equal(results.find(result => result.objectiveId === 'obj-1')?.completed, true)
  assert.equal(results.find(result => result.objectiveId === 'obj-practice')?.completed, false)
  assert.equal(isMissionComplete(level, results), false)
})

test('Validator: a dangerous command required by the mission is not self-defeating', () => {
  const level = mission({
    objectives: [
      { id: 'obj-1', required: true },
      { id: 'obj-practice', required: true },
    ],
    checks: [
      { type: 'command_used', pattern: 'chmod 600 secret.txt' },
      { type: 'no_red_command_used' },
    ],
  })
  const results = validateMission(level, missionState({
    commandHistory: ['chmod 600 secret.txt'],
    redCommandsUsed: ['chmod 600 secret.txt'],
  }))
  assert.equal(results.every(result => result.completed), true)
  assert.equal(isMissionComplete(level, results), true)
  const score = calculateScore(
    {
      ...level,
      scoring: {
        objectives_weight: 40,
        safety_weight: 20,
        verification_weight: 15,
        efficiency_weight: 10,
        shortcuts_weight: 5,
        review_weight: 5,
        no_hints_bonus: 5,
      },
    },
    results,
    missionState({
      commandHistory: ['chmod 600 secret.txt'],
      redCommandsUsed: ['chmod 600 secret.txt'],
    }),
    10,
    1,
  )
  assert.equal(score.breakdown.safety, 20)
  assert.deepEqual(score.penalties, [])
})

test('Scoring: only observable evidence earns points and time or hints cannot improve a score', () => {
  const base = mission({
    objectives: [
      { id: 'obj-1', required: true },
      { id: 'obj-practice', required: true },
    ],
    checks: [
      { type: 'command_used', pattern: 'whoami' },
      { type: 'no_red_command_used' },
    ],
  })
  const level = {
    ...base,
    estimated_time: '2-3 min',
    scoring: {
      max_score: 100,
      par_actions: 2,
      par_time_seconds: 180,
      objectives_weight: 40,
      safety_weight: 20,
      verification_weight: 15,
      efficiency_weight: 10,
      shortcuts_weight: 5,
      review_weight: 5,
      no_hints_bonus: 5,
      penalties: {
        red_command: -20,
        unverified_fix: -15,
        dirty_git: -10,
        kill_critical: -30,
        excessive_perms: -20,
      },
    },
  }
  const cleanState = missionState({ commandHistory: ['whoami'] })
  const results = validateMission(level, cleanState)
  const fast = calculateScore(level, results, cleanState, 30, 1)
  assert.equal(fast.total, 100)
  assert.equal(fast.breakdown.verification, undefined)
  assert.equal(fast.breakdown.shortcuts, undefined)
  assert.equal(fast.breakdown.review, undefined)
  assert.deepEqual(fast.excludedCategories, ['verification', 'shortcuts', 'review'])

  const slow = calculateScore(level, results, missionState({ commandHistory: ['whoami'], hintsUsed: 5 }), 36_000, 100)
  assert.ok(slow.total < fast.total)
  assert.equal(slow.breakdown.noHints, 0)
  assert.match(slow.penalties.join(' '), /bonus forfeited/)

  const verifiedLevel = {
    ...level,
    checks: [
      ...level.checks,
      { type: 'file_exists', pattern: 'proof.txt' },
    ],
  }
  const verified = calculateScore(
    verifiedLevel,
    results,
    missionState({ commandHistory: ['whoami'], vfs: { files: { 'proof.txt': '' } } }),
    30,
    1,
  )
  assert.equal(verified.breakdown.verification, 15)
  assert.equal(verified.excludedCategories.includes('verification'), false)

  const unsafeState = missionState({
    commandHistory: ['whoami'],
    redCommandsUsed: ['rm -rf /home/ghost/projects'],
  })
  const unsafe = calculateScore(level, validateMission(level, unsafeState), unsafeState, 30, 1)
  assert.ok(unsafe.total < fast.total)
  assert.match(unsafe.penalties.join(' '), /Unexpected red-command penalty \(-20 points\)/)
})

test('Validator: failed command attempts cannot satisfy positive checks', () => {
  const level = mission({
    objectives: [{ id: 'ran', required: true }],
    checks: [{ type: 'command_used', pattern: 'missing-tool', objectiveId: 'ran' }],
  })
  const results = validateMission(level, missionState({
    commandHistory: [],
    attemptedCommandHistory: ['missing-tool'],
  }))
  assert.equal(results[0].completed, false)
})

test('Validator: graceful termination requires TERM rather than a probe or stop signal', () => {
  const level = mission({
    objectives: [
      { id: 'obj-1', required: true },
      { id: 'obj-2', required: true },
      { id: 'obj-practice', required: true },
    ],
    checks: [
      { type: 'command_used', pattern: 'kill' },
      { type: 'command_used', pattern: 'kill -TERM' },
      { type: 'no_red_command_used' },
    ],
  })
  assert.equal(isMissionComplete(level, validateMission(level, missionState({
    commandHistory: ['kill -STOP 1842'],
  }))), false)
  assert.equal(isMissionComplete(level, validateMission(level, missionState({
    commandHistory: ['kill -TERM 1842'],
  }))), true)
})

test('Validator: screen basics require creation, interactive detach, and reattachment', () => {
  const level = mission({
    objectives: [
      { id: 'obj-1', required: true },
      { id: 'obj-practice', required: true },
    ],
    checks: [
      { type: 'command_used', pattern: 'screen -S', objectiveId: 'obj-1' },
      { type: 'command_used', pattern: 'Ctrl-a d', objectiveId: 'obj-practice' },
      { type: 'command_used', pattern: 'screen -r', objectiveId: 'obj-practice' },
      { type: 'no_red_command_used', objectiveId: 'obj-practice' },
    ],
  })
  assert.equal(isMissionComplete(level, validateMission(level, missionState({
    commandHistory: ['screen -S work'],
  }))), false)
  assert.equal(isMissionComplete(level, validateMission(level, missionState({
    commandHistory: ['screen -S work', 'Ctrl-a d', 'screen -r work'],
  }))), true)
})

test('Validator: command names are matched at execution boundaries, not in arguments', () => {
  const level = mission({
    objectives: [{ id: 'ran', required: true }],
    checks: [{ type: 'command_used', pattern: 'dd', objectiveId: 'ran' }],
  })
  assert.equal(
    validateMission(level, missionState({ commandHistory: ['echo dd'] }))[0].completed,
    false,
  )
  assert.equal(
    validateMission(level, missionState({ commandHistory: ['printf data | sudo dd of=/tmp/image'] }))[0].completed,
    true,
  )

  const evidenceLevel = mission({
    objectives: [{ id: 'listed', required: true }],
    checks: [{ type: 'command_used', pattern: 'ls -l', objectiveId: 'listed' }],
  })
  const [evidenceCheck] = getObjectiveChecks(evidenceLevel, 'listed')
  assert.equal(evidenceCheck?.pattern, 'ls -l')
  assert.equal(
    validateMission(evidenceLevel, missionState({ commandHistory: ['echo "ls -l"'] }))[0].completed,
    false,
  )
  assert.equal(
    validateMission(evidenceLevel, missionState({ commandHistory: ['ls -l /tmp'] }))[0].completed,
    true,
  )
})

test('Validator: multi-token commands and punctuation interactions remain literal', () => {
  const gitLevel = mission({
    objectives: [{ id: 'ran', required: true }],
    checks: [{ type: 'command_used', pattern: 'git status', objectiveId: 'ran' }],
  })
  assert.equal(
    validateMission(gitLevel, missionState({ commandHistory: ['git status --short'] }))[0].completed,
    true,
  )
  const searchLevel = mission({
    objectives: [{ id: 'searched', required: true }],
    checks: [{ type: 'command_used', pattern: '?', objectiveId: 'searched' }],
  })
  assert.equal(
    validateMission(searchLevel, missionState({ commandHistory: ['?'] }))[0].completed,
    true,
  )
})

test('Validator: option tokens remain case-sensitive', () => {
  for (const [pattern, wrong, correct] of [
    ['curl -I', 'curl -i http://localhost', 'curl -I http://localhost'],
    ['cp -p', 'cp -P source target', 'cp -p source target'],
    ['grep -R', 'grep -r needle .', 'grep -R needle .'],
  ]) {
    const level = mission({
      objectives: [{ id: 'ran', required: true }],
      checks: [{ type: 'command_used', pattern, objectiveId: 'ran' }],
    })
    assert.equal(validateMission(level, missionState({ commandHistory: [wrong] }))[0].completed, false)
    assert.equal(validateMission(level, missionState({ commandHistory: [correct] }))[0].completed, true)
  }
})

test('Validator: grouped short options satisfy their literal flag objective', () => {
  const level = mission({
    objectives: [
      { id: 'obj-1', required: true },
      { id: 'obj-practice', required: true },
    ],
    checks: [
      { type: 'command_used', pattern: 'tar -c' },
      { type: 'no_red_command_used' },
    ],
  })
  const results = validateMission(level, missionState({ commandHistory: ['tar -czf proof.tar.gz source'] }))
  assert.equal(results.find(result => result.objectiveId === 'obj-1').completed, true)
  assert.equal(isMissionComplete(level, results), true)
})

test('Validator: punctuation interactions require structured exact events instead of echoed text', () => {
  for (const pattern of [':q', '.exit', '>', '|', '?']) {
    const level = mission({
      objectives: [{ id: 'ran', required: true }],
      checks: [{ type: 'command_used', pattern, objectiveId: 'ran' }],
    })
    assert.equal(validateMission(level, missionState({ commandHistory: [`echo ${pattern}`] }))[0].completed, false)
    assert.equal(validateMission(level, missionState({ commandHistory: [pattern] }))[0].completed, true)
  }
  const substitution = mission({
    objectives: [{ id: 'ran', required: true }],
    checks: [{ type: 'command_used', pattern: ':%s', objectiveId: 'ran' }],
  })
  assert.equal(validateMission(substitution, missionState({ commandHistory: [':%s/old/new/g'] }))[0].completed, true)
})

test('Validator: forbidden checks include failed attempts', () => {
  const level = mission({
    objectives: [{ id: 'avoided', required: true }],
    checks: [{ type: 'command_not_used', pattern: 'forbidden-tool', objectiveId: 'avoided' }],
  })
  const results = validateMission(level, missionState({
    commandHistory: [],
    attemptedCommandHistory: ['forbidden-tool'],
  }))
  assert.equal(results[0].completed, false)
})

test('Validator: mixed explicit and unbound checks fail closed', () => {
  const level = mission({
    objectives: [{ id: 'required', required: true }],
    checks: [
      { type: 'command_used', pattern: 'echo', objectiveId: 'required' },
      { type: 'no_red_command_used' },
    ],
  })
  const results = validateMission(level, missionState({ commandHistory: ['echo ok'] }))
  assert.equal(results[0].completed, false)
  assert.equal(isMissionComplete(level, results), false)
})

test('Validator: Git state checks require an initialized repository', () => {
  for (const check of [
    { type: 'git_clean', objectiveId: 'required' },
    { type: 'git_branch', pattern: 'main', objectiveId: 'required' },
  ]) {
    const level = mission({ objectives: [{ id: 'required', required: true }], checks: [check] })
    assert.equal(validateMission(level, missionState())[0].completed, false)
  }
})

test('Validator: duplicate result rows cannot satisfy a required objective', () => {
  const level = mission({ objectives: [{ id: 'required', required: true }], checks: [] })
  assert.equal(isMissionComplete(level, [
    { objectiveId: 'required', completed: true, label: 'required' },
    { objectiveId: 'required', completed: true, label: 'required' },
  ]), false)
})

test('VFS: hard-link aliases keep independent directory names and shared file data', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(shell.execute('touch hard-a').exitCode, 0)
  assert.equal(shell.execute('ln hard-a hard-b').exitCode, 0)
  assert.match(shell.execute('ls').stdout, /hard-a/)
  assert.match(shell.execute('ls').stdout, /hard-b/)
  assert.equal(shell.execute('echo shared > hard-b').exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/hard-a', []).content, 'shared\n')
  assert.equal(shell.execute('mv hard-b hard-c').exitCode, 0)
  const listing = shell.execute('ls').stdout
  assert.match(listing, /hard-a/)
  assert.match(listing, /hard-c/)
  assert.doesNotMatch(listing, /hard-b/)
  assert.match(shell.execute('stat hard-c').stdout, /File: hard-c/)
})

test('Shell: background execution is trailing-only and emits the complete invocation', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  for (const command of ['touch ok & echo nope', 'true & false', 'true &&&']) {
    const result = shell.execute(command)
    assert.notEqual(result.exitCode, 0)
    assert.deepEqual(result.successfulCommands, [])
  }
  assert.equal(vfs.stat('/home/ghost/ok', []).node, null)
  assert.equal(vfs.stat('/home/ghost/nope', []).node, null)
  const background = shell.execute('nohup true &')
  assert.equal(background.exitCode, 0)
  assert.ok(background.successfulCommands.includes('&'))
  assert.ok(background.successfulCommands.includes('nohup true &'))
})

test('Shell: bounded compound syntax is observable and recursive calls fail closed', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  const commands = [
    ['if test -f /etc/hostname; then echo found; fi', ['if', 'test']],
    ['for item in alpha beta; do echo "$item"; done', ['for']],
    ['while false; do echo never; done', ['while']],
    ['while read -r line; do echo "$line"; done < /etc/hostname', ['while read', 'read']],
    ['function deploy() { echo ready; }; deploy', ['function']],
    ['items=(alpha beta)', ['array']],
    ["trap 'echo cleanup' EXIT", ['trap']],
    ["getopts 'a:' opt -a value", ['getopts']],
    ['diff <(sort /etc/hostname) <(sort /etc/hostname)', ['<()']],
    ['watch true', ['watch true']],
  ]
  for (const [command, expectedEvents] of commands) {
    const result = shell.execute(command)
    assert.equal(result.exitCode, 0, `${command}: ${result.stderr}`)
    for (const event of expectedEvents) assert.ok(result.successfulCommands.includes(event), `${command}: missing ${event}`)
  }
  assert.equal(shell.execute('touch a').exitCode, 0)
  const glob = shell.execute('echo * ?')
  assert.equal(glob.exitCode, 0)
  assert.ok(glob.successfulCommands.includes('*'))
  assert.ok(glob.successfulCommands.includes('?'))
  assert.equal(vfs.createFile('/home/ghost/deploy.sh', [], 'if test -f /etc/hostname; then echo ready; fi\n').error, undefined)
  const script = shell.execute('bash deploy.sh')
  assert.equal(script.exitCode, 0)
  assert.ok(script.successfulCommands.includes('bash'))
  assert.ok(script.successfulCommands.includes('if'))
  assert.equal(vfs.createFile('/home/ghost/self.sh', [], 'bash self.sh\n').error, undefined)
  const recursiveScript = shell.execute('bash self.sh')
  assert.notEqual(recursiveScript.exitCode, 0)
  assert.match(recursiveScript.stderr, /maximum bounded call depth/)
  const recursiveFunction = shell.execute('f() { f; }; f')
  assert.notEqual(recursiveFunction.exitCode, 0)
  assert.match(recursiveFunction.stderr, /maximum bounded call depth/)
  assert.equal(vfs.createFile('/home/ghost/broken.sh', [], "echo 'unterminated\n").error, undefined)
  assert.notEqual(shell.execute('bash -n broken.sh').exitCode, 0)
  assert.equal(vfs.createFile('/home/ghost/broken-substitution.sh', [], 'echo $(unterminated\n').error, undefined)
  assert.notEqual(shell.execute('bash -n broken-substitution.sh').exitCode, 0)
  assert.equal(vfs.createFile('/home/ghost/broken-if.sh', [], 'if true; then echo yes; else; fi\n').error, undefined)
  assert.notEqual(shell.execute('bash -n broken-if.sh').exitCode, 0)
})

test('Shell: compression preflight preserves unreadable targets and caller ownership', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(vfs.createFile('/home/ghost/a', [], 'A').error, undefined)
  assert.equal(vfs.createFile('/home/ghost/a.gz', [], 'SECRET').error, undefined)
  assert.equal(vfs.chmod('/home/ghost/a.gz', [], '200').error, undefined)
  vfs.setCurrentUser('root')
  assert.equal(vfs.createFile('/tmp/rootfile', [], 'ROOT').error, undefined)
  vfs.setCurrentUser('ghost')
  assert.notEqual(shell.execute('gzip -f a /tmp/rootfile').exitCode, 0)
  vfs.setCurrentUser('root')
  assert.equal(vfs.readFile('/home/ghost/a.gz', []).content, 'SECRET')
  vfs.setCurrentUser('ghost')
  assert.equal(vfs.createFile('/home/ghost/b', [], 'B').error, undefined)
  assert.equal(vfs.createFile('/home/ghost/b.gz', [], 'UNCHANGED').error, undefined)
  assert.equal(vfs.chmod('/home/ghost/b.gz', [], '200').error, undefined)
  assert.notEqual(shell.execute('gzip -f /etc/hostname b').exitCode, 0)
  vfs.setCurrentUser('root')
  assert.equal(vfs.readFile('/home/ghost/b.gz', []).content, 'UNCHANGED')
  vfs.setCurrentUser('ghost')
  assert.equal(shell.execute('gzip -k /tmp/rootfile').exitCode, 0)
  assert.equal(vfs.stat('/tmp/rootfile.gz', []).node?.owner, 'ghost')
  assert.notEqual(shell.execute('gzip --definitely-invalid /tmp/rootfile').exitCode, 0)
})

test('Shell: recent safety utilities reject spoof paths and preserve metadata', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(vfs.createFile('/home/ghost/access-target', [], 'x').error, undefined)
  assert.equal(vfs.symlink('access-target', '/home/ghost/access-link', []).error, undefined)
  assert.equal(shell.execute('setfacl -m o::--- access-link').exitCode, 0)
  assert.equal(vfs.lstat('/home/ghost/access-link', []).node?.type, 'symlink')
  assert.equal(vfs.stat('/home/ghost/access-target', []).node?.permissions, 'rw-r-----')
  assert.equal(vfs.createFile('/home/ghost/evidence-user.txt', [], 'evidence').error, undefined)
  assert.notEqual(shell.execute('scp evidence-user.txt root@neonmall-server:/tmp/leak.txt').exitCode, 0)
  assert.equal(vfs.stat('/tmp/leak.txt', []).node, null)
  assert.equal(vfs.createFile('/home/ghost/regex.txt', [], `${'a'.repeat(10000)}!\n`).error, undefined)
  const regexStarted = Date.now()
  assert.notEqual(shell.execute("csplit regex.txt '/(a+)+$/'").exitCode, 0)
  assert.ok(Date.now() - regexStarted < 1000)
  assert.equal(vfs.createFile('/home/ghost/top.txt', [], 'second\n').error, undefined)
  const topPatch = '--- top.txt\n+++ top.txt\n@@ -0,0 +1 @@\n+first\n'
  assert.equal(vfs.createFile('/home/ghost/top.patch', [], topPatch).error, undefined)
  assert.equal(shell.execute('patch < top.patch').exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/top.txt', []).content, 'first\nsecond\n')
  assert.equal(vfs.createFile('/home/ghost/owned.log', [], 'line\n').error, undefined)
  assert.equal(vfs.chmod('/home/ghost/owned.log', [], '640').error, undefined)
  assert.equal(vfs.createFile('/home/ghost/owned.conf', [], '/home/ghost/owned.log {\n rotate 2\n}\n').error, undefined)
  assert.equal(shell.execute('logrotate -f owned.conf').exitCode, 0)
  const fresh = vfs.stat('/home/ghost/owned.log', []).node
  assert.deepEqual([fresh?.owner, fresh?.group, fresh?.permissions], ['ghost', 'ghost', 'rw-r-----'])
  const help = shell.execute('npm ci --help')
  assert.equal(help.exitCode, 0)
  assert.deepEqual(help.successfulCommands, ['--help'])
  assert.equal(vfs.stat('/home/ghost/node_modules', []).node, null)
})

test('Shell: recursive copy and rsync archive preserve nested metadata', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(vfs.createDirectory('/home/ghost/tree-src', []).error, undefined)
  assert.equal(vfs.createDirectory('/home/ghost/tree-src/nested', []).error, undefined)
  assert.equal(vfs.createFile('/home/ghost/tree-src/nested/secret', [], 'secret').error, undefined)
  assert.equal(vfs.chmod('/home/ghost/tree-src/nested/secret', [], '600').error, undefined)
  assert.equal(shell.execute('cp -rp tree-src tree-copy').exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/tree-copy/nested/secret', []).node?.permissions, 'rw-------')
  assert.equal(shell.execute('rsync -a tree-src tree-rsync').exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/tree-rsync/nested/secret', []).node?.permissions, 'rw-------')
})

test('Shell: bounded compilers and file utilities reject former parser bypasses', () => {
  const vfs = new VFS()
  const shell = new ShellEngine(vfs)
  assert.equal(shell.execute('go mod init example.com/bypass').exitCode, 0)
  assert.equal(vfs.createFile('/home/ghost/main.go', [], 'package main\nfunc main(){ if }\n').error, undefined)
  assert.notEqual(shell.execute('go build').exitCode, 0)
  assert.equal(shell.execute('cargo new bypass-rs').exitCode, 0)
  assert.equal(shell.execute('cd bypass-rs').exitCode, 0)
  assert.equal(vfs.writeFile('/home/ghost/bypass-rs/src/main.rs', [], 'fn main(){ let = 1; }\n').error, undefined)
  assert.notEqual(shell.execute('cargo build').exitCode, 0)
  assert.equal(shell.execute('cd /home/ghost').exitCode, 0)
  assert.equal(vfs.createFile('/home/ghost/secret.bin', [], 'secret').error, undefined)
  assert.equal(shell.execute('shred -n 2 secret.bin').exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/secret.bin', []).content, '\x00'.repeat(6))
  assert.equal(vfs.createFile('/home/ghost/tool', [], '#!/bin/sh\n').error, undefined)
  assert.equal(shell.execute('install -m 755 tool installed-tool').exitCode, 0)
  assert.equal(vfs.stat('/home/ghost/installed-tool', []).node?.permissions, 'rwxr-xr-x')
})

test('Validator: broad dangerous objectives never authorize arbitrary operands', () => {
  const broad = mission({
    objectives: [
      { id: 'obj-1', required: true },
      { id: 'obj-practice', required: true },
    ],
    checks: [
      { type: 'command_used', pattern: 'chmod' },
      { type: 'no_red_command_used' },
    ],
  })
  const exploit = validateMission(broad, missionState({
    commandHistory: ['chmod 777 /etc/hostname'],
    redCommandsUsed: ['chmod 777 /etc/hostname'],
  }))
  assert.equal(isMissionComplete(broad, exploit), false)

  const exact = mission({
    objectives: [
      { id: 'obj-1', required: true },
      { id: 'obj-practice', required: true },
    ],
    checks: [
      { type: 'command_used', pattern: 'chmod 640 safe.conf' },
      { type: 'no_red_command_used' },
    ],
  })
  const safe = validateMission(exact, missionState({
    commandHistory: ['chmod 640 safe.conf'],
    redCommandsUsed: ['chmod 640 safe.conf'],
  }))
  assert.equal(isMissionComplete(exact, safe), true)

  const extraOperand = validateMission(exact, missionState({
    commandHistory: ['chmod 640 safe.conf victim.conf'],
    redCommandsUsed: ['chmod 640 safe.conf victim.conf'],
  }))
  assert.equal(
    isMissionComplete(exact, extraOperand),
    false,
    'an exact dangerous objective must not authorize additional operands',
  )
})

test('Catalog: hardened red-command H5 solutions execute and complete from a fresh simulator', () => {
  const missionIds = [
    'delete-decoys',
    'truncate-trap',
    'op-red-button',
    'nightmare-recursive-rm',
    'execute-bit',
    'minimal-chmod',
    'numeric-perms',
    'owner-switch',
    'sticky-alley',
    'op-777-trap',
    'boss-perm-lockdown',
    'nightmare-service-read',
    'boss-zombie-theater',
    'dd-red-zone',
    'service-restart',
  ]

  for (const id of missionIds) {
    const level = catalogMission(id)
    const solution = level.hints.find(hint => hint.level === 5)?.text_en.replace(/^Full solution:\s*/i, '')
    assert.ok(solution, `${id}: missing H5 solution`)
    const vfs = new VFS()
    const redCommandsUsed = []
    const shell = new ShellEngine(vfs, undefined, command => redCommandsUsed.push(command))
    const result = shell.execute(solution)
    assert.equal(result.exitCode, 0, `${id}: ${result.stderr}`)
    const validation = validateMission(level, missionState({
      commandHistory: result.successfulCommands ?? [],
      gitState: shell.gitState,
      redCommandsUsed,
    }))
    assert.equal(isMissionComplete(level, validation), true, `${id}: H5 did not satisfy required objectives`)
  }
})

test('Catalog safety: truncate only authorizes the exact practice target', () => {
  const level = catalogMission('truncate-trap')
  const vfs = new VFS()
  const before = vfs.readFile('/home/ghost/.bashrc', []).content.length
  const redCommandsUsed = []
  const shell = new ShellEngine(vfs, undefined, command => redCommandsUsed.push(command))
  const result = shell.execute('truncate -s 0 /home/ghost/.bashrc')
  assert.equal(result.exitCode, 0)
  assert.equal(vfs.readFile('/home/ghost/.bashrc', []).content.length, 0)
  assert.ok(before > 0)
  assert.deepEqual(redCommandsUsed, ['truncate -s 0 /home/ghost/.bashrc'])
  const validation = validateMission(level, missionState({
    commandHistory: result.successfulCommands ?? [],
    redCommandsUsed,
  }))
  assert.equal(isMissionComplete(level, validation), false)
})

test('Run report: corrupted session data fails closed while a complete report round-trips', () => {
  const values = new Map()
  globalThis.sessionStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size },
  }
  const level = catalogMission('whoami-shell')
  const state = missionState({
    commandHistory: ['whoami', 'id'],
    attemptedCommandHistory: ['whoami', 'id'],
  })
  const validationResults = validateMission(level, state)
  assert.equal(isMissionComplete(level, validationResults), true)
  const scoreResult = calculateScore(level, validationResults, state, 12, 2)
  const reportCompletedAt = new Date().toISOString()
  const report = {
    version: 1,
    missionId: level.id,
    completed: true,
    completedAt: reportCompletedAt,
    elapsedSeconds: 12,
    hintsUsed: 0,
    redCommandsUsed: [],
    attemptedActions: [
      {
        id: '1', timestampSeconds: 2, command: 'whoami', exitCode: 0,
        kind: 'command', cwd: '/home/ghost', mode: 'shell', successfulCommands: ['whoami'], redCommands: [],
      },
      {
        id: '2', timestampSeconds: 4, command: 'id', exitCode: 0,
        kind: 'command', cwd: '/home/ghost', mode: 'shell', successfulCommands: ['id'], redCommands: [],
      },
    ],
    successfulActions: ['whoami', 'id'],
    validationResults,
    scoreResult,
  }
  assert.equal(saveMissionRunReport(report), true)
  assert.deepEqual(loadMissionRunReport(report.missionId), report)

  // A replay supersedes the previous session report. If its replacement
  // cannot be persisted, the old report must not remain reachable by URL.
  const originalSessionStorage = globalThis.sessionStorage
  let staleRemoved = false
  globalThis.sessionStorage = {
    ...originalSessionStorage,
    getItem: key => values.get(key) ?? null,
    setItem: () => { throw new Error('quota exceeded') },
    removeItem: key => {
      staleRemoved = values.delete(key)
    },
  }
  assert.equal(saveMissionRunReport(report), false)
  assert.equal(staleRemoved, true, 'a failed replay report write must evict the stale report')
  assert.equal(loadMissionRunReport(report.missionId), null)
  globalThis.sessionStorage = originalSessionStorage
  assert.equal(saveMissionRunReport(report), true)

  const generatedLevel = catalogMission('pipe-first')
  const generatedShell = new ShellEngine(new VFS())
  const generatedResult = generatedShell.execute('echo report-source | cat')
  assert.equal(generatedResult.exitCode, 0)
  const generatedState = missionState({
    commandHistory: generatedResult.successfulCommands ?? [],
    attemptedCommandHistory: ['echo report-source | cat'],
  })
  const generatedValidation = validateMission(generatedLevel, generatedState)
  assert.equal(isMissionComplete(generatedLevel, generatedValidation), true)
  const generatedReport = {
    version: 1,
    missionId: generatedLevel.id,
    completed: true,
    completedAt: reportCompletedAt,
    elapsedSeconds: 5,
    hintsUsed: 0,
    redCommandsUsed: [],
    attemptedActions: [{
      id: '1', timestampSeconds: 2, command: 'echo report-source | cat', exitCode: 0,
      kind: 'command', cwd: '/home/ghost', mode: 'shell',
      successfulCommands: generatedResult.successfulCommands ?? [], redCommands: [],
    }],
    successfulActions: generatedResult.successfulCommands ?? [],
    validationResults: generatedValidation,
    scoreResult: calculateScore(generatedLevel, generatedValidation, generatedState, 5, 1),
  }
  assert.equal(saveMissionRunReport(generatedReport), true)
  assert.deepEqual(loadMissionRunReport(generatedReport.missionId), generatedReport)

  const forgedState = missionState({
    commandHistory: ['|'],
    attemptedCommandHistory: ['false'],
  })
  const forgedValidation = validateMission(generatedLevel, forgedState)
  const forgedReport = {
    ...generatedReport,
    elapsedSeconds: 1,
    attemptedActions: [{
      id: '1', timestampSeconds: 0, command: 'false', exitCode: 1,
      kind: 'command', cwd: '/home/ghost', mode: 'shell', successfulCommands: [], redCommands: [],
    }],
    successfulActions: ['|'],
    validationResults: forgedValidation,
    scoreResult: calculateScore(generatedLevel, forgedValidation, forgedState, 1, 1),
  }
  assert.equal(
    saveMissionRunReport(forgedReport),
    false,
    'global successful evidence must exactly aggregate the engine traces stored per action',
  )

  const compoundShell = new ShellEngine(new VFS())
  const compoundCommand = 'whoami; id; false'
  const compoundResult = compoundShell.execute(compoundCommand)
  assert.equal(compoundResult.exitCode, 1)
  assert.deepEqual(compoundResult.successfulCommands, ['whoami', 'id'])
  const compoundState = missionState({
    commandHistory: compoundResult.successfulCommands,
    attemptedCommandHistory: [compoundCommand],
  })
  const compoundValidation = validateMission(level, compoundState)
  assert.equal(isMissionComplete(level, compoundValidation), true)
  const compoundReport = {
    ...report,
    elapsedSeconds: 3,
    attemptedActions: [{
      id: '1', timestampSeconds: 1, command: compoundCommand, exitCode: compoundResult.exitCode,
      kind: 'command', cwd: '/home/ghost', mode: 'shell',
      successfulCommands: compoundResult.successfulCommands ?? [], redCommands: [],
    }],
    successfulActions: compoundResult.successfulCommands ?? [],
    validationResults: compoundValidation,
    scoreResult: calculateScore(level, compoundValidation, compoundState, 3, 1),
  }
  assert.equal(
    saveMissionRunReport(compoundReport),
    true,
    'successful child commands remain valid evidence when a later compound segment fails',
  )

  const repeatedState = missionState({
    commandHistory: ['whoami', 'whoami', 'id'],
    attemptedCommandHistory: ['whoami; whoami', 'id'],
  })
  const repeatedValidation = validateMission(level, repeatedState)
  const repeatedReport = {
    ...report,
    elapsedSeconds: 4,
    attemptedActions: [
      {
        id: '1', timestampSeconds: 1, command: 'whoami; whoami', exitCode: 0,
        kind: 'command', cwd: '/home/ghost', mode: 'shell',
        successfulCommands: ['whoami', 'whoami'], redCommands: [],
      },
      {
        id: '2', timestampSeconds: 2, command: 'id', exitCode: 0,
        kind: 'command', cwd: '/home/ghost', mode: 'shell', successfulCommands: ['id'], redCommands: [],
      },
    ],
    successfulActions: ['whoami', 'whoami', 'id'],
    validationResults: repeatedValidation,
    scoreResult: calculateScore(level, repeatedValidation, repeatedState, 4, 2),
  }
  assert.equal(
    saveMissionRunReport(repeatedReport),
    true,
    'exact action traces preserve repeated successes and their order',
  )

  const redirectedShell = new ShellEngine(new VFS())
  const redirectedCommand = 'whoami > /etc/forbidden; id > /etc/forbidden; true'
  const redirectedResult = redirectedShell.execute(redirectedCommand)
  assert.equal(redirectedResult.exitCode, 0)
  assert.deepEqual(redirectedResult.successfulCommands, ['true', '>'])
  const redirectedForgedState = missionState({
    commandHistory: ['whoami', 'id'],
    attemptedCommandHistory: [redirectedCommand],
  })
  const redirectedForgedValidation = validateMission(level, redirectedForgedState)
  const redirectedForgedReport = {
    ...report,
    elapsedSeconds: 3,
    attemptedActions: [{
      id: '1', timestampSeconds: 1, command: redirectedCommand, exitCode: redirectedResult.exitCode,
      kind: 'command', cwd: '/home/ghost', mode: 'shell',
      successfulCommands: redirectedResult.successfulCommands ?? [], redCommands: [],
    }],
    successfulActions: ['whoami', 'id'],
    validationResults: redirectedForgedValidation,
    scoreResult: calculateScore(level, redirectedForgedValidation, redirectedForgedState, 3, 1),
  }
  assert.equal(
    saveMissionRunReport(redirectedForgedReport),
    false,
    'a successful final segment cannot launder failed earlier segments into mission evidence',
  )

  const store = value => values.set(`ghostops_run_report:${report.missionId}`, JSON.stringify(value))
  store({ ...report, completedAt: 'not-a-date' })
  assert.equal(loadMissionRunReport(report.missionId), null)
  store({ ...report, completedAt: new Date(Date.UTC(2099, 0, 1)).toISOString() })
  assert.equal(loadMissionRunReport(report.missionId), null)
  store({ ...report, completedAt: new Date(reportCompletedAt).toUTCString() })
  assert.equal(loadMissionRunReport(report.missionId), null)
  store({ ...report, elapsedSeconds: 30 * 24 * 60 * 60 + 1 })
  assert.equal(loadMissionRunReport(report.missionId), null)
  store({ ...report, hintsUsed: level.hints.length + 1 })
  assert.equal(loadMissionRunReport(report.missionId), null)
  store({
    ...report,
    attemptedActions: report.attemptedActions.map((action, index) => (
      index === 0 ? { ...action, timestampSeconds: 2.5 } : action
    )),
  })
  assert.equal(loadMissionRunReport(report.missionId), null)
  values.set(`ghostops_run_report:${report.missionId}`, ' '.repeat(3 * 1024 * 1024 + 1))
  assert.equal(loadMissionRunReport(report.missionId), null)
  store({ ...report, scoreResult: { total: 100 } })
  assert.equal(loadMissionRunReport(report.missionId), null)
  store({
    ...report,
    scoreResult: {
      ...scoreResult,
      breakdown: { ...scoreResult.breakdown, objectives: scoreResult.breakdownMax.objectives + 1 },
    },
  })
  assert.equal(loadMissionRunReport(report.missionId), null)
  store({ ...report, scoreResult: { ...scoreResult, total: scoreResult.total === 100 ? 99 : 100 } })
  assert.equal(loadMissionRunReport(report.missionId), null)
  store({ ...report, scoreResult: { ...scoreResult, rating: 'anything' } })
  assert.equal(loadMissionRunReport(report.missionId), null)
  store({ ...report, attemptedActions: [] })
  assert.equal(loadMissionRunReport(report.missionId), null)
  store({
    ...report,
    attemptedActions: report.attemptedActions.map((action, index) => (
      index === 0 ? { ...action, successfulCommands: ['echo not-whoami'] } : action
    )),
  })
  assert.equal(loadMissionRunReport(report.missionId), null)
  store({ ...report, redCommandsUsed: ['rm'] })
  assert.equal(loadMissionRunReport(report.missionId), null)
  store({
    ...report,
    validationResults: report.validationResults.map(result => (
      result.objectiveId === 'obj-1' ? { ...result, completed: false } : result
    )),
  })
  assert.equal(loadMissionRunReport(report.missionId), null)
  store({
    ...report,
    validationResults: report.validationResults.map(result => (
      result.objectiveId === 'obj-3' ? { ...result, completed: true } : result
    )),
  })
  assert.equal(
    loadMissionRunReport(report.missionId),
    null,
    'an unbound optional objective cannot be promoted without canonical evidence',
  )
})

test('Catalog contract: every verified H5 replays and persists exact engine traces', () => {
  const values = new Map()
  globalThis.sessionStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size },
  }

  let completedSolutions = 0
  const rejectedReports = []
  for (const rawLevel of catalog) {
    const level = getLevelById(rawLevel.id)
    assert.ok(level, `${rawLevel.id}: level missing`)
    assert.ok(
      rawLevel.checks.every(check => typeof check.objectiveId === 'string' && check.objectiveId.length > 0),
      `${rawLevel.id}: legacy ordinal check binding reached the runtime catalog`,
    )
    const h5 = level.hints.find(hint => hint.level === 5)
    assert.ok(h5, `${rawLevel.id}: missing H5`)
    if (h5.solutionType !== 'verified_command') continue
    const solution = h5.text_en.replace(/^Full solution:\s*/i, '')
    assert.notEqual(solution, h5.text_en, `${rawLevel.id}: verified H5 is not a command transcript`)

    const vfs = new VFS()
    const emittedRedCommands = []
    const shell = new ShellEngine(vfs, undefined, command => emittedRedCommands.push(command))
    if (level.startingState?.cwd) {
      shell.state.cwd = [...level.startingState.cwd]
      shell.state.env.PWD = `/${level.startingState.cwd.join('/')}`
    }
    if (level.startingState?.env) Object.assign(shell.state.env, level.startingState.env)
    if (level.chapter_skill.toLowerCase() === 'git') {
      shell.execute('git init', 0, false)
      if (level.checks.some(check => check.pattern?.toLowerCase().startsWith('git bisect'))) {
        const seeded = seedGitBisectTrainingRepository(shell)
        assert.equal(seeded.ok, true, `${level.id}: ${seeded.error ?? 'bisect seed failed'}`)
      }
    }

    const execution = shell.execute(solution)
    const successfulCommands = execution.successfulCommands
      ?? (execution.exitCode === 0 ? [solution] : [])
    const redCommandsUsed = [...new Set(emittedRedCommands)]
    const state = missionState({
      commandHistory: successfulCommands,
      attemptedCommandHistory: [solution],
      gitState: shell.gitState,
      redCommandsUsed,
    })
    assert.equal(execution.exitCode, 0, `${level.id}: H5 failed: ${execution.stderr}`)
    const validationResults = validateMission(level, state)
    assert.equal(
      isMissionComplete(level, validationResults),
      true,
      `${level.id}: verified H5 did not satisfy its required objectives`,
    )
    completedSolutions += 1

    const runReport = {
      version: 1,
      missionId: level.id,
      completed: true,
      completedAt: new Date().toISOString(),
      elapsedSeconds: 5,
      hintsUsed: 0,
      redCommandsUsed,
      attemptedActions: [{
        id: '1',
        timestampSeconds: 2,
        command: solution,
        exitCode: execution.exitCode,
        kind: 'command',
        cwd: `/${shell.state.cwd.join('/')}`,
        mode: 'shell',
        successfulCommands,
        redCommands: emittedRedCommands,
      }],
      successfulActions: successfulCommands,
      validationResults,
      scoreResult: calculateScore(level, validationResults, state, 5, 1),
    }
    if (!saveMissionRunReport(runReport) || !loadMissionRunReport(level.id)) {
      rejectedReports.push(level.id)
    }
  }

  assert.equal(completedSolutions, 77, 'the reviewed executable H5 coverage set changed')
  assert.deepEqual(rejectedReports, [])
})

let failures = 0
for (const { name, run } of tests) {
  try {
    await run()
    console.log(`PASS ${name}`)
  } catch (error) {
    failures += 1
    console.error(`FAIL ${name}`)
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error))
  }
}

if (failures > 0) {
  console.error(`\nEngine validation failed: ${failures}/${tests.length} regression checks failed.`)
  process.exitCode = 1
} else {
  console.log(`\nEngine OK: ${tests.length} regression checks passed.`)
}
