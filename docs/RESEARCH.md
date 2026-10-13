# Research notes

> The application's interface is in Czech; this research note is kept in English.

Retrieved 13 October 2026. The machine-readable version of everything below is in
`src/data/sources.ts` (source registry) and `src/data/drones.ts` (aircraft dataset); the app
shows both under **Sources & assumptions** and **Aircraft**.

Each finding is labelled with what kind of evidence it is: **deployment** (real emergencies),
**experiment** (field simulation with real aircraft), **model** (computer simulation or
optimisation), **claim** (manufacturer), **authority** (regulator or legislation).

## 1. Existing AED-drone work

| Finding | Evidence | Source |
|---|---|---|
| Sweden, Gothenburg region, Apr 2021 – May 2022: 5 drones (modified DJI Matrice 600 Pro, operated by Everdrone) covering ~200,000 people. 211 suspected-OHCA alerts → 72 take-offs → 58 deliveries. Drone before ambulance in 37 of 55 (67 %), median benefit 3:14. | deployment, prospective observational | Schierbeck et al., *Lancet Digit Health* 2023;5:e862–71 (full text read) |
| Same study, phase medians: call → dispatch 1:59; dispatch → take-off 1:20; take-off → delivery 3:17 over a median 1.8 km at 48 km/h; call → delivery 7:11. AED winched from 30 m; within 15 m of the target in 91 %. | deployment | same |
| Same study, why 139 alerts had no take-off: weather 26 %, ATC closure 22 %, dispatch cancellation 19 %, no-delivery zones 17 %, technical 11 %, darkness 5 %. Limits: no rain, wind < 8 m/s. | deployment | same |
| First patient defibrillated with a drone-delivered AED before ambulance arrival (Trollhättan, Dec 2021). | deployment, case report | Schierbeck et al., *NEJM* 2022;386:1953–54 (abstract only) |
| **Mountain terrain, Austria–Slovenia border** (Bodental, Carinthia): octocopter (AIR6 AIR8) with a ZOLL AED 3 on a rope, released ~1 m above ground. Delivered in 29/29 runs; flight time median 5:20 (1:35–8:19); call → launch median 297 s (paramedics) / 370 s (laypersons); delivery → first shock 79 s / 140 s; first shock at 12:15 ± 2:03 and 14:04 ± 2:10 min. Wind limit 30 km/h; one afternoon lost to weather; phone connection lost in 5 runs. | experiment | Fischer et al., *Resusc Plus* 2023;14:100384 (full text read) |
| South Tyrol, non-urban tourist area, randomised crossover simulation (36 runs): time to defibrillation 2.2 min by drone vs 12.4 min fetching a public AED vs 18.2 min simulated HEMS. | experiment | van Veelen et al., *Am J Emerg Med* 2024;86:5–10 (abstract) |
| Alpine ski resort at 2,275 m: drone 5.6 min vs ski patrol 6.7 min vs simulated HEMS 15.3 min; 6 of 36 runs cancelled for snowfall. | experiment | van Veelen et al., *Resusc Plus* 2026;29:101360 (abstract) |
| Integer programme placing drone bases in Alpine terrain. | model | Wankmüller et al., *OR Spectrum* 2020;42:785–814 (abstract) |
| Czech pilot (Drony SIT / Plzeň Region / ZZS PK): about a year of simulations planned; one exercise had a drone on scene in 4 min, 11 min before an ambulance from the same place. Aircraft and BVLOS status not stated. | press report | Seznam Zprávy, 18 Feb 2025 |

**The Slovenian programme.** We could not identify an operational Slovenian AED-drone service
or the organisation behind one. Searches in English and Slovenian turned up mountain-rescue
search drones, a postal-drone trial and the municipal AED network, but no AED delivery
programme. The closest published work is the Bodental study above, run by Graz and Klagenfurt
researchers on the Austrian side of the border. This remains an open question — if you know
which programme prompted the idea, the source registry should be updated.

## 2. Aircraft

Full values, conditions and per-field evidence are in `src/data/drones.ts`. Summary:

