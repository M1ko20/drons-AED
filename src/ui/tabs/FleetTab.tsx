import { useState } from 'react'
import { uid } from '../../app/config'
import { czk, eur, num, plural } from '../../app/format'
import { scenarioCost } from '../../app/metrics'
import { useApp } from '../../app/store'
import { COST_INFO, DEFAULT_COSTS, DEFAULT_OPS, OPS_INFO } from '../../data/defaults'
import { AEDS, DRONE_BY_ID, droneName, DRONES, modelName } from '../../data/drones'
import type { CostSettings } from '../../sim/cost'
import { kitMassKg, rangeAtPayloadKm } from '../../sim/energy'
import { resolvePerf } from '../../sim/perf'
import type { DeliveryMode, OpsSettings } from '../../sim/types'
import { Check, Empty, EvidenceTag, Field, Info, Num, Section } from '../bits'

const MODE_LABEL: Record<DeliveryMode, string> = { winch: 'naviják', 'low-drop': 'spuštění na laně', parachute: 'padák', land: 'přistání' }
const RAIN_LABEL = { none: 'ne', light: 'jen slabý', heavy: 'i silný', unknown: 'neuvedeno' } as const
const BASIS_LABEL = { published: 'ceník prodejce', user: 'vaše cena', placeholder: 'plánovací odhad' } as const

function ModelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Typ stroje">
      {DRONES.map((d) => {
        const perf = resolvePerf(d)
        const flag = perf.missing.length ? ' – nelze simulovat' : perf.modes.length ? '' : ' – způsob doručení nedoložen'
        return (
          <option key={d.id} value={d.id}>
            {droneName(d)}
            {flag}
          </option>
        )
      })}
    </select>
  )
}

