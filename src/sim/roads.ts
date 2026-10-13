import { EARTH_R } from './geo'
import type { LngLat } from './types'

/** Road classes, index = class id stored per edge. */
export const ROAD_CLASSES = [
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
  'service',
  'track (paved / grade 1)',
  'track (other)',
] as const
export const N_ROAD_CLASSES = ROAD_CLASSES.length

export interface RoadGraph {
  nodeLon: Float32Array
  nodeLat: Float32Array
  edgeFrom: Uint32Array
  edgeTo: Uint32Array
  edgeLenM: Float32Array
  edgeClass: Uint8Array
  /** 1 = passable only from → to */
  edgeOneway: Uint8Array
  /** polyline of edge e is geom[geomStart[e] … geomStart[e+1]) including both end nodes */
  geomStart: Uint32Array
  geomLon: Float32Array
  geomLat: Float32Array
}

export interface Adjacency {
  start: Uint32Array
  /** edge index; direction is forward when edgeFrom[e] is the node the list belongs to */
  edge: Uint32Array
}

export function buildAdjacency(g: RoadGraph): Adjacency {
  const n = g.nodeLon.length
  const e = g.edgeFrom.length
  const count = new Uint32Array(n + 1)
  for (let i = 0; i < e; i++) {
    count[g.edgeFrom[i] + 1]++
    count[g.edgeTo[i] + 1]++
  }
  for (let i = 0; i < n; i++) count[i + 1] += count[i]
  const fill = count.slice(0, n)
  const edge = new Uint32Array(2 * e)
  for (let i = 0; i < e; i++) {
    edge[fill[g.edgeFrom[i]]++] = i
    edge[fill[g.edgeTo[i]]++] = i
  }
  return { start: count, edge }
}

/** Binary min-heap over (key, value) pairs in typed arrays. */
class Heap {
  private keys: Float64Array
  private vals: Int32Array
  size = 0
  constructor(cap: number) {
    this.keys = new Float64Array(cap)
    this.vals = new Int32Array(cap)
  }
  push(k: number, v: number) {
    if (this.size === this.keys.length) {
      const nk = new Float64Array(this.size * 2)
      nk.set(this.keys)
      this.keys = nk
      const nv = new Int32Array(this.size * 2)
      nv.set(this.vals)
      this.vals = nv
    }
    let i = this.size++
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.keys[p] <= k) break
      this.keys[i] = this.keys[p]
      this.vals[i] = this.vals[p]
      i = p
    }
    this.keys[i] = k
    this.vals[i] = v
  }
  topKey() {
    return this.keys[0]
  }
  pop(): number {
    const top = this.vals[0]
    const k = this.keys[--this.size]
    const v = this.vals[this.size]
    let i = 0
    for (;;) {
      let c = 2 * i + 1
      if (c >= this.size) break
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++
      if (this.keys[c] >= k) break
      this.keys[i] = this.keys[c]
      this.vals[i] = this.vals[c]
      i = c
    }
    this.keys[i] = k
    this.vals[i] = v
    return top
  }
}

export interface TravelField {
  /** seconds from the nearest source; Infinity when unreachable */
  time: Float64Array
  /** edge used to reach the node, -1 at sources / unreachable */
  pred: Int32Array
  /** index into the `sources` array of the source that reaches the node first */
  source: Int32Array
}

/**
 * Multi-source Dijkstra over travel time. `speedMs[class]` = 0 marks a class as not drivable.
 * One-way edges are honoured in the outbound (source → destination) direction.
 */
export function travelTimes(
  g: RoadGraph,
  adj: Adjacency,
  sources: { node: number; t0: number }[],
  speedMs: ArrayLike<number>,
): TravelField {
  const n = g.nodeLon.length
  // Float64: heap keys are doubles, and comparing them with rounded Float32 values would
  // make nodes look stale and stop the search
  const time = new Float64Array(n).fill(Infinity)
  const pred = new Int32Array(n).fill(-1)
  const source = new Int32Array(n).fill(-1)
  const heap = new Heap(1024)
  sources.forEach((s, i) => {
    if (s.node >= 0 && s.t0 < time[s.node]) {
      time[s.node] = s.t0
      source[s.node] = i
      heap.push(s.t0, s.node)
    }
  })
  while (heap.size) {
    const k = heap.topKey()
    const u = heap.pop()
    if (k > time[u]) continue
    for (let a = adj.start[u]; a < adj.start[u + 1]; a++) {
      const e = adj.edge[a]
      const sp = speedMs[g.edgeClass[e]]
      if (!sp) continue
      const forward = g.edgeFrom[e] === u
      if (!forward && g.edgeOneway[e]) continue
      const v = forward ? g.edgeTo[e] : g.edgeFrom[e]
      const t = k + g.edgeLenM[e] / sp
      if (t < time[v]) {
        time[v] = t
        pred[v] = e
        source[v] = source[u]
        heap.push(t, v)
      }
    }
  }
  return { time, pred, source }
}

