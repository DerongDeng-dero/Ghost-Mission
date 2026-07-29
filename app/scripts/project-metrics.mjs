import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

export const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const workspaceRoot = path.resolve(appRoot, '..')

export async function loadTypescriptModule(relativePath) {
  const filePath = path.resolve(appRoot, relativePath)
  const source = await readFile(filePath, 'utf8')
  const output = ts.transpileModule(source, {
    fileName: filePath,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  })

  const errors = (output.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  if (errors.length > 0) {
    throw new Error('Unable to evaluate ' + relativePath + ': TypeScript transpilation failed.')
  }

  const encoded = Buffer.from(output.outputText).toString('base64')
  return import('data:text/javascript;base64,' + encoded)
}

export async function getContentMetrics() {
  const levels = JSON.parse(
    await readFile(path.resolve(appRoot, 'src/data/all_levels.json'), 'utf8'),
  )
  const modeCounts = Object.create(null)
  let objectives = 0
  let requiredObjectives = 0
  let checks = 0
  let hints = 0

  for (const level of levels) {
    modeCounts[level.mode] = (modeCounts[level.mode] ?? 0) + 1
    objectives += level.objectives?.length ?? 0
    requiredObjectives += level.objectives?.filter((objective) => objective.required).length ?? 0
    checks += level.checks?.length ?? 0
    hints += level.hints?.length ?? 0
  }

  return {
    levels: levels.length,
    chapters: new Set(levels.map((level) => level.chapter_id)).size,
    modes: modeCounts,
    objectives,
    requiredObjectives,
    optionalObjectives: objectives - requiredObjectives,
    checks,
    hints,
  }
}

export async function getCommandMetrics() {
  const { commands } = await loadTypescriptModule('src/data/commands.ts')
  const links = new Set()
  let unresolvedRelated = 0
  let staticMissionReferences = 0

  for (const command of commands) {
    staticMissionReferences += command.missions.length
    for (const relatedName of command.related) {
      const related = commands.find(
        (candidate) => candidate.name === relatedName || candidate.id === relatedName,
      )
      if (related) {
        links.add([command.id, related.id].sort().join('\0'))
      } else {
        unresolvedRelated++
      }
    }
  }

  return {
    commands: commands.length,
    domains: new Set(commands.map((command) => command.domain)).size,
    links: links.size,
    unresolvedRelated,
    staticMissionReferences,
  }
}

export async function getAchievementMetrics() {
  const { achievements } = await loadTypescriptModule('src/data/achievements.ts')
  return { achievements: achievements.length }
}

export async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name)
      return entry.isDirectory() ? listFiles(fullPath) : [fullPath]
    }),
  )
  return nested.flat()
}

export async function getAssetMetrics() {
  const publicDirectory = path.resolve(appRoot, 'public')
  const docsDirectory = path.resolve(appRoot, 'docs/images')
  const publicFiles = await listFiles(publicDirectory)
  const docsFiles = await listFiles(docsDirectory)

  const sizes = await Promise.all(publicFiles.map(async (file) => (await stat(file)).size))
  const docsSizes = await Promise.all(docsFiles.map(async (file) => (await stat(file)).size))

  return {
    publicFiles,
    docsFiles,
    publicBytes: sizes.reduce((sum, size) => sum + size, 0),
    docsBytes: docsSizes.reduce((sum, size) => sum + size, 0),
  }
}

export function formatMiB(bytes) {
  return (bytes / 1024 / 1024).toFixed(1)
}
