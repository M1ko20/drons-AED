import { describe, expect, it } from 'vitest'
import { flatDem, type Dem } from '../dem'
import { destination, distanceM, toLocal } from '../geo'
import { chooseMode, evaluateMission } from '../mission'
import { computeProfile } from '../profile'
import type { Zone } from '../types'
import { CENTER, origin, testCtx, testPerf } from './helpers'

const east = (km: number) => destination(CENTER, 90, km * 1000)

/** Flat 400 m plain with a 900 m north–south ridge between 4 and 5 km east of the centre. */
function ridgeDem(ridgeM = 900): Dem {
  const dem = flatDem(400, CENTER, 512)
  const data = dem.data as Float32Array
  const mPerPx = distanceM(CENTER, east(10)) / (((10 / 111.195 / Math.cos((49.5 * Math.PI) / 180)) / 360) * 256 * 2 ** dem.zoom)
  const c0 = 256 + Math.round(4000 / mPerPx)
  const c1 = 256 + Math.round(5000 / mPerPx)
  for (let r = 0; r < dem.height; r++) for (let c = c0; c <= c1; c++) data[r * dem.width + c] = ridgeM
  return dem
}

describe('flight profile on flat ground — manually calculable', () => {
  // 6 km at 20 m/s = 300 s cruise; 40 m vertical climb at 5 m/s = 8 s
  const ctx = testCtx()
  const m = evaluateMission(ctx, testPerf(), origin(ctx), east(6), 'no-landing')

  it('time components add up to the hand calculation', () => {
    const t = Object.fromEntries(m.components.map((c) => [c.key, c.seconds]))
    expect(t.call).toBe(119)
    expect(t.launch).toBe(80)
    expect(t.climb).toBeCloseTo(8, 5)
    expect(t.cruise).toBeCloseTo(300, 0)
    expect(t.descent).toBeCloseTo(0, 5) // winch: stays at the 30 m hover
    expect(t.delivery).toBeCloseTo(40, 5) // 30 m at 1 m/s + 10 s release
    expect(m.deliveredS).toBeCloseTo(119 + 80 + 8 + 300 + 0 + 40, 0)
    expect(m.atPatientS).toBeCloseTo(m.deliveredS + 30, 5)
  })
  it('uses the winch at a site without a landing area', () => {
    expect(m.mode).toBe('winch')
    expect(m.feasible).toBe(true)
  })
  it('climbs 100 m in total and never exceeds the cruise clearance', () => {
    expect(m.outbound!.totalAscentM).toBeCloseTo(100, 0)
    expect(m.outbound!.maxAglM).toBeCloseTo(100, 0)
    expect(m.outbound!.maxAltAmslM).toBeCloseTo(500, 0)
  })
  it('landing delivery adds the final descent and unloading', () => {
    const land = testCtx({ ops: { modePreference: ['land'] } })
    const r = evaluateMission(land, testPerf(), origin(land), east(6), 'open')
    expect(r.mode).toBe('land')
    expect(r.deliveredS).toBeCloseTo(119 + 80 + 8 + 300 + 30 / 5 + 45, 0)
  })
  it('dispatch and launch delays shift the result one-for-one', () => {
    const slow = testCtx({ ops: { callProcessingS: 200, launchPrepS: 15 } })
    const r = evaluateMission(slow, testPerf(), origin(slow), east(6), 'no-landing')
    expect(r.deliveredS - m.deliveredS).toBeCloseTo(200 - 119 + (15 - 80), 5)
  })
})

