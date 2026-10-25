import type { StateVector } from './types'

/** does `a` contain everything in `b`? */
export function svCovers(a: StateVector, b: StateVector): boolean {
  for (const c in b) if ((a[c] ?? 0) < b[c]) return false
  return true
}

/** how many clocks `a` has that `b` doesn't */
export function svDiffCount(a: StateVector, b: StateVector): number {
  let n = 0
  for (const c in a) n += Math.max(0, a[c] - (b[c] ?? 0))
  return n
}

export function svMerge(a: StateVector, b: StateVector): StateVector {
  const out = { ...a }
  for (const c in b) out[c] = Math.max(out[c] ?? 0, b[c])
  return out
}
