import { useState } from 'react'
import { download, toCsv } from '../../app/exporters'
import { czk, num, pct } from '../../app/format'
import { fleetCounts, scenarioCost } from '../../app/metrics'
import { useApp } from '../../app/store'
import { WEATHER_PRESETS } from '../../data/defaults'
import { formatDuration } from '../../sim/stats'
import { Empty, Modal } from '../bits'

export function CompareModal({ onClose }: { onClose: () => void }) {
  const saved = useApp((s) => s.saved)
  const config = useApp((s) => s.config)
  const analysis = useApp((s) => s.analysis)
  const saveScenario = useApp((s) => s.saveScenario)
  const deleteSaved = useApp((s) => s.deleteSaved)
  const setConfig = useApp((s) => s.setConfig)
  const notify = useApp((s) => s.notify)
  const [name, setName] = useState(config.name)

  type Saved = (typeof saved)[number]
  const cost = (s: Saved) => scenarioCost(s.config)
  const rows: { label: string; hint?: string; get: (s: Saved) => string }[] = [
    { label: 'Základny / připravené drony', get: (s) => `${fleetCounts(s.config).basesOperational} / ${fleetCounts(s.config).dronesReady}` },
    { label: 'Stroje', get: (s) => fleetCounts(s.config).models.join(', ') || 'žádné' },
    { label: 'Pořizovací cena flotily', hint: 'odhad', get: (s) => (cost(s).drones ? `${czk(cost(s).purchaseEur, s.config.costs.eurCzk)}${cost(s).hasPlaceholder ? ' ⚠' : ''}` : '—') },
    { label: 'Roční náklady flotily', hint: 'odhad včetně personálu', get: (s) => (cost(s).drones ? `${czk(cost(s).annualEur, s.config.costs.eurCzk)}${cost(s).hasPlaceholder ? ' ⚠' : ''}` : '—') },
    {
      label: 'Roční náklady na obyvatele v cílovém čase',
      hint: 'roční náklady ÷ pokrytí obyvatelé',
      get: (s) => (s.metrics && s.metrics.populationWithin > 0 && cost(s).drones ? `${num((cost(s).annualEur * s.config.costs.eurCzk) / s.metrics.populationWithin)} Kč` : '—'),
    },
    { label: 'Počasí', get: (s) => WEATHER_PRESETS.find((w) => w.id === s.config.weatherPreset)?.name ?? `Vlastní (${s.config.weather.windMs} m/s, ${s.config.weather.tempC} °C)` },
    { label: 'Cílový čas', get: (s) => `${s.config.analysis.targetMin} min` },
    { label: 'Sledovaná místa v cílovém čase', hint: 'pokrytí míst', get: (s) => (s.metrics ? `${pct(s.metrics.locationsWithin, s.metrics.locations)} (${s.metrics.locationsWithin}/${s.metrics.locations})` : 'nevypočteno') },
    { label: 'Obyvatelé v cílovém čase', hint: 'sídla se značkou', get: (s) => (s.metrics && s.metrics.populationTagged ? pct(s.metrics.populationWithin, s.metrics.populationTagged) : '—') },
    { label: 'Plocha v cílovém čase', hint: 'plošné pokrytí', get: (s) => (s.metrics ? pct(s.metrics.areaWithin, s.metrics.areaCells) : '—') },
    { label: 'Medián / 90. percentil doručení', get: (s) => (s.metrics && isFinite(s.metrics.medianS) ? `${formatDuration(s.metrics.medianS)} / ${formatDuration(s.metrics.p90S)}` : '—') },
    { label: 'Dron dříve než ZZS', get: (s) => (s.metrics && s.metrics.comparedWithGround ? `${s.metrics.droneFaster} z ${s.metrics.comparedWithGround}` : '—') },
    { label: 'Neobsloužitelná místa', get: (s) => (s.metrics ? String(s.metrics.locationsUnserved) : '—') },
    {
      label: 'Události: dron × ZZS',
      get: (s) => s.incidents.map((i) => `${i.label}: ${i.droneS !== null ? formatDuration(i.droneS) : 'bez dronu'} × ${i.groundS !== null ? formatDuration(i.groundS) : '—'}`).join(' · ') || 'žádné',
    },
  ]

  return (
    <Modal title="Uložené scénáře" onClose={onClose} wide>
      <div className="row save-row">
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Název scénáře" placeholder="Název scénáře" />
        <button className="btn primary" disabled={!name.trim() || analysis.status === 'running'} onClick={() => saveScenario(name.trim())}>
          Uložit aktuální scénář
        </button>
        {saved.length > 0 && (
          <button
            className="btn"
            onClick={() => download('beskydy-aed-porovnani-scenaru.csv', toCsv([['metrika', ...saved.map((s) => s.name)], ...rows.map((r) => [r.label, ...saved.map((s) => r.get(s))])]), 'text/csv;charset=utf-8')}
          >
            Exportovat porovnání (CSV)
          </button>
        )}
      </div>
      <p className="hint">
        Scénáře se ukládají jen v tomto prohlížeči. Statistiky pokrytí se uloží tak, jak byly spočteny v okamžiku uložení
        {analysis.stale || analysis.status === 'running' ? ' – výpočet právě běží, takže uložení teď statistiky pokrytí neobsahuje' : ''}. ⚠ u nákladů
        znamená, že část cen je plánovací odhad.
      </p>
      {saved.length === 0 ? (
        <Empty title="Zatím nic uloženo">Uložte aktuální scénář, změňte flotilu, počasí nebo předpoklady a uložte znovu – scénáře se pak zobrazí vedle sebe.</Empty>
      ) : (
        <div className="table-scroll">
          <table className="table compare">
            <thead>
              <tr>
                <th />
                {saved.map((s) => (
                  <th key={s.id}>
                    {s.name}
                    <span className="muted block">{new Date(s.savedAt).toLocaleString('cs-CZ')}</span>
                    <span className="row">
                      <button
                        className="btn small"
                        onClick={() => {
                          setConfig(s.config)
                          notify(`Načteno: „${s.name}“`)
                          onClose()
                        }}
                      >
                        Načíst
                      </button>
                      <button className="btn small ghost" onClick={() => deleteSaved(s.id)}>
                        Smazat
                      </button>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row">
                    {r.label}
                    {r.hint && <span className="muted block">{r.hint}</span>}
                  </th>
                  {saved.map((s) => (
                    <td key={s.id}>{r.get(s)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
