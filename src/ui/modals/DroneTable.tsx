import { useMemo, useState } from 'react'
import { missionContext } from '../../app/engine'
import { czk, eur, num } from '../../app/format'
import { REASON_LABEL } from '../../app/metrics'
import { useApp } from '../../app/store'
import { droneName, DRONES } from '../../data/drones'
import { SOURCE_BY_ID } from '../../data/sources'
import { unitPrice } from '../../sim/cost'
import { kitMassKg, rangeAtPayloadKm } from '../../sim/energy'
import { evaluateMission } from '../../sim/mission'
import { resolvePerf } from '../../sim/perf'
import { formatDuration } from '../../sim/stats'
import type { DeliveryMode, DroneMission, DroneSpec, Sourced } from '../../sim/types'
import { EvidenceTag, Modal } from '../bits'

const CONFIG_LABEL = { multirotor: 'Multikoptéra', 'vtol-fixed-wing': 'VTOL s pevným křídlem', 'fixed-wing': 'Pevné křídlo' }
const MODE: Record<DeliveryMode, string> = { land: 'Přistání', winch: 'Naviják / lano', 'low-drop': 'Spuštění na laně', parachute: 'Padák' }
const RATING = { good: '● Vhodný', conditional: '◐ Podmíněně', poor: '○ Nevhodný', 'insufficient-data': '? Nedostatek údajů' }
const RAIN: Record<string, string> = { none: 'Bez deště', light: 'Jen slabý déšť', heavy: 'I silný déšť' }

function V<T>({ s, fmt }: { s: Sourced<T>; fmt?: (v: T) => string }) {
  if (s.value === null || s.value === undefined)
    return (
      <span className="unknown" title={s.note}>
        nezveřejněno
      </span>
    )
  return (
    <span className="val" title={s.note}>
      {fmt ? fmt(s.value) : String(s.value)} <EvidenceTag evidence={s.evidence} sourceId={s.sourceId} note={s.note} />
    </span>
  )
}

