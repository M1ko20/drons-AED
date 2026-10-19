// Checks against the bundled Beskydy dataset and against published real-world timings.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { caseConfig } from '../../app/config'
import { runScenario } from '../../app/engine'
import { CASES } from '../../data/cases'
import { DEFAULT_COMPARATORS, DEFAULT_KIT, DEFAULT_OPS, WEATHER_PRESETS } from '../../data/defaults'
import { DRONES, DRONE_BY_ID } from '../../data/drones'
import { SOURCE_BY_ID } from '../../data/sources'
import { buildWorld, defaultZones } from '../../data/world'
import { ComparatorEngine, type Station } from '../comparators'
import { coverPoint } from '../coverage'
import { elevationAt, flatDem, inDem } from '../dem'
import { destination } from '../geo'
import { evaluateMission, type MissionContext } from '../mission'
import { resolvePerf } from '../perf'
import { flightTimeS } from '../profile'
import { quantile } from '../stats'
import type { LngLat } from '../types'
import { ZoneRouter } from '../zones'
import { CALM, CENTER, origin, testCtx } from './helpers'

const dir = path.resolve(__dirname, '../../../public/data')
const buf = (name: string) => {
  const b = readFileSync(path.join(dir, name))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}
const json = (name: string) => JSON.parse(readFileSync(path.join(dir, name), 'utf8'))
const world = buildWorld({
  manifest: json('manifest.json'),
  dem: buf('dem.bin'),
  mask: buf('cz-mask.bin'),
  roads: buf('roads.bin'),
  roadsMeta: json('roads.json'),
  places: json('places.json'),
})
const stations = (kind: string): Station[] =>
  world.places.facilities.filter((f) => f.kind === kind).map((f) => ({ id: f.id, name: f.name, position: [f.lon, f.lat] }))
const engine = new ComparatorEngine(world.roads, world.dem, stations('ambulance'), stations('mountain-rescue'), world.hemsBase, [])
const ctxReal = (over: Partial<MissionContext> = {}): MissionContext => ({
  dem: world.dem,
  weather: WEATHER_PRESETS[0].weather,
  ops: DEFAULT_OPS,
  kit: DEFAULT_KIT,
  zones: new ZoneRouter([], [18.45, 49.53]),
  stepM: 100,
  keepSamples: true,
  ...over,
})

const LYSA: LngLat = [18.4475, 49.5463]
const FRYDLANT_STATION = world.places.facilities.find((f) => /Frýdlant/.test(f.name) && f.kind === 'ambulance')!

describe('bundled dataset', () => {
  it('terrain reproduces known elevations (100 m cells smooth the summits)', () => {
    expect(elevationAt(world.dem, LYSA)).toBeGreaterThan(1240) // Lysá hora, 1,323 m
    expect(elevationAt(world.dem, LYSA)).toBeLessThan(1330)
    const ostravice = elevationAt(world.dem, [18.391, 49.535]) // Ostravice valley, ≈ 420 m
    expect(ostravice).toBeGreaterThan(380)
    expect(ostravice).toBeLessThan(480)
  })
  it('contains the official ambulance stations and the HEMS base', () => {
    expect(FRYDLANT_STATION).toBeTruthy()
    expect(stations('ambulance').length).toBeGreaterThanOrEqual(14)
    expect(stations('mountain-rescue').length).toBeGreaterThanOrEqual(5)
    expect(world.hemsBase!.position[1]).toBeGreaterThan(49.78)
  })
  it('every demand point lies inside the terrain model and the Czech mask', () => {
    for (const d of world.demand) expect(inDem(world.dem, d.position)).toBe(true)
    expect(world.demand.length).toBeGreaterThan(1000)
  })
  it('edge of the study area: a point just outside the extent is rejected, one just inside is modelled', () => {
    const ctx = ctxReal()
    const perf = resolvePerf(DRONE_BY_ID['wingcopter-198'])
    const base: LngLat = [FRYDLANT_STATION.lon, FRYDLANT_STATION.lat]
    const o = { baseId: 'b', droneId: 'd', position: base, zoneSource: ctx.zones.from(base) }
    const ext = world.manifest.extent
    expect(evaluateMission(ctx, perf, o, [18.4, ext.south - 0.01], 'open').reasons).toEqual(['outside-area'])
    expect(evaluateMission(ctx, perf, o, [18.4, ext.north - 0.01], 'open').feasible).toBe(true)
  })
})

