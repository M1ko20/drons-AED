import { inDem, type Dem } from './dem'
import { kitMassKg, rangeAtPayloadKm, tempFactor, usableRangeKm } from './energy'
import { computeProfile, flightTimeS, type ProfileParams } from './profile'
import type {
  AedKit,
  DeliveryMode,
  DroneMission,
  DronePerf,
  EnergyBudget,
  InfeasibleReason,
  LngLat,
  OpsSettings,
  SiteType,
  TimeComponent,
  Weather,
} from './types'
import type { ZoneRouter, ZoneSource } from './zones'

export interface MissionContext {
  dem: Dem
  weather: Weather
  ops: OpsSettings
  kit: AedKit
  zones: ZoneRouter
  /** sampling interval for flight profiles, m */
  stepM: number
  keepSamples: boolean
}

export interface MissionOrigin {
  baseId: string
  droneId: string
  position: LngLat
  /** cached zone-routing source for this base */
  zoneSource: ZoneSource
}

// User-facing texts are Czech (the app's language); identifiers stay English.
const cs = (v: number, d = 1) => v.toFixed(d).replace('.', ',')

const MODE_LABEL: Record<DeliveryMode, string> = {
  land: 'přistání',
  winch: 'naviják',
  'low-drop': 'spuštění na laně',
  parachute: 'padák',
}

const PRECIP_LABEL: Record<string, string> = {
  'light-rain': 'Slabý déšť',
  'heavy-rain': 'Silný déšť',
  snow: 'Sněžení',
}

/** Weather and payload gates that do not depend on the destination. */
export function staticGates(
  perf: DronePerf,
  weather: Weather,
  ops: OpsSettings,
  payloadKg: number,
): { reasons: InfeasibleReason[]; text: string[] } {
  const reasons: InfeasibleReason[] = []
  const text: string[] = []
  const add = (r: InfeasibleReason, t: string) => (reasons.push(r), text.push(t))

  if (perf.missing.length) add('missing-data', `Nelze simulovat: výrobce neuvádí ${perf.missing.join(', ')}`)
  if (payloadKg > perf.maxPayloadKg + 1e-9)
    add('payload', `Sada AED ${cs(payloadKg, 2)} kg překračuje nosnost ${cs(perf.maxPayloadKg)} kg`)
  if (weather.windMs > perf.maxWindMs)
    add('wind', `Průměrný vítr ${weather.windMs} m/s překračuje limit ${perf.maxWindMs} m/s`)
  if (weather.gustMs > perf.maxGustMs)
    add('gust', `Nárazy ${weather.gustMs} m/s překračují limit ${perf.maxGustMs.toFixed(0)} m/s`)
  // the cold-operations assumption only ever lowers the limit, never raises a better published one
  const tempMinC = ops.coldOps ? Math.min(perf.tempMinC, ops.coldMinC) : perf.tempMinC
  if (weather.tempC < tempMinC || weather.tempC > perf.tempMaxC)
    add('temperature', `${weather.tempC} °C je mimo provozní rozsah ${tempMinC}…${perf.tempMaxC} °C${ops.coldOps && tempMinC < perf.tempMinC ? ' (s předpokladem letu v mrazu)' : ''}`)
  if (weather.icing) add('icing', 'Námraza: žádný z modelovaných strojů nesmí létat v podmínkách námrazy')
  if (weather.precipitation !== 'none') {
    const heavy = weather.precipitation === 'heavy-rain' || weather.precipitation === 'snow'
    const cap = perf.rain
    if (cap === 'unknown' || cap === 'none' || (heavy && cap !== 'heavy')) {
      const why =
        cap === 'unknown'
          ? 'odolnost vůči srážkám není zveřejněna (bráno jako nezpůsobilý)'
          : cap === 'none'
            ? 'stroj není určen pro let ve srážkách'
            : 'stroj je určen jen pro slabý déšť'
      add('precipitation', `${PRECIP_LABEL[weather.precipitation]}: ${why}`)
    }
  }
  if (weather.night && !ops.nightOps) add('night', 'Noční provoz je v provozních předpokladech vypnut')
  return { reasons, text }
}

