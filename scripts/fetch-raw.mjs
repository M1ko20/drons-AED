// Downloads raw source data into data/raw/ (cached; delete a file to refetch).
// Sources: OpenStreetMap via Overpass API (ODbL), Mapzen/AWS Terrain Tiles (terrarium PNG).
// The app never calls these services at runtime; the processed output is bundled.
import { mkdir, writeFile, readFile, access, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { BBOX, TERRAIN_ZOOM, lonToTileX, latToTileY } from './lib/area.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RAW = path.join(ROOT, 'data', 'raw')
const UA = 'beskydy-aed-drone-sim/0.1 (research prototype; local data build)'
const OVERPASS = [
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

const boxStr = (bb) => `${bb.south},${bb.west},${bb.north},${bb.east}`
// HEMS base lies north of the study box (Ostrava-Zábřeh), so heliports use a taller box.
const heliBox = `${BBOX.south},${BBOX.west},49.86,${BBOX.east}`

/** Split the data extent into nx × ny tiles so that each request stays small. */
function tiles(nx, ny) {
  const out = []
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++)
      out.push({
        west: BBOX.west + ((BBOX.east - BBOX.west) * i) / nx,
        east: BBOX.west + ((BBOX.east - BBOX.west) * (i + 1)) / nx,
        south: BBOX.south + ((BBOX.north - BBOX.south) * j) / ny,
        north: BBOX.south + ((BBOX.north - BBOX.south) * (j + 1)) / ny,
      })
  return out
}

const full = boxStr(BBOX)
// name → list of query parts; results of the parts are merged (deduplicated by type/id)
const QUERIES = {
  // Czech national boundary, used to clip the study area and filter features.
  cz: [`[out:json][timeout:180];relation["ISO3166-1"="CZ"]["admin_level"="2"];out geom;`],
  pois: [
    `[out:json][timeout:120];(node["place"~"^(city|town|village|hamlet)$"](${full});node["natural"="peak"]["name"](${full}););out tags center;`,
    `[out:json][timeout:120];(
  nwr["tourism"~"^(alpine_hut|wilderness_hut)$"](${full});
  nwr["tourism"="viewpoint"]["name"](${full});
  nwr["tourism"="information"]["information"~"^(office|visitor_centre)$"](${full});
  nwr["man_made"="tower"]["tower:type"="observation"](${full});
  nwr["landuse"="winter_sports"](${full});
  nwr["aerialway"="station"]["name"](${full});
);out tags center;`,
    `[out:json][timeout:120];(
  nwr["emergency"="defibrillator"](${full});
  nwr["amenity"="hospital"](${full});
  nwr["emergency"="ambulance_station"](${full});
  nwr["amenity"="fire_station"](${full});
  nwr["emergency"="mountain_rescue"](${full});
  nwr["amenity"="mountain_rescue"](${full});
  nwr["amenity"="ambulance_station"](${full});
  nwr["aeroway"~"^(aerodrome|heliport|helipad)$"](${heliBox});
);out tags center;`,
  ],
  roads: tiles(3, 2).map(
    (t) => `[out:json][timeout:240];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|track|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|road)$"]["service"!~"^(parking_aisle|driveway|drive-through|emergency_access)$"]["area"!="yes"](${boxStr(t)});
out body;>;out skel qt;`,
  ),
  trails: tiles(2, 1).map(
    (t) => `[out:json][timeout:240];
relation["route"="hiking"](${boxStr(t)});
out body;way(r)(${boxStr(t)});out geom;`,
  ),
  protected: [
    `[out:json][timeout:240];
(
  nwr["boundary"="protected_area"](${full});
  nwr["leisure"="nature_reserve"](${full});
  nwr["boundary"="national_park"](${full});
);
out geom;`,
  ],
}

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function request(url, query) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 300_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = JSON.parse(await res.text())
    if (!Array.isArray(json.elements)) throw new Error('no elements array')
    if (json.remark && /error|timed out|out of memory/i.test(json.remark)) throw new Error(json.remark)
    return json.elements
  } finally {
    clearTimeout(timer)
  }
}

async function overpass(name, parts) {
  const out = path.join(RAW, `${name}.json`)
  if (await exists(out)) {
    console.log(`[skip] ${name}.json (cached)`)
    return
  }
  const seen = new Set()
  const elements = []
  for (let pi = 0; pi < parts.length; pi++) {
    const partFile = path.join(RAW, `.${name}.part${pi}.json`)
    let els
    if (await exists(partFile)) {
      els = JSON.parse(await readFile(partFile, 'utf8'))
    } else {
      let lastErr
      for (let attempt = 0; attempt < 8 && !els; attempt++) {
        const url = OVERPASS[attempt % OVERPASS.length]
        try {
          console.log(`[get ] ${name} ${pi + 1}/${parts.length} via ${new URL(url).host} (attempt ${attempt + 1})`)
          els = await request(url, parts[pi])
        } catch (e) {
          lastErr = e
          console.warn(`  failed: ${e.message}`)
          await new Promise((r) => setTimeout(r, 10_000 * (attempt + 1)))
        }
      }
      if (!els) throw new Error(`Overpass query "${name}" part ${pi + 1} failed: ${lastErr?.message}`)
      await writeFile(partFile, JSON.stringify(els))
    }
    for (const el of els) {
      const key = el.type + el.id
      if (seen.has(key)) continue
      seen.add(key)
      elements.push(el)
    }
  }
  const text = JSON.stringify({ elements })
  await writeFile(out, text)
  for (let pi = 0; pi < parts.length; pi++) await rm(path.join(RAW, `.${name}.part${pi}.json`), { force: true })
  console.log(`[ok  ] ${name}: ${elements.length} elements, ${(text.length / 1e6).toFixed(1)} MB`)
}

async function terrain() {
  const x0 = lonToTileX(BBOX.west, TERRAIN_ZOOM)
  const x1 = lonToTileX(BBOX.east, TERRAIN_ZOOM)
  const y0 = latToTileY(BBOX.north, TERRAIN_ZOOM)
  const y1 = latToTileY(BBOX.south, TERRAIN_ZOOM)
  await mkdir(path.join(RAW, 'terrain'), { recursive: true })
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const out = path.join(RAW, 'terrain', `${TERRAIN_ZOOM}_${x}_${y}.png`)
      if (await exists(out)) continue
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${TERRAIN_ZOOM}/${x}/${y}.png`
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (!res.ok) throw new Error(`terrain tile ${x}/${y}: HTTP ${res.status}`)
      await writeFile(out, Buffer.from(await res.arrayBuffer()))
    }
  }
  console.log(`[ok  ] terrain tiles z${TERRAIN_ZOOM} x${x0}-${x1} y${y0}-${y1}`)
}

await mkdir(RAW, { recursive: true })
await terrain()
const only = process.argv.slice(2)
for (const [name, q] of Object.entries(QUERIES)) {
  if (only.length && !only.includes(name)) continue
  await overpass(name, q)
}
await writeFile(
  path.join(RAW, 'retrieved.json'),
  JSON.stringify({ retrievedAt: new Date().toISOString().slice(0, 10), bbox: BBOX, terrainZoom: TERRAIN_ZOOM }, null, 2),
)
console.log('done')
