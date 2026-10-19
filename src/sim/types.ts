// Core domain types for the simulation. No UI or data-loading code in this folder.

export type LngLat = [lon: number, lat: number]

/**
 * How well a number is supported.
 *  manufacturer  – published by the maker (datasheet / product page); not independently verified
 *  peer-reviewed – reported in a peer-reviewed study
 *  official      – public authority / legislation
 *  third-party   – trade press, reseller, or search summary of a primary source we could not open
 *  derived       – computed by us from other sourced values (method given in `note`)
 *  assumption    – our modelling assumption; user-configurable
 *  unknown       – could not be verified; value is null
 */
export type Evidence =
  | 'manufacturer'
  | 'peer-reviewed'
  | 'official'
  | 'third-party'
  | 'derived'
  | 'assumption'
  | 'unknown'

export interface Sourced<T> {
  value: T | null
  unit?: string
  evidence: Evidence
  /** key into the source registry */
  sourceId?: string
  /** measurement conditions or qualification */
  note?: string
}

export type AircraftConfig = 'multirotor' | 'vtol-fixed-wing' | 'fixed-wing'
export type DeliveryMode = 'land' | 'winch' | 'low-drop' | 'parachute'
export type RainCapability = 'none' | 'light' | 'heavy' | 'unknown'
export type Precipitation = 'none' | 'light-rain' | 'heavy-rain' | 'snow'

export interface RangePoint {
  payloadKg: number
  /** still-air one-way distance until the published end condition */
  oneWayKm: number
}

export interface DroneSpec {
  id: string
  manufacturer: string
  model: string
  config: AircraftConfig
  /** one-line role, e.g. "purpose-built AED responder" */
  role: string
  intendedUse: string
  availability: Sourced<string>
  cruiseSpeedMs: Sourced<number>
  maxSpeedMs: Sourced<number>
  /** climb / descent rate in forward flight */
  climbRateMs: Sourced<number>
  descentRateMs: Sourced<number>
  /** vertical (hover) climb / descent rate; equals the above for multirotors */
  vertClimbRateMs: Sourced<number>
  vertDescentRateMs: Sourced<number>
  maxPayloadKg: Sourced<number>
  mtowKg: Sourced<number>
  /** published range by payload. Empty array = not published. */
  rangeTable: Sourced<RangePoint[] | null>
  /** share of battery already held back in the published range figure (0 if flown to empty / not stated) */
  publishedReserveFraction: Sourced<number>
  rangeConditions: string
  enduranceMin: Sourced<number>
  maxWindMs: Sourced<number>
  maxGustMs: Sourced<number>
  tempMinC: Sourced<number>
  tempMaxC: Sourced<number>
  ipRating: Sourced<string>
  rain: Sourced<RainCapability | null>
  ceilingAmslM: Sourced<number>
  delivery: Record<DeliveryMode, Sourced<boolean | null>>
  /** minimum load the winch needs to operate (kg), if any */
  winchMinPayloadKg?: Sourced<number>
  winchCableM?: Sourced<number>
  winchSpeedMs?: Sourced<number>
  autonomousWaypoints: Sourced<boolean>
  parachute: Sourced<boolean>
  priceEur: Sourced<number>
  certification: string
  /** our qualitative assessment for AED delivery in Beskydy; clearly an opinion */
  suitability: { rating: 'good' | 'conditional' | 'poor' | 'insufficient-data'; text: string }
  caveats: string[]
  sourceIds: string[]
}

/** Numbers the flight model actually uses, after filling gaps with labelled assumptions. */
export interface DronePerf {
  specId: string
  config: AircraftConfig
  cruiseMs: number
  climbMs: number
  descentMs: number
  vertClimbMs: number
  vertDescentMs: number
  maxPayloadKg: number
  rangeTable: RangePoint[]
  publishedReserveFraction: number
  maxWindMs: number
  maxGustMs: number
  tempMinC: number
  tempMaxC: number
  rain: RainCapability
  ceilingAmslM: number
  modes: DeliveryMode[]
  winchMinPayloadKg: number
  winchCableM: number
  winchSpeedMs: number
  /** metres of level cruise that cost the same energy as climbing 1 m */
  climbEquivalentM: number
  /** km of cruise range consumed per minute of hover */
  hoverKmPerMin: number
  /** where each field came from; fields missing from the spec are 'assumption' */
  provenance: Record<string, Evidence>
  /** set when a parameter needed for simulation is unknown and no defensible default exists */
  missing: string[]
}

