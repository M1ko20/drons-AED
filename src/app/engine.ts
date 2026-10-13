// Glue between configuration, bundled data and the simulation modules.
// Used by the main thread (single incidents) and by the analysis worker (bulk runs).
import { DRONE_BY_ID } from '../data/drones'
import type { World } from '../data/world'
import { ComparatorEngine, type Station } from '../sim/comparators'
import { coverageField, coverPoint, type CoverageSource, type DemandPoint } from '../sim/coverage'
import { cellCenter } from '../sim/dem'
import { dispatchIncidents, type BusyWindow, type IncidentOutcome } from '../sim/dispatch'
import { inBBox, pointInRing } from '../sim/geo'
import type { MissionContext } from '../sim/mission'
import { evaluateMission } from '../sim/mission'
import { optimizeBases, type Objective, type OptimizeStep } from '../sim/optimize'
import { resolvePerf } from '../sim/perf'
import type { DronePerf, InfeasibleReason, LngLat, ResponderResult } from '../sim/types'
import { ZoneRouter } from '../sim/zones'
import { STUDY_AREAS, type ScenarioConfig, type StudyAreaId } from './config'

const REF: LngLat = [18.45, 49.53]

export function perfMap(config: Pick<ScenarioConfig, 'cruiseOverride'>, specIds: Iterable<string>): Map<string, DronePerf> {
  const map = new Map<string, DronePerf>()
  for (const id of specIds) {
    const spec = DRONE_BY_ID[id]
    if (spec && !map.has(id)) map.set(id, resolvePerf(spec, { cruiseMs: config.cruiseOverride[id] }))
  }
  return map
}

export function missionContext(world: World, config: ScenarioConfig, bulk: boolean): MissionContext {
  return {
    dem: bulk ? world.grid : world.dem,
    weather: config.weather,
    ops: config.ops,
    kit: config.kit,
    zones: new ZoneRouter(config.zones, REF),
    stepM: bulk ? 250 : 100,
    keepSamples: !bulk,
  }
}

const stationsOf = (world: World, config: ScenarioConfig, kind: 'ambulance' | 'mountain-rescue'): Station[] => [
  ...world.places.facilities.filter((f) => f.kind === kind).map((f) => ({ id: f.id, name: f.name, position: [f.lon, f.lat] as LngLat })),
  ...config.extraStations.filter((s) => s.kind === kind).map((s) => ({ id: s.id, name: s.name, position: s.position })),
]

let cachedEngine: { key: string; engine: ComparatorEngine } | null = null
/** The comparator engine caches road searches; rebuild only when the station set changes. */
export function comparatorEngine(world: World, config: ScenarioConfig): ComparatorEngine {
  const key = JSON.stringify(config.extraStations)
  if (!cachedEngine || cachedEngine.key !== key) {
    cachedEngine = {
      key,
      engine: new ComparatorEngine(
        world.roads,
        world.dem,
        stationsOf(world, config, 'ambulance'),
        stationsOf(world, config, 'mountain-rescue'),
        world.hemsBase,
        world.places.aeds.map((a) => ({ id: a.id, name: a.name, position: [a.lon, a.lat] as LngLat })),
      ),
    }
  }
  return cachedEngine.engine
}

export interface ScenarioResult {
  outcomes: (IncidentOutcome & { comparators: ResponderResult[] })[]
  busy: BusyWindow[]
}

/** Runs every incident of the scenario: drone dispatch plus the enabled conventional responders. */
export function runScenario(world: World, config: ScenarioConfig): ScenarioResult {
  const ctx = missionContext(world, config, false)
  const specs = config.bases.flatMap((b) => b.drones.map((d) => d.specId))
  const dispatch = dispatchIncidents(ctx, perfMap(config, specs), config.bases, config.incidents)
  const engine = comparatorEngine(world, config)
  return {
    outcomes: dispatch.outcomes.map((o) => ({
      ...o,
      comparators: engine.all(o.incident.position, config.ops.callProcessingS, config.comparators, config.weather),
    })),
    busy: dispatch.busy,
  }
}

