import type { Hint } from './levels'

export interface HintState {
  revealed: Set<number>
  currentMaxLevel: number
}

export function createHintState(): HintState {
  return { revealed: new Set(), currentMaxLevel: 0 }
}

export function revealHint(state: HintState, level: number): HintState {
  const newRevealed = new Set(state.revealed)
  newRevealed.add(level)
  return { ...state, revealed: newRevealed, currentMaxLevel: Math.max(state.currentMaxLevel, level) }
}

export function getHintText(hints: Hint[], level: number, language: 'en' | 'zh' = 'en'): string | undefined {
  const h = hints.find(h => h.level === level)
  return h?.getText(language)
}

export function getHintLabel(hints: Hint[], level: number): string {
  return `Level ${level}`
}

export function getHintPenalty(_hints: Hint[], _level: number): number {
  void _hints
  void _level
  // Revealing any hint forfeits the single no-hints bonus. Additional hints
  // do not stack another penalty.
  return 5
}

export function isHintRevealed(state: HintState, level: number): boolean {
  return state.revealed.has(level)
}

export function getTotalPenalty(hints: Hint[], state: HintState): number {
  if (state.revealed.size === 0) return 0
  const firstLevel = state.revealed.values().next().value as number
  return getHintPenalty(hints, firstLevel)
}
