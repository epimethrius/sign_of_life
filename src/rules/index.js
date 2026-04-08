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

    applyAll(grid) {
      for (const rule of ALL_RULES) {
        if (enabled.has(rule.id)) rule.apply(grid);
      }
    },
  };
}
