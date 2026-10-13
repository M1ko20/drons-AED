import { useEffect, useState } from 'react'
import { coverageCsv, download, fileBase, incidentsCsv, scenarioJson } from '../app/exporters'
import { useApp, type TabId } from '../app/store'
import { Dashboard } from './Dashboard'
import { MapView } from './MapView'
import { CompareModal } from './modals/CompareModal'
import { DroneTable } from './modals/DroneTable'
import { ReportModal } from './modals/ReportModal'
import { SourcesModal } from './modals/SourcesModal'
import { ResultsPanel } from './ResultsPanel'
import { ConditionsTab } from './tabs/ConditionsTab'
import { CoverageTab } from './tabs/CoverageTab'
import { FleetTab } from './tabs/FleetTab'
import { LayersTab } from './tabs/LayersTab'
import { RespondersTab } from './tabs/RespondersTab'
import { ScenarioTab } from './tabs/ScenarioTab'

const TABS: { id: TabId; label: string }[] = [
  { id: 'scenario', label: 'Scénář' },
  { id: 'fleet', label: 'Flotila' },
  { id: 'conditions', label: 'Podmínky' },
  { id: 'responders', label: 'Složky' },
  { id: 'coverage', label: 'Pokrytí' },
  { id: 'layers', label: 'Vrstvy' },
]

const MODE_HINT: Record<string, string> = {
  'add-incident': 'Kliknutím do mapy umístíte další událost',
  'add-base': 'Kliknutím do mapy umístíte základnu dronů',
  'add-zone': 'Kliknutím do mapy umístíte bezletovou zónu o poloměru 2 km',
  'add-station': 'Kliknutím do mapy přidáte stanoviště',
  'add-candidate': 'Kliknutím do mapy přidáte kandidátní místo základny',
}

export function App() {
  const world = useApp((s) => s.world)
  const loadError = useApp((s) => s.loadError)
  const init = useApp((s) => s.init)
  useEffect(() => {
    init()
  }, [init])

  if (loadError)
    return (
      <div className="boot">
        <h1>Data se nepodařilo načíst</h1>
        <p>{loadError}</p>
        <p className="muted">
          Simulátor potřebuje soubory ve složce <code>public/data</code>. Vytvoříte je příkazem <code>npm run data</code>; poté stránku načtěte znovu.
        </p>
        <button className="btn primary" onClick={() => location.reload()}>
          Načíst znovu
        </button>
      </div>
    )
  if (!world)
    return (
      <div className="boot" role="status">
        <i className="spinner large" />
        <p>Načítám terén, silnice a sledovaná místa…</p>
      </div>
    )
  return <Shell />
}

