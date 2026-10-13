import { describe, expect, it } from 'vitest'
import { ComparatorEngine, AMBULANCE_KMH } from '../comparators'
import { DEFAULT_COMPARATORS } from '../../data/defaults'
import { flatDem } from '../dem'
import { dispatchIncidents, type FleetBase, type Incident } from '../dispatch'
import { destination } from '../geo'
import { arrivalAt, buildAdjacency, RoadIndex, travelTimes, type RoadGraph } from '../roads'
import type { LngLat } from '../types'
import { CALM, CENTER, testCtx, testPerf } from './helpers'

const east = (km: number, from: LngLat = CENTER) => destination(from, 90, km * 1000)
const north = (km: number, from: LngLat = CENTER) => destination(from, 0, km * 1000)

const incident = (id: string, position: LngLat, t0S = 0): Incident => ({ id, label: id, position, t0S, site: 'no-landing' })
const base = (id: string, position: LngLat, specs: string[], status: 'ready' | 'maintenance' = 'ready'): FleetBase => ({
  id,
  name: id,
  position,
  drones: specs.map((specId, i) => ({ id: `${id}-d${i + 1}`, specId, status })),
})

describe('dispatch: several drones competing for a mission', () => {
  const perfs = new Map([
    ['std', testPerf({ specId: 'std' })],
    ['slow', testPerf({ specId: 'slow', cruiseMs: 10 })],
    ['fast', testPerf({ specId: 'fast', cruiseMs: 30 })],
  ])

  it('the nearer base wins when the aircraft are identical', () => {
    const ctx = testCtx()
    const r = dispatchIncidents(ctx, perfs, [base('near', east(2), ['std']), base('far', east(-8), ['std'])], [incident('i1', east(6))])
    expect(r.outcomes[0].best!.baseId).toBe('near')
    expect(r.outcomes[0].candidates).toHaveLength(2)
    expect(r.outcomes[0].candidates[0].atPatientS).toBeLessThan(r.outcomes[0].candidates[1].atPatientS)
  })
  it('a faster aircraft farther away can beat a slower one nearby', () => {
    const ctx = testCtx()
    // slow: 4 km at 10 m/s = 400 s; fast: 9 km at 30 m/s = 300 s
    const r = dispatchIncidents(ctx, perfs, [base('near', east(2), ['slow']), base('far', east(-3), ['fast'])], [incident('i1', east(6))])
    expect(r.outcomes[0].best!.baseId).toBe('far')
    expect(r.outcomes[0].best!.specId).toBe('fast')
  })
  it('a drone out of service is never dispatched', () => {
    const ctx = testCtx()
    const r = dispatchIncidents(ctx, perfs, [base('near', east(2), ['std'], 'maintenance'), base('far', east(-8), ['std'])], [incident('i1', east(6))])
    expect(r.outcomes[0].best!.baseId).toBe('far')
    const grounded = r.outcomes[0].candidates.find((c) => c.baseId === 'near')!
    expect(grounded.feasible).toBe(false)
    expect(grounded.reasons).toContain('unavailable')
  })
  it('no feasible drone → no dispatch, with reasons kept', () => {
    const ctx = testCtx()
    const r = dispatchIncidents(ctx, perfs, [base('b', CENTER, ['std'])], [incident('i1', east(20))])
    expect(r.outcomes[0].best).toBeNull()
    expect(r.outcomes[0].candidates[0].reasons).toEqual(['range'])
    expect(r.busy).toHaveLength(0)
  })
  it('concurrent incidents: the second takes the other drone, a third has to wait', () => {
    const ctx = testCtx()
    const fleet = [base('b', CENTER, ['std', 'std'])]
    const r = dispatchIncidents(ctx, perfs, fleet, [incident('i1', east(6), 0), incident('i2', north(6), 60), incident('i3', east(4), 120)])
    const [o1, o2, o3] = r.outcomes
    expect(o1.best!.droneId).toBe('b-d1')
    expect(o2.best!.droneId).toBe('b-d2')
    expect(o2.best!.components.find((c) => c.key === 'wait')).toBeUndefined()
    // both drones are away when the third call is processed: it waits for the first to be turned around
    const wait = o3.best!.components.find((c) => c.key === 'wait')!
    expect(wait.seconds).toBeGreaterThan(0)
    const d1Free = o1.best!.readyAgainS + 0
    expect(wait.seconds).toBeCloseTo(d1Free - (120 + ctx.ops.callProcessingS), 0)
    expect(r.busy).toHaveLength(3)
  })
  it('with one drone the second incident is delayed by exactly the remaining busy time', () => {
    const ctx = testCtx()
    const one = dispatchIncidents(ctx, perfs, [base('b', CENTER, ['std'])], [incident('i1', east(6), 0), incident('i2', east(6), 300)])
    const alone = dispatchIncidents(ctx, perfs, [base('b', CENTER, ['std'])], [incident('i2', east(6), 0)])
    const wait = one.outcomes[1].best!.components.find((c) => c.key === 'wait')!.seconds
    expect(one.outcomes[1].best!.atPatientS).toBeCloseTo(alone.outcomes[0].best!.atPatientS + wait, 3)
  })
  it('a drone sent one-way is not available again', () => {
    const ctx = testCtx({ ops: { returnPolicy: 'one-way' } })
    const r = dispatchIncidents(ctx, perfs, [base('b', CENTER, ['std'])], [incident('i1', east(6), 0), incident('i2', east(6), 3600)])
    expect(r.outcomes[1].best).toBeNull()
    expect(r.outcomes[1].candidates[0].reasons).toContain('busy')
  })
})

