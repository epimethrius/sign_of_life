# Sign of Life — Project Plan

A browser-based explorer for cellular automata and ecosystem simulations.

---

## Goals

- Run locally in any browser with no install (`npx vite` or direct `index.html`)
- Deployable to the web with a single build command (GitHub Pages / Netlify)
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
| Deployment | GitHub Pages or Netlify | Static build output from `vite build` |

---

## Architecture (current)

```
sign_of_life/
├── index.html                   # Entry point — canvas + UI shell
├── src/
│   ├── main.js                  # Wires grid, renderer, loop, registries, UI
│   ├── grid.js                  # Multi-layer SoA grid, accessors, spread targets
│   ├── renderer.js              # Canvas: terrain color fill + entity icon overlay
│   ├── loop.js                  # setTimeout tick loop, manual/auto mode, delay
│   ├── rng.js                   # Seeded PRNG (mulberry32)
│   ├── stats.js                 # Circular buffer for per-tick population snapshots
│   ├── serializer.js            # World encode/decode → base64url share string
│   ├── terrains/
│   │   ├── index.js             # Terrain registry
│   │   ├── soil.js
│   │   ├── sand.js
│   │   ├── water.js
│   │   └── rock.js
│   └── rules/
│       ├── index.js             # Rule registry: register, enable/disable, applyAll
│       └── grass-spread.js
├── package.json
├── PLAN.md
└── LICENSE
```

---

## Entity & Terrain Conventions

### Layers

| Index | Name | Contents | Changes |
|---|---|---|---|
| 0 | terrain | soil, sand, water, rock | set at init, static for now |
| 1 | vegetation | grass, tree, bush, aquatic grass | slowly |
| 2 | animals | herbivore, predator, bird | fast |
| 3 | events | fire, flood, drought | transient |

Each layer is a `Uint8Array`. One entity maximum per layer per cell — no stacking.

### Occupancy rules

- **Vegetation layer:** one entity per cell. Entities replace each other (e.g. tree
  overwrites grass). If the occupant is removed, the cell becomes empty and other
  vegetation can claim it.
- **Dependency:** rules declare what they consume. `needs: [GRASS]` = only grass
  qualifies. `needs: [GRASS, TREE]` = either qualifies (OR logic).

### Terrain effects

Each terrain module exports an `effects` object — named numeric modifiers that rules
query via `grid.terrainEffect(x, y, key)`. Default value is `1.0` (neutral) if the
key is not present on a terrain type. Users can adjust effect values to change world
behaviour without touching rule code.

```js
// Example — rock terrain
export default {
  id: 'rock', name: 'Rock', color: '#6b6b6b',
  /**
   * Effects applied to entities on this terrain.
   * All values are multipliers (1.0 = neutral) unless noted.
   *
   * @property {number} grassSpreadChance  - multiplier on grass spread probability
   * @property {number} treeSpreadChance   - multiplier on tree spread probability
   * @property {number} moveEnergyCost     - multiplier on animal movement cost
   */
  effects: {
    grassSpreadChance: 0.2,  // grass barely spreads on rock
    treeSpreadChance:  0.5,
    moveEnergyCost:    1.5,
  }
}
```

### Entity definition

Each entity type (vegetation, animal, etc.) is described in the rule file that governs
it, or in a shared constants module. Every entity must document:

- `id` and `name` — stable identifier and display name
- `icon` — emoji or unicode character rendered on canvas (e.g. `🌿`)
- `layer` — which layer it lives on
- `replaces` — list of entity states it can overwrite when spreading (empty = only EMPTY cells)
- `needs` — list of entity states it requires to act (empty = no dependency)

### Action dispatch

Every rule that acts on individual cells uses weighted action selection via the seeded
RNG. This applies to all entity types — vegetation and animals alike.

```js
// Rule actions definition
actions: [
  { action: 'SPREAD', weight: 0.7 },
  { action: 'IDLE',   weight: 0.3 },
]

// Dispatcher (shared utility) — picks one action by weight using rng()
function pickAction(actions, rng) { ... }
```

Rules implement a handler per action. IDLE always means "do nothing this tick."
Weights are exposed as rule parameters, editable in UI.

---

## Architectural Decisions & Future Design

### 1. Seeded PRNG ✓

mulberry32, seeded per-simulation. Init RNG (cell placement) and simulation RNG
(rules) are separate sub-seeds derived from the same master seed, so rule RNG always
starts clean regardless of grid size.

### 2. World Sharing & State Serialization ✓

Binary layout (version + seed + dimensions + layer snapshots + rule config) encoded
as base64url. Represents the *initial* state — loading a share code always starts
from tick 0 and replays identically.
For large grids: LZ-string compression to be added when needed.

### 3. Grid Structure — Structure of Arrays ✓

Each property is a separate typed array (`Uint8Array` for types, `Float32Array` for
energy, `Uint16Array` for age). Rules that only touch one property iterate one flat
buffer — cache-friendly at any grid size. Adding a trait = one new array.

