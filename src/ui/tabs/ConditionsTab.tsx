import { useApp } from '../../app/store'
import { WEATHER_PRESETS } from '../../data/defaults'
import type { Precipitation } from '../../sim/types'
import { Check, Empty, Field, Num, Section } from '../bits'

const DIRS = ['S', 'SV', 'V', 'JV', 'J', 'JZ', 'Z', 'SZ']

export function ConditionsTab() {
  const config = useApp((s) => s.config)
  const update = useApp((s) => s.update)
  const set = useApp((s) => s.set)
  const mapMode = useApp((s) => s.mapMode)
  const layers = useApp((s) => s.layers)
  const w = config.weather
  const setW = <K extends keyof typeof w>(k: K, v: (typeof w)[K]) =>
    update((c) => {
      c.weather[k] = v
      c.weatherPreset = 'custom'
    })

  return (
    <>
      <Section title="Počasí">
        <p className="hint">
          Ilustrativní podmínky, platné stejně pro celé území. Vítr a nárazy na exponovaných hřebenech bývají silnější než v údolích; místní vlivy se
          nemodelují.
        </p>
        <Field label="Předvolba" wide>
          <select
            value={config.weatherPreset}
            onChange={(e) => {
              const p = WEATHER_PRESETS.find((x) => x.id === e.target.value)
              if (p)
                update((c) => {
                  c.weather = { ...p.weather }
                  c.weatherPreset = p.id
                })
            }}
          >
            {WEATHER_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} – {p.description}
              </option>
            ))}
            {config.weatherPreset === 'custom' && <option value="custom">Vlastní</option>}
          </select>
        </Field>
        <div className="grid2">
          <Field label="Průměrný vítr" info="Porovnává se s limitem větru každého stroje a vstupuje do větrného trojúhelníku pro rychlost vůči zemi.">
            <Num value={w.windMs} min={0} max={30} step={1} unit="m/s" onChange={(v) => setW('windMs', v)} />
          </Field>
          <Field label="Nárazy" info="Porovnává se s limitem nárazů (1,5násobek limitu průměrného větru, není-li limit nárazů zveřejněn).">
            <Num value={w.gustMs} min={0} max={40} step={1} unit="m/s" onChange={(v) => setW('gustMs', Math.max(v, w.windMs))} />
          </Field>
          <Field label="Směr větru" info="Směr, odkud vítr vane.">
            <select value={Math.round(w.windFromDeg / 45) % 8} onChange={(e) => setW('windFromDeg', Number(e.target.value) * 45)}>
              {DIRS.map((d, i) => (
                <option key={d} value={i}>
                  {d} ({i * 45}°)
                </option>
              ))}
            </select>
          </Field>
          <Field label="Teplota" info="Porovnává se s provozními limity; pod 15 °C se snižuje kapacita baterie.">
            <Num value={w.tempC} min={-30} max={45} step={1} unit="°C" onChange={(v) => setW('tempC', v)} />
          </Field>
          <Field label="Srážky">
            <select value={w.precipitation} onChange={(e) => setW('precipitation', e.target.value as Precipitation)}>
              <option value="none">Žádné</option>
              <option value="light-rain">Slabý déšť</option>
              <option value="heavy-rain">Silný déšť</option>
              <option value="snow">Sněžení</option>
            </select>
          </Field>
          <Field label="Rychlost na silnicích" info="Násobitel rychlosti všech pozemních vozidel (sníh, led, mlha). Předpoklad.">
            <Num value={w.roadSpeedFactor} min={30} max={100} step={5} unit="%" scale={100} onChange={(v) => setW('roadSpeedFactor', v)} />
          </Field>
        </div>
        <Check checked={w.icing} onChange={(v) => setW('icing', v)}>
          Námraza (uzemní všechny modelované stroje i vrtulník)
        </Check>
        <Check checked={w.night} onChange={(v) => setW('night', v)}>
          Noc
        </Check>
      </Section>

      <Section
        title="Bezletové zóny"
        aside={
          <button className={'btn small' + (mapMode.kind === 'add-zone' ? ' active' : '')} onClick={() => set({ mapMode: mapMode.kind === 'add-zone' ? { kind: 'idle' } : { kind: 'add-zone' } })}>
            {mapMode.kind === 'add-zone' ? 'Klikněte do mapy…' : '+ Přidat zónu'}
          </button>
        }
      >
        <p className="hint">
          Kruhy kolem letišť jsou <strong>ilustrativní</strong>, nejde o oficiální zeměpisné zóny (ověřte v aplikaci DronView). Je-li zóna vynucena,
          drony ji oblétají a nemohou do ní doručovat.
        </p>
        {!layers.zones && (
          <button className="btn small ghost" onClick={() => set({ layers: { ...layers, zones: true } })}>
            Zobrazit zóny na mapě
          </button>
        )}
        {config.zones.length === 0 && <Empty title="Žádné zóny" />}
        {config.zones.map((z) => (
          <div key={z.id} className="zone-row">
            <Check checked={z.enforced} onChange={(v) => update((c) => void (c.zones.find((x) => x.id === z.id)!.enforced = v))}>
              <span title={z.note}>{z.name}</span>
            </Check>
            <Num value={z.radiusM} scale={0.001} min={0.3} max={15} step={0.5} unit="km" onChange={(v) => update((c) => void (c.zones.find((x) => x.id === z.id)!.radiusM = v))} />
            <button className="icon-btn" aria-label={`Zobrazit zónu ${z.name} na mapě`} title="Zobrazit na mapě" onClick={() => set({ flyTo: { center: z.center, seq: Date.now() }, layers: { ...layers, zones: true } })}>
              ⌖
            </button>
            {z.kind === 'custom' && (
              <button className="icon-btn" aria-label={`Odebrat zónu ${z.name}`} onClick={() => update((c) => void (c.zones = c.zones.filter((x) => x.id !== z.id)))}>
                ✕
              </button>
            )}
          </div>
        ))}
      </Section>
    </>
  )
}
