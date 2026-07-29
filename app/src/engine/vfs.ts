export interface VNode {
  name: string
  type: 'file' | 'directory' | 'symlink'
  content?: string
  permissions: string
  owner: string
  group: string
  size: number
  mtime: Date
  children?: Map<string, VNode>
  target?: string
}

export type PermissionMode = 'read' | 'write' | 'execute'

function parsePermissions(perm: string): { owner: number; group: number; other: number } {
  if (!/^[r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-]$/.test(perm)) {
    return { owner: 0, group: 0, other: 0 }
  }
  const parseTriplet = (s: string) => {
    let v = 0
    if (s[0] === 'r') v |= 4
    if (s[1] === 'w') v |= 2
    if (s[2] === 'x' || s[2] === 's' || s[2] === 't') v |= 1
    return v
  }
  return {
    owner: parseTriplet(perm.slice(0, 3)),
    group: parseTriplet(perm.slice(3, 6)),
    other: parseTriplet(perm.slice(6, 9)),
  }
}

function permToString(n: number): string {
  let s = ''
  s += n & 4 ? 'r' : '-'
  s += n & 2 ? 'w' : '-'
  s += n & 1 ? 'x' : '-'
  return s
}

function formatPermissions(
  owner: number,
  group: number,
  other: number,
  special: { setuid: boolean; setgid: boolean; sticky: boolean },
): string {
  const triplets = [permToString(owner), permToString(group), permToString(other)]
  if (special.setuid) {
    triplets[0] = triplets[0].slice(0, 2) + (owner & 1 ? 's' : 'S')
  }
  if (special.setgid) {
    triplets[1] = triplets[1].slice(0, 2) + (group & 1 ? 's' : 'S')
  }
  if (special.sticky) {
    triplets[2] = triplets[2].slice(0, 2) + (other & 1 ? 't' : 'T')
  }
  return triplets.join('')
}

export function createVNode(opts: Partial<VNode> & Pick<VNode, 'name' | 'type'>): VNode {
  return {
    name: opts.name,
    type: opts.type,
    content: opts.content ?? (opts.type === 'file' ? '' : undefined),
    permissions: opts.permissions ?? 'rw-r--r--',
    owner: opts.owner ?? 'ghost',
    group: opts.group ?? 'ghost',
    size: opts.size ?? (opts.type === 'file' ? (opts.content?.length ?? 0) : 0),
    mtime: opts.mtime ?? new Date('2024-01-01T00:00:00Z'),
    children: opts.type === 'directory' ? new Map() : undefined,
    target: opts.target,
  }
}

export class VFS {
  private root: VNode
  private users: Map<string, { uid: number; groups: string[] }>
  private currentUser: string

  constructor() {
    this.root = createVNode({ name: '', type: 'directory', permissions: 'rwxr-xr-x', owner: 'root', group: 'root' })
    this.currentUser = 'ghost'
    this.users = new Map([
      ['root', { uid: 0, groups: ['root'] }],
      ['ghost', { uid: 1000, groups: ['ghost', 'sudo'] }],
      ['www-data', { uid: 33, groups: ['www-data'] }],
    ])
    this.buildInitialFilesystem()
  }

