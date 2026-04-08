import grassSpread from './grass-spread.js';

export const ALL_RULES = [
  grassSpread,
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

    // Set enabled rules by index (used when loading a serialized world).
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
