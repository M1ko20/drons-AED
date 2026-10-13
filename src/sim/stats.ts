/** Quantile with linear interpolation between order statistics (type 7); NaN for empty input. */
export function quantile(values: number[], q: number): number {
  const v = values.filter((x) => isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return NaN
  const pos = (v.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return v[lo] + (v[hi] - v[lo]) * (pos - lo)
}

export function mean(values: number[]): number {
  const v = values.filter((x) => isFinite(x))
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN
}

/**
 * Erlang-B blocking probability: chance that all `servers` are busy when a request arrives,
 * for offered load `erlangs` = arrival rate × mean service time. Assumes Poisson arrivals and
 * no queueing (a request finding every drone busy is simply not served by drone).
 */
export function erlangB(servers: number, erlangs: number): number {
  if (servers <= 0) return 1
  if (erlangs <= 0) return 0
  let b = 1
  for (let k = 1; k <= servers; k++) b = (erlangs * b) / (k + erlangs * b)
  return b
}

export function formatDuration(seconds: number): string {
  if (!isFinite(seconds)) return '—'
  const s = Math.round(seconds)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
