// Real incidents from news reports, replayable in the simulator. User-facing texts are Czech.
// Weather: hourly ERA5 reanalysis via the Open-Meteo archive API for the case position, the hour
// nearest the emergency call (retrieved 2026-10-19). Grid cells are 9–25 km, so ridge winds may
// have been stronger than the value used.
import type { LngLat, SiteType, Weather } from '../sim/types'

export interface CaseSource {
  label: string
  url: string
}

export interface RealCase {
  id: string
  /** 'real' happened at this place; 'analog' is a real event from the Polish Beskids replayed on a similar Czech spot */
  kind: 'real' | 'analog'
  title: string
  dateLabel: string
  place: string
  person: string
  summary: string
  /** what the reports say happened, in order */
  reality: string[]
  whyDrone: string[]
  caveats: string[]
  position: LngLat
  site: SiteType
  weather: Weather
  weatherNote: string
  /** set when the helicopter could not fly that day; it is then switched off in the scenario */
  hemsUnavailable?: string
  sources: CaseSource[]
}

export interface SkippedCase {
  title: string
  reason: string
  sources: CaseSource[]
}

const ERA5 = 'Open-Meteo, historická data (reanalýza ERA5, buňka sítě 9–25 km)'

export const CASES: RealCase[] = [
  {
    id: 'medvedi-skaly-2021',
    kind: 'real',
    title: 'Turistka u Medvědích skal na cestě na Lysou horu',
    dateLabel: '26. září 2021, před polednem',
    place: 'Stezka na Lysou horu u Medvědích skal',
    person: 'žena, 56 let',
    summary: 'Při výstupu ji náhle přepadla dušnost, zkolabovala a přestala dýchat. Doprovod a kolemjdoucí ji začali hned oživovat.',
    reality: [
      'Doprovod a kolemjdoucí zahájili laickou resuscitaci.',
      'Horská služba dorazila jako první z profesionálů a přiložila AED.',
      'Vrtulník nemohl přistát, lékaře spouštěl palubním jeřábem z výšky asi 50 m.',
      'Rozšířená resuscitace trvala přes hodinu. Srdce se už nerozběhlo, lékař konstatoval smrt.',
    ],
    whyDrone: [
      'Kolaps viděli svědci a resuscitace začala hned. Chyběl jen defibrilátor, a to je přesně situace, pro kterou je AED z dronu.',
      'Počasí bylo ideální: téměř bezvětří, 19 °C, sucho.',
      'Vrtulník musel lékaře spouštět jeřábem. Dron s navijákem plochu k přistání nepotřebuje.',
    ],
    caveats: [
      'Zprávy neuvádějí, kolik minut uplynulo od kolapsu do přiložení AED.',
      'Poloha je přibližná: značená trasa nejblíže vyhlídce Medvědí skála v OpenStreetMap.',
    ],
    position: [18.40161, 49.55048],
    site: 'no-landing',
    weather: { windMs: 1, gustMs: 4.3, windFromDeg: 198, tempC: 19.4, precipitation: 'none', icing: false, night: false, roadSpeedFactor: 1 },
    weatherNote: `${ERA5}, 12:00 SELČ: polojasno, beze srážek.`,
    sources: [
      { label: 'Polar: Turistka při výšlapu na Lysou horu zkolabovala…', url: 'https://polar.cz/zpravy/moravskoslezsky-kraj/cely-ms-kraj/11000027672/turistka-pri-vyslapu-na-lysou-horu-zkolabovala-a-pres-pomoc-zachranaru-zemrela' },
      { label: 'Blesk: Lékaře k ní vysazovali z vrtulníku jeřábem', url: 'https://www.blesk.cz/clanek/regiony-ostrava/691249/turistka-v-beskydech-zkolabovala-lekare-k-ni-vysazovali-z-vrtulniku-jerabem-zemrela.html' },
    ],
  },
  {
    id: 'kozlovice-2024',
    kind: 'real',
    title: 'Cyklista v lese nad Kozlovicemi',
    dateLabel: '19. června 2024, ráno (ohlášeno před 9:30)',
    place: 'Lesnatý terén nad Kozlovicemi, svahy Ondřejníku',
    person: 'muž, 68 let, na cyklovýletu',
    summary: 'Během vyjížďky se v lese nad obcí náhle zhroutil. Svědci mu hned poskytli první pomoc.',
    reality: [
      'Svědci poskytli první pomoc, pak pokračovala hlídka Horské služby a policie.',
      'Vrtulník v lese nemohl přistát, lékařku spustil palubním jeřábem.',
      'Rozšířená resuscitace včetně zajištění dýchacích cest a podání léků do kostní dřeně. Oběh se obnovit nepodařilo.',
    ],
    whyDrone: [
      'Zhroucení viděli svědci a hned pomáhali.',
      'Suché letní ráno, vítr kolem 6 m/s s nárazy do 15 m/s: v limitech Wingcopteru 198 (15 a 20 m/s).',
      'V lese není kde přistát. Vrtulník musel použít jeřáb, dron by AED spustil navijákem.',
    ],
    caveats: [
      'Zpráva nezmiňuje, zda a kdy byl použit AED.',
      'Poloha je přibližná: lesní úsek zelené trasy na svahu Ondřejníku nad Kozlovicemi.',
      'Příčinu měla určit pitva; podle zprávy šlo pravděpodobně o přirozené úmrtí.',
    ],
    position: [18.29061, 49.574],
    site: 'no-landing',
    weather: { windMs: 6, gustMs: 14.5, windFromDeg: 173, tempC: 23.4, precipitation: 'none', icing: false, night: false, roadSpeedFactor: 1 },
    weatherNote: `${ERA5}, 9:00 SELČ: jasno, beze srážek.`,
    sources: [{ label: 'Polar: 68letý muž zemřel v Beskydech během cyklistického výletu', url: 'https://polar.cz/zpravy/moravskoslezsky-kraj/cely-ms-kraj/11000043629/68lety-muz-zemrel-v-beskydech-behem-cyklistickeho-vyletu' }],
  },
  {
    id: 'malenovice-2023',
    kind: 'real',
    title: 'Senior u kola na sjezdovce v Malenovicích',
    dateLabel: '8. srpna 2023, krátce před 16:30',
    place: 'Sjezdovka nad Malenovicemi',
    person: 'muž, senior (věk neuveden), cyklista',
    summary: 'Kolemjdoucí ho našli ležet u kola se zástavou oběhu. Operátoři je po telefonu vedli k resuscitaci.',
    reality: [
      'Operátoři vedli svědky k resuscitaci po telefonu.',
      'Vyrazila posádka z Třince a tým z Ostravy. Kvůli terénu lékaře spouštěl vrtulník jeřábem.',
      'Po desítkách minut se srdeční činnost obnovila, pak se oběh znovu zastavil a muž zemřel.',
    ],
    whyDrone: [
      'Srdce se podařilo nastartovat i po desítkách minut. S dřívější defibrilací byla šance větší.',
      'Svědci už resuscitovali, chyběl jen defibrilátor.',
      'Vítr kolem 5 m/s a slabé mrholení: Wingcopter 198 smí létat ve slabém dešti.',
    ],
    caveats: [
      'Muže našli, kolaps nikdo neviděl. Nevíme, jak dlouho tam ležel.',
      'Poloha je přibližná: žlutá trasa u sjezdovky nad Malenovicemi.',
    ],
    position: [18.40573, 49.57273],
    site: 'no-landing',
    weather: { windMs: 5.4, gustMs: 11.6, windFromDeg: 236, tempC: 16, precipitation: 'light-rain', icing: false, night: false, roadSpeedFactor: 1 },
    weatherNote: `${ERA5}, 16:00 SELČ: oblačno, slabé mrholení (0,1 mm za hodinu), po 16. hodině už sucho. Pro jistotu počítáno se slabým deštěm.`,
    sources: [
      { label: 'TN Nova: Černé úterý pro Beskydy, na kolech zemřeli dva senioři', url: 'https://tn.nova.cz/zpravodajstvi/clanek/517153-cerne-utery-pro-beskydy-na-kolech-zemreli-dva-seniori' },
      { label: 'Blesk: Senioři si vyjeli na kole, domů se už nevrátí', url: 'https://www.blesk.cz/clanek/regiony-ostrava/750092/tragedie-v-beskydech-seniori-si-vyjeli-na-kole-domu-se-uz-nevrati.html' },
    ],
  },
  {
    id: 'analogie-pilsko-knehyne',
    kind: 'analog',
    title: 'Mladý turista na hřebeni v mlze (podle Pilska, 2026)',
    dateLabel: 'počasí z 5. července 2026, poledne (den skutečné události)',
    place: 'Modelová situace: hřebenová stezka u Kněhyně',
    person: 'muž, 32 let, na túře s přáteli',
    summary:
      'Skutečná událost: na Pilsku v Oravských Beskydech se 32letý turista na túře s přáteli náhle zhroutil a došlo k zástavě oběhu. Kvůli mlze a dešti nemohl letět vrtulník. Zde je stejná situace přenesená na hřeben u Kněhyně.',
    reality: [
      'Přátelé hned volali pomoc.',
      'Vrtulník kvůli počasí nevzlétl, záchranáři museli k muži dojít pěšky.',
      'Resuscitace trvala asi 1,5 hodiny, muž zemřel.',
    ],
    whyDrone: [
      'Mladý muž, kolaps při svědcích.',
      'Vrtulník vyřadila mlha a déšť. Mrholení a vítr kolem 4 m/s jsou v limitech Wingcopteru 198, který smí do slabého deště.',
      'I na českých hřebenech ležela ten den nízká oblačnost (pokrytí 100 % v poledne).',
    ],
    caveats: [
      'Nejde o skutečnou událost u Kněhyně. Polské Beskydy jsou mimo rozsah práce, proto je situace přenesena na české území.',
      'Model mlhu ani nízkou oblačnost nezohledňuje. U dronu mimo dohled pilota by záleželo na podmínkách oprávnění.',
      'Počasí je z českého místa ve stejný den, ne z Pilska.',
    ],
    position: [18.3092, 49.49655],
    site: 'no-landing',
    weather: { windMs: 4.2, gustMs: 11.3, windFromDeg: 277, tempC: 12.8, precipitation: 'light-rain', icing: false, night: false, roadSpeedFactor: 1 },
    weatherNote: `${ERA5}, 12:00 SELČ u Kněhyně: zataženo nízkou oblačností, mrholení 0,3 mm za hodinu.`,
    hemsUnavailable: 'Vrtulník v ten den kvůli mlze a dešti nevzlétl (skutečnost na Pilsku), proto je v modelu vypnutý.',
    sources: [
      { label: 'RMF24: Tragedia w Beskidach. Turysta zmarł w rejonie Pilska', url: 'https://www.rmf24.pl/regiony/slaskie/news-tragedia-w-beskidach-turysta-zmarl-w-rejonie-pilska,nIdn,1008773' },
      { label: 'Super Express: 32-letni turysta zmarł mimo reanimacji', url: 'https://www.se.pl/slask/tragedia-w-beskidach-32-letni-turysta-zginal-na-szlaku-aa-CLpX-gUtV-TZ6d.html' },
    ],
  },
  {
    id: 'analogie-babia-smrk',
    kind: 'analog',
    title: 'Turista na strmé stezce pod vrcholem (podle Babí hory, 2023)',
    dateLabel: 'počasí z 20. června 2023, 13:00 (den skutečné události)',
    place: 'Modelová situace: strmá červená stezka severně pod vrcholem Smrku',
    person: 'muž (věk neuveden)',
    summary:
      'Skutečná událost: na Babí hoře na strmé stezce Perć Akademików došlo u turisty k náhlé zástavě oběhu. Svědci ho hned oživovali, záchranář GOPR musel defibrilátor vynést pěšky. Zde je stejná situace na strmé stezce pod Smrkem.',
    reality: [
      'Hlášení přišlo kolem 13:00 z těžko přístupného místa ve vrcholové části.',
      'Svědci prováděli resuscitaci. Záchranář GOPR vyběhl nahoru s resuscitačním batohem a připojil defibrilátor.',
      'Chvíli poté přiletěl vrtulník, záchranáři se spustili na laně a muže převezli do nemocnice, kde zemřel.',
    ],
    whyDrone: [
      'Resuscitace svědků běžela, defibrilátor ale musel nahoru pěšky.',
      'Klidný letní den, vítr kolem 1 m/s.',
    ],
    caveats: [
      'Nejde o skutečnou událost na Smrku. Polské Beskydy jsou mimo rozsah práce, proto je situace přenesena na české území.',
      'Zdroje se rozcházejí v tom, do které nemocnice byl muž převezen (Nowy Targ nebo Nowy Sącz).',
      'Počasí je z českého místa ve stejný den, ne z Babí hory.',
    ],
    position: [18.37089, 49.51178],
    site: 'no-landing',
    weather: { windMs: 1.3, gustMs: 5.3, windFromDeg: 257, tempC: 21.8, precipitation: 'light-rain', icing: false, night: false, roadSpeedFactor: 1 },
    weatherNote: `${ERA5}, 13:00 SELČ: polojasno, místy mrholení (0,1 mm za hodinu). Pro jistotu počítáno se slabým deštěm.`,
    sources: [
      { label: 'mp.pl: Beskidy – GOPR udzielił pomocy turystom z NZK', url: 'https://www.mp.pl/ratownictwo/aktualnosci/326089,beskidy-gopr-udzielil-pomocy-turystom-z-nzk' },
      { label: 'ESKA Kraków: Turysta zmarł na Babiej Górze', url: 'https://krakow.eska.pl/malopolska-babia-gora-nie-zyje-turysta-interweniowal-topr-aa-dLZD-1Afn-j4dp.html' },
    ],
  },
]

