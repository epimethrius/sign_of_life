# Sign of Life — Project Plan

A browser-based explorer for cellular automata and ecosystem simulations.

---

## Goals

- Run locally in any browser with no install (`npx vite` or direct `index.html`)
- Deployable to the web with a single build command (GitHub Pages)
- Pluggable rule engine: rules are independent JS modules, enabled/disabled by the user
- Reproducible worlds: any simulation can be shared and replayed exactly
- Simple visualization to start; complexity added later

---

## Tech Stack

| Concern | Choice | Rationale |
|---|---|---|
| Runtime | Browser (Canvas 2D API) | Zero dependencies, universal |
| Build / Dev server | [Vite](https://vitejs.dev/) | Zero-config, instant HMR, static output |
| Language | Vanilla JS (ES modules) | No framework overhead; easy to evolve |
| Deployment | GitHub Pages | Static build output from `vite build` |

---

## Architecture (current)

```
sign_of_life/
├── index.html                   # Entry point — canvas + UI shell
├── vite.config.js               # base='./', version read from package.json, commit injection
├── entities.json                # Standalone entity library — all species params + food web
├── .github/workflows/deploy.yml # CI: build → GitHub Pages on push to main
├── src/
│   ├── main.js                  # Wires grid, renderer, loop, registries, UI
│   ├── grid.js                  # Multi-layer SoA grid, accessors, spread targets
│   ├── renderer.js              # Canvas: terrain fill + corner-aware icon overlay
│   ├── loop.js                  # setTimeout tick loop, manual/auto mode, delay
│   ├── rng.js                   # Seeded PRNG (mulberry32)
│   ├── actions.js               # pickAction, computeLifespan, waterProximityBonus,
│   │                            #   nearestFoodCell, emptyAnimalNeighbors, emptyWaterNeighbors
│   ├── stats.js                 # Circular buffer for per-tick population snapshots
│   ├── events.js                # Per-tick EventLog; rules call events.log(type,…)
│   ├── serializer.js            # World encode/decode → base64url share string (v4)
│   ├── terrain-gen.js           # Seed+expand BFS terrain generation
│   ├── terrains/
│   │   ├── index.js             # colorOf, effectOf, terrainOf registries
│   │   ├── soil.js              # grassSpreadChance:1.0, treeSpreadChance:1.0, lifespanMult:1.0
│   │   ├── sand.js              # grassSpreadChance:0.3, treeSpreadChance:0.15, lifespanMult:0.65
│   │   ├── water.js             # blocks vegetation; aquaticGrassSpreadChance reserved
│   │   └── rock.js              # grassSpreadChance:0.1, treeSpreadChance:0.15, lifespanMult:0.5
│   └── rules/
│       ├── index.js             # Rule registry: ALL_RULES, enable/disable, applyAll
│       ├── grass-spread.js      # SPREAD/IDLE; terrain + water proximity effects
│       ├── tree-spread.js       # SPREAD/IDLE; replaces grass; terrain + water proximity
│       ├── lily-spread.js       # SPREAD/IDLE; aquatic — spreads on water cells only
│       ├── vegetation-aging.js  # Increments age; kills at lifespan
│       ├── herbivore-behavior.js
│       ├── predator-behavior.js
│       ├── omnivore-behavior.js
│       ├── bird-behavior.js
│       ├── small-fish-behavior.js
│       ├── big-fish-behavior.js
│       └── season-engine.js
├── scripts/
│   ├── sim-runner.mjs           # Headless batch runner (30+ seeds, survival statistics)
│   └── sim-config.json          # Default parameters for the headless runner
├── package.json                 # version: 1.0.0 — single source of truth for app version
├── PLAN.md
└── LICENSE
```

---

## Grid — Structure of Arrays

Each layer holds five parallel typed arrays, all indexed by `y * width + x`:

| Array | Type | Purpose |
|---|---|---|
| `layers[l]` | `Uint8Array` | entity typeId (0 = EMPTY) |
| `age[l]` | `Uint16Array` | ticks alive (not serialized — resets on load) |
| `lifespan[l]` | `Uint16Array` | max ticks before death (0 = immortal) |
| `energy[l]` | `Float32Array` | energy level (animals only) |
| `reproCooldown[l]` | `Uint16Array` | ticks until next reproduction allowed |

Adding a new per-entity property = one new array.

---

## Layers

| Index | Constant | Contents |
|---|---|---|
| 0 | `LAYER_TERRAIN` | soil, sand, water, rock — static after init |
| 1 | `LAYER_VEGETATION` | grass, tree, lily — one entity per cell |
| 2 | `LAYER_ANIMALS` | herbivore, predator, omnivore, fish, bird — one entity per cell |
| 3 | `LAYER_EVENTS` | reserved for fire, flood, drought |

---

## Terrain Effects System

Each terrain module exports an `effects` object of named multipliers (default `1.0`).
Rules query via `effectOf(typeId, key)`.

| Key | Used by |
|---|---|
| `grassSpreadChance` | grass-spread rule |
| `treeSpreadChance` | tree-spread rule |
| `lifespanMultiplier` | spread rules (applied to new plant lifespan) |
| `moveEnergyCost` | animal behavior rules (passive decay multiplier) |
| `aquaticGrassSpreadChance` | lily-spread rule (spread chance on water tiles) |

---

## Food Web

```
lily ──────► small fish ──────► big fish
                │
                ▼
predator ◄── herbivore ◄── grass/tree ──► omnivore
    │                                        ▲
    └──── shore fish (small fish) ───────────┘
bird ────► shore fish (small fish)
```

| Species | Eats | Eaten by |
|---|---|---|
| grass | — | herbivore, omnivore |
| tree | — | herbivore, omnivore |
| lily | — | small fish |
| herbivore | grass, tree | predator, bird |
| predator | herbivore, small fish (shore) | — |
| omnivore | grass, tree, small fish (shore) | predator |
| small fish | lily | big fish, predator (shore), omnivore (shore), bird (shore) |
| big fish | small fish | — |
| bird | small fish (shore) | — |

**Shore fishing:** land animals (predator, omnivore, bird) adjacent to a water cell containing small fish kill the fish from land without entering the water. This connects the aquatic and terrestrial food webs.

---

## Animal Behaviour — Priority Order

Each tick, per animal:

1. **Survival** *(herbivore + omnivore)* — if a predator is within 2 cells (Chebyshev):
   - Escape: move to neighbor that maximises Manhattan distance from threat
   - If cornered: reproduce if cooldown = 0 and adjacent empty cell exists
   - Otherwise: fall through
2. **Seek food** — if energy < ⅔ × `reproThreshold`:
   - Food at current cell → eat
   - Adjacent prey → eat and move into cell
   - Shore fish in adjacent water cell → eat (no movement for shore fishing)
   - Food elsewhere → move toward nearest food source
   - No food anywhere → wander randomly
3. **Reproduce** *(food-coupled for herbivore and omnivore)* — if cooldown = 0, energy ≥ `reproThreshold`, AND standing on vegetation:
   - Place offspring on adjacent empty cell; consume the veg cell as breeding cost
   - If not on veg: move toward nearest vegetation instead
4. **Wander or idle** — 60–70% move randomly, remainder idle

Newborns have their cooldown pre-set so they cannot reproduce immediately.

**Food-coupled breeding rationale:** Requiring vegetation at the breeding site spatially caps
population to vegetation density. Each breeding event consumes one veg cell, creating a hard
negative feedback loop that prevents exponential booms without predator pressure.

---

## Entity Parameters (current tuned values)

All parameters are also documented in `entities.json` (see below).

| Species | baseLifespan | decay/tick | reproThreshold | reproCost | cooldownDiv |
|---|---|---|---|---|---|
| grass | 16 | — | — | — | — |
| tree | 42 | — | — | — | — |
| lily | 6 | — | — | — | — |
| herbivore | 35 | 0.30 | 10 | 5 | 3 |
| predator | 35 | 0.80 | 20 | 10 | 2 |
| omnivore | 35 | 0.35 | 10 | 5 | 3 |
| small fish | 18 | 0.30 | 8 | 5 | 4 |
| big fish | 40 | 0.30 | 12 | 8 | 2 |
| bird | 35 | 0.50 | 14 | 7 | 3 |

---

## Serializer — VERSION 4

```
[version:1][seed:4][width:2][height:2][numLayers:1]
per layer:
  [types:    w*h × 1]   uint8
  [lifespan: w*h × 2]   uint16 big-endian
  [energy:   w*h × 4]   float32 big-endian
  [reproCooldown: w*h × 2]  uint16 big-endian
[numEnabledRules:1][ruleIndices:n]
```

Encoded as base64url. `age[]` is not serialized (resets to 0 on load).

---

## entities.json — Standalone Entity Library

`entities.json` (project root) is a self-contained description of all 9 species and their
relationships, independent of the simulation engine. Its purpose is **reusability**: any
application — a game, a visualisation tool, a data dashboard, a documentation site — can
read this file and know the full entity model without importing or running the simulation.

Contents:
- **`layers`** and **`typeIds`** — numeric constants matching `src/grid.js`
- **`foodWeb`** — for each species: what it eats and what eats it
- **`entities`** — per species: layer, typeId, terrain constraints, tuned `params` (all numeric values from the behavior files), and a `behavior` summary (logic description, not code)
- **`recommendedConfig`** — initial populations and terrain percentages for stable runs at 50×50, with observed survival rates from 30-run headless analysis

The file has a `version` field and a `$schema` stub for forward compatibility.
**It must be kept in sync with the behavior files** whenever entity parameters are retuned.

---

## Development conventions

### Version management
`package.json` is the single source of truth for the application version. `vite.config.js`
reads `version` from `package.json` at build time and injects it as `__APP_VERSION__`
(displayed under the title in the UI). Bump `package.json` only — do not edit `vite.config.js`.

### Default parameter changes
Whenever a default value is changed in any rule file (`src/rules/*.js`) or in the
UI (`index.html`), **both `scripts/sim-config.json` and `entities.json` must be updated
to match** in the same commit.

`sim-config.json` is the single source of truth for what "default run" means in
the headless runner. Letting it drift from the source files makes batch results
unrepresentative of what the browser simulation actually runs.

Affected fields and where their defaults live:

| `sim-config.json` key | Source |
|---|---|
| `terrain.water/rock/sand` | `index.html` — `#pct-water`, `#pct-rock`, `#pct-sand` input values |
| `population.*` | `index.html` — `#pop-*` input values, scaled to the config `size` |
| `rules.grassLifespan` | `src/rules/grass-spread.js` — `entity.baseLifespan` |
| `rules.treeLifespan` | `src/rules/tree-spread.js` — `entity.baseLifespan` |
| `rules.herbLifespan` | `src/rules/herbivore-behavior.js` — `entity.baseLifespan` |
| `rules.predLifespan` | `src/rules/predator-behavior.js` — `entity.baseLifespan` |
| `rules.herbCooldownDivisor` | `src/rules/herbivore-behavior.js` — `entity.reproCooldownDivisor` |
| `rules.predCooldownDivisor` | `src/rules/predator-behavior.js` — `entity.reproCooldownDivisor` |

---

## Milestones

### M1 — Grass Simulation ✓
10×10 field, single grass entity, spreads to random empty 4-neighbor each tick.
Manual/auto tick, delay input, status line.

### M2 — Foundations ✓
Seeded PRNG, multi-layer SoA grid, stats circular buffer, world serialization (v1),
seed + share UI, rule registry with enable/disable.

### M3 — Terrain, Trees & Richer Rules ✓
- [x] Terrain registry: soil, sand, water, rock with effects
- [x] Terrain generation: seed+expand BFS, configurable percentages, UI
- [x] grass-spread, tree-spread rules with terrain effects
- [x] Renderer: terrain color fill + entity icon overlay
- [x] Legend sidebar

### M4 — Animals ✓
- [x] EventLog; energy SoA; herbivore-behavior, predator-behavior rules
- [x] Serializer v3: energy arrays
- [x] Stats table: population, births, deaths, death ratio
- [x] Auto-stop: no population change for 5 consecutive ticks

### M4+ — Ecosystem Refinements ✓
*(added between M4 and M5)*
- [x] Water proximity bonus: vegetation spread chance + lifespan boost near water
- [x] Terrain `lifespanMultiplier`: plants on rock/sand die faster
- [x] Vegetation and animal icons placed in opposite corners when co-occupying a cell
- [x] Cell hover tooltip: terrain, vegetation (age/lifespan), animal (age/lifespan/energy/cooldown)
- [x] Rule tags and category filter UI
- [x] Section labels throughout the page
- [x] Initial population inputs (per entity type), scaled when grid size changes
- [x] Spawn-near-food constraint for animals at init
- [x] Reproduction cooldown: `reproCooldown` SoA; newborns pre-seeded; no energy gate
- [x] Priority-based animal AI replacing weighted random dispatch
- [x] Herbivore escape/survival behavior (flee predators within 2 cells)
- [x] Version + commit hash displayed under title (injected by Vite at build time)
- [x] Serializer v4: adds `reproCooldown` arrays

### M5 — Interactivity & Sharing ✓
- [x] Grid size selector (triggers re-init, scales population inputs)
- [x] GitHub Actions → build → GitHub Pages

### M5+ — Ecosystem Expansion & Balance ✓
*(added after M5)*

- [x] **Omnivore** (`OMNIVORE=3`, `omnivore-behavior.js`) — coastal forager. Eats shore fish (preferred) and vegetation. Flees predators (FLEE_PROB=0.60). Food-coupled breeding (must stand on GRASS or TREE; veg consumed). Does **not** eat herbivores — this keeps omnivore out of direct competition with predators and prevents predator starvation.
- [x] **Bird** (`BIRD=6`, `bird-behavior.js`) — aerial predator. Food priority: shore fish first, then moves toward nearest fish. Ignores terrain energy cost (flies freely). Breeds only when standing on GRASS or TREE; if not on a nest site, moves toward nearest tree/grass. Not hunted by ground predators.
- [x] **Aquatic food web** — lily → small fish → big fish. Shore fishing connects aquatic and terrestrial webs: predators and omnivores and birds all shore-fish small fish from adjacent water cells. Big fish eat only small fish in water; no land animal can catch big fish.
- [x] **Food-coupled breeding** — herbivores and omnivores can only reproduce while standing on vegetation; the veg cell is consumed. Hard negative feedback loop preventing exponential booms.
- [x] **Balance tuning** — see Entity Parameters table above and the grid-size analysis below.
- [x] **Default grid 50×50** — stochastic extinction dominates small grids; 50×50 is the functional minimum for stable multi-species dynamics.
- [x] **Version source of truth** — `vite.config.js` now reads version from `package.json` instead of a hardcoded string. Current version: **1.0.0**.
- [x] **Entity library** — `entities.json` at project root. Standalone JSON describing all 9 species (params, food-web, behavior summaries, recommended config). Reusable by external applications without the simulation engine.

---

## Balance Results (30 runs, 500 ticks)

### 50×50 (default config)

| Species | Survival | Notes |
|---|---|---|
| 🌿 grass | ~7% | Expected — outcompeted by trees |
| 🌲 tree | ~100% | Stable long-term floor |
| 🪷 lily | ~100% | |
| 🐇 herbivore | ~90% | |
| 🦊 predator | ~18% | Weakest species — see below |
| 🦝 omnivore | ~76% | |
| 🐟 small fish | ~100% | |
| 🐠 big fish | ~80% | |
| 🦅 bird | ~91% | |
| Animal collapse | ~0% | |

### Grid size comparison (populations scaled proportionally)

| Grid | Herb | Pred | Omni | S.Fish | B.Fish | Bird | Collapse |
|---|---|---|---|---|---|---|---|
| 10×10 | 50% | 0% | 0% | 0% | 0% | 0% | 50% |
| 20×20 | 62% | 28% | 32% | 100% | 0% | 13% | 0% |
| 50×50 | ~90% | ~18% | ~76% | ~100% | ~80% | ~91% | 0% |
| 75×75 | 100% | 30% | 97% | 100% | 100% | 100% | 0% |
| 100×100 | 100% | 37% | 97% | 100% | 100% | 100% | 0% |

Key observations:
- **10×10** is too small for any meaningful multi-species dynamics.
- **20×20** supports land animals but big fish needs more water area (15% of 400 = 60 cells is insufficient).
- **50×50 is the practical minimum** for all 9 species. Big fish and bird become viable here.
- **75×75 and 100×100** improve most species significantly. Predator still struggles but reaches 30–37%.
- **Grass collapses at large grids** (3–7%) because trees outcompete it over 500 ticks — this is expected and ecologically realistic. It does not count as a system failure since grass regrows from spread.
- **Predator is consistently the weakest species** across all grid sizes. The current herb-only diet, high energy decay (0.8/tick), and small starting population (10 at 50×50) limit recovery after a population dip.

### Known remaining imbalance — predator

Predators survive in only 18–37% of runs depending on grid size. Root causes:
- High energy decay (0.8/tick) requires frequent feeding
- Starting population of 10 is too small to track the initial herb surge reliably
- Herbivore-only diet means prey scarcity directly kills predators with no fallback

Candidate next steps (not yet tried):
- `predLifespan 35→40` — longer survival window per individual
- `predCooldownDivisor 2→3` — more breeding events per lifetime
- Larger starting predator population at 50×50 (try 15–20)

---

### M6 — Mutations & Adaptation
- [ ] Heritable trait vectors in SoA `Float32Array` (e.g. speed, energyEfficiency)
- [ ] Reproduction passes parent traits to offspring ± seeded perturbation
- [ ] Environmental pressure: terrain effects modulate trait expression
- [ ] Trait drift visualization

### M7 — Visualization Upgrades
- [x] Population chart (Canvas 2D line chart over StatsBuffer data)
- [x] Aquatic vegetation: lily pads (LILY=3) spread across water cells; `_seedAquatic` seeds initial population on water tiles
- [x] WebGL renderer: terrain + overlay rendered by a GLSL fragment shader (`renderer-webgl.js`); emoji icons remain on a transparent 2D canvas overlay (`renderer.js`). One full-screen quad draw call per tick; per-cell data packed into a small RGBA texture.
- [x] Cell age / energy overlay render mode: `OVERLAY_AGE` (blue→green→red heat-map on age/lifespan ratio) and `OVERLAY_ENERGY` (red→yellow→green on animal energy). Selector + colour key added to the Map section. Mode is driven as a shader uniform — no extra JS per-cell cost.
- [ ] Zoom & pan
- [ ] Pattern presets / saved worlds library

---

## Backlog / Ideas

- [x] Aerial predator — **🦅 Bird** (`BIRD=6`, `bird-behavior.js`). See M5+ for details.
- [x] Third animal type — **🦝 Omnivore** (`OMNIVORE=3`, `omnivore-behavior.js`). Coastal forager eating shore fish and vegetation. Hunted by predators. Food-coupled breeding.
- [x] Seasonal pressure events — **Season Engine** (`season-engine.js`, `season-state.js`). Configurable-length seasons (Spring/Summer/Autumn/Winter, default 50 ticks each) cycling via `LAYER_EVENTS`. Effects: vegetation spread ±, lifespan ±, energy decay ×, repro threshold × — all applied per-tick via `getSeasonEffect(key)` imported in spread, aging, and animal behavior rules. Random events: **Drought** (Summer/Autumn, 0.6%/tick, 12-22 ticks) and **Cold Snap** (Autumn/Winter, 0.8%/tick, 8-18 ticks) stack on top of season effects. Season display shown in UI; resets per run in headless runner. Season length exposed as a rule param in the UI.
- [x] Aquatic food web — **🐟 Small Fish** (`SMALL_FISH=4`) and **🐠 Big Fish** (`BIG_FISH=5`). Shore fishing connects aquatic and terrestrial food webs.
- [x] Entity library — `entities.json` standalone species definitions for external reuse.
- LZ-string compression for share codes at large grid sizes
- Mobile touch support

---

## Deferred / Out of Scope

- Server-side computation
- Multiplayer / live-shared state
