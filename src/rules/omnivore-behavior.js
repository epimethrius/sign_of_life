/**
 * Omnivore behaviour — 🦝 raccoon.
 *
 * Occupies the middle tier of the food web:
 *   eats  → grass, trees, herbivores (opportunistically)
 *   eaten by → predators
 *
 * This breaks the binary predator-prey collapse: when herbivores are scarce,
 * predators can still eat omnivores; when plants are scarce, omnivores eat
 * herbivores; omnivores fall back on vegetation when herbivores are absent.
 *
 * Behaviour priority each tick:
 *   0. Flee predators within DANGER_RADIUS (probabilistic — bolder than herbivores)
 *   1. If hungry — eat adjacent herbivore (preferred), then adjacent vegetation,
 *      then move toward nearest food (closer of herbivore vs vegetation)
 *   2. Reproduce when well-fed and cooldown elapsed
 *   3. Wander (60 %) or idle (40 %)
 */

import {
  OMNIVORE, HERBIVORE, PREDATOR,
  GRASS, TREE,
  SMALL_FISH, BIG_FISH,
  LAYER_ANIMALS, LAYER_VEGETATION, LAYER_TERRAIN,
  WATER,
} from '../grid.js';
import { computeLifespan, nearestFoodCell, emptyAnimalNeighbors } from '../actions.js';

const FISH_TYPES = [SMALL_FISH, BIG_FISH];

/** Returns [x,y] pairs of adjacent WATER cells that contain a fish. */
function shoreFishTargets(grid, x, y, al) {
  const result = [];
  for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
    const nx = x + dx, ny = y + dy;
    if (!grid.inBounds(nx, ny)) continue;
    if (grid.get(nx, ny, LAYER_TERRAIN) !== WATER) continue;
    if (FISH_TYPES.includes(grid.get(nx, ny, al))) result.push([nx, ny]);
  }
  return result;
}
import { effectOf } from '../terrains/index.js';
import { getSeasonEffect } from '../season-state.js';

