import { GRASS, LAYER_VEGETATION, LAYER_TERRAIN } from '../grid.js';
import { pickAction } from '../actions.js';
import { effectOf } from '../terrains/index.js';

export default {
  id: 'grass-spread',

  // Entity metadata used by renderer and legend.
  entity: {
    typeId: GRASS,
    layer:  LAYER_VEGETATION,
    name:   'Grass',
    icon:   '🌿',
    description: 'Fast-spreading ground cover. Can be replaced by trees.',
  },

  name: 'Grass Spread',
  description: 'Each grass cell may spread to one random adjacent empty cell per tick. Rate is affected by terrain.',

  /**
   * Action weights. SPREAD probability can be tuned; IDLE = do nothing.
   * Terrain effects further scale the actual spread chance.
   */
  actions: [
    { action: 'SPREAD', weight: 0.85 },
    { action: 'IDLE',   weight: 0.15 },
  ],

  apply(grid, rng) {
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

      // Terrain modulates the effective spread chance.
      const terrainChance = effectOf(grid.get(x, y, LAYER_TERRAIN), 'grassSpreadChance');
      if (rng() > terrainChance) continue;

      // Grass only spreads to empty cells (does not replace other vegetation).
      const targets = grid.spreadTargets(x, y, LAYER_VEGETATION, []);
      if (targets.length === 0) continue;

      const [nx, ny] = targets[Math.floor(rng() * targets.length)];
      grid.set(nx, ny, GRASS, LAYER_VEGETATION);
    }
  },
};
