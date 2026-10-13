// Dashboard statistics. Each metric is defined precisely; population, location and area
// coverage are separate numbers and are never substituted for one another.
import { modelName, publishedPriceEur } from '../data/drones'
import { fleetCost, type FleetCost } from '../sim/cost'
import type { DemandCategory, DemandPoint } from '../sim/coverage'
import { erlangB, mean, quantile } from '../sim/stats'
import type { InfeasibleReason } from '../sim/types'
import type { ScenarioConfig } from './config'
import type { AnalysisResult } from './engine'

export { pct } from './format'

export interface CategoryStat {
  category: DemandCategory
  total: number
  within: number
  servable: number
}

export interface Metrics {
  drones: number
  dronesReady: number
  bases: number
  basesOperational: number
  models: string[]
  targetMin: number
  locations: number
  locationsWithin: number
  locationsServable: number
  locationsUnserved: number
  locationsTwoBases: number
  byCategory: CategoryStat[]
  populationTagged: number
  populationWithin: number
  settlementsWithPopulation: number
  medianS: number
  p90S: number
  droneFaster: number
  comparedWithGround: number
  meanGainS: number
  medianGroundS: number
  areaCells: number
  areaWithin: number
  areaServable: number
  cellKm2: number
  unservedReasons: { reason: InfeasibleReason; count: number }[]
  alertsPerYear: number
  meanCycleMin: number
  utilisation: number
  pAllBusy: number
  /** fleet cost at the time of the analysis, EUR */
  purchaseEur: number
  annualEur: number
}

export const REASON_LABEL: Record<InfeasibleReason, string> = {
  payload: 'Sada AED je příliš těžká',
  wind: 'Vítr nad limitem',
  gust: 'Nárazy nad limitem',
  temperature: 'Mimo teplotní rozsah',
  precipitation: 'Srážky',
  icing: 'Námraza',
  night: 'Noční provoz vypnut',
  range: 'Mimo využitelný dolet',
  ceiling: 'Nad dostupem stroje',
  'delivery-mode': 'Žádný použitelný způsob doručení',
  zone: 'Bezletová zóna',
  unavailable: 'Dron mimo provoz',
  busy: 'Dron nebyl vyzvednut',
  'missing-data': 'Chybí údaje výrobce',
  'outside-area': 'Mimo rozsah dat',
  'no-fleet': 'Ve flotile není připravený dron',
}

export function fleetCounts(config: ScenarioConfig) {
  const all = config.bases.flatMap((b) => b.drones)
  return {
    drones: all.length,
    dronesReady: all.filter((d) => d.status === 'ready').length,
    bases: config.bases.length,
    basesOperational: config.bases.filter((b) => b.drones.some((d) => d.status === 'ready')).length,
    models: [...new Set(all.map((d) => modelName(d.specId)))],
  }
}

export const scenarioCost = (config: ScenarioConfig): FleetCost => fleetCost(config.bases, publishedPriceEur, config.costs)

export function computeMetrics(config: ScenarioConfig, analysis: AnalysisResult, demandById: Map<string, DemandPoint>, cellKm2: number): Metrics {
  const T = config.analysis.targetMin * 60
  const pts = analysis.points
  const cats = new Map<DemandCategory, CategoryStat>()
  let populationTagged = 0
  let populationWithin = 0
  let settlementsWithPopulation = 0
  let within = 0
  let servable = 0
  let two = 0
  let faster = 0
  let compared = 0
  const droneTimes: number[] = []
  const gains: number[] = []
  const ground: number[] = []
  const cycles: number[] = []
  const reasons = new Map<InfeasibleReason, number>()

  for (const p of pts) {
    const d = demandById.get(p.id)
    if (!d) continue
    let c = cats.get(d.category)
    if (!c) cats.set(d.category, (c = { category: d.category, total: 0, within: 0, servable: 0 }))
    c.total++
    const ok = isFinite(p.droneS)
    if (ok) {
      servable++
      c.servable++
      droneTimes.push(p.droneS)
      if (isFinite(p.cycleS)) cycles.push(p.cycleS)
      if (p.servingBases >= 2) two++
    } else {
      for (const r of p.reasons.length ? p.reasons : (['range'] as InfeasibleReason[])) reasons.set(r, (reasons.get(r) ?? 0) + 1)
    }
    if (p.droneS <= T) {
      within++
      c.within++
    }
    if (d.category === 'settlement' && d.population) {
      settlementsWithPopulation++
      populationTagged += d.population
      if (p.droneS <= T) populationWithin += d.population
    }
    if (isFinite(p.groundS)) {
      ground.push(p.groundS)
      if (ok) {
        compared++
        if (p.droneS < p.groundS) faster++
        gains.push(p.groundS - p.droneS)
      }
    }
  }

  let areaCells = 0
  let areaWithin = 0
  let areaServable = 0
  for (let i = 0; i < analysis.mask.length; i++) {
    if (!analysis.mask[i]) continue
    areaCells++
    if (analysis.time[i] <= T) areaWithin++
    if (isFinite(analysis.time[i])) areaServable++
  }

  const counts = fleetCounts(config)
  const alertsPerYear = (populationTagged / 100_000) * config.analysis.alertsPer100k
  const meanCycleS = mean(cycles)
  const erlangs = isFinite(meanCycleS) ? (alertsPerYear / (365 * 24 * 3600)) * meanCycleS : 0
  const order: DemandCategory[] = ['settlement', 'hut', 'peak', 'viewpoint', 'resort', 'trail']
  const cost = scenarioCost(config)

  return {
    ...counts,
    targetMin: config.analysis.targetMin,
    locations: pts.length,
    locationsWithin: within,
    locationsServable: servable,
    locationsUnserved: pts.length - servable,
    locationsTwoBases: two,
    byCategory: order.filter((c) => cats.has(c)).map((c) => cats.get(c)!),
    populationTagged,
    populationWithin,
    settlementsWithPopulation,
    medianS: quantile(droneTimes, 0.5),
    p90S: quantile(droneTimes, 0.9),
    droneFaster: faster,
    comparedWithGround: compared,
    meanGainS: mean(gains),
    medianGroundS: quantile(ground, 0.5),
    areaCells,
    areaWithin,
    areaServable,
    cellKm2,
    unservedReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    alertsPerYear,
    meanCycleMin: meanCycleS / 60,
    utilisation: counts.dronesReady ? erlangs / counts.dronesReady : 0,
    pAllBusy: erlangB(counts.dronesReady, erlangs),
    purchaseEur: cost.purchaseEur,
    annualEur: cost.annualEur,
  }
}
