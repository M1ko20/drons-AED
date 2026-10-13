// Default values for every user-configurable assumption, with the reasoning behind each.
// User-facing texts are Czech.
import type { ComparatorSettings } from '../sim/comparators'
import type { CostSettings } from '../sim/cost'
import type { AedKit, OpsSettings, Weather } from '../sim/types'

export const DEFAULT_OPS: OpsSettings = {
  callProcessingS: 119,
  launchPrepS: 80,
  minAglM: 100,
  transitionAglM: 40,
  approachAglM: 30,
  reserveFraction: 0.2,
  returnPolicy: 'return',
  turnaroundMin: 10,
  landUnloadS: 45,
  releaseS: 10,
  winchHoverAglM: 30,
  retrievalS: 30,
  coldDeratePerC: 0.008,
  nightOps: true,
  modePreference: ['winch', 'low-drop', 'parachute', 'land'],
}

/** Explanation and basis of each operating assumption, shown next to the control. */
export const OPS_INFO: Record<keyof OpsSettings, { label: string; basis: string; sourceId?: string }> = {
  callProcessingS: {
    label: 'Příjem výzvy do vyrozumění',
    basis: 'Medián 1:59 od volání na tísňovou linku do výzvy ve švédské studii z reálného provozu. Český údaj se nepodařilo dohledat.',
    sourceId: 'schierbeck2023',
  },
  launchPrepS: {
    label: 'Příprava ke startu',
    basis: 'Medián 1:20 od výzvy po vzlet ve Švédsku včetně ústního povolení řízení letového provozu. Everdrone u typu E2 uvádí 15 s (tvrzení výrobce).',
    sourceId: 'schierbeck2023',
  },
  minAglM: {
    label: 'Výška letu nad terénem',
    basis: 'Předpoklad. 100 m drží trasu nad rovinou pod stropem 120 m otevřené kategorie; při přeletu údolí může profil strop překročit.',
    sourceId: 'ucl-faq',
  },
  transitionAglM: { label: 'Výška přechodu do dopředného letu', basis: 'Předpoklad: výška, do které stroj vystoupá svisle před dopředným letem.' },
  approachAglM: { label: 'Výška závěrečného visu', basis: 'Předpoklad: výška visu nad místem události (30 m jako při švédských doručeních navijákem).', sourceId: 'schierbeck2023' },
  reserveFraction: { label: 'Rezerva při přistání', basis: 'Předpoklad: po návratu musí zbýt 20 % kapacity baterie – stejnou rezervu používá Wingcopter ve své tabulce doletu.', sourceId: 'wingcopter-sheet' },
  returnPolicy: { label: 'Návrat dronu', basis: 'Let tam a zpět udrží stroj k dispozici; let jen tam zdvojnásobí dosah, ale dron zůstane na místě.' },
  turnaroundMin: { label: 'Příprava k dalšímu letu', basis: 'Předpoklad: výměna baterie, nová sada AED a kontrola před dalším startem.' },
  landUnloadS: { label: 'Přistání a vyložení', basis: 'Předpoklad.' },
  releaseS: { label: 'Uvolnění zásilky', basis: 'Předpoklad: čas na uvolnění zásilky poté, co je na zemi.' },
  winchHoverAglM: { label: 'Výška spouštění navijákem', basis: 'Ve švédské studii se AED spouštěl z 30 m; omezeno délkou lana daného stroje.', sourceId: 'schierbeck2023' },
  retrievalS: { label: 'Přinesení AED k pacientovi', basis: 'Švédští autoři odhadují 30 s; zásilka dopadla do 15 m od cíle v 91 % případů.', sourceId: 'schierbeck2023' },
  coldDeratePerC: { label: 'Úbytek kapacity v chladu', basis: 'Předpoklad: využitelná kapacita baterie klesá o 0,8 % na každý °C pod 15 °C (−10 °C → 80 %). Žádný výrobce křivku nezveřejňuje.' },
  nightOps: { label: 'Noční provoz', basis: 'Předpoklad. Ve Švédsku se po úpravě softwaru a osvětlení létalo i za tmy; v Česku by šlo o součást oprávnění k provozu.', sourceId: 'schierbeck2023' },
  modePreference: { label: 'Preferovaný způsob doručení', basis: 'Nejprve naviják, protože nepotřebuje plochu k přistání.' },
}

