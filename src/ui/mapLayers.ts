// Raster and vector overlays derived from the bundled data and from simulation results.
import type { StyleSpecification } from 'maplibre-gl'
import { demBounds, type Dem } from '../sim/dem'
import { destination } from '../sim/geo'
import { N_ROAD_CLASSES, type RoadGraph } from '../sim/roads'
import type { LngLat } from '../sim/types'

/** Responder colours (validated categorical slots); every use also carries a label or dash pattern. */
export const COLORS = {
  drone: '#2a78d6',
  'ground-ems': '#eb6834',
  'mountain-rescue': '#1baf7a',
  hems: '#e87ba4',
  'public-aed': '#6250d6',
  good: '#0ca30c',
  critical: '#d03b3b',
} as const

/** One-hue ordinal ramp, darkest = fastest. Bands are multiples of the target time. */
export const COVERAGE_BANDS = [
  { upTo: 0.5, color: '#0d366b', label: '≤ ½ cíle' },
  { upTo: 1, color: '#256abf', label: '≤ cíl' },
  { upTo: 1.5, color: '#6da7ec', label: '≤ 1½ × cíl' },
  { upTo: 2, color: '#b7d3f6', label: '≤ 2 × cíl' },
  { upTo: Infinity, color: '#e2ecf8', label: 'pomaleji, ale dosažitelné' },
] as const

export const bandIndex = (timeS: number, targetS: number) => {
  if (!isFinite(timeS)) return -1
  const r = timeS / targetS
  for (let i = 0; i < COVERAGE_BANDS.length; i++) if (r <= COVERAGE_BANDS[i].upTo) return i
  return COVERAGE_BANDS.length - 1
}

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

export const imageCoords = (dem: Dem): [[number, number], [number, number], [number, number], [number, number]] => {
  const b = demBounds(dem)
  return [
    [b.west, b.north],
    [b.east, b.north],
    [b.east, b.south],
    [b.west, b.south],
  ]
}

/** Coverage raster: one pixel per grid cell; cells that cannot be served are hatched, not coloured. */
export function coverageCanvas(time: Float32Array, mask: Uint8Array, width: number, height: number, targetS: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(width, height)
  const rgb = COVERAGE_BANDS.map((b) => hex(b.color))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const o = i * 4
      if (!mask[i]) continue
      const b = bandIndex(time[i], targetS)
      if (b < 0) {
        // not servable: diagonal hatch so the class does not rely on colour
        if ((x + y) % 3 === 0) {
          img.data[o] = 70
          img.data[o + 1] = 70
          img.data[o + 2] = 70
          img.data[o + 3] = 120
        }
        continue
      }
      img.data[o] = rgb[b][0]
      img.data[o + 1] = rgb[b][1]
      img.data[o + 2] = rgb[b][2]
      img.data[o + 3] = b === 0 ? 175 : b === 1 ? 165 : 150
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL()
}

/**
 * Hillshade (Horn's method, light from the north-west). With `tint` the canvas also carries a
 * pale elevation tint and is opaque — used as the whole background in offline mode.
 */
export function hillshadeCanvas(dem: Dem, tint: boolean): string {
  const { width: w, height: h, data } = dem
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(w, h)
  const cell = 99.6
  const az = (315 * Math.PI) / 180
  const alt = (45 * Math.PI) / 180
  const lx = Math.cos(alt) * Math.sin(az)
  const ly = Math.cos(alt) * Math.cos(az)
  const lz = Math.sin(alt)
  const at = (x: number, y: number) => data[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dzdx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) / (8 * cell)
      const dzdy = (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) - at(x - 1, y + 1) - 2 * at(x, y + 1) - at(x + 1, y + 1)) / (8 * cell)
      const z = 2 // vertical exaggeration
      const nx = -dzdx * z
      const ny = -dzdy * z
      const norm = Math.hypot(nx, ny, 1)
      const shade = Math.max(0, (nx * lx + ny * ly + lz) / norm)
      const o = (y * w + x) * 4
      if (tint) {
        const e = Math.max(0, Math.min(1, (at(x, y) - 250) / 1000))
        const k = 0.55 + 0.6 * shade
        img.data[o] = Math.min(255, (236 - 26 * e) * k)
        img.data[o + 1] = Math.min(255, (238 - 14 * e) * k)
        img.data[o + 2] = Math.min(255, (226 - 30 * e) * k)
        img.data[o + 3] = 255
      } else {
        const d = shade - lz
        if (d < 0) {
          img.data[o + 3] = Math.min(150, -d * 420)
        } else {
          img.data[o] = img.data[o + 1] = img.data[o + 2] = 255
          img.data[o + 3] = Math.min(110, d * 300)
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL()
}

export function circlePolygon(center: LngLat, radiusM: number, steps = 64): LngLat[] {
  const ring: LngLat[] = []
  for (let i = 0; i <= steps; i++) ring.push(destination(center, (360 * i) / steps, radiusM))
  return ring
}

/** Main roads of the bundled network, for the offline background. */
export function roadsGeoJSON(g: RoadGraph, maxClass: number): GeoJSON.FeatureCollection {
  const byClass: LngLat[][][] = Array.from({ length: N_ROAD_CLASSES }, () => [])
  for (let e = 0; e < g.edgeFrom.length; e++) {
    const c = g.edgeClass[e]
    if (c > maxClass) continue
    const line: LngLat[] = []
    for (let i = g.geomStart[e]; i < g.geomStart[e + 1]; i++) line.push([g.geomLon[i], g.geomLat[i]])
    byClass[c].push(line)
  }
  return {
    type: 'FeatureCollection',
    features: byClass
      .map((lines, cls) => ({ type: 'Feature' as const, properties: { cls }, geometry: { type: 'MultiLineString' as const, coordinates: lines } }))
      .filter((f) => f.geometry.coordinates.length),
  }
}

export const OFFLINE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eceee6' } }],
}

export const ONLINE_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'

/** Fetches the online basemap style; rejects quickly when offline so the app can fall back. */
export async function fetchOnlineStyle(): Promise<StyleSpecification> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6000)
  try {
    const res = await fetch(ONLINE_STYLE_URL, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as StyleSpecification
  } finally {
    clearTimeout(timer)
  }
}
