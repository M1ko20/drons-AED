import { useApp } from '../../app/store'
import { DEFAULT_COMPARATORS } from '../../data/defaults'
import { Check, Field, Num, Section } from '../bits'

export function RespondersTab() {
  const config = useApp((s) => s.config)
  const world = useApp((s) => s.world)!
  const update = useApp((s) => s.update)
  const set = useApp((s) => s.set)
  const mapMode = useApp((s) => s.mapMode)
  const c = config.comparators
  const n = (kind: string) => world.places.facilities.filter((f) => f.kind === kind).length + config.extraStations.filter((s) => s.kind === kind).length
  const adding = (k: 'ambulance' | 'mountain-rescue') => mapMode.kind === 'add-station' && mapMode.station === k

  return (
    <>
      <p className="hint pad">
        Stávající složky se modelují každá zvlášť, aby s nimi šlo dron porovnat. AED doručený dronem nenahrazuje resuscitaci, posádku ZZS ani žádnou
        jinou složku – může jen zkrátit dobu, než je defibrilátor na místě.
        <button className="btn small ghost" onClick={() => update((cfg) => void (cfg.comparators = structuredClone(DEFAULT_COMPARATORS)))}>
          Obnovit výchozí
        </button>
      </p>

      {config.extraStations.length > 0 && (
        <Section title={`Ručně doplněná stanoviště (${config.extraStations.length})`}>
          {config.extraStations.map((s) => (
            <div key={s.id} className="zone-row two">
              <input className="title-input" value={s.name} aria-label="Název stanoviště" onChange={(e) => update((cfg) => void (cfg.extraStations.find((x) => x.id === s.id)!.name = e.target.value))} />
              <button className="icon-btn" aria-label={`Odebrat stanoviště ${s.name}`} onClick={() => update((cfg) => void (cfg.extraStations = cfg.extraStations.filter((x) => x.id !== s.id)))}>
                ✕
              </button>
            </div>
          ))}
        </Section>
      )}

      <Section title={`Pozemní posádka ZZS – ${n('ambulance')} základen`}>
        <Check checked={c.ground.enabled} onChange={(v) => update((cfg) => void (cfg.comparators.ground.enabled = v))}>
          Zahrnout do porovnání
        </Check>
        <p className="hint">
          Nejrychlejší jízda z nejbližší základny po silniční síti OpenStreetMap, poté pěšky od nejbližší silnice. Seznam základen: ZZS MSK (oficiální),
          tři základny ZZS Zlínského kraje (neúplné – jižní okraj území může vycházet pomaleji, než je skutečnost). Dostupnost posádek se nemodeluje.
        </p>
        <div className="grid2">
          <Field label="Výjezd posádky" info="Předpoklad: doba od vyrozumění posádky po rozjezd vozidla. Zákonný plánovací standard 20 minut se počítá až od tohoto okamžiku.">
            <Num value={c.ground.turnoutS} min={0} max={600} step={10} unit="s" onChange={(v) => update((cfg) => void (cfg.comparators.ground.turnoutS = v))} />
          </Field>
          <Field label="Rychlost jízdy" info="Násobitel předpokládaných rychlostí jízdy k zásahu podle třídy silnice (dálnice 120 … místní 40 … účelové 20 km/h). Jde o předpoklady, ne o naměřené dojezdové časy.">
            <Num value={c.ground.speedFactor} scale={100} min={50} max={150} step={5} unit="%" onChange={(v) => update((cfg) => void (cfg.comparators.ground.speedFactor = v))} />
          </Field>
        </div>
        <Check checked={c.ground.allowTracks} onChange={(v) => update((cfg) => void (cfg.comparators.ground.allowTracks = v))}>
          Sanitka smí na nezpevněné lesní cesty (12 km/h)
        </Check>
        <button className={'btn small' + (adding('ambulance') ? ' active' : '')} onClick={() => set({ mapMode: adding('ambulance') ? { kind: 'idle' } : { kind: 'add-station', station: 'ambulance' } })}>
          {adding('ambulance') ? 'Klikněte do mapy…' : '+ Doplnit chybějící základnu ZZS'}
        </button>
      </Section>

      <Section title={`Horská služba – ${n('mountain-rescue')} stanic`}>
        <Check checked={c.mountain.enabled} onChange={(v) => update((cfg) => void (cfg.comparators.mountain.enabled = v))}>
          Zahrnout do porovnání
        </Check>
        <p className="hint">
          Stanice Horské služby z OpenStreetMap; jízda po silnicích a lesních cestách, poté pěšky. Předpokládá se obsazená stanice a družstvo vybavené
          AED – ani jedno není ověřeno; některé stanice fungují jen sezonně.
        </p>
        <div className="grid2">
          <Field label="Předání výzvy stanici" info="Předpoklad: doba, než zdravotnické operační středisko vyrozumí Horskou službu.">
            <Num value={c.mountain.alertS} min={0} max={900} step={10} unit="s" onChange={(v) => update((cfg) => void (cfg.comparators.mountain.alertS = v))} />
          </Field>
          <Field label="Výjezd družstva" info="Předpoklad.">
            <Num value={c.mountain.turnoutS} min={0} max={1800} step={10} unit="s" onChange={(v) => update((cfg) => void (cfg.comparators.mountain.turnoutS = v))} />
          </Field>
          <Field label="Rychlost vozidla" info="Násobitel předpokládaných rychlostí (lesní cesty 18–25 km/h).">
            <Num value={c.mountain.speedFactor} scale={100} min={50} max={150} step={5} unit="%" onChange={(v) => update((cfg) => void (cfg.comparators.mountain.speedFactor = v))} />
          </Field>
        </div>
        <button className={'btn small' + (adding('mountain-rescue') ? ' active' : '')} onClick={() => set({ mapMode: adding('mountain-rescue') ? { kind: 'idle' } : { kind: 'add-station', station: 'mountain-rescue' } })}>
          {adding('mountain-rescue') ? 'Klikněte do mapy…' : '+ Doplnit stanici Horské služby'}
        </button>
      </Section>

      <Section title="Vrtulník LZS – ilustrativně">
        <Check checked={c.hems.enabled} onChange={(v) => update((cfg) => void (cfg.comparators.hems.enabled = v))}>
          Zahrnout do porovnání
        </Check>
        <p className="hint">
          {world.hemsBase ? world.hemsBase.name : 'V datech není základna LZS'}. Předpokládá se vrtulník na základně, volný a schopný přistát poblíž
          pacienta. Pro tuto základnu nejsou zveřejněny časy vzletu ani cestovní rychlost, takže každé číslo níže je předpoklad.
        </p>
        <div className="grid2">
          <Field label="Vzlet po výzvě (den)" info="Předpoklad: od výzvy po odlepení.">
            <Num value={c.hems.mobilizationS} min={0} max={1800} step={10} unit="s" onChange={(v) => update((cfg) => void (cfg.comparators.hems.mobilizationS = v))} />
          </Field>
          <Field label="Vzlet po výzvě (noc)" info="Předpoklad.">
            <Num value={c.hems.nightMobilizationS} min={0} max={3600} step={30} unit="s" onChange={(v) => update((cfg) => void (cfg.comparators.hems.nightMobilizationS = v))} />
          </Field>
          <Field label="Cestovní rychlost" info="Předpoklad pro vrtulník třídy EC135; vítr a stoupání se neuvažují.">
            <Num value={c.hems.cruiseKmh} min={120} max={280} step={10} unit="km/h" onChange={(v) => update((cfg) => void (cfg.comparators.hems.cruiseKmh = v))} />
          </Field>
          <Field label="Přistání a výstup" info="Předpoklad: přiblížení, přistání a výstup posádky.">
            <Num value={c.hems.landingS} min={0} max={900} step={10} unit="s" onChange={(v) => update((cfg) => void (cfg.comparators.hems.landingS = v))} />
          </Field>
          <Field label="Chůze od místa přistání" info="Předpoklad: vzdálenost od nejbližší použitelné plochy k pacientovi. V lese může být mnohem větší, nebo je nutný podvěs.">
            <Num value={c.hems.footDistanceM} min={0} max={3000} step={50} unit="m" onChange={(v) => update((cfg) => void (cfg.comparators.hems.footDistanceM = v))} />
          </Field>
          <Field label="Limit větru" info="Předpoklad.">
            <Num value={c.hems.maxWindMs} min={5} max={30} step={1} unit="m/s" onChange={(v) => update((cfg) => void (cfg.comparators.hems.maxWindMs = v))} />
          </Field>
        </div>
        <Check checked={c.hems.availableAtNight} onChange={(v) => update((cfg) => void (cfg.comparators.hems.availableAtNight = v))}>
          Létá v noci (ostravská základna je popisována jako nepřetržitá)
        </Check>
      </Section>

      <Section title={`Svědek doběhne pro veřejný AED – zmapováno ${world.places.aeds.length}`} defaultOpen={false}>
        <Check checked={c.publicAed.enabled} onChange={(v) => update((cfg) => void (cfg.comparators.publicAed.enabled = v))}>
          Zahrnout do porovnání
        </Check>
        <p className="hint">
          V rozsahu dat jsou v OpenStreetMap zmapovány jen {world.places.aeds.length} přístroje AED, takže toto porovnání podhodnocuje skutečnou
          dostupnost. Spolehlivý registr AED jako otevřená data nalezen nebyl.
        </p>
        <div className="grid2">
          <Field label="Tempo" info="Násobitel Toblerovy rychlosti chůze pro spěchajícího svědka.">
            <Num value={c.publicAed.speedFactor} scale={100} min={80} max={250} step={10} unit="%" onChange={(v) => update((cfg) => void (cfg.comparators.publicAed.speedFactor = v))} />
          </Field>
          <Field label="Okruh hledání">
            <Num value={c.publicAed.maxDistanceM} scale={0.001} min={0.2} max={10} step={0.5} unit="km" onChange={(v) => update((cfg) => void (cfg.comparators.publicAed.maxDistanceM = v))} />
          </Field>
        </div>
      </Section>

      <Section title="Předpoklady pro chůzi" defaultOpen={false}>
        <div className="grid2">
          <Field label="Zacházka po stezkách" info="Násobitel vzdušné vzdálenosti pro chůzi od vozidla k pacientovi.">
            <Num value={config.comparators.footDetour} min={1} max={2.5} step={0.1} unit="×" onChange={(v) => update((cfg) => void (cfg.comparators.footDetour = v))} />
          </Field>
          <Field label="Tempo posádky s vybavením" info="Násobitel Toblerovy rychlosti chůze pro posádku nesoucí defibrilátor a brašnu.">
            <Num value={config.comparators.crewLoadFactor} scale={100} min={40} max={120} step={5} unit="%" onChange={(v) => update((cfg) => void (cfg.comparators.crewLoadFactor = v))} />
          </Field>
        </div>
      </Section>
    </>
  )
}
