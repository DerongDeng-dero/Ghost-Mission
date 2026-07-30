function readField(record, compactKey, fullKey, fallback) {
  return record?.[compactKey] ?? record?.[fullKey] ?? fallback
}

function effectiveCommandPatterns(level) {
  const objectives = readField(level, 'o', 'objectives', [])
  const checks = readField(level, 'c', 'checks', [])
  const legacySkillObjectives = objectives.filter((objective) =>
    /^obj-\d+$/.test(readField(objective, 'i', 'id', '')),
  )
  let progressCheckIndex = 0
  const patterns = []

  for (const check of checks) {
    const type = readField(check, 't', 'type', 'command_used')
    let pattern = readField(check, 'p', 'pattern', '')
    const objective = type === 'no_red_command_used'
      ? undefined
      : legacySkillObjectives[progressCheckIndex++]

    if (type !== 'command_used') continue
    if (objective) {
      const label = readField(objective, 'l', 'label_en', readField(objective, '', 'label', ''))
      const expected = label.match(/^Master the use of (.+)$/i)?.[1]?.trim()
      if (
        expected &&
        pattern &&
        expected.toLocaleLowerCase().startsWith(`${pattern.toLocaleLowerCase()} `)
      ) {
        pattern = expected
      }
    }

    const normalized = pattern.trim()
    if (normalized) patterns.push(normalized)
  }

  return patterns
}

export function buildProgressCatalog(levels) {
  return levels.map((level) => ({
    i: level.id,
    te: readField(level, 'te', 'title_en', level.id),
    tz: readField(level, 'tz', 'title_zh', readField(level, 'te', 'title_en', level.id)),
    c: readField(level, 'ci', 'chapter_id', 'unknown'),
    cte: readField(level, 'cte', 'chapter_title_en', 'Unknown'),
    ctz: readField(level, 'ctz', 'chapter_title_zh', 'Unknown'),
    cs: readField(level, 'cs', 'chapter_skill', ''),
    m: readField(level, 'm', 'mode', 'academy'),
    d: readField(level, 'd', 'difficulty', 1),
    et: readField(level, 'et', 'estimated_time', ''),
    s: readField(level, 'sk', 'skills', []),
    r: readField(level, 'rl', 'risk_level', 'green'),
    a: effectiveCommandPatterns(level),
  }))
}

export function serializeProgressCatalog(levels) {
  return JSON.stringify(buildProgressCatalog(levels), null, 2) + '\n'
}

export function serializeKnownMissionIds(levels) {
  const ids = levels.map((level) => level.id)
  return [
    '// Generated from all_levels.json. Run npm run generate:progress-catalog after catalog changes.',
    'export const KNOWN_MISSION_IDS = new Set<string>(',
    `${JSON.stringify(ids, null, 2)},`,
    ')',
    '',
  ].join('\n')
}
