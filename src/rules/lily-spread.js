import { LILY, WATER, LAYER_VEGETATION, LAYER_TERRAIN, EMPTY } from '../grid.js';
import { pickAction, computeLifespan } from '../actions.js';
import { effectOf } from '../terrains/index.js';

export default {
  id: 'lily-spread',
  category: 'Vegetation',
  tags: ['vegetation', 'spread', 'aquatic'],

  entity: {
    typeId:           LILY,
    layer:            LAYER_VEGETATION,
    name:             'Lily',
    icon:             '🪷',
    description:      'Aquatic plant. Spreads across water surfaces.',
    baseLifespan:     6,
    lifespanVariance: 0.2,
  },

  name: 'Lily Spread',
  description: 'Lily pads spread across adjacent water cells. Cannot grow on land.',

  actions: [
    { action: 'SPREAD', weight: 0.70 },
    { action: 'IDLE',   weight: 0.30 },
  ],

  apply(grid, rng, events) {
    const { baseLifespan, lifespanVariance } = this.entity;

    // Snapshot before writing so new lilies don't spread in the same tick.
    const cells = [];
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.get(x, y, LAYER_VEGETATION) === LILY) cells.push([x, y]);
      }
    }

    for (const [x, y] of cells) {
      if (pickAction(this.actions, rng) === 'IDLE') continue;

      // Spread chance modulated by terrain effect (water = 1.0 by default).
      const terrainChance = effectOf(grid.get(x, y, LAYER_TERRAIN), 'aquaticGrassSpreadChance');
      if (rng() > terrainChance) continue;

      // Only spread to adjacent water cells that have no vegetation yet.
      const targets = [];
      for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
        const nx = x + dx, ny = y + dy;
        if (!grid.inBounds(nx, ny)) continue;
        if (grid.get(nx, ny, LAYER_TERRAIN) !== WATER) continue;
        if (grid.get(nx, ny, LAYER_VEGETATION) !== EMPTY) continue;
        targets.push([nx, ny]);
      }
      if (targets.length === 0) continue;

      const [nx, ny] = targets[Math.floor(rng() * targets.length)];
      grid.place(nx, ny, LILY, LAYER_VEGETATION,
        computeLifespan(baseLifespan, lifespanVariance, rng));
      events.log('birth', LILY, LAYER_VEGETATION);
    }
  },
};