export const DEFAULT_KIT: AedKit & { aedId: string } = {
  aedId: 'heartsine-350p',
  aedKg: 1.1,
  enclosureKg: 0.3,
  mechanismKg: 0.4,
  extrasKg: 0,
}

export interface WeatherPreset {
  id: string
  name: string
  description: string
  weather: Weather
}

/** Illustrative scenarios, not climatology. */
export const WEATHER_PRESETS: WeatherPreset[] = [
  {
    id: 'calm',
    name: 'Klidný letní den',
    description: 'slabý vítr, sucho, teplo',
    weather: { windMs: 2, gustMs: 4, windFromDeg: 270, tempC: 18, precipitation: 'none', icing: false, night: false, roadSpeedFactor: 1 },
  },
  {
    id: 'breezy',
    name: 'Větrno a chladno',
    description: 'mírný západní vítr, sucho',
    weather: { windMs: 7, gustMs: 11, windFromDeg: 270, tempC: 8, precipitation: 'none', icing: false, night: false, roadSpeedFactor: 1 },
  },
  {
    id: 'ridge-wind',
    name: 'Silný vítr na hřebenech',
    description: 'jihozápadní 13 m/s, nárazy 19 m/s',
    weather: { windMs: 13, gustMs: 19, windFromDeg: 225, tempC: 5, precipitation: 'none', icing: false, night: false, roadSpeedFactor: 1 },
  },
  {
    id: 'rain',
    name: 'Trvalý déšť',
    description: 'silný déšť, mírný vítr',
    weather: { windMs: 6, gustMs: 10, windFromDeg: 290, tempC: 9, precipitation: 'heavy-rain', icing: false, night: false, roadSpeedFactor: 0.9 },
  },
  {
    id: 'winter',
    name: 'Zima, −8 °C',
    description: 'mráz a sucho, sníh na vedlejších silnicích',
    weather: { windMs: 5, gustMs: 9, windFromDeg: 315, tempC: -8, precipitation: 'none', icing: false, night: false, roadSpeedFactor: 0.75 },
  },
  {
    id: 'winter-snow',
    name: 'Sněžení s námrazou',
    description: 'sněžení, námraza ve výšce',
    weather: { windMs: 6, gustMs: 11, windFromDeg: 330, tempC: -3, precipitation: 'snow', icing: true, night: false, roadSpeedFactor: 0.6 },
  },
  {
    id: 'night',
    name: 'Jasná noc',
    description: 'klid, sucho, tma',
    weather: { windMs: 2, gustMs: 4, windFromDeg: 180, tempC: 10, precipitation: 'none', icing: false, night: true, roadSpeedFactor: 1 },
  },
]

export const DEFAULT_COMPARATORS: ComparatorSettings = {
  ground: { enabled: true, turnoutS: 90, speedFactor: 1, allowTracks: false },
  mountain: { enabled: true, alertS: 60, turnoutS: 180, speedFactor: 1 },
  hems: {
    enabled: true,
    mobilizationS: 180,
    nightMobilizationS: 600,
    cruiseKmh: 220,
    landingS: 120,
    footDistanceM: 150,
    availableAtNight: true,
    maxWindMs: 15,
  },
  publicAed: { enabled: false, speedFactor: 1.3, maxDistanceM: 3000 },
  footDetour: 1.3,
  crewLoadFactor: 0.85,
}

/**
 * Assumed rate of drone-eligible alerts, used only for the utilisation estimate.
 * Schierbeck 2023: 211 suspected-OHCA alerts in ~11 months for ~200,000 inhabitants during
 * limited operating hours → of the order of 115 per 100,000 inhabitants per year.
 */
export const DEFAULT_ALERTS_PER_100K = 115

