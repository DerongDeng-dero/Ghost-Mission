import assert from 'node:assert/strict'
import {
  AUDIT_ARGUMENTS,
  AUDIT_POLICY,
  validateAuditReport,
} from './audit-policy.mjs'

let checks = 0

function test(name, callback) {
  try {
    callback()
    checks += 1
  } catch (error) {
    error.message = `${name}: ${error.message}`
    throw error
  }
}

function metadataFor(vulnerabilities) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 }
  for (const vulnerability of Object.values(vulnerabilities)) {
    counts[vulnerability.severity] += 1
    counts.total += 1
  }
  return counts
}

function report(vulnerabilities) {
  return {
    auditReportVersion: AUDIT_POLICY.auditReportVersion,
    vulnerabilities,
    metadata: { vulnerabilities: metadataFor(vulnerabilities) },
  }
}

test('audit command is full-tree, lockfile-only, and registry-pinned', () => {
  assert.ok(AUDIT_ARGUMENTS.includes('--package-lock-only'))
  for (const dependencyType of ['prod', 'dev', 'optional', 'peer']) {
    assert.ok(AUDIT_ARGUMENTS.includes(`--include=${dependencyType}`))
  }
  assert.ok(AUDIT_ARGUMENTS.includes(`--registry=${AUDIT_POLICY.registry}`))
  assert.equal(AUDIT_ARGUMENTS.some((argument) => argument.startsWith('--omit')), false)
})

test('an empty audit report is accepted', () => {
  assert.equal(validateAuditReport(report({})).vulnerabilityCount, 0)
})

test('every npm severity fails the zero-finding policy', () => {
  for (const severity of ['info', 'low', 'moderate', 'high', 'critical']) {
    assert.throws(
      () => validateAuditReport(report({ fixture: { severity, via: ['fixture'] } })),
      new RegExp(`fixture: ${severity}`),
    )
  }
})

test('metadata cannot hide a vulnerability record', () => {
  const audit = report({ fixture: { severity: 'high', via: ['fixture'] } })
  audit.metadata.vulnerabilities.high = 0
  audit.metadata.vulnerabilities.total = 0
  assert.throws(() => validateAuditReport(audit), /metadata mismatch for high/)
})

test('metadata cannot invent a vulnerability record', () => {
  const audit = report({})
  audit.metadata.vulnerabilities.moderate = 1
  audit.metadata.vulnerabilities.total = 1
  assert.throws(() => validateAuditReport(audit), /metadata mismatch for moderate/)
})

test('unexpected audit report versions fail closed', () => {
  const audit = report({})
  audit.auditReportVersion = 3
  assert.throws(() => validateAuditReport(audit), /report version 3 is unsupported/)
})

test('registry and malformed reports fail closed', () => {
  assert.throws(() => validateAuditReport(null), /invalid report object/)
  assert.throws(
    () => validateAuditReport({ error: { summary: 'registry unavailable' } }),
    /registry unavailable/,
  )
  const malformed = report({ fixture: { severity: 'unknown' } })
  assert.throws(() => validateAuditReport(malformed), /unknown severity/)
})

console.log(`Audit policy regression OK: ${checks} checks passed.`)