export function FleetTab() {
  const config = useApp((s) => s.config)
  const world = useApp((s) => s.world)!
  const mapMode = useApp((s) => s.mapMode)
  const update = useApp((s) => s.update)
  const set = useApp((s) => s.set)
  const [site, setSite] = useState('')

  const used = [...new Set(config.bases.flatMap((b) => b.drones.map((d) => d.specId)))]
  const payload = kitMassKg(config.kit)
  const sites = world.places.facilities.filter((f) => f.kind !== 'fire' && !config.bases.some((b) => b.id === 'base-' + f.id))
  const setOps = <K extends keyof OpsSettings>(k: K, v: OpsSettings[K]) => update((c) => void (c.ops[k] = v))
  const opsNum = (k: keyof OpsSettings, props: { unit: string; min: number; max: number; step?: number; scale?: number }) => (
    <Field label={OPS_INFO[k].label} info={OPS_INFO[k].basis}>
      <Num value={config.ops[k] as number} onChange={(v) => setOps(k, v as never)} {...props} />
    </Field>
  )
  const nDrones = config.bases.reduce((a, b) => a + b.drones.length, 0)

  return (
    <>
      <Section
        title={`Základny a drony (${plural(config.bases.length, 'základna', 'základny', 'základen')}, ${plural(nDrones, 'dron', 'drony', 'dronů')})`}
        aside={
          <button className="btn small ghost" onClick={() => set({ modal: 'drones' })}>
            Porovnat letouny
          </button>
        }
      >
        <p className="hint">
          Základny se umisťují na stávající stanoviště záchranných složek nebo kamkoli do mapy. Vhodnost místa (napájení, přístřešek, obsluha, vzdušný
          prostor) není ověřena. Základnu přemístíte přetažením její značky.
        </p>
        <div className="row">
          <select value={site} onChange={(e) => setSite(e.target.value)} aria-label="Stanoviště pro základnu">
            <option value="">Přidat základnu na stanoviště…</option>
            {(['ambulance', 'mountain-rescue', 'hospital'] as const).map((kind) => (
              <optgroup key={kind} label={{ ambulance: 'Výjezdové základny ZZS', 'mountain-rescue': 'Stanice Horské služby', hospital: 'Nemocnice' }[kind]}>
                {sites
                  .filter((f) => f.kind === kind)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <button
            className="btn"
            disabled={!site}
            onClick={() => {
              const f = world.places.facilities.find((x) => x.id === site)
              if (!f) return
              update((c) => {
                const spec = c.bases[0]?.drones[0]?.specId ?? 'wingcopter-198'
                c.bases.push({ id: 'base-' + f.id, name: f.name, position: [f.lon, f.lat], drones: [{ id: uid('drone'), specId: spec, status: 'ready' }] })
              })
              set({ flyTo: { center: [f.lon, f.lat], seq: Date.now() } })
              setSite('')
            }}
          >
            Přidat
          </button>
        </div>
        <button className={'btn' + (mapMode.kind === 'add-base' ? ' active' : '')} onClick={() => set({ mapMode: mapMode.kind === 'add-base' ? { kind: 'idle' } : { kind: 'add-base' } })}>
          {mapMode.kind === 'add-base' ? 'Kliknutím do mapy umístěte základnu…' : '+ Umístit základnu do mapy'}
        </button>

        {config.bases.length === 0 && <Empty title="Žádné základny dronů">Scénář modeluje jen stávající složky. Přidejte základnu výše nebo načtěte vzorový scénář.</Empty>}
        {config.bases.map((b) => (
          <div key={b.id} className="card">
            <div className="card-head">
              <button className="link-btn" title="Zobrazit na mapě" onClick={() => set({ flyTo: { center: b.position, seq: Date.now() } })}>
                <span className="pin base">{b.drones.filter((d) => d.status === 'ready').length}</span>
              </button>
              <input className="title-input" value={b.name} aria-label="Název základny" onChange={(e) => update((c) => void (c.bases.find((x) => x.id === b.id)!.name = e.target.value))} />
              <button className="icon-btn" aria-label={`Odebrat základnu ${b.name}`} onClick={() => update((c) => void (c.bases = c.bases.filter((x) => x.id !== b.id)))}>
                ✕
              </button>
            </div>
            {b.drones.map((d, i) => (
              <div key={d.id} className="drone-row">
                <span className="drone-n">{i + 1}</span>
                <ModelSelect value={d.specId} onChange={(v) => update((c) => void (c.bases.find((x) => x.id === b.id)!.drones.find((x) => x.id === d.id)!.specId = v))} />
                <select
                  value={d.status}
                  aria-label="Stav dronu"
                  onChange={(e) => update((c) => void (c.bases.find((x) => x.id === b.id)!.drones.find((x) => x.id === d.id)!.status = e.target.value as 'ready' | 'maintenance'))}
                >
                  <option value="ready">Připraven</option>
                  <option value="maintenance">Mimo provoz</option>
                </select>
                {config.bases.length > 1 && (
                  <select
                    value=""
                    aria-label="Přesunout dron na jinou základnu"
                    title="Přeřadit na jinou základnu"
                    onChange={(e) =>
                      update((c) => {
                        const from = c.bases.find((x) => x.id === b.id)!
                        const to = c.bases.find((x) => x.id === e.target.value)
                        if (!to) return
                        from.drones = from.drones.filter((x) => x.id !== d.id)
                        to.drones.push(d)
                      })
                    }
                  >
                    <option value="">Přesunout…</option>
                    {config.bases
                      .filter((x) => x.id !== b.id)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          → {x.name}
                        </option>
                      ))}
                  </select>
                )}
                <button
                  className="icon-btn drone-x"
                  aria-label="Odebrat dron"
                  onClick={() => update((c) => void (c.bases.find((x) => x.id === b.id)!.drones = c.bases.find((x) => x.id === b.id)!.drones.filter((x) => x.id !== d.id)))}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              className="btn small ghost"
              onClick={() => update((c) => void c.bases.find((x) => x.id === b.id)!.drones.push({ id: uid('drone'), specId: b.drones[0]?.specId ?? 'wingcopter-198', status: 'ready' }))}
            >
              + Přidat dron
            </button>
          </div>
        ))}
      </Section>

      <CostSection />

      {used.length > 0 && (
        <Section title="Výkony strojů použité v modelu" defaultOpen={false}>
          <p className="hint">
            Hodnoty pocházejí z dohledaných specifikací; chybějící nahrazují označené předpoklady. Cestovní rychlost lze měnit od poloviny zveřejněné
            cestovní rychlosti po zveřejněné maximum – rychlejší let stojí dolet (× (v<sub>cest</sub>/v)²).
          </p>
          {used.map((id) => {
            const spec = DRONE_BY_ID[id]
            if (!spec) return null
            const perf = resolvePerf(spec, { cruiseMs: config.cruiseOverride[id] })
            const base = resolvePerf(spec)
            return (
              <div key={id} className="card flat">
                <div className="card-head">
                  <strong>{droneName(spec)}</strong>
                  <button className="btn small ghost" onClick={() => set({ modal: 'drones' })}>
                    Celá specifikace
                  </button>
                </div>
                {perf.missing.length > 0 ? (
                  <p className="warn">✕ Nelze simulovat: výrobce neuvádí {perf.missing.join(', ')}.</p>
                ) : (
                  <>
                    <div className="grid2">
                      <Field label="Cestovní rychlost" info={spec.cruiseSpeedMs.note ?? 'Zveřejněná cestovní rychlost'}>
                        <span className="inline">
                          <Num
                            value={perf.cruiseMs}
                            min={Math.round(base.cruiseMs * 0.5 * 10) / 10}
                            max={spec.maxSpeedMs.value ?? base.cruiseMs}
                            step={0.5}
                            unit="m/s"
                            onChange={(v) =>
                              update((c) => {
                                if (Math.abs(v - base.cruiseMs) < 0.05) delete c.cruiseOverride[id]
                                else c.cruiseOverride[id] = v
                              })
                            }
                          />
                          <EvidenceTag evidence={perf.provenance.cruiseMs} sourceId={spec.cruiseSpeedMs.sourceId} note={spec.cruiseSpeedMs.note} />
                        </span>
                      </Field>
                      <div className="kv">
                        <span>Dolet při {num(payload, 1)} kg</span>
                        <b>
                          {num(rangeAtPayloadKm(perf.rangeTable, payload))} km <EvidenceTag evidence={perf.provenance.rangeTable} sourceId={spec.rangeTable.sourceId} note={spec.rangeTable.note} />
                        </b>
                      </div>
                    </div>
                    <div className="chips">
                      <span className="chip">Doručení: {perf.modes.length ? perf.modes.map((m) => MODE_LABEL[m]).join(', ') : 'nedoloženo'}</span>
                      <span className="chip">
                        Vítr ≤ {num(perf.maxWindMs, perf.maxWindMs % 1 ? 1 : 0)} m/s <EvidenceTag evidence={perf.provenance.maxWindMs} sourceId={spec.maxWindMs.sourceId} note={spec.maxWindMs.note} />
                      </span>
                      <span className="chip">
                        {perf.tempMinC}…{perf.tempMaxC} °C <EvidenceTag evidence={perf.provenance.tempMinC} sourceId={spec.tempMinC.sourceId} note={spec.tempMinC.note} />
                      </span>
                      <span className="chip">Déšť: {RAIN_LABEL[perf.rain]}</span>
                    </div>
                    {payload > perf.maxPayloadKg && (
                      <p className="warn">
                        ✕ Sada AED ({num(payload, 2)} kg) překračuje nosnost {num(perf.maxPayloadKg, 1)} kg.
                      </p>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </Section>
      )}

      <Section title={`Náklad – sada AED ${num(payload, 2)} kg`} defaultOpen={false}>
        <Field label="Defibrilátor" wide>
          <select
            value={config.kit.aedId}
            onChange={(e) => {
              const a = AEDS.find((x) => x.id === e.target.value)!
              update((c) => {
                c.kit.aedId = a.id
                c.kit.aedKg = a.massKg
              })
            }}
          >
            {AEDS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} – {num(a.massKg, 1)} kg
              </option>
            ))}
          </select>
        </Field>
        <p className="hint">
          {AEDS.find((a) => a.id === config.kit.aedId)?.note}{' '}
          <EvidenceTag evidence={AEDS.find((a) => a.id === config.kit.aedId)!.evidence} sourceId={AEDS.find((a) => a.id === config.kit.aedId)!.sourceId} />
        </p>
        <div className="grid2">
          <Field label="Ochranný obal" info="Předpoklad: polstrované pouzdro nebo koš kolem AED.">
            <Num value={config.kit.enclosureKg} min={0} max={5} step={0.1} unit="kg" onChange={(v) => update((c) => void (c.kit.enclosureKg = v))} />
          </Field>
          <Field label="Hák / uvolňovací mechanismus" info="Předpoklad: hmotnost háku, lana a uvolňovacího mechanismu, který letí se zásilkou.">
            <Num value={config.kit.mechanismKg} min={0} max={5} step={0.1} unit="kg" onChange={(v) => update((c) => void (c.kit.mechanismKg = v))} />
          </Field>
          <Field label="Další vybavení" info="Například sada pro zástavu krvácení nebo pulzní oxymetr.">
            <Num value={config.kit.extrasKg} min={0} max={10} step={0.1} unit="kg" onChange={(v) => update((c) => void (c.kit.extrasKg = v))} />
          </Field>
        </div>
      </Section>

      <Section
        title="Provozní předpoklady"
        defaultOpen={false}
        aside={
          <button className="btn small ghost" onClick={() => update((c) => void (c.ops = { ...DEFAULT_OPS }))}>
            Výchozí
          </button>
        }
      >
        <p className="hint">Všechny hodnoty zde jsou předpoklady; jejich podklad najdete pod značkou ⓘ.</p>
        <div className="grid2">
          {opsNum('callProcessingS', { unit: 's', min: 0, max: 900, step: 5 })}
          {opsNum('launchPrepS', { unit: 's', min: 0, max: 900, step: 5 })}
          {opsNum('minAglM', { unit: 'm', min: 30, max: 300, step: 10 })}
          {opsNum('transitionAglM', { unit: 'm', min: 10, max: 150, step: 5 })}
          {opsNum('approachAglM', { unit: 'm', min: 10, max: 120, step: 5 })}
          {opsNum('winchHoverAglM', { unit: 'm', min: 5, max: 100, step: 5 })}
          {opsNum('reserveFraction', { unit: '%', min: 0, max: 60, step: 5, scale: 100 })}
          {opsNum('coldDeratePerC', { unit: '%/°C', min: 0, max: 3, step: 0.1, scale: 100 })}
          {opsNum('turnaroundMin', { unit: 'min', min: 0, max: 240, step: 1 })}
          {opsNum('landUnloadS', { unit: 's', min: 0, max: 300, step: 5 })}
          {opsNum('releaseS', { unit: 's', min: 0, max: 120, step: 5 })}
          {opsNum('retrievalS', { unit: 's', min: 0, max: 600, step: 5 })}
        </div>
        <Field label={OPS_INFO.returnPolicy.label} info={OPS_INFO.returnPolicy.basis} wide>
          <select value={config.ops.returnPolicy} onChange={(e) => setOps('returnPolicy', e.target.value as 'return' | 'one-way')}>
            <option value="return">Návrat na základnu (dolet musí stačit tam i zpět)</option>
            <option value="one-way">Jen tam – dron zůstane na místě</option>
          </select>
        </Field>
        <Field label={OPS_INFO.modePreference.label} info={OPS_INFO.modePreference.basis} wide>
          <select
            value={config.ops.modePreference[0]}
            onChange={(e) => {
              const first = e.target.value as DeliveryMode
              setOps('modePreference', [first, ...DEFAULT_OPS.modePreference.filter((m) => m !== first)])
            }}
          >
            <option value="winch">Nejprve naviják / lano, přistání jako záloha</option>
            <option value="land">Nejprve přistání, je-li kde přistát</option>
          </select>
        </Field>
        <Check checked={config.ops.nightOps} onChange={(v) => setOps('nightOps', v)}>
          Noční provoz povolen
        </Check>
        <Check checked={config.ops.coldOps} onChange={(v) => setOps('coldOps', v)}>
          {OPS_INFO.coldOps.label} <Info text={OPS_INFO.coldOps.basis} />
        </Check>
        {config.ops.coldOps && <div className="grid2">{opsNum('coldMinC', { unit: '°C', min: -30, max: 0, step: 1 })}</div>}
      </Section>
    </>
  )
}

/** Purchase and yearly cost of the configured fleet, with every assumption editable. */
function CostSection() {
  const config = useApp((s) => s.config)
  const update = useApp((s) => s.update)
  const cost = scenarioCost(config)
  const c = config.costs
  const rate = c.eurCzk
  const setCost = <K extends keyof CostSettings>(k: K, v: CostSettings[K]) => update((cfg) => void (cfg.costs[k] = v))
  const field = (k: Exclude<keyof CostSettings, 'priceOverrideEur'>, props: { unit: string; min: number; max: number; step?: number; scale?: number }) => (
    <Field label={COST_INFO[k].label} info={COST_INFO[k].basis}>
      <Num value={c[k]} onChange={(v) => setCost(k, v)} {...props} />
    </Field>
  )
  const rows: { label: string; eur: number; hint?: string }[] = [
    { label: 'Odpisy strojů', eur: cost.annual.aircraftWriteOffEur, hint: `pořizovací ceny ÷ ${num(c.lifeYears)} let` },
    { label: 'Odpisy vybavení základen', eur: cost.annual.stationWriteOffEur },
    { label: 'Údržba a baterie', eur: cost.annual.maintenanceEur, hint: `${num(c.maintenanceShare * 100)} % ceny strojů` },
    { label: 'Provoz základen', eur: cost.annual.stationsEur },
    { label: 'Přístroje AED', eur: cost.annual.aedEur },
    { label: 'Personál (piloti / dohled)', eur: cost.annual.staffEur, hint: `${num(c.staffFte, 1)} úvazku` },
    { label: 'Ostatní', eur: cost.annual.otherEur },
  ]

  return (
    <Section title={cost.drones ? `Náklady flotily – ${czk(cost.annualEur, rate)} ročně` : 'Náklady flotily'}>
      {cost.drones === 0 ? (
        <Empty title="Žádné drony, žádné náklady">Po přidání dronů se zde zobrazí pořizovací cena a roční náklady flotily.</Empty>
      ) : (
        <>
          <p className="hint">
            Orientační odhad, <strong>nikoli rozpočet</strong>. Zveřejněnou cenu mají jen DJI Matrice 400 a FlyCart 30; u ostatních výrobci cenu
            nesdělují, proto se použije plánovací hodnota, dokud nezadáte vlastní cenu z nabídky.
          </p>
          <table className="table compact cost-table">
            <thead>
              <tr>
                <th>Stroj</th>
                <th className="num">Ks</th>
                <th>Cena za kus (€)</th>
                <th className="num">Ročně</th>
              </tr>
            </thead>
            <tbody>
              {cost.lines.map((l) => {
                const spec = DRONE_BY_ID[l.specId]
                return (
                  <tr key={l.specId}>
                    <td>
                      {modelName(l.specId)}
                      <span className={'block ' + (l.basis === 'placeholder' ? 'flag' : 'muted')} title={spec?.priceEur.note}>
                        {l.basis === 'placeholder' ? '⚠ ' : ''}
                        {BASIS_LABEL[l.basis]}{' '}
                        {l.basis === 'published' && spec && <EvidenceTag evidence={spec.priceEur.evidence} sourceId={spec.priceEur.sourceId} note={spec.priceEur.note} />}
                        {l.basis === 'placeholder' && <EvidenceTag evidence="assumption" sourceId="basu2026" note={COST_INFO.unknownPriceEur.basis} />}
                      </span>
                    </td>
                    <td className="num">{l.count}</td>
                    <td>
                      <span className="inline">
                        <Num
                          value={l.unitPriceEur}
                          min={0}
                          max={5_000_000}
                          step={1000}
                          onChange={(v) =>
                            update((cfg) => {
                              cfg.costs.priceOverrideEur[l.specId] = Math.round(v)
                            })
                          }
                        />
                        {l.basis === 'user' && (
                          <button
                            className="icon-btn"
                            title="Vrátit původní hodnotu"
                            aria-label={`Vrátit původní cenu stroje ${modelName(l.specId)}`}
                            onClick={() => update((cfg) => void delete cfg.costs.priceOverrideEur[l.specId])}
                          >
                            ↺
                          </button>
                        )}
                      </span>
                      <span className="muted block">≈ {czk(l.unitPriceEur, rate)}</span>
                    </td>
                    <td className="num">{czk(l.annualEur, rate)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="cost-summary">
            <div className="kv">
              <span>Jednorázové pořízení</span>
              <b>
                {czk(cost.purchaseEur, rate)} <span className="muted">({eur(cost.purchaseEur)})</span>
              </b>
            </div>
            <p className="hint">
              {plural(cost.drones, 'stroj', 'stroje', 'strojů')} {czk(cost.aircraftPurchaseEur, rate)} + vybavení {plural(cost.bases, 'základny', 'základen', 'základen')}{' '}
              {czk(cost.stationPurchaseEur, rate)}
            </p>
            <table className="table compact">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label}>
                    <td>
                      {r.label}
                      {r.hint && <span className="muted"> · {r.hint}</span>}
                    </td>
                    <td className="num">{czk(r.eur, rate)}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td>Roční náklady celkem</td>
                  <td className="num">{czk(cost.annualEur, rate)}</td>
                </tr>
              </tbody>
            </table>
            <p className="hint">
              Tj. {eur(cost.annualEur)} ročně; bez personálu {czk(cost.annualEquipmentEur, rate)} ({czk(cost.annualEquipmentEur / cost.drones, rate)} na dron). Pro
              srovnání: německá studie uvádí nejméně 1,45 mil. € ročně na síť 45 dronů, tedy asi 32 000 € na dron.{' '}
              <EvidenceTag evidence="peer-reviewed" sourceId="roper2023" note="Röper et al. 2023; čteno z abstraktu, přepočet na dron je náš" />
            </p>
          </div>
        </>
      )}

      <details className="cost-assumptions">
        <summary>Předpoklady výpočtu nákladů</summary>
        <div className="grid2">
          {field('lifeYears', { unit: 'let', min: 1, max: 15, step: 1 })}
          {field('maintenanceShare', { unit: '%', min: 0, max: 40, step: 1, scale: 100 })}
          {field('stationCapexEur', { unit: '€', min: 0, max: 500000, step: 1000 })}
          {field('stationAnnualEur', { unit: '€', min: 0, max: 100000, step: 100 })}
          {field('aedAnnualEur', { unit: '€', min: 0, max: 5000, step: 10 })}
          {field('staffFte', { unit: 'úv.', min: 0, max: 50, step: 0.5 })}
          {field('staffCostEur', { unit: '€', min: 0, max: 200000, step: 1000 })}
          {field('otherAnnualEur', { unit: '€', min: 0, max: 5000000, step: 1000 })}
          {field('unknownPriceEur', { unit: '€', min: 0, max: 2000000, step: 5000 })}
          {field('eurCzk', { unit: 'Kč/€', min: 15, max: 40, step: 0.1 })}
        </div>
        <button className="btn small ghost" onClick={() => update((cfg) => void (cfg.costs = structuredClone(DEFAULT_COSTS)))}>
          Vrátit výchozí předpoklady a ceny
        </button>
        <p className="hint">
          Nezahrnuto: pojištění, software a napojení na dispečink, datové spojení, výcvik, správní řízení a DPH – doplňte je do položky „Ostatní“.
          Personál se počítá pro celou flotilu bez ohledu na počet dronů.
        </p>
      </details>
    </Section>
  )
}
