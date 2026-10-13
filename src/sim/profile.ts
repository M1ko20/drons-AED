import { elevationAt, type Dem } from './dem'
import { bearingDeg, distanceM, lerp } from './geo'
import type { FlightProfile, LngLat, ProfileSample } from './types'
import { groundSpeed } from './wind'

export interface ProfileParams {
  cruiseMs: number
  /** climb / descent rate available in forward flight */
  climbMs: number
  descentMs: number
  /** vertical (hover) rates used for the take-off climb and the final descent */
  vertClimbMs: number
  vertDescentMs: number
  /** clearance above terrain the route must hold en route */
  minAglM: number
  /** height above the start point reached vertically before forward flight begins */
  transitionAglM: number
  /** height above the end point of the final hover */
  approachAglM: number
  /** height above ground at t=0 (0 = on the ground) and at the end (0 = landed) */
  startHeightAglM: number
  endHeightAglM: number
  ceilingAmslM: number
  windMs: number
  windFromDeg: number
  /** sampling interval along the track, m */
  stepM: number
  /** aircraft without hover capability: no vertical take-off or final descent phase */
  noHover?: boolean
  /** keep per-sample output (off for bulk coverage runs) */
  keepSamples?: boolean
}

const fail = (reason: FlightProfile['reason'], path: LngLat[], horizM: number): FlightProfile => ({
  ok: false,
  reason,
  horizM,
  takeoffS: 0,
  holdClimbS: 0,
  cruiseS: 0,
  holdDescentS: 0,
  finalDescentS: 0,
  totalAscentM: 0,
  maxAltAmslM: 0,
  maxAglM: 0,
  airDistanceM: 0,
  meanGroundSpeedMs: 0,
  samples: [],
  path,
  detoured: path.length > 2,
})

/** Airborne time of a leg: hover climb, holding climb, cruise, holding descent, hover descent. */
export const flightTimeS = (p: FlightProfile) => p.takeoffS + p.holdClimbS + p.cruiseS + p.holdDescentS + p.finalDescentS

/**
 * Terrain-aware vertical profile along a given lateral path.
 *
 * APPROXIMATION (stated in the UI): the lateral track is the straight line between waypoints;
 * the aircraft flies the lowest altitude profile h(s) such that
 *   (1) h(s) ≥ terrain(s) + clearance(s)        clearance ramps up after take-off and down
 *                                               before the delivery hover, capped at minAgl
 *   (2) dh/ds ≤  climbRate / groundSpeed        cannot out-climb the aircraft
 *   (3) dh/ds ≥ −descentRate / groundSpeed      cannot out-descend it
 * This is the slope-limited upper envelope of the terrain, obtained with one backward pass
 * (start climbing early enough for what lies ahead) and one forward pass (descent limit).
 * If the terrain right at the start is too steep, h(0) rises and the excess is flown as a
 * longer vertical take-off climb.
 *
 *   time = verticalClimb/vertClimbRate + Σ ds/groundSpeed + verticalDescent/vertDescentRate
 */
