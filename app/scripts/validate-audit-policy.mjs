import assert from 'node:assert/strict'
import {
  AUDIT_ARGUMENTS,
  AUDIT_POLICY,
  assertExceptionCurrent,
  isAuditedSourceFile,
  validateAuditReport,
  validateClientArchitecture,
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

function exactAdvisory() {
  return {
    source: 1124282,
    name: 'react-router',
    dependency: 'react-router',
    title: 'React Router RSC advisory fixture',
    url: AUDIT_POLICY.advisoryUrl,
    severity: AUDIT_POLICY.severity,
    range: '>=7.12.0 <8.3.0',
  }
}

function allowedVulnerabilities() {
  return {
    'react-router': {
      severity: 'high',
      via: [exactAdvisory()],
      fixAvailable: false,
    },
    'react-router-dom': {
      severity: 'high',
      via: ['react-router'],
      fixAvailable: false,
    },
  }
}

const validMain = `
  import { createRoot } from 'react-dom/client'
  import { HashRouter as AppRouter } from 'react-router-dom'
  const root = createRoot(document.getElementById('root'))
  root.render(<AppRouter><main /></AppRouter>)
`

test('audit command is full-tree, lockfile-only, and registry-pinned', () => {
  assert.ok(AUDIT_ARGUMENTS.includes('--package-lock-only'))
  for (const dependencyType of ['prod', 'dev', 'optional', 'peer']) {
    assert.ok(AUDIT_ARGUMENTS.includes(`--include=${dependencyType}`))
  }
  assert.ok(AUDIT_ARGUMENTS.includes(`--registry=${AUDIT_POLICY.registry}`))
  assert.equal(AUDIT_ARGUMENTS.some((argument) => argument.startsWith('--omit')), false)
})

test('empty audit report is allowed', () => {
  assert.deepEqual(validateAuditReport(report({})).allowed, [])
})

test('the complete exact advisory pair is temporarily allowed', () => {
  assert.deepEqual(
    validateAuditReport(report(allowedVulnerabilities())).allowed,
    ['react-router', 'react-router-dom'],
  )
})

test('metadata cannot hide a high vulnerability record', () => {
  const audit = report({})
  audit.metadata.vulnerabilities.high = 1
  audit.metadata.vulnerabilities.total = 1
  assert.throws(() => validateAuditReport(audit), /metadata mismatch for high/)
})

test('string via cannot stand in for a missing validated root advisory', () => {
  assert.throws(
    () => validateAuditReport(report({
      'react-router-dom': {
        severity: 'high',
        via: ['react-router'],
        fixAvailable: false,
      },
    })),
    /Unapproved high\/critical/,
  )
})

test('a lookalike advisory URL cannot enter the exception set', () => {
  const vulnerabilities = allowedVulnerabilities()
  vulnerabilities['react-router'].via[0].url = 'https://github.com/advisories/GHSA-not-the-approved-advisory'
  assert.throws(
    () => validateAuditReport(report(vulnerabilities)),
    /Unapproved high\/critical/,
  )
})

test('a partial exception set is rejected', () => {
  const vulnerabilities = allowedVulnerabilities()
  delete vulnerabilities['react-router-dom']
  assert.throws(
    () => validateAuditReport(report(vulnerabilities)),
    /partial or malformed exception set/,
  )
})

test('an unknown high vulnerability is rejected', () => {
  assert.throws(
    () => validateAuditReport(report({
      lodash: { severity: 'high', via: ['prototype-pollution'], fixAvailable: false },
    })),
    /lodash: high/,
  )
})

test('unexpected audit report versions fail closed', () => {
  const audit = report({})
  audit.auditReportVersion = 3
  assert.throws(() => validateAuditReport(audit), /report version 3 is unsupported/)
})

test('the exception rejects the exact expiry instant', () => {
  const expiry = Date.parse(AUDIT_POLICY.expiresAt)
  assert.doesNotThrow(() => assertExceptionCurrent(expiry - 1))
  assert.throws(() => assertExceptionCurrent(expiry), /exception expired/)
})

test('all executable JavaScript and TypeScript extensions are scanned', () => {
  for (const extension of ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx']) {
    assert.equal(isAuditedSourceFile(`module.${extension}`), true)
  }
  assert.equal(isAuditedSourceFile('README.md'), false)
})

test('the rendered tree must use an imported HashRouter', () => {
  validateClientArchitecture([{ name: 'main.tsx', source: validMain }])
  assert.throws(
    () => validateClientArchitecture([{
      name: 'main.tsx',
      source: `
        // HashRouter was used by the old app.
        import { createRoot } from 'react-dom/client'
        import { BrowserRouter } from 'react-router-dom'
        createRoot(document.getElementById('root')).render(<BrowserRouter />)
      `,
    }]),
    /HashRouter imports|contain HashRouter/,
  )
})

test('RSC APIs in JSX files are rejected while comments do not trigger the guard', () => {
  validateClientArchitecture([
    { name: 'main.tsx', source: `${validMain}\n// unstable_RSCStaticRouter is intentionally absent.` },
  ])
  assert.throws(
    () => validateClientArchitecture([
      { name: 'main.tsx', source: validMain },
      {
        name: 'server.jsx',
        source: `import { unstable_RSCStaticRouter } from 'react-router'`,
      },
    ]),
    /server\.jsx:1:unstable_RSCStaticRouter/,
  )
})

console.log(`Audit policy regression OK: ${checks} checks passed.`)
