// ── Layer indices ──────────────────────────────────────────────────────────────
export const LAYER_TERRAIN    = 0;
export const LAYER_VEGETATION = 1;
export const LAYER_ANIMALS    = 2;
export const LAYER_EVENTS     = 3;
export const NUM_LAYERS       = 4;

// ── Universal ──────────────────────────────────────────────────────────────────
export const EMPTY = 0;

// ── Terrain states (typeId matches terrain module's typeId field) ───────────────
export const SOIL  = 1;
export const SAND  = 2;
export const WATER = 3;
export const ROCK  = 4;

// ── Vegetation states ──────────────────────────────────────────────────────────
export const GRASS = 1;
export const TREE  = 2;
export const LILY  = 3;  // aquatic vegetation — spreads on water cells

// ── Animal states ──────────────────────────────────────────────────────────────
export const HERBIVORE = 1;
export const PREDATOR  = 2;
export const OMNIVORE  = 3;  // eats plants AND herbivores; prey for predators

// ── 4-directional neighbour offsets ───────────────────────────────────────────
const DIRS_4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export class Grid {
  constructor(width = 10, height = 10) {
    this.width  = width;
    this.height = height;
    this.size   = width * height;

    // Structure of Arrays — one typed array per property per layer.
    //   layers[l]   Uint8Array   — entity type (0 = EMPTY)
    //   age[l]      Uint16Array  — ticks this entity has been alive
    //   lifespan[l] Uint16Array  — max ticks before entity dies (0 = immortal)
    //   energy[l]   Float32Array — energy level (meaningful for LAYER_ANIMALS)
    this.layers       = Array.from({ length: NUM_LAYERS }, () => new Uint8Array(this.size));
    this.age          = Array.from({ length: NUM_LAYERS }, () => new Uint16Array(this.size));
    this.lifespan     = Array.from({ length: NUM_LAYERS }, () => new Uint16Array(this.size));
    this.energy       = Array.from({ length: NUM_LAYERS }, () => new Float32Array(this.size));
    // Ticks remaining before this animal may reproduce again (0 = ready).
    this.reproCooldown = Array.from({ length: NUM_LAYERS }, () => new Uint16Array(this.size));
  }

  // ── Core accessors ───────────────────────────────────────────────────────────

  get(x, y, layer = LAYER_VEGETATION) {
    return this.layers[layer][y * this.width + x];
  }

  /**
   * Low-level type write. Does NOT touch age/lifespan/energy.
   * Use for terrain. Use place() for living entities.
   */
  set(x, y, state, layer = LAYER_VEGETATION) {
    this.layers[layer][y * this.width + x] = state;
  }

  /**
   * Place a living entity: set type, reset age to 0, assign lifespan and energy.
   */
  place(x, y, state, layer, lifespan = 0, energy = 0) {
    const i = y * this.width + x;
    this.layers[layer][i]   = state;
    this.age[layer][i]      = 0;
    this.lifespan[layer][i] = lifespan;
    this.energy[layer][i]   = energy;
  }

  /**
   * Remove a living entity: clear type, age, lifespan, and energy.
   */
  kill(x, y, layer) {
    const i = y * this.width + x;
    this.layers[layer][i]        = EMPTY;
    this.age[layer][i]           = 0;
    this.lifespan[layer][i]      = 0;
    this.energy[layer][i]        = 0;
    this.reproCooldown[layer][i] = 0;
  }

  /**
   * Move an entity from (fromX, fromY) to (toX, toY) on the same layer,
   * transferring all state (type, age, lifespan, energy).
   * The source cell is cleared.
   */
  move(fromX, fromY, toX, toY, layer) {
    const fi = fromY * this.width + fromX;
    const ti = toY  * this.width + toX;
    this.layers[layer][ti]        = this.layers[layer][fi];
    this.age[layer][ti]           = this.age[layer][fi];
    this.lifespan[layer][ti]      = this.lifespan[layer][fi];
    this.energy[layer][ti]        = this.energy[layer][fi];
    this.reproCooldown[layer][ti] = this.reproCooldown[layer][fi];
    this.layers[layer][fi]        = EMPTY;
    this.age[layer][fi]           = 0;
    this.lifespan[layer][fi]      = 0;
    this.energy[layer][fi]        = 0;
    this.reproCooldown[layer][fi] = 0;
  }

  inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  // ── Spread target queries ────────────────────────────────────────────────────

  /**
   * Returns [x, y] pairs of 4-neighbours where the given layer is EMPTY
   * or matches one of the replaceableStates.
   */
  spreadTargets(x, y, layer = LAYER_VEGETATION, replaceableStates = []) {
    const result = [];
    for (const [dx, dy] of DIRS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const state = this.layers[layer][ny * this.width + nx];
      if (state === EMPTY || replaceableStates.includes(state)) {
        result.push([nx, ny]);
      }
    }
    return result;
  }

  // ── Layer queries ────────────────────────────────────────────────────────────

  countState(state, layer = LAYER_VEGETATION) {
    let n = 0;
    const arr = this.layers[layer];
    for (let i = 0; i < this.size; i++) {
      if (arr[i] === state) n++;
    }
    return n;
  }

  isLayerFull(layer = LAYER_VEGETATION) {
    const arr = this.layers[layer];
    for (let i = 0; i < this.size; i++) {
      if (arr[i] === EMPTY) return false;
    }
    return true;
  }

  // ── Mutation helpers ─────────────────────────────────────────────────────────

  clearLayer(layer) {
    this.layers[layer].fill(EMPTY);
    this.age[layer].fill(0);
    this.lifespan[layer].fill(0);
    this.energy[layer].fill(0);
    this.reproCooldown[layer].fill(0);
  }

  clearAll() {
    for (let l = 0; l < NUM_LAYERS; l++) {
      this.layers[l].fill(EMPTY);
      this.age[l].fill(0);
      this.lifespan[l].fill(0);
      this.energy[l].fill(0);
      this.reproCooldown[l].fill(0);
    }
  }
}
