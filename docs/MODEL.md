# Simulation model

> The application's interface is in Czech; this technical note is kept in English.

Everything here is implemented in `src/sim/` and covered by the tests in
`src/sim/__tests__/`. The model is deterministic: the same inputs always give the same output.

The quantity reported everywhere is **the time from the emergency call until the AED is beside
the patient** — not flight time, and not time of first shock.

## 1. Time components

```
t = call handling            assumption, default 119 s (Swedish median call → dispatch)
  + wait for a free drone    computed; 0 if a drone is idle
  + launch preparation       assumption, default 80 s (Swedish median dispatch → take-off)
  + take-off climb           computed
  + cruise                   computed
  + final descent            computed
  + delivery                 assumption per method (winch: height ÷ winch speed + release)
  + bystander retrieval      assumption, default 30 s
```

## 2. Ground speed

Wind is one uniform vector. For a leg with track bearing `trk` and wind from `wd` at speed `W`:

```
θ     = wd − trk
cross = W·sin θ          along = −W·cos θ
gs    = sqrt(V² − cross²) + along
```

The leg is not flyable if `|cross| ≥ V` or `gs < 2 m/s`.

## 3. Flight profile (`profile.ts`)

**Approximation, shown in the UI:** the ground track is a straight line, or straight segments
around enforced keep-out circles. Along it, sampled every 100 m (250 m for bulk runs), the
aircraft flies the lowest altitude `h(s)` such that

1. `h(s) ≥ terrain(s) + clearance(s)`, where clearance ramps from the transition height after
   take-off and to the approach height before arrival, capped at the cruise clearance;
2. `dh/ds ≤ climbRate / gs` and `dh/ds ≥ −descentRate / gs`.

This slope-limited upper envelope is found with one backward pass (start climbing early enough
for what is ahead) and one forward pass (descent limit). If terrain right after take-off rises
faster than the aircraft can climb en route, `h(0)` ends above the transition height; that
excess is gained in a **climbing hold** over the base at the forward climb rate and cruise power
(a winged aircraft circles, it does not hover up). The same applies to height that cannot be
shed before the destination.

```
flight time = hoverClimb / vertClimbRate + holdClimb / climbRate
            + Σ ds / gs
            + holdDescent / descentRate + hoverDescent / vertDescentRate
```

The profile also reports the highest point (checked against the service ceiling) and the
greatest height above ground (flagged when above 120 m).

## 4. Range (`energy.ts`, `mission.ts`)

Energy is expressed as equivalent still-air cruise distance.

```
gross    = publishedRange(kit mass) / (1 − reserve already inside the published figure)
usable   = gross × tempFactor × (1 − landing reserve)
tempFactor = clamp(1 − 0.008 × max(0, 15 °C − T), 0.4, 1)        assumption

required = airDistance(out) + airDistance(back)                  cruise airspeed × time, incl. holds
         + metresClimbed × climbEquivalent                       multirotor 2, winged VTOL 8 (m per m)
         + hoverMinutes × hoverPowerRatio × cruise km per minute multirotor 1.1, winged VTOL 6
```

Feasible only if `required ≤ usable`. The return leg is charged at the loaded range
(conservative). With the *one-way* policy only the outbound leg counts and the drone is not
available again.

Where the constants come from:

- `climbEquivalent`: battery size ÷ published range gives energy per metre of cruise; `m·g`
  ÷ 0.6 gives energy per metre of climb. Wingcopter 198 (2 × 814 Wh, 75–110 km, 20–25 kg) → 6.5–8;
  DJI FlyCart 30 (two batteries of roughly 2 kWh each — a figure not re-verified in this
  research — 28 km, 65 kg) → ≈ 2.
- `hoverPowerRatio`: Wingcopter 198 flies 15 min as a multicopter vs 90 min on the wing → 6;
  DJI Matrice 400 hovers 53 min vs 59 min forward → 1.1.
- Flying faster than the published cruise speed scales range by `(Vcruise / V)²`.

These are derived from a few published figures, not from flight tests.

## 5. Go / no-go gates

A mission is infeasible, with the reason shown, when: the kit is heavier than the payload limit;
mean wind or gusts exceed the limits (gust limit = 1.5 × mean limit when unpublished);
temperature is outside the operating range; precipitation exceeds the rain rating (no rating =
no rain); icing is set; night flights are disabled; the route needs more than the service
ceiling; the aircraft has no delivery method the site allows (a winch with a minimum hook load is
skipped for a lighter kit); the destination or base lies in an enforced zone; required range
exceeds usable range; a needed specification is unpublished; or the point is outside the data
extent.

## 6. Dispatch (`dispatch.ts`)

