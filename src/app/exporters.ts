// CSV / JSON export. Every file states which values are external data, assumptions or simulated.
// Column names and notes are Czech; CSV uses a semicolon and a BOM so that Czech Excel opens it.
import { DRONE_BY_ID, modelName } from '../data/drones'
import { DISCLAIMER } from '../data/notes'
import { SOURCES } from '../data/sources'
import type { World } from '../data/world'
import type { DemandPoint } from '../sim/coverage'
import { CATEGORY_LABEL, type ScenarioConfig } from './config'
import type { AnalysisResult, ScenarioResult } from './engine'
import { REASON_LABEL, scenarioCost, type Metrics } from './metrics'

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const cell = (v: unknown) => {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 100) / 100).replace('.', ',') : ''
  const s = String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const toCsv = (rows: unknown[][]) => '﻿' + rows.map((r) => r.map(cell).join(';')).join('\n') + '\n'

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'scenar'

const SITE = { open: 'volná plocha', 'no-landing': 'bez plochy k přistání' } as const

/** One row per time component of every responder for every emergency. */
export function incidentsCsv(config: ScenarioConfig, result: ScenarioResult): string {
  const rows: unknown[][] = [
    [`# ${DISCLAIMER}`],
    ['# sloupec „druh údaje“: „simulace“ = vypočteno modelem; „předpoklad“ = nastavitelný vstup; zdroje jsou v exportu JSON'],
    ['událost', 'zem. šířka', 'zem. délka', 'místo', 'složka', 'odkud', 'stroj', 'proveditelné', 'fáze', 'sekundy', 'druh údaje', 'poznámka', 'celkem sekund'],
  ]
  for (const o of result.outcomes) {
    const head = [o.incident.label, o.incident.position[1], o.incident.position[0], SITE[o.incident.site]]
    for (const m of o.candidates) {
      const base = config.bases.find((b) => b.id === m.baseId)?.name ?? m.baseId
      const model = modelName(m.specId)
      const tag = m === o.best ? 'dron (vyslaný)' : 'dron (alternativa)'
      if (!m.feasible) rows.push([...head, tag, base, model, 'ne', 'neproveditelné', '', 'simulace', m.reasonText.join(' | '), ''])
      else for (const c of m.components) rows.push([...head, tag, base, model, 'ano', c.label, c.seconds, c.evidence === 'assumption' ? 'předpoklad' : 'simulace', c.note ?? '', m.atPatientS])
    }
    for (const r of o.comparators) {
      if (!r.available) rows.push([...head, r.label, '', '', 'ne', 'nedostupné', '', 'simulace', r.unavailableReason ?? '', ''])
      else for (const c of r.components) rows.push([...head, r.label, r.fromName ?? '', '', 'ano', c.label, c.seconds, c.evidence === 'assumption' ? 'předpoklad' : 'simulace', c.note ?? '', r.totalS])
    }
  }
  return toCsv(rows)
}

/** One row per study location with drone and ambulance times. */
export function coverageCsv(config: ScenarioConfig, analysis: AnalysisResult, demandById: Map<string, DemandPoint>): string {
  const rows: unknown[][] = [
    [`# ${DISCLAIMER}`],
    [`# cílový čas ${config.analysis.targetMin} min; časy v sekundách od tísňového volání; prázdné = nelze obsloužit. Všechny časy jsou simulované.`],
    ['id', 'název', 'kategorie', 'zem. šířka', 'zem. délka', 'obyvatel (značka OSM)', 'typ místa', 'dron: AED u pacienta (s)', 'základna', 'stroj', 'počet základen, které místo obslouží', 'důvod neobsloužení', 'posádka ZZS u pacienta (s)', 'v cílovém čase'],
  ]
  for (const p of analysis.points) {
    const d = demandById.get(p.id)
    if (!d) continue
    rows.push([
      d.id, d.name, CATEGORY_LABEL[d.category], d.position[1], d.position[0], d.population ?? '', SITE[d.site], p.droneS,
      config.bases.find((b) => b.id === p.baseId)?.name ?? '', p.specId ? modelName(p.specId) : '',
      p.servingBases, p.reasons.map((r) => REASON_LABEL[r]).join(' | '), p.groundS, p.droneS <= config.analysis.targetMin * 60 ? 'ano' : 'ne',
    ])
  }
  return toCsv(rows)
}

export function scenarioJson(world: World, config: ScenarioConfig, result: ScenarioResult | null, metrics: Metrics | null): string {
  const usedSpecs = [...new Set(config.bases.flatMap((b) => b.drones.map((d) => d.specId)))]
  const clean = (_k: string, v: unknown) => (typeof v === 'number' && !Number.isFinite(v) ? null : v)
  const cost = scenarioCost(config)
  return JSON.stringify(
    {
      about: {
        tool: 'Simulátor pokrytí drony s AED – Beskydy (prototyp)',
        exportedAt: new Date().toISOString(),
        disclaimer: DISCLAIMER,
        dataRetrieved: world.manifest.retrievedAt,
        reading: {
          verifiedExternalData: 'aircraftSpecifications[*] – pole s evidence manufacturer / peer-reviewed / official / third-party, a `sources`',
          userConfigurableAssumptions: '`assumptions` (provoz, počasí, stávající složky, sada AED, zóny, náklady)',
          simulatedResults: '`results`, `coverageStatistics` a `fleetCost`',
        },
      },
      assumptions: {
        studyArea: config.studyArea,
        operations: config.ops,
        weather: config.weather,
        payloadKit: config.kit,
        conventionalResponders: config.comparators,
        cruiseSpeedOverrides: config.cruiseOverride,
        enforcedZones: config.zones.filter((z) => z.enforced),
        addedStations: config.extraStations,
        analysis: config.analysis,
        costs: config.costs,
      },
      fleet: config.bases,
      fleetCost: {
        currency: 'EUR',
        eurCzk: config.costs.eurCzk,
        note: 'Ceny strojů: „published“ = ceník prodejce, „user“ = zadáno uživatelem, „placeholder“ = plánovací hodnota, protože výrobce cenu nezveřejňuje.',
        ...cost,
        annualCzk: cost.annualEur * config.costs.eurCzk,
        purchaseCzk: cost.purchaseEur * config.costs.eurCzk,
      },
      emergencies: config.incidents,
      aircraftSpecifications: usedSpecs.map((id) => DRONE_BY_ID[id]),
      results: result
        ? result.outcomes.map((o) => ({
            emergency: o.incident,
            dispatched: o.best ? { ...o.best, outbound: strip(o.best.outbound), inbound: strip(o.best.inbound) } : null,
            alternatives: o.candidates.filter((m) => m !== o.best).map((m) => ({ baseId: m.baseId, specId: m.specId, feasible: m.feasible, atPatientS: m.atPatientS, reasons: m.reasonText })),
            conventional: o.comparators.map((r) => ({ ...r, route: undefined, routePoints: r.route.length })),
          }))
        : null,
      coverageStatistics: metrics,
      sources: SOURCES,
    },
    clean,
    2,
  )
}

const strip = <T extends { samples: unknown[] } | null>(p: T) => (p ? { ...p, samples: undefined, sampleCount: p.samples.length } : null)

export const fileBase = (config: ScenarioConfig) => `beskydy-aed-${slug(config.name)}`
