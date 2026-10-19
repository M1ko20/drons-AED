# Simulátor pokrytí drony s AED – Beskydy

Interaktivní plánovací prototyp, který odhaduje, o kolik by flotila dronů nesoucích automatizované
externí defibrilátory (AED) mohla v Moravskoslezských Beskydech zkrátit dobu, než se defibrilátor
dostane k pacientovi – v porovnání s pozemní posádkou ZZS, Horskou službou a vrtulníkem LZS.
Ukazuje také pořizovací cenu a roční náklady zvolené flotily.

> **Co tento nástroj není.** Není to ověřený systém pro vysílání záchranných složek a jeho
> simulované časy nejsou dokladem skutečných dojezdových časů ani klinického přínosu. AED
> doručený dronem nenahrazuje resuscitaci, zdravotnické záchranáře ani volání na tísňovou linku
> (155 / 112). Odhad nákladů není rozpočet.

Aplikace je celá v češtině. Technické podklady v `docs/` zůstávají v angličtině.

## Spuštění

Je potřeba Node 20 nebo novější.

```bash
npm install
npm run dev          # http://localhost:5173
```

```bash
npm test             # 109 jednotkových a ověřovacích testů
npm run build        # kontrola typů a produkční sestavení do dist/
npm run preview      # spuštění produkčního sestavení
```

Geografická data jsou přibalena ve složce `public/data/` (asi 8 MB), takže aplikace běží i bez
připojení; z internetu se načítá jen volitelná podkladová mapa (OpenFreeMap, bez API klíče).
Obnovení dat z OpenStreetMap a výškových dlaždic:

```bash
npm run data         # stáhne do data/raw/ (s mezipamětí) a znovu sestaví public/data/
```

Volitelná automatická kontrola v prohlížeči (vyžaduje Chrome nebo Chromium; cestu lze zadat
proměnnou `CHROME_PATH`) při běžícím vývojovém serveru na portu 5183:

```bash
npx vite --port 5183 --strictPort &
npm run check:browser        # uloží snímky do screenshots/ a vypíše chyby konzole
```

## Co aplikace umí

- **Umístit událost** kliknutím do mapy. Model vybere nejrychlejší proveditelný dron, vykreslí
  jeho trasu i trasy sanitky, Horské služby a vrtulníku a rozepíše každou časovou složku včetně
  jejího původu (studie, předpoklad, model).
- **Přehrát skutečné případy** (záložka Případy): úmrtí na zástavu oběhu v Beskydech podle zpráv
  Horské služby a médií, s počasím toho dne (reanalýza ERA5 přes Open-Meteo), a dvě modelové
  situace podle událostí z polských Beskyd přenesené na české území. Odkaz `?pripad=<id>` případ
  rovnou otevře a přehraje; seznam je v `src/data/cases.ts`.
- **Přehrát** zásah na mapě; při více událostech je vidět, jak si je drony rozdělí.
- **Nastavit flotilu**: základny na stávajících stanovištích nebo kdekoli v mapě (lze je
  přetahovat), počet dronů, 13 dohledaných typů strojů, stav mimo provoz, přeřazení mezi
  základnami, cestovní rychlost v mezích údajů výrobce, hmotnost sady AED, zdržení při startu
  a doručení, rezervy, přípravu k dalšímu letu a způsob návratu; volitelně let i pod minimální teplotou udávanou výrobcem (předpoklad podle
  sdělení o praxi ve Slovinsku, písemný zdroj zatím nedohledán).
- **Zobrazit ceny a náklady**: cenu každého použitého stroje, jednorázové pořízení flotily
  a roční náklady rozepsané na odpisy, údržbu, provoz základen, AED a personál – v korunách
  i eurech. Je vidět v záložce Flotila, v dolní liště statistik, v tabulce letounů, v tiskovém
  souhrnu, v exportu i v porovnání scénářů.
- **Měnit podmínky**: sedm scénářů počasí nebo vlastní vítr, nárazy, teplotu, srážky, námrazu
  a noc; ilustrativní bezletové zóny, které drony oblétají.
- **Upravit stávající složky** zvlášť: výjezdové časy, rychlosti, vzlet a přistání vrtulníku,
  chybějící stanoviště.
- **Pokrytí**: časový rastr, který sleduje terén, vítr a dolet (není to kružnice), pokrytí více
  než 1 100 sledovaných míst podle kategorií, pokrytí obyvatel, libovolný cílový čas.
- **Hledat místa pro základny** heuristikou (postupné přidávání a záměna) mezi kandidátními
  stanovišti, s přínosem každé další základny, a výsledek použít jako flotilu.