export function computeProfile(dem: Dem, path: LngLat[], p: ProfileParams): FlightProfile {
  const n = path.length
  if (n < 2) throw new Error('path needs at least two points')

  // --- sample the lateral track
  const lon: number[] = []
  const lat: number[] = []
  const s: number[] = []
  const gsSeg: number[] = [] // ground speed on segment i → i+1
  let horiz = 0
  lon.push(path[0][0])
  lat.push(path[0][1])
  s.push(0)
  for (let k = 1; k < n; k++) {
    const a = path[k - 1]
    const b = path[k]
    const len = distanceM(a, b)
    if (len < 1e-6) continue
    const g = groundSpeed(p.cruiseMs, bearingDeg(a, b), p.windMs, p.windFromDeg)
    if (!g.ok) return fail('wind', path, horiz + len)
    const parts = Math.max(1, Math.ceil(len / p.stepM))
    for (let j = 1; j <= parts; j++) {
      const q = lerp(a, b, j / parts)
      lon.push(q[0])
      lat.push(q[1])
      s.push(horiz + (len * j) / parts)
      gsSeg.push(g.gs)
    }
    horiz += len
  }
  const m = s.length

  const z = new Float64Array(m)
  for (let i = 0; i < m; i++) z[i] = elevationAt(dem, [lon[i], lat[i]])

  if (m === 1) {
    // start and end coincide: straight up to the hover height, then down
    const top = Math.max(p.transitionAglM, p.approachAglM, p.startHeightAglM, p.endHeightAglM)
    const up = p.noHover ? 0 : (top - p.startHeightAglM) / p.vertClimbMs
    const down = p.noHover ? 0 : (top - p.endHeightAglM) / p.vertDescentMs
    return {
      ok: z[0] + top <= p.ceilingAmslM,
      reason: z[0] + top <= p.ceilingAmslM ? undefined : 'ceiling',
      horizM: 0,
      takeoffS: up,
      holdClimbS: 0,
      cruiseS: 0,
      holdDescentS: 0,
      finalDescentS: down,
      totalAscentM: top - p.startHeightAglM,
      maxAltAmslM: z[0] + top,
      maxAglM: top,
      airDistanceM: 0,
      meanGroundSpeedMs: 0,
      samples: p.keepSamples ? [{ s: 0, lon: lon[0], lat: lat[0], terrainM: z[0], altM: z[0] + top }] : [],
      path,
      detoured: false,
    }
  }

  // --- required clearance: ramps from the transition height / to the approach height
  const upAvail = new Float64Array(m) // height gainable since the start at max climb gradient
  const dnAvail = new Float64Array(m) // height that can still be shed before the end
  for (let i = 1; i < m; i++) upAvail[i] = upAvail[i - 1] + (p.climbMs / gsSeg[i - 1]) * (s[i] - s[i - 1])
  for (let i = m - 2; i >= 0; i--) dnAvail[i] = dnAvail[i + 1] + (p.descentMs / gsSeg[i]) * (s[i + 1] - s[i])

  const h = new Float64Array(m)
  for (let i = 0; i < m; i++) {
    const clearance = Math.min(p.minAglM, p.transitionAglM + upAvail[i], p.approachAglM + dnAvail[i])
    h[i] = z[i] + clearance
  }
  h[0] = Math.max(h[0], z[0] + p.startHeightAglM)
  h[m - 1] = Math.max(h[m - 1], z[m - 1] + p.endHeightAglM)

  // backward pass: climb limit; forward pass: descent limit
  for (let i = m - 2; i >= 0; i--) {
    const need = h[i + 1] - (p.climbMs / gsSeg[i]) * (s[i + 1] - s[i])
    if (need > h[i]) h[i] = need
  }
  for (let i = 1; i < m; i++) {
    const floor = h[i - 1] - (p.descentMs / gsSeg[i - 1]) * (s[i] - s[i - 1])
    if (floor > h[i]) h[i] = floor
  }

  let cruiseS = 0
  let ascent = 0
  let maxAlt = -Infinity
  let maxAgl = -Infinity
  for (let i = 0; i < m; i++) {
    if (h[i] > maxAlt) maxAlt = h[i]
    if (h[i] - z[i] > maxAgl) maxAgl = h[i] - z[i]
    if (i > 0) {
      cruiseS += (s[i] - s[i - 1]) / gsSeg[i - 1]
      if (h[i] > h[i - 1]) ascent += h[i] - h[i - 1]
    }
  }
  // split the vertical legs at both ends into a hover part and a holding-pattern part
  const hoverTop = z[0] + Math.max(Math.min(p.minAglM, p.transitionAglM), p.startHeightAglM)
  const hoverUp = Math.max(0, Math.min(h[0], hoverTop) - (z[0] + p.startHeightAglM))
  const holdUp = Math.max(0, h[0] - hoverTop)
  const hoverBottom = z[m - 1] + Math.max(Math.min(p.minAglM, p.approachAglM), p.endHeightAglM)
  const holdDown = Math.max(0, h[m - 1] - hoverBottom)
  const hoverDown = Math.max(0, Math.min(h[m - 1], hoverBottom) - (z[m - 1] + p.endHeightAglM))
  ascent += hoverUp + holdUp
  const holdClimbS = holdUp / p.climbMs
  const holdDescentS = holdDown / p.descentMs

  const samples: ProfileSample[] = []
  if (p.keepSamples) {
    for (let i = 0; i < m; i++) samples.push({ s: s[i], lon: lon[i], lat: lat[i], terrainM: z[i], altM: h[i] })
  }

  const ok = maxAlt <= p.ceilingAmslM
  return {
    ok,
    reason: ok ? undefined : 'ceiling',
    horizM: horiz,
    takeoffS: p.noHover ? 0 : hoverUp / p.vertClimbMs,
    holdClimbS,
    cruiseS,
    holdDescentS,
    finalDescentS: p.noHover ? 0 : hoverDown / p.vertDescentMs,
    totalAscentM: ascent,
    maxAltAmslM: maxAlt,
    maxAglM: maxAgl,
    airDistanceM: p.cruiseMs * (cruiseS + holdClimbS + holdDescentS),
    meanGroundSpeedMs: cruiseS > 0 ? horiz / cruiseS : 0,
    samples,
    path,
    detoured: path.length > 2,
  }
}