### 4. Multi-Layer Grid ✓

One `Uint8Array` per layer (terrain / vegetation / animals / events). Same cell index
across all layers. Implemented. Rules declare which layers they read and write.

### 5. Terrain Generation — Seed + Expand

**Algorithm (chosen):** seed + expand BFS.
1. Place M seed cells of a given terrain type, positions chosen by seeded RNG,
   M proportional to the target percentage of total area.
2. Expand each blob: repeatedly pick a random occupied cell and spread to one random
   empty 4-neighbour, until the target cell count is reached.
3. Process terrain types in priority order (water first, rock second, sand third,
   remainder = soil).

Result: irregular, natural-looking clusters. Fully reproducible from seed.
Percentages are set in UI per terrain type; remainder always goes to soil.

### 6. Statistics & History ✓

Fixed-size circular buffer of `Int32Array`. Per-tick: one count per tracked species.
Rules log interaction events (predation, starvation, reproduction) explicitly — not
derivable from population snapshots alone.
Post-simulation summary: peak, average growth, interaction counts.
Charts: added later on top of the same data.

### 7. Mutations & Adaptation (long-term perspective)

After terrain + vegetation + animals are stable:

- Each creature carries a trait vector (speed, aggression, heat tolerance, etc.)
  in SoA `Float32Array` buffers — one array per trait, parallel to `types[]`
- Reproduction: offspring = parent traits ± small seeded perturbation
- Environmental pressure: terrain effects modulate energy cost, survival chance
- Over generations, populations drift toward better-adapted trait profiles
- Statistics layer surfaces which traits dominated and how fast adaptation occurred

### 8. Visualization

- **Terrain:** solid color fill per cell (defined in terrain module)
- **Entities:** emoji/unicode icon centered over terrain fill (defined in rule/entity module)
- **Legend:** sidebar listing all terrain types and active entity types with their
  icon, color swatch, name, and one-line description; populated from registries
- Future: color by trait value or cell age; zoom & pan; WebGL if canvas bottlenecks

---

## Milestones

### M1 — Grass Simulation ✓

10×10 field, single grass entity, spreads to random empty 4-neighbor each tick.
Stops when field is full. Manual/auto tick, delay input, status line.

### M2 — Foundations ✓

Seeded PRNG, multi-layer SoA grid, stats circular buffer, world serialization,
seed + share UI, rule registry with enable/disable.

### M3 — Terrain, Trees & Richer Rules ✓

- [x] `src/terrains/` — terrain registry + soil, sand, water, rock modules (with effects JSDoc)
- [x] `src/actions.js` — `pickAction(actions, rng)` weighted dispatch utility
- [x] `grid.spreadTargets(x, y, layer, replaceableStates[])` — replaces `emptyNeighbors`
- [x] Terrain generation: seed+expand BFS, seeded RNG, configurable percentages
- [x] Terrain percentage UI (inputs per type, auto-remainder to soil)
- [x] `src/rules/grass-spread.js` — action dispatch (SPREAD / IDLE), terrain `grassSpreadChance`
- [x] `src/rules/tree-spread.js` — slow spread, replaces grass, terrain `treeSpreadChance`
- [x] Fixed stats delta display bug from M2
- [x] Multi-series stats: grass (series 0) and tree (series 1) tracked separately
- [x] Renderer: terrain color fill + entity icon overlay (two-pass draw)
- [x] Legend sidebar: terrain swatches + entity icons with descriptions
- [x] End condition: all non-water cells covered (not just full layer)

### M4 — Animals

- [ ] Animal layer: herbivore (eats grass/tree, moves, reproduces, ages, starves)
- [ ] SoA trait arrays: `energy[]`, `age[]` per animal cell
- [ ] Action dispatch: MOVE, EAT, REPRODUCE, IDLE, DIE — weighted per species
- [ ] Predator (eats herbivores)
- [ ] Interaction event logging: predation, starvation, reproduction counts per tick
- [ ] Stats expanded to animal species; live population display per species

### M5 — Interactivity & Sharing

- [ ] Click/drag to paint cells on canvas (per layer, per entity type)
- [ ] Grid size selector (triggers re-init)
- [ ] GitHub Actions → build → GitHub Pages

### M6 — Mutations & Adaptation

- [ ] Heritable trait vectors in SoA `Float32Array`
- [ ] Reproduction with seeded trait perturbation
- [ ] Environmental pressure rules (terrain effects on energy cost)
- [ ] Trait drift visualization: dominant trait values over generations

### M7 — Visualization Upgrades

- [ ] Color by trait value or cell age gradient
- [ ] Zoom & pan
- [ ] Pattern presets / saved worlds library
- [ ] WebGL renderer (if canvas becomes a bottleneck at large grid sizes)

---

## Deferred / Out of Scope (for now)

- Server-side computation
- Multiplayer / live-shared state
- Mobile touch optimization
