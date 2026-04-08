import { GRASS, LAYER_VEGETATION } from '../grid.js';

export default {
  id: 'grass-spread',
  name: 'Grass Spread',
  description: 'Each grass cell spreads to one random empty adjacent cell per tick.',

  apply(grid, rng) {
    // Snapshot positions before writing so newly placed grass
    // does not spread again in the same tick.
    const grassCells = [];
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.get(x, y, LAYER_VEGETATION) === GRASS) grassCells.push([x, y]);
      }
    }

    for (const [x, y] of grassCells) {
      const empty = grid.emptyNeighbors(x, y, LAYER_VEGETATION);
      if (empty.length === 0) continue;
      const [nx, ny] = empty[Math.floor(rng() * empty.length)];
      grid.set(nx, ny, GRASS, LAYER_VEGETATION);
    }
  },
};