const FOOD_TYPES    = [GRASS, TREE];
const DANGER_RADIUS = 2;
const FLEE_PROB     = 0.60;

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
  id:       'omnivore-behavior',
  category: 'Animals',
  tags:     ['animal', 'omnivore', 'behavior'],

  entity: {
    typeId:               OMNIVORE,
    layer:                LAYER_ANIMALS,
    name:                 'Omnivore',
    icon:                 '🦝',
    description:          'Eats shore fish and vegetation. Not hunted by predators.',
    baseLifespan:         35,
    lifespanVariance:     0.25,
    baseEnergy:           12,
    energyDecayPerTick:   0.35,
    energyFromGrass:      6,
    energyFromTree:       6,
    energyFromHerbivore:  0,
    energyFromFish:       10,
    reproThreshold:       10,
    reproCost:            5,
    reproCooldownDivisor: 3,
    spawnNearFood: { layer: LAYER_VEGETATION, types: FOOD_TYPES },
  },

  name:        'Omnivore Behaviour',
  description: 'Omnivores eat plants and opportunistically hunt herbivores; they flee predators.',

  apply(grid, rng, events, movedThisTick = new Set()) {
    const e  = this.entity;
    const al = LAYER_ANIMALS;

    const decayMult     = getSeasonEffect('energyDecay');
    const reproThreshEff = e.reproThreshold * getSeasonEffect('reproThreshMult');
    const hungerThreshold = reproThreshEff * (2 / 3);

    const cells = [];
    for (let y = 0; y < grid.height; y++)
      for (let x = 0; x < grid.width; x++)
        if (grid.get(x, y, al) === OMNIVORE) cells.push([x, y]);

    for (const [x, y] of cells) {
      if (grid.get(x, y, al) !== OMNIVORE) continue;
      const i = y * grid.width + x;

      // ── Passive energy decay (terrain + season) ──────────────────────────
      const terrainCost = effectOf(grid.get(x, y, LAYER_TERRAIN), 'moveEnergyCost');
      grid.energy[al][i] -= e.energyDecayPerTick * terrainCost * decayMult;

      // ── Age & repro cooldown ─────────────────────────────────────────────
      grid.age[al][i]++;
      if (grid.reproCooldown[al][i] > 0) grid.reproCooldown[al][i]--;

      // ── Death ────────────────────────────────────────────────────────────
      const starved = grid.energy[al][i] <= 0;
      const aged    = grid.lifespan[al][i] > 0 && grid.age[al][i] >= grid.lifespan[al][i];
      if (starved || aged) {
        events.log(starved ? 'death-starve' : 'death-age', OMNIVORE, al);
        grid.kill(x, y, al);
        continue;
      }

      if (movedThisTick.has(i)) continue;

      const energy  = grid.energy[al][i];
      const threat  = nearestThreat(grid, x, y);
      const targets = emptyAnimalNeighbors(grid, x, y, al);

      // ── 0. Survival: predator nearby ─────────────────────────────────────
      if (threat) {
        const [tx, ty] = threat;

        // 0a. Flee probabilistically (less reactive than herbivores).
        if (targets.length > 0) {
          let bestDist = -Infinity;
          for (const [nx, ny] of targets) {
            const d = Math.abs(nx - tx) + Math.abs(ny - ty);
            if (d > bestDist) bestDist = d;
          }
          const escapeCandidates = targets.filter(([nx, ny]) =>
            Math.abs(nx - tx) + Math.abs(ny - ty) === bestDist);
          const currentDist = Math.abs(x - tx) + Math.abs(y - ty);
          if (bestDist > currentDist && rng() < FLEE_PROB) {
            const [nx, ny] = escapeCandidates[Math.floor(rng() * escapeCandidates.length)];
            grid.move(x, y, nx, ny, al);
            movedThisTick.add(ny * grid.width + nx);
            continue;
          }
        }

        // 0b. Cornered — reproduce if possible.
        if (grid.reproCooldown[al][i] === 0 && energy >= reproThreshEff && targets.length > 0) {
          const [nx, ny] = targets[Math.floor(rng() * targets.length)];
          const ls = computeLifespan(e.baseLifespan, e.lifespanVariance, rng);
          const cooldown = Math.max(1, Math.floor(ls / e.reproCooldownDivisor));
          grid.place(nx, ny, OMNIVORE, al, ls, e.baseEnergy);
          grid.energy[al][i] -= e.reproCost;
          grid.reproCooldown[al][i] = Math.max(1, Math.floor(grid.lifespan[al][i] / e.reproCooldownDivisor));
          grid.reproCooldown[al][ny * grid.width + nx] = cooldown;
          events.log('birth', OMNIVORE, al);
          continue;
        }
      }

      // ── 1. Hungry: shore fish then vegetation ────────────────────────────
      if (energy < hungerThreshold) {
        // 1a. Shore fishing (preferred — higher energy).
        const fishCells = shoreFishTargets(grid, x, y, al);
        if (fishCells.length > 0) {
          const [fx, fy] = fishCells[Math.floor(rng() * fishCells.length)];
          const fishType = grid.get(fx, fy, al);
          grid.energy[al][i] += e.energyFromFish;
          events.log('death-eaten', fishType, al);
          events.log('eat-animal', OMNIVORE, al);
          grid.kill(fx, fy, al);
          continue;
        }

        // 1b. Eat vegetation at current cell.
        const vegType = grid.get(x, y, LAYER_VEGETATION);
        if (vegType === GRASS || vegType === TREE) {
          grid.energy[al][i] += vegType === GRASS ? e.energyFromGrass : e.energyFromTree;
          grid.kill(x, y, LAYER_VEGETATION);
          events.log(vegType === GRASS ? 'eat-grass' : 'eat-tree', OMNIVORE, al);
          continue;
        }

        // 1c. Move toward nearest food — prefer fish over vegetation.
        const nearestVeg = nearestFoodCell(grid, x, y, LAYER_VEGETATION, FOOD_TYPES);
        if (nearestVeg && targets.length > 0) {
          const [fx, fy] = nearestVeg;
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
          const [nx, ny] = targets[Math.floor(rng() * targets.length)];
          grid.move(x, y, nx, ny, al);
          movedThisTick.add(ny * grid.width + nx);
        }

      // ── 2. Reproduce (food-coupled) ───────────────────────────────────────
      } else if (grid.reproCooldown[al][i] === 0 && energy >= reproThreshEff) {
        const vegHere = grid.get(x, y, LAYER_VEGETATION);
        if (targets.length > 0 && (vegHere === GRASS || vegHere === TREE)) {
          const [nx, ny] = targets[Math.floor(rng() * targets.length)];
          const ls = computeLifespan(e.baseLifespan, e.lifespanVariance, rng);
          const cooldown = Math.max(1, Math.floor(ls / e.reproCooldownDivisor));
          grid.place(nx, ny, OMNIVORE, al, ls, e.baseEnergy);
          grid.energy[al][i] -= e.reproCost;
          grid.reproCooldown[al][i] = Math.max(1, Math.floor(grid.lifespan[al][i] / e.reproCooldownDivisor));
          grid.reproCooldown[al][ny * grid.width + nx] = cooldown;
          grid.kill(x, y, LAYER_VEGETATION);
          events.log('birth', OMNIVORE, al);
        }

      // ── 3. Wander or idle ─────────────────────────────────────────────────
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
