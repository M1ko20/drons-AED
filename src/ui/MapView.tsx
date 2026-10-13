import maplibregl, { type GeoJSONSource, type ImageSource, type Map as MlMap, type StyleSpecification } from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import { STUDY_AREAS, uid } from '../app/config'
import { perfMap } from '../app/engine'
import { droneAt, responderAt, type Mover } from '../app/playback'
import { useApp } from '../app/store'
import { modelName } from '../data/drones'
import { kitMassKg, rangeAtPayloadKm, tempFactor, usableRangeKm } from '../sim/energy'
import { formatDuration } from '../sim/stats'
import type { LngLat } from '../sim/types'
import {
  bandIndex,
  circlePolygon,
  COLORS,
  COVERAGE_BANDS,
  coverageCanvas,
  fetchOnlineStyle,
  hillshadeCanvas,
  imageCoords,
  OFFLINE_STYLE,
  roadsGeoJSON,
} from './mapLayers'

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
const TRANSPARENT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const TRAIL_COLOR = ['match', ['get', 'color'], 'red', '#c0392b', 'blue', '#2d6cb5', 'green', '#2e8540', 'yellow', '#c99700', '#7a7a7a']

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features })
const pt = (p: LngLat, properties: Record<string, unknown>): GeoJSON.Feature => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: p } })
const line = (coords: LngLat[], properties: Record<string, unknown>): GeoJSON.Feature => ({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates: coords } })

