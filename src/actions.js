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