| Aircraft | Type | Cruise | Range (conditions) | Payload | Delivery | Wind / temp / rain | Assessment |
|---|---|---|---|---|---|---|---|
| Wingcopter 198 | tilt-rotor VTOL | 28 m/s default, 40 max | 75–110 km one way by payload; no wind, sea level, 15 °C, 20 % reserve (2021 sheet) | 4.7 kg (website) / 5 kg (sheet) | landing, **winch** | 15 m/s mean, 20 gusts; 0…45 °C; no heavy rain or icing | Only long-range candidate with a documented winch; 0 °C limit |
| RigiTech Eiger | VTOL fixed-wing | 29 m/s, 35 max | 80–100 km one way by payload; conditions not stated | 3 kg | landing on a marked pad; drop needs a pad | 12–15 m/s; 0…40 °C; no heavy rain or icing | Cannot deliver to unprepared sites; 0 °C limit |
| DJI Matrice 400 | multirotor | 17 m/s (range-test speed), 25 max | 49 km to empty at 17 m/s, light payload | 6 kg | landing; winches only third-party | 12 m/s; −20…50 °C; IP55 | Cold- and rain-tolerant; no manufacturer winch |
| DJI FlyCart 30 | heavy multirotor | 15 m/s (test), 20 max | 28 km empty / 16 km at 30 kg | 30 kg | landing; winch needs ≥ 5 kg | 12 m/s; −20…45 °C; IP55 | 65 kg aircraft for a 2 kg load; winch unusable for an AED kit |
| Everdrone E2 | multirotor | 23 m/s | 8 km service radius | 3 kg incl. sensors | winch (as in the Swedish study) | 10 m/s; heavy rain; temp not published | Only system with real-emergency results; short radius; a service, not a product |
| Everdrone E3 (2026) | multirotor | > 80 km/h | not published (60 min endurance) | 4.5 kg | not described | not published | Insufficient data — not simulated as feasible |
| Matternet M3 | multirotor | 20 m/s | 32 km (16 km radius) | 5 kg | dock landing, tether drop | 10/15 m/s; −20…50 °C; rain not rated | Urban dock system, short radius |
| Matternet M2 | multirotor | 10 m/s | 20 km with 1 kg | 2 kg | station landing | 8/12 m/s | Legacy, superseded |
| Zipline P1 / P2 | fixed-wing / VTOL | 27 / 31 m/s | 193 km round trip / 16 km radius | 1.8 / 3.6 kg | parachute / tether | not published | Closed services, no European operation found |
| Avy Aera 3 | VTOL fixed-wing | ~25 m/s | ~100 km | 3 kg | landing | 12.5 m/s | Secondary sources only |
| AIR6 AIR8 | octocopter | not published (90 km/h max) | not published | 10 kg | rope release | 30 km/h in study | Research platform; cannot be simulated |

Things worth knowing that a headline spec hides:

- **Published ranges are not comparable.** Wingcopter's table already holds back 20 % of the
  battery; DJI's is flown to empty; RigiTech states no conditions; Everdrone and Matternet quote
  a service radius. The model converts each to a common "still-air distance to empty" before
  applying one reserve.
- **Hover is expensive for winged VTOLs.** The Wingcopter flies 90 min on the wing but 15 min as
  a multicopter, and its own table shows 10–15 km less range with one winch drop.
- **Climb rate, not cruise speed, limits a winged aircraft in the mountains.** Climbing ~950 m
  to Lysá hora at 3 m/s takes over five minutes whatever the cruise speed.
- **Temperature.** Both long-range VTOLs are limited to 0 °C and above.
- **Prices** are published only for the two DJI aircraft (dealer lists); see the cost table below.

AED masses: Schiller FRED easyport ≈ 0.8 kg as flown in Sweden; HeartSine samaritan PAD 350P
1.1 kg (IP56); Philips HeartStart FRx 1.5 kg (IP55); ZOLL AED 3 ≈ 2.5 kg (used in Bodental;
retailer figure). Enclosure and release mechanism masses are assumptions.

### Prices and running costs

| Finding | Evidence | Source |
|---|---|---|
| DJI Matrice 400: €10,636 for aircraft, one battery, battery station and controller (VAT status not stated); US list $10,450 without batteries | dealer price list | droon.ee; US dealers |
| DJI FlyCart 30: €24,498 net (€30,133 gross) for aircraft, two batteries, charger, winch, cargo box and controller | dealer price list | megadron.pl |
| Wingcopter 198: price not disclosed (€5,000 deposit at launch); aggregator estimates of $20,000–100,000 contradict each other | press | startbase.com |
| RigiTech, Matternet, Avy: no public price. Everdrone, Zipline: sold as a service, contract prices not public | — | — |
| Drone with AED and dock $15,000; maintenance 20 % of price a year; 4-year life | model assumption | Bogle et al., *N C Med J* 2019 (full text read) |
| Drone ≈ £50k, charging infrastructure ≈ £10k, 20 % yearly write-off; £2k station maintenance; £5k garage at new sites; 5 FTE operators at £40k | model assumption | Basu et al., arXiv 2026 (preprint; cost section read) |
| 45 airborne AEDs for a rural German district: at least €1,451,160 a year (≈ €32,000 per drone) | model | Röper et al., *Eur J Health Econ* 2023 (abstract) |

