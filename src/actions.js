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
