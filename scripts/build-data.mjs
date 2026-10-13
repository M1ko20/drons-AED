// Turns data/raw/* into the compact files the app bundles in public/data/.
// Deterministic for a given set of raw files.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { PNG } from 'pngjs'
import { BBOX, TERRAIN_ZOOM, TILE, lonToPx, latToPx, pxToLon, pxToLat, lonToTileX, latToTileY } from './lib/area.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RAW = path.join(ROOT, 'data', 'raw')
const OUT = path.join(ROOT, 'public', 'data')
await mkdir(OUT, { recursive: true })

const readJson = async (name) => JSON.parse(await readFile(path.join(RAW, name), 'utf8'))
const retrieved = await readJson('retrieved.json')
const round = (v, d = 5) => Math.round(v * 10 ** d) / 10 ** d
const D2R = Math.PI / 180
const R = 6371008.8
const MID_LAT = (BBOX.south + BBOX.north) / 2
const KX = D2R * R * Math.cos(MID_LAT * D2R)
const KY = D2R * R
const dist = (a, b) => Math.hypot((a[0] - b[0]) * KX, (a[1] - b[1]) * KY)

// ---------------------------------------------------------------- geometry helpers
function simplify(points, tolM) {
  if (points.length < 3) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const ax = points[a][0] * KX
    const ay = points[a][1] * KY
    const dx = points[b][0] * KX - ax
    const dy = points[b][1] * KY - ay
    const l2 = dx * dx + dy * dy
    let worst = -1
    let wd = tolM
    for (let i = a + 1; i < b; i++) {
      const px = points[i][0] * KX - ax
      const py = points[i][1] * KY - ay
      let t = l2 ? (px * dx + py * dy) / l2 : 0
      t = Math.max(0, Math.min(1, t))
      const d = Math.hypot(px - t * dx, py - t * dy)
      if (d > wd) ((wd = d), (worst = i))
    }
    if (worst > 0) {
      keep[worst] = 1
      stack.push([a, worst], [worst, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

/** Join way geometries that share end points into closed rings. */
function stitchRings(lines) {
  const key = (p) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`
  const rings = []
  const pool = lines.filter((l) => l.length > 1).map((l) => [...l])
  while (pool.length) {
    let cur = pool.pop()
    for (let guard = 0; guard < 100000; guard++) {
      if (key(cur[0]) === key(cur[cur.length - 1]) && cur.length > 3) break
      const tail = key(cur[cur.length - 1])
      const idx = pool.findIndex((l) => key(l[0]) === tail || key(l[l.length - 1]) === tail)
      if (idx < 0) break
      let next = pool.splice(idx, 1)[0]
      if (key(next[0]) !== tail) next = next.reverse()
      cur = cur.concat(next.slice(1))
    }
    if (key(cur[0]) === key(cur[cur.length - 1]) && cur.length > 3) rings.push(cur)
  }
  return rings
}

/** Sutherland–Hodgman clip of a ring against the data extent. */
function clipRing(ring, box) {
  const edges = [
    [(p) => p[0] >= box.west, (a, b) => [box.west, a[1] + ((b[1] - a[1]) * (box.west - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= box.east, (a, b) => [box.east, a[1] + ((b[1] - a[1]) * (box.east - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= box.south, (a, b) => [a[0] + ((b[0] - a[0]) * (box.south - a[1])) / (b[1] - a[1]), box.south]],
    [(p) => p[1] <= box.north, (a, b) => [a[0] + ((b[0] - a[0]) * (box.north - a[1])) / (b[1] - a[1]), box.north]],
  ]
  let out = ring
  for (const [inside, cut] of edges) {
    const src = out
    out = []
    for (let i = 0; i < src.length; i++) {
      const a = src[i]
      const b = src[(i + 1) % src.length]
      const ia = inside(a)
      const ib = inside(b)
      if (ia) out.push(a)
      if (ia !== ib) out.push(cut(a, b))
    }
    if (!out.length) return []
  }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push(out[0])
  return out
}

function inRing(p, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const wayGeom = (w) => (w.geometry ?? []).filter(Boolean).map((g) => [g.lon, g.lat])
function elementRings(el) {
  if (el.type === 'way') {
    const g = wayGeom(el)
    return g.length > 3 ? stitchRings([g]) : []
  }
  if (el.type === 'relation') {
    const outers = (el.members ?? []).filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map(wayGeom)
    return stitchRings(outers)
  }
  return []
}

// ---------------------------------------------------------------- 1. terrain
const px0 = Math.floor(lonToPx(BBOX.west, TERRAIN_ZOOM))
const px1 = Math.ceil(lonToPx(BBOX.east, TERRAIN_ZOOM))
const py0 = Math.floor(latToPx(BBOX.north, TERRAIN_ZOOM))
const py1 = Math.ceil(latToPx(BBOX.south, TERRAIN_ZOOM))
const W = px1 - px0
const H = py1 - py0
const dem = new Int16Array(W * H)
{
  const tx0 = lonToTileX(BBOX.west, TERRAIN_ZOOM)
  const tx1 = lonToTileX(BBOX.east, TERRAIN_ZOOM)
  const ty0 = latToTileY(BBOX.north, TERRAIN_ZOOM)
  const ty1 = latToTileY(BBOX.south, TERRAIN_ZOOM)
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      const png = PNG.sync.read(await readFile(path.join(RAW, 'terrain', `${TERRAIN_ZOOM}_${tx}_${ty}.png`)))
      for (let y = 0; y < TILE; y++) {
        const gy = ty * TILE + y - py0
        if (gy < 0 || gy >= H) continue
        for (let x = 0; x < TILE; x++) {
          const gx = tx * TILE + x - px0
          if (gx < 0 || gx >= W) continue
          const o = (y * TILE + x) * 4
          // terrarium encoding: elevation = R·256 + G + B/256 − 32768
          dem[gy * W + gx] = Math.round(png.data[o] * 256 + png.data[o + 1] + png.data[o + 2] / 256 - 32768)
        }
      }
    }
  }
}
let demMin = Infinity
let demMax = -Infinity
for (const v of dem) {
  if (v < demMin) demMin = v
  if (v > demMax) demMax = v
}
await writeFile(path.join(OUT, 'dem.bin'), Buffer.from(dem.buffer))
const demMeta = { zoom: TERRAIN_ZOOM, px0, py0, width: W, height: H, min: demMin, max: demMax }
console.log(`dem ${W}×${H}, ${demMin}…${demMax} m`)
const elevAt = (p) => {
  const x = Math.max(0, Math.min(W - 1, Math.floor(lonToPx(p[0], TERRAIN_ZOOM) - px0)))
  const y = Math.max(0, Math.min(H - 1, Math.floor(latToPx(p[1], TERRAIN_ZOOM) - py0)))
  return dem[y * W + x]
}

// ---------------------------------------------------------------- 2. Czech territory inside the extent
const czRel = (await readJson('cz.json')).elements[0]
const czRings = stitchRings(czRel.members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map(wayGeom))
const czClipped = czRings.map((r) => clipRing(r, BBOX)).filter((r) => r.length > 3)
if (!czClipped.length) throw new Error('Czech boundary does not intersect the extent')
const czFull = czClipped.sort((a, b) => b.length - a.length)[0]
const inCz = (p) => inRing(p, czFull)
const czSimple = simplify(czFull, 25).map((p) => [round(p[0]), round(p[1])])
const czMask = new Uint8Array(W * H)
let czCells = 0
for (let y = 0; y < H; y++) {
  const lat = pxToLat(py0 + y + 0.5, TERRAIN_ZOOM)
  // scanline: crossings of the row with the ring
  const xs = []
  for (let i = 0, j = czFull.length - 1; i < czFull.length; j = i++) {
    const [xi, yi] = czFull[i]
    const [xj, yj] = czFull[j]
    if (yi > lat !== yj > lat) xs.push(((xj - xi) * (lat - yi)) / (yj - yi) + xi)
  }
  xs.sort((a, b) => a - b)
  for (let k = 0; k + 1 < xs.length; k += 2) {
    const a = Math.max(0, Math.ceil(lonToPx(xs[k], TERRAIN_ZOOM) - px0 - 0.5))
    const b = Math.min(W - 1, Math.floor(lonToPx(xs[k + 1], TERRAIN_ZOOM) - px0 - 0.5))
    for (let x = a; x <= b; x++) {
      czMask[y * W + x] = 1
      czCells++
    }
  }
}
await writeFile(path.join(OUT, 'cz-mask.bin'), Buffer.from(czMask.buffer))
console.log(`cz ring ${czFull.length} → ${czSimple.length} pts, mask ${(100 * czCells / (W * H)).toFixed(1)} % of extent`)

// ---------------------------------------------------------------- 3. points of interest
const pois = (await readJson('pois.json')).elements
const pos = (el) => (el.type === 'node' ? [el.lon, el.lat] : el.center ? [el.center.lon, el.center.lat] : null)
const num = (v) => {
  if (v === undefined) return undefined
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'))
  return isFinite(n) ? n : undefined
}
const demand = []
const facilities = []
const aeds = []
const aero = []
const seen = new Set()
const dedupe = (kind, p, name, radiusM) => {
  const k = `${kind}|${Math.round((p[0] * KX) / radiusM)}|${Math.round((p[1] * KY) / radiusM)}|${name ?? ''}`
  if (seen.has(k)) return true
  seen.add(k)
  return false
}
for (const el of pois) {
  const p = pos(el)
  const t = el.tags ?? {}
  if (!p) continue
  const id = `${el.type[0]}${el.id}`
  const name = t['name:cs'] ?? t.name
  const inside = inCz(p) && p[1] <= BBOX.north
  const base = { id, name, lon: round(p[0]), lat: round(p[1]) }

  if (t.aeroway) {
    // aerodromes and heliports are kept even outside the study box (HEMS base, proximity zones)
    if (inRing(p, czRings[0]) || inside)
      aero.push({ ...base, kind: t.aeroway, icao: t.icao, operator: t.operator, name: name ?? t.icao ?? (t.aeroway === 'aerodrome' ? 'Letiště' : 'Heliport') })
    continue
  }
  if (!inside) continue
  if (t.place && name) {
    demand.push({ ...base, category: 'settlement', place: t.place, population: num(t.population), populationDate: t['population:date'] ?? t['source:population'] })
  } else if (t.natural === 'peak' && name) {
    const ele = num(t.ele)
    demand.push({ ...base, category: 'peak', ele, notable: !!(t.wikidata || t.wikipedia) })
  } else if (t.tourism === 'alpine_hut' || t.tourism === 'wilderness_hut') {
    if (name && !dedupe('hut', p, name, 150)) demand.push({ ...base, category: 'hut', hutType: t.tourism })
  } else if (t.tourism === 'viewpoint' || t.man_made === 'tower') {
    if (name && !dedupe('view', p, '', 120)) demand.push({ ...base, category: 'viewpoint' })
  } else if (t.landuse === 'winter_sports' || t.aerialway === 'station') {
    if (name && !dedupe('resort', p, '', 400)) demand.push({ ...base, category: 'resort', sub: t.landuse ? 'ski area' : 'lift station' })
  } else if (t.emergency === 'defibrillator') {
    aeds.push({
      ...base,
      name: name ?? t['defibrillator:location'] ?? t.description ?? t.operator ?? 'AED',
      location: t['defibrillator:location'] ?? t['defibrillator:location:cs'],
      indoor: t.indoor,
      access: t.access,
      openingHours: t.opening_hours,
    })
  } else if (t.amenity === 'hospital') {
    if (!dedupe('hospital', p, '', 300)) facilities.push({ ...base, kind: 'hospital', name: name ?? 'Nemocnice', emergency: t.emergency })
  } else if ((t.emergency === 'ambulance_station' || t.amenity === 'ambulance_station') && t.amenity !== 'doctors') {
    if (!dedupe('ambulance', p, '', 150)) facilities.push({ ...base, kind: 'ambulance', name: name ?? t.operator ?? 'Výjezdová základna ZZS (OSM, bez názvu)', source: 'OpenStreetMap' })
  } else if (t.amenity === 'fire_station') {
    if (!dedupe('fire', p, '', 150)) facilities.push({ ...base, kind: 'fire', name: name ?? t.operator ?? 'Hasičská stanice' })
  } else if (t.emergency === 'mountain_rescue' || t.amenity === 'mountain_rescue') {
    if (!dedupe('rescue', p, '', 150)) facilities.push({ ...base, kind: 'mountain-rescue', name: name ?? 'Horská služba' })
  }
}
// official ambulance bases (see data/curated): replace any OSM station within 500 m, keep the rest
{
  const curated = JSON.parse(await readFile(path.join(ROOT, 'data', 'curated', 'ambulance-stations.json'), 'utf8')).stations
  for (const c of curated) {
    for (let i = facilities.length - 1; i >= 0; i--) {
      const f = facilities[i]
      if (f.kind === 'ambulance' && dist([f.lon, f.lat], [c.lon, c.lat]) < 500) facilities.splice(i, 1)
    }
    facilities.push({ id: 'zzs-' + c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), kind: 'ambulance', name: c.name, lon: c.lon, lat: c.lat, address: c.address, crews: c.crews, source: c.confidence })
  }
}
for (const d of demand) d.ele ??= elevAt([d.lon, d.lat])
for (const f of facilities) f.ele = elevAt([f.lon, f.lat])

// peaks: keep those a visitor would plausibly aim for — tagged in Wikidata/Wikipedia or ≥ 900 m
const peaksAll = demand.filter((d) => d.category === 'peak').length
const demandKept = demand.filter((d) => d.category !== 'peak' || d.notable || (d.ele ?? 0) >= 900)
console.log(
  `demand: ${demandKept.length} (peaks ${demandKept.filter((d) => d.category === 'peak').length}/${peaksAll}), facilities ${facilities.length}, aeds ${aeds.length}, aero ${aero.length}`,
)

// ---------------------------------------------------------------- 4. road graph
{
  const raw = (await readJson('roads.json')).elements
  const nodePos = new Map()
  const ways = []
  for (const el of raw) {
    if (el.type === 'node') nodePos.set(el.id, [el.lon, el.lat])
    else if (el.type === 'way') ways.push(el)
  }
  const CLASS = {
    motorway: 0, motorway_link: 0, trunk: 1, trunk_link: 1, primary: 2, primary_link: 2,
    secondary: 3, secondary_link: 3, tertiary: 4, tertiary_link: 4, unclassified: 5, road: 5,
    residential: 6, living_street: 6, service: 7,
  }
  const PAVED = new Set(['asphalt', 'paved', 'concrete', 'concrete:plates', 'concrete:lanes', 'paving_stones', 'sett'])
  const classOf = (t) => {
    if (t.highway === 'track') return t.tracktype === 'grade1' || PAVED.has(t.surface) ? 8 : 9
    return CLASS[t.highway]
  }
  const use = new Map()
  const kept = []
  for (const w of ways) {
    const cls = classOf(w.tags ?? {})
    if (cls === undefined || !w.nodes || w.nodes.length < 2) continue
    if (w.nodes.some((n) => !nodePos.has(n))) continue
    kept.push({ w, cls })
    w.nodes.forEach((n, i) => use.set(n, (use.get(n) ?? 0) + (i === 0 || i === w.nodes.length - 1 ? 2 : 1)))
  }
  // split ways at junctions (nodes used more than once, or way ends)
  const nodeIndex = new Map()
  const nodeLon = []
  const nodeLat = []
  const gid = (n) => {
    let i = nodeIndex.get(n)
    if (i === undefined) {
      i = nodeLon.length
      nodeIndex.set(n, i)
      const p = nodePos.get(n)
      nodeLon.push(p[0])
      nodeLat.push(p[1])
    }
    return i
  }
  let edges = []
  for (const { w, cls } of kept) {
    const t = w.tags
    const oneway = t.oneway === 'yes' || t.oneway === '1' || t.highway === 'motorway' || t.junction === 'roundabout' ? 1 : 0
    const reversed = t.oneway === '-1'
    let start = 0
    for (let i = 1; i < w.nodes.length; i++) {
      if (use.get(w.nodes[i]) > 1 || i === w.nodes.length - 1) {
        let ids = w.nodes.slice(start, i + 1)
        if (reversed) ids = ids.reverse()
        const pts = ids.map((n) => nodePos.get(n))
        let len = 0
        for (let k = 1; k < pts.length; k++) len += dist(pts[k - 1], pts[k])
        if (len > 0.5 && ids[0] !== ids[ids.length - 1])
          edges.push({ from: gid(ids[0]), to: gid(ids[ids.length - 1]), len, cls, oneway: oneway || reversed ? 1 : 0, geom: simplify(pts, 6) })
        start = i
      }
    }
  }
  // keep only the largest connected component so that every snapped road leads somewhere
  const parent = new Int32Array(nodeLon.length).map((_, i) => i)
  const find = (x) => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]]
    return x
  }
  for (const e of edges) parent[find(e.from)] = find(e.to)
  const size = new Map()
  for (let i = 0; i < nodeLon.length; i++) size.set(find(i), (size.get(find(i)) ?? 0) + 1)
  const main = [...size.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const before = edges.length
  edges = edges.filter((e) => find(e.from) === main)
  // renumber nodes
  const remap = new Int32Array(nodeLon.length).fill(-1)
  const nLon = []
  const nLat = []
  const re = (i) => {
    if (remap[i] < 0) {
      remap[i] = nLon.length
      nLon.push(nodeLon[i])
      nLat.push(nodeLat[i])
    }
    return remap[i]
  }
  for (const e of edges) {
    e.from = re(e.from)
    e.to = re(e.to)
  }
  const N = nLon.length
  const E = edges.length
  const G = edges.reduce((a, e) => a + e.geom.length, 0)
  const parts = {
    nodeLon: Float32Array.from(nLon),
    nodeLat: Float32Array.from(nLat),
    edgeFrom: Uint32Array.from(edges, (e) => e.from),
    edgeTo: Uint32Array.from(edges, (e) => e.to),
    edgeLenM: Float32Array.from(edges, (e) => e.len),
    geomStart: new Uint32Array(E + 1),
    geomLon: new Float32Array(G),
    geomLat: new Float32Array(G),
    edgeClass: Uint8Array.from(edges, (e) => e.cls),
    edgeOneway: Uint8Array.from(edges, (e) => e.oneway),
  }
  let g = 0
  edges.forEach((e, i) => {
    parts.geomStart[i] = g
    for (const p of e.geom) {
      parts.geomLon[g] = p[0]
      parts.geomLat[g] = p[1]
      g++
    }
  })
  parts.geomStart[E] = g
  const layout = {}
  let offset = 0
  const bufs = []
  for (const [k, arr] of Object.entries(parts)) {
    layout[k] = { offset, length: arr.length, type: arr.constructor.name }
    const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)
    bufs.push(b)
    offset += b.length
    const pad = (4 - (offset % 4)) % 4
    if (pad) {
      bufs.push(Buffer.alloc(pad))
      offset += pad
    }
  }
  await writeFile(path.join(OUT, 'roads.bin'), Buffer.concat(bufs))
  const byClass = new Array(10).fill(0)
  for (const e of edges) byClass[e.cls] += e.len / 1000
  await writeFile(
    path.join(OUT, 'roads.json'),
    JSON.stringify({ nodes: N, edges: E, geometryPoints: G, layout, kmByClass: byClass.map((v) => Math.round(v)) }),
  )
  console.log(`roads: ${N} nodes, ${E} edges (${before - E} dropped as disconnected), ${G} geometry pts, ${(offset / 1e6).toFixed(1)} MB`)
  console.log('  km by class', byClass.map((v) => Math.round(v)).join(' '))
}

// ---------------------------------------------------------------- 5. marked hiking trails
let trailKm = 0
const trailSamples = []
{
  const raw = (await readJson('trails.json')).elements
  const COLORS = ['red', 'blue', 'green', 'yellow']
  const rank = { red: 0, blue: 1, green: 2, yellow: 3, other: 4 }
  const wayColor = new Map()
  for (const el of raw) {
    if (el.type !== 'relation') continue
    const t = el.tags ?? {}
    let c = (t['osmc:symbol'] ?? '').split(':')[0]
    if (!COLORS.includes(c)) c = COLORS.find((k) => t[`kct_${k}`]) ?? (COLORS.includes(t.colour) ? t.colour : 'other')
    for (const m of el.members ?? []) {
      if (m.type !== 'way') continue
      const prev = wayColor.get(m.ref)
      if (prev === undefined || rank[c] < rank[prev]) wayColor.set(m.ref, c)
    }
  }
  const byColor = { red: [], blue: [], green: [], yellow: [], other: [] }
  let carry = 0
  for (const el of raw) {
    if (el.type !== 'way' || !el.geometry) continue
    const pts = wayGeom(el)
    if (pts.length < 2) continue
    const mid = pts[Math.floor(pts.length / 2)]
    if (!inCz(mid)) continue
    const color = wayColor.get(el.id) ?? 'other'
    byColor[color].push(simplify(pts, 10).map((p) => [round(p[0]), round(p[1])]))
    // sample a point every 1.5 km of marked trail for the coverage statistics
    for (let k = 1; k < pts.length; k++) {
      const d = dist(pts[k - 1], pts[k])
      trailKm += d / 1000
      carry += d
      if (carry >= 1500) {
        carry = 0
        trailSamples.push(pts[k])
      }
    }
  }
  const features = Object.entries(byColor)
    .filter(([, lines]) => lines.length)
    .map(([color, lines]) => ({ type: 'Feature', properties: { color }, geometry: { type: 'MultiLineString', coordinates: lines } }))
  const text = JSON.stringify({ type: 'FeatureCollection', features })
  await writeFile(path.join(OUT, 'trails.geojson'), text)
  console.log(`trails: ${Math.round(trailKm)} km of marked route segments, ${(text.length / 1e6).toFixed(1)} MB, ${trailSamples.length} sample points`)
}
// thin the samples so that no two are closer than ~600 m, and drop those next to a settlement centre
const cellOf = (p) => `${Math.round((p[0] * KX) / 600)}|${Math.round((p[1] * KY) / 600)}`
const usedCells = new Set()
let ti = 0
for (const p of trailSamples) {
  if (p[0] <= BBOX.west || p[0] >= BBOX.east || p[1] <= BBOX.south || p[1] >= BBOX.north) continue
  const c = cellOf(p)
  if (usedCells.has(c)) continue
  usedCells.add(c)
  demandKept.push({ id: `t${ti++}`, name: 'Bod na značené trase', category: 'trail', lon: round(p[0]), lat: round(p[1]), ele: elevAt(p) })
}

// ---------------------------------------------------------------- 6. protected areas
const protectedFeatures = []
let chko = null
{
  const raw = (await readJson('protected.json')).elements
  const kindOf = (t) => {
    const title = `${t.protection_title ?? ''} ${t.name ?? ''}`.toLowerCase()
    if (/chráněná krajinná oblast|chko/.test(title)) return 'CHKO'
    if (/národní přírodní rezervace/.test(title)) return 'NPR'
    if (/národní přírodní památka/.test(title)) return 'NPP'
    if (/přírodní rezervace/.test(title)) return 'PR'
    if (/přírodní památka/.test(title)) return 'PP'
    return null
  }
  const done = new Set()
  for (const el of raw) {
    const t = el.tags ?? {}
    const kind = kindOf(t)
    if (!kind || !t.name) continue
    const key = kind + t.name
    if (done.has(key)) continue
    const rings = elementRings(el)
    if (!rings.length) continue
    const big = rings.sort((a, b) => b.length - a.length)
    const c = big[0][Math.floor(big[0].length / 2)]
    if (kind !== 'CHKO' && !inCz(c)) continue
    done.add(key)
    const polys = big.map((r) => [simplify(r, kind === 'CHKO' ? 40 : 12).map((p) => [round(p[0]), round(p[1])])])
    const f = {
      type: 'Feature',
      properties: { name: t.name, kind, title: t.protection_title ?? null, osm: `${el.type}/${el.id}` },
      geometry: polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys },
    }
    if (kind === 'CHKO' && /beskydy/i.test(t.name)) chko = f
    protectedFeatures.push(f)
  }
  await writeFile(path.join(OUT, 'protected.geojson'), JSON.stringify({ type: 'FeatureCollection', features: protectedFeatures }))
  const counts = {}
  for (const f of protectedFeatures) counts[f.properties.kind] = (counts[f.properties.kind] ?? 0) + 1
  console.log('protected:', JSON.stringify(counts), chko ? '(CHKO Beskydy found)' : '(CHKO Beskydy NOT found)')
}

// ---------------------------------------------------------------- 7. write point data and manifest
await writeFile(
  path.join(OUT, 'places.json'),
  JSON.stringify({ demand: demandKept, facilities, aeds, aerodromes: aero }),
)
await writeFile(
  path.join(OUT, 'study.geojson'),
  JSON.stringify({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { id: 'cz-extent', name: 'Czech territory inside the data extent' }, geometry: { type: 'Polygon', coordinates: [czSimple] } },
      ...(chko ? [{ ...chko, properties: { ...chko.properties, id: 'chko-beskydy' } }] : []),
    ],
  }),
)
const count = (c) => demandKept.filter((d) => d.category === c).length
const settlements = demandKept.filter((d) => d.category === 'settlement')
const manifest = {
  retrievedAt: retrieved.retrievedAt,
  builtAt: new Date().toISOString().slice(0, 10),
  extent: BBOX,
  dem: demMeta,
  counts: {
    settlements: settlements.length,
    settlementsWithPopulation: settlements.filter((d) => d.population).length,
    populationTagged: settlements.reduce((a, d) => a + (d.population ?? 0), 0),
    peaks: count('peak'),
    peaksInOsm: peaksAll,
    huts: count('hut'),
    viewpoints: count('viewpoint'),
    resorts: count('resort'),
    trailPoints: count('trail'),
    trailKm: Math.round(trailKm),
    aeds: aeds.length,
    ambulanceStations: facilities.filter((f) => f.kind === 'ambulance').length,
    fireStations: facilities.filter((f) => f.kind === 'fire').length,
    mountainRescue: facilities.filter((f) => f.kind === 'mountain-rescue').length,
    hospitals: facilities.filter((f) => f.kind === 'hospital').length,
    aerodromes: aero.length,
    protectedAreas: protectedFeatures.length,
  },
}
await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log(JSON.stringify(manifest.counts))
