import { fromLocal, pointSegDist, toLocal } from './geo'
import type { LngLat, Zone } from './types'

type XY = [number, number]

const SIDES = 12
/** keep-out margin beyond the nominal radius */
const MARGIN = 1.03

/**
 * Lateral routing around enforced circular keep-out zones.
 *
 * Visibility graph: every zone contributes the corners of a 12-gon drawn just outside it; two
 * corners are connected when the straight segment between them stays outside every zone. The
 * shortest path over this graph is the shortest route that only turns at those corners — a close
 * (slightly long) approximation of the true tangent path. With no enforced zones every route is
 * the straight line.
 */
export class ZoneRouter {
  readonly zones: { c: XY; r: number; zone: Zone }[]
  private nodes: XY[] = []
  private adj: { to: number; d: number }[][] = []

  constructor(
    zones: Zone[],
    readonly ref: LngLat,
  ) {
    this.zones = zones.filter((z) => z.enforced).map((zone) => ({ c: toLocal(zone.center, ref), r: zone.radiusM, zone }))
    for (const z of this.zones) {
      const rr = (z.r * MARGIN) / Math.cos(Math.PI / SIDES)
      for (let k = 0; k < SIDES; k++) {
        const a = (2 * Math.PI * k) / SIDES
        const pt: XY = [z.c[0] + rr * Math.cos(a), z.c[1] + rr * Math.sin(a)]
        if (!this.inside(pt)) this.nodes.push(pt)
      }
    }
    this.adj = this.nodes.map(() => [])
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        if (this.clear(this.nodes[i], this.nodes[j])) {
          const d = Math.hypot(this.nodes[i][0] - this.nodes[j][0], this.nodes[i][1] - this.nodes[j][1])
          this.adj[i].push({ to: j, d })
          this.adj[j].push({ to: i, d })
        }
      }
    }
  }

  get active(): boolean {
    return this.zones.length > 0
  }

  private inside(p: XY): boolean {
    for (const z of this.zones) if (Math.hypot(p[0] - z.c[0], p[1] - z.c[1]) < z.r) return true
    return false
  }

  /** Enforced zone containing the point, if any. */
  zoneAt(p: LngLat): Zone | null {
    const q = toLocal(p, this.ref)
    for (const z of this.zones) if (Math.hypot(q[0] - z.c[0], q[1] - z.c[1]) < z.r) return z.zone
    return null
  }

  private clear(a: XY, b: XY): boolean {
    for (const z of this.zones) if (pointSegDist(z.c, a, b) < z.r) return false
    return true
  }

  /** Shortest distances from a start point to every graph corner (computed once per base). */
  from(start: LngLat): ZoneSource {
    return new ZoneSource(this, toLocal(start, this.ref), this.nodes, this.adj, (a, b) => this.clear(a, b))
  }
}

export class ZoneSource {
  private dist: Float64Array
  private prev: Int32Array

  constructor(
    private router: ZoneRouter,
    private start: XY,
    private nodes: XY[],
    adj: { to: number; d: number }[][],
    private clear: (a: XY, b: XY) => boolean,
  ) {
    const n = nodes.length
    this.dist = new Float64Array(n).fill(Infinity)
    this.prev = new Int32Array(n).fill(-1)
    const done = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      if (clear(start, nodes[i])) this.dist[i] = Math.hypot(start[0] - nodes[i][0], start[1] - nodes[i][1])
    }
    // O(n²) Dijkstra: n is a few dozen corners
    for (;;) {
      let u = -1
      let best = Infinity
      for (let i = 0; i < n; i++) if (!done[i] && this.dist[i] < best) ((best = this.dist[i]), (u = i))
      if (u < 0) break
      done[u] = 1
      for (const e of adj[u]) {
        if (this.dist[u] + e.d < this.dist[e.to]) {
          this.dist[e.to] = this.dist[u] + e.d
          this.prev[e.to] = u
        }
      }
    }
  }

  /** Waypoints from the start to `target` (both included), or null when no route exists. */
  pathTo(target: LngLat): LngLat[] | null {
    const ref = this.router.ref
    const t = toLocal(target, ref)
    const startLL = fromLocal(this.start, ref)
    if (!this.router.active || this.clear(this.start, t)) return [startLL, target]
    let bestNode = -1
    let best = Infinity
    for (let i = 0; i < this.nodes.length; i++) {
      if (this.dist[i] === Infinity) continue
      const d = this.dist[i] + Math.hypot(t[0] - this.nodes[i][0], t[1] - this.nodes[i][1])
      if (d < best && this.clear(this.nodes[i], t)) ((best = d), (bestNode = i))
    }
    if (bestNode < 0) return null
    const mid: LngLat[] = []
    for (let u = bestNode; u >= 0; u = this.prev[u]) mid.push(fromLocal(this.nodes[u], ref))
    mid.reverse()
    return [startLL, ...mid, target]
  }
}
