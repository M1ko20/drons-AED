import type { DeliveryMode, DronePerf, DroneSpec, Evidence, Sourced } from './types'

export interface PerfOverride {
  /** cruise airspeed chosen by the user, m/s; clamped to [50 % of cruise, published max speed] */
  cruiseMs?: number
}

/** Defaults applied when a spec does not publish a value. All are labelled 'assumption'. */
export const PERF_FALLBACK = {
  climbMs: { multirotor: 4, 'vtol-fixed-wing': 3, 'fixed-wing': 3 },
  vertClimbMs: { multirotor: 4, 'vtol-fixed-wing': 3, 'fixed-wing': 3 },
  vertDescentMs: { multirotor: 3, 'vtol-fixed-wing': 2.5, 'fixed-wing': 3 },
  maxWindMs: 8,
  gustFactor: 1.5,
  tempMinC: 0,
  tempMaxC: 40,
  ceilingAmslM: 3000,
  winchCableM: 30,
  winchSpeedMs: 1,
  /**
   * metres of level cruise costing the same energy as 1 m of climb. Derived from published
   * battery size and range (Wingcopter 198: ≈ 7–8; DJI FlyCart 30: ≈ 2) assuming 60 % climb
   * efficiency; see docs/MODEL.md.
   */
  climbEquivalentM: { multirotor: 2, 'vtol-fixed-wing': 8, 'fixed-wing': 10 },
  /**
   * hover power ÷ cruise power. Multirotor ≈ 1.1 (DJI M400: 53 min hover vs 59 min forward);
   * VTOL fixed-wing ≈ 6 (Wingcopter 198: 15 min multicopter vs 90 min fixed-wing endurance).
   */
  hoverPowerRatio: { multirotor: 1.1, 'vtol-fixed-wing': 6, 'fixed-wing': 0 },
} as const

function pick<T>(s: Sourced<T>, fallback: T, key: string, prov: Record<string, Evidence>): T {
  if (s.value === null || s.value === undefined) {
    prov[key] = 'assumption'
    return fallback
  }
  prov[key] = s.evidence
  return s.value
}

/** Turn a researched spec into the numbers the flight model uses, recording where each came from. */
export function resolvePerf(spec: DroneSpec, override: PerfOverride = {}): DronePerf {
  const prov: Record<string, Evidence> = {}
  const missing: string[] = []
  const cfg = spec.config

  let cruise = spec.cruiseSpeedMs.value
  if (cruise === null) missing.push('cestovní rychlost')
  prov.cruiseMs = spec.cruiseSpeedMs.evidence
  const publishedCruise = cruise ?? 0

  // Flying faster than the published cruise speed costs range. Drag power rises roughly with V³,
  // so energy per km rises with V²: range × (Vcruise / V)². Flying slower is given no bonus.
  let speedRangeFactor = 1
  if (cruise !== null && override.cruiseMs !== undefined) {
    const hi = spec.maxSpeedMs.value ?? cruise
    const v = Math.max(0.5 * cruise, Math.min(hi, override.cruiseMs))
    if (Math.abs(v - cruise) > 1e-9) prov.cruiseMs = 'assumption'
    if (v > cruise) speedRangeFactor = (cruise / v) ** 2
    cruise = v
  }

  const maxPayload = spec.maxPayloadKg.value
  if (maxPayload === null) missing.push('nosnost')
  prov.maxPayloadKg = spec.maxPayloadKg.evidence

  let rangeTable = spec.rangeTable.value ?? []
  prov.rangeTable = spec.rangeTable.evidence
  if (!rangeTable.length) {
    if (spec.enduranceMin.value !== null && publishedCruise > 0) {
      // endurance × cruise speed: an upper bound, since endurance is usually quoted at a slower speed
      rangeTable = [{ payloadKg: 0, oneWayKm: (spec.enduranceMin.value * 60 * publishedCruise) / 1000 }]
      prov.rangeTable = 'derived'
    } else {
      missing.push('dolet ani výdrž')
    }
  }
  if (speedRangeFactor !== 1) rangeTable = rangeTable.map((r) => ({ ...r, oneWayKm: r.oneWayKm * speedRangeFactor }))

  const maxWind = pick(spec.maxWindMs, PERF_FALLBACK.maxWindMs, 'maxWindMs', prov)
  const modes = (Object.keys(spec.delivery) as DeliveryMode[]).filter((m) => spec.delivery[m].value === true)
  const hoverRatio = PERF_FALLBACK.hoverPowerRatio[cfg]

  return {
    specId: spec.id,
    config: cfg,
    cruiseMs: cruise ?? 0,
    climbMs: pick(spec.climbRateMs, PERF_FALLBACK.climbMs[cfg], 'climbMs', prov),
    descentMs: pick(spec.descentRateMs, PERF_FALLBACK.climbMs[cfg], 'descentMs', prov),
    vertClimbMs: pick(spec.vertClimbRateMs, PERF_FALLBACK.vertClimbMs[cfg], 'vertClimbMs', prov),
    vertDescentMs: pick(spec.vertDescentRateMs, PERF_FALLBACK.vertDescentMs[cfg], 'vertDescentMs', prov),
    maxPayloadKg: maxPayload ?? 0,
    rangeTable,
    publishedReserveFraction: pick(spec.publishedReserveFraction, 0, 'publishedReserveFraction', prov),
    maxWindMs: maxWind,
    maxGustMs: pick(spec.maxGustMs, maxWind * PERF_FALLBACK.gustFactor, 'maxGustMs', prov),
    tempMinC: pick(spec.tempMinC, PERF_FALLBACK.tempMinC, 'tempMinC', prov),
    tempMaxC: pick(spec.tempMaxC, PERF_FALLBACK.tempMaxC, 'tempMaxC', prov),
    rain: spec.rain.value ?? 'unknown',
    ceilingAmslM: pick(spec.ceilingAmslM, PERF_FALLBACK.ceilingAmslM, 'ceilingAmslM', prov),
    modes,
    winchMinPayloadKg: spec.winchMinPayloadKg?.value ?? 0,
    winchCableM: spec.winchCableM?.value ?? PERF_FALLBACK.winchCableM,
    winchSpeedMs: spec.winchSpeedMs?.value ?? PERF_FALLBACK.winchSpeedMs,
    climbEquivalentM: PERF_FALLBACK.climbEquivalentM[cfg],
    hoverKmPerMin: (hoverRatio * (cruise ?? 0) * 60) / 1000,
    provenance: prov,
    missing,
  }
}