/**
 * Cost assumptions. Only two aircraft have a published price; everything else here is a
 * planning assumption taken from published economic studies and converted to EUR.
 */
export const DEFAULT_COSTS: CostSettings = {
  lifeYears: 5,
  maintenanceShare: 0.1,
  stationCapexEur: 12_000,
  stationAnnualEur: 2_400,
  aedAnnualEur: 260,
  staffFte: 5,
  staffCostEur: 40_000,
  otherAnnualEur: 0,
  unknownPriceEur: 60_000,
  priceOverrideEur: {},
  eurCzk: 25,
}

export const COST_INFO: Record<Exclude<keyof CostSettings, 'priceOverrideEur'>, { label: string; basis: string; sourceId?: string }> = {
  lifeYears: {
    label: 'Doba odpisu',
    basis: 'Předpoklad: 5 let, tj. 20 % ročně jako ve skotské studii (Basu et al. 2026). Bogle et al. 2019 počítají se čtyřmi lety.',
    sourceId: 'basu2026',
  },
  maintenanceShare: {
    label: 'Roční údržba a baterie',
    basis: 'Předpoklad: 10 % pořizovací ceny stroje ročně. Publikované předpoklady se pohybují od asi 4 % (Basu et al. 2026: 2 000 £ na stanici) po 20 % (Bogle et al. 2019).',
    sourceId: 'bogle2019',
  },
  stationCapexEur: {
    label: 'Vybavení základny (hangár, nabíjení)',
    basis: 'Předpoklad: 12 000 € na základnu podle skotské studie (nabíjecí infrastruktura asi 10 000 £).',
    sourceId: 'basu2026',
  },
  stationAnnualEur: {
    label: 'Roční provoz základny',
    basis: 'Předpoklad: 2 400 € ročně (údržba stanice asi 2 000 £). U nového stanoviště mimo stávající budovu počítá skotská studie navíc asi 5 000 £ ročně za prostor.',
    sourceId: 'basu2026',
  },
  aedAnnualEur: {
    label: 'Roční náklady na jeden AED',
    basis: 'Předpoklad: 260 € ročně na přístroj (elektrody, baterie, kontroly). Vychází ze střední ze tří variant jednotkových nákladů stacionárního AED v německé studii (170, 263 a 405 €); studii jsme četli jen z abstraktu a hodnotu bereme jako roční.',
    sourceId: 'roper2023',
  },
  staffFte: {
    label: 'Dálkoví piloti / dohled (úvazky)',
    basis: 'Předpoklad: 5 plných úvazků, tolik je potřeba na jedno nepřetržitě obsazené pracoviště dohledu. Stejný počet používá skotská studie. Jde obvykle o největší položku.',
    sourceId: 'basu2026',
  },
  staffCostEur: {
    label: 'Roční náklady na jeden úvazek',
    basis: 'Předpoklad: 40 000 € ročně včetně odvodů (asi 1 mil. Kč). Skotská studie počítá se 40 000 £; českou hodnotu je třeba doplnit podle skutečných tarifů.',
    sourceId: 'basu2026',
  },
  otherAnnualEur: {
    label: 'Ostatní roční náklady',
    basis: 'Výchozí 0: pojištění, software a napojení na dispečink, datové spojení, výcvik a správní řízení nejsou zahrnuty, protože k nim nebyl nalezen žádný podklad. Doplňte vlastní odhad.',
  },
  unknownPriceEur: {
    label: 'Plánovací cena stroje bez zveřejněné ceny',
    basis: 'Předpoklad: 60 000 € za dron – přibližně hodnota, se kterou počítá skotská studie (asi 50 000 £ za dron). Skutečná cena velkých strojů s pevným křídlem může být násobně vyšší; u každého stroje ji lze přepsat vlastní nabídkou.',
    sourceId: 'basu2026',
  },
  eurCzk: {
    label: 'Kurz EUR/CZK',
    basis: 'Předpoklad pro přepočet na koruny; upravte podle aktuálního kurzu.',
  },
}
