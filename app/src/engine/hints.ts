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

export function getHintText(hints: Hint[], level: number): string | undefined {
  const h = hints.find(h => h.level === level)
  return h?.getText('en')
}

export function getHintLabel(hints: Hint[], level: number): string {
  return `Level ${level}`
}

export function getHintPenalty(_hints: Hint[], _level: number): number {
  void _hints
  void _level
  // Penalty is fixed: each hint reduces perfect score bonus
  return 5
}

export function isHintRevealed(state: HintState, level: number): boolean {
  return state.revealed.has(level)
}

export function getTotalPenalty(hints: Hint[], state: HintState): number {
  let total = 0
  state.revealed.forEach(level => {
    total += getHintPenalty(hints, level)
  })
  return total
}
