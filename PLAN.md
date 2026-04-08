# Sign of Life — Project Plan

A browser-based explorer for cellular automata variations.

---

## Goals

- Run locally in any browser with no install (just `npx vite` or open `index.html`)
- Deployable to the web with a single build command (GitHub Pages / Netlify)
- Pluggable rule engine: swap CA variants without touching the core loop
- Simple canvas visualization to start; complexity added later

---

## Tech Stack

| Concern | Choice | Rationale |
|---|---|---|
| Runtime | Browser (Canvas 2D API) | Zero dependencies, universal |
| Build / Dev server | [Vite](https://vitejs.dev/) | Zero-config, instant HMR, static output |
| Language | Vanilla JS (ES modules) | No framework overhead; easy to evolve |
| Deployment | GitHub Pages or Netlify | Static build output from `vite build` |

> **Local without Node:** Open `index.html` directly works for the core loop.  
> **With Node:** `npx vite` gives HMR and module resolution.

---

## Architecture

```
sign_of_life/
├── index.html          # Entry point — canvas + minimal UI shell
├── src/
│   ├── main.js         # Bootstrap: wires grid, renderer, loop, UI
│   ├── grid.js         # Grid state: flat TypedArray, step(), get/set cell
│   ├── loop.js         # requestAnimationFrame game loop, speed control
│   ├── renderer.js     # Canvas draw: cells → pixels (color by state)
│   ├── ui.js           # Controls: play/pause, speed, grid size, rule picker
│   └── rules/
│       ├── index.js    # Rule registry (name → rule object)
│       ├── conway.js   # B3/S23 — Conway's Game of Life
│       ├── highlife.js # B36/S23
│       ├── brians-brain.js  # 3-state: dead → alive → dying → dead
│       └── seeds.js    # B2/S0 — Seeds
├── package.json
├── vite.config.js
├── PLAN.md
└── LICENSE
```

---

## Rule Interface

Each rule module exports an object:

```js
export default {
  name: "Conway's Game of Life",
  states: 2,           // number of distinct cell states
  step(grid, x, y) {  // returns next state for cell at (x, y)
    // reads neighbours via grid.get(nx, ny)
  },
  color(state) {       // returns CSS color string for a state
  },
}
```

The grid's `step()` applies the current rule to every cell, producing the next generation.

---

## Grid Design

- Flat `Uint8Array` — one byte per cell, supports up to 256 states
- Toroidal (wrap-around edges) by default
- Double-buffered: read from current, write to next, then swap
- Configurable size (default 128×128)

---

## Rule Interface

Each rule module exports an object:

```js
export default {
  id: 'unique-id',
  name: 'Human-readable name',
  description: 'What this rule does.',
  apply(grid) {
    // reads grid state, writes next generation in-place
    // must snapshot before writing to avoid tick-order artifacts
  }
}
```

Rules are registered in `src/rules/index.js`. The UI renders a checkbox per rule so the user can enable/disable each one independently. Enabled rules are applied in registration order each tick.

---

## Milestones

### M1 — Grass Simulation (current focus)

**Field:** 10×10, no wrap-around edges.  
**Entity:** Grass (single type). One cell seeded randomly at start.  
**Rule (grass-spread):** Each tick, every grass cell picks one random empty 4-neighbor and fills it with grass. If all 4 neighbors are occupied (or the cell is at a border with no empty neighbors), nothing happens.  
**End condition:** Simulation stops automatically when the field is completely full.

Files:
- [x] `package.json` — Vite dev/build scripts
- [x] `index.html` — canvas + minimal UI shell
- [x] `src/grid.js` — 10×10 `Uint8Array`, `get/set`, `emptyNeighbors()`, `isFull()`
- [x] `src/renderer.js` — draws grid to canvas each frame
- [x] `src/loop.js` — `setTimeout`-based tick loop, manual/auto mode, configurable delay
- [x] `src/rules/grass-spread.js` — the grass spread rule
- [x] `src/rules/index.js` — rule registry with enable/disable
- [x] `src/main.js` — wires grid, renderer, loop, rules, UI events

UI controls:
- Canvas (field visualization)
- "Next Tick" button (manual step, disabled when auto is on)
- "Reset" button (re-seeds a fresh single grass cell)
- Manual / Auto toggle checkbox
- Delay text input (ms, default 500)
- Rule checkboxes (one per registered rule)
- Status line: generation count, grass cell count, "Field full!" message

### M2 — More Entities & Rules
- [ ] Rule registry + UI already in place from M1 — just add rule files
- [ ] New entity types (e.g. water, fire, rock)
- [ ] New rules (spread with probability, decay, competition)
- [ ] Random-fill and clear buttons

### M3 — Interactivity
- [ ] Click/drag to paint cells on canvas
- [ ] Grid size selector (restart simulation)

### M4 — Deployment
- [ ] GitHub Actions workflow → build → GitHub Pages
- [ ] README with usage instructions

### M5 — Visualization Upgrades (later)
- [ ] Color themes / cell age gradient
- [ ] Zoom & pan
- [ ] Pattern presets

---

## Deferred / Out of Scope (for now)

- Server-side computation
- WebGL renderer
- Multiplayer / shared state
- Mobile touch optimization
