import { readFile } from 'node:fs/promises'
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

const failures = []
const readme = await readFile(path.resolve(workspaceRoot, 'README.md'), 'utf8')
const packageJson = JSON.parse(await readFile(path.resolve(appRoot, 'package.json'), 'utf8'))
const levels = JSON.parse(await readFile(path.resolve(appRoot, 'src/data/all_levels.json'), 'utf8'))
const content = await getContentMetrics()
const commands = await getCommandMetrics()
const achievements = await getAchievementMetrics()
const assets = await getAssetMetrics()
const engineValidationSource = await readFile(
  path.resolve(appRoot, 'scripts', 'validate-engine.mjs'),
  'utf8',
)
const engineRegressionChecks = engineValidationSource.match(/^test\(/gm)?.length ?? 0
const genericH5Levels = levels.filter(level =>
  level.hints?.some(hint => hint.level === 5 && /^Full solution:\s*Use '/i.test(hint.text_en ?? '')),
).length
const fullyBoundLevels = levels.filter(level =>
  level.checks?.every(check => typeof check.objectiveId === 'string' && check.objectiveId.length > 0),
).length

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
expectIncludes('generic H5 debt', `${genericH5Levels}/${content.levels} 关的第五级提示仍是通用模板`)
expectIncludes('explicit objective binding debt', `只有 ${fullyBoundLevels}/${content.levels} 关的所有 check 显式绑定`)

for (const script of [
  'dev', 'validate:content', 'validate:engine', 'report:capabilities', 'check',
  'lint', 'build', 'verify', 'preview', 'audit:prod', 'audit:all',
]) {
  expectIncludes(`documented script ${script}`, `npm run ${script}`)
}

for (const staleClaim of [
  '201/221', '201 / 221', '551 个必做目标', '59 个可选目标',
  '96 项回归', '均为 0 vulnerabilities', 'npm audit 清零',
  '24 个未支持 pattern', '余下 20 关',
]) {
  expectAbsent('stale README metric', staleClaim)
}

if (failures.length > 0) {
  console.error(`README validation failed with ${failures.length} issue(s):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(
    'README OK: source metrics, screenshots, versions, capability boundaries, and known debts match.',
  )
}