// ---------------------------------------------------------------- study area

export type AreaTest = (p: LngLat) => boolean

export function areaTest(_world: World, area: StudyAreaId, chkoRings: LngLat[][] | null): AreaTest {
  const def = STUDY_AREAS.find((a) => a.id === area)!
  if (area === 'chko' && chkoRings) return (p) => chkoRings.some((r) => pointInRing(p, r))
  if (def.bbox) return (p) => inBBox(p, def.bbox!)
  return () => true
}

/** Raster mask on the coarse grid: Czech territory ∩ study area. */
export function areaMask(world: World, test: AreaTest): Uint8Array {
  const g = world.grid
  const mask = new Uint8Array(g.width * g.height)
  for (let r = 0; r < g.height; r++)
    for (let c = 0; c < g.width; c++) {
      const i = r * g.width + c
      if (world.gridMask[i] && test(cellCenter(g, c, r))) mask[i] = 1
    }
  return mask
}

export function studyDemand(world: World, config: ScenarioConfig, test: AreaTest): DemandPoint[] {
  return world.demand.filter((d) => config.analysis.categories[d.category] && test(d.position))
}

// ---------------------------------------------------------------- bulk analysis

export function coverageSources(config: ScenarioConfig): CoverageSource[] {
  const out: CoverageSource[] = []
  for (const b of config.bases) {
    const specs = [...new Set(b.drones.filter((d) => d.status === 'ready').map((d) => d.specId))]
    if (!specs.length) continue
    out.push({ baseId: b.id, position: b.position, perfs: [...perfMap(config, specs).values()] })
  }
  return out
}

export interface PointResult {
  id: string
  /** call → AED at the patient by drone, seconds (Infinity = not servable) */
  droneS: number
  baseId: string | null
  specId: string | null
  servingBases: number
  reasons: InfeasibleReason[]
  /** call → ground ambulance crew at the patient, seconds */
  groundS: number
  /** alert → drone ready again, seconds (for the utilisation estimate) */
  cycleS: number
}

export interface AnalysisResult {
  time: Float32Array
  source: Int8Array
  width: number
  height: number
  mask: Uint8Array
  points: PointResult[]
  /** drone time in the study area's cells within the target, as a share of all study cells */
  elapsedMs: number
}

export function runAnalysis(
  world: World,
  config: ScenarioConfig,
  chkoRings: LngLat[][] | null,
  onProgress: (f: number) => void,
): AnalysisResult {
  const t0 = performance.now()
  const test = areaTest(world, config.studyArea, chkoRings)
  const mask = areaMask(world, test)
  const ctx = missionContext(world, config, true)
  const sources = coverageSources(config)
  const field = coverageField(ctx, sources, world.grid, config.analysis.fieldSite, mask, (f) => onProgress(f * 0.7))

  const engine = comparatorEngine(world, config)
  const demand = studyDemand(world, config, test)
  const perfByKey = new Map<string, DronePerf>()
  for (const s of sources) for (const p of s.perfs) perfByKey.set(s.baseId + '|' + p.specId, p)
  const points: PointResult[] = demand.map((d, i) => {
    const c = coverPoint(ctx, sources, d.position, d.site)
    let cycleS = NaN
    if (c.baseId && c.specId) {
      const src = sources.find((s) => s.baseId === c.baseId)!
      const m = evaluateMission(
        ctx,
        perfByKey.get(c.baseId + '|' + c.specId)!,
        { baseId: src.baseId, droneId: '', position: src.position, zoneSource: ctx.zones.from(src.position) },
        d.position,
        d.site,
      )
      cycleS = m.readyAgainS - config.ops.callProcessingS
    }
    if (i % 100 === 0) onProgress(0.7 + (0.3 * i) / demand.length)
    return {
      id: d.id,
      droneS: c.timeS,
      baseId: c.baseId,
      specId: c.specId,
      servingBases: c.servingBases,
      reasons: c.reasons,
      groundS: config.comparators.ground.enabled
        ? engine.groundTimeS(d.position, config.ops.callProcessingS, config.comparators, config.weather)
        : NaN,
      cycleS,
    }
  })
  onProgress(1)
  return { ...field, mask, points, elapsedMs: performance.now() - t0 }
}

