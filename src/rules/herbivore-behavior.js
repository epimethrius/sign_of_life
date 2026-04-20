import { HERBIVORE, PREDATOR, GRASS, TREE, LAYER_ANIMALS, LAYER_VEGETATION, LAYER_TERRAIN } from '../grid.js';
import { computeLifespan, nearestFoodCell, emptyAnimalNeighbors, mutate } from '../actions.js';
import { effectOf } from '../terrains/index.js';
import { getSeasonEffect } from '../season-state.js';

const FOOD_TYPES = [GRASS, TREE];
const DANGER_RADIUS = 2; // Chebyshev distance at which a predator is detected
const FLEE_PROB     = 0.75; // Probability of actually fleeing when a threat is detected

/** Returns [x, y] of the nearest predator within DANGER_RADIUS, or null. */
function nearestThreat(grid, x, y) {
  let bestDist = Infinity;
  let bestPos  = null;
  for (let dy = -DANGER_RADIUS; dy <= DANGER_RADIUS; dy++) {
    for (let dx = -DANGER_RADIUS; dx <= DANGER_RADIUS; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      if (grid.get(nx, ny, LAYER_ANIMALS) !== PREDATOR) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      if (d < bestDist) { bestDist = d; bestPos = [nx, ny]; }
    }
  }
  return bestPos;
}

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
    baseLifespan:         35,
    lifespanVariance:     0.4,
    baseEnergy:           12,
    energyDecayPerTick:   0.3,
    energyFromGrass:      6,
    energyFromTree:       6,
    reproThreshold:       10,
    reproCost:            5,
    reproCooldownDivisor: 3,
    spawnNearFood: { layer: LAYER_VEGETATION, types: FOOD_TYPES },
  },

  name: 'Herbivore Behaviour',
  description: 'Herbivores seek food when hungry, reproduce when well-fed, otherwise wander.',

  apply(grid, rng, events, movedThisTick = new Set()) {
    const e = this.entity;
    const al = LAYER_ANIMALS;
    const decayMult = getSeasonEffect('energyDecay');

    const cells = [];
    for (let y = 0; y < grid.height; y++)
      for (let x = 0; x < grid.width; x++)
        if (grid.get(x, y, al) === HERBIVORE) cells.push([x, y]);

    for (const [x, y] of cells) {
      if (grid.get(x, y, al) !== HERBIVORE) continue;
      const i = y * grid.width + x;

      // ── Passive energy decay ─────────────────────────────────────────────────
      const terrainCost = effectOf(grid.get(x, y, LAYER_TERRAIN), 'moveEnergyCost');
      grid.energy[al][i] -= grid.traitDecay[al][i] * terrainCost * decayMult;

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

      const energy         = grid.energy[al][i];
      const reproThreshEff = grid.traitRepro[al][i] * getSeasonEffect('reproThreshMult');
      const hungerThreshold = reproThreshEff * (2 / 3);
      const threat  = nearestThreat(grid, x, y);
      const targets = emptyAnimalNeighbors(grid, x, y, al);

      // ── 0. Survival mode: predator within danger radius ──────────────────────
      if (threat) {
        const [tx, ty] = threat;

        // 0a. Try to escape — move to the neighbor that maximises distance from threat.
        if (targets.length > 0) {
          let bestDist = -Infinity;
          for (const [nx, ny] of targets) {
            const d = Math.abs(nx - tx) + Math.abs(ny - ty);
            if (d > bestDist) bestDist = d;
          }
          const escapeCandidates = targets.filter(([nx, ny]) =>
            Math.abs(nx - tx) + Math.abs(ny - ty) === bestDist);
          // Only escape if it actually increases distance from threat, and flee reaction triggers.
          const currentDist = Math.abs(x - tx) + Math.abs(y - ty);
          if (bestDist > currentDist && rng() < FLEE_PROB) {
            const [nx, ny] = escapeCandidates[Math.floor(rng() * escapeCandidates.length)];
            grid.move(x, y, nx, ny, al);
            movedThisTick.add(ny * grid.width + nx);
            continue;
          }
        }

        // 0b. Cornered — try to reproduce to preserve population.
        if (grid.reproCooldown[al][i] === 0 && targets.length > 0) {
          const [nx, ny] = targets[Math.floor(rng() * targets.length)];
          const ls = computeLifespan(e.baseLifespan, e.lifespanVariance, rng);
          const cooldown = Math.max(1, Math.floor(ls / e.reproCooldownDivisor));
          grid.place(nx, ny, HERBIVORE, al, ls, e.baseEnergy);
          const ni = ny * grid.width + nx;
          grid.traitDecay[al][ni] = mutate(grid.traitDecay[al][i], e.energyDecayPerTick, rng);
          grid.traitRepro[al][ni] = mutate(grid.traitRepro[al][i], e.reproThreshold, rng);
          grid.energy[al][i] -= e.reproCost;
          grid.reproCooldown[al][i] = Math.max(1, Math.floor(grid.lifespan[al][i] / e.reproCooldownDivisor));
          grid.reproCooldown[al][ni] = cooldown;
          events.log('birth', HERBIVORE, al);
          continue;
        }

        // 0c. Can't escape or reproduce — fall through to normal food priority below.
      }

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
            // No food anywhere — wander randomly.
            const [nx, ny] = targets[Math.floor(rng() * targets.length)];
            grid.move(x, y, nx, ny, al);
            movedThisTick.add(ny * grid.width + nx);
          }
        }

      // ── 2. Ready to reproduce ────────────────────────────────────────────────
      // Food-coupled: must be standing on vegetation, which is consumed as breeding cost.
      // This spatially caps population to vegetation density — the primary boom-crash governor.
      } else if (grid.reproCooldown[al][i] === 0 && energy >= reproThreshEff) {
        const vegHere = grid.get(x, y, LAYER_VEGETATION);
        if (targets.length > 0 && (vegHere === GRASS || vegHere === TREE)) {
          const [nx, ny] = targets[Math.floor(rng() * targets.length)];
          const ls = computeLifespan(e.baseLifespan, e.lifespanVariance, rng);
          const cooldown = Math.max(1, Math.floor(ls / e.reproCooldownDivisor));
          grid.place(nx, ny, HERBIVORE, al, ls, e.baseEnergy);
          const ni = ny * grid.width + nx;
          grid.traitDecay[al][ni] = mutate(grid.traitDecay[al][i], e.energyDecayPerTick, rng);
          grid.traitRepro[al][ni] = mutate(grid.traitRepro[al][i], e.reproThreshold, rng);
          grid.energy[al][i] -= e.reproCost;
          grid.reproCooldown[al][i] = Math.max(1, Math.floor(grid.lifespan[al][i] / e.reproCooldownDivisor));
          grid.reproCooldown[al][ni] = cooldown;
          grid.kill(x, y, LAYER_VEGETATION);
          events.log('birth', HERBIVORE, al);
        }

      // ── 3. On cooldown: wander or idle ───────────────────────────────────────
      } else {
        if (rng() < 0.6 && targets.length > 0) {
          const [nx, ny] = targets[Math.floor(rng() * targets.length)];
          grid.move(x, y, nx, ny, al);
          movedThisTick.add(ny * grid.width + nx);
        }
        // else IDLE
      }
    }
  },
};
