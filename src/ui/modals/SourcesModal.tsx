import { useState } from 'react'
import { num } from '../../app/format'
import { useApp } from '../../app/store'
import { COST_INFO, DEFAULT_COSTS, DEFAULT_OPS, OPS_INFO } from '../../data/defaults'
import { DISCLAIMER, LIMITATIONS, MODEL_STEPS, OPEN_QUESTIONS, REGULATION } from '../../data/notes'
import { ACCESS_LABEL, NOT_INTEGRATED, SOURCE_BY_ID, SOURCES, STUDY_TYPE_LABEL } from '../../data/sources'
import { AMBULANCE_KMH, RESCUE_KMH } from '../../sim/comparators'
import type { CostSettings } from '../../sim/cost'
import { PERF_FALLBACK } from '../../sim/perf'
import type { OpsSettings } from '../../sim/types'
import { EvidenceTag, Modal } from '../bits'

type Page = 'evidence' | 'model' | 'costs' | 'limits' | 'regulation' | 'data'
const PAGES: { id: Page; label: string }[] = [
  { id: 'evidence', label: 'Zdroje a důkazy' },
  { id: 'model', label: 'Model a předpoklady' },
  { id: 'costs', label: 'Ceny a náklady' },
  { id: 'limits', label: 'Omezení' },
  { id: 'regulation', label: 'Předpisy' },
  { id: 'data', label: 'Geografická data' },
]

const ROAD_CLASS_CS = ['dálnice', 'silnice pro motorová vozidla', 'I. třída', 'II. třída', 'III. třída', 'místní a ostatní', 'obytné ulice', 'účelové komunikace', 'zpevněná lesní cesta', 'ostatní lesní cesta']
const opsValue = (k: keyof OpsSettings, v: unknown): string => {
  if (k === 'returnPolicy') return v === 'return' ? 'tam a zpět' : 'jen tam'
  if (k === 'nightOps') return v ? 'ano' : 'ne'
  if (k === 'modePreference') return (v as string[])[0] === 'winch' ? 'nejprve naviják' : 'nejprve přistání'
  if (k === 'reserveFraction' || k === 'coldDeratePerC') return `${num((v as number) * 100, k === 'coldDeratePerC' ? 1 : 0)} %`
  return String(v)
}
const costValue = (k: keyof CostSettings, v: number): string => (k === 'maintenanceShare' ? `${num(v * 100)} %` : k === 'lifeYears' ? `${num(v)} let` : k === 'staffFte' ? num(v, 1) : k === 'eurCzk' ? `${num(v, 1)} Kč` : `${num(v)} €`)