export interface OptimizeRequest {
  candidates: { id: string; name: string; position: LngLat }[]
  specId: string
  p: number
  objective: Objective
  weighting: 'locations' | 'population'
  keepExisting: boolean
}

export interface OptimizeResponse {
  /** chosen candidate ids, in final order */
  chosen: string[]
  steps: (OptimizeStep & { id: string })[]
  coveredWeight: number
  totalWeight: number
  meanTimeS: number
  swaps: number
  method: string
  /** coverage of the existing fleet alone, for reference */
  existingCovered: number
  nCandidates: number
  nDemand: number
  elapsedMs: number
  weighting: 'locations' | 'population'
  objective: Objective
  targetMin: number
  specId: string
}

/**
 * Builds the candidate × demand time matrix with the full mission model and runs the
 * location heuristic. Existing bases can be kept as fixed sites.
 */
export function runOptimize(
  world: World,
  config: ScenarioConfig,
  chkoRings: LngLat[][] | null,
  req: OptimizeRequest,
  onProgress: (f: number) => void,
): OptimizeResponse {
  const t0 = performance.now()
  const test = areaTest(world, config.studyArea, chkoRings)
  const ctx = missionContext(world, config, true)
  const demand = studyDemand(world, config, test).filter((d) => req.weighting === 'locations' || d.population)
  const weights = demand.map((d) => (req.weighting === 'population' ? (d.population ?? 0) : 1))
  const perf = perfMap(config, [req.specId]).get(req.specId)!

  const rows: Float32Array[] = []
  const fixed: number[] = []
  if (req.keepExisting) {
    for (const src of coverageSources(config)) {
      const row = new Float32Array(demand.length)
      demand.forEach((d, j) => (row[j] = coverPoint(ctx, [src], d.position, d.site).timeS))
      fixed.push(rows.length)
      rows.push(row)
    }
  }
  const offset = rows.length
  req.candidates.forEach((cand, i) => {
    const src: CoverageSource = { baseId: cand.id, position: cand.position, perfs: [perf] }
    const row = new Float32Array(demand.length)
    demand.forEach((d, j) => (row[j] = coverPoint(ctx, [src], d.position, d.site).timeS))
    rows.push(row)
    onProgress((0.9 * (i + 1)) / req.candidates.length)
  })

  const targetS = config.analysis.targetMin * 60
  const input = { times: rows, weights, targetS, p: Math.min(req.p, req.candidates.length), fixed, objective: req.objective, penaltyS: 3600 }
  const res = optimizeBases(input)
  let existingCovered = 0
  if (fixed.length)
    demand.forEach((_, j) => {
      if (fixed.some((f) => rows[f][j] <= targetS)) existingCovered += weights[j]
    })
  onProgress(1)
  const idOf = (c: number) => req.candidates[c - offset]?.id
  return {
    chosen: res.chosen.filter((c) => c >= offset).map(idOf),
    steps: res.steps.map((s) => ({ ...s, id: idOf(s.candidate) })),
    coveredWeight: res.coveredWeight,
    totalWeight: res.totalWeight,
    meanTimeS: res.meanTimeS,
    swaps: res.swaps,
    method: res.method,
    existingCovered,
    nCandidates: req.candidates.length,
    nDemand: demand.length,
    elapsedMs: performance.now() - t0,
    weighting: req.weighting,
    objective: req.objective,
    targetMin: config.analysis.targetMin,
    specId: req.specId,
  }
}
