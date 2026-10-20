import { CATEGORY_LABEL } from '../app/config'
import { czk, eur, num, pct, plural } from '../app/format'
import { fleetCounts, REASON_LABEL, scenarioCost } from '../app/metrics'
import { useApp } from '../app/store'
import { DISCLAIMER } from '../data/notes'
import { formatDuration } from '../sim/stats'
import { Info } from './bits'

function Stat({ label, value, sub, info, flag, onClick, extra }: { label: string; value: string; sub?: string; info: string; flag?: boolean; onClick?: () => void; extra?: boolean }) {
  return (
    <div className={'stat' + (onClick ? ' clickable' : '') + (extra ? ' extra' : '')} onClick={onClick}>
      <span className="stat-label">
        {label}
        <Info text={info} />
      </span>
      <span className={'stat-value' + (flag ? ' flag' : '')}>{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  )
}

export function Dashboard() {
  const config = useApp((s) => s.config)
  const metrics = useApp((s) => s.metrics)
  const analysis = useApp((s) => s.analysis)
  const set = useApp((s) => s.set)
  const open = useApp((s) => s.statsOpen)
  const fleet = fleetCounts(config)
  const cost = scenarioCost(config)
  const rate = config.costs.eurCzk
  const m = metrics
  const T = config.analysis.targetMin
  const busy = analysis.status === 'running' || analysis.stale

  return (
    <div className={'dashboard' + (busy ? ' busy' : '') + (open ? ' open' : '')} aria-busy={busy}>
      <div className="dash-status" aria-live="polite">
        <span className="dash-title">Celé území · pokrytí do {T} min</span>
        {analysis.status === 'error' ? (
          <span className="status bad">✕ Výpočet selhal</span>
        ) : busy || !m ? (
          <span className="spinner-label">
            <i className="spinner" /> Přepočítávám pokrytí… {analysis.status === 'running' ? `${Math.round(analysis.progress * 100)} %` : ''}
          </span>
        ) : (
          <span className="muted">simulováno za {analysis.result ? `${num(analysis.result.elapsedMs / 1000, 1)} s` : '—'}</span>
        )}
        <span className="dash-disclaimer" title={DISCLAIMER}>
          Simulované odhady – nejde o dispečerský systém ani o doklad klinického přínosu
        </span>
        <button className="link-btn text dash-toggle" aria-expanded={open} onClick={() => set({ statsOpen: !open })}>
          {open ? 'Jen hlavní ▾' : 'Všechny ukazatele ▴'}
        </button>
      </div>
      <div className="stats">
        <Stat
          label="Flotila"
          extra
          value={plural(fleet.dronesReady, 'dron', 'drony', 'dronů')}
          sub={`${plural(fleet.basesOperational, 'funkční základna', 'funkční základny', 'funkčních základen')}${fleet.drones > fleet.dronesReady ? ` · ${fleet.drones - fleet.dronesReady} mimo provoz` : ''}`}
          info="Drony označené jako připravené a základny s alespoň jedním připraveným dronem. Nastavuje se v záložce Flotila."
        />
        <Stat
          label="Roční náklady flotily"
          extra
          value={cost.drones ? czk(cost.annualEur, rate) : '—'}
          sub={cost.drones ? `pořízení ${czk(cost.purchaseEur, rate)}${cost.hasPlaceholder ? ' · ⚠ odhad ceny' : ''}` : 'žádné drony'}
          info={
            cost.drones
              ? `Odhad, nikoli rozpočet. Ročně ${eur(cost.annualEur)}: odpisy strojů ${eur(cost.annual.aircraftWriteOffEur)}, odpisy vybavení základen ${eur(cost.annual.stationWriteOffEur)}, údržba ${eur(cost.annual.maintenanceEur)}, provoz základen ${eur(cost.annual.stationsEur)}, AED ${eur(cost.annual.aedEur)}, personál ${eur(cost.annual.staffEur)}, ostatní ${eur(cost.annual.otherEur)}. Jednorázové pořízení ${eur(cost.purchaseEur)}. ${cost.hasPlaceholder ? 'U některých strojů výrobce cenu nezveřejňuje – použita plánovací hodnota; zadejte vlastní cenu v záložce Flotila. ' : ''}Kliknutím otevřete podrobnosti.`
              : 'Scénář nemá žádné drony, proto nevznikají žádné náklady na flotilu.'
          }
          onClick={() => set({ tab: 'fleet', sidebarOpen: true })}
        />
        {m && (
          <>
            <Stat
              label={`Sledovaná místa do ${T} min`}
              value={pct(m.locationsWithin, m.locations)}
              sub={`${num(m.locationsWithin)} z ${num(m.locations)}`}
              info={`Podíl vybraných sledovaných míst (${m.byCategory.map((c) => `${CATEGORY_LABEL[c.category]} ${c.within}/${c.total}`).join('; ')}), kam dron dopraví AED k pacientovi v cílovém čase. Jde o pokrytí míst – ne obyvatel ani plochy. Předpokládá, že nejbližší vhodný dron je volný.`}
            />
            <Stat
              label={`Obyvatelé do ${T} min`}
              value={m.populationTagged ? pct(m.populationWithin, m.populationTagged) : '—'}
              sub={m.populationTagged ? `${num(m.populationWithin)} z ${num(m.populationTagged)}` : 'sídla nejsou vybrána'}
              info={`Počet obyvatel ${num(m.settlementsWithPopulation)} sídel, která mají v OpenStreetMap značku s počtem obyvatel, počítaný v bodě sídla. Osady bez značky a návštěvníci se nepočítají; údaje měst mohou zahrnovat i místní části.`}
            />
            <Stat
              label={`Plocha do ${T} min`}
          extra
              value={pct(m.areaWithin, m.areaCells)}
              sub={`${num(m.areaWithin * m.cellKm2)} z ${num(m.areaCells * m.cellKm2)} km² · ${config.analysis.fieldSite === 'open' ? 'přistání možné' : 'jen naviják/shoz'}`}
              info={`Podíl buněk 300 m v zájmovém území dosažitelných v cílovém čase za předpokladu, že ${config.analysis.fieldSite === 'open' ? 'všude lze přistát' : 'nikde nelze přistát'}. Jde jen o plošné pokrytí – neříká nic o tom, kde jsou lidé.`}
            />
            <Stat
              label="Čas doručení dronem"
              value={isFinite(m.medianS) ? formatDuration(m.medianS) : '—'}
              sub={isFinite(m.p90S) ? `medián · 90. percentil ${formatDuration(m.p90S)}` : 'žádné obsloužitelné místo'}
              info={`Čas od volání po AED u pacienta přes ${num(m.locationsServable)} obsloužitelných sledovaných míst. ${num(m.locationsUnserved)} neobsloužitelných míst do těchto čísel nevstupuje a uvádí se zvlášť.`}
            />
            <Stat
              label="Dron dříve než ZZS"
              value={m.comparedWithGround ? pct(m.droneFaster, m.comparedWithGround) : '—'}
              sub={
                m.comparedWithGround
                  ? `${num(m.droneFaster)} z ${num(m.comparedWithGround)} · průměrně o ${formatDuration(Math.abs(m.meanGainS))} ${m.meanGainS >= 0 ? 'dříve' : 'později'}`
                  : config.comparators.ground.enabled
                    ? 'dron neobslouží žádné místo'
                    : 'posádka ZZS není zapnuta'
              }
              info={`Sledovaná místa, kde modelované doručení dronem předchází modelovanému příchodu pozemní posádky ZZS, z míst dosažitelných oběma. Průměr je čas posádky minus čas dronu přes tatáž místa. Obě strany jsou simulované; u ZZS se předpokládá volná posádka na nejbližší základně. Medián modelovaného času ZZS: ${formatDuration(m.medianGroundS)}.`}
              flag={m.comparedWithGround > 0 && m.meanGainS < 0}
            />
            <Stat
              label="Nelze obsloužit"
          extra
              value={num(m.locationsUnserved)}
              sub={m.unservedReasons.length ? m.unservedReasons.slice(0, 2).map((r) => `${REASON_LABEL[r.reason]} ${r.count}`).join(' · ') : 'všechna místa obsloužitelná'}
              info="Sledovaná místa, která při současném počasí, doletu, nákladu a způsobu doručení neobslouží žádný dron flotily, s nejčastějšími důvody."
              flag={m.locationsUnserved > 0}
            />
            <Stat
              label="Záložní pokrytí"
          extra
              value={pct(m.locationsTwoBases, m.locations)}
              sub="dosažitelné ze ≥ 2 základen"
              info="Podíl sledovaných míst, která dokážou obsloužit alespoň dvě různé základny (ne nutně v cílovém čase). Ukazuje odolnost, když je nejbližší dron obsazen."
            />
            <Stat
              label="Vytížení flotily"
          extra
              value={m.alertsPerYear > 0 && isFinite(m.meanCycleMin) ? `${num(m.utilisation * 100, 2)} %` : '—'}
              sub={m.alertsPerYear > 0 && isFinite(m.meanCycleMin) ? `všechny drony obsazeny u ${num(m.pAllBusy * 100, 3)} % výzev` : 'vyžaduje sídla a flotilu'}
              info={`Hrubý odhad. Předpokládá ${config.analysis.alertsPer100k} výzev vhodných pro dron na 100 000 obyvatel ročně (řádově podle švédské studie: 211 výzev na asi 200 000 lidí za 11 měsíců) → ${num(m.alertsPerYear)} výzev ročně; průměrný cyklus letu ${isFinite(m.meanCycleMin) ? num(m.meanCycleMin) : '—'} min včetně přípravy; Erlang B se všemi připravenými drony dohromady. Výzvy spojené s návštěvníky nejsou zahrnuty.`}
            />
          </>
        )}
      </div>
    </div>
  )
}