function Shell() {
  const tab = useApp((s) => s.tab)
  const modal = useApp((s) => s.modal)
  const sidebarOpen = useApp((s) => s.sidebarOpen)
  const resultsOpen = useApp((s) => s.resultsOpen)
  const mapMode = useApp((s) => s.mapMode)
  const toast = useApp((s) => s.toast)
  const config = useApp((s) => s.config)
  const set = useApp((s) => s.set)
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const s = useApp.getState()
      if (s.modal) s.set({ modal: null })
      else if (s.mapMode.kind !== 'idle') s.set({ mapMode: { kind: 'idle' } })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const exportFile = (kind: 'json' | 'incidents' | 'coverage') => {
    const s = useApp.getState()
    setMenu(false)
    if (kind === 'json') download(`${fileBase(s.config)}.json`, scenarioJson(s.world!, s.config, s.result, s.analysis.stale ? null : s.metrics), 'application/json')
    else if (kind === 'incidents') {
      if (!s.result?.outcomes.length) return s.notify('Nejprve umístěte událost – zatím není co exportovat.')
      download(`${fileBase(s.config)}-udalosti.csv`, incidentsCsv(s.config, s.result), 'text/csv;charset=utf-8')
    } else {
      if (!s.analysis.result || s.analysis.stale) return s.notify('Výpočet pokrytí ještě běží – zkuste to za okamžik.')
      download(`${fileBase(s.config)}-pokryti.csv`, coverageCsv(s.config, s.analysis.result, s.demandById), 'text/csv;charset=utf-8')
    }
    s.notify('Export stažen')
  }

  return (
    <div className={'app' + (sidebarOpen ? '' : ' no-sidebar') + (resultsOpen ? '' : ' no-results')}>
      <header className="topbar">
        <button className="icon-btn" onClick={() => set({ sidebarOpen: !sidebarOpen })} aria-label={sidebarOpen ? 'Skrýt ovládání' : 'Zobrazit ovládání'} aria-expanded={sidebarOpen} title="Ovládání">
          ☰
        </button>
        <div className="brand">
          <strong>Simulátor pokrytí drony s AED</strong>
          <span>Beskydy · plánovací prototyp</span>
        </div>
        <span className="scenario-name" title="Aktuální scénář">
          {config.name}
        </span>
        <nav className="top-actions">
          <button className="btn" onClick={() => set({ modal: 'compare' })}>
            Uložit / porovnat
          </button>
          <button className="btn" onClick={() => set({ modal: 'drones' })}>
            Letouny
          </button>
          <button className="btn" onClick={() => set({ modal: 'sources' })}>
            Zdroje a předpoklady
          </button>
          <span className="menu-wrap">
            <button className="btn" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-haspopup="menu">
              Export ▾
            </button>
            {menu && (
              <span className="menu" role="menu" onMouseLeave={() => setMenu(false)}>
                <button role="menuitem" onClick={() => exportFile('incidents')}>
                  Události a časové složky (CSV)
                </button>
                <button role="menuitem" onClick={() => exportFile('coverage')}>
                  Sledovaná místa a pokrytí (CSV)
                </button>
                <button role="menuitem" onClick={() => exportFile('json')}>
                  Celý scénář včetně zdrojů (JSON)
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu(false)
                    set({ modal: 'report' })
                  }}
                >
                  Souhrn k tisku…
                </button>
              </span>
            )}
          </span>
          <button className="icon-btn" onClick={() => set({ resultsOpen: !resultsOpen })} aria-label={resultsOpen ? 'Skrýt výsledky' : 'Zobrazit výsledky'} aria-expanded={resultsOpen} title="Výsledky">
            ▤
          </button>
        </nav>
      </header>

      <aside className="sidebar" aria-label="Ovládání">
        <div className="tabs" role="tablist" aria-label="Části ovládání">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => set({ tab: t.id })}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="tab-body" role="tabpanel">
          {tab === 'scenario' && <ScenarioTab />}
          {tab === 'fleet' && <FleetTab />}
          {tab === 'conditions' && <ConditionsTab />}
          {tab === 'responders' && <RespondersTab />}
          {tab === 'coverage' && <CoverageTab />}
          {tab === 'layers' && <LayersTab />}
        </div>
      </aside>

      <main className="map-area">
        <MapView />
        <div className="map-notes">
          {mapMode.kind !== 'idle' ? (
            <span className="map-hint active">
              {MODE_HINT[mapMode.kind]} · <button onClick={() => set({ mapMode: { kind: 'idle' } })}>Zrušit (Esc)</button>
            </span>
          ) : tab === 'scenario' ? (
            <span className="map-hint">Kliknutím do mapy umístíte událost · značky lze přetahovat</span>
          ) : null}
        </div>
        <Dashboard />
      </main>

      <aside className="results-panel" aria-label="Výsledky pro vybranou událost">
        <ResultsPanel />
      </aside>

      {modal === 'drones' && <DroneTable onClose={() => set({ modal: null })} />}
      {modal === 'sources' && <SourcesModal onClose={() => set({ modal: null })} />}
      {modal === 'compare' && <CompareModal onClose={() => set({ modal: null })} />}
      {modal === 'report' && <ReportModal onClose={() => set({ modal: null })} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