/** Cases we found but left out, with the reason, so the selection can be checked. */
export const SKIPPED_CASES: SkippedCase[] = [
  {
    title: 'Lyžař na sjezdovce Bílá, 24. 2. 2017 (přežil)',
    reason:
      'Vrtulník nevzlétl kvůli větru. Podle reanalýzy byly v poledne nárazy 21–22 m/s, tedy nad limitem všech modelovaných dronů. Dron by také zůstal na zemi. Muže zachránila Horská služba, která ho během pár minut defibrilovala.',
    sources: [{ label: 'TN Nova', url: 'https://tn.nova.cz/zpravodajstvi/clanek/345365-na-svahu-lezel-muz-v-bezvedomi-vrtulnik-pro-nej-nemohl-letet' }],
  },
  {
    title: 'Muž pod vrcholem Girové, 16. 4. 2020',
    reason:
      'Běžec ho ráno našel silně podchlazeného a bez reakce. Kolaps nikdo neviděl a muž v lese zřejmě ležel dlouho, takže by dron přiletěl pozdě. Teplota byla kolem 0 °C: s předpokladem letu v mrazu by dron vzlétl.',
    sources: [{ label: 'Blesk', url: 'https://www.blesk.cz/clanek/regiony-ostrava/640918/zahadna-smrt-v-beskydech-bezec-nasel-v-lese-umirajiciho-seniora-zachranari-ho-uz-neozivili.html' }],
  },
  {
    title: 'Klimczok, 22. 2. 2025, a Babí hora, 14. 8. 2026 (polské Beskydy)',
    reason:
      'Mimo rozsah práce. Na Klimczoku muže našli kolemjdoucí a kolaps nikdo neviděl. U Babí hory (český turista, 54 let) zprávy neuvádějí průběh. Do aplikace proto převedeny nejsou.',
    sources: [
      { label: 'PAP (Klimczok)', url: 'https://www.pap.pl/aktualnosci/tragedia-w-beskidach-nie-udalo-sie-uratowac-zycia-turysty-na-klimczoku' },
      { label: 'CNN Prima (Babí hora)', url: 'https://cnn.iprima.cz/smrt-ceskeho-turisty-v-beskydech-nepomohl-ani-vrtulnik-519396' },
    ],
  },
]

export const CASE_BY_ID: Record<string, RealCase> = Object.fromEntries(CASES.map((c) => [c.id, c]))