/** First delivery mode in the preference order that the aircraft and the site both allow. */
export function chooseMode(
  perf: DronePerf,
  ops: OpsSettings,
  site: SiteType,
  payloadKg: number,
): { mode: DeliveryMode | null; text: string } {
  const notes: string[] = []
  for (const mode of ops.modePreference) {
    if (!perf.modes.includes(mode)) continue
    if (mode === 'land' && site === 'no-landing') {
      notes.push('přistání vyloučeno (na místě není bezpečná plocha)')
      continue
    }
    if (mode === 'winch' && payloadKg < perf.winchMinPayloadKg) {
      notes.push(`naviják vyžaduje zátěž alespoň ${perf.winchMinPayloadKg} kg (sada má ${cs(payloadKg, 2)} kg)`)
      continue
    }
    return { mode, text: notes.join('; ') }
  }
  if (!perf.modes.length) notes.push('u tohoto stroje není doložen žádný způsob doručení')
  return { mode: null, text: notes.join('; ') || 'žádný vhodný způsob doručení' }
}

function deliveryPhase(mode: DeliveryMode, perf: DronePerf, ops: OpsSettings) {
  // endHeight: height of the aircraft when the AED leaves it; hoverS: time spent hovering at
  // the scene (counts against the battery); deliverS: time until the AED is on the ground
  switch (mode) {
    case 'land':
      return { endHeight: 0, deliverS: ops.landUnloadS, hoverS: 0 }
    case 'winch': {
      const height = Math.min(ops.winchHoverAglM, perf.winchCableM)
      const lower = height / perf.winchSpeedMs
      return { endHeight: height, deliverS: lower + ops.releaseS, hoverS: 2 * lower + ops.releaseS }
    }
    case 'low-drop':
      return { endHeight: 10, deliverS: ops.releaseS, hoverS: ops.releaseS }
    case 'parachute':
      // ~20 m release height, canopy descent ≈ 5 m/s
      return { endHeight: 20, deliverS: 4, hoverS: 0 }
  }
}

/**
 * Full mission evaluation for one drone and one destination: gates → delivery mode → route →
 * outbound and return profiles → energy → time components. Deterministic.
 * `waitS` is time the drone is still occupied after the alert (0 when idle).
 */
