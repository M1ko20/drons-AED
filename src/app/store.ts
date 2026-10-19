import { create } from 'zustand'
import { loadWorld, type World } from '../data/world'
import type { DemandPoint } from '../sim/coverage'
import type { LngLat } from '../sim/types'
import type { WorkerRequest } from '../worker/analysis.worker'
import { CASE_BY_ID } from '../data/cases'
import { caseConfig, defaultConfig, PRESETS, uid, type ScenarioConfig } from './config'
import { runScenario, type AnalysisResult, type OptimizeRequest, type OptimizeResponse, type ScenarioResult } from './engine'
import { computeMetrics, type Metrics } from './metrics'

export type LayerId =
  | 'coverage'
  | 'hillshade'
  | 'trails'
  | 'protected'
  | 'zones'
  | 'demand'
  | 'stations'
  | 'fireStations'
  | 'aeds'
  | 'routes'
  | 'ranges'

export const LAYER_INFO: { id: LayerId; label: string; hint: string }[] = [
  { id: 'coverage', label: 'Čas doručení dronem', hint: 'Modelovaný čas od volání po AED u pacienta pro každou buňku 300 m' },
  { id: 'routes', label: 'Trasy vybrané události', hint: 'Dráhy dronu, sanitky, Horské služby a vrtulníku' },
  { id: 'demand', label: 'Sledovaná místa', hint: 'Sídla, chaty, vrcholy, vyhlídky a body na trasách, ze kterých se počítají statistiky' },
  { id: 'ranges', label: 'Mez doletu za bezvětří', hint: 'Jen horní mez: rovina, bezvětří. Modelovaným výsledkem je vrstva pokrytí' },
  { id: 'stations', label: 'ZZS, Horská služba, nemocnice', hint: 'Stávající stanoviště záchranných složek' },
  { id: 'fireStations', label: 'Hasičské stanice', hint: 'Možná místa pro základny (OSM)' },
  { id: 'aeds', label: 'Zmapované veřejné AED', hint: 'Pouze OpenStreetMap – zdaleka neúplné' },
  { id: 'trails', label: 'Značené turistické trasy', hint: 'Trasy KČT z OpenStreetMap' },
  { id: 'protected', label: 'Chráněná území', hint: 'CHKO, národní přírodní rezervace, rezervace a památky' },
  { id: 'zones', label: 'Bezletové zóny', hint: 'Ilustrativní kruhy; vynutit je lze v záložce Podmínky' },
  { id: 'hillshade', label: 'Stínování terénu', hint: 'Z přibaleného výškového modelu' },
]

export type MapMode =
  | { kind: 'idle' }
  | { kind: 'add-incident' }
  | { kind: 'add-base' }
  | { kind: 'add-zone' }
  | { kind: 'add-station'; station: 'ambulance' | 'mountain-rescue' }
  | { kind: 'add-candidate' }

export type TabId = 'cases' | 'scenario' | 'fleet' | 'conditions' | 'responders' | 'coverage' | 'layers'
export type ModalId = null | 'drones' | 'sources' | 'compare' | 'report' | 'help'

export interface SavedScenario {
  id: string
  name: string
  savedAt: string
  config: ScenarioConfig
  metrics: Metrics | null
  incidents: { label: string; droneS: number | null; model: string | null; groundS: number | null; rescueS: number | null; hemsS: number | null }[]
}

export interface GeoLayers {
  study: GeoJSON.FeatureCollection
  trails: GeoJSON.FeatureCollection
  protectedAreas: GeoJSON.FeatureCollection
}

interface JobState<T> {
  status: 'idle' | 'running' | 'done' | 'error'
  progress: number
  result: T | null
  error?: string
  /** true when the configuration changed after the result was computed */
  stale: boolean
}

