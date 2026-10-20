import { useEffect, useRef, useState } from 'react'
import { PRESETS } from '../../app/config'
import { num, plural } from '../../app/format'
import { fleetCounts } from '../../app/metrics'
import { useApp } from '../../app/store'
import { CASES, SKIPPED_CASES, type RealCase } from '../../data/cases'
import { modelName } from '../../data/drones'
import { formatDuration } from '../../sim/stats'
import { EvidenceTag, Section } from '../bits'
import { PlaybackControls } from './ScenarioTab'

const PRECIP: Record<string, string> = { none: 'beze srážek', 'light-rain': 'slabý déšť', 'heavy-rain': 'silný déšť', snow: 'sněžení' }

export function CasesTab() {
  const active = useApp((s) => s.activeCase)
  return (
    <>
      <Section title="Skutečné případy z Beskyd">
        <p className="hint">
          Úmrtí na zástavu oběhu podle zpráv Horské služby a médií. Případ se přehraje s <strong>vaší současnou flotilou a nastavením</strong>; změní se
          jen místo podle zprávy a počasí toho dne. Let v mrazu se povolí, aby o výsledku nerozhodl sám limit výrobce, a nelétal-li ten den vrtulník,
          vypne se. Tlačítkem Ukončit případ se vrátí vaše události a počasí.
        </p>
        <p className="hint">Vybrány jsou případy, kdy by mohla vzlétnout malá flotila ze vzorového scénáře (tři drony Wingcopter 198).</p>
        <p className="hint">
          Modelové situace jsou skutečné události z polských Beskyd přenesené na podobné místo v Česku. Polské území je mimo rozsah práce.
        </p>
      </Section>
      {CASES.map((c) => (
        <CaseCard key={c.id} c={c} active={c.id === active} />
      ))}
      <Section title="Nalezené, ale nezařazené případy" defaultOpen={false}>
        {SKIPPED_CASES.map((s) => (
          <div key={s.title} className="card flat">
            <strong>{s.title}</strong>
            <p className="hint">{s.reason}</p>
            <p className="case-links">
              {s.sources.map((src) => (
                <a key={src.url} href={src.url} target="_blank" rel="noreferrer">
                  {src.label} ↗
                </a>
              ))}
            </p>
          </div>
        ))}
      </Section>
    </>
  )
}

function CaseCard({ c, active }: { c: RealCase; active: boolean }) {
  const loadCase = useApp((s) => s.loadCase)
  const notify = useApp((s) => s.notify)
  const w = c.weather
  const ref = useRef<HTMLDivElement>(null)
  // a case opened from a link may sit further down the list
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [active])
  const share = () => {
    const url = new URL(location.href)
    url.search = ''
    url.searchParams.set('pripad', c.id)
    navigator.clipboard?.writeText(url.href).then(
      () => notify('Odkaz na případ zkopírován'),
      () => notify(url.href),
    )
  }
  return (
    <div ref={ref} className={'card case-card' + (active ? ' selected' : '')}>
      <span className={'case-kind ' + c.kind}>{c.kind === 'real' ? 'Skutečný případ' : 'Modelová situace'}</span>
      <strong className="case-title">{c.title}</strong>
      <span className="case-meta">
        {c.dateLabel} · {c.person}
      </span>
      <span className="case-meta">{c.place}</span>
      <p className="case-summary">{c.summary}</p>
      <p className="case-weather">
        <b>Počasí:</b> {num(w.tempC, 1)} °C, vítr {num(w.windMs, 1)} m/s, nárazy {num(w.gustMs, 1)} m/s, {PRECIP[w.precipitation]}
        <span className="hint"> · {c.weatherNote}</span>
      </p>
      {active ? (
        <>
          <div className="case-player">
            <PlaybackControls />
          </div>
          <CaseFleet />
        </>
      ) : (
        <div className="inline">
          <button className="btn primary" onClick={() => loadCase(c.id)}>
            ▶ Přehrát případ
          </button>
        </div>
      )}
      <button className="link-btn text case-share" onClick={share} title="Zkopíruje odkaz, který případ rovnou otevře a přehraje">
        Zkopírovat odkaz na případ
      </button>
      {active && <CaseDetail c={c} />}
    </div>
  )
}

