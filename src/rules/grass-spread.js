import { GRASS } from '../grid.js';

export default {
  id: 'grass-spread',
  name: 'Grass Spread',
  description: 'Each grass cell spreads to one random empty adjacent cell per tick.',

  apply(grid) {
    // Snapshot positions before writing so newly placed grass
    // does not spread again in the same tick.
    const grassCells = [];
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.get(x, y) === GRASS) grassCells.push([x, y]);
      }
    }

    for (const [x, y] of grassCells) {
      const empty = grid.emptyNeighbors(x, y);
      if (empty.length === 0) continue;
      const [nx, ny] = empty[Math.floor(Math.random() * empty.length)];
      grid.set(nx, ny, GRASS);
    }
  },
};
