import { WATER, LAYER_TERRAIN } from './grid.js';

/**
 * Returns spread and lifespan multipliers based on proximity to water.
 * Cells within 1 step of water get the strongest bonus; within 2 steps a
 * smaller bonus; beyond 2 steps neutral (1.0).
 *
 * @param {Grid}   grid
 * @param {number} x
 * @param {number} y
 * @returns {{ spreadMult: number, lifespanMult: number }}
 */
export function waterProximityBonus(grid, x, y) {
  let minDist = Infinity;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) continue;
      if (grid.get(nx, ny, LAYER_TERRAIN) === WATER) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)); // Chebyshev
        if (d < minDist) minDist = d;
      }
    }
  }
  if (minDist === 1) return { spreadMult: 1.6, lifespanMult: 1.9 };
  if (minDist === 2) return { spreadMult: 1.25, lifespanMult: 1.35 };
  return { spreadMult: 1.0, lifespanMult: 1.0 };
}

/**
 * Picks one action from a weighted list using the seeded RNG.
 *
 * @param {Array<{action: string, weight: number}>} actions
 * @param {function(): number} rng  - returns [0, 1)
 * @returns {string} the chosen action name
 */
export function pickAction(actions, rng) {
  let total = 0;
  for (const a of actions) total += a.weight;

  let r = rng() * total;
  for (const a of actions) {
    r -= a.weight;
    if (r <= 0) return a.action;
  }
  return actions[actions.length - 1].action;
}

/**
 * Computes a randomized lifespan around a base value.
 * The actual lifespan is drawn uniformly from [base*(1-variance), base*(1+variance)].
 *
 * @param {number} base      Base lifespan in ticks (e.g. 4 for grass).
 * @param {number} variance  Fractional spread, e.g. 0.2 = ±20%.
 * @param {function(): number} rng
 * @returns {number} lifespan in whole ticks, minimum 1.
 */
export function computeLifespan(base, variance, rng) {
  const delta = base * variance;
  return Math.max(1, Math.round(base + (rng() * 2 - 1) * delta));
}