describe('range, reserve and return leg', () => {
  // 40 km published, 20 % reserve → 32 km usable → 16 km radius out-and-back
  it('is feasible just inside the radius and infeasible just outside', () => {
    const ctx = testCtx()
    const inside = evaluateMission(ctx, testPerf(), origin(ctx), east(15.9), 'no-landing')
    const outside = evaluateMission(ctx, testPerf(), origin(ctx), east(16.1), 'no-landing')
    expect(inside.feasible).toBe(true)
    expect(inside.energy!.marginKm).toBeGreaterThan(0)
    expect(outside.feasible).toBe(false)
    expect(outside.reasons).toEqual(['range'])
    expect(outside.reasonText[0]).toMatch(/využitelných/)
  })
  it('one-way policy doubles the reach but the drone does not come back', () => {
    const ctx = testCtx({ ops: { returnPolicy: 'one-way' } })
    const r = evaluateMission(ctx, testPerf(), origin(ctx), east(22), 'no-landing') // beyond the 16 km out-and-back radius
    expect(r.feasible).toBe(true)
    expect(r.inbound).toBeNull()
    expect(r.readyAgainS).toBe(Infinity)
  })
  it('a larger reserve shrinks the radius', () => {
    const ctx = testCtx({ ops: { reserveFraction: 0.4 } }) // 24 km usable → 12 km radius
    expect(evaluateMission(ctx, testPerf(), origin(ctx), east(11.9), 'no-landing').feasible).toBe(true)
    expect(evaluateMission(ctx, testPerf(), origin(ctx), east(12.1), 'no-landing').feasible).toBe(false)
  })
  it('cold weather shrinks the radius', () => {
    const ctx = testCtx({ weather: { tempC: -10 } }) // × 0.8 → 25.6 km → 12.8 km radius
    expect(evaluateMission(ctx, testPerf(), origin(ctx), east(12.7), 'no-landing').feasible).toBe(true)
    expect(evaluateMission(ctx, testPerf(), origin(ctx), east(12.9), 'no-landing').feasible).toBe(false)
  })
  it('hover and climb are charged against the range', () => {
    const ctx = testCtx()
    const thirsty = testPerf({ hoverKmPerMin: 6, climbEquivalentM: 8 })
    const r = evaluateMission(ctx, thirsty, origin(ctx), east(6), 'no-landing')
    expect(r.energy!.hoverKm).toBeGreaterThan(5) // > 70 s of hover × 6 km/min
    expect(r.energy!.climbKm).toBeCloseTo((2 * 100 * 8) / 1000 - 0.24, 1) // ≈ 100 m up each way, less the 30 m already held at the scene
    expect(r.energy!.requiredKm).toBeCloseTo(12 + r.energy!.hoverKm + r.energy!.climbKm, 3)
  })
  it('the drone is ready again after the return flight and turnaround', () => {
    const ctx = testCtx()
    const r = evaluateMission(ctx, testPerf(), origin(ctx), east(6), 'no-landing')
    // winch retract 30 s, climb from the 30 m hover to the 40 m transition height (2 s),
    // 300 s back, 30 m final descent at base (6 s), 10 min turnaround
    expect(r.readyAgainS).toBeCloseTo(r.deliveredS + 30 + 2 + 300 + 6 + 600, 0)
  })
})

describe('wind', () => {
  it('a headwind out and tailwind back changes times and costs range', () => {
    const ctx = testCtx({ weather: { windMs: 10, gustMs: 10, windFromDeg: 90 } })
    const r = evaluateMission(ctx, testPerf(), origin(ctx), east(6), 'no-landing')
    expect(r.outbound!.cruiseS).toBeCloseTo(600, 0) // 10 m/s over ground
    expect(r.inbound!.cruiseS).toBeCloseTo(200, 0) // 30 m/s over ground
    expect(r.energy!.outboundKm + r.energy!.returnKm).toBeCloseTo(16, 1) // vs 12 km in calm air
  })
  it('exceeding the wind or gust limit grounds the aircraft', () => {
    const ctx = testCtx({ weather: { windMs: 13, gustMs: 20 } })
    const r = evaluateMission(ctx, testPerf(), origin(ctx), east(3), 'no-landing')
    expect(r.feasible).toBe(false)
    expect(r.reasons).toContain('wind')
    expect(r.reasons).toContain('gust')
  })
  it('a wind within the limit but stronger than the airspeed allows is reported, not hidden', () => {
    const slow = testPerf({ cruiseMs: 10, maxWindMs: 12 })
    const ctx = testCtx({ weather: { windMs: 9, gustMs: 9, windFromDeg: 90 } })
    const r = evaluateMission(ctx, slow, origin(ctx), east(3), 'no-landing')
    expect(r.feasible).toBe(false)
    expect(r.reasons).toContain('wind')
  })
})