export interface Weather {
  windMs: number
  gustMs: number
  /** meteorological convention: direction the wind blows FROM, degrees clockwise from north */
  windFromDeg: number
  tempC: number
  precipitation: Precipitation
  icing: boolean
  night: boolean
  /** multiplier on road speeds for ground responders (snow, ice) */
  roadSpeedFactor: number
}

export interface AedKit {
  aedKg: number
  enclosureKg: number
  mechanismKg: number
  extrasKg: number
}

export interface OpsSettings {
  /** emergency call answered → drone alerted (shared call-handling phase) */
  callProcessingS: number
  /** drone alerted → wheels up */
  launchPrepS: number
  /** cruise height above terrain the route must keep */
  minAglM: number
  /** height reached vertically before transition / forward flight */
  transitionAglM: number
  /** height of the final hover before delivery */
  approachAglM: number
  /** battery share that must remain on landing back at base */
  reserveFraction: number
  /** 'return' = fly back to base; 'one-way' = stay at scene, recovered later */
  returnPolicy: 'return' | 'one-way'
  /** battery swap / re-arm time before the drone can launch again */
  turnaroundMin: number
  /** landing: touchdown + unload; winch/drop: release */
  landUnloadS: number
  releaseS: number
  winchHoverAglM: number
  /** bystander fetches the AED from the drop point */
  retrievalS: number
  /** battery capacity loss per °C below 15 °C */
  coldDeratePerC: number
  /** allow flights at night */
  nightOps: boolean
  /** fly below the manufacturer's minimum temperature, down to coldMinC */
  coldOps: boolean
  coldMinC: number
  /** preferred delivery mode order */
  modePreference: DeliveryMode[]
}

export type SiteType = 'open' | 'no-landing'

export interface Zone {
  id: string
  name: string
  center: LngLat
  radiusM: number
  kind: 'aerodrome' | 'heliport' | 'custom'
  enforced: boolean
  note?: string
}

export type InfeasibleReason =
  | 'payload'
  | 'wind'
  | 'gust'
  | 'temperature'
  | 'precipitation'
  | 'icing'
  | 'night'
  | 'range'
  | 'ceiling'
  | 'delivery-mode'
  | 'zone'
  | 'unavailable'
  | 'busy'
  | 'missing-data'
  | 'outside-area'
  | 'no-fleet'

export interface ProfileSample {
  /** horizontal distance from start, m */
  s: number
  lon: number
  lat: number
  terrainM: number
  altM: number
}

export interface FlightProfile {
  ok: boolean
  reason?: InfeasibleReason
  horizM: number
  /** vertical (hover) climb to the transition height, s */
  takeoffS: number
  /** climbing in a holding pattern at cruise power when terrain ahead is too steep to out-climb en route, s */
  holdClimbS: number
  cruiseS: number
  /** descending in a holding pattern over the destination, s */
  holdDescentS: number
  /** vertical (hover) descent from the approach height to delivery height, s */
  finalDescentS: number
  totalAscentM: number
  maxAltAmslM: number
  maxAglM: number
  /** distance flown through the air mass at cruise power (cruise legs and holding), m */
  airDistanceM: number
  meanGroundSpeedMs: number
  samples: ProfileSample[]
  path: LngLat[]
  /** true when the lateral path is a detour around an enforced zone */
  detoured: boolean
}

export interface EnergyBudget {
  publishedKm: number
  usableKm: number
  requiredKm: number
  outboundKm: number
  returnKm: number
  climbKm: number
  hoverKm: number
  marginKm: number
  tempFactor: number
}

export interface TimeComponent {
  key: string
  label: string
  seconds: number
  evidence: Evidence
  note?: string
}

export interface DroneMission {
  feasible: boolean
  reasons: InfeasibleReason[]
  reasonText: string[]
  baseId: string
  droneId: string
  specId: string
  mode: DeliveryMode | null
  components: TimeComponent[]
  /** call → AED on the ground at the scene */
  deliveredS: number
  /** call → AED at the patient's side (after retrieval) */
  atPatientS: number
  outbound: FlightProfile | null
  inbound: FlightProfile | null
  energy: EnergyBudget | null
  /** seconds after the call at which the drone is ready for another mission */
  readyAgainS: number
  payloadKg: number
  routeApprox: string
}

export interface ResponderResult {
  kind: 'ground-ems' | 'mountain-rescue' | 'hems' | 'public-aed'
  label: string
  available: boolean
  unavailableReason?: string
  fromName?: string
  components: TimeComponent[]
  totalS: number
  route: LngLat[]
  distanceM: number
  illustrative: boolean
  notes: string[]
}
