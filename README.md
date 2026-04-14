# Sign of Life

A browser-based ecosystem simulator. A multi-layer cellular grid hosts terrain, vegetation, and animals that follow configurable rules each tick. The goal is to produce a self-sustaining ecosystem where plants, herbivores, and predators coexist.

Live demo: https://epimethrius.github.io/sign_of_life/

---

## Quick start

```
npm install
npm run dev        # dev server at http://localhost:5173
npm run build      # production build → dist/
npm run preview    # serve the built dist/ locally
```

---

## The simulation

### Grid

The world is a square grid of cells with four layers stacked per cell:

| Layer | Contents |
|---|---|
| Terrain | soil, sand, water, rock — generated once at init, static |
| Vegetation | grass, tree, lily — at most one per cell |
| Animals | herbivore, predator — at most one per cell |
| Events | reserved for future environmental events |

### Entities and rules

| Entity | Layer | Notes |
|---|---|---|
| 🌿 Grass | Vegetation | Spreads to empty soil/sand/rock neighbours each tick |
| 🌲 Tree | Vegetation | Spreads like grass; replaces grass; slower but longer-lived |
| 🪷 Lily | Vegetation | Aquatic — spreads only onto water cells |
| 🐇 Herbivore | Animals | Eats grass/tree; flees predators; reproduces on cooldown |
| 🦊 Predator | Animals | Eats herbivores; reproduces on cooldown |

### Animal decision priority (each tick)

1. **Survival** *(herbivore only)* — if a predator is within 2 cells: flee or reproduce if cornered
2. **Seek food** — if energy < ⅔ of `reproThreshold`: move toward nearest food cell
3. **Reproduce** — if `reproCooldown = 0` and an empty neighbour exists: spawn offspring
4. **Wander** — move randomly (60 %) or idle (40 %)

### Vegetation spread bonuses

- Cells within Chebyshev distance 1–2 of water get a spread chance and lifespan bonus
- Soil: neutral (multiplier 1.0)
- Sand: reduced spread chance and lifespan (multiplier 0.65)
- Rock: strongly reduced spread chance and lifespan (multiplier 0.50)

---

## Headless balance runner

The runner executes many simulations back-to-back without a browser, collects population history, and reports balance metrics with tuning suggestions.

### How to run

```
npm run sim                         # uses scripts/sim-config.json + built-in defaults
node scripts/sim-runner.mjs         # same
node scripts/sim-runner.mjs --help  # full option list
```

### Where results go

By default the report is printed to the terminal (stdout).  
To save it, use `--output`:

```
node scripts/sim-runner.mjs --output=results.txt   # plain text (no color codes)
node scripts/sim-runner.mjs --output=results.json  # structured JSON
```

The JSON file contains the full config used, all per-species and ecosystem metrics, and a per-run summary (seed, tick count, final populations). It is suitable for further analysis or scripting.

### Config file — `scripts/sim-config.json`

Edit this file to set your baseline parameters. CLI flags always override it.

```json
{
  "runs":  30,       // number of independent runs (different seeds)
  "ticks": 500,      // max ticks per run (stops early if ecosystem stabilises)
  "size":  20,       // grid size — N×N cells

  "terrain": {
    "water": 15,     // % of cells that become water
    "rock":  10,     // % of cells that become rock
    "sand":  10      // % of cells that become sand  (remainder = soil)
  },

  "population": {
    "grass":     null,   // null = auto-scale from grid size
    "tree":      null,   //   baseline: grass=5 tree=3 lily=2 herb=4 pred=2
    "lily":      null,   //   on a 10×10 grid; scaled proportionally for larger grids
    "herbivore": null,
    "predator":  null
  },

  "rules": {
    "grassLifespan":       null,   // null = use rule default (grass=4, tree=6)
    "treeLifespan":        null,
    "herbLifespan":        null,   // null = 15
    "predLifespan":        null,   // null = 20
    "herbCooldownDivisor": null,   // reproduction cooldown = floor(lifespan ÷ divisor)
    "predCooldownDivisor": null    // higher divisor → shorter cooldown → more breeds per lifetime
  },

  "seed":   null,    // null = random base seed; each run uses seed+i
  "output": null     // null = terminal only; set a filename to save
}
```