describe('weather, payload and data gates', () => {
  const run = (weather = {}, perf = testPerf(), ops = {}) => {
    const ctx = testCtx({ weather, ops })
    return evaluateMission(ctx, perf, origin(ctx), east(3), 'no-landing')
  }
  it('temperature outside the operating range', () => {
    expect(run({ tempC: -15 }).reasons).toContain('temperature')
  })
  it('rain: light-rain aircraft cannot fly in heavy rain or snow; unrated aircraft cannot fly in any', () => {
    expect(run({ precipitation: 'light-rain' }).feasible).toBe(true)
    expect(run({ precipitation: 'heavy-rain' }).reasons).toContain('precipitation')
    expect(run({ precipitation: 'snow' }).reasons).toContain('precipitation')
    expect(run({ precipitation: 'light-rain' }, testPerf({ rain: 'unknown' })).reasons).toContain('precipitation')
    expect(run({ precipitation: 'heavy-rain' }, testPerf({ rain: 'heavy' })).feasible).toBe(true)
  })
  it('icing grounds every aircraft', () => {
    expect(run({ icing: true }, testPerf({ rain: 'heavy' })).reasons).toContain('icing')
  })
  it('flight in frost lowers the minimum temperature only when enabled, never raising a better published limit', () => {
    expect(run({ tempC: -15 }, testPerf(), { coldOps: true, coldMinC: -20 }).feasible).toBe(true)
    expect(run({ tempC: -15 }, testPerf(), { coldOps: false, coldMinC: -20 }).reasons).toContain('temperature')
    expect(run({ tempC: -20 }, testPerf({ tempMinC: -25 }), { coldOps: true, coldMinC: -10 }).feasible).toBe(true)
    expect(run({ tempC: -25 }, testPerf(), { coldOps: true, coldMinC: -20 }).reasons).toContain('temperature')
  })
  it('night flights only when enabled', () => {
    expect(run({ night: true }).feasible).toBe(true)
    expect(run({ night: true }, testPerf(), { nightOps: false }).reasons).toContain('night')
  })
  it('kit heavier than the payload limit', () => {
    expect(run({}, testPerf({ maxPayloadKg: 1.5 })).reasons).toContain('payload')
  })
  it('missing source data blocks the simulation instead of guessing', () => {
    const r = run({}, testPerf({ missing: ['cestovní rychlost'] }))
    expect(r.feasible).toBe(false)
    expect(r.reasons).toEqual(['missing-data'])
    expect(r.components).toHaveLength(0)
  })
  it('a destination outside the terrain model is rejected', () => {
    const ctx = testCtx()
    const r = evaluateMission(ctx, testPerf(), origin(ctx), [25, 49.5], 'no-landing')
    expect(r.reasons).toEqual(['outside-area'])
  })
})

describe('delivery mode', () => {
  const ops = testCtx().ops
  it('landing-only aircraft cannot serve a site without a landing area', () => {
    const ctx = testCtx()
    const r = evaluateMission(ctx, testPerf({ modes: ['land'] }), origin(ctx), east(3), 'no-landing')
    expect(r.feasible).toBe(false)
    expect(r.reasons).toEqual(['delivery-mode'])
    expect(evaluateMission(ctx, testPerf({ modes: ['land'] }), origin(ctx), east(3), 'open').feasible).toBe(true)
  })
  it('a winch with a minimum hook load is skipped for a light kit', () => {
    const perf = testPerf({ winchMinPayloadKg: 5 })
    expect(chooseMode(perf, ops, 'open', 1.8).mode).toBe('land')
    expect(chooseMode(perf, ops, 'no-landing', 1.8).mode).toBeNull()
    expect(chooseMode(perf, ops, 'no-landing', 6).mode).toBe('winch')
  })
  it('an aircraft with no documented delivery method is infeasible', () => {
    expect(chooseMode(testPerf({ modes: [] }), ops, 'open', 1.8).mode).toBeNull()
  })
  it('the winch height is limited by the cable', () => {
    const ctx = testCtx({ ops: { winchHoverAglM: 30 } })
    const r = evaluateMission(ctx, testPerf({ winchCableM: 20, winchSpeedMs: 0.8 }), origin(ctx), east(3), 'no-landing')
    const t = Object.fromEntries(r.components.map((c) => [c.key, c.seconds]))
    expect(t.delivery).toBeCloseTo(20 / 0.8 + 10, 5)
    expect(t.descent).toBeCloseTo((30 - 20) / 5, 5) // from the 30 m approach hover down to cable height
  })
})

