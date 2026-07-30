import { readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const currentFile = fileURLToPath(import.meta.url)
const root = path.resolve(path.dirname(currentFile), '..')

export const AUDIT_POLICY = Object.freeze({
  auditReportVersion: 2,
  advisoryUrl: 'https://github.com/advisories/GHSA-qwww-vcr4-c8h2',
  packages: Object.freeze(['react-router', 'react-router-dom']),
  severity: 'high',
  expiresAt: '2026-09-30T00:00:00.000Z',
  registry: 'https://registry.npmjs.org/',
})

export const AUDIT_ARGUMENTS = Object.freeze([
  'audit',
  '--json',
  '--package-lock-only',
  '--include=prod',
  '--include=dev',
  '--include=optional',
  '--include=peer',
  `--registry=${AUDIT_POLICY.registry}`,
])

const severityNames = Object.freeze(['info', 'low', 'moderate', 'high', 'critical'])
const allowedPackageSet = new Set(AUDIT_POLICY.packages)
const sourceExtensionPattern = /\.(?:js|jsx|mjs|cjs|ts|tsx)$/i

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactAdvisoryEntry(entry) {
  return isPlainObject(entry)
    && entry.name === 'react-router'
    && entry.dependency === 'react-router'
    && entry.severity === AUDIT_POLICY.severity
    && entry.url === AUDIT_POLICY.advisoryUrl
}

function exactAdvisoryRoot(name, vulnerability) {
  return name === 'react-router'
    && isPlainObject(vulnerability)
    && vulnerability.severity === AUDIT_POLICY.severity
    && vulnerability.fixAvailable === false
    && Array.isArray(vulnerability.via)
    && vulnerability.via.length > 0
    && vulnerability.via.every(exactAdvisoryEntry)
}

function metadataCounts(metadata) {
  if (!isPlainObject(metadata)) {
    throw new Error('npm audit returned an unusable report: missing vulnerability metadata')
  }

  const counts = {}
  for (const severity of severityNames) {
    const value = metadata[severity]
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`npm audit metadata has an invalid ${severity} count`)
    }
    counts[severity] = value
  }
  if (!Number.isSafeInteger(metadata.total) || metadata.total < 0) {
    throw new Error('npm audit metadata has an invalid total count')
  }
  return { ...counts, total: metadata.total }
}

