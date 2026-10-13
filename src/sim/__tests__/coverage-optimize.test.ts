import { describe, expect, it } from 'vitest'
import { coarsen, flatDem } from '../dem'
import { coverageField, coverPoint, reachLimitM, type CoverageSource } from '../coverage'
import { destination } from '../geo'
import { bruteForce, optimizeBases, scoreSolution, type OptimizeInput } from '../optimize'
import { CENTER, testCtx, testPerf } from './helpers'

const east = (km: number) => destination(CENTER, 90, km * 1000)

describe('coverage of demand points', () => {
  const ctx = testCtx()
  const src = (id: string, km: number, over = {}): CoverageSource => ({ baseId: id, position: east(km), perfs: [testPerf(over)] })

  it('takes the fastest base and counts how many bases could serve the point', () => {
    const c = coverPoint(ctx, [src('a', 0), src('b', 4)], east(6), 'no-landing')
    expect(c.baseId).toBe('b')
    expect(c.servingBases).toBe(2)
    // 2 km at 20 m/s = 100 s cruise: 119 + 80 + 8 + 100 + 40 + 30
    expect(c.timeS).toBeCloseTo(377, 0)
  })
  it('a point beyond every base is unserved, with the reason', () => {
    const c = coverPoint(ctx, [src('a', 0)], east(20), 'no-landing')
    expect(c.timeS).toBe(Infinity)
    expect(c.baseId).toBeNull()
    expect(c.reasons).toEqual(['range'])
  })
  it('landing-only fleets do not cover sites without a landing area', () => {
    const land = [src('a', 0, { modes: ['land'] })]
    expect(coverPoint(ctx, land, east(3), 'no-landing').reasons).toEqual(['delivery-mode'])
    expect(coverPoint(ctx, land, east(3), 'open').timeS).toBeLessThan(600)
  })
  it('bad weather removes coverage instead of slowing it', () => {
    const windy = testCtx({ weather: { windMs: 14, gustMs: 14 } })
    expect(coverPoint(windy, [src('a', 0)], east(3), 'no-landing').reasons).toContain('wind')
  })
  it('the reach pre-filter never rejects a point the full model would accept', () => {
    const limit = reachLimitM(ctx, testPerf())
    expect(limit).toBeCloseTo(16000, 0)
    expect(coverPoint(ctx, [src('a', 0)], east(15.95), 'no-landing').timeS).toBeLessThan(Infinity)
  })
})

describe('coverage raster', () => {
  const dem = flatDem(400, CENTER, 512)
  const grid = coarsen(dem, 4)
  const source: CoverageSource[] = [{ baseId: 'a', position: CENTER, perfs: [testPerf()] }]
  const at = (f: ReturnType<typeof coverageField>, dc: number, dr: number) =>
    f.time[(grid.height / 2 + dr) * grid.width + grid.width / 2 + dc]

  it('times grow with distance and stop at the usable range', () => {
    const f = coverageField(testCtx({ dem }), source, grid, 'no-landing')
    expect(at(f, 5, 0)).toBeLessThan(at(f, 20, 0))
    expect(at(f, 20, 0)).toBeLessThan(at(f, 35, 0))
    expect(at(f, 60, 0)).toBe(Infinity) // ≈ 24 km east, beyond the 16 km radius
    expect(f.source[(grid.height / 2) * grid.width + grid.width / 2 + 5]).toBe(0)
  })
  it('is not a circle in wind: the upwind side is slower than the downwind side', () => {
    const f = coverageField(testCtx({ dem, weather: { windMs: 8, gustMs: 8, windFromDeg: 90 } }), source, grid, 'no-landing')
    expect(at(f, 20, 0)).toBeGreaterThan(at(f, -20, 0) + 60) // east = into the wind
    // the base sits on a cell corner, so rows +20 and −21 are the same distance north and south
    expect(Math.abs(at(f, 0, 20) - at(f, 0, -21))).toBeLessThan(5) // crosswind legs are symmetric
  })
  it('respects the mask', () => {
    const mask = new Uint8Array(grid.width * grid.height)
    const f = coverageField(testCtx({ dem }), source, grid, 'no-landing', mask)
    expect(f.time.every((t) => t === Infinity)).toBe(true)
  })
})

