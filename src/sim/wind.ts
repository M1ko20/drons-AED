const D2R = Math.PI / 180

export interface GroundSpeed {
  ok: boolean
  /** speed over ground along the track, m/s */
  gs: number
  /** tailwind component (negative = headwind), m/s */
  along: number
  cross: number
}

/**
 * Wind triangle. The aircraft holds `airspeedMs` through the air and crabs into the wind so
 * that its ground track follows `trackDeg`.
 *
 *   cross = W·sin(θ)   along = −W·cos(θ)   with θ = windFrom − track
 *   gs    = sqrt(V² − cross²) + along
 *
 * Not flyable when the crosswind alone exceeds the airspeed or the result is not making
 * meaningful headway (< 2 m/s over ground).
 */
export function groundSpeed(airspeedMs: number, trackDeg: number, windMs: number, windFromDeg: number): GroundSpeed {
  if (windMs <= 0) return { ok: airspeedMs > 0, gs: airspeedMs, along: 0, cross: 0 }
  const theta = (windFromDeg - trackDeg) * D2R
  const cross = windMs * Math.sin(theta)
  const along = -windMs * Math.cos(theta)
  if (Math.abs(cross) >= airspeedMs) return { ok: false, gs: 0, along, cross }
  const gs = Math.sqrt(airspeedMs * airspeedMs - cross * cross) + along
  return { ok: gs >= 2, gs: Math.max(gs, 0), along, cross }
}
