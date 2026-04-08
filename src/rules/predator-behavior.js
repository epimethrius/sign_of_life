import { PREDATOR, HERBIVORE, WATER, LAYER_ANIMALS, LAYER_TERRAIN } from '../grid.js';
import { pickActionDynamic, computeLifespan } from '../actions.js';
import { effectOf } from '../terrains/index.js';

export default {
  id: 'predator-behavior',
  category: 'Animals',
  tags: ['animal', 'predator', 'behavior'],

  entity: {
    typeId:             PREDATOR,
    layer:              LAYER_ANIMALS,
    name:               'Predator',
    icon:               '🦊',
    description:        'Hunts herbivores. Dies of age or starvation.',
    baseLifespan:       20,
    lifespanVariance:   0.2,
    baseEnergy:         15,
    energyDecayPerTick: 1.2,
    energyFromHerbivore: 12,
    reproThreshold:       20,
    reproCost:            10,
    reproCooldownDivisor: 4,  // cooldown = floor(lifespan / divisor) ticks after each birth
    // Spawn constraint: place within 2 cells (Chebyshev) of a herbivore.
    spawnNearFood: { layer: LAYER_ANIMALS, types: [HERBIVORE] },
  },

  name: 'Predator Behaviour',
  description: 'Predators hunt adjacent herbivores, reproduce, and die of age or starvation.',

  actions: [
    { action: 'EAT',       weight: 0.50 },
    { action: 'MOVE',      weight: 0.30 },
    { action: 'REPRODUCE', weight: 0.15 },
    { action: 'IDLE',      weight: 0.05 },
  ],

  apply(grid, rng, events, movedThisTick = new Set()) {
    const e = this.entity;
    const animalLayer = LAYER_ANIMALS;

    const cells = [];
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.get(x, y, animalLayer) === PREDATOR) cells.push([x, y]);
      }
    }

    for (const [x, y] of cells) {
      if (grid.get(x, y, animalLayer) !== PREDATOR) continue;

      const i = y * grid.width + x;

      // ── Passive energy decay ────────────────────────────────────────────────
      const terrainCost = effectOf(grid.get(x, y, LAYER_TERRAIN), 'moveEnergyCost');
      grid.energy[animalLayer][i] -= e.energyDecayPerTick * terrainCost;

      // ── Age & repro cooldown ────────────────────────────────────────────────
      grid.age[animalLayer][i]++;
      if (grid.reproCooldown[animalLayer][i] > 0) grid.reproCooldown[animalLayer][i]--;

      // ── Death ───────────────────────────────────────────────────────────────
      const starved = grid.energy[animalLayer][i] <= 0;
      const aged    = grid.lifespan[animalLayer][i] > 0
                   && grid.age[animalLayer][i] >= grid.lifespan[animalLayer][i];

      if (starved || aged) {
        events.log(starved ? 'death-starve' : 'death-age', PREDATOR, animalLayer);
        grid.kill(x, y, animalLayer);
        continue;
      }

      // ── Action ──────────────────────────────────────────────────────────────
      const action = pickActionDynamic(this.actions, grid.energy[animalLayer][i], e.reproThreshold, rng);

      if (action === 'EAT') {
        // Move into an adjacent cell occupied by a herbivore and eat it.
        const prey = grid.spreadTargets(x, y, animalLayer, [HERBIVORE])
          .filter(([nx, ny]) => grid.get(nx, ny, animalLayer) === HERBIVORE);
        if (prey.length > 0) {
          const [nx, ny] = prey[Math.floor(rng() * prey.length)];
          events.log('death-eaten', HERBIVORE, animalLayer);
          events.log('eat-animal', PREDATOR, animalLayer);
          grid.energy[animalLayer][i] += e.energyFromHerbivore;
          // Move predator into the prey's cell (overwriting it).
          grid.move(x, y, nx, ny, animalLayer);
          movedThisTick.add(ny * grid.width + nx);
        } else {
          // No prey nearby — try to move toward any cell instead.
          const targets = grid.spreadTargets(x, y, animalLayer, [])
            .filter(([nx, ny]) => grid.get(nx, ny, LAYER_TERRAIN) !== WATER);
          if (targets.length > 0) {
            const [nx, ny] = targets[Math.floor(rng() * targets.length)];
            grid.move(x, y, nx, ny, animalLayer);
            movedThisTick.add(ny * grid.width + nx);
          }
        }

      } else if (action === 'MOVE') {
        const targets = grid.spreadTargets(x, y, animalLayer, [])
          .filter(([nx, ny]) => grid.get(nx, ny, LAYER_TERRAIN) !== WATER);
        if (targets.length > 0) {
          const [nx, ny] = targets[Math.floor(rng() * targets.length)];
          grid.move(x, y, nx, ny, animalLayer);
          movedThisTick.add(ny * grid.width + nx);
        }

      } else if (action === 'REPRODUCE') {
        if (grid.energy[animalLayer][i] >= e.reproThreshold
            && grid.reproCooldown[animalLayer][i] === 0) {
          const targets = grid.spreadTargets(x, y, animalLayer, [])
            .filter(([nx, ny]) => grid.get(nx, ny, LAYER_TERRAIN) !== WATER);
          if (targets.length > 0) {
            const [nx, ny] = targets[Math.floor(rng() * targets.length)];
            grid.energy[animalLayer][i] -= e.reproCost;
            const ls = computeLifespan(e.baseLifespan, e.lifespanVariance, rng);
            grid.place(nx, ny, PREDATOR, animalLayer, ls, e.baseEnergy);
            grid.reproCooldown[animalLayer][i] = Math.max(1, Math.floor(grid.lifespan[animalLayer][i] / e.reproCooldownDivisor));
            events.log('birth', PREDATOR, animalLayer);
          }
        }
      }
    }
  },
};
