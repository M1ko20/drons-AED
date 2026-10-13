import type { LngLat } from './types'

export const EARTH_R = 6371008.8
const D2R = Math.PI / 180

/** Great-circle distance in metres (haversine). */
export function distanceM(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * D2R
  const dLon = (b[0] - a[0]) * D2R
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * D2R) * Math.cos(b[1] * D2R) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** Initial bearing from a to b, degrees clockwise from north. */
export function bearingDeg(a: LngLat, b: LngLat): number {
  const y = Math.sin((b[0] - a[0]) * D2R) * Math.cos(b[1] * D2R)
  const x =
    Math.cos(a[1] * D2R) * Math.sin(b[1] * D2R) -
    Math.sin(a[1] * D2R) * Math.cos(b[1] * D2R) * Math.cos((b[0] - a[0]) * D2R)
  return (Math.atan2(y, x) / D2R + 360) % 360
}

/** Linear interpolation in lon/lat; adequate for the < 100 km legs used here. */
export function lerp(a: LngLat, b: LngLat, t: number): LngLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

/** Point at `dist` metres from `a` on bearing `brg` (degrees). */
export function destination(a: LngLat, brg: number, dist: number): LngLat {
  const d = dist / EARTH_R
  const b = brg * D2R
  const lat1 = a[1] * D2R
  const lon1 = a[0] * D2R
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b))
  const lon2 =
    lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return [lon2 / D2R, lat2 / D2R]
}

export function pathLengthM(path: LngLat[]): number {
  let d = 0
  for (let i = 1; i < path.length; i++) d += distanceM(path[i - 1], path[i])
  return d
}

/** Local equirectangular projection around a reference point: metres east / north. */
export function toLocal(p: LngLat, ref: LngLat): [number, number] {
  return [(p[0] - ref[0]) * D2R * EARTH_R * Math.cos(ref[1] * D2R), (p[1] - ref[1]) * D2R * EARTH_R]
}

export function fromLocal(xy: [number, number], ref: LngLat): LngLat {
  return [ref[0] + xy[0] / (D2R * EARTH_R * Math.cos(ref[1] * D2R)), ref[1] + xy[1] / (D2R * EARTH_R)]
}

/** Shortest distance from point p to segment ab, in the same planar units. */
export function pointSegDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  let t = l2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

export function pointInRing(p: LngLat, ring: LngLat[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** rings[0] is the outer ring, the rest are holes. */
export function pointInPolygon(p: LngLat, rings: LngLat[][]): boolean {
  if (!rings.length || !pointInRing(p, rings[0])) return false
  for (let i = 1; i < rings.length; i++) if (pointInRing(p, rings[i])) return false
  return true
}

export interface BBox {
  west: number
  south: number
  east: number
  north: number
}

export function inBBox(p: LngLat, b: BBox): boolean {
  return p[0] >= b.west && p[0] <= b.east && p[1] >= b.south && p[1] <= b.north
}

/** Web-Mercator pixel coordinates at a zoom level (256 px tiles). */
export function lonToPx(lon: number, z: number): number {
  return ((lon + 180) / 360) * 256 * 2 ** z
}
export function latToPx(lat: number, z: number): number {
  const s = Math.sin(lat * D2R)
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z
}
export function pxToLon(px: number, z: number): number {
  return (px / (256 * 2 ** z)) * 360 - 180
}
export function pxToLat(py: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * py) / (256 * 2 ** z)
  return Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))) / D2R
}