- **Porovnat letouny** v jedné tabulce se zdroji, vyznačením chybějících údajů, cenou a zkouškou
  ve stejném scénáři.
- **Ukládat a porovnávat scénáře** (v prohlížeči), **exportovat** CSV a JSON a vytisknout
  souhrn.

Připraveno je šest vzorových scénářů: malá flotila, výchozí stav bez dronů, rozšířená flotila,
zimní počasí, mrazuvzdorné multikoptéry u Horské služby a porovnání různých typů strojů.

## Jak číst výsledky

V rozhraní i ve všech exportech se rozlišují tři druhy informací:

| Značka | Význam |
|---|---|
| `VÝROBCE` `STUDIE` `ÚŘAD` `2. ZDROJ` | vnější data: údaj výrobce, recenzovaná studie, úřad, druhotný zdroj |
| `PŘEDPOKLAD` | nastavitelný předpoklad (podklad je v nápovědě ⓘ) |
| `MODEL` | vypočteno simulací |

Neznámé údaje jsou označeny jako *nezveřejněno*; model pak použije opatrnou, označenou náhradní
hodnotu, nebo stroj odmítne simulovat.

## Ceny a náklady

Výrobci ceny většinou nezveřejňují. Dohledat se podařilo jen ceníky evropských prodejců:

| Stroj | Cena | Co obsahuje |
|---|---|---|
| DJI Matrice 400 | 10 636 € | dron, 1 baterie, nabíjecí stanice, ovladač; není uvedeno, zda s DPH; bez navijáku |
| DJI FlyCart 30 | 24 498 € bez DPH | dron, 2 baterie, nabíjecí stanice, naviják, nákladový box, ovladač |
| Wingcopter 198, RigiTech Eiger, Matternet, Avy | nezveřejněno | cena na vyžádání |
| Everdrone, Zipline | nezveřejněno | poskytují se jako služba |

U strojů bez ceny se počítá s **plánovací hodnotou 60 000 €** (přibližně předpoklad skotské
studie Basu et al. 2026), dokud v záložce Flotila nezadáte vlastní cenu z nabídky. Aplikace na
takový odhad upozorňuje značkou ⚠.

Roční náklady = pořízení ÷ doba odpisu + ceny strojů × podíl údržby + základny × roční provoz
+ drony × roční náklady na AED + úvazky × náklady na úvazek + ostatní. Výchozí předpoklady
(odpis 5 let, údržba 10 %, 5 úvazků dálkových pilotů po 40 000 €, 12 000 € na vybavení základny)
vycházejí ze studií Bogle et al. 2019, Basu et al. 2026 a Röper et al. 2023 a všechny lze změnit.
Nezahrnuje pojištění, software, výcvik, správní řízení ani DPH. Největší položkou bývá personál.

## Struktura projektu

```
src/sim/        jádro simulace – čistý TypeScript bez rozhraní a bez vstupů/výstupů
  profile.ts      letový profil podle terénu          mission.ts   podmínky, energie, časové složky
  wind.ts         větrný trojúhelník                   dispatch.ts  více dronů, více událostí
  energy.ts       dolet, rezerva, vliv chladu          coverage.ts  rastry a sledovaná místa
  roads.ts        silniční graf, Dijkstra              optimize.ts  heuristika umístění základen
  comparators.ts  ZZS, Horská služba, LZS              zones.ts     oblet bezletových kruhů
  cost.ts         náklady flotily
  __tests__/      jednotkové testy, ručně spočtené případy, porovnání se zveřejněnými časy
src/data/       dohledané letouny a ceny, registr zdrojů, výchozí hodnoty, texty omezení
src/app/        konfigurace, vzorové scénáře, propojení, statistiky, exporty, formátování, stav
src/worker/     pokrytí a optimalizace mimo hlavní vlákno
src/ui/         komponenty React (mapa MapLibre, záložky, výsledky, statistiky, dialogy)
scripts/        stažení a sestavení dat, kontroly v prohlížeči
public/data/    přibalený terén, silniční graf, místa, trasy, chráněná území
docs/           RESEARCH.md (zdroje a zjištění), MODEL.md (rovnice a předpoklady) – anglicky
```

Použité technologie: TypeScript, React 18, Vite, MapLibre GL JS, Zustand, Vitest. Bez serverové
části.

## Model ve zkratce

