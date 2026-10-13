import { evaluateMission, type MissionContext, type MissionOrigin } from './mission'
import type { DroneMission, DronePerf, LngLat, SiteType } from './types'

export interface FleetDrone {
  id: string
  specId: string
  status: 'ready' | 'maintenance'
}

export interface FleetBase {
  id: string
  name: string
  position: LngLat
  drones: FleetDrone[]
}

export interface Incident {
  id: string
  label: string
  position: LngLat
  /** seconds on the scenario clock at which the emergency call is made */
  t0S: number
  site: SiteType
}

export interface IncidentOutcome {
  incident: Incident
  /** one entry per drone in the fleet, best first; infeasible ones last */
  candidates: DroneMission[]
  best: DroneMission | null
}

export interface BusyWindow {
  droneId: string
  incidentId: string
  fromS: number
  toS: number
}

export interface DispatchResult {
  outcomes: IncidentOutcome[]
  busy: BusyWindow[]
}

/**
 * Dispatch rule: incidents are handled in call order; each gets the drone that can put the AED
 * at the patient soonest, counting any wait for a drone that is still flying or being turned
 * around. A dispatched drone is unavailable until it has returned and been re-armed.
 * Ties go to the drone with the larger energy margin.
 */
export function dispatchIncidents(
  ctx: MissionContext,
  perfBySpec: Map<string, DronePerf>,
  bases: FleetBase[],
  incidents: Incident[],
): DispatchResult {
  const freeAt = new Map<string, number>()
  const busy: BusyWindow[] = []
  const outcomes: IncidentOutcome[] = []
  const origins = new Map<string, MissionOrigin['zoneSource']>()
  for (const b of bases) origins.set(b.id, ctx.zones.from(b.position))

  const ordered = [...incidents].sort((a, b) => a.t0S - b.t0S)
  for (const incident of ordered) {
    const alertAt = incident.t0S + ctx.ops.callProcessingS
    const cache = new Map<string, DroneMission>()
    const candidates: DroneMission[] = []

    for (const base of bases) {
      for (const drone of base.drones) {
        const perf = perfBySpec.get(drone.specId)
        if (!perf) continue
        const free = freeAt.get(drone.id) ?? 0
        const waitS = Math.max(0, free - alertAt)
        const key = `${base.id}|${drone.specId}|${isFinite(waitS) ? Math.round(waitS) : 'inf'}`
        let m = cache.get(key)
        if (!m) {
          m = evaluateMission(
            ctx,
            perf,
            { baseId: base.id, droneId: drone.id, position: base.position, zoneSource: origins.get(base.id)! },
            incident.position,
            incident.site,
            isFinite(waitS) ? waitS : 0,
          )
          cache.set(key, m)
        }
        m = { ...m, droneId: drone.id, reasons: [...m.reasons], reasonText: [...m.reasonText] }
        if (drone.status !== 'ready') {
          m.feasible = false
          m.reasons.push('unavailable')
          m.reasonText.push('Dron je označen jako mimo provoz')
        } else if (!isFinite(waitS)) {
          m.feasible = false
          m.reasons.push('busy')
          m.reasonText.push('Dron byl při dřívějším zásahu vyslán bez návratu a ještě nebyl vyzvednut')
        }
        candidates.push(m)
      }
    }

    candidates.sort((a, b) => {
      if (a.feasible !== b.feasible) return a.feasible ? -1 : 1
      if (a.feasible) {
        if (Math.abs(a.atPatientS - b.atPatientS) > 0.5) return a.atPatientS - b.atPatientS
        return (b.energy?.marginKm ?? 0) - (a.energy?.marginKm ?? 0)
      }
      return a.reasons.length - b.reasons.length
    })
    const best = candidates[0]?.feasible ? candidates[0] : null
    if (best) {
      const until = incident.t0S + best.readyAgainS
      freeAt.set(best.droneId, until)
      const wait = best.components.find((c) => c.key === 'wait')?.seconds ?? 0
      busy.push({ droneId: best.droneId, incidentId: incident.id, fromS: alertAt + wait, toS: until })
    }
    outcomes.push({ incident, candidates, best })
  }
  return { outcomes, busy }
}
