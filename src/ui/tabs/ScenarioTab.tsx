import { useEffect } from 'react'
import { PRESETS } from '../../app/config'
import { num, plural } from '../../app/format'
import { fleetCounts } from '../../app/metrics'
import { playbackDuration } from '../../app/playback'
import { useApp, type TabId } from '../../app/store'
import { WEATHER_PRESETS } from '../../data/defaults'
import { formatDuration } from '../../sim/stats'
import { Empty, Field, Num, Section } from '../bits'

export function ScenarioTab() {
  const config = useApp((s) => s.config)
  const result = useApp((s) => s.result)
  const selected = useApp((s) => s.selectedIncident)
  const mapMode = useApp((s) => s.mapMode)
  const update = useApp((s) => s.update)
  const set = useApp((s) => s.set)
  const loadPreset = useApp((s) => s.loadPreset)
  const activeCase = useApp((s) => s.activeCase)
  const closeCase = useApp((s) => s.closeCase)

  return (
    <>
      {activeCase && (
        <div className="notice">
          <p>
            Je otevřen skutečný případ – jeho místo a počasí dočasně nahradily vaše události a počasí. Flotila a ostatní nastavení zůstávají vaše.
          </p>
          <button className="btn small" onClick={closeCase}>
            Ukončit případ a vrátit mé události
          </button>
        </div>
      )}
      <Section
        title="Události"
        aside={
          <button
            className={'btn small' + (mapMode.kind === 'add-incident' ? ' active' : '')}
            onClick={() => set({ mapMode: mapMode.kind === 'add-incident' ? { kind: 'idle' } : { kind: 'add-incident' } })}
          >
            {mapMode.kind === 'add-incident' ? 'Klikněte do mapy…' : '+ Přidat událost'}
          </button>
        }
      >
        <p className="hint">
          Klikněte do mapy tam, kde došlo k zástavě oběhu – vybraná událost se přesune na to místo. Značku lze i přetáhnout. Přidáte-li další událost,
          uvidíte, jak si drony zásahy rozdělí.
        </p>
        {config.incidents.length === 0 && <Empty title="Není umístěna žádná událost">Klikněte kamkoli do mapy uvnitř zájmového území.</Empty>}
        {config.incidents.map((inc, i) => {
          const outcome = result?.outcomes.find((o) => o.incident.id === inc.id)
          const isSelected = inc.id === selected
          return (
            <div key={inc.id} className={'card' + (isSelected ? ' selected' : '')}>
              <div className="card-head">
                <button className="link-btn" title="Vybrat a zobrazit na mapě" onClick={() => set({ selectedIncident: inc.id, resultsOpen: true, flyTo: { center: inc.position, seq: Date.now() } })}>
                  <span className="pin incident">{config.incidents.length > 1 ? i + 1 : '✚'}</span>
                </button>
                <input
                  className="title-input"
                  value={inc.label}
                  aria-label="Název události"
                  onChange={(e) => update((c) => void (c.incidents.find((x) => x.id === inc.id)!.label = e.target.value))}
                />
                <button className="icon-btn" aria-label={`Odebrat událost ${inc.label}`} onClick={() => update((c) => void (c.incidents = c.incidents.filter((x) => x.id !== inc.id)))}>
                  ✕
                </button>
              </div>
              <div className="card-foot">
                {outcome?.best ? (
                  <span className="status ok">✓ Dron: AED u pacienta za {formatDuration(outcome.best.atPatientS)}</span>
                ) : (
                  <span className="status bad">✕ {config.bases.length ? 'Toto místo žádný dron neobslouží' : 'Nejsou nastaveny žádné drony'}</span>
                )}
                {!isSelected && (
                  <button className="link-btn text" onClick={() => set({ selectedIncident: inc.id, resultsOpen: true, flyTo: { center: inc.position, seq: Date.now() } })}>
                    Vybrat
                  </button>
                )}
              </div>
              {isSelected && outcome && (
                <div className="case-player">
                  <PlaybackControls />
                </div>
              )}
              <div className="grid2">
                <Field label="Plocha k přistání na místě" info="Zda by dron mohl přistát vedle pacienta. Bez ní lze doručit jen navijákem, spuštěním na laně nebo na padáku.">
                  <select value={inc.site} onChange={(e) => update((c) => void (c.incidents.find((x) => x.id === inc.id)!.site = e.target.value as 'open' | 'no-landing'))}>
                    <option value="no-landing">Žádná (stezka, les, svah)</option>
                    <option value="open">Volná plocha k dispozici</option>
                  </select>
                </Field>
                <Field label="Čas volání" info="Minuta na hodinách scénáře, kdy přijde tísňové volání. Pozdější volání mohou zastihnout drony už obsazené.">
                  <Num value={inc.t0S} scale={1 / 60} min={0} max={600} step={1} unit="min" onChange={(v) => update((c) => void (c.incidents.find((x) => x.id === inc.id)!.t0S = v))} />
                </Field>
              </div>
              <span className="coord">
                {num(inc.position[1], 4)}° s. š. {num(inc.position[0], 4)}° v. d.
              </span>
            </div>
          )
        })}
        {config.incidents.length > 0 && (
          <button className="btn ghost" onClick={() => update((c) => void (c.incidents = []))}>
            Vymazat – odebrat všechny události
          </button>
        )}
      </Section>

      <SimulationSetup />

      <Section title="Vzorové scénáře" defaultOpen={false}>
        <p className="hint">Načte najednou flotilu, počasí i události. Každý scénář je jen výchozí bod; vše v něm lze změnit.</p>
        <div className="preset-list">
          {PRESETS.map((p) => (
            <button key={p.id} className={'preset' + (config.name === p.name ? ' active' : '')} onClick={() => loadPreset(p.id)}>
              <strong>{p.name}</strong>
              <span>{p.description}</span>
            </button>
          ))}
        </div>
      </Section>
    </>
  )
}

