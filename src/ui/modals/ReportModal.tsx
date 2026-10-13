import { CATEGORY_LABEL, STUDY_AREAS } from '../../app/config'
import { czk, eur, num, pct, plural } from '../../app/format'
import { fleetCounts, REASON_LABEL, scenarioCost } from '../../app/metrics'
import { useApp } from '../../app/store'
import { OPS_INFO } from '../../data/defaults'
import { DRONE_BY_ID, modelName } from '../../data/drones'
import { DISCLAIMER, LIMITATIONS } from '../../data/notes'
import { SOURCES, STUDY_TYPE_LABEL } from '../../data/sources'
import { kitMassKg } from '../../sim/energy'
import { formatDuration } from '../../sim/stats'
import type { OpsSettings } from '../../sim/types'
import { Modal } from '../bits'

const MODE_LABEL = { land: 'přistání', winch: 'naviják', 'low-drop': 'spuštění na laně', parachute: 'padák' } as const
const PRECIP = { none: 'žádné', 'light-rain': 'slabý déšť', 'heavy-rain': 'silný déšť', snow: 'sněžení' } as const
const BASIS = { published: 'ceník prodejce', user: 'zadáno uživatelem', placeholder: 'plánovací odhad – výrobce cenu nezveřejňuje' } as const

/** Printable summary. Print styles hide everything except this dialog's body. */
export function ReportModal({ onClose }: { onClose: () => void }) {
  const config = useApp((s) => s.config)
  const result = useApp((s) => s.result)
  const metrics = useApp((s) => s.metrics)
  const analysis = useApp((s) => s.analysis)
  const world = useApp((s) => s.world)!
  const fleet = fleetCounts(config)
  const cost = scenarioCost(config)
  const rate = config.costs.eurCzk
  const m = analysis.stale ? null : metrics
  const used = [...new Set(config.bases.flatMap((b) => b.drones.map((d) => d.specId)))]
  const usedSources = new Set<string>(['schierbeck2023', 'fischer2023', 'osm', 'terrain', 'ucl-faq', 'basu2026', 'bogle2019', 'roper2023'])
  for (const id of used) DRONE_BY_ID[id]?.sourceIds.forEach((s) => usedSources.add(s))
  const w = config.weather

  return (
    <Modal title="Souhrn k tisku" onClose={onClose} wide>
      <div className="row no-print">
        <button className="btn primary" onClick={() => window.print()}>
          Tisk / uložit jako PDF
        </button>
        <span className="hint">Vytiskne se jen souhrn níže.</span>
      </div>
      <article className="report">
        <h1>Pokrytí drony s AED – {config.name}</h1>
        <p className="muted">
          Simulátor Beskydy · vytvořeno {new Date().toLocaleString('cs-CZ')} · geografická data stažena {world.manifest.retrievedAt}
        </p>
        <p className="disclaimer">{DISCLAIMER}</p>

        <h2>Scénář (vstupy)</h2>
        <table className="table">
          <tbody>
            <tr>
              <th scope="row">Zájmové území</th>
              <td>{STUDY_AREAS.find((a) => a.id === config.studyArea)?.name}</td>
            </tr>
            <tr>
              <th scope="row">Flotila</th>
              <td>
                {plural(fleet.dronesReady, 'připravený dron', 'připravené drony', 'připravených dronů')} na {plural(fleet.basesOperational, 'základně', 'základnách', 'základnách')} (
                {fleet.models.join(', ') || 'žádné'})
                <ul className="plain">
                  {config.bases.map((b) => (
                    <li key={b.id}>
                      {b.name}: {b.drones.map((d) => `${modelName(d.specId)}${d.status === 'ready' ? '' : ' (mimo provoz)'}`).join(', ')}
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
            <tr>
              <th scope="row">Náklad</th>
              <td>
                Sada AED {num(kitMassKg(config.kit), 2)} kg (AED {num(config.kit.aedKg, 1)} kg + obal, uvolňovací mechanismus a další vybavení – předpoklady)
              </td>
            </tr>
            <tr>
              <th scope="row">Počasí (předpoklad)</th>
              <td>
                Vítr {w.windMs} m/s ze směru {w.windFromDeg}°, nárazy {w.gustMs} m/s, {w.tempC} °C, srážky: {PRECIP[w.precipitation]}
                {w.icing ? ', námraza' : ''}
                {w.night ? ', noc' : ''}; rychlost na silnicích × {num(w.roadSpeedFactor, 2)}
              </td>
            </tr>
            <tr>
              <th scope="row">Provozní předpoklady</th>
              <td>
                {(['callProcessingS', 'launchPrepS', 'minAglM', 'reserveFraction', 'turnaroundMin', 'retrievalS'] as (keyof OpsSettings)[])
                  .map((k) => `${OPS_INFO[k].label}: ${k === 'reserveFraction' ? Math.round(config.ops.reserveFraction * 100) + ' %' : config.ops[k]}`)
                  .join(' · ')}{' '}
                · {config.ops.returnPolicy === 'return' ? 'let tam a zpět' : 'let jen tam'}
              </td>
            </tr>
          </tbody>
        </table>

        <h2>Náklady flotily (odhad)</h2>
        {cost.drones === 0 ? (
          <p>Scénář nemá žádné drony.</p>
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Stroj</th>
                  <th className="num">Ks</th>
                  <th className="num">Cena za kus</th>
                  <th>Původ ceny</th>
                  <th className="num">Odpis a údržba ročně</th>
                </tr>
              </thead>
              <tbody>
                {cost.lines.map((l) => (
                  <tr key={l.specId}>
                    <td>{modelName(l.specId)}</td>
                    <td className="num">{l.count}</td>
                    <td className="num">
                      {eur(l.unitPriceEur)} ({czk(l.unitPriceEur, rate)})
                    </td>
                    <td>{BASIS[l.basis]}</td>
                    <td className="num">{czk(l.annualEur, rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="table">
              <tbody>
                <tr>
                  <th scope="row">Jednorázové pořízení</th>
                  <td>
                    {czk(cost.purchaseEur, rate)} ({eur(cost.purchaseEur)}) – stroje {czk(cost.aircraftPurchaseEur, rate)}, vybavení základen {czk(cost.stationPurchaseEur, rate)}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Roční náklady</th>
                  <td>
                    <strong>
                      {czk(cost.annualEur, rate)} ({eur(cost.annualEur)})
                    </strong>{' '}
                    – odpisy {czk(cost.annual.aircraftWriteOffEur + cost.annual.stationWriteOffEur, rate)}, údržba {czk(cost.annual.maintenanceEur, rate)}, provoz základen{' '}
                    {czk(cost.annual.stationsEur, rate)}, AED {czk(cost.annual.aedEur, rate)}, personál {czk(cost.annual.staffEur, rate)} ({num(config.costs.staffFte, 1)} úvazku), ostatní{' '}
                    {czk(cost.annual.otherEur, rate)}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Předpoklady</th>
                  <td>
                    Odpis {num(config.costs.lifeYears)} let, údržba {num(config.costs.maintenanceShare * 100)} % ceny ročně, kurz {num(rate, 1)} Kč/€. Nezahrnuje pojištění, software,
                    výcvik, správní řízení ani DPH.
                    {cost.hasPlaceholder ? ' ⚠ U části strojů výrobce cenu nezveřejňuje a je použit plánovací odhad – skutečná cena může být výrazně jiná.' : ''}
                  </td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        <h2>Události (simulace)</h2>
        {!result || result.outcomes.length === 0 ? (
          <p>Není umístěna žádná událost.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Událost</th>
                <th>Dron: AED u pacienta</th>
                {result.outcomes[0].comparators.map((c) => (
                  <th key={c.kind}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.outcomes.map((o) => (
                <tr key={o.incident.id}>
                  <td>
                    {o.incident.label}
                    <span className="muted block">
                      {num(o.incident.position[1], 4)}° s. š. {num(o.incident.position[0], 4)}° v. d. · {o.incident.site === 'open' ? 'volná plocha' : 'bez plochy k přistání'}
                    </span>
                  </td>
                  <td>
                    {o.best ? (
                      <>
                        {formatDuration(o.best.atPatientS)}
                        <span className="muted block">
                          {modelName(o.best.specId)}, základna {config.bases.find((b) => b.id === o.best!.baseId)?.name}, {o.best.mode && MODE_LABEL[o.best.mode]}
                        </span>
                      </>
                    ) : (
                      <>
                        Neproveditelné
                        <span className="muted block">{o.candidates[0]?.reasonText.join('; ') ?? 'žádné drony'}</span>
                      </>
                    )}
                  </td>
                  {o.comparators.map((c) => (
                    <td key={c.kind}>
                      {c.available ? formatDuration(c.totalS) : 'Nedostupné'}
                      <span className="muted block">{c.available ? c.fromName : c.unavailableReason}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2>Statistiky pokrytí (simulace, cílový čas {config.analysis.targetMin} min)</h2>
        {!m ? (
          <p>Výpočet pokrytí ještě běží – otevřete souhrn znovu, až se statistiky dole na obrazovce aktualizují.</p>
        ) : (
          <table className="table">
            <tbody>
              <tr>
                <th scope="row">Sledovaná místa v cílovém čase</th>
                <td>
                  {num(m.locationsWithin)} z {num(m.locations)} ({pct(m.locationsWithin, m.locations)}) – {m.byCategory.map((c) => `${CATEGORY_LABEL[c.category]} ${c.within}/${c.total}`).join('; ')}
                </td>
              </tr>
              <tr>
                <th scope="row">Obyvatelé v cílovém čase</th>
                <td>
                  {num(m.populationWithin)} z {num(m.populationTagged)} ({pct(m.populationWithin, m.populationTagged)}) – značky počtu obyvatel v OSM u {num(m.settlementsWithPopulation)} sídel
                </td>
              </tr>
              <tr>
                <th scope="row">Plocha v cílovém čase</th>
                <td>
                  {num(m.areaWithin * m.cellKm2)} z {num(m.areaCells * m.cellKm2)} km² ({pct(m.areaWithin, m.areaCells)})
                </td>
              </tr>
              <tr>
                <th scope="row">Čas doručení dronem</th>
                <td>
                  medián {formatDuration(m.medianS)}, 90. percentil {formatDuration(m.p90S)} přes {num(m.locationsServable)} obsloužitelných míst
                </td>
              </tr>
              <tr>
                <th scope="row">Dron dříve než posádka ZZS</th>
                <td>
                  {num(m.droneFaster)} z {num(m.comparedWithGround)} míst; průměrně o {formatDuration(Math.abs(m.meanGainS))} {m.meanGainS >= 0 ? 'dříve' : 'později'} (obojí simulováno)
                </td>
              </tr>
              <tr>
                <th scope="row">Nelze obsloužit</th>
                <td>
                  {num(m.locationsUnserved)} míst{m.unservedReasons.length ? ` – ${m.unservedReasons.map((r) => `${REASON_LABEL[r.reason]} ${r.count}`).join(', ')}` : ''}
                </td>
              </tr>
              {cost.drones > 0 && m.populationWithin > 0 && (
                <tr>
                  <th scope="row">Roční náklady na obyvatele v cílovém čase</th>
                  <td>{num((cost.annualEur * rate) / m.populationWithin)} Kč (roční náklady flotily ÷ obyvatelé pokrytí v cílovém čase; orientační poměr, ne ukazatel přínosu)</td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        <h2>Hlavní omezení</h2>
        <ul className="plain">
          {LIMITATIONS.map((l) => (
            <li key={l.topic}>
              <strong>{l.topic}.</strong> {l.text}
            </li>
          ))}
        </ul>

        <h2>Zdroje k tomuto scénáři</h2>
        <ul className="plain">
          {SOURCES.filter((s) => usedSources.has(s.id)).map((s) => (
            <li key={s.id}>
              {s.organisation}. {s.title}. {s.url} ({STUDY_TYPE_LABEL[s.studyType]}; staženo {s.retrieved})
            </li>
          ))}
        </ul>
      </article>
    </Modal>
  )
}
