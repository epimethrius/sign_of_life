import grassSpread     from './grass-spread.js';
import treeSpread      from './tree-spread.js';
import vegetationAging from './vegetation-aging.js';

// Rule application order matters:
// 1. Spread rules run first (entities reproduce).
// 2. Aging runs last (entities may die after getting a chance to spread).
export const ALL_RULES = [
  grassSpread,
  treeSpread,
  vegetationAging,
];

export function createRuleRegistry() {
  const enabled = new Set(ALL_RULES.map(r => r.id));

  return {
    rules: ALL_RULES,

    isEnabled(id) {
      return enabled.has(id);
    },

    toggle(id) {
      if (enabled.has(id)) {
        enabled.delete(id);
      } else {
        enabled.add(id);
      }
    },

    setEnabledByIndices(indices) {
      enabled.clear();
      for (const i of indices) {
        if (ALL_RULES[i]) enabled.add(ALL_RULES[i].id);
      }
    },

    applyAll(grid, rng) {
      for (const rule of ALL_RULES) {
        if (enabled.has(rule.id)) rule.apply(grid, rng);
      }
    },
  };
}
