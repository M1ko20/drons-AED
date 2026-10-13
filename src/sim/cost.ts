// Fleet cost model. Deliberately simple and transparent: every input is either a sourced
// price or a labelled, configurable assumption. Amounts are in EUR; the UI converts to CZK.

export interface CostSettings {
  /** years over which aircraft and station equipment are written off (straight line) */
  lifeYears: number
  /** yearly maintenance, spares and batteries as a share of the aircraft purchase price */
  maintenanceShare: number
  /** hangar / charging station equipment bought per base */
  stationCapexEur: number
  /** yearly upkeep and site cost per base */
  stationAnnualEur: number
  /** yearly cost of keeping one AED kit ready (pads, battery, checks) */
  aedAnnualEur: number
  /** remote pilots / flight supervisors, full-time equivalents for the whole fleet */
  staffFte: number
  /** yearly employer cost of one full-time equivalent */
  staffCostEur: number
  /** anything else per year: insurance, software, connectivity, training, authorisations */
  otherAnnualEur: number
  /** planning value used for aircraft whose price is not published */
  unknownPriceEur: number
  /** user-entered purchase price per aircraft model; overrides the researched value */
  priceOverrideEur: Record<string, number>
  /** CZK per EUR, for display */
  eurCzk: number
}

export type PriceBasis = 'published' | 'user' | 'placeholder'

export interface CostLine {
  specId: string
  count: number
  unitPriceEur: number
  basis: PriceBasis
  purchaseEur: number
  /** write-off plus maintenance for all aircraft of this model, per year */
  annualEur: number
}

export interface FleetCost {
  lines: CostLine[]
  drones: number
  bases: number
  /** one-off purchase: aircraft plus station equipment */
  purchaseEur: number
  aircraftPurchaseEur: number
  stationPurchaseEur: number
  annual: {
    aircraftWriteOffEur: number
    stationWriteOffEur: number
    maintenanceEur: number
    stationsEur: number
    aedEur: number
    staffEur: number
    otherEur: number
  }
  annualEur: number
  /** annual cost excluding staff and "other" — the part that scales with the fleet */
  annualEquipmentEur: number
  /** true when at least one price is the planning placeholder rather than a real figure */
  hasPlaceholder: boolean
}

export function unitPrice(specId: string, publishedEur: number | null, s: CostSettings): { priceEur: number; basis: PriceBasis } {
  const user = s.priceOverrideEur[specId]
  if (user !== undefined && isFinite(user) && user >= 0) return { priceEur: user, basis: 'user' }
  if (publishedEur !== null) return { priceEur: publishedEur, basis: 'published' }
  return { priceEur: s.unknownPriceEur, basis: 'placeholder' }
}

/**
 * Yearly cost of a fleet.
 *
 *   write-off   = (Σ aircraft prices + bases × station equipment) ÷ service life
 *   maintenance = Σ aircraft prices × maintenance share
 *   stations    = bases × yearly site cost
 *   AED kits    = drones × yearly AED upkeep
 *   staff       = FTE × yearly cost per FTE        (zero when the fleet is empty)
 *   total       = all of the above + other
 *
 * Every drone in the fleet counts, including those marked out of service: they were bought.
 */
export function fleetCost(
  bases: { drones: { specId: string }[] }[],
  publishedPriceEur: (specId: string) => number | null,
  s: CostSettings,
): FleetCost {
  const counts = new Map<string, number>()
  let nBases = 0
  for (const b of bases) {
    if (b.drones.length) nBases++
    for (const d of b.drones) counts.set(d.specId, (counts.get(d.specId) ?? 0) + 1)
  }
  const life = Math.max(1, s.lifeYears)
  const lines: CostLine[] = []
  let aircraft = 0
  let drones = 0
  for (const [specId, count] of counts) {
    const { priceEur, basis } = unitPrice(specId, publishedPriceEur(specId), s)
    const purchaseEur = priceEur * count
    aircraft += purchaseEur
    drones += count
    lines.push({ specId, count, unitPriceEur: priceEur, basis, purchaseEur, annualEur: purchaseEur / life + purchaseEur * s.maintenanceShare })
  }
  const stationPurchase = nBases * s.stationCapexEur
  const annual = {
    aircraftWriteOffEur: aircraft / life,
    stationWriteOffEur: stationPurchase / life,
    maintenanceEur: aircraft * s.maintenanceShare,
    stationsEur: nBases * s.stationAnnualEur,
    aedEur: drones * s.aedAnnualEur,
    staffEur: drones ? s.staffFte * s.staffCostEur : 0,
    otherEur: drones ? s.otherAnnualEur : 0,
  }
  const equipment = annual.aircraftWriteOffEur + annual.stationWriteOffEur + annual.maintenanceEur + annual.stationsEur + annual.aedEur
  return {
    lines,
    drones,
    bases: nBases,
    purchaseEur: aircraft + stationPurchase,
    aircraftPurchaseEur: aircraft,
    stationPurchaseEur: stationPurchase,
    annual,
    annualEur: equipment + annual.staffEur + annual.otherEur,
    annualEquipmentEur: equipment,
    hasPlaceholder: lines.some((l) => l.basis === 'placeholder'),
  }
}
