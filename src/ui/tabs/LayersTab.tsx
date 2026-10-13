import { LAYER_INFO, useApp } from '../../app/store'
import { Check, Section } from '../bits'
import { COLORS } from '../mapLayers'

export function LayersTab() {
  const layers = useApp((s) => s.layers)
  const toggle = useApp((s) => s.toggleLayer)
  const basemap = useApp((s) => s.basemap)
  const note = useApp((s) => s.basemapNote)
  const set = useApp((s) => s.set)
  return (
    <>
      <Section title="Vrstvy mapy">
        {LAYER_INFO.map((l) => (
          <div key={l.id} className="layer-row">
            <Check checked={layers[l.id]} onChange={() => toggle(l.id)}>
              {l.label}
            </Check>
            <span className="hint">{l.hint}</span>
          </div>
        ))}
      </Section>
      <Section title="Podklad">
        <div className="stack">
          <label className="check">
            <input type="radio" name="basemap" checked={basemap === 'online'} onChange={() => set({ basemap: 'online', basemapNote: null })} />
            <span>Online mapa (OpenFreeMap, data OpenStreetMap)</span>
          </label>
          <label className="check">
            <input type="radio" name="basemap" checked={basemap === 'offline'} onChange={() => set({ basemap: 'offline', basemapNote: null })} />
            <span>Offline – jen přibalený terén a hlavní silnice</span>
          </label>
        </div>
        {note && <p className="warn">⚠ {note}</p>}
        <p className="hint">Všechna data simulace jsou součástí aplikace. Online podklad je volitelný a nepotřebuje žádný API klíč.</p>
      </Section>
      <Section title="Značky">
        <ul className="symbols">
          <li>
            <span className="pin base">2</span> Základna dronů (počet připravených dronů)
          </li>
          <li>
            <span className="pin incident">✚</span> Místo události
          </li>
          <li>
            <span className="pin proposal">1</span> Základna navržená optimalizací
          </li>
          <li>
            <span className="swatch line" style={{ background: COLORS.drone }} /> Trasa dronu (čárkovaně: návrat)
          </li>
          <li>
            <span className="swatch line" style={{ background: COLORS['ground-ems'] }} /> Trasa sanitky · <span className="dot" style={{ background: COLORS['ground-ems'] }} /> základna ZZS
          </li>
          <li>
            <span className="swatch line dashed" style={{ color: COLORS['mountain-rescue'] }} /> Trasa Horské služby · <span className="dot" style={{ background: COLORS['mountain-rescue'] }} /> stanice
          </li>
          <li>
            <span className="swatch line dotted" style={{ color: COLORS.hems }} /> Let vrtulníku · <span className="dot" style={{ background: COLORS.hems }} /> základna LZS
          </li>
          <li>
            <span className="dot hospital" /> Nemocnice · <span className="dot" style={{ background: COLORS.good }} /> zmapovaný veřejný AED
          </li>
        </ul>
      </Section>
    </>
  )
}