Čas, než je AED u pacienta = příjem výzvy + čekání na volný dron + příprava ke startu + vzlet
+ let + klesání + doručení + přinesení svědkem. Rychlost vůči zemi vychází z větrného
trojúhelníku; výškový profil je nejnižší dráha, která v mezích stoupací a klesací rychlosti stroje
drží odstup nad terénem; let je proveditelný jen tehdy, když to dovolí nosnost, limity počasí,
dostup, způsob doručení, zóny a rozpočet doletu (tam, zpět, stoupání, vis, rezerva, chlad).
Podrobnosti a rovnice: v aplikaci pod **Zdroje a předpoklady** a v [`docs/MODEL.md`](docs/MODEL.md).

## Zdroje

Všechny zdroje s daty, druhem studie a způsobem, jakým byly čteny, jsou v aplikaci (**Zdroje
a předpoklady**) a v [`docs/RESEARCH.md`](docs/RESEARCH.md). Hlavní z nich:

- Schierbeck et al., *Lancet Digital Health* 2023 – skutečná doručení AED drony ve Švédsku.
- Fischer et al., *Resuscitation Plus* 2023 – terénní simulace v horách na rakousko-slovinské
  hranici.
- van Veelen et al., *Am J Emerg Med* 2024 a *Resuscitation Plus* 2026 – randomizované simulace
  v Jižním Tyrolsku a v alpském lyžařském středisku.
- Datové listy a stránky výrobců (Wingcopter, RigiTech, DJI, Everdrone, Matternet, Zipline),
  ceníky prodejců DJI.
- Bogle et al. 2019, Basu et al. 2026 (preprint), Röper et al. 2023 – nákladové předpoklady.
- Pokyny Úřadu pro civilní letectví, nařízení (EU) 2019/947, zákon č. 374/2011 Sb.
- OpenStreetMap (ODbL), výškové dlaždice Mapzen, seznam základen ZZS MSK, registr Ministerstva
  zdravotnictví.

## Známá omezení

- Terén má buňky asi 100 m a neobsahuje stromy, stožáry ani lana; trasy jsou přímky.
- Jeden vítr a jedna teplota pro celou oblast; bez oblačnosti, mlhy a turbulence.
- Nejsou načteny oficiální zeměpisné zóny; kruhy kolem letišť jsou ilustrativní. Nic zde
  neukazuje, že by lety mimo dohled byly povoleny.
- Příjem výzvy a příprava ke startu vycházejí ze švédských mediánů.
- Rychlosti jízdy jsou předpoklady podle třídy silnice; sanitky se berou jako volné na nejbližší
  základně; seznam základen Zlínského kraje je neúplný.
- Sledovaná místa jsou místa, ne historické události; návštěvníci se nepočítají; počty obyvatel
  pocházejí ze značek OpenStreetMap.
- V OpenStreetMap jsou pro oblast zmapovány jen čtyři veřejné AED.
- Ceny většiny strojů nejsou zveřejněny; roční náklady jsou odhad z předpokladů zahraničních
  studií, ne rozpočet.
- Neodhaduje se přežití ani počet zachráněných životů.

## Otevřené otázky

1. Který slovinský program stál u zrodu myšlenky? Žádný se nepodařilo dohledat; viz
   `docs/RESEARCH.md`.
2. Povolil by ÚCL doručování navijákem mimo dohled nad CHKO Beskydy, v noci a nad 120 m tam, kde
   trasy přelétají údolí? Co by vyžadoval orgán ochrany přírody?
3. Může zdravotnické operační středisko vyslat dron automaticky a jak rychle?
4. Naměřené dojezdové časy ZZS a Horské služby a historická místa událostí.
5. Obsazenost stanic Horské služby v sezoně a jejich vybavení AED.
6. Skutečné výkony kandidátních strojů se sadou AED v chladném a větrném horském počasí.
7. Skutečné ceny strojů a provozu – je třeba vyžádat nabídky výrobců a provozovatelů.

## Doporučené další kroky

1. Nahradit předpoklady daty: historie událostí a dojezdové časy ZZS, registr AED, populační síť
   ČSÚ, oficiální zóny od ŘLP, nabídky výrobců.
2. Použít oficiální metrový model terénu a povrchu (ČÚZK DMR 5G / DMP 1G) pro posouzení odstupu
   a výběr míst k přistání.
3. Doplnit klimatologii počasí (jak často by který stroj mohl v typickém roce letět) a vítr
   závislý na terénu.
4. Simulace poptávky metodou Monte Carlo včetně návštěvnosti pro realistické vytížení a souběhy.
5. Projít předpoklady se ZZS MSK, Horskou službou Beskydy a ÚCL; poté zkušební lety na jednom
   koridoru pro kalibraci zdržení při startu, stoupavosti a doručení navijákem.
