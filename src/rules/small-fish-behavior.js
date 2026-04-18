/**
 * Small Fish behaviour — 🐟.
 *
 * Aquatic herbivore. Lives exclusively on WATER terrain cells.
 * Eats lily pads (LILY) in LAYER_VEGETATION.
 *
 * Food web position:
 *   eats     → lily pads
 *   eaten by → big fish (water), predators and omnivores (shore fishing)
 *
 * Behaviour priority each tick:
 *   1. If hungry — eat lily at current cell, else move toward nearest lily
 *   2. Reproduce when well-fed and cooldown elapsed
 *   3. Wander within water cells (60%) or idle (40%)
 */

import {
  SMALL_FISH,
  LILY,
  LAYER_ANIMALS, LAYER_VEGETATION, LAYER_TERRAIN,
  WATER,
} from '../grid.js';
import { computeLifespan, nearestFoodCell, emptyWaterNeighbors } from '../actions.js';
import { getSeasonEffect } from '../season-state.js';

export default {
  id:       'small-fish-behavior',
  category: 'Animals',
  tags:     ['animal', 'fish', 'aquatic', 'behavior'],

  entity: {
    typeId:               SMALL_FISH,
    layer:                LAYER_ANIMALS,
    name:                 'Small Fish',
    icon:                 '🐟',
    description:          'Aquatic herbivore. Eats lily pads. Prey for big fish and shore hunters.',
    baseLifespan:         18,
    lifespanVariance:     0.25,
    baseEnergy:           8,
    energyDecayPerTick:   0.3,
    energyFromLily:       6,
    reproThreshold:       8,
    reproCost:            5,
    reproCooldownDivisor: 4,
    spawnNearFood:        null, // seeded via _seedAquatic on water cells
  },

  name:        'Small Fish Behaviour',
  description: 'Small fish graze lily pads in water cells and reproduce when well-fed.',

  apply(grid, rng, events, movedThisTick = new Set()) {
    const e  = this.entity;
    const al = LAYER_ANIMALS;

    const decayMult      = getSeasonEffect('energyDecay');
    const reproThreshEff = e.reproThreshold * getSeasonEffect('reproThreshMult');
    const hungerThresh   = reproThreshEff * (2 / 3);

    const cells = [];
    for (let y = 0; y < grid.height; y++)
      for (let x = 0; x < grid.width; x++)
        if (grid.get(x, y, al) === SMALL_FISH) cells.push([x, y]);

    for (const [x, y] of cells) {
      if (grid.get(x, y, al) !== SMALL_FISH) continue;
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
        events.log(starved ? 'death-starve' : 'death-age', SMALL_FISH, al);
        grid.kill(x, y, al);
        continue;
      }

      if (movedThisTick.has(i)) continue;

      const energy  = grid.energy[al][i];
      const targets = emptyWaterNeighbors(grid, x, y, al);

      // ── 1. Hungry: seek lily ───────────────────────────────────────────────────
      if (energy < hungerThresh) {
        // Eat lily at current cell.
        if (grid.get(x, y, LAYER_VEGETATION) === LILY) {
          grid.energy[al][i] += e.energyFromLily;
          grid.kill(x, y, LAYER_VEGETATION);
          events.log('eat-lily', SMALL_FISH, al);
          continue;
        }

        // Move toward nearest lily.
        const nearest = nearestFoodCell(grid, x, y, LAYER_VEGETATION, [LILY]);
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
          // No lily anywhere — wander.
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
          grid.place(nx, ny, SMALL_FISH, al, ls, e.baseEnergy);
          grid.energy[al][i] -= e.reproCost;
          grid.reproCooldown[al][i]          = Math.max(1, Math.floor(grid.lifespan[al][i] / e.reproCooldownDivisor));
          grid.reproCooldown[al][ny * grid.width + nx] = cooldown;
          events.log('birth', SMALL_FISH, al);
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