const D2R = Math.PI / 180

export interface Snap {
  edge: number
  /** nearest point on the edge polyline */
  point: LngLat
  /** straight-line distance from the query point, m */
  offsetM: number
  /** distance along the edge from its `from` node, m */
  alongM: number
  /** index of the geometry vertex that starts the segment containing the point */
  geomIndex: number
}

/** Uniform-grid index over road segments for nearest-road queries. */
export class RoadIndex {
  private cells = new Map<number, number[]>()
  private kx: number
  private ky: number
  private lon0: number
  private lat0: number
  /** segment i runs from geometry vertex segA[i] to segA[i]+1 on edge segEdge[i] */
  private segA: number[] = []
  private segEdge: number[] = []
  private readonly cellM = 250

  constructor(
    private g: RoadGraph,
    /** which edges may be snapped to */
    edgeAllowed: (edge: number) => boolean,
  ) {
    let minLon = Infinity
    let minLat = Infinity
    let maxLat = -Infinity
    for (let i = 0; i < g.geomLon.length; i++) {
      if (g.geomLon[i] < minLon) minLon = g.geomLon[i]
      if (g.geomLat[i] < minLat) minLat = g.geomLat[i]
      if (g.geomLat[i] > maxLat) maxLat = g.geomLat[i]
    }
    this.lon0 = minLon
    this.lat0 = minLat
    // planar approximation about the mid-latitude of the network (< 0.6 % error over 0.5°)
    this.ky = D2R * EARTH_R
    this.kx = this.ky * Math.cos(((minLat + maxLat) / 2) * D2R)
    for (let e = 0; e < g.edgeFrom.length; e++) {
      if (!edgeAllowed(e)) continue
      for (let i = g.geomStart[e]; i < g.geomStart[e + 1] - 1; i++) {
        const id = this.segA.length
        this.segA.push(i)
        this.segEdge.push(e)
        const ax = this.x(g.geomLon[i])
        const ay = this.y(g.geomLat[i])
        const bx = this.x(g.geomLon[i + 1])
        const by = this.y(g.geomLat[i + 1])
        const c0 = Math.floor(Math.min(ax, bx) / this.cellM)
        const c1 = Math.floor(Math.max(ax, bx) / this.cellM)
        const r0 = Math.floor(Math.min(ay, by) / this.cellM)
        const r1 = Math.floor(Math.max(ay, by) / this.cellM)
        for (let r = r0; r <= r1; r++)
          for (let c = c0; c <= c1; c++) {
            const key = r * 100000 + c
            const list = this.cells.get(key)
            if (list) list.push(id)
            else this.cells.set(key, [id])
          }
      }
    }
  }

  private x(lon: number) {
    return (lon - this.lon0) * this.kx
  }
  private y(lat: number) {
    return (lat - this.lat0) * this.ky
  }