describe('researched aircraft', () => {
  it('every sourced value points at a registered source', () => {
    for (const d of DRONES) {
      for (const id of d.sourceIds) expect(SOURCE_BY_ID[id], `${d.id} → ${id}`).toBeTruthy()
      for (const v of Object.values(d)) {
        if (v && typeof v === 'object' && 'evidence' in v && (v as { sourceId?: string }).sourceId)
          expect(SOURCE_BY_ID[(v as { sourceId: string }).sourceId]).toBeTruthy()
      }
    }
  })
  it('unknown values are null, never a made-up number', () => {
    for (const d of DRONES)
      for (const [k, v] of Object.entries(d))
        if (v && typeof v === 'object' && 'evidence' in v && v.evidence === 'unknown') expect(v.value, `${d.id}.${k}`).toBeNull()
  })
  it('aircraft without published cruise speed or range are not simulated', () => {
    const air8 = resolvePerf(DRONE_BY_ID['air6-air8'])
    expect(air8.missing).toEqual(expect.arrayContaining(['cestovní rychlost', 'dolet ani výdrž']))
    const ctx = testCtx()
    expect(evaluateMission(ctx, air8, origin(ctx), destination(CENTER, 90, 2000), 'open').reasons).toEqual(['missing-data'])
  })
  it('unpublished limits fall back to labelled assumptions', () => {
    const e2 = resolvePerf(DRONE_BY_ID['everdrone-e2'])
    expect(e2.provenance.tempMinC).toBe('assumption')
    expect(e2.provenance.cruiseMs).toBe('manufacturer')
    expect(e2.missing).toHaveLength(0)
  })
  it('Everdrone E3: range is derived from endurance, and no documented delivery method → infeasible', () => {
    const e3 = resolvePerf(DRONE_BY_ID['everdrone-e3'])
    expect(e3.provenance.rangeTable).toBe('derived')
    expect(e3.modes).toHaveLength(0)
    const ctx = testCtx()
    expect(evaluateMission(ctx, e3, origin(ctx), destination(CENTER, 90, 2000), 'open').reasons).toContain('delivery-mode')
  })
  it('DJI FlyCart 30: the winch cannot carry a 1.8 kg AED kit (5 kg minimum) — landing only', () => {
    const fc = resolvePerf(DRONE_BY_ID['dji-flycart-30'])
    const ctx = testCtx()
    const target = destination(CENTER, 90, 3000)
    expect(evaluateMission(ctx, fc, origin(ctx), target, 'no-landing').reasons).toEqual(['delivery-mode'])
    expect(evaluateMission(ctx, fc, origin(ctx), target, 'open').mode).toBe('land')
  })
  it('flying faster than the published cruise speed costs range', () => {
    const spec = DRONE_BY_ID['wingcopter-198']
    const std = resolvePerf(spec)
    const fast = resolvePerf(spec, { cruiseMs: 40 })
    expect(fast.cruiseMs).toBe(40)
    expect(fast.rangeTable[0].oneWayKm).toBeCloseTo(std.rangeTable[0].oneWayKm * (28 / 40) ** 2, 3)
    expect(resolvePerf(spec, { cruiseMs: 99 }).cruiseMs).toBe(40) // clamped to the published maximum
    expect(fast.provenance.cruiseMs).toBe('assumption')
  })
  it('Everdrone E2 reproduces its published 8 km service radius under default assumptions', () => {
    const e2 = resolvePerf(DRONE_BY_ID['everdrone-e2'])
    const ctx = testCtx({ dem: flatDem(100, CENTER, 512), weather: { tempC: 15 } })
    const at = (km: number) => evaluateMission(ctx, e2, origin(ctx), destination(CENTER, 90, km * 1000), 'no-landing')
    expect(at(7.9).feasible).toBe(true)
    expect(at(8.4).feasible).toBe(false)
  })
})