  private buildInitialFilesystem() {
    const dirs: [string, string, string, string][] = [
      ['/bin', 'root', 'root', 'rwxr-xr-x'],
      ['/etc', 'root', 'root', 'rwxr-xr-x'],
      ['/home', 'root', 'root', 'rwxr-xr-x'],
      ['/home/ghost', 'ghost', 'ghost', 'rwxr-xr-x'],
      ['/home/ghost/projects', 'ghost', 'ghost', 'rwxr-xr-x'],
      ['/srv', 'root', 'root', 'rwxr-xr-x'],
      ['/srv/neonmall', 'ghost', 'ghost', 'rwxr-xr-x'],
      ['/srv/neonmall/logs', 'ghost', 'ghost', 'rwxr-xr-x'],
      ['/srv/neonmall/src', 'ghost', 'ghost', 'rwxr-xr-x'],
      ['/tmp', 'root', 'root', 'rwxrwxrwt'],
      ['/var', 'root', 'root', 'rwxr-xr-x'],
      ['/var/log', 'root', 'root', 'rwxr-xr-x'],
      ['/var/www', 'www-data', 'www-data', 'rwxr-xr-x'],
      ['/usr', 'root', 'root', 'rwxr-xr-x'],
      ['/usr/bin', 'root', 'root', 'rwxr-xr-x'],
      ['/usr/local', 'root', 'root', 'rwxr-xr-x'],
    ]
    for (const [path, owner, group, permissions] of dirs) {
      this.mkdirp(path, owner, group, permissions)
    }

    const files: [string, string, string, string, string][] = [
      ['/etc/passwd', 'root:x:0:0:root:/root:/bin/bash\nghost:x:1000:1000:Ghost:/home/ghost:/bin/bash\nwww-data:x:33:33:www-data:/var/www:/usr/sbin/nologin\n', 'root', 'root', 'rw-r--r--'],
      ['/etc/hostname', 'neonmall-server\n', 'root', 'root', 'rw-r--r--'],
      ['/etc/hosts', '127.0.0.1 localhost\n127.0.1.1 neonmall-server\n', 'root', 'root', 'rw-r--r--'],
      ['/etc/os-release', 'PRETTY_NAME="GhostOS 22.04 LTS"\nNAME="GhostOS"\nVERSION_ID="22.04"\n', 'root', 'root', 'rw-r--r--'],
      ['/home/ghost/.bashrc', '# GhostOps bashrc\nexport PS1="\\$ "\nalias ll="ls -la"\nalias ..="cd .."\n', 'ghost', 'ghost', 'rw-r--r--'],
      ['/home/ghost/.bash_history', 'cd /srv/neonmall\ngit status\ncat logs/app.log | grep ERROR\n', 'ghost', 'ghost', 'rw-------'],
      ['/home/ghost/projects/README.md', '# GhostOps Projects\n\nTop-secret project directory.\n', 'ghost', 'ghost', 'rw-r--r--'],
      ['/srv/neonmall/package.json', '{\n  "name": "neonmall",\n  "version": "1.2.0",\n  "main": "server.js",\n  "scripts": {\n    "start": "node server.js",\n    "test": "jest"\n  }\n}\n', 'ghost', 'ghost', 'rw-r--r--'],
      ['/srv/neonmall/server.js', 'const express = require("express");\nconst app = express();\nconst PORT = process.env.PORT || 3000;\napp.listen(PORT, () => console.log("Server on port " + PORT));\n', 'ghost', 'ghost', 'rw-r--r--'],
      ['/srv/neonmall/logs/app.log', '[2024-01-15T08:00:00Z] INFO: Server started on port 3000\n[2024-01-15T08:15:23Z] ERROR: Database connection failed\n[2024-01-15T08:15:24Z] INFO: Retrying connection...\n[2024-01-15T08:16:00Z] ERROR: Timeout connecting to payment gateway\n[2024-01-15T08:30:00Z] WARN: High memory usage detected\n[2024-01-15T09:00:00Z] ERROR: Failed to process refund #4921\n[2024-01-15T09:15:00Z] INFO: Scheduled maintenance started\n[2024-01-15T09:45:00Z] ERROR: Cache eviction failure\n[2024-01-15T10:00:00Z] INFO: Maintenance completed\n', 'ghost', 'ghost', 'rw-r--r--'],
      ['/srv/neonmall/logs/access.log', '127.0.0.1 - - [15/Jan/2024:08:00:00 +0000] "GET /api/health HTTP/1.1" 200 15\n192.168.1.42 - - [15/Jan/2024:08:15:00 +0000] "POST /api/checkout HTTP/1.1" 500 32\n', 'ghost', 'ghost', 'rw-r--r--'],
      ['/srv/neonmall/src/config.js', 'module.exports = {\n  dbHost: "localhost",\n  dbPort: 5432,\n  redisHost: "localhost"\n};\n', 'ghost', 'ghost', 'rw-r--r--'],
      ['/tmp/.X11-unix', '', 'root', 'root', 'rwxrwxrwt'],
      ['/tmp/session.lock', 'LOCK\n', 'ghost', 'ghost', 'rw-r--r--'],
      ['/var/log/syslog', 'Jan 15 08:00:00 neonmall-server systemd[1]: Started NeonMall Service\nJan 15 08:15:23 neonmall-server app[456]: DB connection error\n', 'root', 'root', 'rw-r-----'],
    ]
    for (const [path, content, owner, group, perm] of files) {
      const parts = path.split('/').filter(Boolean)
      const name = parts.pop()!
      let dir = this.root
      for (const p of parts) {
        if (!dir.children) continue
        const next = dir.children.get(p)
        if (next) dir = next
      }
      dir.children?.set(name, createVNode({ name, type: 'file', content, owner, group, permissions: perm }))
    }
  }

