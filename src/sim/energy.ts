import type { AedKit, RangePoint } from './types'

export function kitMassKg(kit: AedKit): number {
  return kit.aedKg + kit.enclosureKg + kit.mechanismKg + kit.extrasKg
}

/**
 * Published still-air range at a payload, by linear interpolation in the manufacturer's table.
 * Below the lightest tabulated payload the lightest value is used (never extrapolated upward);
 * above the heaviest the heaviest value is used — the payload limit is checked separately.
 */
export function rangeAtPayloadKm(table: RangePoint[], payloadKg: number): number {
  if (!table.length) return NaN
  const t = [...table].sort((a, b) => a.payloadKg - b.payloadKg)
  if (payloadKg <= t[0].payloadKg) return t[0].oneWayKm
  for (let i = 1; i < t.length; i++) {
    if (payloadKg <= t[i].payloadKg) {
      const f = (payloadKg - t[i - 1].payloadKg) / (t[i].payloadKg - t[i - 1].payloadKg)
      return t[i - 1].oneWayKm + f * (t[i].oneWayKm - t[i - 1].oneWayKm)
    }
  }
  return t[t.length - 1].oneWayKm
}

/** Battery capacity factor in the cold: 1 at ≥ 15 °C, falling linearly, floored at 0.4. */
export function tempFactor(tempC: number, coldDeratePerC: number): number {
  return Math.max(0.4, Math.min(1, 1 - coldDeratePerC * Math.max(0, 15 - tempC)))
}

/**
 * Usable still-air distance budget for one sortie.
 *
 *   gross  = published / (1 − reserve already inside the published figure)
 *   usable = gross × tempFactor × (1 − required landing reserve)
 */
export function usableRangeKm(
  publishedKm: number,
  publishedReserveFraction: number,
  tFactor: number,
  reserveFraction: number,
): number {
  const gross = publishedKm / (1 - publishedReserveFraction)
  return gross * tFactor * (1 - reserveFraction)
}