describe('base-location optimisation', () => {
  const INF = Infinity
  // X covers demand 0-3, Y covers 0,1,4, Z covers 2,3,5 — the textbook case where greedy alone is not optimal
  const crafted: OptimizeInput = {
    times: [
      [100, 100, 100, 100, INF, INF],
      [100, 100, INF, INF, 100, INF],
      [INF, INF, 100, 100, INF, 100],
    ],
    weights: [1, 1, 1, 1, 1, 1],
    targetS: 300,
    p: 2,
    objective: 'coverage',
  }
  it('greedy picks the biggest single site first', () => {
    const r = optimizeBases({ ...crafted, p: 1 })
    expect(r.chosen).toEqual([0])
    expect(r.coveredWeight).toBe(4)
  })
  it('interchange repairs the greedy choice and reaches the true optimum here', () => {
    const r = optimizeBases(crafted)
    expect(r.steps.map((s) => s.coveredWeight)).toEqual([4, 5]) // greedy trajectory
    expect(r.swaps).toBeGreaterThan(0)
    expect(r.coveredWeight).toBe(6)
    expect([...r.chosen].sort()).toEqual([1, 2])
    expect(bruteForce(crafted).score.covered).toBe(6)
  })
  it('weights change the answer', () => {
    const r = optimizeBases({ ...crafted, p: 1, weights: [1, 1, 1, 1, 1, 50] })
    expect(r.chosen).toEqual([2])
  })
  it('fixed sites are kept', () => {
    const r = optimizeBases({ ...crafted, p: 1, fixed: [0] })
    expect(r.chosen).toContain(0)
    expect(r.chosen).toHaveLength(2)
    expect(r.coveredWeight).toBe(5)
  })
  it('never worse than greedy and within the 1 − 1/e bound of the optimum on random instances', () => {
    let seed = 42
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
    let matched = 0
    const runs = 40
    for (let k = 0; k < runs; k++) {
      const nC = 9
      const nD = 40
      const input: OptimizeInput = {
        times: Array.from({ length: nC }, () => Array.from({ length: nD }, () => (rnd() < 0.25 ? 100 + 500 * rnd() : INF))),
        weights: Array.from({ length: nD }, () => 1 + Math.floor(rnd() * 5)),
        targetS: 480,
        p: 3,
        objective: 'coverage',
      }
      const h = optimizeBases(input)
      const best = bruteForce(input).score.covered
      const greedy = h.steps[h.steps.length - 1].coveredWeight
      expect(h.coveredWeight).toBeGreaterThanOrEqual(greedy)
      expect(h.coveredWeight).toBeLessThanOrEqual(best)
      expect(h.coveredWeight).toBeGreaterThanOrEqual(best * (1 - 1 / Math.E) - 1e-9)
      expect(scoreSolution(input, h.chosen).covered).toBe(h.coveredWeight)
      if (h.coveredWeight === best) matched++
    }
    // the heuristic is usually, but not provably, optimal
    expect(matched).toBeGreaterThan(runs * 0.7)
  })
  it('mean-time objective prefers the site that serves everyone moderately', () => {
    const input: OptimizeInput = {
      times: [
        [60, 60, INF, INF],
        [200, 200, 200, 200],
      ],
      weights: [1, 1, 1, 1],
      targetS: 120,
      p: 1,
      objective: 'mean-time',
      penaltyS: 1800,
    }
    expect(optimizeBases(input).chosen).toEqual([1])
    expect(optimizeBases({ ...input, objective: 'coverage' }).chosen).toEqual([0])
  })
})
