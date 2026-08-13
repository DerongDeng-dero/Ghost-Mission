import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentFile = fileURLToPath(import.meta.url)
const root = path.resolve(path.dirname(currentFile), '..')

export const AUDIT_POLICY = Object.freeze({
  auditReportVersion: 2,
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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

  if (observedTotal > 0) {
    const findings = vulnerabilities
      .map(([name, vulnerability]) => `${name}: ${vulnerability.severity}`)
      .sort()
    throw new Error(`Dependency audit must be clean; found ${findings.join(', ')}`)
  }

  return { metadata, vulnerabilityCount: 0 }
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

  const result = validateAuditReport(audit)
  console.log(
    `Audit policy OK: ${result.vulnerabilityCount} full-tree finding(s) across `
    + 'production, development, optional, and peer dependencies.',
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) main()
