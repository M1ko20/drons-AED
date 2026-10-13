import type { Dem } from './dem'
import { distanceM } from './geo'
import {
  arrivalAt,
  buildAdjacency,
  nearestNode,
  RoadIndex,
  travelTimes,
  type Adjacency,
  type RoadGraph,
  type TravelField,
} from './roads'
import type { LngLat, ResponderResult, TimeComponent, Weather } from './types'
import { walkTimeS } from './walk'

export interface Station {
  id: string
  name: string
  position: LngLat
}

/**
 * Assumed emergency driving speeds by road class, km/h (see ROAD_CLASSES for the order).
 * These are modelling assumptions, not measured values; the UI exposes a global factor.
 */
export const AMBULANCE_KMH = [120, 110, 85, 75, 65, 50, 40, 20, 25, 12]
export const RESCUE_KMH = [90, 90, 75, 65, 55, 45, 35, 20, 25, 18]

export interface ComparatorSettings {
  ground: {
    enabled: boolean
    /** crew alerted → vehicle rolling */
    turnoutS: number
    speedFactor: number
    /** allow unpaved forest tracks at walking-vehicle speed */
    allowTracks: boolean
  }
  mountain: {
    enabled: boolean
    /** extra relay from the medical dispatch centre to the mountain rescue station */
    alertS: number
    turnoutS: number
    speedFactor: number
  }
  hems: {
    enabled: boolean
    /** alert → airborne, daytime / night */
    mobilizationS: number
    nightMobilizationS: number
    cruiseKmh: number
    /** approach, landing and crew leaving the aircraft */
    landingS: number
    /** distance from the nearest usable landing spot to the patient */
    footDistanceM: number
    availableAtNight: boolean
    maxWindMs: number
  }
  publicAed: {
    enabled: boolean
    /** multiplier on Tobler walking speed for a hurrying bystander */
    speedFactor: number
    maxDistanceM: number
  }
  /** multiplier on straight-line distance for paths on foot */
  footDetour: number
  /** multiplier on walking speed for a crew carrying equipment */
  crewLoadFactor: number
}

const CALL_NOTE = 'Stejná fáze příjmu výzvy jako u dronu'

/** Road-based and other conventional responders against which the drone is compared. */
export class ComparatorEngine {
  private adj: Adjacency
  private fieldCache = new Map<string, TravelField>()
  private indexCache = new Map<string, RoadIndex>()
  private stationNodes = new Map<string, number[]>()

  constructor(
    private graph: RoadGraph,
    private dem: Dem,
    private ambulanceStations: Station[],
    private rescueStations: Station[],
    private hemsBase: Station | null,
    private aeds: Station[],
  ) {
    this.adj = buildAdjacency(graph)
  }

  private index(key: string, allowed: (edge: number) => boolean) {
    let idx = this.indexCache.get(key)
    if (!idx) this.indexCache.set(key, (idx = new RoadIndex(this.graph, allowed)))
    return idx
  }

  private nodesFor(key: string, stations: Station[]) {
    let n = this.stationNodes.get(key)
    if (!n) {
      const idx = this.index('all', () => true)
      n = stations.map((s) => nearestNode(this.graph, idx, s.position))
      this.stationNodes.set(key, n)
    }
    return n
  }

  private field(key: string, stations: Station[], speeds: number[]): TravelField {
    const k = key + ':' + speeds.map((s) => s.toFixed(3)).join(',')
    let f = this.fieldCache.get(k)
    if (!f) {
      const nodes = this.nodesFor(key, stations)
      f = travelTimes(
        this.graph,
        this.adj,
        nodes.map((node) => ({ node, t0: 0 })),
        speeds,
      )
      if (this.fieldCache.size > 12) this.fieldCache.clear()
      this.fieldCache.set(k, f)
    }
    return f
  }