export function validateAuditReport(audit) {
  if (!isPlainObject(audit) || audit.error) {
    const detail = isPlainObject(audit?.error)
      ? audit.error.summary ?? audit.error.detail
      : audit?.error
    throw new Error(`npm audit returned an unusable report: ${detail || 'invalid report object'}`)
  }
  if (audit.auditReportVersion !== AUDIT_POLICY.auditReportVersion) {
    throw new Error(
      `npm audit report version ${String(audit.auditReportVersion)} is unsupported; `
      + `expected ${AUDIT_POLICY.auditReportVersion}`,
    )
  }
  if (!isPlainObject(audit.vulnerabilities)) {
    throw new Error('npm audit returned an unusable report: missing vulnerability records')
  }

  const vulnerabilities = Object.entries(audit.vulnerabilities)
  const metadata = metadataCounts(audit.metadata?.vulnerabilities)
  const observedCounts = Object.fromEntries(severityNames.map((severity) => [severity, 0]))

  for (const [name, vulnerability] of vulnerabilities) {
    if (!isPlainObject(vulnerability)) {
      throw new Error(`npm audit record ${name} is malformed`)
    }
    if (!severityNames.includes(vulnerability.severity)) {
      throw new Error(`npm audit record ${name} has an unknown severity`)
    }
    observedCounts[vulnerability.severity] += 1
  }

  const observedTotal = vulnerabilities.length
  for (const severity of severityNames) {
    if (metadata[severity] !== observedCounts[severity]) {
      throw new Error(
        `npm audit metadata mismatch for ${severity}: `
        + `${metadata[severity]} reported, ${observedCounts[severity]} record(s)`,
      )
    }
  }
  if (
    metadata.total !== observedTotal
    || metadata.total !== severityNames.reduce((sum, severity) => sum + metadata[severity], 0)
  ) {
    throw new Error(
      `npm audit metadata total mismatch: ${metadata.total} reported, ${observedTotal} record(s)`,
    )
  }

  const approvedRoots = new Set(
    vulnerabilities
      .filter(([name, vulnerability]) => exactAdvisoryRoot(name, vulnerability))
      .map(([name]) => name),
  )
  const disallowed = []
  const allowed = []

  for (const [name, vulnerability] of vulnerabilities) {
    if (vulnerability.severity !== 'high' && vulnerability.severity !== 'critical') continue

    const via = Array.isArray(vulnerability.via) ? vulnerability.via : []
    const viaIsAllowed = via.length > 0 && via.every((entry) => {
      if (typeof entry === 'string') {
        return entry === 'react-router' && approvedRoots.has(entry)
      }
      return exactAdvisoryEntry(entry)
    })
    if (
      allowedPackageSet.has(name)
      && vulnerability.severity === AUDIT_POLICY.severity
      && viaIsAllowed
      && vulnerability.fixAvailable === false
    ) {
      allowed.push(name)
    } else {
      disallowed.push(`${name}: ${vulnerability.severity}`)
    }
  }

  const sortedAllowed = [...allowed].sort()
  const expectedAllowed = [...AUDIT_POLICY.packages].sort()
  if (
    sortedAllowed.length !== 0
    && (
      sortedAllowed.length !== expectedAllowed.length
      || sortedAllowed.some((name, index) => name !== expectedAllowed[index])
    )
  ) {
    disallowed.push(`partial or malformed exception set: ${sortedAllowed.join(', ') || 'none'}`)
  }

  if (disallowed.length > 0) {
    throw new Error(`Unapproved high/critical dependency findings: ${disallowed.join(', ')}`)
  }

  return { allowed: sortedAllowed, metadata, vulnerabilityCount: observedTotal }
}

export function assertExceptionCurrent(now = Date.now()) {
  const expiry = Date.parse(AUDIT_POLICY.expiresAt)
  if (!Number.isFinite(expiry) || now >= expiry) {
    throw new Error(`React Router RSC advisory exception expired at ${AUDIT_POLICY.expiresAt}`)
  }
}

export function isAuditedSourceFile(fileName) {
  return sourceExtensionPattern.test(fileName)
}

function forbiddenApiName(name) {
  return name.includes('RSC') || name.startsWith('unstable_') || name === 'createRequestHandler'
}

function collectNamedImports(sourceFile, moduleName, importedName) {
  const locals = new Set()
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== moduleName
      || statement.importClause?.isTypeOnly
      || !statement.importClause?.namedBindings
      || !ts.isNamedImports(statement.importClause.namedBindings)
    ) continue

    for (const element of statement.importClause.namedBindings.elements) {
      if (element.isTypeOnly) continue
      const imported = element.propertyName?.text ?? element.name.text
      if (imported === importedName) locals.add(element.name.text)
    }
  }
  return locals
}

function containsJsxTag(node, localNames) {
  let found = false
  function visit(child) {
    if (found) return
    if (
      (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child))
      && ts.isIdentifier(child.tagName)
      && localNames.has(child.tagName.text)
    ) {
      found = true
      return
    }
    ts.forEachChild(child, visit)
  }
  visit(node)
  return found
}

