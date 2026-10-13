// Loads the bundled dataset (public/data) into the structures the simulation uses.
// Pure parsing: the byte sources are injected so the same code runs in the browser, the
// worker and in Node tests.
import type { Station } from '../sim/comparators'
import type { DemandCategory, DemandPoint } from '../sim/coverage'
import { coarsen, type Dem } from '../sim/dem'
import type { RoadGraph } from '../sim/roads'
import type { LngLat, Zone } from '../sim/types'

export interface Manifest {
  retrievedAt: string
  builtAt: string
  extent: { south: number; west: number; north: number; east: number }
  dem: { zoom: number; px0: number; py0: number; width: number; height: number; min: number; max: number }
  counts: Record<string, number>
}

export interface Facility {
  id: string
  kind: 'ambulance' | 'fire' | 'mountain-rescue' | 'hospital'
  name: string
  lon: number
  lat: number
  ele?: number
  address?: string
  crews?: string
  source?: string
}

export interface RawDemand {
  id: string
  name: string
  category: DemandCategory
  lon: number
  lat: number
  ele?: number
  population?: number
  place?: string
  sub?: string
}

export interface Aerodrome {
  id: string
  kind: 'aerodrome' | 'heliport' | 'helipad'
  name: string
  icao?: string
  lon: number
  lat: number
}

export interface MappedAed {
  id: string
  name: string
  lon: number
  lat: number
  location?: string
  access?: string
  openingHours?: string
}

export interface Places {
  demand: RawDemand[]
  facilities: Facility[]
  aeds: MappedAed[]
  aerodromes: Aerodrome[]
}

export interface RoadsMeta {
  nodes: number
  edges: number
  geometryPoints: number
  layout: Record<string, { offset: number; length: number; type: string }>
  kmByClass: number[]
}

export interface World {
  manifest: Manifest
  dem: Dem
  /** coarse grid (≈ 300 m) for coverage rasters; each cell is the max of the fine cells */
  grid: Dem
  /** 1 where the coarse cell lies in Czech territory */
  gridMask: Uint8Array
  roads: RoadGraph
  places: Places
  demand: DemandPoint[]
  hemsBase: Station | null
}

export const GRID_FACTOR = 3

const TYPED = { Float32Array, Uint32Array, Uint8Array } as const

export function parseRoads(buf: ArrayBuffer, meta: RoadsMeta): RoadGraph {
  const out: Record<string, unknown> = {}
  for (const [k, l] of Object.entries(meta.layout)) {
    const C = TYPED[l.type as keyof typeof TYPED]
    out[k] = new C(buf, l.offset, l.length)
  }
  return out as unknown as RoadGraph
}

/** Categories for which a clear landing spot is assumed to exist. */
export const OPEN_SITE: Record<DemandCategory, boolean> = {
  settlement: true,
  resort: true,
  hut: true,
  viewpoint: false,
  peak: false,
  trail: false,
}

export function buildWorld(input: {
  manifest: Manifest
  dem: ArrayBuffer
  mask: ArrayBuffer
  roads: ArrayBuffer
  roadsMeta: RoadsMeta
  places: Places
}): World {
  const m = input.manifest.dem
  const dem: Dem = { zoom: m.zoom, px0: m.px0, py0: m.py0, width: m.width, height: m.height, data: new Int16Array(input.dem) }
  const grid = coarsen(dem, GRID_FACTOR)
  const fine = new Uint8Array(input.mask)
  const gridMask = new Uint8Array(grid.width * grid.height)
  for (let r = 0; r < grid.height; r++)
    for (let c = 0; c < grid.width; c++)
      gridMask[r * grid.width + c] = fine[(r * GRID_FACTOR + 1) * dem.width + c * GRID_FACTOR + 1]

  const demand: DemandPoint[] = input.places.demand.map((d) => ({
    id: d.id,
    name: d.name,
    category: d.category,
    position: [d.lon, d.lat],
    population: d.population,
    site: OPEN_SITE[d.category] ? 'open' : 'no-landing',
  }))
  const hems = input.places.aerodromes.find((a) => /Kryštof 05/i.test(a.name))
  return {
    manifest: input.manifest,
    dem,
    grid,
    gridMask,
    roads: parseRoads(input.roads, input.roadsMeta),
    places: input.places,
    demand,
    hemsBase: hems ? { id: hems.id, name: 'LZS Ostrava (Kryštof 05), Ostrava-Zábřeh', position: [hems.lon, hems.lat] } : null,
  }
}

/** Fetches the dataset relative to the app base URL. */
export async function loadWorld(base: string): Promise<World> {
  const get = async (name: string) => {
    const res = await fetch(base + 'data/' + name)
    if (!res.ok) throw new Error(`Nepodařilo se načíst data/${name} (HTTP ${res.status})`)
    return res
  }
  const [manifest, dem, mask, roads, roadsMeta, places] = await Promise.all([
    get('manifest.json').then((r) => r.json()),
    get('dem.bin').then((r) => r.arrayBuffer()),
    get('cz-mask.bin').then((r) => r.arrayBuffer()),
    get('roads.bin').then((r) => r.arrayBuffer()),
    get('roads.json').then((r) => r.json()),
    get('places.json').then((r) => r.json()),
  ])
  return buildWorld({ manifest, dem, mask, roads, roadsMeta, places })
}

/**
 * Illustrative keep-out circles around aerodromes. These are NOT the official UAS geographic
 * zones; they exist so that the effect of airspace constraints can be explored.
 */
export function defaultZones(places: Places): Zone[] {
  const zones: Zone[] = []
  for (const a of places.aerodromes) {
    if (a.kind !== 'aerodrome') continue
    const major = a.icao === 'LKMT'
    zones.push({
      id: 'zone-' + a.id,
      name: a.icao ? `${a.name} (${a.icao})` : a.name,
      center: [a.lon, a.lat] as LngLat,
      radiusM: major ? 5500 : 2000,
      kind: 'aerodrome',
      enforced: false,
      note: major
        ? 'Ilustrativní kruh 5,5 km kolem vztažného bodu letiště (vzdálenost z dřívějších českých pravidel pro CTR). Nejde o oficiální CTR.'
        : 'Ilustrativní kruh 2 km. Nejde o oficiální ATZ.',
    })
  }
  return zones
}
