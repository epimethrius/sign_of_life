import grassSpread        from './grass-spread.js';
import treeSpread         from './tree-spread.js';
import vegetationAging    from './vegetation-aging.js';
import herbivoreBehavior  from './herbivore-behavior.js';
import predatorBehavior   from './predator-behavior.js';

// Application order:
//   1. Vegetation spreads
//   2. Animals act (eat, move, reproduce) — may consume vegetation
//   3. Vegetation ages/dies
//   4. (Animal death from starvation/age is handled inline in each animal rule)
export const ALL_RULES = [
  grassSpread,
  treeSpread,
  herbivoreBehavior,
  predatorBehavior,
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

    // events is an EventLog instance — passed to every rule's apply().
    applyAll(grid, rng, events) {
      for (const rule of ALL_RULES) {
        if (enabled.has(rule.id)) rule.apply(grid, rng, events);
      }
    },
  };
}