/** Three nodes in a row 1 km apart (A–B–C) on a primary road, plus a one-way residential bypass A→C. */
function lineGraph(): { g: RoadGraph; A: LngLat; B: LngLat; C: LngLat } {
  const A = CENTER
  const B = east(1)
  const C = east(2)
  const D = north(0.5, B)
  const pts = [A, B, C, D]
  const edges = [
    { from: 0, to: 1, cls: 2, oneway: 0, geom: [A, B] },
    { from: 1, to: 2, cls: 2, oneway: 0, geom: [B, C] },
    { from: 2, to: 3, cls: 6, oneway: 1, geom: [C, D] },
    { from: 3, to: 0, cls: 6, oneway: 1, geom: [D, A] },
  ]
  const geomStart = new Uint32Array(edges.length + 1)
  const lon: number[] = []
  const lat: number[] = []
  edges.forEach((e, i) => {
    geomStart[i] = lon.length
    for (const p of e.geom) (lon.push(p[0]), lat.push(p[1]))
  })
  geomStart[edges.length] = lon.length
  const g: RoadGraph = {
    nodeLon: Float32Array.from(pts, (p) => p[0]),
    nodeLat: Float32Array.from(pts, (p) => p[1]),
    edgeFrom: Uint32Array.from(edges, (e) => e.from),
    edgeTo: Uint32Array.from(edges, (e) => e.to),
    edgeLenM: Float32Array.from([1000, 1000, 1118, 1118]),
    edgeClass: Uint8Array.from(edges, (e) => e.cls),
    edgeOneway: Uint8Array.from(edges, (e) => e.oneway),
    geomStart,
    geomLon: Float32Array.from(lon),
    geomLat: Float32Array.from(lat),
  }
  return { g, A, B, C }
}

