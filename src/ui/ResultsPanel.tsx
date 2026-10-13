import { useMemo, useRef, useState } from 'react'
import { num } from '../app/format'
import { REASON_LABEL } from '../app/metrics'
import { useApp } from '../app/store'
import { modelName } from '../data/drones'
import { formatDuration } from '../sim/stats'
import type { DroneMission, FlightProfile, ResponderResult, TimeComponent } from '../sim/types'
import { Empty, EvidenceTag, Info, Section } from './bits'
import { COLORS } from './mapLayers'

const MODE_LABEL = { land: 'přistání', winch: 'naviják', 'low-drop': 'spuštění na laně', parachute: 'padák' } as const
/** how a time component is drawn: waiting/handling, moving, or at the scene */
const PHASE: Record<string, 'wait' | 'move' | 'scene'> = {
  call: 'wait', wait: 'wait', launch: 'wait', turnout: 'wait', alert: 'wait', mobil: 'wait',
  climb: 'move', cruise: 'move', descent: 'move', drive: 'move', flight: 'move', out: 'move', back: 'move',
  delivery: 'scene', retrieval: 'scene', foot: 'scene', landing: 'scene',
}

interface Row {
  key: string
  label: string
  sub: string
  color: string
  components: TimeComponent[]
  total: number
  note?: string
  unavailable?: string
}