export function DroneTable({ onClose }: { onClose: () => void }) {
  const config = useApp((s) => s.config)
  const world = useApp((s) => s.world)!
  const result = useApp((s) => s.result)
  const selected = useApp((s) => s.selectedIncident)
  const update = useApp((s) => s.update)
  const notify = useApp((s) => s.notify)
  const [picked, setPicked] = useState<Set<string>>(new Set(['wingcopter-198', 'rigitech-eiger', 'dji-m400', 'everdrone-e2']))
  const payload = kitMassKg(config.kit)
  const incident = config.incidents.find((i) => i.id === selected) ?? config.incidents[0]
  const outcome = result?.outcomes.find((o) => o.incident.id === incident?.id)
  const origin = config.bases.find((b) => b.id === outcome?.best?.baseId) ?? config.bases[0]
  const rate = config.costs.eurCzk

  // every picked model flown from the same base to the same emergency under the same assumptions
  const trials = useMemo(() => {
    const out = new Map<string, DroneMission>()
    if (!incident || !origin) return out
    const ctx = missionContext(world, config, false)
    const zoneSource = ctx.zones.from(origin.position)
    for (const d of DRONES) {
      if (!picked.has(d.id)) continue
      out.set(d.id, evaluateMission(ctx, resolvePerf(d, { cruiseMs: config.cruiseOverride[d.id] }), { baseId: origin.id, droneId: 'trial', position: origin.position, zoneSource }, incident.position, incident.site))
    }
    return out
  }, [picked, incident, origin, world, config])

  const toggle = (id: string) => {
    const n = new Set(picked)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    setPicked(n)
  }
  const speed = (v: number) => `${num(v, v % 1 ? 1 : 0)} m/s (${num(v * 3.6)} km/h)`

  return (
    <Modal title="Porovnání letounů" onClose={onClose} wide>
      <p className="lead">
        Dohledané specifikace. U každé hodnoty je vidět její původ: <EvidenceTag evidence="manufacturer" /> údaj výrobce, <EvidenceTag evidence="peer-reviewed" />{' '}
        studie, <EvidenceTag evidence="third-party" /> druhotný zdroj, <EvidenceTag evidence="derived" /> vypočteno zde. „Nezveřejněno“ znamená, že hodnotu
        se nepodařilo ověřit – nic není doplněno odhadem. Zveřejněné dolety byly měřeny za různých, často neuvedených podmínek a{' '}
        <strong>nejsou přímo srovnatelné</strong>; ze zveřejněných údajů nevyplývá povolení k letům mimo dohled v České republice.
      </p>
      <div className="trial-head">
        <strong>Zkouška ve stejném scénáři:</strong>{' '}
        {incident && origin ? (
          <>
            zaškrtnuté typy letí ze základny <em>{origin.name}</em> k události <em>{incident.label}</em> při současném počasí, se sadou {num(payload, 1)} kg a
            současnými provozními předpoklady.
          </>
        ) : (
          'umístěte událost a alespoň jednu základnu, aby šlo typy porovnat ve stejném scénáři.'
        )}
      </div>
      <div className="table-scroll">
        <table className="table drones">
          <thead>
            <tr>
              <th>Porovnat</th>
              <th>Letoun</th>
              <th>Výsledek v tomto scénáři</th>
              <th>Pořizovací cena</th>
              <th>Cestovní rychlost</th>
              <th>Max. rychlost</th>
              <th>Dolet při {num(payload, 1)} kg</th>
              <th>Nosnost</th>
              <th>Výdrž</th>
              <th>Doručení</th>
              <th>Vítr (průměr / nárazy)</th>
              <th>Teplota</th>
              <th>Déšť / krytí</th>
              <th>Dostup</th>
              <th>Certifikace a stav</th>
              <th>Hodnocení pro doručení AED v Beskydech</th>
              <th>Zdroje</th>
            </tr>
          </thead>
          <tbody>
            {DRONES.map((d: DroneSpec) => {
              const perf = resolvePerf(d)
              const t = trials.get(d.id)
              const table = d.rangeTable.value
              const price = unitPrice(d.id, d.priceEur.value, config.costs)
              return (
                <tr key={d.id}>
                  <td>
                    <input type="checkbox" checked={picked.has(d.id)} onChange={() => toggle(d.id)} aria-label={`Porovnat ${d.model}`} />
                  </td>
                  <td className="sticky">
                    <strong>{droneName(d)}</strong>
                    <span className="muted block">
                      {CONFIG_LABEL[d.config]} · {d.role}
                    </span>
                    {origin && !perf.missing.length && (
                      <button
                        className="btn small ghost"
                        onClick={() => {
                          update((c) => void c.bases.find((b) => b.id === origin.id)!.drones.forEach((x) => (x.specId = d.id)))
                          notify(`Základna ${origin.name} nyní používá ${droneName(d)}`)
                        }}
                      >
                        Použít: {origin.name.replace(/^ZZS (MSK|ZK) /, '')}
                      </button>
                    )}
                  </td>
                  <td>
                    {!picked.has(d.id) ? (
                      <span className="muted">nezaškrtnuto</span>
                    ) : !t ? (
                      <span className="muted">—</span>
                    ) : t.feasible ? (
                      <span className="status ok">
                        ✓ {formatDuration(t.atPatientS)}
                        <span className="muted block">
                          {t.mode && MODE[t.mode]} · rezerva doletu {num(t.energy!.marginKm)} km
                        </span>
                      </span>
                    ) : (
                      <span className="status bad">
                        ✕ {t.reasons.map((r) => REASON_LABEL[r]).join(', ')}
                        <span className="reason-detail">{t.reasonText[0]}</span>
                      </span>
                    )}
                  </td>
                  <td className="price-cell">
                    {d.priceEur.value !== null ? (
                      <span className="val" title={d.priceEur.note}>
                        {eur(d.priceEur.value)} <EvidenceTag evidence={d.priceEur.evidence} sourceId={d.priceEur.sourceId} note={d.priceEur.note} />
                        <span className="muted block">≈ {czk(d.priceEur.value, rate)}</span>
                        <span className="muted block">{d.priceEur.note}</span>
                      </span>
                    ) : (
                      <span className="unknown" title={d.priceEur.note}>
                        nezveřejněno
                        <span className="muted block">{d.priceEur.note}</span>
                      </span>
                    )}
                    {price.basis === 'user' && <span className="block">Vaše cena: {eur(price.priceEur)}</span>}
                    {price.basis === 'placeholder' && <span className="muted block">V nákladech se počítá s plánovací hodnotou {eur(price.priceEur)}</span>}
                  </td>
                  <td>
                    <V s={d.cruiseSpeedMs} fmt={speed} />
                  </td>
                  <td>
                    <V s={d.maxSpeedMs} fmt={speed} />
                  </td>
                  <td>
                    {table && table.length ? (
                      <span className="val" title={d.rangeTable.note}>
                        {num(rangeAtPayloadKm(table, payload))} km jedním směrem <EvidenceTag evidence={d.rangeTable.evidence} sourceId={d.rangeTable.sourceId} note={d.rangeTable.note} />
                      </span>
                    ) : perf.rangeTable.length ? (
                      <span className="val" title="Horní mez: zveřejněná výdrž × cestovní rychlost">
                        ≤ {num(perf.rangeTable[0].oneWayKm)} km <EvidenceTag evidence="derived" note="Výdrž × cestovní rychlost – horní mez, nikoli zveřejněný dolet" />
                      </span>
                    ) : (
                      <span className="unknown">nezveřejněno</span>
                    )}
                    <span className="muted block">{d.rangeConditions}</span>
                  </td>
                  <td>
                    <V s={d.maxPayloadKg} fmt={(v) => `${num(v, v % 1 ? 1 : 0)} kg`} />
                    {d.maxPayloadKg.value !== null && d.maxPayloadKg.value < payload && <span className="status bad block">✕ méně než sada {num(payload, 1)} kg</span>}
                  </td>
                  <td>
                    <V s={d.enduranceMin} fmt={(v) => `${v} min`} />
                  </td>
                  <td>
                    {(Object.keys(d.delivery) as DeliveryMode[])
                      .filter((m) => d.delivery[m].value !== false)
                      .map((m) => (
                        <span key={m} className="block" title={d.delivery[m].note}>
                          {d.delivery[m].value === true ? '✓' : '?'} {MODE[m]}{' '}
                          {d.delivery[m].value === true ? <EvidenceTag evidence={d.delivery[m].evidence} sourceId={d.delivery[m].sourceId} note={d.delivery[m].note} /> : <span className="unknown">neověřeno</span>}
                        </span>
                      ))}
                    {d.winchMinPayloadKg?.value ? <span className="status bad block">naviják vyžaduje ≥ {d.winchMinPayloadKg.value} kg</span> : null}
                    {!Object.values(d.delivery).some((x) => x.value === true) && <span className="status bad block">✕ nedoloženo</span>}
                  </td>
                  <td>
                    <V s={d.maxWindMs} fmt={(v) => `${num(v, v % 1 ? 1 : 0)} m/s`} /> / <V s={d.maxGustMs} fmt={(v) => `${v} m/s`} />
                  </td>
                  <td>
                    {d.tempMinC.value !== null && d.tempMaxC.value !== null ? (
                      <span className="val" title={d.tempMinC.note}>
                        {d.tempMinC.value}…{d.tempMaxC.value} °C <EvidenceTag evidence={d.tempMinC.evidence} sourceId={d.tempMinC.sourceId} />
                      </span>
                    ) : (
                      <span className="unknown">nezveřejněno</span>
                    )}
                  </td>
                  <td>
                    <V s={d.rain} fmt={(v) => RAIN[v as string] ?? ''} />
                    <span className="block">
                      <V s={d.ipRating} />
                    </span>
                  </td>
                  <td>
                    <V s={d.ceilingAmslM} fmt={(v) => `${num(v)} m n. m.`} />
                  </td>
                  <td className="wide-cell">
                    {d.certification}
                    <span className="muted block">{d.availability.value}</span>
                  </td>
                  <td className="wide-cell">
                    <strong>{RATING[d.suitability.rating]}</strong>
                    <span className="block">{d.suitability.text}</span>
                    {d.caveats.map((c, i) => (
                      <span key={i} className="muted block">
                        – {c}
                      </span>
                    ))}
                  </td>
                  <td>
                    {d.sourceIds.map((id) => (
                      <a key={id} className="block" href={SOURCE_BY_ID[id]?.url} target="_blank" rel="noreferrer">
                        {SOURCE_BY_ID[id]?.organisation.split('—')[0].split('(')[0].trim()} ↗
                      </a>
                    ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Sloupec s hodnocením je názor tohoto projektu, sepsaný podle zveřejněných údajů výše; není to tvrzení výrobce ani výsledek zkoušky. Kde hodnota
        chybí, použije model opatrné náhradní hodnoty uvedené v záložce Flotila, nebo stroj odmítne simulovat. Ceny jsou bez záruky – jde o ceníky
        prodejců k datu vyhledání; vlastní cenu z nabídky lze zadat v záložce Flotila.
      </p>
    </Modal>
  )
}
