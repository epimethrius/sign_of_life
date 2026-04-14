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
├── vite.config.js               # base='./', version/commit injection
├── .github/workflows/deploy.yml # CI: build → GitHub Pages on push to main
├── src/
│   ├── main.js                  # Wires grid, renderer, loop, registries, UI
│   ├── grid.js                  # Multi-layer SoA grid, accessors, spread targets
│   ├── renderer.js              # Canvas: terrain fill + corner-aware icon overlay
│   ├── loop.js                  # setTimeout tick loop, manual/auto mode, delay
│   ├── rng.js                   # Seeded PRNG (mulberry32)
│   ├── actions.js               # pickAction, computeLifespan, waterProximityBonus,
│   │                            #   nearestFoodCell, emptyAnimalNeighbors
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
│       ├── vegetation-aging.js  # Increments age; kills at lifespan
│       ├── herbivore-behavior.js
│       └── predator-behavior.js
├── package.json
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
| 1 | `LAYER_VEGETATION` | grass, tree — one entity per cell |
| 2 | `LAYER_ANIMALS` | herbivore, predator — one entity per cell |
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
| `aquaticGrassSpreadChance` | reserved |

---

## Animal Behaviour — Priority Order

Each tick, per animal:

1. **Survival** *(herbivore only)* — if a predator is within 2 cells (Chebyshev):
   - Escape: move to neighbor that maximises Manhattan distance from threat
   - If cornered: reproduce if cooldown = 0 and adjacent empty cell exists
   - Otherwise: fall through
2. **Seek food** — if energy < ⅔ × `reproThreshold`:
   - Food at current cell → eat
   - Food elsewhere → move toward nearest food (Manhattan-greedy, ties random)
   - No food anywhere → wander randomly
3. **Reproduce** — if cooldown = 0 and adjacent empty cell exists
4. **Wander or idle** — 60% move randomly, 40% idle

Newborns have their cooldown pre-set so they cannot reproduce immediately.

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

### M6 — Mutations & Adaptation
- [ ] Heritable trait vectors in SoA `Float32Array` (e.g. speed, energyEfficiency)
- [ ] Reproduction passes parent traits to offspring ± seeded perturbation
- [ ] Environmental pressure: terrain effects modulate trait expression
- [ ] Trait drift visualization

### M7 — Visualization Upgrades
- [x] Population chart (Canvas 2D line chart over StatsBuffer data)
- [ ] Zoom & pan
- [ ] Cell age / energy overlay render mode
- [ ] Pattern presets / saved worlds library
- [ ] WebGL renderer (if canvas becomes a bottleneck at large grid sizes)

---

## Backlog / Ideas

- Aquatic vegetation (uses reserved `aquaticGrassSpreadChance` effect in water.js)
- Third animal type (scavenger/omnivore) to break the binary predator-prey collapse
- Seasonal pressure events on LAYER_EVENTS (drought, cold snap)
- LZ-string compression for share codes at large grid sizes
- Mobile touch support

---

## Deferred / Out of Scope

- Server-side computation
- Multiplayer / live-shared state
