import { HERBIVORE, GRASS, TREE, LAYER_ANIMALS, LAYER_VEGETATION, LAYER_TERRAIN } from '../grid.js';
import { computeLifespan, nearestFoodCell, emptyAnimalNeighbors } from '../actions.js';
import { effectOf } from '../terrains/index.js';

const FOOD_TYPES = [GRASS, TREE];

export default {
  id: 'herbivore-behavior',
  category: 'Animals',
  tags: ['animal', 'herbivore', 'behavior'],

  entity: {
    typeId:               HERBIVORE,
    layer:                LAYER_ANIMALS,
    name:                 'Herbivore',
    icon:                 '🐇',
    description:          'Eats grass and trees. Moves, reproduces, dies of age or starvation.',
    baseLifespan:         15,
    lifespanVariance:     0.2,
    baseEnergy:           10,
    energyDecayPerTick:   0.8,
    energyFromGrass:      6,
    energyFromTree:       3,
    reproThreshold:       12,
    reproCost:            8,
    reproCooldownDivisor: 4,
    spawnNearFood: { layer: LAYER_VEGETATION, types: FOOD_TYPES },
  },

  name: 'Herbivore Behaviour',
  description: 'Herbivores seek food when hungry, reproduce when well-fed, otherwise wander.',

  apply(grid, rng, events, movedThisTick = new Set()) {
    const e = this.entity;
    const al = LAYER_ANIMALS;
    const hungerThreshold = e.reproThreshold * (2 / 3);

    const cells = [];
    for (let y = 0; y < grid.height; y++)
      for (let x = 0; x < grid.width; x++)
        if (grid.get(x, y, al) === HERBIVORE) cells.push([x, y]);

    for (const [x, y] of cells) {
      if (grid.get(x, y, al) !== HERBIVORE) continue;
      const i = y * grid.width + x;

      // ── Passive energy decay ─────────────────────────────────────────────────
      const terrainCost = effectOf(grid.get(x, y, LAYER_TERRAIN), 'moveEnergyCost');
      grid.energy[al][i] -= e.energyDecayPerTick * terrainCost;

      // ── Age & repro cooldown ─────────────────────────────────────────────────
      grid.age[al][i]++;
      if (grid.reproCooldown[al][i] > 0) grid.reproCooldown[al][i]--;

      // ── Death ────────────────────────────────────────────────────────────────
      const starved = grid.energy[al][i] <= 0;
      const aged    = grid.lifespan[al][i] > 0 && grid.age[al][i] >= grid.lifespan[al][i];
      if (starved || aged) {
        events.log(starved ? 'death-starve' : 'death-age', HERBIVORE, al);
        grid.kill(x, y, al);
        continue;
      }

      const energy = grid.energy[al][i];

      // ── 1. Hungry: seek food deterministically ───────────────────────────────
      if (energy < hungerThreshold) {
        const vegType = grid.get(x, y, LAYER_VEGETATION);
        if (vegType === GRASS || vegType === TREE) {
          // Food is right here — eat it.
          grid.energy[al][i] += vegType === GRASS ? e.energyFromGrass : e.energyFromTree;
          grid.kill(x, y, LAYER_VEGETATION);
          events.log(vegType === GRASS ? 'eat-grass' : 'eat-tree', HERBIVORE, al);
        } else {
          // Move toward the nearest food cell.
          const nearest = nearestFoodCell(grid, x, y, LAYER_VEGETATION, FOOD_TYPES);
          const targets = emptyAnimalNeighbors(grid, x, y, al);
          if (nearest && targets.length > 0) {
            const [fx, fy] = nearest;
            let bestDist = Infinity;
            for (const [nx, ny] of targets) {
              const d = Math.abs(nx - fx) + Math.abs(ny - fy);
              if (d < bestDist) bestDist = d;
            }
            const best = targets.filter(([nx, ny]) => Math.abs(nx - fx) + Math.abs(ny - fy) === bestDist);
            const [nx, ny] = best[Math.floor(rng() * best.length)];
            grid.move(x, y, nx, ny, al);
            movedThisTick.add(ny * grid.width + nx);
          } else if (targets.length > 0) {
            // No food exists anywhere — wander randomly.
            const [nx, ny] = targets[Math.floor(rng() * targets.length)];
            grid.move(x, y, nx, ny, al);
            movedThisTick.add(ny * grid.width + nx);
          }
        }

      // ── 2. Well-fed and ready to reproduce ───────────────────────────────────
      } else if (energy >= e.reproThreshold && grid.reproCooldown[al][i] === 0) {
        const targets = emptyAnimalNeighbors(grid, x, y, al);
        if (targets.length > 0) {
          const [nx, ny] = targets[Math.floor(rng() * targets.length)];
          grid.energy[al][i] -= e.reproCost;
          const ls = computeLifespan(e.baseLifespan, e.lifespanVariance, rng);
          const cooldown = Math.max(1, Math.floor(ls / e.reproCooldownDivisor));
          grid.place(nx, ny, HERBIVORE, al, ls, e.baseEnergy);
          // Parent cooldown.
          grid.reproCooldown[al][i] = Math.max(1, Math.floor(grid.lifespan[al][i] / e.reproCooldownDivisor));
          // Newborn starts on cooldown so it can't reproduce immediately.
          grid.reproCooldown[al][ny * grid.width + nx] = cooldown;
          events.log('birth', HERBIVORE, al);
        }

      // ── 3. Well-fed but on cooldown: wander or idle ──────────────────────────
      } else {
        if (rng() < 0.6) {
          const targets = emptyAnimalNeighbors(grid, x, y, al);
          if (targets.length > 0) {
            const [nx, ny] = targets[Math.floor(rng() * targets.length)];
            grid.move(x, y, nx, ny, al);
            movedThisTick.add(ny * grid.width + nx);
          }
        }
        // else IDLE
      }
    }
  },
};
