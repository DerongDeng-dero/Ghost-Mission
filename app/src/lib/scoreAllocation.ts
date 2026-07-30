/**
 * Split a non-negative integer total across a deterministic item order.
 *
 * The first `total % itemCount` items receive the remainder, so callers can
 * render integer per-item points without losing or inventing points.
 */
export function allocateIntegerPoints(total: number, itemCount: number): number[] {
  if (!Number.isSafeInteger(total) || total < 0) return []
  if (!Number.isSafeInteger(itemCount) || itemCount <= 0) return []

  const base = Math.floor(total / itemCount)
  const remainder = total % itemCount
  return Array.from(
    { length: itemCount },
    (_, index) => base + (index < remainder ? 1 : 0),
  )
}