export function SourcesModal({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState<Page>('evidence')
  const world = useApp((s) => s.world)!
  const config = useApp((s) => s.config)
  const c = world.manifest.counts
  const link = (id?: string) =>
    id && SOURCE_BY_ID[id] ? (
      <a href={SOURCE_BY_ID[id].url} target="_blank" rel="noreferrer">
        {SOURCE_BY_ID[id].organisation.split('—')[0].trim()} ↗
      </a>
    ) : null

  return (
    <Modal title="Zdroje, předpoklady a omezení" onClose={onClose} wide>
      <p className="disclaimer">{DISCLAIMER}</p>
      <div className="tabs inline" role="tablist">
        {PAGES.map((p) => (
          <button key={p.id} role="tab" aria-selected={page === p.id} className={page === p.id ? 'active' : ''} onClick={() => setPage(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      {page === 'evidence' && (
        <>
          <p className="lead">
            V celé aplikaci i v exportech se rozlišují tři druhy informací: <EvidenceTag evidence="manufacturer" /> <EvidenceTag evidence="peer-reviewed" />{' '}
            <EvidenceTag evidence="official" /> <EvidenceTag evidence="third-party" /> ověřená vnější data · <EvidenceTag evidence="assumption" /> nastavitelné
            předpoklady · <EvidenceTag evidence="derived" /> výsledky simulace.
          </p>
          <table className="table sources">
            <thead>
              <tr>
                <th>Zdroj</th>
                <th>Druh</th>
                <th>Co dokládá</th>
                <th>Jak jsme jej četli</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((s) => (
                <tr key={s.id}>
                  <td>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title} ↗
                    </a>
                    <span className="muted block">
                      {s.organisation} · vydáno {s.published} · staženo {s.retrieved}
                    </span>
                  </td>
                  <td>{STUDY_TYPE_LABEL[s.studyType]}</td>
                  <td>{s.summary}</td>
                  <td>{ACCESS_LABEL[s.access]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Otevřené otázky</h3>
          <ul className="plain">
            {OPEN_QUESTIONS.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </>
      )}

      {page === 'model' && (
        <>
          <div className="steps">
            {MODEL_STEPS.map((s) => (
              <div key={s.title}>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
          <h3>Provozní předpoklady (aktuální hodnota · výchozí · podklad)</h3>
          <table className="table">
            <tbody>
              {(Object.keys(OPS_INFO) as (keyof OpsSettings)[]).map((k) => (
                <tr key={k}>
                  <th scope="row">{OPS_INFO[k].label}</th>
                  <td className="nowrap">{opsValue(k, config.ops[k])}</td>
                  <td className="muted nowrap">{opsValue(k, DEFAULT_OPS[k])}</td>
                  <td>
                    {OPS_INFO[k].basis} {link(OPS_INFO[k].sourceId)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Náhradní hodnoty, když výrobce údaj nezveřejňuje</h3>
          <table className="table">
            <tbody>
              <tr>
                <th scope="row">Stoupání / klesání</th>
                <td>
                  multikoptéra {PERF_FALLBACK.climbMs.multirotor} m/s · VTOL s pevným křídlem {PERF_FALLBACK.climbMs['vtol-fixed-wing']} m/s
                </td>
              </tr>
              <tr>
                <th scope="row">Limit větru</th>
                <td>
                  {PERF_FALLBACK.maxWindMs} m/s průměr (limit stroje ze švédské studie); limit nárazů = {num(PERF_FALLBACK.gustFactor, 1)} × limit průměrného větru
                </td>
              </tr>
              <tr>
                <th scope="row">Teplotní rozsah</th>
                <td>
                  {PERF_FALLBACK.tempMinC}…{PERF_FALLBACK.tempMaxC} °C
                </td>
              </tr>
              <tr>
                <th scope="row">Srážky</th>
                <td>bez zveřejněného údaje → stroj se bere jako nezpůsobilý k letu v dešti</td>
              </tr>
              <tr>
                <th scope="row">Energie na stoupání</th>
                <td>
                  1 m stoupání stojí tolik co {PERF_FALLBACK.climbEquivalentM.multirotor} m (multikoptéra) nebo {PERF_FALLBACK.climbEquivalentM['vtol-fixed-wing']} m (VTOL s
                  pevným křídlem) letu – ze zveřejněné kapacity baterie a doletu FlyCart 30 a Wingcopter 198 při účinnosti stoupání 60 %
                </td>
              </tr>
              <tr>
                <th scope="row">Výkon ve visu ÷ výkon v letu</th>
                <td>
                  {num(PERF_FALLBACK.hoverPowerRatio.multirotor, 1)} (multikoptéra: DJI M400 visí 53 min proti 59 min v letu) · {PERF_FALLBACK.hoverPowerRatio['vtol-fixed-wing']}{' '}
                  (VTOL s pevným křídlem: Wingcopter 198 letí 15 min jako multikoptéra proti 90 min na křídle)
                </td>
              </tr>
            </tbody>
          </table>
          <h3>Předpokládané rychlosti jízdy k zásahu podle třídy silnice (km/h)</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Třída silnice</th>
                <th className="num">Sanitka ZZS</th>
                <th className="num">Horská služba</th>
              </tr>
            </thead>
            <tbody>
              {ROAD_CLASS_CS.map((r, i) => (
                <tr key={r}>
                  <td>{r}</td>
                  <td className="num">{AMBULANCE_KMH[i]}</td>
                  <td className="num">{RESCUE_KMH[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">
            Kontrola věrohodnosti: s těmito rychlostmi je 99 % sídel v rozsahu dat do 20 minut jízdy od základny ZZS, což odpovídá zákonnému plánovacímu
            standardu (zákon 374/2011 Sb., § 5) {link('act-374-2011')}. Model byl porovnán i se švédskou studií: pro její mediánový let 1,8 km dává čas
            od vzletu po doručení do 15 % od zveřejněných 3:17.
          </p>
        </>
      )}

      {page === 'costs' && (
        <>
          <p className="lead">
            Ceny dronů výrobci většinou nezveřejňují. Dohledat se podařilo jen ceníky prodejců pro dva stroje DJI; ostatní je třeba poptat. Roční náklady
            jsou odhad složený z předpokladů zahraničních studií – slouží k porovnání scénářů, <strong>ne jako rozpočet</strong>.
          </p>
          <h3>Zveřejněné ceny</h3>
          <table className="table">
            <tbody>
              <tr>
                <th scope="row">DJI Matrice 400</th>
                <td>10 636 € – dron, 1 baterie, nabíjecí stanice a ovladač; není uvedeno, zda s DPH. Bez navijáku. {link('dji-m400-price')}</td>
              </tr>
              <tr>
                <th scope="row">DJI FlyCart 30</th>
                <td>24 498 € bez DPH – dron, 2 baterie, nabíjecí stanice, naviják, nákladový box a ovladač. {link('dji-fc30-price')}</td>
              </tr>
              <tr>
                <th scope="row">Wingcopter 198</th>
                <td>Nezveřejněno; při uvedení jen záloha 5 000 €. Odhady srovnávacích webů (20 000 až 100 000 USD) si odporují. {link('wingcopter-price')}</td>
              </tr>
              <tr>
                <th scope="row">RigiTech, Matternet, Avy, AIR6</th>
                <td>Nezveřejněno – cena na vyžádání.</td>
              </tr>
              <tr>
                <th scope="row">Everdrone, Zipline</th>
                <td>Poskytují se jako služba; smluvní ceny nejsou veřejné.</td>
              </tr>
            </tbody>
          </table>
          <h3>Co o nákladech říkají studie</h3>
          <table className="table">
            <tbody>
              <tr>
                <th scope="row">Bogle et al. 2019 (USA)</th>
                <td>Dron s AED a dokovací stanicí 15 000 USD, údržba 20 % ceny ročně, životnost 4 roky. Personál neuvádí. {link('bogle2019')}</td>
              </tr>
              <tr>
                <th scope="row">Basu et al. 2026 (Skotsko, preprint)</th>
                <td>
                  Dron asi 50 000 £, nabíjecí infrastruktura asi 10 000 £, odpis 20 % ročně; údržba stanice 2 000 £ ročně; garáž u nového stanoviště asi 5 000 £
                  ročně; 5 úvazků operátorů po 40 000 £. {link('basu2026')}
                </td>
              </tr>
              <tr>
                <th scope="row">Röper et al. 2023 (Německo)</th>
                <td>
                  Síť 45 létajících AED pro venkovský okres: nejméně 1 451 160 € ročně, tj. asi 32 000 € na dron (náš přepočet; čteno z abstraktu).{' '}
                  {link('roper2023')}
                </td>
              </tr>
            </tbody>
          </table>
          <h3>Předpoklady výpočtu (aktuální hodnota · výchozí · podklad)</h3>
          <table className="table">
            <tbody>
              {(Object.keys(COST_INFO) as Exclude<keyof CostSettings, 'priceOverrideEur'>[]).map((k) => (
                <tr key={k}>
                  <th scope="row">{COST_INFO[k].label}</th>
                  <td className="nowrap">{costValue(k, config.costs[k])}</td>
                  <td className="muted nowrap">{costValue(k, DEFAULT_COSTS[k])}</td>
                  <td>
                    {COST_INFO[k].basis} {link(COST_INFO[k].sourceId)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">
            Vzorec: pořízení = Σ ceny strojů + základny × vybavení; ročně = pořízení ÷ doba odpisu + Σ ceny strojů × údržba + základny × provoz + drony ×
            AED + úvazky × náklady na úvazek + ostatní. Částky ze studií v librách a dolarech jsou převedeny na eura jen přibližně.
          </p>
        </>
      )}

      {page === 'limits' && (
        <table className="table">
          <tbody>
            {LIMITATIONS.map((l) => (
              <tr key={l.topic}>
                <th scope="row">{l.topic}</th>
                <td>{l.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {page === 'regulation' && (
        <>
          <p className="lead">
            Orientační shrnutí, nikoli právní rada. Ze zveřejněných specifikací strojů nevyplývá žádné schválení k letům mimo dohled ani k autonomnímu
            provozu v České republice; každý bod níže je třeba ověřit u příslušných úřadů.
          </p>
          <table className="table">
            <tbody>
              {REGULATION.map((r) => (
                <tr key={r.topic}>
                  <th scope="row">{r.topic}</th>
                  <td>
                    {r.text} {link(r.sourceId)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {page === 'data' && (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Vrstva</th>
                <th>V této verzi</th>
                <th>Zdroj a licence</th>
                <th>Omezení</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Terén</th>
                <td>
                  {world.dem.width} × {world.dem.height} buněk po asi 100 m, {world.manifest.dem.min}–{world.manifest.dem.max} m n. m.
                </td>
                <td>Mapzen/Tilezen terrain tiles (AWS Open Data); odvozeno ze SRTM a EU-DEM {link('terrain')}</td>
                <td>Model terénu bez vegetace a staveb; vrcholy vyhlazené</td>
              </tr>
              <tr>
                <th scope="row">Silnice</th>
                <td>
                  {num(world.roads.nodeLon.length)} křižovatek, {num(world.roads.edgeFrom.length)} úseků
                </td>
                <td>OpenStreetMap, ODbL {link('osm')}</td>
                <td>Bez rychlostních limitů, uzavírek a kvality povrchu; lesní cesty tříděny jen podle značek</td>
              </tr>
              <tr>
                <th scope="row">Sídla</th>
                <td>
                  {num(c.settlements)} míst, {num(c.settlementsWithPopulation)} se značkou počtu obyvatel ({num(c.populationTagged)} obyvatel)
                </td>
                <td>Body sídel z OpenStreetMap (počty obyvatel převzaty z ČSÚ v různých letech)</td>
                <td>Osady většinou bez značky; údaje měst mohou zahrnovat samostatně mapované části</td>
              </tr>
              <tr>
                <th scope="row">Turistické cíle</th>
                <td>
                  {c.peaks} vrcholů (z {c.peaksInOsm}: nad 900 m nebo se záznamem na Wikipedii/Wikidatech), {c.huts} chat, {c.viewpoints} vyhlídek a rozhleden,{' '}
                  {c.resorts} lyžařských areálů a lanovek
                </td>
                <td>OpenStreetMap</td>
                <td>Bez počtu návštěvníků; významnost míst se neváží</td>
              </tr>
              <tr>
                <th scope="row">Turistické trasy</th>
                <td>
                  {num(c.trailKm)} km úseků značených tras, vzorkovaných jako {num(c.trailPoints)} bodů (jeden asi na 1,5 km)
                </td>
                <td>Relace turistických tras v OpenStreetMap (značení KČT)</td>
                <td>Úsek sdílený více trasami se počítá jednou</td>
              </tr>
              <tr>
                <th scope="row">Základny ZZS</th>
                <td>{c.ambulanceStations}</td>
                <td>Seznam základen ZZS MSK (oficiální web) s adresami z registru Ministerstva zdravotnictví, geokódováno službou OSM Nominatim; doplněno z OSM</td>
                <td>Zlínský kraj neúplný (tři základny, z toho dvě z firemního katalogu a jedna z OSM)</td>
              </tr>
              <tr>
                <th scope="row">Horská služba, hasiči, nemocnice</th>
                <td>
                  {c.mountainRescue} stanic · {c.fireStations} hasičských stanic · {c.hospitals} nemocnic
                </td>
                <td>OpenStreetMap</td>
                <td>Obsazenost a sezonnost neznámé; hasičské stanice zahrnují i dobrovolné jednotky</td>
              </tr>
              <tr>
                <th scope="row">Veřejné AED</th>
                <td>{c.aeds}</td>
                <td>OpenStreetMap</td>
                <td>Zjevně neúplné; spolehlivý otevřený registr nenalezen</td>
              </tr>
              <tr>
                <th scope="row">Chráněná území</th>
                <td>{c.protectedAreas} (CHKO, NPR, NPP, PR, PP)</td>
                <td>OpenStreetMap</td>
                <td>Zonace CHKO (I.–IV.) není k dispozici; hranice zjednodušeny</td>
              </tr>
              <tr>
                <th scope="row">Letiště a heliporty</th>
                <td>{c.aerodromes}</td>
                <td>OpenStreetMap</td>
                <td>Slouží jen pro ilustrativní kruhy; nejde o oficiální zóny</td>
              </tr>
            </tbody>
          </table>
          <p className="hint">
            Data stažena {world.manifest.retrievedAt}, sestavena {world.manifest.builtAt}. Znovu je vytvoříte příkazem <code>npm run data</code>.
          </p>
          <h3>Nalezeno, ale nezapojeno</h3>
          <table className="table">
            <tbody>
              {NOT_INTEGRATED.map((n) => (
                <tr key={n.name}>
                  <th scope="row">
                    <a href={n.url} target="_blank" rel="noreferrer">
                      {n.name} ↗
                    </a>
                  </th>
                  <td>{n.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Modal>
  )
}
