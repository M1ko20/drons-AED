// Czech number, percentage and currency formatting for everything shown to the user.
const formatters = new Map<number, Intl.NumberFormat>()
const nf = (digits: number) => {
  let f = formatters.get(digits)
  if (!f) formatters.set(digits, (f = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: digits, maximumFractionDigits: digits })))
  return f
}

/** 12 345,6 — Czech grouping and decimal comma; "—" for missing values. */
export const num = (v: number | null | undefined, digits = 0) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : nf(digits).format(v))

export const pct = (a: number, b: number, digits = 0) => (b > 0 ? `${num((100 * a) / b, digits)} %` : '—')

export const eur = (v: number) => `${num(v)} €`

/** Compact koruna amount: "5,9 mil. Kč", "850 tis. Kč", "12 000 Kč". */
export function czk(amountEur: number, eurCzk: number): string {
  if (!Number.isFinite(amountEur)) return '—'
  const v = amountEur * eurCzk
  if (Math.abs(v) >= 1e6) return `${num(v / 1e6, Math.abs(v) >= 1e7 ? 1 : 2)} mil. Kč`
  if (Math.abs(v) >= 1e5) return `${num(v / 1e3)} tis. Kč`
  return `${num(Math.round(v / 100) * 100)} Kč`
}

/** Czech plural: plural(3, 'dron', 'drony', 'dronů') → "3 drony". */
export function plural(n: number, one: string, few: string, many: string): string {
  const word = n === 1 ? one : n >= 2 && n <= 4 ? few : many
  return `${num(n)} ${word}`
}
