/**
 * Big Fish behaviour — 🐠.
 *
 * Aquatic predator. Lives exclusively on WATER terrain cells.
 * Hunts small fish (SMALL_FISH). Can itself be caught by land predators
 * and omnivores via shore fishing.
 *
 * Food web position:
 *   eats     → small fish
 *   eaten by → predators and omnivores (shore fishing)
 *
 * Behaviour priority each tick:
 *   1. If hungry — eat adjacent small fish (move into its cell),
 *      else move toward nearest small fish
 *   2. Reproduce when well-fed and cooldown elapsed
 *   3. Wander within water cells (60%) or idle (40%)
 */

import {
  BIG_FISH, SMALL_FISH,
  LAYER_ANIMALS, LAYER_TERRAIN,
  WATER,
} from '../grid.js';
import { computeLifespan, nearestFoodCell, emptyWaterNeighbors } from '../actions.js';
import { getSeasonEffect } from '../season-state.js';

export default {
  id:       'big-fish-behavior',
  category: 'Animals',
  tags:     ['animal', 'fish', 'aquatic', 'behavior'],

  entity: {
    typeId:               BIG_FISH,
    layer:                LAYER_ANIMALS,
    name:                 'Big Fish',
    icon:                 '🐠',
    description:          'Aquatic predator. Eats small fish. Can be caught by shore hunters.',
    baseLifespan:         40,
    lifespanVariance:     0.2,
    baseEnergy:           15,
    energyDecayPerTick:   0.3,
    energyFromSmallFish:  12,
    reproThreshold:       12,
    reproCost:            8,
    reproCooldownDivisor: 2,
    spawnNearFood:        null, // seeded via _seedAquatic on water cells
  },

  name:        'Big Fish Behaviour',
  description: 'Big fish hunt small fish in water cells; they can be caught by shore predators.',

  apply(grid, rng, events, movedThisTick = new Set()) {
    const e  = this.entity;
    const al = LAYER_ANIMALS;

    const decayMult      = getSeasonEffect('energyDecay');
    const reproThreshEff = e.reproThreshold * getSeasonEffect('reproThreshMult');
    const hungerThresh   = reproThreshEff * (2 / 3);

    const cells = [];
    for (let y = 0; y < grid.height; y++)
      for (let x = 0; x < grid.width; x++)
        if (grid.get(x, y, al) === BIG_FISH) cells.push([x, y]);

    for (const [x, y] of cells) {
      if (grid.get(x, y, al) !== BIG_FISH) continue;
      const i = y * grid.width + x;

      // ── Passive energy decay ──────────────────────────────────────────────────
      grid.energy[al][i] -= e.energyDecayPerTick * decayMult;

      // ── Age & repro cooldown ──────────────────────────────────────────────────
      grid.age[al][i]++;
      if (grid.reproCooldown[al][i] > 0) grid.reproCooldown[al][i]--;

      // ── Death ─────────────────────────────────────────────────────────────────
      const starved = grid.energy[al][i] <= 0;
      const aged    = grid.lifespan[al][i] > 0 && grid.age[al][i] >= grid.lifespan[al][i];
      if (starved || aged) {
        events.log(starved ? 'death-starve' : 'death-age', BIG_FISH, al);
        grid.kill(x, y, al);
        continue;
      }

      if (movedThisTick.has(i)) continue;

      const energy  = grid.energy[al][i];
      const targets = emptyWaterNeighbors(grid, x, y, al);

      // ── 1. Hungry: seek small fish ─────────────────────────────────────────────
      if (energy < hungerThresh) {
        // Eat an adjacent small fish (move into its water cell).
        const adjPrey = [];
        for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
          const nx = x + dx, ny = y + dy;
          if (!grid.inBounds(nx, ny)) continue;
          if (grid.get(nx, ny, LAYER_TERRAIN) !== WATER) continue;
          if (grid.get(nx, ny, al) === SMALL_FISH) adjPrey.push([nx, ny]);
        }

        if (adjPrey.length > 0) {
          const [nx, ny] = adjPrey[Math.floor(rng() * adjPrey.length)];
          grid.energy[al][i] += e.energyFromSmallFish;
          events.log('death-eaten', SMALL_FISH, al);
          events.log('eat-animal',  BIG_FISH,   al);
          grid.move(x, y, nx, ny, al);
          movedThisTick.add(ny * grid.width + nx);
          continue;
        }

        // Move toward nearest small fish.
        const nearest = nearestFoodCell(grid, x, y, al, [SMALL_FISH]);
        if (nearest && targets.length > 0) {
          const [fx, fy] = nearest;
          let bestDist = Infinity;
          for (const [nx, ny] of targets) {
            const d = Math.abs(nx - fx) + Math.abs(ny - fy);
            if (d < bestDist) bestDist = d;
          }
          const best = targets.filter(([nx, ny]) =>
            Math.abs(nx - fx) + Math.abs(ny - fy) === bestDist);
          const [nx, ny] = best[Math.floor(rng() * best.length)];
          grid.move(x, y, nx, ny, al);
          movedThisTick.add(ny * grid.width + nx);
        } else if (targets.length > 0) {
          // No small fish anywhere — wander.
          const [nx, ny] = targets[Math.floor(rng() * targets.length)];
          grid.move(x, y, nx, ny, al);
          movedThisTick.add(ny * grid.width + nx);
        }

      // ── 2. Reproduce ───────────────────────────────────────────────────────────
      } else if (grid.reproCooldown[al][i] === 0 && energy >= reproThreshEff) {
        if (targets.length > 0) {
          const [nx, ny] = targets[Math.floor(rng() * targets.length)];
          const ls       = computeLifespan(e.baseLifespan, e.lifespanVariance, rng);
          const cooldown = Math.max(1, Math.floor(ls / e.reproCooldownDivisor));
          grid.place(nx, ny, BIG_FISH, al, ls, e.baseEnergy);
          grid.energy[al][i] -= e.reproCost;
          grid.reproCooldown[al][i]                    = Math.max(1, Math.floor(grid.lifespan[al][i] / e.reproCooldownDivisor));
          grid.reproCooldown[al][ny * grid.width + nx] = cooldown;
          events.log('birth', BIG_FISH, al);
        }

      // ── 3. Wander or idle ──────────────────────────────────────────────────────
      } else {
        if (rng() < 0.6 && targets.length > 0) {
          const [nx, ny] = targets[Math.floor(rng() * targets.length)];
          grid.move(x, y, nx, ny, al);
          movedThisTick.add(ny * grid.width + nx);
        }
      }
    }
  },
};
