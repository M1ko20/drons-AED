// Scenario configuration: everything a user can change, in one serialisable object.
// User-facing texts are Czech.
import { DEFAULT_ALERTS_PER_100K, DEFAULT_COMPARATORS, DEFAULT_COSTS, DEFAULT_KIT, DEFAULT_OPS, WEATHER_PRESETS } from '../data/defaults'
import type { Facility, World } from '../data/world'
import { defaultZones } from '../data/world'
import type { ComparatorSettings } from '../sim/comparators'
import type { CostSettings } from '../sim/cost'
import type { DemandCategory } from '../sim/coverage'
import type { FleetBase, Incident } from '../sim/dispatch'
import type { BBox } from '../sim/geo'
import type { AedKit, LngLat, OpsSettings, SiteType, Weather, Zone } from '../sim/types'

export type StudyAreaId = 'core' | 'chko' | 'extent'

export const STUDY_AREAS: { id: StudyAreaId; name: string; description: string; bbox?: BBox }[] = [
  {
    id: 'core',
    name: 'Moravskoslezské Beskydy (jádrová oblast)',
    description: 'Rožnov – Frenštát – Frýdlant – Třinec – Jablunkov a hřebeny mezi nimi, pouze české území.',
    bbox: { west: 18.1, south: 49.36, east: 18.82, north: 49.7 },
  },
  {
    id: 'chko',
    name: 'CHKO Beskydy',
    description: 'Hranice chráněné krajinné oblasti podle OpenStreetMap.',
  },
  {
    id: 'extent',
    name: 'Beskydy s podhůřím (celý rozsah dat)',
    description: 'Celé české území v rozsahu přibalených dat včetně Nového Jičína, Frýdku-Místku a Vsetína.',
  },
]

export interface ExtraStation {
  id: string
  name: string
  kind: 'ambulance' | 'mountain-rescue'
  position: LngLat
}

export interface AnalysisSettings {
  targetMin: number
  categories: Record<DemandCategory, boolean>
  /** site type assumed for the coverage raster */
  fieldSite: SiteType
  /** assumed drone-eligible alerts per 100,000 residents per year (utilisation estimate only) */
  alertsPer100k: number
}

export interface ScenarioConfig {
  name: string
  studyArea: StudyAreaId
  bases: FleetBase[]
  /** user-chosen cruise airspeed per aircraft model, m/s */
  cruiseOverride: Record<string, number>
  kit: AedKit & { aedId: string }
  ops: OpsSettings
  weather: Weather
  weatherPreset: string
  comparators: ComparatorSettings
  zones: Zone[]
  incidents: Incident[]
  extraStations: ExtraStation[]
  analysis: AnalysisSettings
  costs: CostSettings
}

export const CATEGORY_LABEL: Record<DemandCategory, string> = {
  settlement: 'Sídla',
  hut: 'Horské chaty',
  peak: 'Vrcholy',
  viewpoint: 'Vyhlídky a rozhledny',
  resort: 'Lyžařské areály a lanovky',
  trail: 'Body na značených trasách',
}

