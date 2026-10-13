import { describe, expect, it } from 'vitest'
import { fleetCost, unitPrice, type CostSettings } from '../cost'

const S: CostSettings = {
  lifeYears: 5,
  maintenanceShare: 0.1,
  stationCapexEur: 10_000,
  stationAnnualEur: 2_000,
  aedAnnualEur: 250,
  staffFte: 2,
  staffCostEur: 40_000,
  otherAnnualEur: 1_000,
  unknownPriceEur: 60_000,
  priceOverrideEur: {},
  eurCzk: 25,
}
const price = (id: string) => ({ a: 20_000, b: 50_000 })[id] ?? null
const base = (...specs: string[]) => ({ drones: specs.map((specId) => ({ specId })) })

describe('fleet cost — manually calculable', () => {
  it('two bases, three drones of two models', () => {
    // aircraft: 2 × 20,000 + 50,000 = 90,000; stations: 2 × 10,000 = 20,000
    const c = fleetCost([base('a', 'a'), base('b')], price, S)
    expect(c.drones).toBe(3)
    expect(c.bases).toBe(2)
    expect(c.aircraftPurchaseEur).toBe(90_000)
    expect(c.purchaseEur).toBe(110_000)
    expect(c.annual.aircraftWriteOffEur).toBe(18_000) // 90,000 ÷ 5
    expect(c.annual.stationWriteOffEur).toBe(4_000) // 20,000 ÷ 5
    expect(c.annual.maintenanceEur).toBe(9_000) // 10 %
    expect(c.annual.stationsEur).toBe(4_000)
    expect(c.annual.aedEur).toBe(750)
    expect(c.annual.staffEur).toBe(80_000)
    expect(c.annualEquipmentEur).toBe(35_750)
    expect(c.annualEur).toBe(35_750 + 80_000 + 1_000)
    expect(c.hasPlaceholder).toBe(false)
    expect(c.lines.find((l) => l.specId === 'a')).toMatchObject({ count: 2, unitPriceEur: 20_000, basis: 'published', annualEur: 8_000 + 4_000 })
  })
  it('an empty fleet costs nothing, including staff', () => {
    const c = fleetCost([], price, S)
    expect(c.annualEur).toBe(0)
    expect(c.purchaseEur).toBe(0)
    expect(fleetCost([base()], price, S).bases).toBe(0)
  })
  it('an unpublished price uses the planning value and is flagged', () => {
    const c = fleetCost([base('x')], price, S)
    expect(c.lines[0]).toMatchObject({ unitPriceEur: 60_000, basis: 'placeholder' })
    expect(c.hasPlaceholder).toBe(true)
  })
  it('a user-entered price overrides both the published one and the planning value', () => {
    const s = { ...S, priceOverrideEur: { a: 30_000, x: 120_000 } }
    expect(unitPrice('a', 20_000, s)).toEqual({ priceEur: 30_000, basis: 'user' })
    expect(unitPrice('x', null, s)).toEqual({ priceEur: 120_000, basis: 'user' })
    expect(fleetCost([base('x')], price, s).hasPlaceholder).toBe(false)
  })
  it('a longer service life lowers the yearly write-off only', () => {
    const five = fleetCost([base('b')], price, S)
    const ten = fleetCost([base('b')], price, { ...S, lifeYears: 10 })
    expect(ten.annual.aircraftWriteOffEur).toBe(five.annual.aircraftWriteOffEur / 2)
    expect(ten.annual.maintenanceEur).toBe(five.annual.maintenanceEur)
    expect(ten.purchaseEur).toBe(five.purchaseEur)
  })
})