  private mkdirp(path: string, owner: string, group: string, perm: string) {
    const parts = path.split('/').filter(Boolean)
    let dir = this.root
    for (const p of parts) {
      if (!dir.children) {
        dir.children = new Map()
      }
      if (!dir.children.has(p)) {
        dir.children.set(p, createVNode({ name: p, type: 'directory', owner, group, permissions: perm }))
      }
      dir = dir.children.get(p)!
    }
  }

  private resolve(parts: string[], context: string[]): string[] {
    const result = [...context]
    for (const p of parts) {
      if (p === '..') { if (result.length > 0) result.pop() }
      else if (p !== '.' && p !== '') { result.push(p) }
    }
    return result
  }

  private getNode(
    parts: string[],
    seen = new Set<VNode>(),
  ): { node: VNode | null; parent: VNode | null; name: string; denied?: boolean } {
    if (parts.length === 0) return { node: this.root, parent: null, name: '' }
    const name = parts[parts.length - 1]
    let parent: VNode = this.root
    for (let i = 0; i < parts.length; i++) {
      if (parent.type !== 'directory' || !parent.children) {
        return { node: null, parent: null, name }
      }
      if (!this.checkPerm(parent, this.currentUser, 'execute')) {
        return { node: null, parent: null, name, denied: true }
      }

      const next = parent.children.get(parts[i])
      if (!next) {
        return { node: null, parent: i === parts.length - 1 ? parent : null, name }
      }
      if (i === parts.length - 1) return { node: next, parent, name }

      if (next.type === 'symlink') {
        if (!next.target || seen.has(next)) return { node: null, parent: null, name }
        seen.add(next)
        const context = next.target.startsWith('/') ? [] : parts.slice(0, i)
        const targetParts = next.target.startsWith('/')
          ? next.target.slice(1).split('/').filter(Boolean)
          : next.target.split('/').filter(Boolean)
        return this.getNode(
          [...this.resolve(targetParts, context), ...parts.slice(i + 1)],
          seen,
        )
      }
      if (next.type !== 'directory') return { node: null, parent: null, name }
      parent = next
    }
    return { node: null, parent: null, name }
  }

  private followSymlink(node: VNode | null, linkParts: string[], seen = new Set<VNode>()): VNode | null {
    if (!node) return null
    if (node.type === 'symlink' && node.target) {
      if (seen.has(node)) return null
      seen.add(node)
      const context = node.target.startsWith('/') ? [] : linkParts.slice(0, -1)
      const targetParts = node.target.startsWith('/')
        ? node.target.slice(1).split('/').filter(Boolean)
        : node.target.split('/').filter(Boolean)
      const resolved = this.resolve(targetParts, context)
      return this.followSymlink(this.getNode(resolved, seen).node, resolved, seen)
    }
    return node
  }

  private checkPerm(node: VNode, user: string, mode: PermissionMode): boolean {
    const userInfo = this.users.get(user) ?? { uid: 9999, groups: [] }
    const perm = parsePermissions(node.permissions)
    if (user === 'root') return true
    const mask = mode === 'read' ? 4 : mode === 'write' ? 2 : 1

    if (node.owner === user) return (perm.owner & mask) !== 0
    if (userInfo.groups.includes(node.group)) return (perm.group & mask) !== 0
    return (perm.other & mask) !== 0
  }

  private canRemove(parent: VNode, node: VNode): boolean {
    if (!this.checkPerm(parent, this.currentUser, 'write')) return false
    const sticky = parent.permissions[8] === 't' || parent.permissions[8] === 'T'
    if (!sticky || this.currentUser === 'root') return true
    return parent.owner === this.currentUser || node.owner === this.currentUser
  }

  getCurrentUser(): string { return this.currentUser }
  setCurrentUser(u: string) { this.currentUser = u }

  canWriteFile(path: string, cwd: string[], followedLinks = new Set<VNode>()): { error?: string } {
    const parts = this.resolvePath(path, cwd)
    const { node, parent, denied } = this.getNode(parts)
    if (denied) return { error: `${path}: Permission denied` }
    if (!parent) return { error: 'Cannot write to root' }
    if (!node) {
      return this.checkPerm(parent, this.currentUser, 'write')
        ? {}
        : { error: `${path}: Permission denied` }
    }
    const resolved = this.followSymlink(node, parts)
    if (!resolved && node.type === 'symlink' && node.target) {
      if (followedLinks.has(node)) return { error: `${path}: Too many levels of symbolic links` }
      followedLinks.add(node)
      const context = node.target.startsWith('/') ? [] : parts.slice(0, -1)
      const targetParts = node.target.startsWith('/')
        ? node.target.slice(1).split('/').filter(Boolean)
        : node.target.split('/').filter(Boolean)
      return this.canWriteFile(`/${this.resolve(targetParts, context).join('/')}`, [], followedLinks)
    }
    if (!resolved) return { error: `${path}: No such file or directory` }
    if (resolved.type === 'directory') return { error: `${path}: Is a directory` }
    return this.checkPerm(resolved, this.currentUser, 'write')
      ? {}
      : { error: `${path}: Permission denied` }
  }

