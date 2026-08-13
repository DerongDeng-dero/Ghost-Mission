import { classifyInvocation } from './report-capabilities.mjs'

const numericObjectivePattern = /^obj-\d+$/

function requiredObjectives(level) {
  return level.objectives.filter(objective => objective.required)
}

export function resolveCatalogChecks(level) {
  const checks = level.checks.map(check => ({ ...check }))
  const explicitlyBound = checks.filter(check => check.objectiveId !== undefined)
  if (explicitlyBound.length === checks.length) return checks
  if (explicitlyBound.length > 0) {
    throw new Error(`${level.id}: mixed explicit and legacy check bindings`)
  }

  const required = requiredObjectives(level)
  const skillObjectives = required.filter(objective => numericObjectivePattern.test(objective.id))
  const aggregateObjectives = required.filter(objective => !numericObjectivePattern.test(objective.id))
  const progressChecks = checks.filter(check => check.type !== 'no_red_command_used')
  const safetyChecks = checks.filter(check => check.type === 'no_red_command_used')
  if (skillObjectives.length !== progressChecks.length) {
    throw new Error(
      `${level.id}: cannot infer ${progressChecks.length} progress checks from ` +
        `${skillObjectives.length} required numeric objectives`,
    )
  }
  if (aggregateObjectives.length !== 1 || safetyChecks.length !== 1) {
    throw new Error(
      `${level.id}: legacy migration requires one aggregate objective and one safety check`,
    )
  }

  let progressIndex = 0
  return checks.map(check => ({
    ...check,
    objectiveId: check.type === 'no_red_command_used'
      ? aggregateObjectives[0].id
      : skillObjectives[progressIndex++].id,
  }))
}

export function getEffectiveActionRows(level, checks = resolveCatalogChecks(level)) {
  const objectivesById = new Map(level.objectives.map(objective => [objective.id, objective]))
  return checks
    .filter(check => check.type === 'command_used')
    .map(check => {
      const objective = objectivesById.get(check.objectiveId)
      let pattern = check.pattern?.trim() ?? ''
      const expected = objective?.label_en?.match(/^Master the use of (.+)$/i)?.[1]?.trim()
      if (
        expected
        && pattern
        && expected.toLocaleLowerCase().startsWith(`${pattern.toLocaleLowerCase()} `)
      ) {
        pattern = expected
      }
      return {
        objectiveId: check.objectiveId,
        objectiveLabelEn: objective?.label_en ?? check.objectiveId,
        objectiveLabelZh: objective?.label_zh ?? check.objectiveId,
        pattern,
        category: classifyInvocation(level.id, pattern),
      }
    })
}

function englishAction(row) {
  if (row.category === 'terminal') {
    return `terminal interaction \`${row.pattern}\``
  }
  if (row.category === 'syntax') {
    return `complete command using \`${row.pattern}\``
  }
  if (row.pattern.startsWith('-')) {
    return `use \`${row.pattern}\` with its command`
  }
  if (row.pattern === '.env') {
    return 'use the `.env` path'
  }
  return `run \`${row.pattern}\` with required context/operands`
}

function chineseAction(row) {
  if (row.category === 'terminal') {
    return `终端交互 \`${row.pattern}\``
  }
  if (row.category === 'syntax') {
    return `完整命令使用 \`${row.pattern}\``
  }
  if (row.pattern.startsWith('-')) {
    return `对应命令使用 \`${row.pattern}\``
  }
  if (row.pattern === '.env') {
    return '使用 `.env` 路径'
  }
  return `补齐上下文/参数后执行 \`${row.pattern}\``
}

export function renderGuidedSolution(level, actionRows = getEffectiveActionRows(level)) {
  if (actionRows.length === 0) {
    throw new Error(`${level.id}: cannot render an H5 checklist without command actions`)
  }
  const h3 = level.hints?.find(hint => hint.level === 3)
  const h4 = level.hints?.find(hint => hint.level === 4)
  if (!h3?.text_en || !h3?.text_zh || !h4?.text_en || !h4?.text_zh) {
    throw new Error(`${level.id}: guided H5 requires complete H3 and H4 context`)
  }
  return {
    text_en:
      'Guide only; H3/H4: ' +
      `${actionRows.map(englishAction).join('; ')}.`,
    text_zh:
      '仅引导，结合 H3/H4：' +
      `${actionRows.map(chineseAction).join('；')}。`,
  }
}
