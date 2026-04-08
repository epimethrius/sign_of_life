/**
 * Soil — default terrain. Neutral ground, supports all vegetation.
 *
 * Effects (all values are multipliers; 1.0 = neutral):
 * @property {number} grassSpreadChance  Multiplier on grass spread probability. Default 1.0.
 * @property {number} treeSpreadChance   Multiplier on tree spread probability. Default 1.0.
 * @property {number} moveEnergyCost     Multiplier on animal movement energy cost. Default 1.0.
 */
export default {
  id: 'soil',
  typeId: 1,
  name: 'Soil',
  color: '#7a5c2e',
  effects: {
    grassSpreadChance:  1.0,
    treeSpreadChance:   1.0,
    moveEnergyCost:     1.0,
    lifespanMultiplier: 1.0,
  },
};
