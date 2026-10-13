import { DEFAULT_KIT, DEFAULT_OPS } from '../../data/defaults'
import { flatDem, type Dem } from '../dem'
import type { MissionContext, MissionOrigin } from '../mission'
import type { DronePerf, LngLat, OpsSettings, Weather, Zone } from '../types'
import { ZoneRouter } from '../zones'

export const CENTER: LngLat = [18.4, 49.5]

export const CALM: Weather = {
  windMs: 0,
  gustMs: 0,
  windFromDeg: 270,
  tempC: 15,
  precipitation: 'none',
  icing: false,
  night: false,
  roadSpeedFactor: 1,
}

/** A simple, fully specified multirotor: 20 m/s, 40 km still-air range, lands or winches. */
export function testPerf(over: Partial<DronePerf> = {}): DronePerf {
  return {
    specId: 'test',
    config: 'multirotor',
    cruiseMs: 20,
    climbMs: 5,
    descentMs: 5,
    vertClimbMs: 5,
    vertDescentMs: 5,
    maxPayloadKg: 5,
    rangeTable: [{ payloadKg: 0, oneWayKm: 40 }],
    publishedReserveFraction: 0,
    maxWindMs: 12,
    maxGustMs: 18,
    tempMinC: -10,
    tempMaxC: 40,
    rain: 'light',
    ceilingAmslM: 3000,
    modes: ['winch', 'land'],
    winchMinPayloadKg: 0,
    winchCableM: 30,
    winchSpeedMs: 1,
    climbEquivalentM: 0,
    hoverKmPerMin: 0,
    provenance: {},
    missing: [],
    ...over,
  }
}

export function testCtx(
  over: { dem?: Dem; weather?: Partial<Weather>; ops?: Partial<OpsSettings>; zones?: Zone[] } = {},
): MissionContext {
  return {
    dem: over.dem ?? flatDem(400, CENTER, 512),
    weather: { ...CALM, ...over.weather },
    ops: { ...DEFAULT_OPS, ...over.ops },
    kit: { ...DEFAULT_KIT },
    zones: new ZoneRouter(over.zones ?? [], CENTER),
    stepM: 100,
    keepSamples: true,
  }
}

export function origin(ctx: MissionContext, position: LngLat = CENTER, id = 'b1'): MissionOrigin {
  return { baseId: id, droneId: id + '-d1', position, zoneSource: ctx.zones.from(position) }
}