Calls are processed in order. Each is assigned the drone that puts the AED at the patient
soonest, counting any wait for a drone that is flying or in turnaround. Ties go to the larger
range margin. The drone is busy until it has returned and been re-armed.

## 7. Conventional responders (`comparators.ts`, `roads.ts`, `walk.ts`)

- **Ground ambulance / mountain rescue.** Multi-source Dijkstra over the OSM road graph
  (104,000 junctions) from all stations, with an assumed emergency speed per road class
  (motorway 120 … residential 40, service 20, paved track 25, other track 12 km/h — ambulances
  skip unpaved tracks unless enabled; mountain rescue uses them). The patient is snapped to the
  nearest road the responder can reach; the rest is walked with Tobler's hiking function over
  the terrain (`v = 6·exp(−3.5·|slope + 0.05|)` km/h) × a crew-load factor, on a path 1.3 × the
  straight line. Crew availability is not modelled.
- **Helicopter.** Call handling + mobilisation + straight-line distance ÷ cruise speed + landing
  + walk. Everything but the base location is an assumption; the result is labelled
  illustrative.
- **Bystander fetching a public AED.** Round trip on foot to the nearest OSM-mapped AED. Off by
  default because only four AEDs are mapped.

Plausibility check built into the tests: with the assumed speeds, 99 % of population-tagged
settlements are within a 20-minute drive of a station (median 5.8 min), consistent with the
legal planning standard.

## 8. Coverage and statistics (`coverage.ts`, `app/metrics.ts`)

The same mission model is evaluated to every 300 m cell of the study area (raster) and to every
study location. Each statistic has one definition:

| Statistic | Definition |
|---|---|
| Study locations ≤ T | share of selected locations with drone time ≤ T, each using its own site type |
| Residents ≤ T | OSM population tag of settlements with drone time ≤ T ÷ all tagged population |
| Area ≤ T | share of study-area cells with drone time ≤ T under one stated site assumption |
| Median / p90 | over servable locations only; unserved ones are counted separately |
| Drone before ambulance | locations where drone time < ambulance time, among those both reach |
| Backup coverage | locations at least two bases can serve at all |
| Utilisation | assumed alerts per 100,000 residents × mean mission cycle ÷ ready drones; Erlang-B for "all busy" |

No survival or lives-saved estimate is produced.

## 9. Base selection (`optimize.ts`)

Maximum-coverage location (Church & ReVelle 1974) on the candidate × location time matrix:
greedy addition, then vertex interchange until no swap improves. A second objective minimises
the weighted mean time with unserved locations charged 60 min. The result is a heuristic:
greedy alone guarantees ≥ 63 % of the optimal coverage, and the tests compare it with exhaustive
search on small instances, but it is **not a proven optimum**.

## 10. Fleet cost (`cost.ts`)

A transparent estimate, not a budget. Amounts are kept in EUR and shown in CZK at a configurable rate.

```
purchase = Σ aircraft prices + bases × station equipment
annual   = purchase ÷ service life
         + Σ aircraft prices × maintenance share
         + bases × yearly station cost
         + drones × yearly AED upkeep
         + staff FTE × yearly cost per FTE
         + other
```

Aircraft price is, in order: the user's own figure, a published dealer price (DJI Matrice 400:
€10,636; DJI FlyCart 30: €24,498 net), or a planning value of €60,000 for aircraft whose
manufacturers publish no price — flagged in the UI wherever it is used. Default assumptions
(5-year write-off, 10 % maintenance, €12,000 station equipment, €2,400 station upkeep, 5 FTE of
remote pilots at €40,000, €260 per AED per year) are taken from Bogle et al. 2019, Basu et al.
2026 (preprint) and Röper et al. 2023; every one is editable. Insurance, software, training,
authorisation costs and VAT are not included. Staff does not scale with fleet size and is
usually the largest item.

## 11. Validation

- Hand-calculated flat-terrain cases (times, range boundary, reserve, cold, wind, delivery
  methods) — `mission.test.ts`.
- Against Sweden: for the published median 1.8 km flight with the study aircraft, the model
  gives take-off → delivery within 15 % of the published 3:17, and call → delivery within 5 %
  of the sum of the published phase medians.
- Everdrone E2: reproduces the published 8 km service radius by construction (its still-air
  figure is calibrated to do so, and labelled as such).

This is consistency checking, not validation against Czech operations — no such data exists yet.

## 12. Known simplifications

See the **Limitations** page in the app (`src/data/notes.ts`). The main ones: 100 m bare-earth
terrain without obstacles; straight routes; uniform wind; no official airspace zones;
Swedish delay defaults; assumed road speeds; places instead of historical incidents.