function validateMainRouter(mainSource, fileName = 'main.tsx') {
  const sourceFile = ts.createSourceFile(fileName, mainSource, ts.ScriptTarget.Latest, true)
  const hashRouterLocals = collectNamedImports(
    sourceFile,
    'react-router-dom',
    'HashRouter',
  )
  const createRootLocals = collectNamedImports(sourceFile, 'react-dom/client', 'createRoot')
  if (hashRouterLocals.size === 0 || createRootLocals.size === 0) {
    throw new Error(
      'The advisory exception requires createRoot and HashRouter imports from their official modules',
    )
  }

  const rootVariables = new Set()
  function isCreateRootCall(node) {
    return ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && createRootLocals.has(node.expression.text)
  }
  function collectRootVariables(node) {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && isCreateRootCall(node.initializer)
    ) {
      rootVariables.add(node.name.text)
    }
    ts.forEachChild(node, collectRootVariables)
  }
  collectRootVariables(sourceFile)

  let rendersHashRouter = false
  function findRender(node) {
    if (rendersHashRouter) return
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'render'
      && node.arguments.length > 0
    ) {
      const receiver = node.expression.expression
      const isReactRoot = isCreateRootCall(receiver)
        || (ts.isIdentifier(receiver) && rootVariables.has(receiver.text))
      if (isReactRoot && containsJsxTag(node.arguments[0], hashRouterLocals)) {
        rendersHashRouter = true
        return
      }
    }
    ts.forEachChild(node, findRender)
  }
  findRender(sourceFile)

  if (!rendersHashRouter) {
    throw new Error(
      'The advisory exception requires the createRoot(...).render(...) tree to contain HashRouter',
    )
  }
}

export function validateClientArchitecture(sourceEntries) {
  const entries = sourceEntries.filter((entry) => isAuditedSourceFile(entry.name))
  const mainEntry = entries.find((entry) => entry.name.replaceAll('\\', '/') === 'main.tsx')
  if (!mainEntry) throw new Error('The advisory exception requires src/main.tsx')

  const forbiddenReferences = []
  for (const entry of entries) {
    const sourceFile = ts.createSourceFile(
      entry.name,
      entry.source,
      ts.ScriptTarget.Latest,
      true,
    )
    function visit(node) {
      if (ts.isIdentifier(node) && forbiddenApiName(node.text)) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
        forbiddenReferences.push(`${entry.name}:${position.line + 1}:${node.text}`)
      } else if (
        ts.isStringLiteral(node)
        && ts.isElementAccessExpression(node.parent)
        && node.parent.argumentExpression === node
        && forbiddenApiName(node.text)
      ) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
        forbiddenReferences.push(`${entry.name}:${position.line + 1}:${node.text}`)
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }

  if (forbiddenReferences.length > 0) {
    throw new Error(
      'The temporary advisory exception forbids RSC/server handler APIs: '
      + forbiddenReferences.join(', '),
    )
  }
  validateMainRouter(mainEntry.source, mainEntry.name)
}

function readSourceEntries() {
  const sourceRoot = path.join(root, 'src')
  return readdirSync(sourceRoot, { recursive: true })
    .filter((entry) => typeof entry === 'string' && isAuditedSourceFile(entry))
    .map((entry) => ({
      name: entry,
      source: readFileSync(path.join(sourceRoot, entry), 'utf8'),
    }))
}

function main() {
  const npmCli = process.env.npm_execpath
  if (!npmCli) {
    throw new Error('audit:policy must be run through npm so the exact npm CLI can be reused')
  }

  const auditRun = spawnSync(process.execPath, [npmCli, ...AUDIT_ARGUMENTS], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  })

  if (auditRun.error) {
    throw new Error(`npm audit could not start: ${auditRun.error.message}`)
  }
  if (auditRun.signal || ![0, 1].includes(auditRun.status)) {
    const detail = auditRun.stderr.trim() || `exit ${auditRun.status ?? 'unknown'}`
    throw new Error(`npm audit terminated unexpectedly: ${auditRun.signal ?? detail}`)
  }

  let audit
  try {
    audit = JSON.parse(auditRun.stdout)
  } catch {
    const detail = auditRun.stderr.trim() || auditRun.stdout.trim() || `exit ${auditRun.status}`
    throw new Error(`npm audit did not return valid JSON: ${detail}`)
  }

  assertExceptionCurrent()
  const result = validateAuditReport(audit)
  validateClientArchitecture(readSourceEntries())

  console.log(
    `Audit policy OK: ${result.vulnerabilityCount} full-tree finding(s); `
    + `${result.allowed.length} exact RSC-only package findings temporarily allowed; `
    + '0 unknown high/critical.',
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) main()
