/**
 * Base-location selection on a precomputed time matrix.
 *
 *   times[c][d]  seconds from candidate site c to demand point d (Infinity = cannot serve)
 *   weights[d]   importance of demand point d (1, or population)
 *
 * Objective 'coverage' — maximum covering location problem (Church & ReVelle 1974):
 *   choose p sites maximising Σ weights[d] over points with min_c times[c][d] ≤ target.
 * Objective 'mean-time' — p-median flavour: minimise the weighted mean of
 *   min(time, penalty), so unserved points count as `penalty` seconds.
 *
 * Method: greedy addition followed by vertex interchange (Teitz & Bart 1968). This is a
 * heuristic. Greedy alone guarantees ≥ 63 % of the optimal coverage; interchange usually closes
 * most of the gap, but the result is NOT a proven global optimum.
 */
export type Objective = 'coverage' | 'mean-time'

export interface OptimizeInput {
  times: ArrayLike<number>[]
  weights: ArrayLike<number>
  targetS: number
  /** number of sites to choose in addition to `fixed` */
  p: number
  /** candidate indices that are already in the solution and may not be removed */
  fixed?: number[]
  objective: Objective
  /** seconds charged for an unserved point under 'mean-time' */
  penaltyS?: number
}

export interface OptimizeStep {
  candidate: number
  coveredWeight: number
  gainWeight: number
  meanTimeS: number
}

export interface OptimizeResult {
  chosen: number[]
  /** greedy trajectory: result after adding the 1st, 2nd … site */
  steps: OptimizeStep[]
  coveredWeight: number
  totalWeight: number
  meanTimeS: number
  swaps: number
  method: string
}

interface Score {
  covered: number
  mean: number
}

export function scoreSolution(input: OptimizeInput, chosen: number[]): Score {
  const { times, weights, targetS } = input
  const penalty = input.penaltyS ?? 3600
  let covered = 0
  let sum = 0
  let total = 0
  for (let d = 0; d < weights.length; d++) {
    let best = Infinity
    for (const c of chosen) if (times[c][d] < best) best = times[c][d]
    const w = weights[d]
    total += w
    if (best <= targetS) covered += w
    sum += w * Math.min(best, penalty)
  }
  return { covered, mean: total > 0 ? sum / total : 0 }
}

/** a is better than b under the objective (ties broken by the other criterion). */
function better(obj: Objective, a: Score, b: Score): boolean {
  const eps = 1e-9
  if (obj === 'coverage') {
    if (a.covered > b.covered + eps) return true
    if (a.covered < b.covered - eps) return false
    return a.mean < b.mean - eps
  }
  if (a.mean < b.mean - eps) return true
  if (a.mean > b.mean + eps) return false
  return a.covered > b.covered + eps
}

export function optimizeBases(input: OptimizeInput): OptimizeResult {
  const nC = input.times.length
  const fixed = input.fixed ?? []
  const chosen = [...fixed]
  const free: number[] = []
  const steps: OptimizeStep[] = []
  let current = scoreSolution(input, chosen)

  // greedy addition
  for (let k = 0; k < input.p; k++) {
    let bestC = -1
    let bestScore: Score | null = null
    for (let c = 0; c < nC; c++) {
      if (chosen.includes(c)) continue
      const s = scoreSolution(input, [...chosen, c])
      if (!bestScore || better(input.objective, s, bestScore)) {
        bestScore = s
        bestC = c
      }
    }
    if (bestC < 0 || !bestScore) break
    chosen.push(bestC)
    free.push(bestC)
    steps.push({
      candidate: bestC,
      coveredWeight: bestScore.covered,
      gainWeight: bestScore.covered - current.covered,
      meanTimeS: bestScore.mean,
    })
    current = bestScore
  }

  // vertex interchange on the non-fixed sites: accept the best improving swap until none is left
  let swaps = 0
  for (let iter = 0; iter < 50; iter++) {
    let bestSwap: { out: number; inn: number; score: Score } | null = null
    for (const out of free) {
      const rest = chosen.filter((c) => c !== out)
      for (let c = 0; c < nC; c++) {
        if (chosen.includes(c)) continue
        const s = scoreSolution(input, [...rest, c])
        if (better(input.objective, s, bestSwap ? bestSwap.score : current)) bestSwap = { out, inn: c, score: s }
      }
    }
    if (!bestSwap) break
    chosen[chosen.indexOf(bestSwap.out)] = bestSwap.inn
    free[free.indexOf(bestSwap.out)] = bestSwap.inn
    current = bestSwap.score
    swaps++
  }

  let total = 0
  for (let d = 0; d < input.weights.length; d++) total += input.weights[d]
  return {
    chosen,
    steps,
    coveredWeight: current.covered,
    totalWeight: total,
    meanTimeS: current.mean,
    swaps,
    method: 'Postupné přidávání + záměna stanovišť (heuristika; nejde o prokázané optimum)',
  }
}

/** Exhaustive search over all p-subsets. Only for validating the heuristic on small instances. */
export function bruteForce(input: OptimizeInput): { chosen: number[]; score: Score } {
  const nC = input.times.length
  const fixed = input.fixed ?? []
  let best: { chosen: number[]; score: Score } | null = null
  const rec = (start: number, picked: number[]) => {
    if (picked.length === input.p) {
      const chosen = [...fixed, ...picked]
      const score = scoreSolution(input, chosen)
      if (!best || better(input.objective, score, best.score)) best = { chosen, score }
      return
    }
    for (let c = start; c < nC; c++) {
      if (fixed.includes(c)) continue
      rec(c + 1, [...picked, c])
    }
  }
  rec(0, [])
  return best!
}