/** What the simulation currently runs with, each line leading to the settings that change it. */
function SimulationSetup() {
  const config = useApp((s) => s.config)
  const set = useApp((s) => s.set)
  const fleet = fleetCounts(config)
  const w = config.weather
  const preset = WEATHER_PRESETS.find((p) => p.id === config.weatherPreset)
  const c = config.comparators
  const responders = [c.ground.enabled && 'posádka ZZS', c.mountain.enabled && 'Horská služba', c.hems.enabled && 'vrtulník LZS', c.publicAed.enabled && 'veřejný AED'].filter(Boolean)
  const rows: { label: string; value: string; detail?: string; tab: TabId }[] = [
    {
      label: 'Flotila',
      value: fleet.drones ? `${plural(fleet.dronesReady, 'dron', 'drony', 'dronů')} na ${plural(fleet.basesOperational, 'základně', 'základnách', 'základnách')}` : 'bez dronů',
      detail: fleet.models.join(', ') || undefined,
      tab: 'fleet',
    },
    {
      label: 'Počasí',
      value: preset ? preset.name : 'vlastní',
      detail: `vítr ${num(w.windMs)} m/s, nárazy ${num(w.gustMs)} m/s, ${num(w.tempC)} °C${w.night ? ', noc' : ''}${w.icing ? ', námraza' : ''}`,
      tab: 'conditions',
    },
    { label: 'Porovnává se s', value: responders.join(', ') || 'žádnou složkou', tab: 'responders' },
  ]
  return (
    <Section title="S čím se simuluje">
      <dl className="setup">
        {rows.map((r) => (
          <div key={r.label} className="setup-row">
            <dt>{r.label}</dt>
            <dd>
              {r.value}
              {r.detail && <span className="muted block">{r.detail}</span>}
            </dd>
            <button className="link-btn text" onClick={() => set({ tab: r.tab, sidebarOpen: true })}>
              Upravit
            </button>
          </div>
        ))}
      </dl>
    </Section>
  )
}

/** Play/pause, rewind, speed and scrubber for the selected incident; also drives the playback clock. */
export function PlaybackControls() {
  const result = useApp((s) => s.result)
  const selected = useApp((s) => s.selectedIncident)
  const playT = useApp((s) => s.playT)
  const playing = useApp((s) => s.playing)
  const playSpeed = useApp((s) => s.playSpeed)
  const set = useApp((s) => s.set)
  const outcome = result?.outcomes.find((o) => o.incident.id === selected) ?? null
  const duration = outcome ? playbackDuration(outcome.best, outcome.comparators) : 0

  if (!outcome) return null
  return (
    <>
      <div className="playback">
        <button
          className="btn primary"
          onClick={() => set(playing ? { playing: false } : { playing: true, playT: playT >= duration ? 0 : playT })}
          aria-label={playing ? 'Pozastavit přehrávání' : 'Spustit přehrávání'}
        >
          {playing ? '❚❚ Pauza' : '▶ Přehrát'}
        </button>
        <button className="btn" onClick={() => set({ playT: 0, playing: false })}>
          Na začátek
        </button>
        <select aria-label="Rychlost přehrávání" value={playSpeed} onChange={(e) => set({ playSpeed: Number(e.target.value) })}>
          <option value="10">10×</option>
          <option value="30">30×</option>
          <option value="60">60×</option>
          <option value="120">120×</option>
        </select>
        <span className="clock">
          {formatDuration(playT)} / {formatDuration(duration)}
        </span>
      </div>
      <input
        className="scrub"
        type="range"
        min={0}
        max={Math.ceil(duration)}
        step={1}
        value={Math.min(playT, duration)}
        aria-label="Pozice přehrávání"
        onChange={(e) => set({ playT: Number(e.target.value), playing: false })}
      />
    </>
  )
}

/** Advances the playback clock of the selected incident; mounted once, so playback keeps running whichever tab is open. */
export function usePlaybackClock() {
  const result = useApp((s) => s.result)
  const selected = useApp((s) => s.selectedIncident)
  const playing = useApp((s) => s.playing)
  const outcome = result?.outcomes.find((o) => o.incident.id === selected) ?? null
  const duration = outcome ? playbackDuration(outcome.best, outcome.comparators) : 0

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const s = useApp.getState()
      const t = s.playT + dt * s.playSpeed
      if (t >= duration) useApp.setState({ playT: duration, playing: false })
      else {
        useApp.setState({ playT: t })
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, duration])
}