  canDeleteFile(path: string, cwd: string[]): { error?: string } {
    const parts = this.resolvePath(path, cwd)
    const { node, parent, denied } = this.getNode(parts)
    if (denied) return { error: `rm: cannot remove '${path}': Permission denied` }
    if (!node) return { error: `rm: cannot remove '${path}': No such file or directory` }
    if (!parent) return { error: `rm: cannot remove '${path}': Is a directory` }
    if (!this.canRemove(parent, node)) return { error: `rm: cannot remove '${path}': Permission denied` }
    if (node.type === 'directory') return { error: `rm: cannot remove '${path}': Is a directory` }
    return {}
  }

  hasPermission(path: string, cwd: string[], mode: PermissionMode): boolean {
    const parts = this.resolvePath(path, cwd)
    const { node } = this.getNode(parts)
    const resolved = this.followSymlink(node, parts)
    return Boolean(resolved && this.checkPerm(resolved, this.currentUser, mode))
  }

  resolvePath(path: string, cwd: string[]): string[] {
    if (path.startsWith('/')) return this.resolve(path.slice(1).split('/').filter(Boolean), [])
    return this.resolve(path.split('/').filter(Boolean), cwd)
  }

  resolveLink(path: string, cwd: string[]): VNode | null {
    const parts = this.resolvePath(path, cwd)
    const { node } = this.getNode(parts)
    return this.followSymlink(node, parts)
  }

  readFile(path: string, cwd: string[]): { content: string; error?: string } {
    const parts = this.resolvePath(path, cwd)
    const { node, denied } = this.getNode(parts)
    if (denied) return { content: '', error: `cat: ${path}: Permission denied` }
    const resolved = this.followSymlink(node, parts)
    if (!resolved) return { content: '', error: `cat: ${path}: No such file or directory` }
    if (resolved.type === 'directory') return { content: '', error: `cat: ${path}: Is a directory` }
    if (!this.checkPerm(resolved, this.currentUser, 'read')) return { content: '', error: `cat: ${path}: Permission denied` }
    return { content: resolved.content ?? '' }
  }

  writeFile(path: string, cwd: string[], content: string, append = false, followedLinks = new Set<VNode>()): { error?: string } {
    const parts = this.resolvePath(path, cwd)
    const { node, parent, name, denied } = this.getNode(parts)
    if (denied) return { error: `${path}: Permission denied` }
    if (!parent) return { error: `Cannot write to root` }
    if (node) {
      const resolved = this.followSymlink(node, parts)
      if (!resolved && node.type === 'symlink' && node.target) {
        if (followedLinks.has(node)) return { error: `${path}: Too many levels of symbolic links` }
        followedLinks.add(node)
        const context = node.target.startsWith('/') ? [] : parts.slice(0, -1)
        const targetParts = node.target.startsWith('/')
          ? node.target.slice(1).split('/').filter(Boolean)
          : node.target.split('/').filter(Boolean)
        const target = `/${this.resolve(targetParts, context).join('/')}`
        return this.writeFile(target, [], content, append, followedLinks)
      }
      if (!resolved) return { error: `${path}: No such file or directory` }
      if (resolved.type === 'directory') return { error: `${path}: Is a directory` }
      if (!this.checkPerm(resolved, this.currentUser, 'write')) return { error: `${path}: Permission denied` }
      resolved.content = append ? (resolved.content ?? '') + content : content
      resolved.size = resolved.content.length
      resolved.mtime = new Date()
    } else {
      if (!this.checkPerm(parent, this.currentUser, 'write')) return { error: `${path}: Permission denied` }
      parent.children!.set(name, createVNode({ name, type: 'file', content, owner: this.currentUser, group: this.currentUser }))
    }
    return {}
  }

  createFile(path: string, cwd: string[], content = ''): { error?: string } {
    return this.writeFile(path, cwd, content)
  }