  private roadResponder(
    kind: 'ground-ems' | 'mountain-rescue',
    target: LngLat,
    stations: Station[],
    kmh: number[],
    factor: number,
    allowTracks: boolean,
    weather: Weather,
    lead: TimeComponent[],
    s: ComparatorSettings,
  ): ResponderResult {
    const label = kind === 'ground-ems' ? 'Pozemní posádka ZZS' : 'Horská služba'
    const base: ResponderResult = {
      kind,
      label,
      available: false,
      components: [],
      totalS: Infinity,
      route: [],
      distanceM: 0,
      illustrative: false,
      notes: [],
    }
    if (!stations.length) return { ...base, unavailableReason: 'V datech není žádné stanoviště tohoto typu' }
    const speeds = kmh.map((v, c) => (c === 9 && !allowTracks ? 0 : (v / 3.6) * factor * weather.roadSpeedFactor))
    const field = this.field(kind, stations, speeds)
    // snap only to roads this responder can actually reach from one of its stations
    const g = this.graph
    const snap = this.index(
      `${kind}:${allowTracks}`,
      (e) => speeds[g.edgeClass[e]] > 0 && (isFinite(field.time[g.edgeFrom[e]]) || isFinite(field.time[g.edgeTo[e]])),
    ).nearest(target)
    if (!snap) return { ...base, unavailableReason: 'Do 20 km od místa není sjízdná silnice' }
    const arr = arrivalAt(this.graph, field, snap, speeds)
    if (!arr || arr.source < 0) return { ...base, unavailableReason: 'Místo není se stanovištěm spojeno silnicí' }

    const foot =
      snap.offsetM < 25
        ? snap.offsetM / 1.2
        : walkTimeS(this.dem, snap.point, target, {
            offPath: false,
            speedFactor: s.crewLoadFactor,
            detour: s.footDetour,
          })
    const components: TimeComponent[] = [
      ...lead,
      {
        key: 'drive',
        label: 'Jízda k nejbližšímu místu na silnici',
        seconds: arr.timeS,
        evidence: 'derived',
        note: `${(arr.distanceM / 1000).toFixed(1).replace('.', ',')} km po silniční síti OSM předpokládanou rychlostí jízdy k zásahu`,
      },
      {
        key: 'foot',
        label: 'Pěšky od vozidla k pacientovi',
        seconds: foot,
        evidence: 'derived',
        note:
          snap.offsetM < 25
            ? 'Místo je u silnice'
            : `${Math.round(snap.offsetM)} m vzdušnou čarou, Toblerova funkce chůze v terénu × ${String(s.footDetour).replace('.', ',')} na zacházku`,
      },
    ]
    return {
      ...base,
      available: true,
      fromName: stations[arr.source]?.name,
      components,
      totalS: components.reduce((a, c) => a + c.seconds, 0),
      route: [...arr.route, target],
      distanceM: arr.distanceM,
      notes: [
        'Předpokládá se volná posádka na nejbližší základně; obsazenost posádek se nemodeluje.',
        'Rychlosti jízdy jsou předpoklady podle třídy silnice, nikoli naměřené dojezdové časy.',
      ],
    }
  }

  ground(target: LngLat, callS: number, s: ComparatorSettings, weather: Weather): ResponderResult {
    return this.roadResponder(
      'ground-ems',
      target,
      this.ambulanceStations,
      AMBULANCE_KMH,
      s.ground.speedFactor,
      s.ground.allowTracks,
      weather,
      [
        { key: 'call', label: 'Příjem výzvy do vyrozumění posádky', seconds: callS, evidence: 'assumption', note: CALL_NOTE },
        { key: 'turnout', label: 'Výjezd posádky', seconds: s.ground.turnoutS, evidence: 'assumption' },
      ],
      s,
    )
  }

  mountain(target: LngLat, callS: number, s: ComparatorSettings, weather: Weather): ResponderResult {
    return this.roadResponder(
      'mountain-rescue',
      target,
      this.rescueStations,
      RESCUE_KMH,
      s.mountain.speedFactor,
      true,
      weather,
      [
        { key: 'call', label: 'Příjem výzvy', seconds: callS, evidence: 'assumption', note: CALL_NOTE },
        { key: 'alert', label: 'Předání Horské službě', seconds: s.mountain.alertS, evidence: 'assumption' },
        { key: 'turnout', label: 'Výjezd družstva', seconds: s.mountain.turnoutS, evidence: 'assumption' },
      ],
      s,
    )
  }

