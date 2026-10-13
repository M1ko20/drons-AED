import { describe, expect, it } from 'vitest'
import { kitMassKg, rangeAtPayloadKm, tempFactor, usableRangeKm } from '../energy'
import { bearingDeg, destination, distanceM, pointInPolygon } from '../geo'
import { erlangB, quantile } from '../stats'
import { toblerSpeedMs } from '../walk'
import { groundSpeed } from '../wind'

describe('geodesy', () => {
  it('one degree of latitude is 111.2 km', () => {
    expect(distanceM([18, 49], [18, 50])).toBeCloseTo(111195, -2)
  })
  it('one degree of longitude at 49.5°N is 72.2 km', () => {
    expect(distanceM([18, 49.5], [19, 49.5]) / 1000).toBeCloseTo(111.195 * Math.cos((49.5 * Math.PI) / 180), 1)
  })
  it('destination inverts distance and bearing', () => {
    const a: [number, number] = [18.4, 49.5]
    const b = destination(a, 73, 12500)
    expect(distanceM(a, b)).toBeCloseTo(12500, 0)
    expect(bearingDeg(a, b)).toBeCloseTo(73, 1)
  })
  it('point in polygon respects holes', () => {
    const outer: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
    const hole: [number, number][] = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]
    expect(pointInPolygon([2, 2], [outer, hole])).toBe(true)
    expect(pointInPolygon([5, 5], [outer, hole])).toBe(false)
    expect(pointInPolygon([11, 5], [outer, hole])).toBe(false)
  })
})

describe('wind triangle', () => {
  it('headwind subtracts, tailwind adds', () => {
    // flying north (0°): wind FROM the north is a headwind
    expect(groundSpeed(20, 0, 5, 0).gs).toBeCloseTo(15)
    expect(groundSpeed(20, 0, 5, 180).gs).toBeCloseTo(25)
  })
  it('pure crosswind: gs = sqrt(V² − W²)', () => {
    expect(groundSpeed(20, 0, 12, 90).gs).toBeCloseTo(16)
  })
  it('is not flyable when the crosswind exceeds the airspeed', () => {
    expect(groundSpeed(10, 0, 12, 90).ok).toBe(false)
  })
  it('is not flyable when a headwind leaves under 2 m/s over ground', () => {
    expect(groundSpeed(10, 0, 9, 0).ok).toBe(false)
  })
  it('a round trip in wind always takes longer than in calm air', () => {
    const out = groundSpeed(20, 90, 8, 60).gs
    const back = groundSpeed(20, 270, 8, 60).gs
    expect(1 / out + 1 / back).toBeGreaterThan(2 / 20)
  })
})

describe('energy budget', () => {
  const table = [
    { payloadKg: 0, oneWayKm: 100 },
    { payloadKg: 1, oneWayKm: 90 },
    { payloadKg: 3, oneWayKm: 80 },
  ]
  it('interpolates the published range by payload', () => {
    expect(rangeAtPayloadKm(table, 0.5)).toBeCloseTo(95)
    expect(rangeAtPayloadKm(table, 2)).toBeCloseTo(85)
  })
  it('never extrapolates beyond the table', () => {
    expect(rangeAtPayloadKm(table, -1)).toBe(100)
    expect(rangeAtPayloadKm(table, 9)).toBe(80)
  })
  it('a single published point applies to every payload', () => {
    expect(rangeAtPayloadKm([{ payloadKg: 0, oneWayKm: 49 }], 2)).toBe(49)
  })
  it('cold derating: 1 at 15 °C, 0.8 at −10 °C with 0.8 %/°C', () => {
    expect(tempFactor(20, 0.008)).toBe(1)
    expect(tempFactor(-10, 0.008)).toBeCloseTo(0.8)
    expect(tempFactor(-200, 0.008)).toBe(0.4)
  })
  it('does not double-count a reserve already inside the published figure', () => {
    // Wingcopter-style: 75 km published with 20 % reserve; our 20 % reserve → 75 km usable
    expect(usableRangeKm(75, 0.2, 1, 0.2)).toBeCloseTo(75)
    // flown-to-empty figure: 20 % reserve removes 20 %
    expect(usableRangeKm(49, 0, 1, 0.2)).toBeCloseTo(39.2)
  })
  it('sums the kit mass', () => {
    expect(kitMassKg({ aedKg: 1.1, enclosureKg: 0.3, mechanismKg: 0.4, extrasKg: 0.2 })).toBeCloseTo(2.0)
  })
})

describe('statistics helpers', () => {
  it('quantiles interpolate', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantile([10, 20, 30, 40, 50], 0.9)).toBeCloseTo(46)
    expect(quantile([1, Infinity, 3], 0.5)).toBe(2)
    expect(quantile([], 0.5)).toBeNaN()
  })
  it('Erlang-B matches textbook values', () => {
    expect(erlangB(1, 1)).toBeCloseTo(0.5)
    expect(erlangB(2, 1)).toBeCloseTo(0.2)
    expect(erlangB(3, 0)).toBe(0)
    expect(erlangB(0, 1)).toBe(1)
  })
  it('Tobler: about 5 km/h on the flat, slower uphill, off-path × 0.6', () => {
    expect(toblerSpeedMs(0, false) * 3.6).toBeCloseTo(5.04, 1)
    expect(toblerSpeedMs(0.3, false)).toBeLessThan(toblerSpeedMs(0, false))
    expect(toblerSpeedMs(0, true)).toBeCloseTo(toblerSpeedMs(0, false) * 0.6)
  })
})
