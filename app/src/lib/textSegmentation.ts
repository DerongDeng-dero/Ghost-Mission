export function splitTextIntoCodePoints(text: string): string[] {
  return Array.from(text)
}

export interface Utf16Truncation {
  text: string
  wasTruncated: boolean
  totalCodeUnits: number
}

/**
 * Enforce a UTF-16 code-unit budget without creating an unpaired surrogate.
 * If the exact boundary bisects a valid surrogate pair, it backs off one unit.
 */
export function truncateTextToUtf16Limit(text: string, maxCodeUnits: number): Utf16Truncation {
  if (!Number.isSafeInteger(maxCodeUnits) || maxCodeUnits < 0) {
    throw new RangeError('maxCodeUnits must be a non-negative safe integer')
  }

  if (text.length <= maxCodeUnits) {
    return { text, wasTruncated: false, totalCodeUnits: text.length }
  }

  let end = maxCodeUnits
  const lastIncluded = text.charCodeAt(end - 1)
  const firstExcluded = text.charCodeAt(end)
  const boundarySplitsPair = lastIncluded >= 0xD800
    && lastIncluded <= 0xDBFF
    && firstExcluded >= 0xDC00
    && firstExcluded <= 0xDFFF
  if (boundarySplitsPair) end -= 1

  return {
    text: text.slice(0, end),
    wasTruncated: true,
    totalCodeUnits: text.length,
  }
}

export const MAX_TERMINAL_PASTE_SUBMISSIONS = 100

export interface TerminalInputChunkPlan {
  accepted: boolean
  submissionCount: number
  characters: string[]
}

/**
 * Preflight a complete xterm input chunk before dispatching any characters.
 * CRLF is one submitted line; a rejected chunk deliberately exposes no
 * characters so callers cannot accidentally execute a partial paste.
 */
export function planTerminalInputChunk(
  text: string,
  maxSubmissions: number = MAX_TERMINAL_PASTE_SUBMISSIONS,
): TerminalInputChunkPlan {
  if (!Number.isSafeInteger(maxSubmissions) || maxSubmissions < 0) {
    throw new RangeError('maxSubmissions must be a non-negative safe integer')
  }

  const sourceCharacters = splitTextIntoCodePoints(text)
  const characters: string[] = []
  let submissionCount = 0
  for (let index = 0; index < sourceCharacters.length; index += 1) {
    const character = sourceCharacters[index]
    if (character === '\r') {
      submissionCount += 1
      characters.push('\r')
      if (sourceCharacters[index + 1] === '\n') index += 1
    } else if (character === '\n') {
      submissionCount += 1
      characters.push('\r')
    } else {
      characters.push(character)
    }
  }

  if (submissionCount > maxSubmissions) {
    return { accepted: false, submissionCount, characters: [] }
  }
  return { accepted: true, submissionCount, characters }
}

export function segmentTextForTypewriter(text: string): string[] {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return Array.from(segmenter.segment(text), ({ segment }) => segment)
  }

  // Older runtimes may not expose Intl.Segmenter. Code-point iteration still
  // guarantees that the animation never renders an unpaired surrogate.
  return splitTextIntoCodePoints(text)
}