describe('validation against Schierbeck et al. 2023 (real deployments, Sweden)', () => {
  // Published medians: 1.8 km flown, take-off → AED delivered 3:17 (197 s), call → delivery 7:11 (431 s)
  const m600 = resolvePerf(DRONE_BY_ID['everdrone-m600'])
  const ctx = testCtx({ dem: flatDem(50, CENTER, 512), ops: { minAglM: 65 } }) // study cruise height ≤ 65 m
  const r = evaluateMission(ctx, m600, origin(ctx), destination(CENTER, 90, 1800), 'no-landing')
  const t = Object.fromEntries(r.components.map((c) => [c.key, c.seconds]))

  it('take-off to delivery is within 15 % of the published median', () => {
    const airborne = t.climb + t.cruise + t.descent + t.delivery
    expect(r.feasible).toBe(true)
    expect(Math.abs(airborne - 197) / 197).toBeLessThan(0.15)
  })
  it('call to delivery is within 5 % of the sum of the published phase medians', () => {
    // 1:59 + 1:20 + 3:17 = 6:36 (396 s). The published overall median is 7:11 (431 s); medians
    // of phases do not add up to the median of the total, so both are checked.
    expect(Math.abs(r.deliveredS - 396) / 396).toBeLessThan(0.05)
    expect(Math.abs(r.deliveredS - 431) / 431).toBeLessThan(0.12)
  })
  it('the study limits are reproduced: no flight in rain or above 8 m/s', () => {
    const rain = testCtx({ weather: { precipitation: 'light-rain' } })
    expect(evaluateMission(rain, m600, origin(rain), destination(CENTER, 90, 1800), 'no-landing').reasons).toContain('precipitation')
    const wind = testCtx({ weather: { windMs: 9, gustMs: 9 } })
    expect(evaluateMission(wind, m600, origin(wind), destination(CENTER, 90, 1800), 'no-landing').reasons).toContain('wind')
  })
})

