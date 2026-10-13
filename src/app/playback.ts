// Positions of every responder at a given time after the emergency call, for map playback.
import { distanceM, lerp } from '../sim/geo'
import { flightTimeS } from '../sim/profile'
import type { DroneMission, FlightProfile, LngLat, ResponderResult } from '../sim/types'

export interface Mover {
  kind: 'drone' | ResponderResult['kind']
  position: LngLat
  status: string
  arrived: boolean
}

function alongPath(path: LngLat[], fraction: number): LngLat {
  if (path.length === 1) return path[0]
  const f = Math.max(0, Math.min(1, fraction))
  let total = 0
  const seg: number[] = []
  for (let i = 1; i < path.length; i++) {
    const d = distanceM(path[i - 1], path[i])
    seg.push(d)
    total += d
  }
  let target = total * f
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i] || i === seg.length - 1) return lerp(path[i], path[i + 1], seg[i] > 0 ? Math.min(1, target / seg[i]) : 0)
    target -= seg[i]
  }
  return path[path.length - 1]
}

const profilePath = (p: FlightProfile): LngLat[] => (p.samples.length > 1 ? p.samples.map((s) => [s.lon, s.lat] as LngLat) : p.path)

export function droneAt(m: DroneMission, t: number): Mover {
  const c = Object.fromEntries(m.components.map((x) => [x.key, x.seconds])) as Record<string, number>
  const out = m.outbound!
  const path = profilePath(out)
  const tLaunch = c.call + (c.wait ?? 0) + c.launch
  const tCruise = tLaunch + c.climb
  const tArrive = tCruise + c.cruise
  const start = path[0]
  const end = path[path.length - 1]
  const mk = (position: LngLat, status: string, arrived = false): Mover => ({ kind: 'drone', position, status, arrived })
  if (t < c.call) return mk(start, 'Zpracování výzvy')
  if (t < tLaunch) return mk(start, c.wait && t < c.call + c.wait ? 'Čekání na dron' : 'Příprava ke startu')
  if (t < tCruise) return mk(start, 'Stoupání')
  if (t < tArrive) return mk(alongPath(path, (t - tCruise) / c.cruise), 'Na trase')
  if (t < m.deliveredS) return mk(end, 'Doručování AED')
  if (t < m.atPatientS) return mk(end, 'AED na zemi – svědek pro něj jde', false)
  const back = m.inbound
  if (!back) return mk(end, 'AED u pacienta · dron zůstává na místě', true)
  const tBack = m.deliveredS + back.takeoffS + back.holdClimbS
  if (t < tBack + back.cruiseS && back.cruiseS > 0)
    return mk(alongPath(profilePath(back), Math.max(0, t - tBack) / back.cruiseS), 'AED u pacienta · návrat na základnu', true)
  return mk(start, 'AED u pacienta · dron zpět na základně', true)
}

export function responderAt(r: ResponderResult, t: number): Mover {
  const travelKey = r.kind === 'hems' ? 'flight' : r.kind === 'public-aed' ? 'out' : 'drive'
  let lead = 0
  let travel = 0
  let after = 0
  let seen = false
  for (const c of r.components) {
    if (c.key === travelKey) {
      travel = c.seconds
      seen = true
    } else if (!seen) lead += c.seconds
    else after += c.seconds
  }
  const route = r.route
  const mk = (position: LngLat, status: string, arrived = false): Mover => ({ kind: r.kind, position, status, arrived })
  if (r.kind === 'public-aed') {
    if (t < lead) return mk(route[0], 'Svědek u pacienta')
    if (t < lead + travel) return mk(alongPath(route, (t - lead) / travel), 'Běží pro AED')
    if (t < r.totalS) return mk(alongPath([...route].reverse(), (t - lead - travel) / after), 'Vrací se s AED')
    return mk(route[0], 'AED u pacienta', true)
  }
  const road = r.kind === 'hems' ? route : route.slice(0, -1)
  const last = route[route.length - 1]
  if (t < lead) return mk(route[0], 'Vyrozuměno, ještě nevyjeli')
  if (t < lead + travel) return mk(alongPath(road, (t - lead) / travel), r.kind === 'hems' ? 'V letu' : 'Na cestě')
  if (t < r.totalS) return mk(r.kind === 'hems' ? last : lerp(road[road.length - 1], last, (t - lead - travel) / after), 'Pěšky k pacientovi')
  return mk(last, 'U pacienta', true)
}

/** Length of the playback: until the slowest shown responder has arrived (max 90 min). */
export function playbackDuration(best: DroneMission | null, responders: ResponderResult[]): number {
  let d = 0
  if (best) d = Math.max(d, best.inbound ? best.deliveredS + flightTimeS(best.inbound) : best.atPatientS)
  for (const r of responders) if (r.available) d = Math.max(d, r.totalS)
  return Math.min(Math.max(d, 60) + 20, 90 * 60)
}