let counter = 0
export const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`

const facility = (world: World, kind: Facility['kind'], pattern: RegExp) =>
  world.places.facilities.find((f) => f.kind === kind && pattern.test(f.name))

function baseAt(world: World, kind: Facility['kind'], pattern: RegExp, specs: string[]): FleetBase | null {
  const f = facility(world, kind, pattern)
  if (!f) return null
  return {
    id: 'base-' + f.id,
    name: f.name,
    position: [f.lon, f.lat],
    drones: specs.map((specId, i) => ({ id: `base-${f.id}-d${i + 1}`, specId, status: 'ready' as const })),
  }
}

const DEMO_INCIDENT: Incident = {
  id: 'inc-demo',
  label: 'Turista při výstupu na Lysou horu',
  position: [18.4296, 49.5389],
  t0S: 0,
  site: 'no-landing',
}

function common(world: World): Omit<ScenarioConfig, 'name' | 'bases'> {
  return {
    studyArea: 'core',
    cruiseOverride: {},
    kit: { ...DEFAULT_KIT },
    ops: { ...DEFAULT_OPS },
    weather: { ...WEATHER_PRESETS[0].weather },
    weatherPreset: WEATHER_PRESETS[0].id,
    comparators: structuredClone(DEFAULT_COMPARATORS),
    zones: defaultZones(world.places),
    incidents: [{ ...DEMO_INCIDENT }],
    extraStations: [],
    analysis: {
      targetMin: 10,
      categories: { settlement: true, hut: true, peak: true, viewpoint: true, resort: true, trail: true },
      fieldSite: 'no-landing',
      alertsPer100k: DEFAULT_ALERTS_PER_100K,
    },
    costs: structuredClone(DEFAULT_COSTS),
  }
}

export interface Preset {
  id: string
  name: string
  description: string
  build: (world: World) => ScenarioConfig
}

const bases = (list: (FleetBase | null)[]) => list.filter((b): b is FleetBase => b !== null)
const W = 'wingcopter-198'

/** Sample scenarios. Base locations are existing emergency-service sites, chosen for illustration. */
export const PRESETS: Preset[] = [
  {
    id: 'small',
    name: 'Malá flotila – 3 základny v údolích',
    description: 'Po jednom VTOL s navijákem na základnách ZZS ve Frýdlantu n. O., Frenštátu p. R. a Třinci.',
    build: (w) => ({
      ...common(w),
      name: 'Malá flotila – 3 základny v údolích',
      bases: bases([baseAt(w, 'ambulance', /Frýdlant/, [W]), baseAt(w, 'ambulance', /Frenštát/, [W]), baseAt(w, 'ambulance', /Třinec/, [W])]),
    }),
  },
  {
    id: 'baseline',
    name: 'Výchozí stav – jen stávající složky',
    description: 'Bez dronů. Pouze pozemní posádka ZZS, Horská služba a ilustrativní vrtulník.',
    build: (w) => ({ ...common(w), name: 'Výchozí stav – jen stávající složky', bases: [] }),
  },
  {
    id: 'expanded',
    name: 'Rozšířená flotila – 6 základen, 8 dronů',
    description: 'Navíc Jablunkov, základna v Rožnově a stanice Horské služby na Lysé hoře; dva drony na nejvytíženějších základnách.',
    build: (w) => ({
      ...common(w),
      name: 'Rozšířená flotila – 6 základen, 8 dronů',
      bases: bases([
        baseAt(w, 'ambulance', /Frýdlant/, [W, W]),
        baseAt(w, 'ambulance', /Frenštát/, [W]),
        baseAt(w, 'ambulance', /Třinec/, [W, W]),
        baseAt(w, 'ambulance', /Jablunkov/, [W]),
        baseAt(w, 'ambulance', /Rožnov/, [W]),
        baseAt(w, 'mountain-rescue', /Lysá/, ['dji-m400']),
      ]),
    }),
  },
  {
    id: 'weather',
    name: 'Špatné počasí – zima, −8 °C',
    description: 'Malá flotila v mrazu: stroje s limitem 0 °C zůstanou na zemi a silnice jsou pomalejší.',
    build: (w) => {
      const preset = WEATHER_PRESETS.find((p) => p.id === 'winter')!
      return {
        ...common(w),
        name: 'Špatné počasí – zima, −8 °C',
        weather: { ...preset.weather },
        weatherPreset: preset.id,
        bases: bases([baseAt(w, 'ambulance', /Frýdlant/, [W]), baseAt(w, 'ambulance', /Frenštát/, [W]), baseAt(w, 'ambulance', /Třinec/, [W])]),
      }
    },
  },
  {
    id: 'multirotor',
    name: 'Mrazuvzdorné multikoptéry u Horské služby',
    description: 'DJI Matrice 400 (doručení jen přistáním) na každé stanici Horské služby v datech.',
    build: (w) => ({
      ...common(w),
      name: 'Mrazuvzdorné multikoptéry u Horské služby',
      bases: w.places.facilities
        .filter((f) => f.kind === 'mountain-rescue')
        .map((f) => ({
          id: 'base-' + f.id,
          name: f.name,
          position: [f.lon, f.lat] as LngLat,
          drones: [{ id: `base-${f.id}-d1`, specId: 'dji-m400', status: 'ready' as const }],
        })),
    }),
  },
  {
    id: 'mixed',
    name: 'Různé typy – porovnání strojů na jedné události',
    description: 'Pět různých strojů na základně ve Frýdlantu, aby je tabulka kandidátů přímo porovnala.',
    build: (w) => ({
      ...common(w),
      name: 'Různé typy – porovnání strojů na jedné události',
      bases: bases([baseAt(w, 'ambulance', /Frýdlant/, [W, 'rigitech-eiger', 'dji-m400', 'everdrone-e2', 'dji-flycart-30'])]),
    }),
  },
]

export const defaultConfig = (world: World) => PRESETS[0].build(world)
