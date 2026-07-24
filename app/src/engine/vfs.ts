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
  const match = perm.match(/^([rwx-]{3})([rwx-]{3})([rwx-]{3})$/)
  if (!match) return { owner: 0, group: 0, other: 0 }
  const parseTriplet = (s: string) => {
    let v = 0
    if (s[0] === 'r') v |= 4
    if (s[1] === 'w') v |= 2
    if (s[2] === 'x') v |= 1
    return v
  }
  return { owner: parseTriplet(match[1]), group: parseTriplet(match[2]), other: parseTriplet(match[3]) }
}

function permToString(n: number): string {
  let s = ''
  s += n & 4 ? 'r' : '-'
  s += n & 2 ? 'w' : '-'
  s += n & 1 ? 'x' : '-'
  return s
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
    const dirs = [
      '/bin', '/etc', '/home', '/home/ghost', '/home/ghost/projects',
      '/srv', '/srv/neonmall', '/srv/neonmall/logs', '/srv/neonmall/src',
      '/tmp', '/var', '/var/log', '/var/www',
      '/usr', '/usr/bin', '/usr/local',
    ]
    for (const d of dirs) {
      this.mkdirp(d, 'root', 'root', 'rwxr-xr-x')
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

  private getNode(parts: string[]): { node: VNode | null; parent: VNode | null; name: string } {
    if (parts.length === 0) return { node: this.root, parent: null, name: '' }
    let parent: VNode = this.root
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]
      if (!parent.children) return { node: null, parent: null, name: parts[parts.length - 1] }
      const next = parent.children.get(p)
      if (!next || next.type !== 'directory') return { node: null, parent: null, name: parts[parts.length - 1] }
      parent = next
    }
    const name = parts[parts.length - 1]
    const node = parent.children?.get(name) ?? null
    return { node, parent, name }
  }

  private followSymlink(node: VNode | null): VNode | null {
    if (!node) return null
    if (node.type === 'symlink' && node.target) {
      const parts = node.target.startsWith('/') ? node.target.slice(1).split('/') : node.target.split('/')
      const resolved = this.resolve(parts, [])
      return this.getNode(resolved).node
    }
    return node
  }

  private checkPerm(node: VNode, user: string, mode: PermissionMode): boolean {
    const userInfo = this.users.get(user) ?? { uid: 9999, groups: [] }
    const perm = parsePermissions(node.permissions)
    if (user === 'root') return true
    let mask = 0
    if (mode === 'read') mask = 4
    else if (mode === 'write') mask = 2
    else mask = 1

    if (node.owner === user) return (perm.owner & mask) !== 0
    if (userInfo.groups.includes(node.group)) return (perm.group & mask) !== 0
    return (perm.other & mask) !== 0
  }

  getCurrentUser(): string { return this.currentUser }
  setCurrentUser(u: string) { this.currentUser = u }

  resolvePath(path: string, cwd: string[]): string[] {
    if (path.startsWith('/')) return this.resolve(path.slice(1).split('/').filter(Boolean), [])
    return this.resolve(path.split('/').filter(Boolean), cwd)
  }

  resolveLink(path: string, cwd: string[]): VNode | null {
    const parts = this.resolvePath(path, cwd)
    const { node } = this.getNode(parts)
    return this.followSymlink(node)
  }

  readFile(path: string, cwd: string[]): { content: string; error?: string } {
    const parts = this.resolvePath(path, cwd)
    const { node } = this.getNode(parts)
    const resolved = this.followSymlink(node)
    if (!resolved) return { content: '', error: `cat: ${path}: No such file or directory` }
    if (resolved.type === 'directory') return { content: '', error: `cat: ${path}: Is a directory` }
    if (!this.checkPerm(resolved, this.currentUser, 'read')) return { content: '', error: `cat: ${path}: Permission denied` }
    return { content: resolved.content ?? '' }
  }

  writeFile(path: string, cwd: string[], content: string, append = false): { error?: string } {
    const parts = this.resolvePath(path, cwd)
    const { node, parent, name } = this.getNode(parts)
    if (!parent) return { error: `Cannot write to root` }
    if (!this.checkPerm(parent, this.currentUser, 'write')) return { error: `mkdir: cannot create directory '${path}': Permission denied` }
    if (node) {
      if (node.type === 'directory') return { error: `${path}: Is a directory` }
      if (!this.checkPerm(node, this.currentUser, 'write')) return { error: `${path}: Permission denied` }
      node.content = append ? (node.content ?? '') + content : content
      node.size = node.content.length
      node.mtime = new Date()
    } else {
      parent.children!.set(name, createVNode({ name, type: 'file', content, owner: this.currentUser, group: this.currentUser }))
    }
    return {}
  }

  createFile(path: string, cwd: string[], content = ''): { error?: string } {
    return this.writeFile(path, cwd, content)
  }

  deleteFile(path: string, cwd: string[]): { error?: string } {
    const parts = this.resolvePath(path, cwd)
    const { node, parent, name } = this.getNode(parts)
    if (!node) return { error: `rm: cannot remove '${path}': No such file or directory` }
    if (!parent) return { error: `rm: cannot remove '${path}': Is a directory` }
    if (!this.checkPerm(parent, this.currentUser, 'write')) return { error: `rm: cannot remove '${path}': Permission denied` }
    if (node.type === 'directory') return { error: `rm: cannot remove '${path}': Is a directory` }
    parent.children!.delete(name)
    return {}
  }

  createDirectory(path: string, cwd: string[]): { error?: string } {
    const parts = this.resolvePath(path, cwd)
    const { node, parent, name } = this.getNode(parts)
    if (!parent) return { error: `mkdir: cannot create directory '${path}': Permission denied` }
    if (node) return { error: `mkdir: cannot create directory '${path}': File exists` }
    if (!this.checkPerm(parent, this.currentUser, 'write')) return { error: `mkdir: cannot create directory '${path}': Permission denied` }
    parent.children!.set(name, createVNode({ name, type: 'directory', owner: this.currentUser, group: this.currentUser, permissions: 'rwxr-xr-x' }))
    return {}
  }

  deleteDirectory(path: string, cwd: string[], recursive = false): { error?: string } {
    const parts = this.resolvePath(path, cwd)
    const { node, parent, name } = this.getNode(parts)
    if (!node) return { error: `rm: cannot remove '${path}': No such file or directory` }
    if (node.type !== 'directory') return { error: `rm: cannot remove '${path}': Not a directory` }
    if (!this.checkPerm(parent!, this.currentUser, 'write')) return { error: `rm: cannot remove '${path}': Permission denied` }
    if (!recursive && node.children!.size > 0) return { error: `rm: cannot remove '${path}': Directory not empty` }
    parent!.children!.delete(name)
    return {}
  }

  listDirectory(path: string, cwd: string[]): { entries: VNode[]; error?: string } {
    const parts = this.resolvePath(path, cwd)
    const { node } = this.getNode(parts)
    const resolved = this.followSymlink(node)
    if (!resolved) return { entries: [], error: `ls: cannot access '${path}': No such file or directory` }
    if (resolved.type === 'file') return { entries: [resolved], error: undefined }
    if (!this.checkPerm(resolved, this.currentUser, 'read')) return { entries: [], error: `ls: cannot open directory '${path}': Permission denied` }
    const entries = Array.from(resolved.children!.values()).sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1
      if (a.type !== 'directory' && b.type === 'directory') return 1
      return a.name.localeCompare(b.name)
    })
    return { entries }
  }

  stat(path: string, cwd: string[]): { node: VNode | null; error?: string } {
    const parts = this.resolvePath(path, cwd)
    const { node } = this.getNode(parts)
    return { node: this.followSymlink(node) }
  }

  chmod(path: string, cwd: string[], mode: string): { error?: string } {
    const parts = this.resolvePath(path, cwd)
    const { node } = this.getNode(parts)
    const resolved = this.followSymlink(node)
    if (!resolved) return { error: `chmod: cannot access '${path}': No such file or directory` }
    let perm = resolved.permissions
    if (/^[0-7]{3,4}$/.test(mode)) {
      const m = parseInt(mode, 8)
      const o = (m & 0o700) >> 6
      const g = (m & 0o070) >> 3
      const ot = m & 0o007
      perm = permToString(o) + permToString(g) + permToString(ot)
    } else {
      const match = mode.match(/^([ugoa]+)([+-=])([rwx]+)$/)
      if (!match) return { error: `chmod: invalid mode: '${mode}'` }
    }
    resolved.permissions = perm
    return {}
  }

  chown(path: string, cwd: string[], owner: string): { error?: string } {
    const parts = this.resolvePath(path, cwd)
    const { node } = this.getNode(parts)
    const resolved = this.followSymlink(node)
    if (!resolved) return { error: `chown: cannot access '${path}': No such file or directory` }
    resolved.owner = owner
    return {}
  }

  symlink(target: string, linkPath: string, cwd: string[]): { error?: string } {
    const parts = this.resolvePath(linkPath, cwd)
    const { parent, name } = this.getNode(parts)
    if (!parent) return { error: `ln: failed to create symbolic link '${linkPath}': Permission denied` }
    if (parent.children!.has(name)) return { error: `ln: failed to create symbolic link '${linkPath}': File exists` }
    parent.children!.set(name, createVNode({ name, type: 'symlink', target, owner: this.currentUser, group: this.currentUser, permissions: 'rwxrwxrwx' }))
    return {}
  }

  copy(src: string, dst: string, cwd: string[], recursive = false): { error?: string } {
    const srcParts = this.resolvePath(src, cwd)
    const dstParts = this.resolvePath(dst, cwd)
    const { node: srcNode } = this.getNode(srcParts)
    if (!srcNode) return { error: `cp: cannot stat '${src}': No such file or directory` }
    const { node: dstNode, parent: dstParent, name: dstName } = this.getNode(dstParts)
    if (!dstParent) return { error: `cp: cannot create regular file '${dst}': Permission denied` }

    if (srcNode.type === 'directory') {
      if (!recursive) return { error: `cp: -r not specified; omitting directory '${src}'` }
      const mkdirRes = this.createDirectory(dst, cwd)
      if (mkdirRes.error && !dstNode) return mkdirRes
      for (const childName of srcNode.children!.keys()) {
        this.copy(srcParts.concat(childName).join('/'), dstParts.concat(childName).join('/'), cwd, true)
      }
      return {}
    }

    const resolved = this.followSymlink(srcNode)
    const content = resolved?.content ?? srcNode.content ?? ''
    let actualDstParent = dstParent
    let actualDstName = dstName
    if (dstNode && dstNode.type === 'directory') {
      actualDstParent = dstNode
      actualDstName = srcNode.name
    }
    if (!this.checkPerm(actualDstParent, this.currentUser, 'write')) return { error: `cp: cannot create regular file '${dst}': Permission denied` }
    const existing = actualDstParent.children!.get(actualDstName)
    if (existing && existing.type === 'file') {
      existing.content = content
      existing.size = content.length
      existing.mtime = new Date()
    } else {
      actualDstParent.children!.set(actualDstName, createVNode({ name: actualDstName, type: 'file', content, owner: this.currentUser, group: this.currentUser }))
    }
    return {}
  }

  move(src: string, dst: string, cwd: string[]): { error?: string } {
    const srcParts = this.resolvePath(src, cwd)
    const dstParts = this.resolvePath(dst, cwd)
    const { node: srcNode, parent: srcParent, name: srcName } = this.getNode(srcParts)
    if (!srcNode) return { error: `mv: cannot stat '${src}': No such file or directory` }
    if (!srcParent) return { error: `mv: cannot move '${src}': Permission denied` }
    const { parent: dstParent, name: dstName } = this.getNode(dstParts)
    if (!dstParent) return { error: `mv: cannot move to '${dst}': Permission denied` }

    let actualDstParent = dstParent
    let actualDstName = dstName
    const dstNode = dstParent.children!.get(dstName)
    if (dstNode && dstNode.type === 'directory') {
      actualDstParent = dstNode
      actualDstName = srcName
    }
    if (!this.checkPerm(srcParent, this.currentUser, 'write')) return { error: `mv: cannot move '${src}': Permission denied` }
    if (!this.checkPerm(actualDstParent, this.currentUser, 'write')) return { error: `mv: cannot move to '${dst}': Permission denied` }

    srcParent.children!.delete(srcName)
    const existing = actualDstParent.children!.get(actualDstName)
    if (existing) actualDstParent.children!.delete(actualDstName)
    actualDstParent.children!.set(actualDstName, srcNode)
    return {}
  }

  getRoot(): VNode { return this.root }
}