  touch(path: string, cwd: string[], mtime = new Date()): { error?: string } {
    const parts = this.resolvePath(path, cwd)
    const { node, denied } = this.getNode(parts)
    if (denied) return { error: `touch: cannot touch '${path}': Permission denied` }
    const resolved = this.followSymlink(node, parts)
    if (!resolved) return { error: `touch: cannot touch '${path}': No such file or directory` }
    if (
      this.currentUser !== 'root'
      && resolved.owner !== this.currentUser
      && !this.checkPerm(resolved, this.currentUser, 'write')
    ) {
      return { error: `touch: cannot touch '${path}': Permission denied` }
    }
    resolved.mtime = new Date(mtime)
    return {}
  }

  deleteFile(path: string, cwd: string[]): { error?: string } {
    const parts = this.resolvePath(path, cwd)
    const { node, parent, name, denied } = this.getNode(parts)
    if (denied) return { error: `rm: cannot remove '${path}': Permission denied` }
    if (!node) return { error: `rm: cannot remove '${path}': No such file or directory` }
    if (!parent) return { error: `rm: cannot remove '${path}': Is a directory` }
    if (!this.canRemove(parent, node)) return { error: `rm: cannot remove '${path}': Permission denied` }
    if (node.type === 'directory') return { error: `rm: cannot remove '${path}': Is a directory` }
    parent.children!.delete(name)
    return {}
  }

  createDirectory(path: string, cwd: string[]): { error?: string } {
    const parts = this.resolvePath(path, cwd)
    const { node, parent, name, denied } = this.getNode(parts)
    if (denied) return { error: `mkdir: cannot create directory '${path}': Permission denied` }
    if (!parent) return { error: `mkdir: cannot create directory '${path}': Permission denied` }
    if (node) return { error: `mkdir: cannot create directory '${path}': File exists` }
    if (!this.checkPerm(parent, this.currentUser, 'write')) return { error: `mkdir: cannot create directory '${path}': Permission denied` }
    parent.children!.set(name, createVNode({ name, type: 'directory', owner: this.currentUser, group: this.currentUser, permissions: 'rwxr-xr-x' }))
    return {}
  }

  deleteDirectory(path: string, cwd: string[], recursive = false): { error?: string } {
    const parts = this.resolvePath(path, cwd)
    const { node, parent, name, denied } = this.getNode(parts)
    if (denied) return { error: `rm: cannot remove '${path}': Permission denied` }
    if (!node) return { error: `rm: cannot remove '${path}': No such file or directory` }
    if (node.type !== 'directory') return { error: `rm: cannot remove '${path}': Not a directory` }
    if (!parent) return { error: `rm: cannot remove '${path}': Permission denied` }
    if (!this.canRemove(parent, node)) return { error: `rm: cannot remove '${path}': Permission denied` }
    if (!recursive && node.children!.size > 0) return { error: `rm: cannot remove '${path}': Directory not empty` }
    parent.children!.delete(name)
    return {}
  }