### All CLI flags

```
--runs=N              Number of runs
--ticks=N             Max ticks per run
--size=N              Grid size N×N
--water=N             Water area %
--rock=N              Rock area %
--sand=N              Sand area %
--pop-grass=N         Initial grass count
--pop-tree=N          Initial tree count
--pop-lily=N          Initial lily count
--pop-herbivore=N     Initial herbivore count
--pop-predator=N      Initial predator count
--grass-lifespan=N    Grass baseLifespan
--tree-lifespan=N     Tree baseLifespan
--herb-lifespan=N     Herbivore baseLifespan
--pred-lifespan=N     Predator baseLifespan
--herb-cooldown=N     Herbivore reproCooldownDivisor
--pred-cooldown=N     Predator reproCooldownDivisor
--seed=HEX            Base seed (hex, e.g. deadbeef)
--output=FILE         Save report to .txt or .json
```

### Interpreting results

**Species table**

| Column | Meaning |
|---|---|
| Survive | % of runs where this species had > 0 population at the final tick |
| Ext. tick | Median tick when the species went extinct (only for runs where it did) |
| FinalPop | Mean population at the last tick (0 for runs where it died) |
| PeakPop | Mean highest population reached across all runs |
| Stability | Coefficient of variation (std / mean) over the last 20 % of the run — lower = steadier |

**Ecosystem block**

- **All 5 species at end** — the headline coexistence rate; target ≥ 50 %
- **Animal collapse** — % of runs where both animals went extinct; target ≤ 10 %
- **Pred:prey ratio** — mean predator-to-herbivore ratio in survivors; target ≈ 1:3 – 1:5
- **Veg:animal ratio** — mean vegetation-to-animal ratio; should be ≥ 2:1 to sustain herbivores

**Diagnostics** — named failure modes with concrete tuning suggestions:

| Pattern | Likely fix |
|---|---|
| Vegetation collapse | Increase grass/tree lifespan |
| Herbivore extinction | Increase herbivore lifespan or predator cooldown divisor |
| Predator collapse | Increase predator lifespan or reduce cooldown divisor |
| Predator overhunting | Decrease predator cooldown divisor (longer cooldown) or reduce initial count |
| Boom/bust oscillation | Slow predator reproduction (decrease cooldown divisor) |
| Vegetation sparse | Increase initial populations or reduce water % |

### Tuning workflow

1. Run with defaults to establish a baseline:
   ```
   npm run sim --output=baseline.json
   ```
2. Read the diagnostics and pick one parameter to change in `sim-config.json`
3. Re-run and compare the new "All 5 species at end" rate and species stability
4. Repeat until coexistence rate is satisfactory

Example — diagnostics say "predator overhunting":
```json
"rules": { "predCooldownDivisor": 6 }
```
Re-run. If herbivore survival improves but predators now collapse, try `5` instead.

---

## Project files

```
sign_of_life/
├── index.html                   # App entry point
├── vite.config.js               # Build config — base path, version/commit injection
├── scripts/
│   ├── sim-runner.mjs           # Headless batch runner
│   └── sim-config.json          # Default parameters for the runner
├── src/
│   ├── main.js                  # UI wiring — grid, renderer, loop, controls
│   ├── grid.js                  # Multi-layer SoA grid
│   ├── renderer.js              # Canvas renderer (terrain + corner-aware icons)
│   ├── actions.js               # pickAction, computeLifespan, proximity helpers
│   ├── serializer.js            # World encode/decode → base64url share string
│   ├── chart.js                 # Population chart (Canvas 2D)
│   ├── terrain-gen.js           # Seed+expand BFS terrain generator
│   ├── terrains/                # Terrain type definitions and effects
│   └── rules/
│       ├── index.js             # Rule registry
│       ├── grass-spread.js
│       ├── tree-spread.js
│       ├── lily-spread.js
│       ├── vegetation-aging.js
│       ├── herbivore-behavior.js
│       └── predator-behavior.js
├── PLAN.md                      # Architecture and milestone tracking
└── README.md                    # This file
```
