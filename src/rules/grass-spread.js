import { GRASS, LAYER_VEGETATION, LAYER_TERRAIN } from '../grid.js';
import { pickAction, computeLifespan } from '../actions.js';
import { effectOf } from '../terrains/index.js';

export default {
  id: 'grass-spread',

  // Entity metadata used by renderer, legend, and aging rule.
  entity: {
    typeId:          GRASS,
    layer:           LAYER_VEGETATION,
    name:            'Grass',
    icon:            '🌿',
    description:     'Fast-spreading ground cover. Can be replaced by trees.',
    baseLifespan:    4,    // ticks — adjustable in UI
    lifespanVariance: 0.2, // ±20% — adjustable in UI
  },

  name: 'Grass Spread',
  description: 'Each grass cell may spread to one random adjacent empty cell per tick. Rate is affected by terrain.',

  actions: [
    { action: 'SPREAD', weight: 0.85 },
    { action: 'IDLE',   weight: 0.15 },
  ],

  apply(grid, rng) {
    const { baseLifespan, lifespanVariance } = this.entity;

    // Snapshot positions before writing so newly placed grass
    // does not spread again in the same tick.
    const cells = [];
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.get(x, y, LAYER_VEGETATION) === GRASS) cells.push([x, y]);
      }
    }

    for (const [x, y] of cells) {
      if (pickAction(this.actions, rng) === 'IDLE') continue;

      // Terrain at source modulates spread probability.
      const terrainChance = effectOf(grid.get(x, y, LAYER_TERRAIN), 'grassSpreadChance');
      if (rng() > terrainChance) continue;

      // Only spread to cells where the target terrain also permits grass.
      const targets = grid.spreadTargets(x, y, LAYER_VEGETATION, [])
        .filter(([nx, ny]) => effectOf(grid.get(nx, ny, LAYER_TERRAIN), 'grassSpreadChance') > 0);
      if (targets.length === 0) continue;

      const [nx, ny] = targets[Math.floor(rng() * targets.length)];
      grid.place(nx, ny, GRASS, LAYER_VEGETATION, computeLifespan(baseLifespan, lifespanVariance, rng));
    }
  },
};