  listDirectory(path: string, cwd: string[]): { entries: VNode[]; error?: string } {
    const parts = this.resolvePath(path, cwd)
    const { node, denied } = this.getNode(parts)
    if (denied) return { entries: [], error: `ls: cannot access '${path}': Permission denied` }
    const resolved = this.followSymlink(node, parts)
    if (!resolved) return { entries: [], error: `ls: cannot access '${path}': No such file or directory` }
    if (resolved.type === 'file') {
      return { entries: [{ ...resolved, name: parts.at(-1) ?? resolved.name }], error: undefined }
    }
    if (!this.checkPerm(resolved, this.currentUser, 'read')) return { entries: [], error: `ls: cannot open directory '${path}': Permission denied` }
    const entries = Array.from(resolved.children!, ([name, child]) => ({ ...child, name })).sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1
      if (a.type !== 'directory' && b.type === 'directory') return 1
      return a.name.localeCompare(b.name)
    })
    return { entries }
  }

  stat(path: string, cwd: string[]): { node: VNode | null; error?: string } {
    const parts = this.resolvePath(path, cwd)
    const { node, denied } = this.getNode(parts)
    if (denied) return { node: null, error: `${path}: Permission denied` }
    return { node: this.followSymlink(node, parts) }
  }

  lstat(path: string, cwd: string[]): { node: VNode | null; error?: string } {
    const parts = this.resolvePath(path, cwd)
    const { node, denied } = this.getNode(parts)
    return denied ? { node: null, error: `${path}: Permission denied` } : { node }
  }

  chmod(path: string, cwd: string[], mode: string): { error?: string } {
    const parts = this.resolvePath(path, cwd)
    const { node, denied } = this.getNode(parts)
    if (denied) return { error: `chmod: cannot access '${path}': Permission denied` }
    const resolved = this.followSymlink(node, parts)
    if (!resolved) return { error: `chmod: cannot access '${path}': No such file or directory` }
    if (this.currentUser !== 'root' && resolved.owner !== this.currentUser) {
      return { error: `chmod: changing permissions of '${path}': Operation not permitted` }
    }
    const current = parsePermissions(resolved.permissions)
    const special = {
      setuid: resolved.permissions[2] === 's' || resolved.permissions[2] === 'S',
      setgid: resolved.permissions[5] === 's' || resolved.permissions[5] === 'S',
      sticky: resolved.permissions[8] === 't' || resolved.permissions[8] === 'T',
    }
    let owner = current.owner
    let group = current.group
    let other = current.other
    if (/^[0-7]{3,4}$/.test(mode)) {
      const m = parseInt(mode, 8)
      owner = (m & 0o700) >> 6
      group = (m & 0o070) >> 3
      other = m & 0o007
      special.setuid = Boolean(m & 0o4000)
      special.setgid = Boolean(m & 0o2000)
      special.sticky = Boolean(m & 0o1000)
    } else {
      const match = mode.match(/^([ugoa]*)([+-=])([rwxst]+)$/)
      if (!match) return { error: `chmod: invalid mode: '${mode}'` }
      const who = match[1] || 'a'
      const operation = match[2]
      const requested = match[3]
      let mask = 0
      if (requested.includes('r')) mask |= 4
      if (requested.includes('w')) mask |= 2
      if (requested.includes('x')) mask |= 1
      const apply = (value: number) => {
        if (operation === '+') return value | mask
        if (operation === '-') return value & ~mask
        return mask
      }
      if (who.includes('u') || who.includes('a')) owner = apply(owner)
      if (who.includes('g') || who.includes('a')) group = apply(group)
      if (who.includes('o') || who.includes('a')) other = apply(other)
      if (requested.includes('s')) {
        if (who.includes('u') || who.includes('a')) special.setuid = operation !== '-'
        if (who.includes('g') || who.includes('a')) special.setgid = operation !== '-'
      } else if (operation === '=' && (who.includes('u') || who.includes('a'))) {
        special.setuid = false
      }
      if (operation === '=' && (who.includes('g') || who.includes('a'))) special.setgid = false
      if (requested.includes('t') && (who.includes('o') || who.includes('a'))) {
        special.sticky = operation !== '-'
      } else if (operation === '=' && (who.includes('o') || who.includes('a'))) {
        special.sticky = false
      }
    }
    resolved.permissions = formatPermissions(owner, group, other, special)
    return {}
  }

  chown(path: string, cwd: string[], owner: string): { error?: string } {
    const parts = this.resolvePath(path, cwd)
    const { node, denied } = this.getNode(parts)
    if (denied) return { error: `chown: cannot access '${path}': Permission denied` }
    const resolved = this.followSymlink(node, parts)
    if (!resolved) return { error: `chown: cannot access '${path}': No such file or directory` }
    if (this.currentUser !== 'root') {
      return { error: `chown: changing ownership of '${path}': Operation not permitted` }
    }
    const [ownerName, groupName] = owner.split(':')
    if (!this.users.has(ownerName)) return { error: `chown: invalid user: '${ownerName}'` }
    if (groupName && !Array.from(this.users.values()).some(user => user.groups.includes(groupName))) {
      return { error: `chown: invalid group: '${groupName}'` }
    }
    resolved.owner = ownerName
    if (groupName) resolved.group = groupName
    return {}
  }

  symlink(target: string, linkPath: string, cwd: string[]): { error?: string } {
    const parts = this.resolvePath(linkPath, cwd)
    const { parent, name, denied } = this.getNode(parts)
    if (denied) return { error: `ln: failed to create symbolic link '${linkPath}': Permission denied` }
    if (!parent) return { error: `ln: failed to create symbolic link '${linkPath}': Permission denied` }
    if (parent.children!.has(name)) return { error: `ln: failed to create symbolic link '${linkPath}': File exists` }
    if (!this.checkPerm(parent, this.currentUser, 'write')) return { error: `ln: failed to create symbolic link '${linkPath}': Permission denied` }
    parent.children!.set(name, createVNode({ name, type: 'symlink', target, owner: this.currentUser, group: this.currentUser, permissions: 'rwxrwxrwx' }))
    return {}
  }

  hardlink(target: string, linkPath: string, cwd: string[]): { error?: string } {
    const targetParts = this.resolvePath(target, cwd)
    const targetResult = this.getNode(targetParts)
    if (targetResult.denied) return { error: `ln: failed to access '${target}': Permission denied` }
    if (!targetResult.node) return { error: `ln: failed to access '${target}': No such file or directory` }
    if (targetResult.node.type !== 'file') return { error: `ln: ${target}: hard link not allowed for this node type` }
    const linkParts = this.resolvePath(linkPath, cwd)
    const { parent, name, denied } = this.getNode(linkParts)
    if (denied || !parent || !this.checkPerm(parent, this.currentUser, 'write')) {
      return { error: `ln: failed to create hard link '${linkPath}': Permission denied` }
    }
    if (parent.children!.has(name)) return { error: `ln: failed to create hard link '${linkPath}': File exists` }
    // Directory entries intentionally share the same file node: content,
    // ownership, permissions, size, and mtime therefore change together.
    parent.children!.set(name, targetResult.node)
    return {}
  }

  copy(src: string, dst: string, cwd: string[], recursive = false, preserve = false): { error?: string } {
    const srcParts = this.resolvePath(src, cwd)
    const dstParts = this.resolvePath(dst, cwd)
    const { node: srcNode, denied: srcDenied } = this.getNode(srcParts)
    if (srcDenied) return { error: `cp: cannot stat '${src}': Permission denied` }
    if (!srcNode) return { error: `cp: cannot stat '${src}': No such file or directory` }
    const { node: dstNode, parent: dstParent, name: dstName, denied: dstDenied } = this.getNode(dstParts)
    if (dstDenied) return { error: `cp: cannot create regular file '${dst}': Permission denied` }
    if (!dstParent) return { error: `cp: cannot create regular file '${dst}': Permission denied` }
    const resolvedDstNode = dstNode?.type === 'symlink' ? this.followSymlink(dstNode, dstParts) : dstNode

    if (srcNode.type === 'directory') {
      if (!recursive) return { error: `cp: -r not specified; omitting directory '${src}'` }
      if (!this.checkPerm(srcNode, this.currentUser, 'read') || !this.checkPerm(srcNode, this.currentUser, 'execute')) {
        return { error: `cp: cannot open directory '${src}': Permission denied` }
      }
      const sourceName = srcParts.at(-1) ?? srcNode.name
      const targetParts = resolvedDstNode?.type === 'directory' ? [...dstParts, sourceName] : dstParts
      if (
        targetParts.length > srcParts.length &&
        srcParts.every((part, index) => targetParts[index] === part)
      ) {
        return { error: `cp: cannot copy a directory, '${src}', into itself, '${dst}'` }
      }
      const targetPath = `/${targetParts.join('/')}`
      const target = this.getNode(targetParts).node
      if (target && target.type !== 'directory') return { error: `cp: cannot overwrite non-directory '${dst}' with directory '${src}'` }
      if (!target) {
        const mkdirRes = this.createDirectory(targetPath, [])
        if (mkdirRes.error) return mkdirRes
      }
      for (const childName of srcNode.children!.keys()) {
        const childResult = this.copy(
          `/${[...srcParts, childName].join('/')}`,
          targetPath,
          [],
          true,
          preserve,
        )
        if (childResult.error) return childResult
      }
      if (preserve) {
        const copiedDirectory = this.getNode(targetParts).node
        if (!copiedDirectory) return { error: `cp: cannot preserve metadata for '${targetPath}'` }
        copiedDirectory.permissions = srcNode.permissions
        if (this.currentUser === 'root') {
          copiedDirectory.owner = srcNode.owner
          copiedDirectory.group = srcNode.group
        }
        copiedDirectory.mtime = new Date(srcNode.mtime)
      }
      return {}
    }

    const resolved = this.followSymlink(srcNode, srcParts)
    if (!resolved) return { error: `cp: cannot stat '${src}': No such file or directory` }
    if (!this.checkPerm(resolved, this.currentUser, 'read')) return { error: `cp: cannot open '${src}' for reading: Permission denied` }
    const content = resolved?.content ?? srcNode.content ?? ''
    if (dstNode?.type === 'symlink' && resolvedDstNode?.type !== 'directory') {
      const written = this.writeFile(dst, cwd, content)
      if (written.error) return { error: `cp: cannot create regular file '${dst}': ${written.error}` }
      if (preserve) {
        const copied = this.stat(dst, cwd).node
        if (!copied) return { error: `cp: cannot preserve metadata for '${dst}'` }
        copied.permissions = resolved.permissions
        if (this.currentUser === 'root') {
          copied.owner = resolved.owner
          copied.group = resolved.group
        }
        copied.mtime = new Date(resolved.mtime)
      }
      return {}
    }
    let actualDstParent = dstParent
    let actualDstName = dstName
    if (resolvedDstNode?.type === 'directory') {
      actualDstParent = resolvedDstNode
      actualDstName = srcParts.at(-1) ?? srcNode.name
    }
    if (!this.checkPerm(actualDstParent, this.currentUser, 'write')) return { error: `cp: cannot create regular file '${dst}': Permission denied` }
    const existing = actualDstParent.children!.get(actualDstName)
    if (existing && existing.type === 'directory') return { error: `cp: cannot overwrite directory '${dst}' with non-directory '${src}'` }
    if (existing && existing.type === 'file') {
      if (!this.checkPerm(existing, this.currentUser, 'write')) return { error: `cp: cannot create regular file '${dst}': Permission denied` }
      existing.content = content
      existing.size = content.length
      existing.mtime = new Date()
    } else {
      actualDstParent.children!.set(actualDstName, createVNode({ name: actualDstName, type: 'file', content, owner: this.currentUser, group: this.currentUser }))
    }
    if (preserve) {
      const copied = actualDstParent.children!.get(actualDstName)
      if (!copied) return { error: `cp: cannot preserve metadata for '${dst}'` }
      copied.permissions = resolved.permissions
      if (this.currentUser === 'root') {
        copied.owner = resolved.owner
        copied.group = resolved.group
      }
      copied.mtime = new Date(resolved.mtime)
    }
    return {}
  }

  move(src: string, dst: string, cwd: string[]): { error?: string } {
    const srcParts = this.resolvePath(src, cwd)
    const dstParts = this.resolvePath(dst, cwd)
    const { node: srcNode, parent: srcParent, name: srcName, denied: srcDenied } = this.getNode(srcParts)
    if (srcDenied) return { error: `mv: cannot stat '${src}': Permission denied` }
    if (!srcNode) return { error: `mv: cannot stat '${src}': No such file or directory` }
    if (!srcParent) return { error: `mv: cannot move '${src}': Permission denied` }
    const { node: dstNode, parent: dstParent, name: dstName, denied: dstDenied } = this.getNode(dstParts)
    if (dstDenied) return { error: `mv: cannot move to '${dst}': Permission denied` }
    if (!dstParent) return { error: `mv: cannot move to '${dst}': Permission denied` }
    const resolvedDstNode = dstNode?.type === 'symlink' ? this.followSymlink(dstNode, dstParts) : dstNode

    let actualDstParent = dstParent
    let actualDstName = dstName
    if (resolvedDstNode?.type === 'directory') {
      actualDstParent = resolvedDstNode
      actualDstName = srcName
    }
    const actualDstParts = resolvedDstNode?.type === 'directory' ? [...dstParts, srcName] : dstParts
    if (
      srcNode.type === 'directory' &&
      actualDstParts.length > srcParts.length &&
      srcParts.every((part, index) => actualDstParts[index] === part)
    ) {
      return { error: `mv: cannot move '${src}' to a subdirectory of itself, '${dst}'` }
    }
    if (!this.canRemove(srcParent, srcNode)) return { error: `mv: cannot move '${src}': Permission denied` }
    if (!this.checkPerm(actualDstParent, this.currentUser, 'write')) return { error: `mv: cannot move to '${dst}': Permission denied` }

    const existing = actualDstParent.children!.get(actualDstName)
    if (existing === srcNode) return {}
    if (existing && !this.canRemove(actualDstParent, existing)) return { error: `mv: cannot move to '${dst}': Permission denied` }
    if (existing?.type === 'directory' && srcNode.type !== 'directory') return { error: `mv: cannot overwrite directory '${dst}' with non-directory` }
    if (existing && existing.type !== 'directory' && srcNode.type === 'directory') return { error: `mv: cannot overwrite non-directory '${dst}' with directory` }
    if (existing?.type === 'directory' && existing.children!.size > 0) return { error: `mv: cannot overwrite '${dst}': Directory not empty` }
    const referencesBeforeMove = this.countNodeReferences(srcNode)
    srcParent.children!.delete(srcName)
    if (existing) actualDstParent.children!.delete(actualDstName)
    if (referencesBeforeMove <= 1) srcNode.name = actualDstName
    actualDstParent.children!.set(actualDstName, srcNode)
    return {}
  }

  private countNodeReferences(target: VNode): number {
    let count = 0
    const visit = (node: VNode) => {
      if (node.type !== 'directory') return
      for (const child of node.children!.values()) {
        if (child === target) count += 1
        if (child.type === 'directory') visit(child)
      }
    }
    visit(this.root)
    return count
  }

  getRoot(): VNode { return this.root }
}
