import { LAYER_TERRAIN, SOIL, SAND, WATER, ROCK } from './grid.js';

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * Fills the terrain layer of the grid using a seed+expand BFS algorithm.
 * Produces irregular, natural-looking clusters. Fully reproducible from rng.
 *
 * @param {import('./grid.js').Grid} grid
 * @param {{ water: number, rock: number, sand: number }} pct
 *   Fractions of total area (0–1) for each non-soil type. Remainder = soil.
 * @param {function(): number} rng  Seeded RNG returning [0, 1).
 */
export function generateTerrain(grid, pct, rng) {
  const layer = grid.layers[LAYER_TERRAIN];
  layer.fill(SOIL); // default

  // Process in priority order: water first (impassable), then rock, then sand.
  // Each pass only expands onto existing SOIL cells so types don't overwrite each other.
  const passes = [
    { typeId: WATER, fraction: pct.water ?? 0 },
    { typeId: ROCK,  fraction: pct.rock  ?? 0 },
    { typeId: SAND,  fraction: pct.sand  ?? 0 },
  ];

  for (const { typeId, fraction } of passes) {
    if (fraction <= 0) continue;
    const target = Math.round(grid.size * Math.min(fraction, 1));
    _expandCluster(grid, layer, typeId, target, rng);
  }
}

/**
 * Places `targetCount` cells of `typeId` on the terrain layer using
 * seed+expand BFS. Seeds are placed on SOIL; expansion only overwrites SOIL.
 */
function _expandCluster(grid, layer, typeId, targetCount, rng) {
  const { width, height } = grid;

  // Number of seed points — more seeds = more fragmented clusters.
  const numSeeds = Math.max(1, Math.round(targetCount / 10));
  const frontier = [];

  for (let s = 0; s < numSeeds; s++) {
    // Try to find a SOIL cell for each seed (up to 100 attempts).
    for (let attempt = 0; attempt < 100; attempt++) {
      const x = Math.floor(rng() * width);
      const y = Math.floor(rng() * height);
      const i = y * width + x;
      if (layer[i] === SOIL) {
        layer[i] = typeId;
        frontier.push(i);
        break;
      }
    }
  }

  let placed = frontier.length;

  while (placed < targetCount && frontier.length > 0) {
    // Pick a random frontier cell to expand from.
    const fi   = Math.floor(rng() * frontier.length);
    const idx  = frontier[fi];
    const cx   = idx % width;
    const cy   = Math.floor(idx / width);

    // Collect SOIL neighbours.
    const soilNeighbors = [];
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const ni = ny * width + nx;
      if (layer[ni] === SOIL) soilNeighbors.push(ni);
    }

    if (soilNeighbors.length > 0) {
      const ni = soilNeighbors[Math.floor(rng() * soilNeighbors.length)];
      layer[ni] = typeId;
      frontier.push(ni);
      placed++;
    } else {
      // This cell is surrounded — remove from frontier.
      frontier.splice(fi, 1);
    }
  }
}
