import { TREE, GRASS, LAYER_VEGETATION, LAYER_TERRAIN } from '../grid.js';
import { pickAction } from '../actions.js';
import { effectOf } from '../terrains/index.js';

export default {
  id: 'tree-spread',

  // Entity metadata used by renderer and legend.
  entity: {
    typeId: TREE,
    layer:  LAYER_VEGETATION,
    name:   'Tree',
    icon:   '🌲',
    description: 'Slow-growing. Spreads onto empty cells and replaces grass.',
  },

  name: 'Tree Spread',
  description: 'Each tree may slowly spread to an adjacent empty cell or replace grass. Rate is affected by terrain.',

  /**
   * Trees are slow: high IDLE weight keeps spread infrequent.
   * Terrain effects further scale the spread chance.
   */
  actions: [
    { action: 'SPREAD', weight: 0.25 },
    { action: 'IDLE',   weight: 0.75 },
  ],

  apply(grid, rng) {
    // Snapshot before writing so newly placed trees don't spread in the same tick.
    const cells = [];
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.get(x, y, LAYER_VEGETATION) === TREE) cells.push([x, y]);
      }
    }

    for (const [x, y] of cells) {
      if (pickAction(this.actions, rng) === 'IDLE') continue;

      // Terrain modulates the effective spread chance.
      const terrainChance = effectOf(grid.get(x, y, LAYER_TERRAIN), 'treeSpreadChance');
      if (rng() > terrainChance) continue;

      // Trees can spread to empty cells OR replace grass.
      const targets = grid.spreadTargets(x, y, LAYER_VEGETATION, [GRASS]);
      if (targets.length === 0) continue;

      const [nx, ny] = targets[Math.floor(rng() * targets.length)];
      grid.set(nx, ny, TREE, LAYER_VEGETATION);
    }
  },
};
