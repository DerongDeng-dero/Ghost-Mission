export interface Commit {
  hash: string
  message: string
  author: string
  date: string
  parent: string | null
  changes: Map<string, string>
}

export interface StashEntry {
  id: string
  message: string
  changes: Map<string, string>
  branch: string
}

export interface GitTag {
  name: string
  message: string
  hash: string
}

export interface GitState {
  initialized: boolean
  branches: Map<string, Commit[]>
  currentBranch: string
  stagingArea: Map<string, string>
  workingDirectory: Map<string, string>
  commits: Commit[]
  head: string
  stash: StashEntry[]
  reflog: string[]
  tags: Map<string, GitTag>
  remotes: Map<string, string>
  config: Map<string, string>
  submodules: Map<string, string>
  worktrees: Map<string, string>
}

export function createGitState(): GitState {
  const st: GitState = {
    initialized: false,
    branches: new Map(),
    currentBranch: 'main',
    stagingArea: new Map(),
    workingDirectory: new Map(),
    commits: [],
    head: '',
    stash: [],
    reflog: [],
    tags: new Map(),
    remotes: new Map([['origin', 'https://github.com/ghostops/neonmall.git']]),
    config: new Map([
      ['user.name', 'Ghost Ops'],
      ['user.email', 'ghost@neonmall.local'],
      ['core.editor', 'vim'],
      ['init.defaultBranch', 'main'],
      ['remote.origin.url', 'https://github.com/ghostops/neonmall.git'],
      ['remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*'],
      ['branch.main.remote', 'origin'],
      ['branch.main.merge', 'refs/heads/main'],
    ]),
    submodules: new Map(),
    worktrees: new Map(),
  }
  return st
}

function shortHash(full: string): string {
  return full.slice(0, 7)
}

