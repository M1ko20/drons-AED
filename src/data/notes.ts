// Plain-language statements shown in the app and in the printed report (Czech).

export const DISCLAIMER =
  'Plánovací prototyp. Nejde o ověřený systém pro vysílání záchranných složek; simulované časy nejsou dokladem skutečných dojezdových časů ani klinického přínosu. AED doručený dronem nenahrazuje resuscitaci, zdravotnické záchranáře ani volání na tísňovou linku (155 / 112).'

export const MODEL_STEPS: { title: string; text: string }[] = [
  {
    title: '1 · Čas, než je AED u pacienta',
    text: 't = příjem výzvy + (čekání na volný dron) + příprava ke startu + svislý vzlet + let + klesání + doručení + přinesení svědkem. Zdržení jsou nastavitelné předpoklady s výchozími hodnotami ze švédské studie z reálného provozu; letové fáze se počítají.',
  },
  {
    title: '2 · Rychlost vůči zemi (větrný trojúhelník)',
    text: 'boční složka = W·sin θ, podélná = −W·cos θ, rychlost vůči zemi = √(V² − boční²) + podélná, kde θ je úhel mezi směrem větru a tratí. Úsek nelze letět, pokud boční vítr převyšuje rychlost letu nebo vůči zemi zbývá méně než 2 m/s. Pro celé území platí jeden vítr.',
  },
  {
    title: '3 · Letový profil podle terénu',
    text: 'Trať je přímka (nebo přímé úseky kolem vynucených bezletových kruhů). Stroj po ní letí nejnižší výškou, která drží zvolený odstup nad stometrovým modelem terénu a nepřekračuje poměr stoupací, resp. klesací rychlosti k rychlosti vůči zemi. Kde terén stoupá rychleji, než stroj dokáže stoupat za letu, nabere chybějící výšku kroužením nad základnou při cestovním výkonu. Čas letu = vzdálenost ÷ rychlost vůči zemi.',
  },
  {
    title: '4 · Využitelný dolet',
    text: 'využitelný = zveřejněný dolet při hmotnosti sady ÷ (1 − rezerva už obsažená ve zveřejněném údaji) × teplotní faktor × (1 − rezerva při přistání). Potřebný = vzdušná vzdálenost tam + zpět + stoupání (nastoupané metry × ekvivalent letu) + vis (minuty × poměr výkonu ve visu × vzdálenost za minutu letu). Let je proveditelný jen tehdy, je-li potřebný ≤ využitelný.',
  },
  {
    title: '5 · Podmínky „letět / neletět“',
    text: 'Hmotnost sady ≤ nosnost; průměrný vítr a nárazy ≤ limity; teplota v provozním rozsahu; srážky v mezích odolnosti (bez údaje = žádný déšť); námraza uzemní vše; trasa pod dostupem; způsob doručení, který stroj má a místo dovoluje; cíl mimo vynucené zóny.',
  },
  {
    title: '6 · Vysílání více dronů',
    text: 'Výzvy se řeší v pořadí, v jakém přišly. Každá dostane dron, který dopraví AED k pacientovi nejdříve, včetně případného čekání na stroje, které ještě letí nebo se připravují; při shodě rozhoduje větší rezerva doletu. Vyslaný dron je obsazen, dokud se nevrátí a není znovu připraven.',
  },
  {
    title: '7 · Pozemní posádka ZZS a Horská služba',
    text: 'Dijkstrův algoritmus nejkratšího času po silničním grafu OpenStreetMap ze všech stanovišť současně, s předpokládanou rychlostí jízdy k zásahu podle třídy silnice, a poté chůze od nejbližší dosažitelné silnice k pacientovi podle Toblerovy funkce v terénu. Dostupnost posádek se nemodeluje.',
  },
  {
    title: '8 · Vrtulník (ilustrativně)',
    text: 'příjem výzvy + vzlet po výzvě + vzdušná vzdálenost ÷ cestovní rychlost + přistání + chůze od místa přistání. Kromě polohy základny je každé číslo předpoklad.',
  },
  {
    title: '9 · Pokrytí a výběr základen',
    text: 'Stejný model letu se spustí ke každé buňce 300 m a ke každému sledovanému místu. Základny se vybírají postupným přidáváním a následnou záměnou stanovišť nad maticí časů kandidát × místo – heuristikou, která bývá blízko nejlepšímu řešení, ale není to prokázané optimum.',
  },
  {
    title: '10 · Náklady flotily',
    text: 'pořízení = Σ ceny strojů + základny × vybavení základny. Ročně = pořízení ÷ doba odpisu + Σ ceny strojů × podíl údržby + základny × roční provoz + drony × roční náklady na AED + úvazky × náklady na úvazek + ostatní. Zveřejněnou cenu mají jen dva stroje; u ostatních se použije plánovací hodnota nebo vámi zadaná cena.',
  },
]