interface AppState {
  world: World | null
  geo: GeoLayers | null
  chkoRings: LngLat[][] | null
  demandById: Map<string, DemandPoint>
  loadError: string | null
  config: ScenarioConfig
  result: ScenarioResult | null
  analysis: JobState<AnalysisResult>
  metrics: Metrics | null
  optimize: JobState<OptimizeResponse>
  customCandidates: { id: string; name: string; position: LngLat }[]
  selectedIncident: string | null
  mapMode: MapMode
  layers: Record<LayerId, boolean>
  basemap: 'online' | 'offline'
  basemapNote: string | null
  tab: TabId
  modal: ModalId
  sidebarOpen: boolean
  resultsOpen: boolean
  saved: SavedScenario[]
  playT: number
  playing: boolean
  toast: string | null
  flyTo: { center: LngLat; seq: number } | null
  /** id of the real case last loaded (see data/cases.ts) */
  activeCase: string | null

  init: () => Promise<void>
  update: (fn: (c: ScenarioConfig) => void) => void
  setConfig: (c: ScenarioConfig) => void
  loadPreset: (id: string) => void
  loadCase: (id: string) => void
  set: (p: Partial<AppState>) => void
  toggleLayer: (id: LayerId) => void
  requestOptimize: (req: OptimizeRequest) => void
  saveScenario: (name: string) => void
  deleteSaved: (id: string) => void
  notify: (msg: string) => void
}

// v2: Czech texts and cost settings; older English configurations are not carried over
const STORAGE_KEY = 'beskydy-aed-sim/v2'
const DEFAULT_LAYERS: Record<LayerId, boolean> = {
  coverage: true,
  hillshade: true,
  trails: true,
  protected: false,
  zones: false,
  demand: false,
  stations: true,
  fireStations: false,
  aeds: true,
  routes: true,
  ranges: false,
}

interface Persisted {
  config?: ScenarioConfig
  saved?: SavedScenario[]
  layers?: Record<LayerId, boolean>
  basemap?: 'online' | 'offline'
}

function readPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw, reviver) as Persisted) : {}
  } catch {
    return {}
  }
}
// JSON has no Infinity/NaN: saved metrics encode them as strings
const replacer = (_k: string, v: unknown) => (typeof v === 'number' && !Number.isFinite(v) ? (Number.isNaN(v) ? '__NaN' : v > 0 ? '__Inf' : '__-Inf') : v)
const reviver = (_k: string, v: unknown) => (v === '__NaN' ? NaN : v === '__Inf' ? Infinity : v === '__-Inf' ? -Infinity : v)

function persist(s: AppState) {
  try {
    const data: Persisted = { config: s.config, saved: s.saved, layers: s.layers, basemap: s.basemap }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data, replacer))
  } catch {
    /* storage unavailable or full: the app keeps working without persistence */
  }
}

let worker: Worker | null = null
let jobSeq = 0
let analysisJob = 0
let optimizeJob = 0
let analysisTimer: ReturnType<typeof setTimeout> | undefined
let toastTimer: ReturnType<typeof setTimeout> | undefined

/** Keeps ?pripad=<id> in the address bar so that a loaded case can be shared as a link. */
function setCaseParam(id: string | null) {
  try {
    const url = new URL(location.href)
    if (id) url.searchParams.set('pripad', id)
    else url.searchParams.delete('pripad')
    history.replaceState(null, '', url)
  } catch {
    /* not in a browser */
  }
}

/** The parts of the configuration the coverage analysis depends on (not incidents or the name). */
const analysisKey = (c: ScenarioConfig) => JSON.stringify({ ...c, incidents: null, name: null })

const idle = <T,>(): JobState<T> => ({ status: 'idle', progress: 0, result: null, stale: false })

