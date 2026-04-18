import { PREDATOR, HERBIVORE, OMNIVORE, SMALL_FISH, BIG_FISH, LAYER_ANIMALS, LAYER_TERRAIN, WATER } from '../grid.js';
import { computeLifespan, nearestFoodCell, emptyAnimalNeighbors } from '../actions.js';
import { effectOf } from '../terrains/index.js';
import { getSeasonEffect } from '../season-state.js';

// Predators hunt herbivores only — omnivores occupy the coastal forager niche.
const PREY_TYPES  = [HERBIVORE];
// Both fish types can be caught via shore fishing.
const FISH_TYPES  = [SMALL_FISH, BIG_FISH];

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
  id: 'predator-behavior',
  category: 'Animals',
  tags: ['animal', 'predator', 'behavior'],

  entity: {
    typeId:               PREDATOR,
    layer:                LAYER_ANIMALS,
    name:                 'Predator',
    icon:                 '🦊',
    description:          'Hunts herbivores and omnivores. Shore-fishes both fish types.',
    baseLifespan:         35,
    lifespanVariance:     0.2,
    baseEnergy:           25,
    energyDecayPerTick:   0.8,
    energyFromHerbivore:  15,
    energyFromFish:       8,   // energy gained from shore fishing (either fish type)
    reproThreshold:       20,
    reproCost:            10,
    reproCooldownDivisor: 2,
    spawnNearFood: { layer: LAYER_ANIMALS, types: PREY_TYPES },
  },

  name: 'Predator Behaviour',
  description: 'Predators seek herbivores when hungry, reproduce when well-fed, otherwise wander.',

  apply(grid, rng, events, movedThisTick = new Set()) {
    const e = this.entity;
    const al = LAYER_ANIMALS;
    const decayMult      = getSeasonEffect('energyDecay');
    const reproThreshEff = e.reproThreshold * getSeasonEffect('reproThreshMult');
    const hungerThreshold = reproThreshEff * (2 / 3);

    const cells = [];
    for (let y = 0; y < grid.height; y++)
      for (let x = 0; x < grid.width; x++)
        if (grid.get(x, y, al) === PREDATOR) cells.push([x, y]);

    for (const [x, y] of cells) {
      if (grid.get(x, y, al) !== PREDATOR) continue;
      const i = y * grid.width + x;

      // ── Passive energy decay ─────────────────────────────────────────────────
      const terrainCost = effectOf(grid.get(x, y, LAYER_TERRAIN), 'moveEnergyCost');
      grid.energy[al][i] -= e.energyDecayPerTick * terrainCost * decayMult;

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
        // Check adjacent land cells for prey first.
        const prey = grid.spreadTargets(x, y, al, PREY_TYPES)
          .filter(([nx, ny]) => PREY_TYPES.includes(grid.get(nx, ny, al)));

        if (prey.length > 0) {
          // Eat adjacent prey — move into its cell.
          const [nx, ny] = prey[Math.floor(rng() * prey.length)];
          const preyType = grid.get(nx, ny, al);
          grid.energy[al][i] += e.energyFromHerbivore;
          events.log('death-eaten', preyType, al);
          events.log('eat-animal', PREDATOR, al);
          grid.move(x, y, nx, ny, al);
          movedThisTick.add(ny * grid.width + nx);
        } else {
          // Shore fishing: grab a fish from an adjacent water cell (no movement).
          const fishCells = shoreFishTargets(grid, x, y, al);
          if (fishCells.length > 0) {
            const [fx, fy] = fishCells[Math.floor(rng() * fishCells.length)];
            const fishType = grid.get(fx, fy, al);
            grid.energy[al][i] += e.energyFromFish;
            events.log('death-eaten', fishType, al);
            events.log('eat-animal', PREDATOR, al);
            grid.kill(fx, fy, al);
            // No movement — predator stays on land.
          } else {
          // Move toward nearest land prey (limited radius — creates prey refuges).
          const nearest = nearestFoodCell(grid, x, y, al, PREY_TYPES, 4);
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
          } // end else (no shore fish)
        } // end else (no adjacent land prey)

      // ── 2. Ready to reproduce ────────────────────────────────────────────────
      // Energy gate: must have enough reserves to raise offspring.
      // This is the feedback that prevents overshoot — predators won't breed when prey is scarce.
      } else if (grid.reproCooldown[al][i] === 0 && energy >= reproThreshEff) {
        const targets = emptyAnimalNeighbors(grid, x, y, al);
        if (targets.length > 0) {
          const [nx, ny] = targets[Math.floor(rng() * targets.length)];
          const ls = computeLifespan(e.baseLifespan, e.lifespanVariance, rng);
          const cooldown = Math.max(1, Math.floor(ls / e.reproCooldownDivisor));
          grid.place(nx, ny, PREDATOR, al, ls, e.baseEnergy);
          grid.energy[al][i] -= e.reproCost;
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