export function ResultsPanel() {
  const result = useApp((s) => s.result)
  const selected = useApp((s) => s.selectedIncident)
  const config = useApp((s) => s.config)
  const playT = useApp((s) => s.playT)
  const set = useApp((s) => s.set)
  const outcome = result?.outcomes.find((o) => o.incident.id === selected) ?? null

  if (!outcome)
    return (
      <div className="results">
        <Empty title="Není vybrána žádná událost">Kliknutím do mapy umístěte událost. Model najde nejrychlejší proveditelný dron a porovná jej se stávajícími složkami.</Empty>
      </div>
    )

  const best = outcome.best
  const baseName = (id: string) => config.bases.find((b) => b.id === id)?.name ?? id
  const rows: Row[] = []
  if (best)
    rows.push({
      key: 'drone',
      label: 'AED doručený dronem',
      sub: `${modelName(best.specId)} ze základny ${baseName(best.baseId)} · ${best.mode ? MODE_LABEL[best.mode] : ''}`,
      color: COLORS.drone,
      components: best.components,
      total: best.atPatientS,
    })
  else rows.push({ key: 'drone', label: 'AED doručený dronem', sub: '', color: COLORS.drone, components: [], total: Infinity, unavailable: config.bases.length ? 'Žádný dron flotily toto místo neobslouží' : 'Scénář nemá žádné drony' })
  for (const r of outcome.comparators)
    rows.push({
      key: r.kind,
      label: r.label,
      sub: r.available ? `odkud: ${r.fromName ?? '—'}` : '',
      color: COLORS[r.kind],
      components: r.components,
      total: r.totalS,
      unavailable: r.available ? undefined : r.unavailableReason,
    })

  // the drone is compared with the earliest non-illustrative responder, not only with the ambulance
  const ground = outcome.comparators.filter((c) => c.available && !c.illustrative).sort((a, b) => a.totalS - b.totalS)[0]
  const heli = outcome.comparators.find((c) => c.kind === 'hems' && c.available)
  const diff = best && ground ? ground.totalS - best.atPatientS : null
  const groundName = ground ? ground.label : ''

  return (
    <div className="results">
      <header className="results-head">
        <div>
          <h2>{outcome.incident.label}</h2>
          <p className="coord">
            {num(outcome.incident.position[1], 4)}° s. š. {num(outcome.incident.position[0], 4)}° v. d. ·{' '}
            {outcome.incident.site === 'open' ? 'volná plocha k přistání' : 'bez plochy k přistání'}
          </p>
        </div>
      </header>

      <div className="headline">
        {best ? (
          <>
            <div className="headline-num">
              <span className="big">{formatDuration(best.atPatientS)}</span>
              <span className="headline-label">
                od volání po AED u pacienta
                <Info text="Simulovaný výsledek: součet časových složek uvedených níže. Jde o čas, kdy je defibrilátor u pacienta, nikoli o čas prvního výboje." />
              </span>
            </div>
            <p className="headline-compare">
              {diff === null
                ? 'K porovnání není zapnuta žádná pozemní složka.'
                : diff > 0
                  ? `O ${formatDuration(diff)} dříve než první pozemní složka v tomto modelu (${groundName}, ${formatDuration(ground!.totalS)}).`
                  : `O ${formatDuration(-diff)} později než první pozemní složka v tomto modelu (${groundName}, ${formatDuration(ground!.totalS)}) – zde bez časového přínosu.`}
              {heli && ` Ilustrativní scénář s vrtulníkem: ${formatDuration(heli.totalS)}.`}
            </p>
            <p className="status ok">✓ Proveditelné · {best.routeApprox}</p>
          </>
        ) : (
          <>
            <p className="status bad big-status">✕ Žádný proveditelný let dronu</p>
            <ul className="reasons">
              {(outcome.candidates[0]?.reasonText ?? [config.bases.length ? 'Není k dispozici žádný dron' : 'Scénář nemá žádné základny dronů']).map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      <Section title="Porovnání zásahu">
        <Timeline rows={rows} playT={playT} onScrub={(t) => set({ playT: t, playing: false })} />
        <p className="hint">
          Pruhy sdílejí jednu časovou osu od tísňového volání. Světlá = čekání nebo příjem výzvy, plná = přesun, střední = na místě nebo pěšky.
          Hodnotu úseku zobrazíte najetím myší.
        </p>
        {best && (
          <p className="hint">
            Jen pro orientaci: v terénní simulaci v Bodentalu podali laici první výboj v mediánu 2:20 po doručení AED (záchranáři 1:19). První výboj by
            zde tedy přišel přibližně v čase <strong>{formatDuration(best.deliveredS + 140)}</strong>. <EvidenceTag evidence="peer-reviewed" sourceId="fischer2023" />
          </p>
        )}
      </Section>

      {rows
        .filter((r) => !r.unavailable)
        .map((r) => (
          <Section key={r.key} title={`${r.label.split(' —')[0]} – ${formatDuration(r.total)}`} defaultOpen={r.key === 'drone'}>
            <ComponentTable components={r.components} total={r.total} />
            {r.key !== 'drone' &&
              (outcome.comparators.find((c) => c.kind === r.key) as ResponderResult).notes.map((n, i) => (
                <p key={i} className="hint">
                  {n}
                </p>
              ))}
          </Section>
        ))}

      {best?.outbound && best.outbound.samples.length > 1 && (
        <Section title="Letový profil">
          <ProfileChart profile={best.outbound} />
          <div className="kv-grid">
            <div className="kv">
              <span>Vzdálenost po zemi</span>
              <b>{num(best.outbound.horizM / 1000, 2)} km</b>
            </div>
            <div className="kv">
              <span>Nastoupáno</span>
              <b>{Math.round(best.outbound.totalAscentM)} m</b>
            </div>
            <div className="kv">
              <span>Nejvyšší bod</span>
              <b>{Math.round(best.outbound.maxAltAmslM)} m n. m.</b>
            </div>
            <div className="kv">
              <span>
                Max. výška nad terénem
                <Info text="Otevřená kategorie dovoluje 120 m nad nejbližším bodem terénu. Let mimo dohled vyžaduje oprávnění ve specifické kategorii v každém případě; profil nad 120 m by musel být jeho součástí." />
              </span>
              <b className={best.outbound.maxAglM > 120.5 ? 'flag' : ''}>
                {Math.round(best.outbound.maxAglM)} m{best.outbound.maxAglM > 120.5 ? ' ⚠' : ''}
              </b>
            </div>
          </div>
          <p className="hint">
            Zjednodušení: přímá trať{best.outbound.detoured ? ' kolem vynucených bezletových zón' : ''}, nejnižší profil, který drží {config.ops.minAglM} m
            nad stometrovým modelem terénu v mezích stoupací a klesací rychlosti stroje. Stromy, stožáry a lana v modelu terénu nejsou.
          </p>
        </Section>
      )}

      {best?.energy && (
        <Section title="Rozpočet doletu">
          <EnergyBar mission={best} />
          <p className="hint">
            Vyjádřeno jako ekvivalentní vzdálenost letu za bezvětří. Využitelný dolet = zveřejněný dolet při {num(best.payloadKg, 1)} kg (
            {num(best.energy.publishedKm)} km) upravený o teplotu (× {num(best.energy.tempFactor, 2)}) a rezervu při přistání{' '}
            {Math.round(config.ops.reserveFraction * 100)} %. Náklady na stoupání a vis jsou předpoklady modelu.
          </p>
        </Section>
      )}

      <Section title={`Všechny posuzované drony (${outcome.candidates.length})`} defaultOpen={!best}>
        {outcome.candidates.length === 0 ? (
          <Empty title="Scénář nemá žádné drony">Základnu přidáte v záložce Flotila.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Dron</th>
                <th className="num">AED u pacienta</th>
                <th>Výsledek</th>
              </tr>
            </thead>
            <tbody>
              {outcome.candidates.map((m) => (
                <tr key={m.droneId} className={m === best ? 'winner' : ''}>
                  <td>
                    <strong>{modelName(m.specId)}</strong>
                    <br />
                    <span className="muted">{baseName(m.baseId)}</span>
                  </td>
                  <td className="num">{m.feasible ? formatDuration(m.atPatientS) : '—'}</td>
                  <td>
                    {m.feasible ? (
                      <span className="status ok">
                        ✓ {m === best ? 'Vyslán' : 'Proveditelné'} · {m.mode && MODE_LABEL[m.mode]}
                        {m.energy ? ` · rezerva doletu ${num(m.energy.marginKm)} km` : ''}
                      </span>
                    ) : (
                      <span className="status bad" title={m.reasonText.join('\n')}>
                        ✕ {m.reasons.map((r) => REASON_LABEL[r]).join(', ')}
                        <span className="reason-detail">{m.reasonText[0]}</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}

function niceStep(max: number) {
  for (const s of [60, 120, 300, 600, 900, 1800]) if (max / s <= 6) return s
  return 3600
}

function Timeline({ rows, playT, onScrub }: { rows: Row[]; playT: number; onScrub: (t: number) => void }) {
  const max = Math.max(60, ...rows.filter((r) => isFinite(r.total)).map((r) => r.total)) * 1.22
  const step = niceStep(max)
  const ticks: number[] = []
  for (let t = 0; t <= max; t += step) ticks.push(t)
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  return (
    <div className="timeline" ref={ref}>
      <div
        className="tl-axis"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          onScrub(Math.max(0, ((e.clientX - r.left) / r.width) * max))
        }}
        title="Kliknutím posunete čas přehrávání"
      >
        <em>min</em>
        {ticks.map((t) => (
          <span key={t} style={{ left: `${(100 * t) / max}%` }}>
            {t / 60}
          </span>
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.key} className="tl-row">
          <div className="tl-label">
            <i style={{ background: r.color }} />
            <span>
              <strong>{r.label}</strong>
              {r.sub && <small>{r.sub}</small>}
            </span>
          </div>
          <div className="tl-track">
            {ticks.map((t) => (
              <span key={t} className="tl-grid" style={{ left: `${(100 * t) / max}%` }} />
            ))}
            {r.unavailable ? (
              <span className="tl-na">✕ {r.unavailable}</span>
            ) : (
              <>
                {(() => {
                  let acc = 0
                  return r.components.map((c) => {
                    const left = acc
                    acc += c.seconds
                    if (c.seconds <= 0) return null
                    const phase = PHASE[c.key] ?? 'move'
                    return (
                      <span
                        key={c.key}
                        className={'tl-seg ' + phase}
                        style={{ left: `${(100 * left) / max}%`, width: `max(${(100 * c.seconds) / max}% - 2px, 1px)`, background: r.color }}
                        onMouseMove={(e) => {
                          const box = ref.current!.getBoundingClientRect()
                          setTip({ x: e.clientX - box.left, y: e.clientY - box.top, text: `${c.label}: ${formatDuration(c.seconds)} (${formatDuration(left)} → ${formatDuration(left + c.seconds)})` })
                        }}
                        onMouseLeave={() => setTip(null)}
                      />
                    )
                  })
                })()}
                <span className="tl-total" style={{ left: `${(100 * r.total) / max}%` }}>
                  {formatDuration(r.total)}
                </span>
              </>
            )}
          </div>
        </div>
      ))}
      {playT > 0 && playT < max && <span className="tl-playhead" style={{ left: `calc(var(--tl-label) + (100% - var(--tl-label)) * ${playT / max})` }} />}
      {tip && (
        <span className="chart-tip" style={{ left: Math.min(tip.x + 10, 250), top: tip.y + 14 }}>
          {tip.text}
        </span>
      )}
    </div>
  )
}

function ComponentTable({ components, total }: { components: TimeComponent[]; total: number }) {
  return (
    <table className="table compact">
      <tbody>
        {components.map((c) => (
          <tr key={c.key}>
            <td>
              {c.label}
              {c.note && <span className="muted block">{c.note}</span>}
            </td>
            <td className="num">{formatDuration(c.seconds)}</td>
            <td className="ev-cell">
              <EvidenceTag evidence={c.evidence} note={c.note} />
            </td>
          </tr>
        ))}
        <tr className="total">
          <td>Celkem od tísňového volání</td>
          <td className="num">{formatDuration(total)}</td>
          <td className="ev-cell">
            <EvidenceTag evidence="derived" />
          </td>
        </tr>
      </tbody>
    </table>
  )
}

/** Terrain and flight altitude along the route. One y-axis (metres AMSL). */
function ProfileChart({ profile }: { profile: FlightProfile }) {
  const W = 340
  const H = 150
  const m = { l: 38, r: 8, t: 10, b: 22 }
  const s = profile.samples
  const [hover, setHover] = useState<number | null>(null)
  const { x, y, yTicks, xTicks, lo } = useMemo(() => {
    const maxS = s[s.length - 1].s || 1
    let loV = Infinity
    let hiV = -Infinity
    for (const p of s) {
      loV = Math.min(loV, p.terrainM)
      hiV = Math.max(hiV, p.altM)
    }
    const stepY = hiV - loV > 800 ? 400 : hiV - loV > 300 ? 200 : 100
    const lo = Math.floor(loV / stepY) * stepY
    const hi = Math.ceil((hiV + 20) / stepY) * stepY
    const yTicks: number[] = []
    for (let v = lo; v <= hi; v += stepY) yTicks.push(v)
    const stepX = maxS > 30000 ? 10000 : maxS > 12000 ? 5000 : maxS > 5000 ? 2000 : 1000
    const xTicks: number[] = []
    for (let v = 0; v <= maxS; v += stepX) xTicks.push(v)
    return {
      x: (v: number) => m.l + ((W - m.l - m.r) * v) / maxS,
      y: (v: number) => H - m.b - ((H - m.t - m.b) * (v - lo)) / (hi - lo),
      yTicks,
      xTicks,
      lo,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])
  const terrain = `M${x(0)},${y(lo)} ` + s.map((p) => `L${x(p.s).toFixed(1)},${y(p.terrainM).toFixed(1)}`).join(' ') + ` L${x(s[s.length - 1].s)},${y(lo)} Z`
  const flight = s.map((p, i) => `${i ? 'L' : 'M'}${x(p.s).toFixed(1)},${y(p.altM).toFixed(1)}`).join(' ')
  const h = hover !== null ? s[hover] : null

  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart"
        role="img"
        aria-label="Terén a výška letu podél trasy"
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect()
          const sx = ((e.clientX - box.left) / box.width) * W
          const dist = ((sx - m.l) / (W - m.l - m.r)) * s[s.length - 1].s
          let best = 0
          for (let i = 1; i < s.length; i++) if (Math.abs(s[i].s - dist) < Math.abs(s[best].s - dist)) best = i
          setHover(best)
        }}
        onMouseLeave={() => setHover(null)}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={m.l - 5} y={y(v) + 3} textAnchor="end" className="tick">
              {v}
            </text>
          </g>
        ))}
        {xTicks.map((v) => (
          <text key={v} x={x(v)} y={H - 7} textAnchor="middle" className="tick">
            {v / 1000}
          </text>
        ))}
        <text x={W - m.r} y={H - 7} textAnchor="end" className="tick unit">
          km
        </text>
        <text x={4} y={9} className="tick unit">
          m n. m.
        </text>
        <path d={terrain} className="terrain" />
        <path d={flight} className="flight" />
        <text x={x(s[Math.floor(s.length * 0.55)].s)} y={y(s[Math.floor(s.length * 0.55)].altM) - 6} className="direct" textAnchor="middle">
          dráha letu
        </text>
        {h && (
          <g>
            <line x1={x(h.s)} x2={x(h.s)} y1={m.t} y2={H - m.b} className="cross" />
            <circle cx={x(h.s)} cy={y(h.altM)} r={4} className="flight-dot" />
            <circle cx={x(h.s)} cy={y(h.terrainM)} r={3} className="terrain-dot" />
          </g>
        )}
      </svg>
      <div className="chart-readout" aria-live="polite">
        {h ? (
          <>
            <b>{num(h.s / 1000, 2)} km</b> · stroj {Math.round(h.altM)} m · terén {Math.round(h.terrainM)} m · <b>{Math.round(h.altM - h.terrainM)} m nad terénem</b>
          </>
        ) : (
          <span className="muted">Šedě terén, modrá čára modelovaná výška letu. Hodnoty zobrazíte najetím myší.</span>
        )}
      </div>
    </div>
  )
}

function EnergyBar({ mission }: { mission: DroneMission }) {
  const e = mission.energy!
  const max = Math.max(e.usableKm, e.requiredKm) * 1.05
  const parts = [
    { label: 'Let tam', km: e.outboundKm, cls: 'a' },
    { label: 'Let zpět', km: e.returnKm, cls: 'b' },
    { label: 'Stoupání', km: e.climbKm, cls: 'c' },
    { label: 'Vis a doručení', km: e.hoverKm, cls: 'd' },
  ].filter((p) => p.km > 0.005)
  let acc = 0
  return (
    <div className="energy">
      <div className="energy-track" role="img" aria-label={`Potřebný dolet ${num(e.requiredKm, 1)} km z ${num(e.usableKm, 1)} km využitelných`}>
        {parts.map((p) => {
          const left = acc
          acc += p.km
          return <span key={p.label} className={'energy-seg ' + p.cls} style={{ left: `${(100 * left) / max}%`, width: `max(${(100 * p.km) / max}% - 2px, 1px)` }} title={`${p.label}: ${num(p.km, 1)} km`} />
        })}
        <span className="energy-limit" style={{ left: `${(100 * e.usableKm) / max}%` }}>
          <em>využitelných {num(e.usableKm)} km</em>
        </span>
      </div>
      <ul className="energy-legend">
        {parts.map((p) => (
          <li key={p.label}>
            <i className={'energy-seg ' + p.cls} />
            {p.label} {num(p.km, 1)} km
          </li>
        ))}
      </ul>
      <div className="kv">
        <span>Potřebný / využitelný</span>
        <b className={e.marginKm < 0 ? 'flag' : ''}>
          {num(e.requiredKm, 1)} / {num(e.usableKm, 1)} km ({e.marginKm >= 0 ? `rezerva ${num((100 * e.marginKm) / e.usableKm)} %` : 'nestačí'})
        </b>
      </div>
    </div>
  )
}
