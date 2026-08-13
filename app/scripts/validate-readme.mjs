import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import {
  appRoot,
  workspaceRoot,
  getAchievementMetrics,
  getAssetMetrics,
  getCommandMetrics,
  getContentMetrics,
  formatMiB,
} from './project-metrics.mjs'
import { capabilityMetrics } from './report-capabilities.mjs'
import { AUDIT_POLICY } from './audit-policy.mjs'

const failures = []
const readme = await readFile(path.resolve(workspaceRoot, 'README.md'), 'utf8')
const packageJson = JSON.parse(await readFile(path.resolve(appRoot, 'package.json'), 'utf8'))
const levels = JSON.parse(await readFile(path.resolve(appRoot, 'src/data/all_levels.json'), 'utf8'))
const ghostGuideModelSource = await readFile(
  path.resolve(appRoot, 'src/components/guide/ghostGuideModel.ts'),
  'utf8',
)
const content = await getContentMetrics()
const commands = await getCommandMetrics()
const achievements = await getAchievementMetrics()
const assets = await getAssetMetrics()
const engineValidationSource = await readFile(
  path.resolve(appRoot, 'scripts', 'validate-engine.mjs'),
  'utf8',
)
const engineRegressionChecks = engineValidationSource.match(/^test\(/gm)?.length ?? 0
const auditPolicyValidationSource = await readFile(
  path.resolve(appRoot, 'scripts', 'validate-audit-policy.mjs'),
  'utf8',
)
const auditPolicyRegressionChecks = auditPolicyValidationSource.match(/^test\(/gm)?.length ?? 0
const verifiedH5Levels = levels.filter(level =>
  level.hints?.some(hint => hint.level === 5 && hint.solution_type === 'verified_command'),
).length
const guidedH5Levels = levels.filter(level =>
  level.hints?.some(hint => hint.level === 5 && hint.solution_type === 'guided_actions'),
).length
const fullyBoundLevels = levels.filter(level =>
  level.checks?.every(check => typeof check.objectiveId === 'string' && check.objectiveId.length > 0),
).length
const fullyBoundChecks = levels.reduce(
  (count, level) => count + level.checks.filter(
    check => typeof check.objectiveId === 'string' && check.objectiveId.length > 0,
  ).length,
  0,
)

let ghostGuideMetrics = null
try {
  const output = execFileSync(
    process.execPath,
    [path.resolve(appRoot, 'scripts/validate-ghost-guide.mjs')],
    { cwd: appRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  )
  const match = output.match(
    /Ghost guide OK: (\d+) bilingual quips and (\d+) adversarial checks passed\./,
  )
  if (!match) {
    failures.push('ghost guide validation: success metrics were not reported')
  } else {
    ghostGuideMetrics = {
      quips: Number(match[1]),
      checks: Number(match[2]),
    }
  }
} catch (error) {
  failures.push(
    `ghost guide validation: ${error instanceof Error ? error.message : String(error)}`,
  )
}

function readGhostModelConstant(name) {
  const match = ghostGuideModelSource.match(
    new RegExp(`export const ${name} = ([0-9_]+)`),
  )
  if (!match) {
    failures.push(`ghost guide model: missing numeric export ${name}`)
    return null
  }
  return Number(match[1].replaceAll('_', ''))
}

const ghostTiming = {
  firstMin: readGhostModelConstant('FIRST_AUTO_QUIP_MIN_DELAY_MS'),
  firstMax: readGhostModelConstant('FIRST_AUTO_QUIP_MAX_DELAY_MS'),
  nextMin: readGhostModelConstant('AUTO_QUIP_MIN_DELAY_MS'),
  nextMax: readGhostModelConstant('AUTO_QUIP_MAX_DELAY_MS'),
  recentWindow: readGhostModelConstant('RECENT_QUIP_WINDOW'),
}

if (commands.unresolvedRelated !== 0) {
  failures.push(`command graph: ${commands.unresolvedRelated} related references do not resolve`)
}
if (commands.staticMissionReferences !== 0) {
  failures.push(`command atlas: ${commands.staticMissionReferences} legacy mission labels remain exported`)
}

function expectIncludes(label, token) {
  if (!readme.includes(token)) failures.push(`${label}: expected ${JSON.stringify(token)}`)
}

function expectAbsent(label, token) {
  if (readme.includes(token)) failures.push(`${label}: stale claim ${JSON.stringify(token)}`)
}

function majorMinor(versionRange) {
  return versionRange.match(/\d+\.\d+/)?.[0]
}

expectIncludes('level count', `| 任务定义 | **${content.levels}**`)
expectIncludes('chapter count', `| 学习章节 | **${content.chapters}**`)
expectIncludes(
  'mode counts',
  `${content.modes.academy} Academy / ${content.modes.operation} Operation / ` +
    `${content.modes.boss} Boss / ${content.modes.nightmare} Nightmare`,
)
expectIncludes(
  'objective counts',
  `| 目标 | **${content.objectives}** | ${content.requiredObjectives} 个必做目标，` +
    `${content.optionalObjectives} 个可选目标 |`,
)
expectIncludes('hint count', `| 五级提示 | **${content.hints.toLocaleString('en-US')}**`)
expectIncludes('command count', `| 命令图谱 | **${commands.commands}**`)
expectIncludes('command domains', `覆盖 ${commands.domains} 个技能领域`)
expectIncludes('command graph metrics', `${commands.commands} nodes / ${commands.links} links`)
expectIncludes('achievement count', `| 成就定义 | **${achievements.achievements}**`)
expectIncludes('public asset size', `${formatMiB(assets.publicBytes)} MiB`)

const expectedPublicAssetMiB = Number(formatMiB(assets.publicBytes))
const publicAssetMetricPattern = /`?public\/`?[^\r\n]*?([0-9]+(?:\.[0-9]+)?)\s*MiB/gi
for (const [lineIndex, line] of readme.split(/\r?\n/).entries()) {
  publicAssetMetricPattern.lastIndex = 0
  let match
  while ((match = publicAssetMetricPattern.exec(line)) !== null) {
    const documentedMiB = Number(match[1])
    if (documentedMiB !== expectedPublicAssetMiB) {
      failures.push(
        `public asset size: README line ${lineIndex + 1} reports ${match[1]} MiB, ` +
          `expected ${formatMiB(assets.publicBytes)} MiB`,
      )
    }
  }
}

for (const imagePath of assets.docsFiles) {
  const reference = './app/' + path.relative(appRoot, imagePath).replaceAll('\\', '/')
  expectIncludes(`README image ${path.basename(imagePath)}`, reference)
}

for (const [label, token] of [
  ['project version', `version-${packageJson.version}`],
  ['React badge', `React-${majorMinor(packageJson.dependencies.react)}`],
  ['TypeScript badge', `TypeScript-${majorMinor(packageJson.devDependencies.typescript)}`],
  ['Vite badge', `Vite-${majorMinor(packageJson.devDependencies.vite)}`],
]) {
  expectIncludes(label, token)
}
expectIncludes('Node engine range', `Node.js \`${packageJson.engines.node}\``)
expectIncludes('engine regression count', `${engineRegressionChecks} 项回归`)
expectIncludes('audit policy regression count', `${auditPolicyRegressionChecks} 个离线策略回归`)
const documentedRegressionCounts = [...readme.matchAll(/(\d+)\s*项回归/g)]
for (const match of documentedRegressionCounts) {
  const documentedCount = Number(match[1])
  if (documentedCount !== engineRegressionChecks) {
    const line = readme.slice(0, match.index).split('\n').length
    failures.push(
      `engine regression count: README line ${line} reports ${documentedCount}, ` +
        `expected ${engineRegressionChecks}`,
    )
  }
}
expectIncludes(
  'invocation mapping level count',
  `**${capabilityMetrics.executableLevels} / ${capabilityMetrics.levels}**`,
)
expectIncludes(
  'invocation mapping details',
  `${capabilityMetrics.commandChecks} 条命令检查、${capabilityMetrics.uniquePatterns} 种 pattern`,
)
expectIncludes(
  'unmapped capability boundary',
  `${capabilityMetrics.unsupportedPatterns} 个未支持 pattern 影响 ` +
    `${capabilityMetrics.blockedLevels} 关、${capabilityMetrics.unsupportedChecks} 条检查`,
)
expectIncludes(
  'check type boundary',
  `${content.checks} 条检查全部由 ${capabilityMetrics.commandChecks} 条 \`command_used\` 与 ` +
    `${content.checks - capabilityMetrics.commandChecks} 条 \`no_red_command_used\``,
)
expectIncludes('verified H5 boundary', `${verifiedH5Levels} 个 \`verified_command\``)
expectIncludes('guided H5 boundary', `${guidedH5Levels} 个 \`guided_actions\``)
expectIncludes(
  'explicit objective binding levels',
  `${fullyBoundLevels}/${content.levels} 关均为显式目标绑定`,
)
expectIncludes(
  'explicit objective binding checks',
  `${fullyBoundChecks}/${content.checks} 条 check`,
)

if (ghostGuideMetrics) {
  expectIncludes('ghost guide content row', `| 幽灵点评 | **${ghostGuideMetrics.quips}**`)
  expectIncludes('ghost guide bilingual catalogue', `${ghostGuideMetrics.quips} 条中英双语语录`)
  expectIncludes('ghost guide adversarial checks', `${ghostGuideMetrics.checks} 个对抗性检查`)

  const readmeLines = readme.split(/\r?\n/)
  for (const [lineIndex, line] of readmeLines.entries()) {
    for (const pattern of [
      /(\d+)\s*条中英双语语录/g,
      /(\d+)\s*条双语语录/g,
      /已通过，(\d+)\s*条语录/g,
      /幽灵点评\s*\|\s*\*\*(\d+)\*\*/g,
    ]) {
      pattern.lastIndex = 0
      let match
      while ((match = pattern.exec(line)) !== null) {
        if (Number(match[1]) !== ghostGuideMetrics.quips) {
          failures.push(
            `ghost guide quip count: README line ${lineIndex + 1} reports ${match[1]}, ` +
              `expected ${ghostGuideMetrics.quips}`,
          )
        }
      }
    }
    if (line.includes('幽灵') || line.includes('validate:ghost-guide')) {
      const checkPattern = /(\d+)\s*个对抗性检查/g
      let checkMatch
      while ((checkMatch = checkPattern.exec(line)) !== null) {
        if (Number(checkMatch[1]) !== ghostGuideMetrics.checks) {
          failures.push(
            `ghost guide check count: README line ${lineIndex + 1} reports ${checkMatch[1]}, ` +
              `expected ${ghostGuideMetrics.checks}`,
          )
        }
      }
    }
  }
}

if (Object.values(ghostTiming).every(value => value !== null)) {
  expectIncludes(
    'ghost guide timing contract',
    `首句等待 ${ghostTiming.firstMin / 1000}–${ghostTiming.firstMax / 1000} 秒，` +
      `后续 ${ghostTiming.nextMin / 1000}–${ghostTiming.nextMax / 1000} 秒`,
  )
  expectIncludes('ghost guide repeat window', `最近 ${ghostTiming.recentWindow} 条不会重复`)
}

for (const sourceName of [
  'GhostGuide3D', 'GhostAvatar3D', 'GhostAvatarFallback', 'ghostGuideModel',
]) {
  expectIncludes(`documented ghost source ${sourceName}`, sourceName)
}
expectIncludes('ghost guide evidence boundary', '不是幽灵在真实浏览器中的视觉回归或完整交互 E2E')

for (const script of [
  'dev', 'generate:progress-catalog', 'validate:content', 'validate:engine',
  'validate:progress', 'validate:settings', 'validate:ghost-guide', 'validate:audit-policy',
  'report:capabilities',
  'validate:assets', 'validate:dependencies', 'validate:readme', 'validate:build',
  'check', 'lint', 'build', 'verify', 'preview', 'audit:prod', 'audit:all',
  'audit:policy', 'release:check',
]) {
  if (typeof packageJson.scripts[script] !== 'string') {
    failures.push(`package scripts: missing ${script}`)
  }
  expectIncludes(`documented script ${script}`, `npm run ${script}`)
}

if (!packageJson.scripts.check?.includes('npm run validate:audit-policy')) {
  failures.push('package scripts: check must include the offline audit-policy regression')
}
if (!packageJson.scripts.check?.includes('npm run validate:settings')) {
  failures.push('package scripts: check must include the settings contract regression')
}
if (!packageJson.scripts.check?.includes('npm run validate:ghost-guide')) {
  failures.push('package scripts: check must include the ghost guide contract regression')
}
if (packageJson.scripts['release:check'] !== 'npm run verify && npm run audit:policy') {
  failures.push('package scripts: release:check must run verify before the live audit policy')
}
expectIncludes('audit registry', AUDIT_POLICY.registry)
expectIncludes('audit dependency scope', '全部生产、开发、可选与 peer 依赖')
expectIncludes('zero-vulnerability policy', '零漏洞、无 allowlist')
expectIncludes('current audit result', '0 个漏洞记录')

for (const staleClaim of [
  '201/221', '201 / 221', '551 个必做目标', '59 个可选目标',
  '96 项回归', '均为 0 vulnerabilities', 'npm audit 清零',
  '24 个未支持 pattern', '余下 20 关', '188/221', '2/221',
  '2026-09-30', '临时 allowlist', 'Three.js 只在用户与幽灵交互时加载',
  '静态回退壳；交互后再加载 Three.js', '按交互加载 Three.js',
]) {
  expectAbsent('stale README metric', staleClaim)
}

if (failures.length > 0) {
  console.error(`README validation failed with ${failures.length} issue(s):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(
    'README OK: source metrics, ghost-guide contracts, screenshots, versions, capability boundaries, and known debts match.',
  )
}
