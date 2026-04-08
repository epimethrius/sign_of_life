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
├── index.html              # Entry point — canvas + UI shell
├── src/
│   ├── main.js             # Wires grid, renderer, loop, rules, UI events
│   ├── grid.js             # Grid state: Uint8Array, get/set, neighbors, isFull
│   ├── renderer.js         # Canvas draw: cell state → color
│   ├── loop.js             # setTimeout tick loop, manual/auto mode, delay
│   └── rules/
│       ├── index.js        # Rule registry: register, enable/disable, applyAll
│       └── grass-spread.js # Grass spreads to one random empty 4-neighbor/tick
├── package.json
├── PLAN.md
└── LICENSE
```

---

## Rule Interface

Each rule is a JS module exporting:

```js
export default {
  id: 'unique-id',          // stable identifier
  name: 'Human name',
  description: 'What this rule does.',
  apply(grid) {
    // Snapshot state before writing to avoid tick-order artifacts.
    // Reads from grid, writes new state back in-place.
  }
}
```

Rules are registered in `src/rules/index.js`. The UI renders a checkbox per rule;
enabled rules run in registration order each tick.

Rule *parameters* (probability, range, thresholds) live as plain JS values inside
the rule module — JSON-compatible, easy to expose in UI later.
Rule *behavior* (the `apply` function) must stay as code; it cannot live in JSON.

---

## Architectural Decisions & Future Design

These are not yet implemented but should inform every structural choice made now.

### 1. Seeded PRNG (reproducibility)

`Math.random()` is not seedable — must be replaced with a small seedable PRNG
(mulberry32 or xorshift32, ~5 lines, fast, good statistical quality).
Every rule calls `rng()` instead of `Math.random()`.

The seed is a 32-bit integer, displayed as a hex string (e.g. `a3f2c1b0`).
Same seed + same initial state = identical replay, tick for tick.

### 2. World Sharing & State Serialization

A world can be shared as a compact string encoding:

- **Seed** (4 bytes) — enough to replay from the beginning if no manual edits
- **Rule configuration** — which rules are enabled, their parameter values
- **Initial grid snapshot** — needed only if the user painted cells manually
  before starting; base64 of the typed arrays, compressed if large

Target: a short URL-safe string that can be copy-pasted or appended to a URL.
For large grids, the snapshot should be compressed (e.g. LZ-string).

### 3. Grid Structure — Structure of Arrays (SoA)

Current: one `Uint8Array` for cell type. Future cells need traits (energy, age, etc.).

**Do not use Array of Structures** (`cells[i] = { type, energy, age }`):
it fragments memory and is slow to iterate on large grids.

**Use Structure of Arrays** instead:

```
types[i]     Uint8Array    — entity type per cell (0 = empty)
energy[i]    Float32Array  — energy level (future)
age[i]       Uint16Array   — ticks alive (future)
```

Each property is a contiguous typed array. Rules that only touch `energy`
iterate a single flat buffer — cache-friendly at any grid size.
Adding a new trait = adding one new typed array, no restructuring needed.

### 4. Multi-Layer Grid

A single flat array cannot naturally represent multiple coexisting entities
(e.g. grass + animal in the same cell). Solution: **one typed array per layer**.

Proposed layers:

| Layer | Contents | Changes |
|---|---|---|
| 0 — terrain | soil, rock, water | rarely |
| 1 — vegetation | grass, tree, bush | slowly |
| 2 — animals | herbivore, predator, bird | fast |
| 3 — events | fire, flood, drought | transient |

Each layer is its own `Uint8Array` (same index space). A cell can hold one
entity per layer simultaneously. Rules declare which layers they read/write,
making interactions explicit. A bird (layer 2) stands on grass (layer 1);
fire (layer 3) burns vegetation (layer 1) and damages the animal (layer 2).

One animal per cell per layer is usually realistic. If overflow is ever needed
(e.g. a herd), a sparse `Map<cellIndex, Entity[]>` can handle exceptions without
restructuring the main arrays.

### 5. Statistics & History

Each tick, record a snapshot of population per species per layer.
Store snapshots in a **fixed-size circular buffer** (e.g. last 1000 ticks)
backed by a typed array — bounded memory, fast to write.

Rules log *interaction events* explicitly (predation, death, spread blocked)
so dynamics can be derived, not just population counts.

Post-simulation summary: peak populations, time to fill, interaction counts.
Live display: population per species updated each tick.
Charts: added later on top of the same data.

### 6. Mutations & Adaptation (long-term perspective)

After terrain, vegetation, and animal layers are stable, the intended next step
is to give creatures heritable traits that mutate across generations:

- Each creature carries a trait vector (speed, aggression, heat tolerance, etc.)
  stored in SoA `Float32Array` buffers alongside `types[]`
- On reproduction, offspring inherit parent traits with small random perturbations
  (the seeded PRNG ensures this is reproducible)
- Rules can apply environmental pressure: a creature in a hot cell loses energy
  faster unless its heat-tolerance trait is high enough
- Over many generations, populations drift toward better-adapted trait profiles

This is the natural extension of the layered + SoA architecture above.
No special mechanism is needed beyond per-cell trait arrays and reproduction rules
that copy + perturb trait values. The statistics layer will surface which traits
dominated and how fast adaptation occurred.

---

## Milestones

### M1 — Grass Simulation ✓

**Field:** 10×10, no wrap-around.
**Entity:** Grass (single type). One cell seeded randomly at start.
**Rule:** Each tick, every grass cell spreads to one random empty 4-neighbor.
**End condition:** Simulation stops when field is full.

- [x] `package.json` — Vite dev/build scripts
- [x] `index.html` — canvas + UI shell
- [x] `src/grid.js` — `Uint8Array`, `get/set`, `emptyNeighbors()`, `isFull()`
- [x] `src/renderer.js` — draws grid to canvas
- [x] `src/loop.js` — tick loop, manual/auto, configurable delay
- [x] `src/rules/grass-spread.js` — grass spread rule
- [x] `src/rules/index.js` — rule registry with enable/disable
- [x] `src/main.js` — wires everything, builds rule checkboxes dynamically

UI: canvas, Next Tick, Reset, Auto toggle, delay input, rule checkboxes, status line.

### M2 — Foundations for Growth

Preparatory refactors before adding more entities:

- [ ] Replace `Math.random()` with seeded PRNG module (`src/rng.js`)
- [ ] Expose seed in UI; allow entering a custom seed; show current seed
- [ ] Migrate grid to SoA: `types[]` now, placeholder arrays for future traits
- [ ] Add multi-layer support to `Grid` (at minimum terrain + vegetation layers)
- [ ] Add statistics: per-tick population snapshot, circular buffer, live count display
- [ ] World state serialization: encode seed + initial state → shareable string; decode on load

### M3 — More Entities & Rules

- [ ] Terrain layer: soil (default), water, rock — painted at init, static for now
- [ ] Vegetation layer: tree (spreads slower than grass, blocks grass)
- [ ] New rules: spread with probability, decay, inter-species competition
- [ ] Random-fill and clear buttons
- [ ] Rule parameter sliders/inputs in UI

### M4 — Animals

- [ ] Animal layer: herbivore (eats grass, moves, reproduces, dies of age/starvation)
- [ ] Basic trait vector per animal (speed, energy-per-step)
- [ ] Predator (eats herbivores)
- [ ] Interaction event logging (predation, starvation, reproduction)
- [ ] Statistics: dynamics charts (population over time per species)

### M5 — Interactivity & Sharing

- [ ] Click/drag to paint cells on canvas (per layer)
- [ ] Grid size selector
- [ ] Share button: encode world → URL-safe string; decode on load
- [ ] GitHub Actions → build → GitHub Pages

### M6 — Mutations & Adaptation

- [ ] Heritable trait vectors (SoA `Float32Array` per trait)
- [ ] Reproduction: offspring = parent traits + seeded perturbation
- [ ] Environmental pressure rules (terrain affects energy cost)
- [ ] Trait drift visualization: plot dominant trait values over generations
- [ ] Post-simulation adaptation summary

### M7 — Visualization Upgrades (later)

- [ ] Color by trait value or cell age
- [ ] Zoom & pan
- [ ] Pattern presets / saved worlds library
- [ ] WebGL renderer (if canvas becomes a bottleneck at large grid sizes)

---

## Deferred / Out of Scope (for now)

- Server-side computation
- Multiplayer / live-shared state
- Mobile touch optimization