/** Adds every overlay source and layer. Idempotent, so it can run again after a basemap switch. */
function installOverlays(map: MlMap, offline: boolean) {
  const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id
  const below = (id: string) => (map.getLayer(id) ? undefined : firstSymbol)
  const src = (id: string, spec: maplibregl.SourceSpecification) => {
    if (!map.getSource(id)) map.addSource(id, spec)
  }
  const layer = (spec: maplibregl.LayerSpecification, under = true) => {
    if (!map.getLayer(spec.id)) map.addLayer(spec, under ? below(spec.id) : undefined)
  }
  const world = useApp.getState().world!
  const coords = imageCoords(world.dem)

  src('hillshade', { type: 'image', url: TRANSPARENT, coordinates: coords })
  layer({ id: 'hillshade', type: 'raster', source: 'hillshade', paint: { 'raster-opacity': offline ? 1 : 0.55, 'raster-fade-duration': 0 } })
  src('offline-roads', { type: 'geojson', data: EMPTY })
  layer({
    id: 'offline-roads',
    type: 'line',
    source: 'offline-roads',
    paint: {
      'line-color': ['step', ['get', 'cls'], '#b9a27a', 2, '#c9bfa8', 4, '#ffffff'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, ['step', ['get', 'cls'], 1.6, 2, 1, 4, 0.4], 13, ['step', ['get', 'cls'], 5, 2, 3.5, 4, 2]],
    },
  })
  src('coverage', { type: 'image', url: TRANSPARENT, coordinates: imageCoords(world.grid) })
  layer({ id: 'coverage', type: 'raster', source: 'coverage', paint: { 'raster-resampling': 'nearest', 'raster-fade-duration': 0, 'raster-opacity': 0.9 } })

  src('protected', { type: 'geojson', data: EMPTY })
  layer({
    id: 'protected-fill',
    type: 'fill',
    source: 'protected',
    filter: ['!=', ['get', 'kind'], 'CHKO'],
    paint: { 'fill-color': '#3f7d3a', 'fill-opacity': 0.22 },
  })
  layer({
    id: 'protected-line',
    type: 'line',
    source: 'protected',
    paint: { 'line-color': '#2f6a2c', 'line-width': ['match', ['get', 'kind'], 'CHKO', 1.6, 0.8], 'line-dasharray': [3, 2] },
  })
  src('trails', { type: 'geojson', data: EMPTY })
  layer({
    id: 'trails',
    type: 'line',
    source: 'trails',
    minzoom: 9.5,
    paint: { 'line-color': TRAIL_COLOR as never, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.7, 14, 2], 'line-opacity': 0.8 },
  })
  src('area', { type: 'geojson', data: EMPTY })
  layer({ id: 'area-mask', type: 'fill', source: 'area', filter: ['==', ['get', 'role'], 'mask'], paint: { 'fill-color': '#f4f4f1', 'fill-opacity': 0.62 } })
  layer({ id: 'area-line', type: 'line', source: 'area', filter: ['==', ['get', 'role'], 'outline'], paint: { 'line-color': '#1b1d1f', 'line-width': 1.4, 'line-dasharray': [5, 3] } })

  src('zones', { type: 'geojson', data: EMPTY })
  layer({ id: 'zones-fill', type: 'fill', source: 'zones', paint: { 'fill-color': '#d03b3b', 'fill-opacity': ['case', ['get', 'enforced'], 0.18, 0.04] } }, false)
  layer({ id: 'zones-line', type: 'line', source: 'zones', paint: { 'line-color': '#b02a2a', 'line-width': ['case', ['get', 'enforced'], 2, 1], 'line-dasharray': [2, 2] } }, false)
  src('ranges', { type: 'geojson', data: EMPTY })
  layer({ id: 'ranges', type: 'line', source: 'ranges', paint: { 'line-color': '#184f95', 'line-width': 1.2, 'line-dasharray': [1, 3] } }, false)

  src('demand', { type: 'geojson', data: EMPTY })
  layer(
    {
      id: 'demand',
      type: 'circle',
      source: 'demand',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, ['match', ['get', 'category'], 'trail', 1.6, 2.6], 13, ['match', ['get', 'category'], 'trail', 4, 6]],
        'circle-color': ['get', 'fill'],
        'circle-stroke-color': ['get', 'stroke'],
        'circle-stroke-width': ['case', ['get', 'unserved'], 1.4, 0.8],
      },
    },
    false,
  )
  src('facilities', { type: 'geojson', data: EMPTY })
  layer(
    {
      id: 'facilities',
      type: 'circle',
      source: 'facilities',
      paint: {
        'circle-radius': ['match', ['get', 'kind'], 'fire', 3, 5],
        'circle-color': ['match', ['get', 'kind'], 'ambulance', COLORS['ground-ems'], 'mountain-rescue', COLORS['mountain-rescue'], 'hems', COLORS.hems, 'hospital', '#ffffff', 'aed', '#0ca30c', '#8a8d91'],
        'circle-stroke-color': ['match', ['get', 'kind'], 'hospital', '#d03b3b', '#ffffff'],
        'circle-stroke-width': ['match', ['get', 'kind'], 'hospital', 2, 1.5],
      },
    },
    false,
  )
  if (!offline) {
    layer(
      {
        id: 'facility-labels',
        type: 'symbol',
        source: 'facilities',
        minzoom: 10.5,
        filter: ['!=', ['get', 'kind'], 'fire'],
        layout: { 'text-field': ['get', 'short'], 'text-font': ['Noto Sans Regular'], 'text-size': 10.5, 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-optional': true },
        paint: { 'text-color': '#3a3d40', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
      },
      false,
    )
  }

  src('routes', { type: 'geojson', data: EMPTY })
  const routeLayer = (kind: string, color: string, dash?: number[], width = 3) => {
    layer({ id: `route-${kind}-case`, type: 'line', source: 'routes', filter: ['==', ['get', 'kind'], kind], paint: { 'line-color': '#ffffff', 'line-width': width + 2.5, 'line-opacity': 0.9 }, layout: { 'line-cap': 'round', 'line-join': 'round' } }, false)
    layer(
      {
        id: `route-${kind}`,
        type: 'line',
        source: 'routes',
        filter: ['==', ['get', 'kind'], kind],
        paint: { 'line-color': color, 'line-width': width, ...(dash ? { 'line-dasharray': dash } : {}) },
        layout: { 'line-cap': dash ? 'butt' : 'round', 'line-join': 'round' },
      },
      false,
    )
  }
  routeLayer('ground-ems', COLORS['ground-ems'])
  routeLayer('mountain-rescue', COLORS['mountain-rescue'], [3, 1.5])
  routeLayer('hems', COLORS.hems, [1, 1.5])
  routeLayer('public-aed', COLORS['public-aed'], [0.6, 1.2], 2.5)
  routeLayer('drone-back', COLORS.drone, [1.5, 1.5], 2)
  routeLayer('drone-other', '#7fa9dc', [2, 2], 1.5)
  routeLayer('drone', COLORS.drone, undefined, 3.5)

  src('movers', { type: 'geojson', data: EMPTY })
  layer(
    {
      id: 'movers',
      type: 'circle',
      source: 'movers',
      paint: {
        'circle-radius': 7,
        'circle-color': ['match', ['get', 'kind'], 'drone', COLORS.drone, 'ground-ems', COLORS['ground-ems'], 'mountain-rescue', COLORS['mountain-rescue'], 'hems', COLORS.hems, COLORS['public-aed']],
        'circle-stroke-color': ['case', ['get', 'arrived'], '#0b0b0b', '#ffffff'],
        'circle-stroke-width': 2.5,
      },
    },
    false,
  )
}

const HOVER_LAYERS = ['demand', 'facilities', 'zones-fill', 'protected-fill']

export function MapView() {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const ready = useRef(false)
  const markers = useRef<maplibregl.Marker[]>([])
  const townMarkers = useRef<maplibregl.Marker[]>([])
  const popup = useRef<maplibregl.Popup | null>(null)

  const world = useApp((s) => s.world)!
  const geo = useApp((s) => s.geo)!
  const config = useApp((s) => s.config)
  const result = useApp((s) => s.result)
  const analysis = useApp((s) => s.analysis)
  const layers = useApp((s) => s.layers)
  const basemap = useApp((s) => s.basemap)
  const selected = useApp((s) => s.selectedIncident)
  const mapMode = useApp((s) => s.mapMode)
  const playT = useApp((s) => s.playT)
  const chkoRings = useApp((s) => s.chkoRings)
  const customCandidates = useApp((s) => s.customCandidates)
  const optimize = useApp((s) => s.optimize)
  const flyTo = useApp((s) => s.flyTo)
  const tab = useApp((s) => s.tab)

  // ---------------------------------------------------------------- create the map once
  useEffect(() => {
    let cancelled = false
    let map: MlMap | null = null
    const start = async () => {
      let style: StyleSpecification = OFFLINE_STYLE
      let offline = useApp.getState().basemap === 'offline'
      if (!offline) {
        try {
          style = await fetchOnlineStyle()
        } catch {
          offline = true
          useApp.getState().set({ basemap: 'offline', basemapNote: 'Online podklad není dostupný – zobrazuje se přibalený terén a silnice.' })
        }
      }
      if (cancelled || !el.current) return
      const area = STUDY_AREAS[0].bbox!
      map = new maplibregl.Map({
        container: el.current,
        style,
        bounds: [
          [area.west, area.south],
          [area.east, area.north],
        ],
        fitBoundsOptions: { padding: 30 },
        maxBounds: [
          [world.manifest.extent.west - 1.2, world.manifest.extent.south - 0.7],
          [world.manifest.extent.east + 1.2, world.manifest.extent.north + 0.7],
        ],
        minZoom: 7.5,
        maxZoom: 15.5,
        attributionControl: false,
      })
      mapRef.current = map
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right')
      map.addControl(
        new maplibregl.AttributionControl({
          compact: true,
          customAttribution: 'Vrstvy © přispěvatelé OpenStreetMap · Terén: Mapzen terrain tiles',
        }),
        'bottom-right',
      )
      popup.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, maxWidth: '280px' })

      map.on('style.load', () => {
        if (!map) return
        installOverlays(map, useApp.getState().basemap === 'offline')
        ready.current = true
        // sources were recreated empty: let every effect below repaint them
        window.dispatchEvent(new Event('map-style-ready'))
      })
      map.on('error', (e) => {
        // tile failures while offline are expected; surface anything else once
        const msg = String((e as { error?: Error }).error?.message ?? '')
        if (/Failed to fetch|NetworkError|AJAXError/i.test(msg) && useApp.getState().basemap === 'online' && !useApp.getState().basemapNote)
          useApp.getState().set({ basemapNote: 'Některé online mapové dlaždice se nepodařilo načíst. Je-li podklad neúplný, přepněte ve Vrstvách na offline podklad.' })
      })

      map.on('click', (e) => {
        const p: LngLat = [e.lngLat.lng, e.lngLat.lat]
        const st = useApp.getState()
        const mode = st.mapMode
        const ext = st.world!.manifest.extent
        if (p[0] < ext.west || p[0] > ext.east || p[1] < ext.south || p[1] > ext.north) {
          st.notify('Tento bod je mimo rozsah dat – terén ani silnice tam nejsou modelovány.')
          return
        }
        if (mode.kind === 'add-base') {
          st.update((c) => {
            const id = uid('base')
            const spec = c.bases[0]?.drones[0]?.specId ?? 'wingcopter-198'
            c.bases.push({ id, name: `Vlastní základna ${c.bases.length + 1}`, position: p, drones: [{ id: id + '-d1', specId: spec, status: 'ready' }] })
          })
          st.set({ mapMode: { kind: 'idle' } })
        } else if (mode.kind === 'add-zone') {
          st.update((c) => c.zones.push({ id: uid('zone'), name: `Vlastní zóna ${c.zones.filter((z) => z.kind === 'custom').length + 1}`, center: p, radiusM: 2000, kind: 'custom', enforced: true }))
          st.set({ mapMode: { kind: 'idle' }, layers: { ...st.layers, zones: true } })
        } else if (mode.kind === 'add-station') {
          st.update((c) =>
            c.extraStations.push({ id: uid('station'), name: mode.station === 'ambulance' ? `Doplněná základna ZZS ${c.extraStations.length + 1}` : `Doplněná stanice HS ${c.extraStations.length + 1}`, kind: mode.station, position: p }),
          )
          st.set({ mapMode: { kind: 'idle' } })
        } else if (mode.kind === 'add-candidate') {
          st.set({ customCandidates: [...st.customCandidates, { id: uid('cand'), name: `Vlastní místo ${st.customCandidates.length + 1}`, position: p }], mapMode: { kind: 'idle' } })
        } else if (mode.kind === 'add-incident') {
          const id = uid('inc')
          st.update((c) => {
            const last = c.incidents.reduce((a, i) => Math.max(a, i.t0S), 0)
            c.incidents.push({ id, label: `Událost ${c.incidents.length + 1}`, position: p, t0S: c.incidents.length ? last + 300 : 0, site: 'no-landing' })
          })
          st.set({ mapMode: { kind: 'idle' }, selectedIncident: id })
        } else if (st.tab === 'scenario') {
          // default interaction: a click places (or moves) the emergency
          const hit = map!.queryRenderedFeatures(e.point, { layers: ['facilities', 'demand'].filter((l) => map!.getLayer(l)) })
          if (hit.length && e.originalEvent.altKey) return
          st.update((c) => {
            const cur = c.incidents.find((i) => i.id === st.selectedIncident)
            if (cur) cur.position = p
            else c.incidents.push({ id: uid('inc'), label: 'Událost 1', position: p, t0S: 0, site: 'no-landing' })
          })
        }
      })

      map.on('mousemove', (e) => {
        if (!map || !ready.current) return
        const f = map.queryRenderedFeatures(e.point, { layers: HOVER_LAYERS.filter((l) => map!.getLayer(l)) })[0]
        if (!f) {
          popup.current?.remove()
          return
        }
        const p = f.properties as Record<string, string>
        const html = `<strong>${escapeHtml(p.name ?? p.kind ?? '')}</strong>${p.detail ? `<div>${escapeHtml(p.detail)}</div>` : ''}`
        popup.current!.setLngLat(e.lngLat).setHTML(html).addTo(map)
      })
      map.on('mouseout', () => popup.current?.remove())
    }
    start()
    return () => {
      cancelled = true
      ready.current = false
      map?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // repaint helper: runs `fn` now if the style is ready and again whenever a style finishes loading
  const useMapEffect = (fn: (map: MlMap) => void, deps: unknown[]) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      const run = () => {
        const map = mapRef.current
        if (map && ready.current) fn(map)
      }
      run()
      window.addEventListener('map-style-ready', run)
      return () => window.removeEventListener('map-style-ready', run)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps)
  }
  const setData = (map: MlMap, id: string, data: GeoJSON.FeatureCollection) => (map.getSource(id) as GeoJSONSource | undefined)?.setData(data)
  const show = (map: MlMap, ids: string[], on: boolean) => ids.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'))

  // ---------------------------------------------------------------- basemap switch
  const firstBasemap = useRef(true)
  useEffect(() => {
    if (firstBasemap.current) {
      firstBasemap.current = false
      return
    }
    const map = mapRef.current
    if (!map) return
    ready.current = false
    // diff: false forces a full reload so that 'style.load' fires and the overlays are re-installed
    if (basemap === 'offline') map.setStyle(OFFLINE_STYLE, { diff: false })
    else
      fetchOnlineStyle()
        .then((s) => map.setStyle(s, { diff: false }))
        .catch(() => useApp.getState().set({ basemap: 'offline', basemapNote: 'Online podklad není dostupný – zůstává přibalený podklad.' }))
  }, [basemap])

  // ---------------------------------------------------------------- static layers
  useMapEffect(
    (map) => {
      const offline = basemap === 'offline'
      ;(map.getSource('hillshade') as ImageSource | undefined)?.updateImage({ url: hillshadeCanvas(world.dem, offline), coordinates: imageCoords(world.dem) })
      setData(map, 'offline-roads', offline ? roadsGeoJSON(world.roads, 5) : EMPTY)
      setData(map, 'trails', geo.trails)
      setData(map, 'protected', geo.protectedAreas)
      // town names as DOM labels when the vector basemap (and its fonts) is unavailable
      townMarkers.current.forEach((m) => m.remove())
      townMarkers.current = []
      if (offline) {
        for (const d of world.places.demand) {
          if (d.category !== 'settlement' || (d.population ?? 0) < 3000) continue
          const node = document.createElement('div')
          node.className = 'town-label'
          node.textContent = d.name
          townMarkers.current.push(new maplibregl.Marker({ element: node, anchor: 'center' }).setLngLat([d.lon, d.lat]).addTo(map))
        }
      }
    },
    [basemap, world, geo],
  )

  useMapEffect(
    (map) => {
      show(map, ['hillshade'], layers.hillshade || basemap === 'offline')
      show(map, ['trails'], layers.trails)
      show(map, ['protected-fill', 'protected-line'], layers.protected)
      show(map, ['zones-fill', 'zones-line'], layers.zones)
      show(map, ['coverage'], layers.coverage)
      show(map, ['demand'], layers.demand)
      show(map, ['ranges'], layers.ranges)
      const routeIds = map.getStyle().layers.filter((l) => l.id.startsWith('route-')).map((l) => l.id)
      show(map, [...routeIds, 'movers'], layers.routes)
    },
    [layers, basemap],
  )

  // ---------------------------------------------------------------- study area outline and mask
  useMapEffect(
    (map) => {
      const def = STUDY_AREAS.find((a) => a.id === config.studyArea)!
      const cz = geo.study.features.find((f) => f.properties?.id === 'cz-extent')
      let rings: LngLat[][] = []
      if (config.studyArea === 'chko' && chkoRings) rings = chkoRings
      else if (def.bbox) {
        const b = def.bbox
        rings = [[[b.west, b.south], [b.east, b.south], [b.east, b.north], [b.west, b.north], [b.west, b.south]]]
      } else if (cz && cz.geometry.type === 'Polygon') rings = [cz.geometry.coordinates[0] as LngLat[]]
      const worldRing: LngLat[] = [[-10, 30], [50, 30], [50, 70], [-10, 70], [-10, 30]]
      const feats: GeoJSON.Feature[] = [
        { type: 'Feature', properties: { role: 'mask' }, geometry: { type: 'Polygon', coordinates: [worldRing, ...rings] } },
        ...rings.map((r) => line(r, { role: 'outline' })),
      ]
      if (cz && cz.geometry.type === 'Polygon' && config.studyArea !== 'extent') feats.push(line(cz.geometry.coordinates[0] as LngLat[], { role: 'border' }))
      setData(map, 'area', fc(feats))
    },
    [config.studyArea, geo, chkoRings],
  )

  // ---------------------------------------------------------------- coverage raster and study locations
  useMapEffect(
    (map) => {
      const r = analysis.result
      const T = config.analysis.targetMin * 60
      const source = map.getSource('coverage') as ImageSource | undefined
      if (r && source) source.updateImage({ url: coverageCanvas(r.time, r.mask, r.width, r.height, T), coordinates: imageCoords(world.grid) })
      if (map.getLayer('coverage')) map.setPaintProperty('coverage', 'raster-opacity', analysis.stale ? 0.45 : 0.9)

      const byId = new Map(r?.points.map((p) => [p.id, p]) ?? [])
      const feats: GeoJSON.Feature[] = []
      for (const d of world.demand) {
        const p = byId.get(d.id)
        if (!p) continue
        const band = bandIndex(p.droneS, T)
        const detail = isFinite(p.droneS)
          ? `Dron: AED u pacienta za ${formatDuration(p.droneS)}${isFinite(p.groundS) ? ` · posádka ZZS ${formatDuration(p.groundS)}` : ''}`
          : `Dronem nelze obsloužit${isFinite(p.groundS) ? ` · posádka ZZS ${formatDuration(p.groundS)}` : ''}`
        feats.push(
          pt(d.position, {
            name: d.name + (d.population ? ` (${d.population.toLocaleString('cs-CZ')} obyvatel)` : ''),
            category: d.category,
            detail,
            unserved: band < 0,
            fill: band < 0 ? '#ffffff' : COVERAGE_BANDS[band].color,
            stroke: band < 0 ? COLORS.critical : '#ffffff',
          }),
        )
      }
      setData(map, 'demand', fc(feats))
    },
    [analysis.result, analysis.stale, config.analysis.targetMin, world],
  )

  // ---------------------------------------------------------------- facilities, zones, range rings
  useMapEffect(
    (map) => {
      const feats: GeoJSON.Feature[] = []
      for (const f of world.places.facilities) {
        if (f.kind === 'fire' && !layers.fireStations) continue
        if (f.kind !== 'fire' && !layers.stations) continue
        const kindLabel = { ambulance: 'Výjezdová základna ZZS', 'mountain-rescue': 'Stanice Horské služby', fire: 'Hasičská stanice', hospital: 'Nemocnice' }[f.kind]
        feats.push(
          pt([f.lon, f.lat], {
            kind: f.kind,
            name: f.name,
            short: f.name.replace(/^ZZS (MSK|ZK) /, '').replace(/^Horská služba ?/, 'HS '),
            detail: [kindLabel, f.crews && `posádky: ${f.crews}`, f.source && `zdroj: ${f.source}`].filter(Boolean).join(' · '),
          }),
        )
      }
      if (layers.stations) {
        for (const s of config.extraStations)
          feats.push(pt(s.position, { kind: s.kind, name: s.name, short: s.name, detail: 'Doplněno ručně v tomto scénáři' }))
        if (world.hemsBase) feats.push(pt(world.hemsBase.position, { kind: 'hems', name: world.hemsBase.name, short: 'LZS', detail: 'Základna letecké záchranné služby' }))
      }
      if (layers.aeds)
        for (const a of world.places.aeds)
          feats.push(pt([a.lon, a.lat], { kind: 'aed', name: 'Veřejný AED (OSM): ' + a.name, short: 'AED', detail: [a.openingHours && `otevřeno ${a.openingHours}`, a.access && `přístup ${a.access}`].filter(Boolean).join(' · ') || 'Dostupnost ani otevírací doba nejsou zaznamenány' }))
      setData(map, 'facilities', fc(feats))
    },
    [world, layers.stations, layers.fireStations, layers.aeds, config.extraStations],
  )

  useMapEffect(
    (map) => {
      setData(
        map,
        'zones',
        fc(
          config.zones.map((z) => ({
            type: 'Feature',
            properties: { name: z.name, enforced: z.enforced, detail: (z.enforced ? 'Vynuceno: drony zónu oblétají. ' : 'Jen zobrazeno, nevynuceno. ') + (z.note ?? '') },
            geometry: { type: 'Polygon', coordinates: [circlePolygon(z.center, z.radiusM)] },
          })),
        ),
      )
      // still-air range limit: an upper bound, drawn dotted to contrast with the modelled coverage
      const payload = kitMassKg(config.kit)
      const tF = tempFactor(config.weather.tempC, config.ops.coldDeratePerC)
      const rings: GeoJSON.Feature[] = []
      for (const b of config.bases) {
        const specs = [...new Set(b.drones.filter((d) => d.status === 'ready').map((d) => d.specId))]
        let best = 0
        for (const perf of perfMap(config, specs).values()) {
          if (perf.missing.length) continue
          const usable = usableRangeKm(rangeAtPayloadKm(perf.rangeTable, payload), perf.publishedReserveFraction, tF, config.ops.reserveFraction)
          best = Math.max(best, config.ops.returnPolicy === 'return' ? usable / 2 : usable)
        }
        if (best > 0) rings.push(line(circlePolygon(b.position, best * 1000, 96), { name: b.name }))
      }
      setData(map, 'ranges', fc(rings))
    },
    [config.zones, config.bases, config.kit, config.weather.tempC, config.ops, config.cruiseOverride],
  )

  // ---------------------------------------------------------------- routes of the selected incident
  const outcome = result?.outcomes.find((o) => o.incident.id === selected) ?? result?.outcomes[0] ?? null
  useMapEffect(
    (map) => {
      const feats: GeoJSON.Feature[] = []
      if (outcome) {
        for (const r of outcome.comparators) if (r.available && r.route.length > 1) feats.push(line(r.route, { kind: r.kind }))
        outcome.candidates.forEach((m, i) => {
          if (!m.outbound || m.outbound.path.length < 2 || !m.feasible) return
          const seenBase = outcome.candidates.findIndex((x) => x.baseId === m.baseId && x.feasible) !== i
          if (seenBase) return
          if (m === outcome.best) {
            feats.push(line(m.outbound.path, { kind: 'drone' }))
            if (m.inbound) feats.push(line(m.inbound.path, { kind: 'drone-back' }))
          } else feats.push(line(m.outbound.path, { kind: 'drone-other' }))
        })
      }
      setData(map, 'routes', fc(feats))
    },
    [outcome],
  )

  useMapEffect(
    (map) => {
      const movers: Mover[] = []
      if (outcome && playT > 0) {
        if (outcome.best?.outbound) movers.push(droneAt(outcome.best, playT))
        for (const r of outcome.comparators) if (r.available && r.route.length > 1) movers.push(responderAt(r, playT))
      }
      setData(map, 'movers', fc(movers.map((m) => pt(m.position, { kind: m.kind, arrived: m.arrived }))))
    },
    [outcome, playT],
  )

  // ---------------------------------------------------------------- DOM markers: bases, incidents, candidate sites
  useMapEffect(
    (map) => {
      markers.current.forEach((m) => m.remove())
      markers.current = []
      const st = useApp.getState()
      const add = (cls: string, text: string, title: string, p: LngLat, onDrag?: (p: LngLat) => void, onClick?: () => void) => {
        const node = document.createElement('div')
        node.className = 'marker ' + cls
        node.title = title
        const glyph = document.createElement('span')
        glyph.className = 'marker-glyph'
        glyph.textContent = text
        node.appendChild(glyph)
        const label = document.createElement('span')
        label.className = 'marker-label'
        label.textContent = title.split(' — ')[0]
        node.appendChild(label)
        const m = new maplibregl.Marker({ element: node, draggable: !!onDrag, anchor: 'center' }).setLngLat(p).addTo(map)
        if (onDrag)
          m.on('dragend', () => {
            const ll = m.getLngLat()
            onDrag([ll.lng, ll.lat])
          })
        if (onClick)
          node.addEventListener('click', (e) => {
            e.stopPropagation()
            onClick()
          })
        markers.current.push(m)
      }
      const winnerBase = outcome?.best?.baseId
      for (const b of config.bases) {
        const readyN = b.drones.filter((d) => d.status === 'ready').length
        const models = [...new Set(b.drones.map((d) => modelName(d.specId)))].join(', ')
        add(
          'base' + (b.id === winnerBase ? ' winner' : '') + (readyN ? '' : ' down'),
          String(readyN),
          `${b.name} — připraveno ${readyN} z ${b.drones.length} dronů (${models}). Přetažením přemístíte.`,
          b.position,
          (p) => st.update((c) => void (c.bases.find((x) => x.id === b.id)!.position = p)),
          () => st.set({ tab: 'fleet', sidebarOpen: true }),
        )
      }
      config.incidents.forEach((inc, i) =>
        add(
          'incident' + (inc.id === selected ? ' selected' : ''),
          config.incidents.length > 1 ? String(i + 1) : '✚',
          `${inc.label} — přetažením přesunete`,
          inc.position,
          (p) => st.update((c) => void (c.incidents.find((x) => x.id === inc.id)!.position = p)),
          () => st.set({ selectedIncident: inc.id, resultsOpen: true }),
        ),
      )
      if (tab === 'coverage') {
        for (const c of customCandidates) add('candidate', '◇', `${c.name} — vlastní kandidátní místo`, c.position)
        const chosen = optimize.result && !optimize.stale ? optimize.result.chosen : []
        const sites = new Map<string, { name: string; position: LngLat }>()
        for (const f of world.places.facilities) sites.set(f.id, { name: f.name, position: [f.lon, f.lat] })
        for (const c of customCandidates) sites.set(c.id, c)
        chosen.forEach((id, i) => {
          const s = sites.get(id)
          if (s) add('proposal', String(i + 1), `${s.name} — navržená základna č. ${i + 1}`, s.position)
        })
      }
    },
    [config.bases, config.incidents, selected, outcome?.best?.baseId, customCandidates, optimize.result, optimize.stale, tab],
  )

  useEffect(() => {
    if (flyTo && mapRef.current) mapRef.current.easeTo({ center: flyTo.center, zoom: Math.max(mapRef.current.getZoom(), 11.5), duration: 600 })
  }, [flyTo])

  useEffect(() => {
    const map = mapRef.current
    if (map) map.getCanvas().style.cursor = mapMode.kind === 'idle' ? '' : 'crosshair'
  }, [mapMode])

  // keep the canvas sized when side panels open or close
  useEffect(() => {
    if (!el.current) return
    const ro = new ResizeObserver(() => mapRef.current?.resize())
    ro.observe(el.current)
    return () => ro.disconnect()
  }, [])

  return <div ref={el} className="map" aria-label="Interaktivní mapa Beskyd" />
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
