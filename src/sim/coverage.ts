import { cellCenter, type Dem } from './dem'
import { kitMassKg, rangeAtPayloadKm, tempFactor, usableRangeKm } from './energy'
import { distanceM } from './geo'
import { evaluateMission, staticGates, type MissionContext } from './mission'
import type { DronePerf, InfeasibleReason, LngLat, SiteType } from './types'

export type DemandCategory = 'settlement' | 'peak' | 'hut' | 'viewpoint' | 'trail' | 'resort'

export interface DemandPoint {
  id: string
  name: string
  category: DemandCategory
  position: LngLat
  /** resident population for settlements (OSM tag), otherwise undefined */
  population?: number
  site: SiteType
}

/** A launch site with the aircraft types stationed there (ready drones only). */
export interface CoverageSource {
  baseId: string
  position: LngLat
  perfs: DronePerf[]
}

export interface PointCoverage {
  /** call → AED at the patient, seconds; Infinity when no drone can serve the point */
  timeS: number
  baseId: string | null
  specId: string | null
  /** number of bases that can serve the point at all (redundancy) */
  servingBases: number
  /** why the closest attempt failed, when unserved */
  reasons: InfeasibleReason[]
}

/** Largest straight-line distance a drone could possibly serve; used to skip hopeless pairs. */
export function reachLimitM(ctx: MissionContext, perf: DronePerf): number {
  if (perf.missing.length) return 0
  const pub = rangeAtPayloadKm(perf.rangeTable, kitMassKg(ctx.kit))
  const usable = usableRangeKm(
    pub,
    perf.publishedReserveFraction,
    tempFactor(ctx.weather.tempC, ctx.ops.coldDeratePerC),
    ctx.ops.reserveFraction,
  )
  // out-and-back in wind never needs less air distance than 2 × ground distance;
  // one-way with a tailwind can stretch the ground distance by at most (V + W) / V
  return ctx.ops.returnPolicy === 'return'
    ? (usable * 1000) / 2
    : usable * 1000 * ((perf.cruiseMs + ctx.weather.windMs) / perf.cruiseMs)
}

export function coverPoint(ctx: MissionContext, sources: CoverageSource[], target: LngLat, site: SiteType): PointCoverage {
  let best: PointCoverage = { timeS: Infinity, baseId: null, specId: null, servingBases: 0, reasons: [] }
  let fewest = Infinity
  let failReasons: InfeasibleReason[] = []
  const payload = kitMassKg(ctx.kit)
  for (const src of sources) {
    let baseServes = false
    const d = distanceM(src.position, target)
    const zs = ctx.zones.from(src.position)
    for (const perf of src.perfs) {
      const gates = staticGates(perf, ctx.weather, ctx.ops, payload)
      if (gates.reasons.length) {
        if (gates.reasons.length < fewest) ((fewest = gates.reasons.length), (failReasons = gates.reasons))
        continue
      }
      if (d > reachLimitM(ctx, perf)) {
        if (1 < fewest) ((fewest = 1), (failReasons = ['range']))
        continue
      }
      const m = evaluateMission(ctx, perf, { baseId: src.baseId, droneId: '', position: src.position, zoneSource: zs }, target, site)
      if (m.feasible) {
        baseServes = true
        if (m.atPatientS < best.timeS) best = { ...best, timeS: m.atPatientS, baseId: src.baseId, specId: perf.specId }
      } else if (m.reasons.length < fewest) {
        fewest = m.reasons.length
        failReasons = m.reasons
      }
    }
    if (baseServes) best.servingBases++
  }
  if (!isFinite(best.timeS)) best.reasons = sources.length ? failReasons : ['no-fleet']
  return best
}

export interface CoverageField {
  /** seconds, Infinity = not servable; row-major on the grid */
  time: Float32Array
  /** index into `sources` of the serving base, -1 = none */
  source: Int8Array
  width: number
  height: number
}

/**
 * Coverage raster: for each grid cell the fastest call → AED-at-patient time over all sources,
 * using the same mission model as single incidents (terrain profile, wind, energy, zones).
 * `mask` (1 = evaluate) restricts work to the study area.
 */
export function coverageField(
  ctx: MissionContext,
  sources: CoverageSource[],
  grid: Dem,
  site: SiteType,
  mask?: Uint8Array,
  onProgress?: (fraction: number) => void,
): CoverageField {
  const n = grid.width * grid.height
  const time = new Float32Array(n).fill(Infinity)
  const source = new Int8Array(n).fill(-1)
  const payload = kitMassKg(ctx.kit)
  const fieldCtx: MissionContext = { ...ctx, dem: grid, keepSamples: false }

  sources.forEach((src, si) => {
    const zs = ctx.zones.from(src.position)
    for (const perf of src.perfs) {
      if (staticGates(perf, ctx.weather, ctx.ops, payload).reasons.length) continue
      const limit = reachLimitM(ctx, perf)
      const origin = { baseId: src.baseId, droneId: '', position: src.position, zoneSource: zs }
      for (let r = 0; r < grid.height; r++) {
        for (let c = 0; c < grid.width; c++) {
          const i = r * grid.width + c
          if (mask && !mask[i]) continue
          const p = cellCenter(grid, c, r)
          if (distanceM(src.position, p) > limit) continue
          const m = evaluateMission(fieldCtx, perf, origin, p, site)
          if (m.feasible && m.atPatientS < time[i]) {
            time[i] = m.atPatientS
            source[i] = si
          }
        }
      }
    }
    onProgress?.((si + 1) / sources.length)
  })
  return { time, source, width: grid.width, height: grid.height }
}
