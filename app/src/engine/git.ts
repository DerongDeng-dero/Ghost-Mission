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
  stagedChanges: Map<string, string>
  branch: string
}

export interface GitTag {
  name: string
  message: string
  hash: string
}

export interface GitBisectState {
  originalHead: string
  good: string[]
  bad: string[]
  current: string
  log: string[]
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
  bisect: GitBisectState | null
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
    bisect: null,
  }
  return st
}

function shortHash(full: string): string {
  return full.slice(0, 7)
}

function generateHash(): string {
  return Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

function cloneBranches(branches: Map<string, Commit[]>): Map<string, Commit[]> {
  return new Map(Array.from(branches, ([name, commits]) => [name, [...commits]]))
}

function resolveCommitReference(state: GitState, reference: string): Commit | null {
  if (reference === 'HEAD') return state.commits.find(commit => commit.hash === state.head) ?? null
  const ancestorMatch = reference.match(/^HEAD~(\d+)$/)
  if (ancestorMatch) {
    let commit = state.commits.find(candidate => candidate.hash === state.head) ?? null
    for (let i = 0; commit && i < Number(ancestorMatch[1]); i++) {
      commit = commit.parent
        ? state.commits.find(candidate => candidate.hash === commit?.parent) ?? null
        : null
    }
    return commit
  }
  const branchTip = state.branches.get(reference)?.at(-1)
  if (branchTip) return branchTip
  const tag = state.tags.get(reference)
  if (tag) return state.commits.find(commit => commit.hash === tag.hash) ?? null
  const matches = state.commits.filter(commit => commit.hash.startsWith(reference))
  return matches.length === 1 ? matches[0] : null
}

function buildLinearHistory(state: GitState, tip: Commit): Commit[] {
  const history: Commit[] = []
  const seen = new Set<string>()
  let current: Commit | null = tip
  while (current && !seen.has(current.hash)) {
    seen.add(current.hash)
    history.push(current)
    current = current.parent
      ? state.commits.find(candidate => candidate.hash === current?.parent) ?? null
      : null
  }
  return history.reverse()
}

function repositoryError(state: GitState) {
  return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
}

export function gitCommand(state: GitState, args: string[], cwd: string): { stdout: string; stderr: string; exitCode: number; state: GitState } {
  const cmd = args[0]
  const cargs = args.slice(1)
  if (!cmd) return { stdout: '', stderr: 'usage: git <command> [<args>]', exitCode: 1, state }
  const repositoryCommands = new Set([
    'status', 'add', 'commit', 'diff', 'log', 'show', 'blame', 'branch', 'switch',
    'checkout', 'merge', 'rebase', 'stash', 'restore', 'reset', 'revert', 'reflog',
    'cherry-pick', 'bisect', 'tag', 'remote', 'fetch', 'pull', 'push', 'clean', 'worktree',
    'submodule', 'shortlog', 'archive',
  ])
  if (!state.initialized && repositoryCommands.has(cmd)) return repositoryError(state)

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
    case 'bisect': return gitBisect(state, cargs, cwd)
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
  const newState: GitState = {
    ...state,
    initialized: true,
    branches: new Map([['main', []]]),
    currentBranch: 'main',
    reflog: [`${generateHash()} HEAD@{0}: initialize`],
  }
  return { stdout: `Initialized empty Git repository in ${_cwd}/.git/`, stderr: '', exitCode: 0, state: newState }
}

function gitStatus(state: GitState, _args: string[], _cwd: string) {
  void _args
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  let stdout = state.bisect
    ? `HEAD detached at ${shortHash(state.bisect.current)}\nYou are currently bisecting, started from ${shortHash(state.bisect.originalHead)}.\n`
    : `On branch ${state.currentBranch}\n`
  if ((state.branches.get(state.currentBranch)?.length ?? 0) === 0) {
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
  const newState = {
    ...state,
    stagingArea: new Map(state.stagingArea),
    workingDirectory: new Map(state.workingDirectory),
  }
  for (const f of args) {
    if (f === '.') {
      state.workingDirectory.forEach((value, path) => { newState.stagingArea.set(path, value) })
      newState.workingDirectory.clear()
    } else {
      newState.stagingArea.set(f, state.workingDirectory.get(f) ?? f)
      newState.workingDirectory.delete(f)
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
  const branches = cloneBranches(state.branches)
  const branchCommits = branches.get(state.currentBranch) || []
  branches.set(state.currentBranch, [...branchCommits, commit])
  const newState: GitState = {
    ...state,
    commits: [...state.commits, commit],
    head: hash,
    stagingArea: new Map(),
    workingDirectory: new Map(state.workingDirectory),
    reflog: [...state.reflog, `${hash} HEAD@{${state.commits.length}}: commit: ${message}`],
    branches,
  }
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
  let commits = [...(state.branches.get(state.currentBranch) ?? [])]
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
    if (!state.branches.has(name)) return { stdout: '', stderr: `error: branch '${name}' not found.`, exitCode: 1, state }
    const newBranches = new Map(state.branches)
    newBranches.delete(name)
    return { stdout: `Deleted branch ${name}.`, stderr: '', exitCode: 0, state: { ...state, branches: newBranches } }
  }
  const newBranches = new Map(state.branches)
  if (newBranches.has(args[0])) return { stdout: '', stderr: `fatal: a branch named '${args[0]}' already exists`, exitCode: 128, state }
  newBranches.set(args[0], [...(state.branches.get(state.currentBranch) ?? [])])
  return { stdout: '', stderr: '', exitCode: 0, state: { ...state, branches: newBranches } }
}

function gitSwitch(state: GitState, args: string[], _cwd: string) {
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  const createIndex = args.findIndex(arg => arg === '-c' || arg === '-C')
  const create = createIndex >= 0
  const forceCreate = args[createIndex] === '-C'
  const name = create ? args[createIndex + 1] : args.find(arg => !arg.startsWith('-'))
  if (!name) return { stdout: '', stderr: 'git switch: branch name required', exitCode: 1, state }
  if (create) {
    if (state.branches.has(name) && !forceCreate) return { stdout: '', stderr: `fatal: a branch named '${name}' already exists`, exitCode: 128, state }
    const newBranches = cloneBranches(state.branches)
    newBranches.set(name, [...(state.branches.get(state.currentBranch) ?? [])])
    return { stdout: `Switched to a new branch '${name}'`, stderr: '', exitCode: 0, state: { ...state, currentBranch: name, branches: newBranches } }
  }
  if (!state.branches.has(name)) {
    return { stdout: '', stderr: `fatal: invalid reference: ${name}`, exitCode: 1, state }
  }
  const branchCommits = state.branches.get(name) ?? []
  return {
    stdout: `Switched to branch '${name}'`,
    stderr: '',
    exitCode: 0,
    state: { ...state, currentBranch: name, head: branchCommits[branchCommits.length - 1]?.hash ?? '' },
  }
}

function gitCheckout(state: GitState, args: string[], _cwd: string) {
  if (args[0] === '-b' || args[0] === '-B') {
    return gitSwitch(state, [args[0] === '-B' ? '-C' : '-c', ...args.slice(1)], _cwd)
  }
  return gitSwitch(state, args, _cwd)
}

function gitMerge(state: GitState, args: string[], _cwd: string) {
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  const branch = args[0]
  if (!branch) return { stdout: '', stderr: 'git merge: branch name required', exitCode: 1, state }
  if (!state.branches.has(branch)) return { stdout: '', stderr: `merge: ${branch} - not something we can merge`, exitCode: 1, state }
  if (branch === state.currentBranch) return { stdout: 'Already up to date.', stderr: '', exitCode: 0, state }
  const currentCommits = state.branches.get(state.currentBranch) ?? []
  const targetCommits = state.branches.get(branch) ?? []
  const currentHashes = new Set(currentCommits.map(commit => commit.hash))
  if (targetCommits.every(commit => currentHashes.has(commit.hash))) {
    return { stdout: 'Already up to date.', stderr: '', exitCode: 0, state }
  }
  const hash = generateHash()
  const commit: Commit = {
    hash,
    message: `Merge branch '${branch}'`,
    author: state.config.get('user.name') || 'Ghost Ops',
    date: new Date().toISOString(),
    parent: state.head || null,
    changes: new Map(targetCommits[targetCommits.length - 1]?.changes ?? []),
  }
  const branches = cloneBranches(state.branches)
  branches.set(state.currentBranch, [...currentCommits, commit])
  return {
    stdout: `Merge made by the 'ort' strategy.\n ${branch} merged into ${state.currentBranch}`,
    stderr: '',
    exitCode: 0,
    state: {
      ...state,
      branches,
      commits: [...state.commits, commit],
      head: hash,
      reflog: [...state.reflog, `${hash} HEAD@{${state.reflog.length}}: merge ${branch}`],
    },
  }
}

function gitRebase(state: GitState, args: string[], _cwd: string) {
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  const branch = args[0]
  if (!branch) return { stdout: '', stderr: 'git rebase: branch name required', exitCode: 1, state }
  if (!state.branches.has(branch)) return { stdout: '', stderr: `fatal: invalid reference: ${branch}`, exitCode: 1, state }
  if (state.stagingArea.size > 0 || state.workingDirectory.size > 0) {
    return { stdout: '', stderr: 'error: cannot rebase: You have unstaged changes.', exitCode: 1, state }
  }
  if (branch === state.currentBranch) return { stdout: `Current branch ${state.currentBranch} is up to date.`, stderr: '', exitCode: 0, state }

  const currentCommits = state.branches.get(state.currentBranch) ?? []
  const targetCommits = state.branches.get(branch) ?? []
  const currentHashes = new Set(currentCommits.map(commit => commit.hash))
  if (targetCommits.every(commit => currentHashes.has(commit.hash))) {
    return { stdout: `Current branch ${state.currentBranch} is up to date.`, stderr: '', exitCode: 0, state }
  }

  const targetHashes = new Set(targetCommits.map(commit => commit.hash))
  const uniqueCurrentCommits = currentCommits.filter(commit => !targetHashes.has(commit.hash))
  const replayed: Commit[] = []
  let parent = targetCommits.at(-1)?.hash ?? null
  for (const oldCommit of uniqueCurrentCommits) {
    const commit: Commit = {
      ...oldCommit,
      hash: generateHash(),
      date: new Date().toISOString(),
      parent,
      changes: new Map(oldCommit.changes),
    }
    replayed.push(commit)
    parent = commit.hash
  }

  const rebasedHistory = [...targetCommits, ...replayed]
  const head = rebasedHistory.at(-1)?.hash ?? ''
  const branches = cloneBranches(state.branches)
  branches.set(state.currentBranch, rebasedHistory)
  return {
    stdout: `Successfully rebased and updated ${state.currentBranch}.`,
    stderr: '',
    exitCode: 0,
    state: {
      ...state,
      branches,
      commits: [...state.commits, ...replayed],
      head,
      reflog: [...state.reflog, `${head} HEAD@{${state.reflog.length}}: rebase ${branch}`],
    },
  }
}

function gitStash(state: GitState, args: string[], _cwd: string) {
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  const sub = args[0] || 'push'
  if (sub === 'push' || sub === 'save') {
    if (state.workingDirectory.size === 0 && state.stagingArea.size === 0) {
      return { stdout: 'No local changes to save', stderr: '', exitCode: 0, state }
    }
    const messageIndex = args.findIndex(arg => arg === '-m' || arg === '--message')
    const message = messageIndex >= 0 ? args[messageIndex + 1] : args.slice(1).filter(arg => !arg.startsWith('-')).join(' ')
    const entry: StashEntry = {
      id: `stash@{${state.stash.length}}`,
      message: message || `WIP on ${state.currentBranch}`,
      changes: new Map(state.workingDirectory),
      stagedChanges: new Map(state.stagingArea),
      branch: state.currentBranch,
    }
    return {
      stdout: `Saved working directory and index state: ${entry.message}`,
      stderr: '',
      exitCode: 0,
      state: { ...state, stash: [...state.stash, entry], workingDirectory: new Map(), stagingArea: new Map() },
    }
  }
  if (sub === 'pop') {
    if (state.stash.length === 0) return { stdout: '', stderr: 'No stash entries found.', exitCode: 1, state }
    const last = state.stash[state.stash.length - 1]
    return {
      stdout: `Dropped refs/stash@{0} (${last.id})`,
      stderr: '',
      exitCode: 0,
      state: {
        ...state,
        stash: state.stash.slice(0, -1),
        workingDirectory: new Map(last.changes),
        stagingArea: new Map(last.stagedChanges),
      },
    }
  }
  if (sub === 'list') {
    let stdout = ''
    state.stash.forEach(s => { stdout += `${s.id}: ${s.message}\n` })
    return { stdout, stderr: '', exitCode: 0, state }
  }
  return { stdout: '', stderr: `git stash: unknown subcommand '${sub}'`, exitCode: 1, state }
}

function gitRestore(state: GitState, args: string[], _cwd: string) {
  void _cwd
  const staged = args.includes('--staged')
  const files = args.filter(a => !a.startsWith('-'))
  if (files.length === 0) return { stdout: '', stderr: 'fatal: you must specify path(s) to restore', exitCode: 128, state }
  const newStaging = new Map(state.stagingArea)
  const newWorking = new Map(state.workingDirectory)
  for (const f of files) {
    if (staged) {
      const content = newStaging.get(f)
      if (content !== undefined) newWorking.set(f, content)
      newStaging.delete(f)
    } else {
      newWorking.delete(f)
    }
  }
  return { stdout: '', stderr: '', exitCode: 0, state: { ...state, stagingArea: newStaging, workingDirectory: newWorking } }
}

function gitReset(state: GitState, args: string[], _cwd: string) {
  void _cwd
  const hard = args.includes('--hard')
  const soft = args.includes('--soft')
  const targetReference = args.find(a => !a.startsWith('-')) ?? 'HEAD'
  const target = resolveCommitReference(state, targetReference)
  if (!target) return { stdout: '', stderr: `fatal: ambiguous argument '${targetReference}': unknown revision`, exitCode: 128, state }

  const targetHistory = buildLinearHistory(state, target)
  const targetHashes = new Set(targetHistory.map(commit => commit.hash))
  const removedCommits = (state.branches.get(state.currentBranch) ?? []).filter(commit => !targetHashes.has(commit.hash))
  const undoneChanges = new Map<string, string>()
  removedCommits.forEach(commit => commit.changes.forEach((content, path) => undoneChanges.set(path, content)))

  const branches = cloneBranches(state.branches)
  branches.set(state.currentBranch, targetHistory)
  const stagingArea = soft
    ? new Map([...undoneChanges, ...state.stagingArea])
    : new Map<string, string>()
  const workingDirectory = hard
    ? new Map<string, string>()
    : new Map([...undoneChanges, ...state.workingDirectory])
  const newState: GitState = {
    ...state,
    branches,
    head: target.hash,
    stagingArea,
    workingDirectory,
    reflog: [...state.reflog, `${target.hash} HEAD@{${state.reflog.length}}: reset: moving to ${targetReference}`],
  }
  if (hard) {
    return { stdout: `HEAD is now at ${shortHash(target.hash)} ${target.message}`, stderr: '', exitCode: 0, state: newState }
  }
  return { stdout: 'Unstaged changes after reset:', stderr: '', exitCode: 0, state: newState }
}

function gitRevert(state: GitState, args: string[], _cwd: string) {
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  const hash = args[0]
  if (!hash) return { stdout: '', stderr: 'usage: git revert <commit>', exitCode: 1, state }
  const target = state.commits.find(commit => commit.hash.startsWith(hash))
  if (!target) return { stdout: '', stderr: `fatal: bad revision '${hash}'`, exitCode: 128, state }
  const newHash = generateHash()
  const commit: Commit = { hash: newHash, message: `Revert "${target.message}"`, author: 'ghost', date: new Date().toISOString(), parent: state.head, changes: new Map() }
  const branches = cloneBranches(state.branches)
  branches.set(state.currentBranch, [...(branches.get(state.currentBranch) ?? []), commit])
  return {
    stdout: `[${state.currentBranch} ${shortHash(newHash)}] Revert "${target.message}"`,
    stderr: '',
    exitCode: 0,
    state: {
      ...state,
      commits: [...state.commits, commit],
      head: newHash,
      branches,
      reflog: [...state.reflog, `${newHash} HEAD@{${state.reflog.length}}: revert: ${target.message}`],
    },
  }
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
  const branches = cloneBranches(state.branches)
  branches.set(state.currentBranch, [...(branches.get(state.currentBranch) ?? []), commit])
  return {
    stdout: `[${state.currentBranch} ${shortHash(newHash)}] ${target.message}`,
    stderr: '',
    exitCode: 0,
    state: {
      ...state,
      commits: [...state.commits, commit],
      head: newHash,
      branches,
      reflog: [...state.reflog, `${newHash} HEAD@{${state.reflog.length}}: cherry-pick: ${target.message}`],
    },
  }
}

function gitBisect(state: GitState, args: string[], _cwd: string) {
  void _cwd
  if (!state.initialized) return repositoryError(state)

  const subcommand = args[0]
  if (!subcommand) {
    return {
      stdout: '',
      stderr: 'usage: git bisect <start|good|bad|reset|log|run> [<args>]',
      exitCode: 1,
      state,
    }
  }

  if (subcommand === 'start') {
    if (!state.head) {
      return {
        stdout: '',
        stderr: 'fatal: bad revision HEAD',
        exitCode: 128,
        state,
      }
    }

    const badReference = args[1]
    const goodReference = args[2]
    const badCommit = badReference ? resolveCommitReference(state, badReference) : null
    const goodCommit = goodReference ? resolveCommitReference(state, goodReference) : null
    if (badReference && !badCommit) {
      return { stdout: '', stderr: `error: Bad rev input: ${badReference}`, exitCode: 1, state }
    }
    if (goodReference && !goodCommit) {
      return { stdout: '', stderr: `error: Bad rev input: ${goodReference}`, exitCode: 1, state }
    }

    const bisect: GitBisectState = {
      originalHead: state.head,
      good: goodCommit ? [goodCommit.hash] : [],
      bad: badCommit ? [badCommit.hash] : [],
      current: state.head,
      log: ['git bisect start' + (badReference ? ` ${badReference}` : '') + (goodReference ? ` ${goodReference}` : '')],
    }
    const nextState = { ...state, bisect }
    if (badCommit && goodCommit) return advanceBisect(nextState)
    return {
      stdout: 'status: waiting for both good and bad commits',
      stderr: '',
      exitCode: 0,
      state: nextState,
    }
  }

  if (subcommand === 'reset') {
    if (!state.bisect) {
      return {
        stdout: '',
        stderr: 'We are not bisecting.',
        exitCode: 1,
        state,
      }
    }
    return {
      stdout: `Previous HEAD position was ${shortHash(state.bisect.current)}\nSwitched to branch '${state.currentBranch}'`,
      stderr: '',
      exitCode: 0,
      state: { ...state, head: state.bisect.originalHead, bisect: null },
    }
  }

  if (!state.bisect) {
    return {
      stdout: '',
      stderr: 'You need to start by "git bisect start".',
      exitCode: 1,
      state,
    }
  }

  if (subcommand === 'log') {
    return {
      stdout: state.bisect.log.join('\n'),
      stderr: '',
      exitCode: 0,
      state,
    }
  }

  if (subcommand === 'run') {
    const command = args.slice(1)
    if (command.length === 0) {
      return {
        stdout: '',
        stderr: 'usage: git bisect run <cmd>...',
        exitCode: 1,
        state,
      }
    }
    return {
      stdout: '',
      stderr: 'git bisect run is unavailable in the isolated Git model; run the check in the shell and mark the revision good or bad',
      exitCode: 1,
      state,
    }
  }

  if (subcommand !== 'good' && subcommand !== 'bad') {
    return {
      stdout: '',
      stderr: `error: unknown bisect subcommand: ${subcommand}`,
      exitCode: 1,
      state,
    }
  }

  const reference = args[1]
  const commit = reference
    ? resolveCommitReference(state, reference)
    : resolveCommitReference(state, state.bisect.current)
  if (!commit) {
    return {
      stdout: '',
      stderr: `error: Bad rev input: ${reference ?? state.bisect.current}`,
      exitCode: 1,
      state,
    }
  }

  const marks = [...state.bisect[subcommand]]
  if (!marks.includes(commit.hash)) marks.push(commit.hash)
  const nextState: GitState = {
    ...state,
    bisect: {
      ...state.bisect,
      [subcommand]: marks,
      log: [...state.bisect.log, `git bisect ${subcommand} ${commit.hash}`],
    },
  }
  if (nextState.bisect?.good.length && nextState.bisect.bad.length) return advanceBisect(nextState)
  return {
    stdout: `status: waiting for ${subcommand === 'good' ? 'bad' : 'good'} commit`,
    stderr: '',
    exitCode: 0,
    state: nextState,
  }
}

function advanceBisect(state: GitState) {
  const bisect = state.bisect
  if (!bisect) return { stdout: '', stderr: 'We are not bisecting.', exitCode: 1, state }
  const badCommit = state.commits.find(commit => commit.hash === bisect.bad.at(-1))
  const goodCommit = state.commits.find(commit => commit.hash === bisect.good.at(-1))
  if (!badCommit || !goodCommit) {
    return { stdout: '', stderr: 'error: invalid bisect state', exitCode: 1, state }
  }

  const history = buildLinearHistory(state, badCommit)
  const goodIndex = history.findIndex(commit => commit.hash === goodCommit.hash)
  const badIndex = history.findIndex(commit => commit.hash === badCommit.hash)
  if (goodIndex < 0 || badIndex < 0 || goodIndex >= badIndex) {
    return {
      stdout: '',
      stderr: 'Some good revs are not ancestors of the bad rev.',
      exitCode: 1,
      state,
    }
  }

  if (badIndex - goodIndex === 1) {
    return {
      stdout: `${badCommit.hash} is the first bad commit\ncommit ${badCommit.hash}\nAuthor: ${badCommit.author}\n\n    ${badCommit.message}`,
      stderr: '',
      exitCode: 0,
      state: {
        ...state,
        head: badCommit.hash,
        bisect: {
          ...bisect,
          current: badCommit.hash,
        },
      },
    }
  }

  const current = history[Math.floor((goodIndex + badIndex) / 2)]
  const remaining = badIndex - goodIndex - 1
  return {
    stdout: `Bisecting: ${remaining} revision${remaining === 1 ? '' : 's'} left to test after this\n[${shortHash(current.hash)}] ${current.message}`,
    stderr: '',
    exitCode: 0,
    state: {
      ...state,
      head: current.hash,
      bisect: {
        ...bisect,
        current: current.hash,
      },
    },
  }
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
  if (!state.head) return { stdout: '', stderr: 'fatal: Failed to resolve HEAD as a valid ref.', exitCode: 128, state }
  if (annotate && name) {
    if (state.tags.has(name)) return { stdout: '', stderr: `fatal: tag '${name}' already exists`, exitCode: 128, state }
    const newTags = new Map(state.tags)
    newTags.set(name, { name, message: message || `Tag ${name}`, hash: state.head })
    return { stdout: '', stderr: '', exitCode: 0, state: { ...state, tags: newTags } }
  }
  if (name) {
    if (state.tags.has(name)) return { stdout: '', stderr: `fatal: tag '${name}' already exists`, exitCode: 128, state }
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
    const addIndex = args.indexOf('add')
    const name = args[addIndex + 1]
    const url = args[addIndex + 2]
    if (!name || !url) return { stdout: '', stderr: 'usage: git remote add <name> <url>', exitCode: 1, state }
    if (state.remotes.has(name)) return { stdout: '', stderr: `error: remote ${name} already exists.`, exitCode: 3, state }
    const newRemotes = new Map(state.remotes)
    newRemotes.set(name, url)
    return { stdout: '', stderr: '', exitCode: 0, state: { ...state, remotes: newRemotes } }
  }
  if (remove) {
    const name = args.find(a => !a.startsWith('-') && a !== 'remove' && a !== 'rm')
    if (!name) return { stdout: '', stderr: 'usage: git remote remove <name>', exitCode: 1, state }
    if (!state.remotes.has(name)) return { stdout: '', stderr: `error: No such remote: '${name}'`, exitCode: 2, state }
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
  const remote = Array.from(_state.remotes.values())[0]
  if (!remote) return { stdout: '', stderr: 'fatal: No remote repository specified.', exitCode: 128, state: _state }
  return { stdout: `From ${remote}\n * [new branch]      main     -> origin/main\n`, stderr: '', exitCode: 0, state: _state }
}

function gitPull(state: GitState, _args: string[], _cwd: string) {
  void _args
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  if (state.remotes.size === 0) return { stdout: '', stderr: 'fatal: No remote repository specified.', exitCode: 128, state }
  return { stdout: `From origin\n * branch            main       -> FETCH_HEAD\nAlready up to date.\n`, stderr: '', exitCode: 0, state }
}

function gitPush(state: GitState, _args: string[], _cwd: string) {
  void _args
  void _cwd
  if (!state.initialized) return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128, state }
  if (!state.head) return { stdout: '', stderr: `error: src refspec ${state.currentBranch} does not match any`, exitCode: 1, state }
  if (state.remotes.size === 0) return { stdout: '', stderr: 'fatal: No configured push destination.', exitCode: 128, state }
  return { stdout: `To ${Array.from(state.remotes.values())[0] || 'origin'}\n   ${shortHash(state.head || '0'.repeat(40))}..${shortHash(generateHash())}  ${state.currentBranch} -> ${state.currentBranch}\n`, stderr: '', exitCode: 0, state }
}

function gitClean(state: GitState, args: string[], _cwd: string) {
  void _cwd
  const force = args.includes('-f') || args.includes('-fd')
  if (!force) return { stdout: '', stderr: 'fatal: clean.requireForce defaults to true and neither -i, -n, nor -f given;\nrefusing to clean', exitCode: 1, state }
  return { stdout: 'Removing untracked files...\n', stderr: '', exitCode: 0, state: { ...state, workingDirectory: new Map() } }
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
