import seasonEngine      from './season-engine.js';
import grassSpread       from './grass-spread.js';
import treeSpread        from './tree-spread.js';
import lilySpread        from './lily-spread.js';
import omnivoreBehavior  from './omnivore-behavior.js';
import herbivoreBehavior from './herbivore-behavior.js';
import predatorBehavior  from './predator-behavior.js';
import vegetationAging   from './vegetation-aging.js';

// Application order:
//   1. Season engine — updates season state so all rules see current effects.
//   2. Vegetation spreads (land + aquatic).
//   3. Predators act first — strike adjacent prey before prey can flee.
//   4. Omnivores — eat herbivores/plants, flee predators.
//   5. Herbivores — flee, eat, reproduce.
//   6. Vegetation ages/dies (including seasonal attrition).
export const ALL_RULES = [
  seasonEngine,
  grassSpread,
  treeSpread,
  lilySpread,
  predatorBehavior,
  omnivoreBehavior,
  herbivoreBehavior,
  vegetationAging,
];

export function createRuleRegistry() {
  const enabled = new Set(ALL_RULES.map(r => r.id));

  return {
    rules: ALL_RULES,

    isEnabled(id) { return enabled.has(id); },

    toggle(id) {
      if (enabled.has(id)) enabled.delete(id);
      else enabled.add(id);
    },

    setEnabledByIndices(indices) {
      enabled.clear();
      for (const i of indices) {
        if (ALL_RULES[i]) enabled.add(ALL_RULES[i].id);
      }
    },

    applyAll(grid, rng, events) {
      // Tracks which grid-cell indices had an animal move this tick,
      // so that no animal moves more than once per tick.
      const movedThisTick = new Set();
      for (const rule of ALL_RULES) {
        if (enabled.has(rule.id)) rule.apply(grid, rng, events, movedThisTick);
      }
    },
  };
}