describe('Beskydy scenarios', () => {
  const base: LngLat = [FRYDLANT_STATION.lon, FRYDLANT_STATION.lat]
  const wing = resolvePerf(DRONE_BY_ID['wingcopter-198'])

  it('Frýdlant → Lysá hora: the climb, not the distance, limits a fixed-wing VTOL', () => {
    const ctx = ctxReal()
    const m = evaluateMission(ctx, wing, { baseId: 'b', droneId: 'd', position: base, zoneSource: ctx.zones.from(base) }, LYSA, 'no-landing')
    expect(m.feasible).toBe(true)
    expect(m.outbound!.horizM).toBeGreaterThan(8000)
    expect(m.outbound!.horizM).toBeLessThan(10500)
    // ≈ 950 m of height gain at 3 m/s cannot be flown faster than ≈ 5 min, whatever the cruise speed
    const flight = flightTimeS(m.outbound!)
    expect(flight).toBeGreaterThan((m.outbound!.totalAscentM - 1) / 3)
    expect(m.outbound!.totalAscentM).toBeGreaterThan(880)
    expect(m.energy!.climbKm).toBeGreaterThan(7)
    // a multirotor with a strong climb rate is not limited this way
    const m400 = resolvePerf(DRONE_BY_ID['dji-m400'])
    const mm = evaluateMission(ctx, m400, { baseId: 'b', droneId: 'd', position: base, zoneSource: ctx.zones.from(base) }, LYSA, 'open')
    expect(flightTimeS(mm.outbound!) - mm.outbound!.cruiseS).toBeLessThan(flightTimeS(m.outbound!) - m.outbound!.cruiseS)
  })
  it('winter: 0 °C aircraft are grounded at −8 °C, cold-rated ones fly with less range', () => {
    const ctx = ctxReal({ weather: WEATHER_PRESETS.find((w) => w.id === 'winter')!.weather })
    const o = { baseId: 'b', droneId: 'd', position: base, zoneSource: ctx.zones.from(base) }
    expect(evaluateMission(ctx, wing, o, LYSA, 'no-landing').reasons).toContain('temperature')
    const m400 = evaluateMission(ctx, resolvePerf(DRONE_BY_ID['dji-m400']), o, LYSA, 'open')
    expect(m400.feasible).toBe(true)
    expect(m400.energy!.tempFactor).toBeCloseTo(1 - 0.008 * 23, 5)
  })
  it('ground ambulance to the summit needs the road plus a long approach; the drone is faster', () => {
    const ctx = ctxReal()
    const amb = engine.ground(LYSA, DEFAULT_OPS.callProcessingS, DEFAULT_COMPARATORS, CALM)
    const drone = evaluateMission(ctx, wing, { baseId: 'b', droneId: 'd', position: base, zoneSource: ctx.zones.from(base) }, LYSA, 'no-landing')
    expect(amb.available).toBe(true)
    expect(amb.totalS).toBeGreaterThan(drone.atPatientS)
    expect(amb.route.length).toBeGreaterThan(10)
  })
  it('in a town next to the station the ambulance wins', () => {
    const ctx = ctxReal()
    const town: LngLat = [18.359, 49.5925] // Frýdlant nad Ostravicí centre
    const far: LngLat = [18.6905, 49.6759] // drone based in Třinec, 25 km away
    const amb = engine.ground(town, DEFAULT_OPS.callProcessingS, DEFAULT_COMPARATORS, CALM)
    const drone = evaluateMission(ctx, wing, { baseId: 'b', droneId: 'd', position: far, zoneSource: ctx.zones.from(far) }, town, 'open')
    expect(amb.totalS).toBeLessThan(drone.atPatientS)
  })
  it('modelled drive times are consistent with the 20-minute legal planning standard', () => {
    const settlements = world.demand.filter((d) => d.category === 'settlement' && d.population)
    const drive = settlements.map((d) => {
      const r = engine.ground(d.position, 0, DEFAULT_COMPARATORS, CALM)
      return r.components.find((c) => c.key === 'drive')?.seconds ?? Infinity
    })
    const within = drive.filter((s) => s <= 20 * 60).length / drive.length
    console.info(
      `settlements with a population tag: ${drive.length}; drive ≤ 20 min: ${(within * 100).toFixed(1)} %; median ${(quantile(drive, 0.5) / 60).toFixed(1)} min; p90 ${(quantile(drive, 0.9) / 60).toFixed(1)} min`,
    )
    expect(within).toBeGreaterThan(0.9)
  })
  it('illustrative aerodrome zones exist but are off by default', () => {
    const zones = defaultZones(world.places)
    expect(zones.some((z) => /LKMT/.test(z.name))).toBe(true)
    expect(zones.every((z) => !z.enforced)).toBe(true)
  })
  it('coverage of trail points from three valley bases is partial, not total', () => {
    const ctx = ctxReal({ keepSamples: false })
    const src = ['Frýdlant', 'Frenštát', 'Třinec'].map((n) => {
      const f = world.places.facilities.find((x) => x.kind === 'ambulance' && x.name.includes(n))!
      return { baseId: f.id, position: [f.lon, f.lat] as LngLat, perfs: [wing] }
    })
    const trail = world.demand.filter((d) => d.category === 'trail')
    const times = trail.map((d) => coverPoint(ctx, src, d.position, d.site).timeS)
    const in10 = times.filter((t) => t <= 600).length / times.length
    console.info(`trail points: ${trail.length}; AED at patient ≤ 10 min: ${(in10 * 100).toFixed(1)} %; median ${(quantile(times, 0.5) / 60).toFixed(1)} min`)
    expect(in10).toBeGreaterThan(0.1)
    expect(in10).toBeLessThan(0.95)
  })
})

describe('real cases', () => {
  it.each(CASES.map((c) => [c.id, c] as const))('%s lies in the data and the small fleet can fly it', (_id, c) => {
    expect(inDem(world.dem, c.position)).toBe(true)
    const config = caseConfig(world, c)
    const out = runScenario(world, config).outcomes[0]
    expect(out.best, out.candidates[0]?.reasonText.join('; ')).not.toBeNull()
    expect(config.comparators.hems.enabled).toBe(!c.hemsUnavailable)
    // print the comparison so a reviewer can check what the case page will show
    const rows = out.comparators.filter((r) => r.available).map((r) => `${r.kind} ${Math.round(r.totalS)} s`)
    console.log(`${c.id}: drone ${Math.round(out.best!.atPatientS)} s (${out.best!.specId}, ${out.best!.baseId}); ${rows.join(', ')}`)
  })
})