export const LIMITATIONS: { topic: string; text: string }[] = [
  { topic: 'Terén a překážky', text: 'Model terénu má buňky asi 100 m a neobsahuje stromy, budovy, stožáry, lana lanovek ani elektrická vedení. Odstup v modelu není odstupem od překážek; výšky vrcholů jsou vyhlazeny až o 20 m.' },
  { topic: 'Trasy', text: 'Trasy jsou přímky s výškovým profilem. Skutečné trasy by vedly schválenými koridory, vyhýbaly by se obydleným místům a nezúčastněným osobám a mohly by být delší.' },
  { topic: 'Počasí', text: 'Jedna rychlost a směr větru a jedna teplota pro celou oblast. Vítr na hřebenech, turbulence, základna oblačnosti, mlha, dohlednost a námraza ve výšce jsou zjednodušeny na přepínače. Ve Švédsku počasí zabránilo 26 % výzev, které neskončily vzletem.' },
  { topic: 'Vzdušný prostor a předpisy', text: 'Nejsou načteny oficiální zeměpisné zóny pro bezpilotní systémy. Kruhy kolem letišť jsou ilustrativní. Let mimo dohled pilota (BVLOS) vyžaduje oprávnění k provozu ve specifické kategorii; nic zde neukazuje, že by bylo uděleno.' },
  { topic: 'Zdržení při startu', text: 'Příjem výzvy a příprava ke startu vycházejí ze švédských mediánů. Napojení na české dispečinky, postupy povolování a personální zajištění mohou být rychlejší i výrazně pomalejší; v rakouské terénní simulaci dron startoval v mediánu 5–6 minut po volání.' },
  { topic: 'Doručení', text: 'Místo je buď „volná plocha“, nebo „bez plochy k přistání“. Zápoj korun, sklon, chování svědků, přesnost polohy volajícího a pokrytí mobilním signálem (v rakouské studii ztraceno v 5 z 29 pokusů) se nemodelují. Spuštění do lesa může být nemožné.' },
  { topic: 'Energie', text: 'Zveřejněné dolety vycházejí z různých, často neuvedených zkušebních podmínek. Náklady na stoupání, vis a chlad jsou předpoklady odvozené z několika zveřejněných čísel, ne z letových zkoušek.' },
  { topic: 'Pozemní zásah', text: 'Rychlosti jízdy jsou předpoklady podle třídy silnice; provoz, uzavírky a sezonní stav silnic vyjadřuje jediný koeficient. Sanitky se berou jako volné na nejbližší základně. Seznam základen Zlínského kraje je neúplný.' },
  { topic: 'Poptávka', text: 'Sledovaná místa jsou místa, ne události: nepoužívají se historická data o srdečních zástavách, návštěvníci se nepočítají a počty obyvatel pocházejí ze značek OpenStreetMap u bodů sídel.' },
  { topic: 'Veřejné AED', text: 'V OpenStreetMap je pro tuto oblast zmapováno jen několik veřejných AED; otevřený a spolehlivý registr se nepodařilo najít.' },
  { topic: 'Náklady', text: 'Zveřejněnou cenu mají jen DJI Matrice 400 a FlyCart 30 (ceníky prodejců). Ostatní ceny jsou plánovací hodnota nebo váš odhad. Roční náklady vycházejí z předpokladů zahraničních studií, nezahrnují pojištění, software, výcvik ani povolovací řízení a nejsou rozpočtem.' },
  { topic: 'Výsledky léčby', text: 'Nástroj odhaduje pouze časy doručení. Neodhaduje ochotu a schopnost svědků AED použít, čas do prvního výboje, přežití ani počet zachráněných životů.' },
]

