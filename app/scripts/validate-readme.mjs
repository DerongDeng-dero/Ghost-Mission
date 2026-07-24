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
const content = await getContentMetrics()
const commands = await getCommandMetrics()
const achievements = await getAchievementMetrics()
const assets = await getAssetMetrics()
const engineValidationSource = await readFile(
  path.resolve(appRoot, 'scripts', 'validate-engine.mjs'),
  'utf8',
)
const engineRegressionChecks = engineValidationSource.match(/^test\(/gm)?.length ?? 0

function expect(label, condition, expected) {
  if (!condition) failures.push(label + ': expected ' + expected)
}

function majorMinor(versionRange) {
  return versionRange.match(/\d+\.\d+/)?.[0]
}

expect('level count', readme.includes('**' + content.levels + '**'), content.levels)
expect('chapter count', readme.includes('**' + content.chapters + '**'), content.chapters)
expect(
  'mode counts',
  readme.includes(
    content.modes.academy + ' Academy / ' +
      content.modes.operation + ' Operation / ' +
      content.modes.boss + ' Boss / ' +
      content.modes.nightmare + ' Nightmare',
  ),
  JSON.stringify(content.modes),
)
expect('objective count', readme.includes('**' + content.objectives + '**'), content.objectives)
expect(
  'required and optional objectives',
  readme.includes(content.requiredObjectives + ' 个必做目标，' + content.optionalObjectives + ' 个可选目标'),
  content.requiredObjectives + ' required and ' + content.optionalObjectives + ' optional',
)
expect(
  'hint count',
  readme.includes('**' + content.hints.toLocaleString('en-US') + '**'),
  content.hints,
)
expect('command count', readme.includes('**' + commands.commands + '**'), commands.commands)
expect('command domain count', readme.includes(commands.domains + ' 个技能领域'), commands.domains)
expect(
  'command graph metrics',
  readme.includes(commands.commands + ' nodes / ' + commands.links + ' links'),
  commands.commands + ' nodes / ' + commands.links + ' links',
)
expect(
  'achievement count',
  readme.includes('**' + achievements.achievements + '**'),
  achievements.achievements,
)
expect(
  'public asset size',
  readme.includes(formatMiB(assets.publicBytes) + ' MB') ||
    readme.includes(formatMiB(assets.publicBytes) + ' MiB'),
  formatMiB(assets.publicBytes) + ' MB/MiB',
)

for (const imagePath of assets.docsFiles) {
  const reference = './app/' + path.relative(appRoot, imagePath).replaceAll('\\', '/')
  expect('README image ' + path.basename(imagePath), readme.includes(reference), reference)
}

const versionChecks = [
  ['project version', 'version-' + packageJson.version],
  ['React badge', 'React-' + majorMinor(packageJson.dependencies.react)],
  ['TypeScript badge', 'TypeScript-' + majorMinor(packageJson.devDependencies.typescript)],
  ['Vite badge', 'Vite-' + majorMinor(packageJson.devDependencies.vite)],
]
for (const [label, token] of versionChecks) {
  expect(label, readme.includes(token), token)
}
expect(
  'Node engine lower range',
  readme.includes('^20.19.0') && readme.includes('>=22.12.0'),
  packageJson.engines.node,
)
expect(
  'engine regression count',
  readme.includes(engineRegressionChecks + ' 项回归'),
  engineRegressionChecks + ' 项回归',
)
expect(
  'strict executable level count',
  readme.includes('**' + capabilityMetrics.executableLevels + ' / ' + capabilityMetrics.levels + '**'),
  capabilityMetrics.executableLevels + '/' + capabilityMetrics.levels,
)
expect(
  'capability boundary metrics',
  readme.includes(
    capabilityMetrics.unsupportedPatterns + ' 个未支持 pattern 影响 ' +
      capabilityMetrics.blockedLevels + ' 关、' +
      capabilityMetrics.unsupportedChecks + ' 条检查',
  ),
  JSON.stringify(capabilityMetrics),
)

for (const script of ['dev', 'check', 'lint', 'build', 'preview', 'report:capabilities']) {
  expect('documented script ' + script, readme.includes('npm run ' + script), 'npm run ' + script)
}

if (failures.length > 0) {
  console.error('README validation failed with ' + failures.length + ' issue(s):')
  for (const failure of failures) console.error('- ' + failure)
  process.exitCode = 1
} else {
  console.log(
    'README OK: content, graph, achievements, screenshots, versions, and asset totals match source.',
  )
}