export function evaluateMission(
  ctx: MissionContext,
  perf: DronePerf,
  origin: MissionOrigin,
  target: LngLat,
  site: SiteType,
  waitS = 0,
): DroneMission {
  const { ops, weather, dem } = ctx
  const payloadKg = kitMassKg(ctx.kit)
  const gates = staticGates(perf, weather, ops, payloadKg)
  const reasons = [...gates.reasons]
  const reasonText = [...gates.text]

  const base: DroneMission = {
    feasible: false,
    reasons,
    reasonText,
    baseId: origin.baseId,
    droneId: origin.droneId,
    specId: perf.specId,
    mode: null,
    components: [],
    deliveredS: Infinity,
    atPatientS: Infinity,
    outbound: null,
    inbound: null,
    energy: null,
    readyAgainS: Infinity,
    payloadKg,
    routeApprox: '',
  }
  if (reasons.includes('missing-data')) return base
  if (!inDem(dem, target) || !inDem(dem, origin.position)) {
    reasons.push('outside-area')
    reasonText.push('Mimo rozsah dat: terén, silnice ani stanoviště tam nejsou modelovány')
    return base
  }

  const picked = chooseMode(perf, ops, site, payloadKg)
  if (!picked.mode) {
    reasons.push('delivery-mode')
    reasonText.push(`Žádný použitelný způsob doručení: ${picked.text}`)
    return base
  }
  const mode = picked.mode
  base.mode = mode

  const inZone = ctx.zones.zoneAt(target) ?? ctx.zones.zoneAt(origin.position)
  const path = inZone ? null : origin.zoneSource.pathTo(target)
  if (!path) {
    reasons.push('zone')
    reasonText.push(inZone ? `Uvnitř vynucené bezletové zóny „${inZone.name}“` : 'Vynucené bezletové zóny nelze obletět')
    return base
  }

  const dp = deliveryPhase(mode, perf, ops)
  const common: Omit<ProfileParams, 'startHeightAglM' | 'endHeightAglM' | 'windFromDeg'> = {
    cruiseMs: perf.cruiseMs,
    climbMs: perf.climbMs,
    descentMs: perf.descentMs,
    vertClimbMs: perf.vertClimbMs,
    vertDescentMs: perf.vertDescentMs,
    minAglM: ops.minAglM,
    transitionAglM: ops.transitionAglM,
    approachAglM: Math.max(ops.approachAglM, dp.endHeight),
    ceilingAmslM: perf.ceilingAmslM,
    windMs: weather.windMs,
    stepM: ctx.stepM,
    noHover: perf.config === 'fixed-wing',
    keepSamples: ctx.keepSamples,
  }
  const outbound = computeProfile(dem, path, {
    ...common,
    windFromDeg: weather.windFromDeg,
    startHeightAglM: 0,
    endHeightAglM: dp.endHeight,
  })
  base.outbound = outbound
  if (!outbound.ok) {
    reasons.push(outbound.reason!)
    reasonText.push(
      outbound.reason === 'wind'
        ? 'Vítr je příliš silný na udržení trati při cestovní rychlosti'
        : `Trasa vyžaduje ${Math.round(outbound.maxAltAmslM)} m n. m., což je nad dostupem ${perf.ceilingAmslM} m`,
    )
  }

  let inbound = null
  if (ops.returnPolicy === 'return') {
    inbound = computeProfile(dem, [...path].reverse(), {
      ...common,
      approachAglM: ops.approachAglM,
      transitionAglM: Math.max(ops.transitionAglM, dp.endHeight),
      windFromDeg: weather.windFromDeg,
      startHeightAglM: dp.endHeight,
      endHeightAglM: 0,
    })
    base.inbound = inbound
    if (!inbound.ok && outbound.ok) {
      reasons.push(inbound.reason!)
      reasonText.push(inbound.reason === 'wind' ? 'Vítr je příliš silný pro zpáteční let při cestovní rychlosti' : 'Zpáteční let překračuje dostup')
    }
  }

  // --- energy, expressed as equivalent still-air cruise distance
  const published = rangeAtPayloadKm(perf.rangeTable, payloadKg)
  const tF = tempFactor(weather.tempC, ops.coldDeratePerC)
  const usable = usableRangeKm(published, perf.publishedReserveFraction, tF, ops.reserveFraction)
  const vertS = outbound.takeoffS + outbound.finalDescentS + (inbound ? inbound.takeoffS + inbound.finalDescentS : 0)
  const hoverKm = ((vertS + dp.hoverS) / 60) * perf.hoverKmPerMin
  const climbKm = ((outbound.totalAscentM + (inbound?.totalAscentM ?? 0)) * perf.climbEquivalentM) / 1000
  const outboundKm = outbound.airDistanceM / 1000
  const returnKm = (inbound?.airDistanceM ?? 0) / 1000
  const requiredKm = outboundKm + returnKm + climbKm + hoverKm
  const energy: EnergyBudget = {
    publishedKm: published,
    usableKm: usable,
    requiredKm,
    outboundKm,
    returnKm,
    climbKm,
    hoverKm,
    marginKm: usable - requiredKm,
    tempFactor: tF,
  }
  base.energy = energy
  if (outbound.ok && (!inbound || inbound.ok) && requiredKm > usable) {
    reasons.push('range')
    reasonText.push(
      `Let potřebuje ${cs(requiredKm)} km doletu (${ops.returnPolicy === 'return' ? 'tam a zpět' : 'jen tam'}, včetně stoupání a visu), ale po odečtení rezervy je využitelných jen ${cs(usable)} km`,
    )
  }

  // --- time components (shown even when infeasible so the user can see why it would not matter)
  const components: TimeComponent[] = [
    {
      key: 'call',
      label: 'Příjem výzvy do vyrozumění dronu',
      seconds: ops.callProcessingS,
      evidence: 'assumption',
      note: 'Výchozí 1:59 = medián od volání na tísňovou linku do výzvy ve švédské studii (Schierbeck et al. 2023)',
    },
  ]
  if (waitS > 0)
    components.push({
      key: 'wait',
      label: 'Čekání na volný dron',
      seconds: waitS,
      evidence: 'derived',
      note: 'Dron je ještě na předchozím letu nebo se připravuje k dalšímu',
    })
  components.push(
    {
      key: 'launch',
      label: 'Příprava ke startu',
      seconds: ops.launchPrepS,
      evidence: 'assumption',
      note: 'Výchozí 1:20 = medián od výzvy po vzlet ve švédské studii (včetně povolení řízení letového provozu)',
    },
    {
      key: 'climb',
      label: outbound.holdClimbS > 0.5 ? 'Vzlet a stoupání v kruzích nad základnou' : 'Svislý vzlet',
      seconds: outbound.takeoffS + outbound.holdClimbS,
      evidence: 'derived',
      note:
        outbound.holdClimbS > 0.5
          ? `Terén před strojem stoupá rychleji, než dokáže stoupat za letu: ${Math.round(outbound.holdClimbS * perf.climbMs)} m nabere kroužením rychlostí ${cs(perf.climbMs)} m/s`
          : `Do výšky ${Math.round(Math.min(ops.transitionAglM, ops.minAglM))} m nad základnou`,
    },
    {
      key: 'cruise',
      label: 'Let na místo',
      seconds: outbound.cruiseS,
      evidence: 'derived',
      note: `${cs(outbound.horizM / 1000, 2)} km rychlostí ${cs(outbound.meanGroundSpeedMs)} m/s vůči zemi`,
    },
    {
      key: 'descent',
      label: 'Klesání do výšky doručení',
      seconds: outbound.holdDescentS + outbound.finalDescentS,
      evidence: 'derived',
      note: outbound.holdDescentS > 0.5 ? `Z toho ${Math.round(outbound.holdDescentS)} s klesání v kruzích nad místem` : undefined,
    },
    {
      key: 'delivery',
      label: `Doručení (${MODE_LABEL[mode]})`,
      seconds: dp.deliverS,
      evidence: 'assumption',
      note:
        mode === 'winch'
          ? `Spuštění z ${Math.min(ops.winchHoverAglM, perf.winchCableM)} m rychlostí ${cs(perf.winchSpeedMs)} m/s a uvolnění`
          : undefined,
    },
    {
      key: 'retrieval',
      label: 'Přinesení AED k pacientovi',
      seconds: ops.retrievalS,
      evidence: 'assumption',
      note: 'Výchozí 30 s podle odhadu švédské studie; předpokládá druhou osobu, která může od pacienta odejít',
    },
  )
  base.components = components
  const sum = (keys: string[]) => components.filter((c) => keys.includes(c.key)).reduce((a, c) => a + c.seconds, 0)
  base.deliveredS = sum(['call', 'wait', 'launch', 'climb', 'cruise', 'descent', 'delivery'])
  base.atPatientS = base.deliveredS + ops.retrievalS

  if (inbound) {
    const backS = dp.hoverS - Math.min(dp.hoverS, dp.deliverS) + flightTimeS(inbound)
    base.readyAgainS = base.deliveredS + backS + ops.turnaroundMin * 60
  }
  base.routeApprox = outbound.detoured
    ? 'Přímé úseky kolem vynucených bezletových zón, výškový profil podle terénu'
    : 'Přímá trať, výškový profil podle terénu'
  base.feasible = reasons.length === 0
  return base
}