/** The fleet the open case is flown with, and the way out of the case. */
function CaseFleet() {
  const config = useApp((s) => s.config)
  const world = useApp((s) => s.world)!
  const update = useApp((s) => s.update)
  const set = useApp((s) => s.set)
  const closeCase = useApp((s) => s.closeCase)
  const fleet = fleetCounts(config)
  return (
    <div className="case-fleet">
      <span>
        Flotila: {fleet.dronesReady ? `${plural(fleet.dronesReady, 'připravený dron', 'připravené drony', 'připravených dronů')} na ${plural(fleet.basesOperational, 'základně', 'základnách', 'základnách')}` : 'žádný připravený dron'}
        {fleet.models.length > 0 && <span className="muted"> · {fleet.models.join(', ')}</span>}
      </span>
      <div className="row wrap">
        {fleet.dronesReady === 0 && (
          <button className="btn small" onClick={() => update((c) => void (c.bases = PRESETS[0].build(world).bases))}>
            Použít malou flotilu ze vzorového scénáře
          </button>
        )}
        <button className="btn small" onClick={() => set({ tab: 'fleet' })}>
          Upravit flotilu
        </button>
        <button className="btn small" onClick={closeCase}>
          Ukončit případ
        </button>
      </div>
    </div>
  )
}

function CaseDetail({ c }: { c: RealCase }) {
  const result = useApp((s) => s.result)
  const config = useApp((s) => s.config)
  const [open, setOpen] = useState(true)
  const outcome = result?.outcomes[0]
  const best = outcome?.best
  const responders = (outcome?.comparators ?? []).filter((r) => r.available).sort((a, b) => a.totalS - b.totalS)
  const base = best ? config.bases.find((b) => b.id === best.baseId)?.name : null
  return (
    <div className="case-detail">
      <div className="case-sim">
        <b>Simulace</b> <EvidenceTag evidence="derived" />
        {best ? (
          <p className="status ok">
            ✓ AED z dronu u pacienta za {formatDuration(best.atPatientS)}
            <span className="reason-detail">
              {modelName(best.specId)} ze základny {base}
            </span>
          </p>
        ) : (
          <p className="status bad">
            ✕ Žádný proveditelný let
            <span className="reason-detail">{outcome?.candidates[0]?.reasonText.join('; ')}</span>
          </p>
        )}
        <ul className="case-list">
          {responders.map((r) => (
            <li key={r.kind}>
              {r.label}: {formatDuration(r.totalS)}
              {r.kind === 'hems' && !c.hemsUnavailable && ' (model počítá s přistáním poblíž; ve skutečnosti se lékař spouštěl jeřábem)'}
            </li>
          ))}
          {c.hemsUnavailable && <li>{c.hemsUnavailable}</li>}
        </ul>
        <p className="hint">Časy stávajících složek jsou modelové a spíš optimistické: počítají s volnou posádkou na nejbližší základně.</p>
      </div>
      <button className="link-btn text" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} Skutečný průběh a proč by dron pomohl
      </button>
      {open && (
        <>
          <b>{c.kind === 'real' ? 'Co se stalo podle zpráv' : 'Co se stalo při skutečné události'}</b>
          <ol className="case-list">
            {c.reality.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
          <b>Proč by dron pomohl</b>
          <ul className="case-list">
            {c.whyDrone.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <b>Opatrně</b>
          <ul className="case-list muted">
            {c.caveats.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="case-links">
            {c.sources.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                {s.label} ↗
              </a>
            ))}
          </p>
        </>
      )}
    </div>
  )
}