export const REGULATION: { topic: string; text: string; sourceId?: string }[] = [
  { topic: 'Kategorie provozu', text: 'Doručení AED mimo dohled pilota, se spuštěním nebo shozem zásilky, nelze provádět v otevřené kategorii (jen na dohled, nejvýše 120 m nad terénem, bez shazování materiálu, bez autonomního letu). Spadá do specifické kategorie podle nařízení (EU) 2019/947.', sourceId: 'ucl-faq' },
  { topic: 'Cesta k oprávnění', text: 'Oprávnění k provozu od Úřadu pro civilní letectví na základě posouzení rizik SORA nebo předdefinovaného posouzení PDRA, případně provoz s osvědčením LUC. Standardní scénář STS-02 dovoluje BVLOS jen do 2 km s pozorovateli a pro tento účel nestačí.', sourceId: 'ucl-faq' },
  { topic: 'Zeměpisné zóny', text: 'Celostátní omezený prostor LKR10-UAS měl být od září 2025 nahrazen tematickými zónami LKR311–320 (letiště, heliporty, hustě osídlené oblasti, silnice, železnice, elektrická vedení, vodní zdroje, chráněná území, objekty obrany). Ověřte aktuální opatření a aplikaci DronView; konečné přijetí se nám nepodařilo potvrdit.', sourceId: 'cz-zones' },
  { topic: 'Ochrana přírody', text: 'Většina oblasti leží v CHKO Beskydy, na několika hřebenech jsou národní přírodní rezervace. Lety v I.–III. zóně CHKO a v rezervacích vyžadují souhlas orgánu ochrany přírody (AOPK ČR / krajský úřad); IV. zóna je vyňata. Trvalý souhlas pro záchranné lety by bylo třeba vyjednat.', sourceId: 'cz-protected' },
  { topic: 'Řízený vzdušný prostor', text: 'Severozápadně od oblasti leží CTR letiště Ostrava-Mošnov (LKMT); neřízená letiště (např. Frýdlant nad Ostravicí, LKFR) a nemocniční heliporty mají vlastní zóny. Ve Švédsku potřeboval každý let ústní povolení řízení letového provozu a jeho nedostupnost zabránila 22 % neuskutečněných letů.', sourceId: 'schierbeck2023' },
  { topic: 'Postavení záchranných složek', text: 'Zda by krajská ZZS, hasiči nebo Horská služba mohli takové drony provozovat podle zvláštních ustanovení pro státní nebo záchranný provoz, je právní otázka pro ÚCL a Ministerstvo dopravy. Tento nástroj na ni neodpovídá.' },
]

export const OPEN_QUESTIONS: string[] = [
  'Který slovinský program stál u zrodu myšlenky? Provozovanou slovinskou službu doručování AED drony jsme nenašli; nejbližší publikovanou prací je rakouská terénní studie v Bodentalu v Korutanech u slovinských hranic (Fischer et al. 2023).',
  'Povolil by ÚCL doručování navijákem mimo dohled nad CHKO Beskydy, v noci a nad 120 m tam, kde trasa přelétá údolí?',
  'Může krajské zdravotnické operační středisko vyslat dron automaticky při podezření na srdeční zástavu a jak dlouho by to trvalo?',
  'Jaké jsou naměřené dojezdové časy ZZS a Horské služby a kde v oblasti k událostem historicky docházelo?',
  'Které stanice Horské služby jsou kdy obsazeny a mají jejich družstva AED?',
  'Čeho kandidátní stroje se sadou AED skutečně dosáhnou v chladném a větrném horském počasí?',
  'Kolik stroje a jejich provoz skutečně stojí? Výrobci (kromě DJI) ceny nezveřejňují – je třeba si vyžádat nabídky.',
]