describe('road network', () => {
  const { g, A, B, C } = lineGraph()
  const adj = buildAdjacency(g)
  const speeds = new Array(10).fill(0)
  speeds[2] = 20 // primary: 20 m/s → 50 s per km
  speeds[6] = 10

  it('travel time along the road is distance / speed', () => {
    const f = travelTimes(g, adj, [{ node: 0, t0: 0 }], speeds)
    expect(f.time[1]).toBeCloseTo(50)
    expect(f.time[2]).toBeCloseTo(100)
  })
  it('one-way streets are not driven against the arrow', () => {
    // from A the bypass D→A cannot be entered at A; D is reached through C
    const f = travelTimes(g, adj, [{ node: 0, t0: 0 }], speeds)
    expect(f.time[3]).toBeCloseTo(100 + 111.8, 0)
    // from C the bypass leads back to A faster than… no: 2 × 111.8 s vs 100 s on the main road
    const fc = travelTimes(g, adj, [{ node: 2, t0: 0 }], speeds)
    expect(fc.time[0]).toBeCloseTo(100)
  })
  it('a class with speed 0 is closed', () => {
    const closed = [...speeds]
    closed[2] = 0
    const f = travelTimes(g, adj, [{ node: 0, t0: 0 }], closed)
    expect(f.time[1]).toBe(Infinity)
  })
  it('multi-source search reports the nearest station', () => {
    const f = travelTimes(g, adj, [{ node: 0, t0: 0 }, { node: 2, t0: 0 }], speeds)
    expect(f.time[1]).toBeCloseTo(50)
    expect(f.source[0]).toBe(0)
    expect(f.source[2]).toBe(1)
  })
  it('snaps a point to the nearest road and measures the offset', () => {
    const idx = new RoadIndex(g, (e) => g.edgeClass[e] === 2)
    const p = destination(east(0.5), 180, 100) // 100 m south of the middle of A–B
    const snap = idx.nearest(p)!
    expect(snap.edge).toBe(0)
    expect(snap.offsetM).toBeCloseTo(100, 0)
    expect(snap.alongM).toBeCloseTo(500, 0)
    const f = travelTimes(g, adj, [{ node: 0, t0: 0 }], speeds)
    const arr = arrivalAt(g, f, snap, speeds)!
    expect(arr.timeS).toBeCloseTo(25, 0)
    expect(arr.distanceM).toBeCloseTo(500, 0)
    expect(arr.route.length).toBeGreaterThanOrEqual(2)
  })
  it('returns null when nothing is within the search radius', () => {
    const idx = new RoadIndex(g, () => true)
    expect(idx.nearest(north(30), 5000)).toBeNull()
  })

  describe('ground ambulance comparator', () => {
    const dem = flatDem(400, CENTER, 512)
    const engine = new ComparatorEngine(g, dem, [{ id: 's', name: 'Station A', position: A }], [], null, [])
    it('roadside patient: call + turnout + drive', () => {
      const r = engine.ground(C, 119, DEFAULT_COMPARATORS, CALM)
      const drive = 2000 / (AMBULANCE_KMH[2] / 3.6)
      expect(r.available).toBe(true)
      expect(r.fromName).toBe('Station A')
      expect(r.totalS).toBeCloseTo(119 + 90 + drive, 0)
    })
    it('off-road patient adds the walk-in on foot', () => {
      const off = destination(B, 180, 400)
      const r = engine.ground(off, 119, DEFAULT_COMPARATORS, CALM)
      const foot = r.components.find((c) => c.key === 'foot')!.seconds
      // 400 m × 1.3 detour at Tobler level speed (1.4 m/s) × 0.85 load factor ≈ 437 s
      expect(foot).toBeCloseTo((400 * 1.3) / (1.4 * 0.85), -1)
      expect(r.totalS).toBeCloseTo(119 + 90 + 1000 / (AMBULANCE_KMH[2] / 3.6) + foot, 0)
    })
    it('snow slows the drive', () => {
      const dry = engine.ground(C, 119, DEFAULT_COMPARATORS, CALM)
      const snow = engine.ground(C, 119, DEFAULT_COMPARATORS, { ...CALM, roadSpeedFactor: 0.5 })
      const d = (r: typeof dry) => r.components.find((c) => c.key === 'drive')!.seconds
      expect(d(snow)).toBeCloseTo(2 * d(dry), 3)
    })
    it('helicopter: unavailable without a base, and never instantly on scene', () => {
      expect(engine.hems(C, 119, DEFAULT_COMPARATORS, CALM).available).toBe(false)
      const withBase = new ComparatorEngine(g, dem, [], [], { id: 'h', name: 'HEMS', position: north(20) }, [])
      const h = withBase.hems(CENTER, 119, DEFAULT_COMPARATORS, CALM)
      expect(h.illustrative).toBe(true)
      // 20 km at 220 km/h = 327 s flight, plus call, mobilisation, landing and walk
      expect(h.components.find((c) => c.key === 'flight')!.seconds).toBeCloseTo(20000 / (220 / 3.6), 0)
      expect(h.totalS).toBeGreaterThan(119 + 180 + 327 + 120)
      expect(withBase.hems(CENTER, 119, DEFAULT_COMPARATORS, { ...CALM, icing: true }).available).toBe(false)
    })
    it('drone vs ambulance on the same incident', () => {
      const ctx = testCtx({ dem })
      const fleet = [base('b', A, ['std'])]
      const perfs = new Map([['std', testPerf({ specId: 'std' })]])
      const off = destination(C, 180, 800)
      const drone = dispatchIncidents(ctx, perfs, fleet, [incident('i', off)]).outcomes[0].best!
      const amb = engine.ground(off, ctx.ops.callProcessingS, DEFAULT_COMPARATORS, CALM)
      expect(drone.feasible && amb.available).toBe(true)
      // 2.15 km: drone ≈ 119+80+8+108+40+30 s; ambulance needs a 800 m walk-in (≈ 15 min)
      expect(drone.atPatientS).toBeLessThan(amb.totalS)
      expect(amb.totalS - drone.atPatientS).toBeGreaterThan(300)
    })
  })
})
