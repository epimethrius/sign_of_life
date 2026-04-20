/**
 * Bird behaviour — 🦅 hawk/eagle.
 *
 * Aerial predator that hunts herbivores from above.
 * Key properties:
 *  - Ignores terrain energy cost (flies freely over any terrain)
 *  - Reproduces only when nesting on a TREE cell
 *  - Not hunted by ground predators (aerial escape)
 *
 * Behaviour priority each tick:
 *  1. If hungry — eat adjacent herbivore, then shore fish,
 *     then move toward nearest prey (radius 6)
 *  2. Reproduce when well-fed, cooldown elapsed, AND on TREE
 *     (if not on tree, wander toward nearest tree instead)
 *  3. Wander (70%) or idle (30%)
 */

import {
  BIRD, HERBIVORE,
  SMALL_FISH, BIG_FISH,
  LAYER_ANIMALS, LAYER_VEGETATION, LAYER_TERRAIN,
  WATER, TREE, GRASS,
} from '../grid.js';
import { computeLifespan, nearestFoodCell, emptyAnimalNeighbors, mutate } from '../actions.js';
import { getSeasonEffect } from '../season-state.js';

const FISH_TYPES = [SMALL_FISH];
const PREY_TYPES = [HERBIVORE];

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

export default {
  id:       'bird-behavior',
  category: 'Animals',
  tags:     ['animal', 'bird', 'behavior'],

  entity: {
    typeId:               BIRD,
    layer:                LAYER_ANIMALS,
    name:                 'Bird',
    icon:                 '🦅',
    description:          'Seabird. Eats only shore fish. Nests only in trees.',
    baseLifespan:         35,
    lifespanVariance:     0.25,
    baseEnergy:           18,
    energyDecayPerTick:   0.5,
    energyFromHerbivore:  12,
    energyFromFish:       12,
    reproThreshold:       14,
    reproCost:            7,
    reproCooldownDivisor: 3,
    spawnNearFood:        null,
  },

  name:        'Bird Behaviour',
  description: 'Birds hunt herbivores aerially, nest in trees. Not hunted by ground predators.',

  apply(grid, rng, events, movedThisTick = new Set()) {
    const e  = this.entity;
    const al = LAYER_ANIMALS;

    const decayMult = getSeasonEffect('energyDecay');

    const cells = [];
    for (let y = 0; y < grid.height; y++)
      for (let x = 0; x < grid.width; x++)
        if (grid.get(x, y, al) === BIRD) cells.push([x, y]);

    for (const [x, y] of cells) {
      if (grid.get(x, y, al) !== BIRD) continue;
      const i = y * grid.width + x;

      // ── Passive energy decay — no terrain penalty (birds fly) ───────────────
      grid.energy[al][i] -= grid.traitDecay[al][i] * decayMult;

      // ── Age & repro cooldown ─────────────────────────────────────────────────
      grid.age[al][i]++;
      if (grid.reproCooldown[al][i] > 0) grid.reproCooldown[al][i]--;

      // ── Death ────────────────────────────────────────────────────────────────
      const starved = grid.energy[al][i] <= 0;
      const aged    = grid.lifespan[al][i] > 0 && grid.age[al][i] >= grid.lifespan[al][i];
      if (starved || aged) {
        events.log(starved ? 'death-starve' : 'death-age', BIRD, al);
        grid.kill(x, y, al);
        continue;
      }

      if (movedThisTick.has(i)) continue;

      const energy          = grid.energy[al][i];
      const reproThreshEff  = grid.traitRepro[al][i] * getSeasonEffect('reproThreshMult');
      const hungerThreshold = reproThreshEff * (2 / 3);
      const targets = emptyAnimalNeighbors(grid, x, y, al);

      // ── 1. Hungry: fish first, herbs as fallback ─────────────────────────────
      if (energy < hungerThreshold) {
        // 1a. Shore fishing (preferred — keeps birds off the herbivore food chain).
        const fishCells = shoreFishTargets(grid, x, y, al);
        if (fishCells.length > 0) {
          const [fx, fy] = fishCells[Math.floor(rng() * fishCells.length)];
          const fishType = grid.get(fx, fy, al);
          grid.energy[al][i] += e.energyFromFish;
          events.log('death-eaten', fishType, al);
          events.log('eat-animal',  BIRD,     al);
          grid.kill(fx, fy, al);
          continue;
        }

        // 1b. Move toward nearest fish.
        const nearest = nearestFoodCell(grid, x, y, al, FISH_TYPES, 6);
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
          const [nx, ny] = targets[Math.floor(rng() * targets.length)];
          grid.move(x, y, nx, ny, al);
          movedThisTick.add(ny * grid.width + nx);
        }

      // ── 2. Reproduce — only when nesting in a TREE ────────────────────────────
      } else if (grid.reproCooldown[al][i] === 0 && energy >= reproThreshEff) {
        const vegHere = grid.get(x, y, LAYER_VEGETATION);
        const onNestSite = vegHere === TREE || vegHere === GRASS;
        if (targets.length > 0 && onNestSite) {
          const [nx, ny] = targets[Math.floor(rng() * targets.length)];
          const ls = computeLifespan(e.baseLifespan, e.lifespanVariance, rng);
          const cooldown = Math.max(1, Math.floor(ls / e.reproCooldownDivisor));
          grid.place(nx, ny, BIRD, al, ls, e.baseEnergy);
          const ni = ny * grid.width + nx;
          grid.traitDecay[al][ni] = mutate(grid.traitDecay[al][i], e.energyDecayPerTick, rng);
          grid.traitRepro[al][ni] = mutate(grid.traitRepro[al][i], e.reproThreshold, rng);
          grid.energy[al][i] -= e.reproCost;
          grid.reproCooldown[al][i]  = Math.max(1, Math.floor(grid.lifespan[al][i] / e.reproCooldownDivisor));
          grid.reproCooldown[al][ni] = cooldown;
          events.log('birth', BIRD, al);
        } else if (targets.length > 0) {
          // Not on a nest site — move toward nearest tree.
          const nearestTree = nearestFoodCell(grid, x, y, LAYER_VEGETATION, [TREE, GRASS], 8);
          if (nearestTree) {
            const [fx, fy] = nearestTree;
            let best = targets[0], bestD = Infinity;
            for (const [nx, ny] of targets) {
              const d = Math.abs(nx - fx) + Math.abs(ny - fy);
              if (d < bestD) { bestD = d; best = [nx, ny]; }
            }
            const [nx, ny] = best;
            grid.move(x, y, nx, ny, al);
            movedThisTick.add(ny * grid.width + nx);
          } else {
            const [nx, ny] = targets[Math.floor(rng() * targets.length)];
            grid.move(x, y, nx, ny, al);
            movedThisTick.add(ny * grid.width + nx);
          }
        }

      // ── 3. Wander or idle ─────────────────────────────────────────────────────
      } else {
        if (rng() < 0.7 && targets.length > 0) {
          const [nx, ny] = targets[Math.floor(rng() * targets.length)];
          grid.move(x, y, nx, ny, al);
          movedThisTick.add(ny * grid.width + nx);
        }
      }
    }
  },
};