export const useApp = create<AppState>((set, get) => {
  const send = (msg: WorkerRequest) => worker?.postMessage(msg)

  const recompute = (prevKey: string | null) => {
    const s = get()
    if (!s.world) return
    let result: ScenarioResult | null = null
    try {
      result = runScenario(s.world, s.config)
    } catch (e) {
      set({ toast: 'Chyba simulace: ' + (e instanceof Error ? e.message : String(e)) })
    }
    const selected = s.config.incidents.some((i) => i.id === s.selectedIncident) ? s.selectedIncident : (s.config.incidents[0]?.id ?? null)
    set({ result, selectedIncident: selected })
    persist(get())
    if (prevKey !== analysisKey(s.config)) scheduleAnalysis()
  }

  const scheduleAnalysis = () => {
    set((s) => ({ analysis: { ...s.analysis, stale: true }, optimize: { ...s.optimize, stale: s.optimize.status === 'done' } }))
    clearTimeout(analysisTimer)
    analysisTimer = setTimeout(() => {
      const s = get()
      if (!s.world || !worker) return
      analysisJob = ++jobSeq
      set((st) => ({ analysis: { ...st.analysis, status: 'running', progress: 0, error: undefined } }))
      send({ type: 'analysis', job: analysisJob, config: s.config })
    }, 350)
  }

  return {
    world: null,
    geo: null,
    chkoRings: null,
    demandById: new Map(),
    loadError: null,
    config: null as unknown as ScenarioConfig,
    result: null,
    analysis: idle(),
    metrics: null,
    optimize: idle(),
    customCandidates: [],
    selectedIncident: null,
    mapMode: { kind: 'idle' },
    layers: DEFAULT_LAYERS,
    basemap: 'online',
    basemapNote: null,
    tab: 'scenario',
    modal: null,
    // on narrow screens the panels overlay the map, so start with the controls closed
    sidebarOpen: typeof window === 'undefined' || window.innerWidth > 1180,
    resultsOpen: true,
    saved: [],
    playT: 0,
    playing: false,
    toast: null,
    flyTo: null,
    activeCase: null,

    init: async () => {
      try {
        const base = import.meta.env.BASE_URL
        const geoFile = async (name: string) => {
          const res = await fetch(`${base}data/${name}`)
          if (!res.ok) throw new Error(`Nepodařilo se načíst data/${name} (HTTP ${res.status})`)
          return (await res.json()) as GeoJSON.FeatureCollection
        }
        const [world, study, trails, protectedAreas] = await Promise.all([
          loadWorld(base),
          geoFile('study.geojson'),
          geoFile('trails.geojson'),
          geoFile('protected.geojson'),
        ])
        const chkoF = study.features.find((f) => f.properties?.id === 'chko-beskydy')
        const chkoRings: LngLat[][] | null = chkoF
          ? chkoF.geometry.type === 'Polygon'
            ? [chkoF.geometry.coordinates[0] as LngLat[]]
            : chkoF.geometry.type === 'MultiPolygon'
              ? chkoF.geometry.coordinates.map((p) => p[0] as LngLat[])
              : null
          : null

        const stored = readPersisted()
        const fallback = defaultConfig(world)
        // a stored configuration from an older build may lack fields: fill them from the defaults
        const config: ScenarioConfig = stored.config
          ? {
              ...fallback,
              ...stored.config,
              ops: { ...fallback.ops, ...stored.config.ops },
              analysis: { ...fallback.analysis, ...stored.config.analysis },
              comparators: { ...fallback.comparators, ...stored.config.comparators },
              costs: { ...fallback.costs, ...stored.config.costs },
            }
          : fallback

        worker = new Worker(new URL('../worker/analysis.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = (ev) => {
          const m = ev.data
          if (m.type === 'ready') {
            scheduleAnalysis()
          } else if (m.type === 'progress') {
            if (m.kind === 'analysis' && m.job === analysisJob) set((s) => ({ analysis: { ...s.analysis, progress: m.fraction } }))
            if (m.kind === 'optimize' && m.job === optimizeJob) set((s) => ({ optimize: { ...s.optimize, progress: m.fraction } }))
          } else if (m.type === 'analysis') {
            if (m.job !== analysisJob) return
            const s = get()
            const result = m.result as AnalysisResult
            const cell = (40075016.7 * Math.cos((49.53 * Math.PI) / 180)) / (256 * 2 ** s.world!.grid.zoom) / 1000
            set({
              analysis: { status: 'done', progress: 1, result, stale: false },
              metrics: computeMetrics(s.config, result, s.demandById, cell * cell),
            })
          } else if (m.type === 'optimize') {
            if (m.job !== optimizeJob) return
            set({ optimize: { status: 'done', progress: 1, result: m.result as OptimizeResponse, stale: false } })
          } else if (m.type === 'error') {
            if (m.kind === 'optimize') set((s) => ({ optimize: { ...s.optimize, status: 'error', error: m.message } }))
            else set((s) => ({ analysis: { ...s.analysis, status: 'error', error: m.message } }))
          }
        }
        worker.onerror = (e) => set((s) => ({ analysis: { ...s.analysis, status: 'error', error: e.message || 'Výpočet pokrytí selhal' } }))

        set({
          world,
          geo: { study, trails, protectedAreas },
          chkoRings,
          demandById: new Map(world.demand.map((d) => [d.id, d])),
          config,
          saved: stored.saved ?? [],
          layers: { ...DEFAULT_LAYERS, ...stored.layers },
          basemap: stored.basemap ?? 'online',
          selectedIncident: config.incidents[0]?.id ?? null,
        })
        send({ type: 'init', base: new URL(base, location.href).href, chkoRings })
        recompute(null)
        // a shared link opens straight into a case and replays it
        const linked = new URLSearchParams(location.search).get('pripad')
        if (linked) {
          if (CASE_BY_ID[linked]) get().loadCase(linked)
          else setCaseParam(null)
        }
      } catch (e) {
        set({ loadError: e instanceof Error ? e.message : String(e) })
      }
    },

    update: (fn) => {
      const prev = get().config
      const prevKey = analysisKey(prev)
      const next = structuredClone(prev)
      fn(next)
      set({ config: next, playT: 0, playing: false })
      recompute(prevKey)
    },

    setConfig: (c) => {
      const prevKey = get().config ? analysisKey(get().config) : null
      set({ config: structuredClone(c), playT: 0, playing: false, optimize: idle() })
      recompute(prevKey)
    },

    loadPreset: (id) => {
      const s = get()
      const preset = PRESETS.find((p) => p.id === id)
      if (!preset || !s.world) return
      s.setConfig(preset.build(s.world))
      set({ activeCase: null })
      setCaseParam(null)
      s.notify(`Načten vzorový scénář „${preset.name}“`)
    },

    loadCase: (id) => {
      const s = get()
      const c = CASE_BY_ID[id]
      if (!c || !s.world) return
      s.setConfig(caseConfig(s.world, c))
      set({
        activeCase: id,
        tab: 'cases',
        resultsOpen: true,
        selectedIncident: get().config.incidents[0]?.id ?? null,
        flyTo: { center: c.position, seq: Date.now() },
        playT: 0,
        playing: true,
      })
      setCaseParam(id)
    },

    set: (p) => {
      set(p)
      if ('layers' in p || 'basemap' in p || 'saved' in p) persist(get())
    },

    toggleLayer: (id) => {
      set((s) => ({ layers: { ...s.layers, [id]: !s.layers[id] } }))
      persist(get())
    },

    requestOptimize: (req) => {
      const s = get()
      if (!worker || !s.world) return
      optimizeJob = ++jobSeq
      set({ optimize: { status: 'running', progress: 0, result: s.optimize.result, stale: false } })
      send({ type: 'optimize', job: optimizeJob, config: s.config, request: req })
    },

    saveScenario: (name) => {
      const s = get()
      const entry: SavedScenario = {
        id: uid('saved'),
        name,
        savedAt: new Date().toISOString(),
        config: structuredClone({ ...s.config, name }),
        metrics: s.analysis.stale ? null : s.metrics,
        incidents: (s.result?.outcomes ?? []).map((o) => {
          const by = (k: string) => {
            const r = o.comparators.find((c) => c.kind === k)
            return r && r.available ? r.totalS : null
          }
          return {
            label: o.incident.label,
            droneS: o.best ? o.best.atPatientS : null,
            model: o.best ? o.best.specId : null,
            groundS: by('ground-ems'),
            rescueS: by('mountain-rescue'),
            hemsS: by('hems'),
          }
        }),
      }
      set({ saved: [entry, ...s.saved], config: { ...s.config, name } })
      persist(get())
      s.notify(`Uloženo: „${name}“`)
    },

    deleteSaved: (id) => {
      set((s) => ({ saved: s.saved.filter((x) => x.id !== id) }))
      persist(get())
    },

    notify: (msg) => {
      clearTimeout(toastTimer)
      set({ toast: msg })
      toastTimer = setTimeout(() => set({ toast: null }), 3500)
    },
  }
})