function generateHash(): string {
  return Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

export function gitCommand(state: GitState, args: string[], cwd: string): { stdout: string; stderr: string; exitCode: number; state: GitState } {
  const cmd = args[0]
  const cargs = args.slice(1)

  switch (cmd) {
    case 'init': return gitInit(state, cargs, cwd)
    case 'status': return gitStatus(state, cargs, cwd)
    case 'add': return gitAdd(state, cargs, cwd)
    case 'commit': return gitCommit(state, cargs, cwd)
    case 'diff': return gitDiff(state, cargs, cwd)
    case 'log': return gitLog(state, cargs, cwd)
    case 'show': return gitShow(state, cargs, cwd)
    case 'blame': return gitBlame(state, cargs, cwd)
    case 'branch': return gitBranch(state, cargs, cwd)
    case 'switch': return gitSwitch(state, cargs, cwd)
    case 'checkout': return gitCheckout(state, cargs, cwd)
    case 'merge': return gitMerge(state, cargs, cwd)
    case 'rebase': return gitRebase(state, cargs, cwd)
    case 'stash': return gitStash(state, cargs, cwd)
    case 'restore': return gitRestore(state, cargs, cwd)
    case 'reset': return gitReset(state, cargs, cwd)
    case 'revert': return gitRevert(state, cargs, cwd)
    case 'reflog': return gitReflog(state, cargs, cwd)
    case 'cherry-pick': return gitCherryPick(state, cargs, cwd)
    case 'tag': return gitTag(state, cargs, cwd)
    case 'remote': return gitRemote(state, cargs, cwd)
    case 'fetch': return gitFetch(state, cargs, cwd)
    case 'pull': return gitPull(state, cargs, cwd)
    case 'push': return gitPush(state, cargs, cwd)
    case 'clean': return gitClean(state, cargs, cwd)
    case 'worktree': return gitWorktree(state, cargs, cwd)
    case 'submodule': return gitSubmodule(state, cargs, cwd)
    case 'config': return gitConfig(state, cargs, cwd)
    case 'shortlog': return gitShortlog(state, cargs, cwd)
    case 'archive': return gitArchive(state, cargs, cwd)
    case '--version': return { stdout: 'git version 2.34.1', stderr: '', exitCode: 0, state }
    default:
      return { stdout: '', stderr: `git: '${cmd}' is not a git command.`, exitCode: 1, state }
  }
}

function gitInit(state: GitState, _args: string[], _cwd: string) {
  if (state.initialized) {
    return { stdout: `Reinitialized existing Git repository in ${_cwd}/.git/`, stderr: '', exitCode: 0, state }
  }
  const newState = { ...state, initialized: true }
  newState.branches.set('main', [])
  newState.currentBranch = 'main'
  newState.reflog = [`${generateHash()} HEAD@{0}: initialize`]
  return { stdout: `Initialized empty Git repository in ${_cwd}/.git/`, stderr: '', exitCode: 0, state: newState }
}

function gitStatus(state: GitState, _args: string[], _cwd: string) {
  void _args
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  let stdout = `On branch ${state.currentBranch}\n`
  if (state.commits.length === 0) {
    stdout += 'No commits yet\n'
  }
  if (state.stagingArea.size === 0 && state.workingDirectory.size === 0) {
    stdout += 'nothing to commit, working tree clean\n'
  } else {
    if (state.stagingArea.size > 0) {
      stdout += `\nChanges to be committed:\n  (use "git restore --staged <file>..." to unstage)\n`
      state.stagingArea.forEach((_s, path) => { stdout += `\tnew file:   ${path}\n` })
    }
    if (state.workingDirectory.size > 0) {
      stdout += `\nChanges not staged for commit:\n  (use "git add <file>..." to update)\n`
      state.workingDirectory.forEach((_, path) => { stdout += `\tmodified:   ${path}\n` })
    }
  }
  return { stdout, stderr: '', exitCode: 0, state }
}

function gitAdd(state: GitState, args: string[], _cwd: string) {
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  if (args.length === 0) return { stdout: '', stderr: 'Nothing specified, nothing added.', exitCode: 0, state }
  const newState = { ...state, stagingArea: new Map(state.stagingArea) }
  for (const f of args) {
    if (f === '.') {
      state.workingDirectory.forEach((_v, k) => { newState.stagingArea.set(k, _v) })
    } else {
      newState.stagingArea.set(f, f)
    }
  }
  return { stdout: '', stderr: '', exitCode: 0, state: newState }
}

function gitCommit(state: GitState, args: string[], _cwd: string) {
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  let message = ''
  const mIdx = args.indexOf('-m')
  if (mIdx >= 0 && mIdx + 1 < args.length) message = args[mIdx + 1].replace(/^["']|["']$/g, '')
  if (!message) return { stdout: '', stderr: 'Aborting commit due to empty commit message.', exitCode: 1, state }
  if (state.stagingArea.size === 0) {
    return { stdout: '', stderr: 'nothing to commit, working tree clean', exitCode: 1, state }
  }

  const hash = generateHash()
  const commit: Commit = {
    hash,
    message,
    author: 'ghost <ghost@neonmall.local>',
    date: new Date().toISOString(),
    parent: state.head || null,
    changes: new Map(state.stagingArea),
  }
  const newState = {
    ...state,
    commits: [...state.commits, commit],
    head: hash,
    stagingArea: new Map(),
    workingDirectory: new Map(),
    reflog: [...state.reflog, `${hash} HEAD@{${state.commits.length}}: commit: ${message}`],
  }
  const branchCommits = newState.branches.get(newState.currentBranch) || []
  newState.branches.set(newState.currentBranch, [...branchCommits, commit])
  return { stdout: `[${newState.currentBranch} ${shortHash(hash)}] ${message}\n ${state.stagingArea.size} file(s) changed`, stderr: '', exitCode: 0, state: newState }
}

function gitDiff(state: GitState, _args: string[], _cwd: string) {
  void _args
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  if (state.stagingArea.size === 0 && state.workingDirectory.size === 0) return { stdout: '', stderr: '', exitCode: 0, state }
  let stdout = ''
  state.workingDirectory.forEach((_v, k) => {
    stdout += `diff --git a/${k} b/${k}\n--- a/${k}\n+++ b/${k}\n+// modified ${k}\n`
  })
  state.stagingArea.forEach((_v, k) => {
    if (!state.workingDirectory.has(k)) stdout += `diff --git a/${k} b/${k}\n--- /dev/null\n+++ b/${k}\n+// added ${k}\n`
  })
  return { stdout, stderr: '', exitCode: 0, state }
}

function gitLog(state: GitState, args: string[], _cwd: string) {
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  const oneline = args.includes('--oneline')
  const graph = args.includes('--graph')
  const decorate = args.includes('--decorate')
  const authorFilter = args.find(a => a.startsWith('--author='))?.slice(9)
  const sinceFilter = args.find(a => a.startsWith('--since='))?.slice(8)

  let stdout = ''
  let commits = [...state.commits]
  if (authorFilter) commits = commits.filter(c => c.author.includes(authorFilter))
  if (sinceFilter) commits = commits.slice(Math.floor(commits.length / 4) + 1) // simulate since filter

  for (let i = commits.length - 1; i >= 0; i--) {
    const c = commits[i]
    if (graph) stdout += '* '
    if (decorate) {
      const tags = Array.from(state.tags.entries()).filter(([, t]) => t.hash === c.hash).map(([n]) => `tag: ${n}`)
      const refs = [...tags]
      if (i === commits.length - 1) refs.push(`HEAD -> ${state.currentBranch}`)
      if (oneline) stdout += `${shortHash(c.hash)} (${refs.join(', ')}) ${c.message}\n`
      else stdout += `commit ${c.hash} (${refs.join(', ')})\nAuthor: ${c.author}\nDate:   ${c.date}\n\n    ${c.message}\n\n`
    } else {
      if (oneline) stdout += `${shortHash(c.hash)} ${c.message}\n`
      else stdout += `commit ${c.hash}\nAuthor: ${c.author}\nDate:   ${c.date}\n\n    ${c.message}\n\n`
    }
  }
  return { stdout, stderr: '', exitCode: 0, state }
}

function gitShow(state: GitState, args: string[], _cwd: string) {
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  const hash = args[0] || state.head
  if (!hash) return { stdout: '', stderr: 'fatal: ambiguous argument', exitCode: 128, state }
  const c = state.commits.find(c => c.hash.startsWith(hash))
  if (!c) return { stdout: '', stderr: `fatal: bad object ${hash}`, exitCode: 128, state }
  return {
    stdout: `commit ${c.hash}\nAuthor: ${c.author}\nDate:   ${c.date}\n\n    ${c.message}\n\ndiff --git a/file.txt b/file.txt\nnew file mode 100644\nindex 0000000..${shortHash(c.hash)}\n--- /dev/null\n+++ b/file.txt\n@@ -0,0 +1 @@\n+// change from ${c.message}\n`,
    stderr: '', exitCode: 0, state
  }
}

function gitBlame(_state: GitState, args: string[], _cwd: string) {
  void _cwd
  const file = args[0]
  if (!file) return { stdout: '', stderr: 'usage: git blame [<rev-opts>] [<opts>] [<rev>] [--] <file>', exitCode: 1, state: _state }
  return {
    stdout:
`${shortHash(generateHash())} (Ghost Ops 2024-01-15 08:00:00 +0000 1) #!/usr/bin/env node
${shortHash(generateHash())} (Ghost Ops 2024-01-15 08:15:00 +0000 2) const express = require('express');
${shortHash(generateHash())} (Ghost Ops 2024-01-15 09:00:00 +0000 3) const app = express();
${shortHash(generateHash())} (Ghost Ops 2024-01-16 10:00:00 +0000 4) app.listen(3000);
`,
    stderr: '', exitCode: 0, state: _state
  }
}

function gitBranch(state: GitState, args: string[], _cwd: string) {
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  if (args.length === 0) {
    let stdout = ''
    state.branches.forEach((_b, name) => {
      stdout += (name === state.currentBranch ? '* ' : '  ') + name + '\n'
    })
    return { stdout, stderr: '', exitCode: 0, state }
  }
  if (args[0] === '-d' || args[0] === '-D') {
    const name = args[1]
    if (!name) return { stdout: '', stderr: 'error: branch name required', exitCode: 1, state }
    if (name === state.currentBranch) return { stdout: '', stderr: `error: Cannot delete branch '${name}'`, exitCode: 1, state }
    const newBranches = new Map(state.branches)
    newBranches.delete(name)
    return { stdout: `Deleted branch ${name}.`, stderr: '', exitCode: 0, state: { ...state, branches: newBranches } }
  }
  const newBranches = new Map(state.branches)
  if (!newBranches.has(args[0])) {
    newBranches.set(args[0], [])
  }
  return { stdout: '', stderr: '', exitCode: 0, state: { ...state, branches: newBranches } }
}

function gitSwitch(state: GitState, args: string[], _cwd: string) {
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  const name = args[0]
  if (!name) return { stdout: '', stderr: 'git switch: branch name required', exitCode: 1, state }
  if (!state.branches.has(name)) {
    if (args.includes('-c')) {
      const newBranches = new Map(state.branches)
      newBranches.set(name, [])
      return { stdout: `Switched to a new branch '${name}'`, stderr: '', exitCode: 0, state: { ...state, currentBranch: name, branches: newBranches } }
    }
    return { stdout: '', stderr: `fatal: invalid reference: ${name}`, exitCode: 1, state }
  }
  return { stdout: `Switched to branch '${name}'`, stderr: '', exitCode: 0, state: { ...state, currentBranch: name } }
}

function gitCheckout(state: GitState, args: string[], _cwd: string) {
  return gitSwitch(state, args, _cwd)
}

function gitMerge(state: GitState, args: string[], _cwd: string) {
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  const branch = args[0]
  if (!branch) return { stdout: '', stderr: 'git merge: branch name required', exitCode: 1, state }
  if (!state.branches.has(branch)) return { stdout: '', stderr: `merge: ${branch} - not something we can merge`, exitCode: 1, state }
  return { stdout: `Merge made by the 'ort' strategy.\n ${branch} merged into ${state.currentBranch}`, stderr: '', exitCode: 0, state }
}

function gitRebase(state: GitState, args: string[], _cwd: string) {
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  const branch = args[0]
  if (!branch) return { stdout: '', stderr: 'git rebase: branch name required', exitCode: 1, state }
  if (!state.branches.has(branch)) return { stdout: '', stderr: `fatal: invalid reference: ${branch}`, exitCode: 1, state }
  return { stdout: `Successfully rebased and updated ${state.currentBranch}.`, stderr: '', exitCode: 0, state }
}

function gitStash(state: GitState, args: string[], _cwd: string) {
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  const sub = args[0] || 'push'
  if (sub === 'push' || sub === 'save') {
    const entry: StashEntry = {
      id: `stash@{${state.stash.length}}`,
      message: args.slice(1).join(' ') || `WIP on ${state.currentBranch}`,
      changes: new Map(state.workingDirectory),
      branch: state.currentBranch,
    }
    return { stdout: `Saved working directory and index state: ${entry.message}`, stderr: '', exitCode: 0, state: { ...state, stash: [...state.stash, entry], workingDirectory: new Map() } }
  }
  if (sub === 'pop') {
    if (state.stash.length === 0) return { stdout: '', stderr: 'No stash entries found.', exitCode: 1, state }
    const last = state.stash[state.stash.length - 1]
    return { stdout: `Dropped refs/stash@{0} (${last.id})`, stderr: '', exitCode: 0, state: { ...state, stash: state.stash.slice(0, -1), workingDirectory: new Map(last.changes) } }
  }
  if (sub === 'list') {
    let stdout = ''
    state.stash.forEach(s => { stdout += `${s.id}: ${s.message}\n` })
    return { stdout, stderr: '', exitCode: 0, state }
  }
  return { stdout: '', stderr: '', exitCode: 0, state }
}

function gitRestore(state: GitState, args: string[], _cwd: string) {
  void _cwd
  const staged = args.includes('--staged')
  const files = args.filter(a => !a.startsWith('-'))
  const newStaging = new Map(state.stagingArea)
  const newWorking = new Map(state.workingDirectory)
  for (const f of files) {
    if (staged) newStaging.delete(f)
    newWorking.delete(f)
  }
  return { stdout: '', stderr: '', exitCode: 0, state: { ...state, stagingArea: newStaging, workingDirectory: newWorking } }
}

function gitReset(state: GitState, args: string[], _cwd: string) {
  void _cwd
  const hard = args.includes('--hard')
  const target = args.find(a => !a.startsWith('-'))
  const newState = { ...state, stagingArea: new Map() }
  if (hard) {
    newState.workingDirectory = new Map()
    return { stdout: `HEAD is now at ${target || 'HEAD'}`, stderr: '', exitCode: 0, state: newState }
  }
  return { stdout: 'Unstaged changes after reset:', stderr: '', exitCode: 0, state: newState }
}

function gitRevert(state: GitState, args: string[], _cwd: string) {
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  const hash = args[0]
  if (!hash) return { stdout: '', stderr: 'usage: git revert <commit>', exitCode: 1, state }
  const newHash = generateHash()
  const commit: Commit = { hash: newHash, message: `Revert "commit ${hash}"`, author: 'ghost', date: new Date().toISOString(), parent: state.head, changes: new Map() }
  return { stdout: `[${state.currentBranch} ${shortHash(newHash)}] Revert "commit ${hash}"`, stderr: '', exitCode: 0, state: { ...state, commits: [...state.commits, commit], head: newHash } }
}

function gitReflog(state: GitState, _args: string[], _cwd: string) {
  void _args
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  return { stdout: state.reflog.join('\n') + '\n', stderr: '', exitCode: 0, state }
}

function gitCherryPick(state: GitState, args: string[], _cwd: string) {
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  const hash = args[0]
  if (!hash) return { stdout: '', stderr: 'usage: git cherry-pick <commit>', exitCode: 1, state }
  const target = state.commits.find(c => c.hash.startsWith(hash))
  if (!target) return { stdout: '', stderr: `fatal: bad revision '${hash}'`, exitCode: 128, state }
  const newHash = generateHash()
  const commit: Commit = { hash: newHash, message: target.message, author: target.author, date: new Date().toISOString(), parent: state.head, changes: new Map(target.changes) }
  return { stdout: `[${state.currentBranch} ${shortHash(newHash)}] ${target.message}`, stderr: '', exitCode: 0, state: { ...state, commits: [...state.commits, commit], head: newHash } }
}

// === NEW GIT COMMANDS ===

function gitTag(state: GitState, args: string[], _cwd: string) {
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  const list = args.includes('-l') || args.length === 0
  const annotate = args.includes('-a')
  const messageIdx = args.indexOf('-m')
  const message = messageIdx >= 0 ? args[messageIdx + 1] : ''
  const name = args.find(a => !a.startsWith('-') && a !== message) || ''

  if (list) {
    let stdout = ''
    state.tags.forEach((_t, n) => { stdout += `${n}\n` })
    return { stdout, stderr: '', exitCode: 0, state }
  }
  if (annotate && name) {
    const newTags = new Map(state.tags)
    newTags.set(name, { name, message: message || `Tag ${name}`, hash: state.head })
    return { stdout: '', stderr: '', exitCode: 0, state: { ...state, tags: newTags } }
  }
  if (name) {
    const newTags = new Map(state.tags)
    newTags.set(name, { name, message: '', hash: state.head })
    return { stdout: '', stderr: '', exitCode: 0, state: { ...state, tags: newTags } }
  }
  return { stdout: '', stderr: 'usage: git tag [-a <name> -m <msg>] | git tag -l', exitCode: 1, state }
}

function gitRemote(state: GitState, args: string[], _cwd: string) {
  void _cwd
  const verbose = args.includes('-v') || args.includes('--verbose')
  const add = args.includes('add')
  const remove = args.includes('remove') || args.includes('rm')
  if (add) {
    const name = args.find(a => !a.startsWith('-') && a !== 'add')
    const url = args[args.length - 1]
    if (!name || !url) return { stdout: '', stderr: 'usage: git remote add <name> <url>', exitCode: 1, state }
    const newRemotes = new Map(state.remotes)
    newRemotes.set(name, url)
    return { stdout: '', stderr: '', exitCode: 0, state: { ...state, remotes: newRemotes } }
  }
  if (remove) {
    const name = args.find(a => !a.startsWith('-') && a !== 'remove' && a !== 'rm')
    if (!name) return { stdout: '', stderr: 'usage: git remote remove <name>', exitCode: 1, state }
    const newRemotes = new Map(state.remotes)
    newRemotes.delete(name)
    return { stdout: '', stderr: '', exitCode: 0, state: { ...state, remotes: newRemotes } }
  }
  if (verbose) {
    let stdout = ''
    state.remotes.forEach((url, name) => {
      stdout += `${name}\t${url} (fetch)\n${name}\t${url} (push)\n`
    })
    return { stdout, stderr: '', exitCode: 0, state }
  }
  let stdout = ''
  state.remotes.forEach((_url, name) => { stdout += `${name}\n` })
  return { stdout, stderr: '', exitCode: 0, state }
}

function gitFetch(_state: GitState, _args: string[], _cwd: string) {
  void _args
  void _cwd
  return { stdout: `From ${Array.from(_state.remotes.values())[0] || 'origin'}\n * [new branch]      main     -> origin/main\n`, stderr: '', exitCode: 0, state: _state }
}

function gitPull(state: GitState, _args: string[], _cwd: string) {
  void _args
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  return { stdout: `From origin\n * branch            main       -> FETCH_HEAD\nAlready up to date.\n`, stderr: '', exitCode: 0, state }
}

function gitPush(state: GitState, _args: string[], _cwd: string) {
  void _args
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  return { stdout: `To ${Array.from(state.remotes.values())[0] || 'origin'}\n   ${shortHash(state.head || '0'.repeat(40))}..${shortHash(generateHash())}  ${state.currentBranch} -> ${state.currentBranch}\n`, stderr: '', exitCode: 0, state }
}

function gitClean(state: GitState, args: string[], _cwd: string) {
  void _cwd
  const force = args.includes('-f') || args.includes('-fd')
  if (!force) return { stdout: '', stderr: 'fatal: clean.requireForce defaults to true and neither -i, -n, nor -f given;\nrefusing to clean', exitCode: 1, state }
  return { stdout: 'Removing untracked files...\n', stderr: '', exitCode: 0, state }
}

function gitWorktree(state: GitState, args: string[], _cwd: string) {
  const sub = args[0] || 'list'
  if (sub === 'list' || args.length === 0) {
    let stdout = `${_cwd}        ${state.currentBranch} [${state.commits.length > 0 ? shortHash(state.commits[state.commits.length - 1].hash) : '0000000'}]\n`
    state.worktrees.forEach((branch, path) => { stdout += `${path}        ${branch}\n` })
    return { stdout, stderr: '', exitCode: 0, state }
  }
  if (sub === 'add') {
    const path = args[1]
    const branch = args[args.length - 1]
    if (!path) return { stdout: '', stderr: 'usage: git worktree add <path> [<branch>]', exitCode: 1, state }
    const newWorktrees = new Map(state.worktrees)
    newWorktrees.set(path, branch || state.currentBranch)
    return { stdout: `Preparing worktree (new HEAD at ${shortHash(state.head || '0'.repeat(40))})\n`, stderr: '', exitCode: 0, state: { ...state, worktrees: newWorktrees } }
  }
  if (sub === 'remove') {
    const path = args[1]
    if (!path) return { stdout: '', stderr: 'usage: git worktree remove <path>', exitCode: 1, state }
    const newWorktrees = new Map(state.worktrees)
    newWorktrees.delete(path)
    return { stdout: '', stderr: '', exitCode: 0, state: { ...state, worktrees: newWorktrees } }
  }
  return { stdout: '', stderr: 'git worktree: unknown subcommand', exitCode: 1, state }
}

function gitSubmodule(state: GitState, args: string[], _cwd: string) {
  void _cwd
  const sub = args[0] || 'status'
  if (sub === 'status') {
    let stdout = ''
    state.submodules.forEach((path, name) => { stdout += ` ${shortHash(generateHash())} ${path} (${name})\n` })
    if (!stdout) stdout = 'No submodules found\n'
    return { stdout, stderr: '', exitCode: 0, state }
  }
  if (sub === 'add') {
    const url = args[1]
    const path = args[2]
    if (!url) return { stdout: '', stderr: 'usage: git submodule add <url> [<path>]', exitCode: 1, state }
    const newSub = new Map(state.submodules)
    newSub.set(url.split('/').pop()?.replace('.git', '') || 'submodule', path || 'submodule')
    return { stdout: `Cloning into '${path || 'submodule'}'...\nSubmodule registered\n`, stderr: '', exitCode: 0, state: { ...state, submodules: newSub } }
  }
  if (sub === 'update') {
    return { stdout: 'Submodule path updated\n', stderr: '', exitCode: 0, state }
  }
  return { stdout: '', stderr: 'git submodule: unknown subcommand', exitCode: 1, state }
}

function gitConfig(state: GitState, args: string[], _cwd: string) {
  void _cwd
  const list = args.includes('--list') || args.includes('-l')
  if (list) {
    let stdout = ''
    state.config.forEach((v, k) => { stdout += `${k}=${v}\n` })
    return { stdout, stderr: '', exitCode: 0, state }
  }
  if (args.length >= 2 && !args[0].startsWith('-')) {
    const key = args[0]
    const value = args[1]
    const newConfig = new Map(state.config)
    newConfig.set(key, value)
    return { stdout: '', stderr: '', exitCode: 0, state: { ...state, config: newConfig } }
  }
  return { stdout: '', stderr: 'usage: git config [--list] [<key> <value>]', exitCode: 1, state }
}

function gitShortlog(state: GitState, _args: string[], _cwd: string) {
  void _args
  void _cwd
  const counts: Record<string, number> = {}
  state.commits.forEach(c => { counts[c.author] = (counts[c.author] || 0) + 1 })
  let stdout = ''
  Object.entries(counts).forEach(([author, count]) => { stdout += `${author} (${count}):\n\t${count} commits\n` })
  if (!stdout) stdout = 'Ghost Ops (0):\n\t0 commits\n'
  return { stdout, stderr: '', exitCode: 0, state }
}

function gitArchive(state: GitState, args: string[], _cwd: string) {
  void _cwd
  const fmtIdx = args.indexOf('--format')
  const format = fmtIdx >= 0 ? args[fmtIdx + 1] : 'tar'
  const outputIdx = args.indexOf('-o')
  const output = outputIdx >= 0 ? args[outputIdx + 1] : `archive.${format}`
  const tree = args.find(a => !a.startsWith('-') && a !== format && a !== output) || state.head || 'HEAD'
  return { stdout: `Archiving ${tree} -> ${output}\n`, stderr: '', exitCode: 0, state }
}