describe('terrain', () => {
  const params = {
    cruiseMs: 20,
    climbMs: 4,
    descentMs: 4,
    vertClimbMs: 4,
    vertDescentMs: 4,
    minAglM: 100,
    transitionAglM: 40,
    approachAglM: 30,
    startHeightAglM: 0,
    endHeightAglM: 30,
    ceilingAmslM: 3000,
    windMs: 0,
    windFromDeg: 0,
    stepM: 50,
    keepSamples: true,
  }
  it('the profile clears a ridge and respects climb and descent limits', () => {
    const dem = ridgeDem()
    const p = computeProfile(dem, [CENTER, east(10)], params)
    expect(p.ok).toBe(true)
    expect(p.maxAltAmslM).toBeGreaterThanOrEqual(999)
    const grad = 4 / 20
    for (let i = 1; i < p.samples.length; i++) {
      const a = p.samples[i - 1]
      const b = p.samples[i]
      const slope = (b.altM - a.altM) / (b.s - a.s)
      expect(slope).toBeLessThanOrEqual(grad + 1e-6)
      expect(slope).toBeGreaterThanOrEqual(-grad - 1e-6)
      expect(b.altM).toBeGreaterThanOrEqual(b.terrainM + 29.999)
    }
    // over the ridge itself the full clearance is held
    const over = p.samples.filter((s) => s.terrainM > 800)
    expect(over.length).toBeGreaterThan(5)
    for (const s of over) expect(s.altM - s.terrainM).toBeGreaterThanOrEqual(100 - 1e-6)
  })
  it('horizontal time is unchanged by the ridge; only vertical phases grow', () => {
    const flat = computeProfile(flatDem(400, CENTER, 512), [CENTER, east(10)], params)
    const ridge = computeProfile(ridgeDem(), [CENTER, east(10)], params)
    expect(ridge.cruiseS).toBeCloseTo(flat.cruiseS, 3)
    expect(ridge.totalAscentM).toBeGreaterThan(flat.totalAscentM + 400)
  })
  it('terrain too steep to out-climb en route is gained in a climbing hold, at cruise power', () => {
    // target on top of the ridge 4.5 km away: needs +600 m, but 4.5 km at 20 % gives 900 m → fine
    const far = computeProfile(ridgeDem(), [CENTER, east(4.5)], params)
    expect(far.takeoffS).toBeCloseTo(40 / 4, 1)
    expect(far.holdClimbS).toBe(0)
    // with a weak climb rate (1 m/s → 5 %) only ~200 m can be gained en route:
    // the remaining ~290 m is climbed circling over the base at 1 m/s
    const weak = computeProfile(ridgeDem(), [CENTER, east(4.5)], { ...params, climbMs: 1 })
    expect(weak.ok).toBe(true)
    expect(weak.takeoffS).toBeCloseTo(40 / 4, 1) // the hover part is unchanged
    expect(weak.holdClimbS).toBeGreaterThan(200)
    expect(weak.holdClimbS).toBeLessThan(400)
    // holding is flown on the wing: it adds air distance, not hover time
    expect(weak.airDistanceM).toBeCloseTo(20 * (weak.cruiseS + weak.holdClimbS + weak.holdDescentS), 3)
    // whatever the split, the height bookkeeping is consistent
    expect(weak.totalAscentM).toBeGreaterThan(590)
  })
  it('a route above the service ceiling is infeasible', () => {
    const ctx = testCtx({ dem: ridgeDem() })
    const r = evaluateMission(ctx, testPerf({ ceilingAmslM: 800 }), origin(ctx), east(10), 'no-landing')
    expect(r.feasible).toBe(false)
    expect(r.reasons).toContain('ceiling')
  })
})

describe('keep-out zones', () => {
  const zone: Zone = { id: 'z', name: 'Test aerodrome', center: east(5), radiusM: 2000, kind: 'aerodrome', enforced: true }
  it('routes around an enforced zone and says so', () => {
    const ctx = testCtx({ zones: [zone] })
    const r = evaluateMission(ctx, testPerf(), origin(ctx), east(10), 'no-landing')
    expect(r.feasible).toBe(true)
    expect(r.outbound!.detoured).toBe(true)
    expect(r.routeApprox).toMatch(/bezletových zón/)
    expect(r.outbound!.horizM).toBeGreaterThan(10_300)
    expect(r.outbound!.horizM).toBeLessThan(12_500)
    const c = toLocal(zone.center, CENTER)
    for (const s of r.outbound!.samples) {
      const q = toLocal([s.lon, s.lat], CENTER)
      expect(Math.hypot(q[0] - c[0], q[1] - c[1])).toBeGreaterThanOrEqual(zone.radiusM - 1)
    }
  })
  it('the same zone when not enforced is ignored', () => {
    const ctx = testCtx({ zones: [{ ...zone, enforced: false }] })
    const r = evaluateMission(ctx, testPerf(), origin(ctx), east(10), 'no-landing')
    expect(r.outbound!.detoured).toBe(false)
    expect(r.outbound!.horizM).toBeCloseTo(10_000, -1)
  })
  it('a destination inside an enforced zone is infeasible', () => {
    const ctx = testCtx({ zones: [zone] })
    const r = evaluateMission(ctx, testPerf(), origin(ctx), east(5.5), 'no-landing')
    expect(r.feasible).toBe(false)
    expect(r.reasons).toEqual(['zone'])
  })
})