  /** Nearest point on an allowed road within `maxM`, or null. */
  nearest(p: LngLat, maxM = 20000): Snap | null {
    const g = this.g
    const px = this.x(p[0])
    const py = this.y(p[1])
    const c = Math.floor(px / this.cellM)
    const r = Math.floor(py / this.cellM)
    let best = Infinity
    let bestSeg = -1
    let bestT = 0
    const maxRing = Math.ceil(maxM / this.cellM)
    for (let ring = 0; ring <= maxRing; ring++) {
      // once a hit exists, one more ring is enough to guarantee it is the nearest
      if (bestSeg >= 0 && (ring - 1) * this.cellM > best) break
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue
          const list = this.cells.get((r + dr) * 100000 + (c + dc))
          if (!list) continue
          for (const id of list) {
            const i = this.segA[id]
            const ax = this.x(g.geomLon[i])
            const ay = this.y(g.geomLat[i])
            const dx = this.x(g.geomLon[i + 1]) - ax
            const dy = this.y(g.geomLat[i + 1]) - ay
            const l2 = dx * dx + dy * dy
            let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2
            t = Math.max(0, Math.min(1, t))
            const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if (d < best) {
              best = d
              bestSeg = id
              bestT = t
            }
          }
        }
      }
    }
    if (bestSeg < 0 || best > maxM) return null
    const i = this.segA[bestSeg]
    const e = this.segEdge[bestSeg]
    let along = 0
    for (let k = g.geomStart[e]; k < i; k++) along += this.segLen(k)
    along += this.segLen(i) * bestT
    return {
      edge: e,
      point: [
        g.geomLon[i] + (g.geomLon[i + 1] - g.geomLon[i]) * bestT,
        g.geomLat[i] + (g.geomLat[i + 1] - g.geomLat[i]) * bestT,
      ],
      offsetM: best,
      alongM: Math.min(along, g.edgeLenM[e]),
      geomIndex: i,
    }
  }

  private segLen(i: number) {
    const g = this.g
    return Math.hypot(this.x(g.geomLon[i + 1]) - this.x(g.geomLon[i]), this.y(g.geomLat[i + 1]) - this.y(g.geomLat[i]))
  }
}

export interface RoadArrival {
  timeS: number
  source: number
  distanceM: number
  route: LngLat[]
}

/** Travel time and route from the nearest source to a snapped point on the network. */
export function arrivalAt(
  g: RoadGraph,
  field: TravelField,
  snap: Snap,
  speedMs: ArrayLike<number>,
): RoadArrival | null {
  const e = snap.edge
  const sp = speedMs[g.edgeClass[e]]
  if (!sp) return null
  const u = g.edgeFrom[e]
  const v = g.edgeTo[e]
  const viaU = field.time[u] + snap.alongM / sp
  const viaV = g.edgeOneway[e] ? Infinity : field.time[v] + (g.edgeLenM[e] - snap.alongM) / sp
  const fromU = viaU <= viaV
  const timeS = fromU ? viaU : viaV
  if (!isFinite(timeS)) return null
  const entry = fromU ? u : v

  // partial geometry of the last edge, from the entry node to the snapped point
  const last: LngLat[] = []
  if (fromU) {
    for (let i = g.geomStart[e]; i <= snap.geomIndex; i++) last.push([g.geomLon[i], g.geomLat[i]])
    last.push(snap.point)
  } else {
    for (let i = g.geomStart[e + 1] - 1; i > snap.geomIndex; i--) last.push([g.geomLon[i], g.geomLat[i]])
    last.push(snap.point)
  }

  // walk the predecessor chain back to the source
  const chain: LngLat[][] = []
  let dist = fromU ? snap.alongM : g.edgeLenM[e] - snap.alongM
  let node = entry
  let guard = 0
  while (field.pred[node] >= 0 && guard++ < 1e6) {
    const pe = field.pred[node]
    const forward = g.edgeTo[pe] === node
    const seg: LngLat[] = []
    if (forward) for (let i = g.geomStart[pe]; i < g.geomStart[pe + 1]; i++) seg.push([g.geomLon[i], g.geomLat[i]])
    else for (let i = g.geomStart[pe + 1] - 1; i >= g.geomStart[pe]; i--) seg.push([g.geomLon[i], g.geomLat[i]])
    chain.push(seg)
    dist += g.edgeLenM[pe]
    node = forward ? g.edgeFrom[pe] : g.edgeTo[pe]
  }
  const route: LngLat[] = []
  for (let i = chain.length - 1; i >= 0; i--) for (const p of chain[i]) route.push(p)
  for (const p of last) route.push(p)
  return { timeS, source: field.source[entry], distanceM: dist, route }
}

/** Nearest graph node to a point (used to attach stations to the network). */
export function nearestNode(g: RoadGraph, index: RoadIndex, p: LngLat, maxM = 2000): number {
  const s = index.nearest(p, maxM)
  if (!s) return -1
  return s.alongM <= g.edgeLenM[s.edge] / 2 ? g.edgeFrom[s.edge] : g.edgeTo[s.edge]
}