## 3. Regulation (orientation, not legal advice)

- BVLOS delivery with a winch or release is outside the **open** category (VLOS, ≤ 120 m above
  terrain, no dropping, no autonomous flight) → **specific** category under Regulation (EU)
  2019/947: operational authorisation from ÚCL via SORA or a PDRA, or a LUC. STS-02 (BVLOS
  ≤ 2 km with observers) is not enough. Source: ÚCL FAQ.
- Czech geographic zones: the nationwide LKR10-UAS area was proposed to be replaced from
  September 2025 by thematic zones LKR311–320 (aerodromes, heliports, densely populated areas,
  roads, railways, power lines, water sources, protected landscape areas, defence sites).
  We read the proposal page, not a confirmed final text. Authoritative zones: ŘLP DronView.
- Protected nature: most of the area is CHKO Beskydy. Flights in CHKO zones I–III and in
  reserves need the nature authority's consent (AOPK ČR / regional office); zone IV is exempt.
- HEMS: Kryštof 05, Ostrava-Zábřeh, EC135 T2+, described as available 24 h; operator since 2021
  reported as Air Transport Europe. No mobilisation time or radius is published.
- Ground EMS: Act 374/2011 § 5 requires base placement so that every municipality is reachable
  within 20 minutes of driving, counted from the crew receiving the order — a planning standard.

Questions for the authorities are listed in the app and in the README.

## 4. Geographic data

| Layer | Source | Licence | Used as | Limitation |
|---|---|---|---|---|
| Terrain | Mapzen/Tilezen terrain tiles (AWS Open Data), zoom 10 | open, attribution | flight profiles, walking, shading | ~100 m cells, no vegetation or structures |
| Roads | OpenStreetMap via Overpass | ODbL | ambulance and rescue routing | no speed limits or closures |
| Settlements, population | OSM place nodes with `population` | ODbL | study locations, resident coverage | 218 of 343 places tagged; copied from ČSÚ at various dates |
| Summits, huts, viewpoints, ski areas | OSM | ODbL | study locations | no visitor numbers |
| Hiking trails | OSM hiking route relations | ODbL | map layer, trail sample points | one point per ~1.5 km |
| Ambulance stations | ZZS MSK website (list, crews) + Ministry of Health register (addresses), geocoded with Nominatim; OSM | public information / ODbL | ground comparator, candidate sites | Zlín Region incomplete |
| Mountain rescue, fire, hospitals, heliports | OSM | ODbL | comparators, candidate sites, zones | staffing unknown |
| Public AEDs | OSM `emergency=defibrillator` | ODbL | map layer, optional comparator | only 4 mapped — clearly incomplete |
| Protected areas | OSM `boundary=protected_area` | ODbL | map layer, study area (CHKO) | no I–IV zoning |
| Background map | OpenFreeMap vector tiles | free, no key | optional online background | not needed to run |

Identified but not integrated: ČÚZK DMR 5G / DMP 1G (official terrain and surface models),
ČSÚ population grid, ŘLP DronView zones, AOPK zoning, the regional EMS AED registry and
incident history. Each would replace an approximation listed in `docs/MODEL.md`.

## 5. Architecture decided from the research

- **Static single-page app, no backend.** All inputs are small enough to bundle (≈ 8 MB);
  results are deterministic and computed in the browser, bulk runs in a Web Worker.
- **MapLibre GL JS** with an optional keyless vector background and an offline fallback
  rendered from the bundled terrain and roads. No proprietary map API.
- **Simulation core separate from UI** (`src/sim`, no DOM or data-loading code), so it is
  unit-testable and reusable, e.g. for a later Monte-Carlo or real-incident replay.
- **Evidence carried in the data model**: every aircraft value is `{value, evidence, sourceId,
  note}`; unknown values are `null` and the model either uses a labelled fallback or refuses to
  simulate.
