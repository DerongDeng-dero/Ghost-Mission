import assert from 'node:assert/strict'
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
  })
  const source = result.outputFiles[0].text
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

const [vfsModule, shellModule, gitModule, validatorModule] = await Promise.all([
  loadEngineModule('src/engine/vfs.ts'),
  loadEngineModule('src/engine/shell.ts'),
  loadEngineModule('src/engine/git.ts'),
  loadEngineModule('src/engine/validator.ts'),
])

const { VFS } = vfsModule
const { ShellEngine } = shellModule
const { createGitState, gitCommand } = gitModule
const { validateMission, calculateScore, isMissionComplete } = validatorModule

const tests = []
function test(name, run) {
  tests.push({ name, run })
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

test('Shell: unknown commands expose command-not-found stderr', () => {
  const shell = new ShellEngine(new VFS())
  const result = shell.execute('definitely-not-a-command')
  assert.equal(result.exitCode, 127)
  assert.match(result.stderr, /command not found/)
})

test('Shell: Git commands share a live repository state', () => {
  const shell = new ShellEngine(new VFS())
  assert.equal(shell.execute('git status').exitCode, 128)
  assert.equal(shell.execute('git init').exitCode, 0)
  assert.equal(shell.execute('git add README.md').exitCode, 0)
  assert.equal(shell.execute('git commit -m "initial"').exitCode, 0)
  assert.equal(shell.gitState.initialized, true)
  assert.equal(shell.gitState.commits.length, 1)
  assert.match(shell.execute('git status').stdout, /working tree clean/)
})

test('Shell: interactive command mode survives execute()', () => {
  const shell = new ShellEngine(new VFS())
  assert.equal(shell.execute('less /etc/hosts').mode, 'less')
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
  const before = [...shell.state.cwd]
  const result = shell.execute('pushd /missing')
  assert.notEqual(result.exitCode, 0)
  assert.deepEqual(shell.state.cwd, before)
  assert.deepEqual(shell.state.dirStack, [])
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
      { type: 'command_used', pattern: 'chmod 600' },
      { type: 'no_red_command_used' },
    ],
  })
  const results = validateMission(level, missionState({
    commandHistory: ['chmod 600 secret.txt'],
    redCommandsUsed: ['chmod'],
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
      redCommandsUsed: ['chmod'],
    }),
    10,
    1,
  )
  assert.equal(score.breakdown.safety, 20)
  assert.deepEqual(score.penalties, [])
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

let failures = 0
for (const { name, run } of tests) {
  try {
    await run()
    console.log(`PASS ${name}`)
  } catch (error) {
    failures += 1
    console.error(`FAIL ${name}`)
    console.error(error instanceof Error ? error.message : String(error))
  }
}

if (failures > 0) {
  console.error(`\nEngine validation failed: ${failures}/${tests.length} regression checks failed.`)
  process.exitCode = 1
} else {
  console.log(`\nEngine OK: ${tests.length} regression checks passed.`)
}