  hems(target: LngLat, callS: number, s: ComparatorSettings, weather: Weather): ResponderResult {
    const base: ResponderResult = {
      kind: 'hems',
      label: 'Vrtulník LZS — ilustrativně',
      available: false,
      components: [],
      totalS: Infinity,
      route: [],
      distanceM: 0,
      illustrative: true,
      notes: [
        'Ilustrativní scénář: předpokládá vrtulník na základně, volný a schopný přistát poblíž pacienta.',
        'Doba vzletu, cestovní rychlost a čas přistání jsou nastavitelné předpoklady, nikoli údaje provozovatele.',
      ],
    }
    if (!this.hemsBase) return { ...base, unavailableReason: 'V datech není základna LZS' }
    if (weather.night && !s.hems.availableAtNight) return { ...base, unavailableReason: 'Nastaveno, že v noci nelétá' }
    if (weather.icing) return { ...base, unavailableReason: 'Námraza' }
    if (weather.windMs > s.hems.maxWindMs)
      return { ...base, unavailableReason: `Vítr nad předpokládaným limitem ${s.hems.maxWindMs} m/s` }
    const d = distanceM(this.hemsBase.position, target)
    const mobil = weather.night ? s.hems.nightMobilizationS : s.hems.mobilizationS
    const foot = s.hems.footDistanceM / (1.2 * s.crewLoadFactor)
    const components: TimeComponent[] = [
      { key: 'call', label: 'Příjem výzvy', seconds: callS, evidence: 'assumption', note: CALL_NOTE },
      { key: 'mobil', label: weather.night ? 'Vzlet po výzvě (noc)' : 'Vzlet po výzvě', seconds: mobil, evidence: 'assumption' },
      {
        key: 'flight',
        label: 'Let',
        seconds: d / (s.hems.cruiseKmh / 3.6),
        evidence: 'derived',
        note: `${(d / 1000).toFixed(1).replace('.', ',')} km vzdušnou čarou rychlostí ${s.hems.cruiseKmh} km/h; vítr a stoupání se neuvažují`,
      },
      { key: 'landing', label: 'Přiblížení, přistání, výstup posádky', seconds: s.hems.landingS, evidence: 'assumption' },
      { key: 'foot', label: 'Posádka pěšky k pacientovi', seconds: foot, evidence: 'assumption', note: `${s.hems.footDistanceM} m` },
    ]
    return {
      ...base,
      available: true,
      fromName: this.hemsBase.name,
      components,
      totalS: components.reduce((a, c) => a + c.seconds, 0),
      route: [this.hemsBase.position, target],
      distanceM: d,
    }
  }

  publicAed(target: LngLat, callS: number, s: ComparatorSettings): ResponderResult {
    const base: ResponderResult = {
      kind: 'public-aed',
      label: 'Svědek doběhne pro veřejný AED — ilustrativně',
      available: false,
      components: [],
      totalS: Infinity,
      route: [],
      distanceM: 0,
      illustrative: true,
      notes: [
        'Polohy AED pocházejí z OpenStreetMap a jsou neúplné; dostupnost ani otevírací doba se neověřují.',
        'Vyžaduje druhého svědka, který může od pacienta odběhnout, zatímco pokračuje resuscitace.',
      ],
    }
    let best: Station | null = null
    let bd = Infinity
    for (const a of this.aeds) {
      const d = distanceM(a.position, target)
      if (d < bd) ((bd = d), (best = a))
    }
    if (!best || bd > s.publicAed.maxDistanceM)
      return {
        ...base,
        unavailableReason: `Do ${(s.publicAed.maxDistanceM / 1000).toFixed(1).replace('.', ',')} km není zmapovaný AED`,
      }
    const wp = { offPath: false, speedFactor: s.publicAed.speedFactor, detour: s.footDetour }
    const out = walkTimeS(this.dem, target, best.position, wp)
    const back = walkTimeS(this.dem, best.position, target, wp)
    const components: TimeComponent[] = [
      { key: 'call', label: 'Příjem výzvy do pokynu operátora', seconds: callS, evidence: 'assumption', note: CALL_NOTE },
      { key: 'out', label: 'Cesta k AED', seconds: out, evidence: 'derived', note: `${Math.round(bd)} m vzdušnou čarou` },
      { key: 'back', label: 'Zpět k pacientovi', seconds: back, evidence: 'derived' },
    ]
    return {
      ...base,
      available: true,
      fromName: best.name,
      components,
      totalS: components.reduce((a, c) => a + c.seconds, 0),
      route: [target, best.position],
      distanceM: bd,
    }
  }

  all(target: LngLat, callS: number, s: ComparatorSettings, weather: Weather): ResponderResult[] {
    const out: ResponderResult[] = []
    if (s.ground.enabled) out.push(this.ground(target, callS, s, weather))
    if (s.mountain.enabled) out.push(this.mountain(target, callS, s, weather))
    if (s.hems.enabled) out.push(this.hems(target, callS, s, weather))
    if (s.publicAed.enabled) out.push(this.publicAed(target, callS, s))
    return out
  }

  /** Ground-ambulance time only (no route), for bulk statistics. */
  groundTimeS(target: LngLat, callS: number, s: ComparatorSettings, weather: Weather): number {
    return this.ground(target, callS, s, weather).totalS
  }
}
