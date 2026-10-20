import { useState } from 'react'
import { CATEGORY_LABEL, STUDY_AREAS, uid, type StudyAreaId } from '../../app/config'
import type { OptimizeRequest } from '../../app/engine'
import { num, pct } from '../../app/format'
import { useApp } from '../../app/store'
import { DRONE_BY_ID, droneName, DRONES, modelName } from '../../data/drones'
import type { Facility } from '../../data/world'
import type { DemandCategory } from '../../sim/coverage'
import type { Objective } from '../../sim/optimize'
import { resolvePerf } from '../../sim/perf'
import { formatDuration } from '../../sim/stats'
import type { LngLat } from '../../sim/types'
import { Check, Field, Num, Progress, Section } from '../bits'
import { COVERAGE_BANDS } from '../mapLayers'

const KIND_LABEL: Record<Facility['kind'], string> = {
  ambulance: 'Výjezdové základny ZZS',
  'mountain-rescue': 'Stanice Horské služby',
  hospital: 'Nemocnice',
  fire: 'Hasičské stanice (mnoho; výpočet trvá déle)',
}

export function CoverageTab() {
  const config = useApp((s) => s.config)
  const world = useApp((s) => s.world)!
  const analysis = useApp((s) => s.analysis)
  const metrics = useApp((s) => s.metrics)
  const optimize = useApp((s) => s.optimize)
  const custom = useApp((s) => s.customCandidates)
  const mapMode = useApp((s) => s.mapMode)
  const update = useApp((s) => s.update)
  const set = useApp((s) => s.set)
  const requestOptimize = useApp((s) => s.requestOptimize)
  const notify = useApp((s) => s.notify)

  const [kinds, setKinds] = useState<Record<Facility['kind'], boolean>>({ ambulance: true, 'mountain-rescue': true, hospital: true, fire: false })
  const [p, setP] = useState(4)
  const [specId, setSpecId] = useState(config.bases[0]?.drones[0]?.specId ?? 'wingcopter-198')
  const [objective, setObjective] = useState<Objective>('coverage')
  const [weighting, setWeighting] = useState<'locations' | 'population'>('locations')
  const [keep, setKeep] = useState(false)

  const T = config.analysis.targetMin
  const area = STUDY_AREAS.find((a) => a.id === config.studyArea)!
  const candidates: OptimizeRequest['candidates'] = [
    ...world.places.facilities.filter((f) => kinds[f.kind]).map((f) => ({ id: f.id, name: f.name, position: [f.lon, f.lat] as LngLat })),
    ...custom,
  ]
  const siteById = new Map(candidates.map((c) => [c.id, c]))
  for (const f of world.places.facilities) if (!siteById.has(f.id)) siteById.set(f.id, { id: f.id, name: f.name, position: [f.lon, f.lat] })
  const opt = optimize.result
  const perfOk = !resolvePerf(DRONE_BY_ID[specId]).missing.length

  const apply = () => {
    if (!opt) return
    update((c) => {
      if (!keep) c.bases = []
      for (const id of opt.chosen) {
        const s = siteById.get(id)
        if (!s || c.bases.some((b) => b.id === 'base-' + id)) continue
        c.bases.push({ id: 'base-' + id, name: s.name, position: s.position, drones: [{ id: uid('drone'), specId: opt.specId, status: 'ready' }] })
      }
      c.name = `Optimalizováno – ${c.bases.length} základen`
    })
    notify('Navržené základny byly použity jako flotila')
  }

  return (
    <>
      <Section title="Zájmové území a cíl">
        <Field label="Zájmové území" wide info="Statistiky i optimalizace pracují jen s místy uvnitř tohoto území na české straně hranice.">
          <select value={config.studyArea} onChange={(e) => update((c) => void (c.studyArea = e.target.value as StudyAreaId))}>
            {STUDY_AREAS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <p className="hint">{area.description}</p>
        <div className="grid2">
          <Field label="Cílový čas" info="Od volání po AED u pacienta. Řídí barevné pásy pokrytí, statistiky i optimalizaci.">
            <Num value={T} min={3} max={45} step={1} unit="min" onChange={(v) => update((c) => void (c.analysis.targetMin = v))} />
          </Field>
          <div className="quick">
            {[5, 10, 15].map((v) => (
              <button key={v} className={'btn small' + (T === v ? ' active' : '')} onClick={() => update((c) => void (c.analysis.targetMin = v))}>
                {v} min
              </button>
            ))}
          </div>
        </div>
        <Field label="Mapa pokrytí předpokládá" wide info="Rastr potřebuje jeden předpoklad pro všechny buňky. Statistiky sledovaných míst používají typ každého místa (sídla, chaty a lyžařské areály: přistání možné; vrcholy, vyhlídky a body na trasách: bez plochy k přistání).">
          <select value={config.analysis.fieldSite} onChange={(e) => update((c) => void (c.analysis.fieldSite = e.target.value as 'open' | 'no-landing'))}>
            <option value="no-landing">Bez plochy k přistání (nutný naviják nebo shoz)</option>
            <option value="open">Všude volná plocha k přistání</option>
          </select>
        </Field>
        <CoverageLegend />
        {analysis.status === 'running' && <Progress value={analysis.progress} label="Průběh výpočtu pokrytí" />}
        {analysis.status === 'error' && <p className="warn">✕ Výpočet pokrytí selhal: {analysis.error}</p>}
      </Section>

      <Section title="Sledovaná místa">
        <p className="hint">Které druhy míst vstupují do statistik a do optimalizace. Každý druh je samostatná metrika.</p>
        {(Object.keys(CATEGORY_LABEL) as DemandCategory[]).map((cat) => {
          const st = metrics?.byCategory.find((x) => x.category === cat)
          return (
            <div key={cat} className="cat-row">
              <Check checked={config.analysis.categories[cat]} onChange={(v) => update((c) => void (c.analysis.categories[cat] = v))}>
                {CATEGORY_LABEL[cat]}
              </Check>
              <span className="cat-stat">{st ? `${st.within}/${st.total} do ${T} min` : config.analysis.categories[cat] ? '…' : 'vyřazeno'}</span>
            </div>
          )
        })}
      </Section>

      <Section title="Kam umístit základny?">
        <p className="hint">
          Vybírá místa základen z kandidátů níže pomocí úplného modelu letu (terén, vítr, dolet, způsob doručení). Metoda: postupné přidávání a poté
          záměna stanovišť – heuristika, <strong>nikoli prokázané optimum</strong>.
        </p>
        <Field label="Kandidátní místa" wide info="Stávající stanoviště záchranných složek z dat; jejich vhodnost jako základen dronů není ověřena.">
          <div className="stack">
            {(Object.keys(KIND_LABEL) as Facility['kind'][]).map((k) => (
              <Check key={k} checked={kinds[k]} onChange={(v) => setKinds({ ...kinds, [k]: v })}>
                {KIND_LABEL[k]} ({world.places.facilities.filter((f) => f.kind === k).length})
              </Check>
            ))}
          </div>
        </Field>
        <div className="row">
          <button className={'btn small' + (mapMode.kind === 'add-candidate' ? ' active' : '')} onClick={() => set({ mapMode: mapMode.kind === 'add-candidate' ? { kind: 'idle' } : { kind: 'add-candidate' } })}>
            {mapMode.kind === 'add-candidate' ? 'Klikněte do mapy…' : `+ Vlastní kandidátní místo (${custom.length})`}
          </button>
          {custom.length > 0 && (
            <button className="btn small ghost" onClick={() => set({ customCandidates: [] })}>
              Smazat vlastní
            </button>
          )}
        </div>
        <div className="grid2">
          <Field label="Stroj">
            <select value={specId} onChange={(e) => setSpecId(e.target.value)}>
              {DRONES.filter((d) => !resolvePerf(d).missing.length).map((d) => (
                <option key={d.id} value={d.id}>
                  {droneName(d)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Počet základen" info="Počet nových základen, každá s jedním dronem zvoleného typu.">
            <Num value={p} min={1} max={12} step={1} onChange={(v) => setP(Math.round(v))} />
          </Field>
          <Field label="Cíl optimalizace">
            <select value={objective} onChange={(e) => setObjective(e.target.value as Objective)}>
              <option value="coverage">Co nejvíce míst v cílovém čase</option>
              <option value="mean-time">Co nejkratší průměrný čas</option>
            </select>
          </Field>
          <Field label="Váha" info="Varianta podle obyvatel používá jen sídla se značkou počtu obyvatel v OpenStreetMap; návštěvníci na trasách se pak nepočítají.">
            <select value={weighting} onChange={(e) => setWeighting(e.target.value as 'locations' | 'population')}>
              <option value="locations">Každé sledované místo = 1</option>
              <option value="population">Počet obyvatel</option>
            </select>
          </Field>
        </div>
        <Check checked={keep} onChange={setKeep} disabled={!config.bases.length}>
          Ponechat stávající základny ({config.bases.length}) a přidat k nim
        </Check>
        <button
          className="btn primary"
          disabled={optimize.status === 'running' || candidates.length === 0 || !perfOk}
          onClick={() => requestOptimize({ candidates, specId, p, objective, weighting, keepExisting: keep && config.bases.length > 0 })}
        >
          {optimize.status === 'running' ? 'Hledám…' : `Najít ${p} ${p === 1 ? 'základnu' : p < 5 ? 'základny' : 'základen'} mezi ${candidates.length} kandidáty`}
        </button>
        {optimize.status === 'running' && <Progress value={optimize.progress} label="Průběh optimalizace" />}
        {optimize.status === 'error' && <p className="warn">✕ Optimalizace selhala: {optimize.error}</p>}

        {opt && optimize.status !== 'running' && (
          <div className="card flat">
            {optimize.stale && <p className="warn">⚠ Scénář se po výpočtu tohoto výsledku změnil. Spusťte hledání znovu.</p>}
            <div className="kv">
              <span>
                {opt.weighting === 'population' ? 'Obyvatelé' : 'Sledovaná místa'} do {opt.targetMin} min
              </span>
              <b>
                {num(opt.coveredWeight)} / {num(opt.totalWeight)} ({pct(opt.coveredWeight, opt.totalWeight)})
              </b>
            </div>
            <CoverageCurve steps={opt.steps} total={opt.totalWeight} start={opt.existingCovered} names={(id) => siteById.get(id)?.name ?? id} />
            <ol className="picks">
              {opt.chosen.map((id) => {
                const s = siteById.get(id)
                return (
                  <li key={id}>
                    <button className="link-btn text" onClick={() => s && set({ flyTo: { center: s.position, seq: Date.now() } })}>
                      {s?.name ?? id}
                    </button>
                  </li>
                )
              })}
            </ol>
            <p className="hint">
              {opt.method}. {opt.swaps > 0 ? `Záměna zlepšila výsledek postupného přidávání (počet záměn: ${opt.swaps}); graf ukazuje pořadí postupného přidávání. ` : ''}
              {modelName(opt.specId)}, {opt.nCandidates} kandidátů × {opt.nDemand} míst, {num(opt.elapsedMs / 1000, 1)} s. Průměrný čas doručení, počítají-li se
              neobsloužená místa jako 60 min: {formatDuration(opt.meanTimeS)}.
            </p>
            <button className="btn primary" disabled={optimize.stale} onClick={apply}>
              Použít jako flotilu
            </button>
          </div>
        )}
      </Section>
    </>
  )
}

/** Colour bands of the coverage raster, scaled to the target time. */
export function CoverageLegend({ vertical }: { vertical?: boolean }) {
  const T = useApp((s) => s.config.analysis.targetMin)
  return (
    <div className={'legend' + (vertical ? ' vertical' : '')} aria-label="Legenda pokrytí">
      {COVERAGE_BANDS.map((b, i) => (
        <span key={i}>
          <i style={{ background: b.color }} />
          {i === 0 ? `≤ ${formatDuration(T * 30)}` : i === 1 ? `≤ ${T}:00` : i === 2 ? `≤ ${formatDuration(T * 90)}` : i === 3 ? `≤ ${formatDuration(T * 120)}` : 'pomaleji'}
        </span>
      ))}
      <span>
        <i className="hatch" />
        nelze obsloužit
      </span>
    </div>
  )
}

/** Marginal gain of each added base: bars share one axis (share of the weighted total). */
function CoverageCurve({ steps, total, start, names }: { steps: { id: string; coveredWeight: number; gainWeight: number }[]; total: number; start: number; names: (id: string) => string }) {
  if (!steps.length || total <= 0) return null
  const rows = [...(start > 0 ? [{ label: 'Stávající flotila', covered: start, gain: start }] : []), ...steps.map((s, i) => ({ label: `+${i + 1} ${names(s.id)}`, covered: s.coveredWeight, gain: s.gainWeight }))]
  return (
    <div className="curve" role="img" aria-label="Pokrytí po přidání každé základny">
      {rows.map((r, i) => (
        <div key={i} className="curve-row" title={`${r.label}: pokryto ${num((100 * r.covered) / total, 1)} % (+${num((100 * r.gain) / total, 1)} p. b.)`}>
          <span className="curve-label">{r.label}</span>
          <span className="curve-track">
            <span className="curve-prev" style={{ width: `${(100 * (r.covered - r.gain)) / total}%` }} />
            <span className="curve-gain" style={{ width: `${(100 * r.gain) / total}%` }} />
          </span>
          <span className="curve-val">{num((100 * r.covered) / total)} %</span>
        </div>
      ))}
    </div>
  )
}
