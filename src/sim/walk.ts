import { elevationAt, type Dem } from './dem'
import { distanceM, lerp } from './geo'
import type { LngLat } from './types'

export interface WalkParams {
  /** Tobler's off-path multiplier (0.6) applies when true */
  offPath: boolean
  /** multiplier on walking speed (load carried, brisk pace …) */
  speedFactor: number
  /** multiplier on straight-line distance for path winding */
  detour: number
}

/**
 * Tobler's hiking function (Tobler 1993): v = 6·exp(−3.5·|slope + 0.05|) km/h, slope = dh/dx.
 * Level ground ≈ 5 km/h; fastest on a gentle downhill.
 */
export function toblerSpeedMs(slope: number, offPath: boolean): number {
  return ((6 * Math.exp(-3.5 * Math.abs(slope + 0.05))) / 3.6) * (offPath ? 0.6 : 1)
}

/** Walking time in seconds along the straight line a→b over the terrain model. */
export function walkTimeS(dem: Dem, a: LngLat, b: LngLat, p: WalkParams): number {
  const d = distanceM(a, b)
  if (d < 0.5) return 0
  const parts = Math.max(1, Math.ceil(d / 50))
  let t = 0
  let prev = elevationAt(dem, a)
  const seg = d / parts
  for (let i = 1; i <= parts; i++) {
    const z = elevationAt(dem, lerp(a, b, i / parts))
    const v = toblerSpeedMs((z - prev) / seg, p.offPath) * p.speedFactor
    t += (seg * p.detour) / v
    prev = z
  }
  return t
}
