// ── Layer indices ──────────────────────────────────────────────────────────────
export const LAYER_TERRAIN    = 0;
export const LAYER_VEGETATION = 1;
export const LAYER_ANIMALS    = 2;
export const LAYER_EVENTS     = 3;
export const NUM_LAYERS       = 4;

// ── Universal ──────────────────────────────────────────────────────────────────
export const EMPTY = 0;

// ── Terrain states ─────────────────────────────────────────────────────────────
export const SOIL  = 1;
export const WATER = 2;
export const ROCK  = 3;

// ── Vegetation states ──────────────────────────────────────────────────────────
export const GRASS = 1;
export const TREE  = 2;

// ── 4-directional neighbour offsets ───────────────────────────────────────────
const NEIGHBORS_4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export class Grid {
  constructor(width = 10, height = 10) {
    this.width  = width;
    this.height = height;
    this.size   = width * height;

    // Structure of Arrays — one Uint8Array per layer.
    // Future trait arrays (e.g. energy, age) go here as separate typed arrays,
    // not as fields inside a per-cell object.
    this.layers = Array.from({ length: NUM_LAYERS }, () => new Uint8Array(this.size));
  }

  // ── Core accessors ───────────────────────────────────────────────────────────

  get(x, y, layer = LAYER_VEGETATION) {
    return this.layers[layer][y * this.width + x];
  }

  set(x, y, state, layer = LAYER_VEGETATION) {
    this.layers[layer][y * this.width + x] = state;
  }

  inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  // ── Neighbour queries ────────────────────────────────────────────────────────

  // Returns [x, y] pairs of 4-neighbours where the given layer is EMPTY.
  emptyNeighbors(x, y, layer = LAYER_VEGETATION) {
    const result = [];
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (this.inBounds(nx, ny) && this.layers[layer][ny * this.width + nx] === EMPTY) {
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
  }

  clearAll() {
    for (const arr of this.layers) arr.fill(EMPTY);
  }
}
