import { PREDATOR, HERBIVORE, LAYER_ANIMALS, LAYER_TERRAIN } from '../grid.js';
import { computeLifespan, nearestFoodCell, emptyAnimalNeighbors } from '../actions.js';
import { effectOf } from '../terrains/index.js';

export default {
  id: 'predator-behavior',
  category: 'Animals',
  tags: ['animal', 'predator', 'behavior'],

  entity: {
    typeId:               PREDATOR,
    layer:                LAYER_ANIMALS,
    name:                 'Predator',
    icon:                 '🦊',
    description:          'Hunts herbivores. Dies of age or starvation.',
    baseLifespan:         20,
    lifespanVariance:     0.2,
    baseEnergy:           15,
    energyDecayPerTick:   1.2,
    energyFromHerbivore:  12,
    reproThreshold:       20,
    reproCost:            10,
    reproCooldownDivisor: 4,
    spawnNearFood: { layer: LAYER_ANIMALS, types: [HERBIVORE] },
  },

  name: 'Predator Behaviour',
  description: 'Predators seek herbivores when hungry, reproduce when well-fed, otherwise wander.',

  apply(grid, rng, events, movedThisTick = new Set()) {
    const e = this.entity;
    const al = LAYER_ANIMALS;
    const hungerThreshold = e.reproThreshold * (2 / 3);

    const cells = [];
    for (let y = 0; y < grid.height; y++)
      for (let x = 0; x < grid.width; x++)
        if (grid.get(x, y, al) === PREDATOR) cells.push([x, y]);

    for (const [x, y] of cells) {
      if (grid.get(x, y, al) !== PREDATOR) continue;
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
        events.log(starved ? 'death-starve' : 'death-age', PREDATOR, al);
        grid.kill(x, y, al);
        continue;
      }

      const energy = grid.energy[al][i];

      // ── 1. Hungry: seek prey deterministically ───────────────────────────────
      if (energy < hungerThreshold) {
        // Check adjacent cells for prey first.
        const prey = grid.spreadTargets(x, y, al, [HERBIVORE])
          .filter(([nx, ny]) => grid.get(nx, ny, al) === HERBIVORE);

        if (prey.length > 0) {
          // Eat adjacent prey — move into its cell.
          const [nx, ny] = prey[Math.floor(rng() * prey.length)];
          grid.energy[al][i] += e.energyFromHerbivore;
          events.log('death-eaten', HERBIVORE, al);
          events.log('eat-animal', PREDATOR, al);
          grid.move(x, y, nx, ny, al);
          movedThisTick.add(ny * grid.width + nx);
        } else {
          // Move toward nearest herbivore.
          const nearest = nearestFoodCell(grid, x, y, al, [HERBIVORE]);
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
            // No prey anywhere — wander randomly.
            const [nx, ny] = targets[Math.floor(rng() * targets.length)];
            grid.move(x, y, nx, ny, al);
            movedThisTick.add(ny * grid.width + nx);
          }
        }

      // ── 2. Ready to reproduce ────────────────────────────────────────────────
      } else if (grid.reproCooldown[al][i] === 0) {
        const targets = emptyAnimalNeighbors(grid, x, y, al);
        if (targets.length > 0) {
          const [nx, ny] = targets[Math.floor(rng() * targets.length)];
          const ls = computeLifespan(e.baseLifespan, e.lifespanVariance, rng);
          const cooldown = Math.max(1, Math.floor(ls / e.reproCooldownDivisor));
          grid.place(nx, ny, PREDATOR, al, ls, e.baseEnergy);
          // Parent cooldown.
          grid.reproCooldown[al][i] = Math.max(1, Math.floor(grid.lifespan[al][i] / e.reproCooldownDivisor));
          // Newborn starts on cooldown.
          grid.reproCooldown[al][ny * grid.width + nx] = cooldown;
          events.log('birth', PREDATOR, al);
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
