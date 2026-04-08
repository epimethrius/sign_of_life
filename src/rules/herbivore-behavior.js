import { HERBIVORE, GRASS, TREE, WATER, LAYER_ANIMALS, LAYER_VEGETATION, LAYER_TERRAIN } from '../grid.js';
import { pickAction, computeLifespan } from '../actions.js';
import { effectOf } from '../terrains/index.js';

export default {
  id: 'herbivore-behavior',
  category: 'Animals',
  tags: ['animal', 'herbivore', 'behavior'],

  entity: {
    typeId:             HERBIVORE,
    layer:              LAYER_ANIMALS,
    name:               'Herbivore',
    icon:               '🐇',
    description:        'Eats grass and trees. Moves, reproduces, dies of age or starvation.',
    baseLifespan:       15,
    lifespanVariance:   0.2,
    baseEnergy:         10,
    energyDecayPerTick: 0.8,
    energyFromGrass:    6,
    energyFromTree:     3,
    reproThreshold:     12,        // lowered so reproduction is observable
    reproCost:          8,
    // Spawn constraint: place within 2 cells (Chebyshev) of compatible food.
    spawnNearFood: { layer: LAYER_VEGETATION, types: [GRASS, TREE] },
  },

  name: 'Herbivore Behaviour',
  description: 'Herbivores eat vegetation, wander, reproduce, and die of age or starvation.',

  actions: [
    { action: 'EAT',       weight: 0.40 },
    { action: 'MOVE',      weight: 0.35 },
    { action: 'REPRODUCE', weight: 0.15 },
    { action: 'IDLE',      weight: 0.10 },
  ],

  apply(grid, rng, events) {
    const e = this.entity;
    const animalLayer = LAYER_ANIMALS;

    // Snapshot occupied cells before writing.
    const cells = [];
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.get(x, y, animalLayer) === HERBIVORE) cells.push([x, y]);
      }
    }

    for (const [x, y] of cells) {
      // Skip if already killed this tick (e.g. by a predator earlier in the loop).
      if (grid.get(x, y, animalLayer) !== HERBIVORE) continue;

      const i = y * grid.width + x;

      // ── Passive energy decay (terrain-modified) ─────────────────────────────
      const terrainCost = effectOf(grid.get(x, y, LAYER_TERRAIN), 'moveEnergyCost');
      grid.energy[animalLayer][i] -= e.energyDecayPerTick * terrainCost;

      // ── Age ─────────────────────────────────────────────────────────────────
      grid.age[animalLayer][i]++;

      // ── Death: starvation or old age ────────────────────────────────────────
      const starved = grid.energy[animalLayer][i] <= 0;
      const aged    = grid.lifespan[animalLayer][i] > 0
                   && grid.age[animalLayer][i] >= grid.lifespan[animalLayer][i];

      if (starved || aged) {
        events.log(starved ? 'death-starve' : 'death-age', HERBIVORE, animalLayer);
        grid.kill(x, y, animalLayer);
        continue;
      }

      // ── Action ──────────────────────────────────────────────────────────────
      const action = pickAction(this.actions, rng);

      if (action === 'EAT') {
        const vegType = grid.get(x, y, LAYER_VEGETATION);
        if (vegType === GRASS) {
          grid.energy[animalLayer][i] += e.energyFromGrass;
          grid.kill(x, y, LAYER_VEGETATION);
          events.log('eat-grass', HERBIVORE, animalLayer);
        } else if (vegType === TREE) {
          grid.energy[animalLayer][i] += e.energyFromTree;
          grid.kill(x, y, LAYER_VEGETATION);
          events.log('eat-tree', HERBIVORE, animalLayer);
        }

      } else if (action === 'MOVE') {
        const targets = grid.spreadTargets(x, y, animalLayer, [])
          .filter(([nx, ny]) => grid.get(nx, ny, LAYER_TERRAIN) !== WATER);
        if (targets.length > 0) {
          const [nx, ny] = targets[Math.floor(rng() * targets.length)];
          grid.move(x, y, nx, ny, animalLayer);
        }

      } else if (action === 'REPRODUCE') {
        if (grid.energy[animalLayer][i] >= e.reproThreshold) {
          const targets = grid.spreadTargets(x, y, animalLayer, [])
            .filter(([nx, ny]) => grid.get(nx, ny, LAYER_TERRAIN) !== WATER);
          if (targets.length > 0) {
            const [nx, ny] = targets[Math.floor(rng() * targets.length)];
            grid.energy[animalLayer][i] -= e.reproCost;
            const ls = computeLifespan(e.baseLifespan, e.lifespanVariance, rng);
            grid.place(nx, ny, HERBIVORE, animalLayer, ls, e.baseEnergy);
            events.log('birth', HERBIVORE, animalLayer);
          }
        }
      }
      // IDLE: do nothing
    }
  },
};
