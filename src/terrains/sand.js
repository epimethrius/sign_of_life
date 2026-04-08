/**
 * Sand — dry, loose ground. Grass spreads readily; trees struggle.
 *
 * Effects (all values are multipliers; 1.0 = neutral):
 * @property {number} grassSpreadChance  Multiplier on grass spread probability. Default 1.3.
 * @property {number} treeSpreadChance   Multiplier on tree spread probability. Default 0.4.
 * @property {number} moveEnergyCost     Multiplier on animal movement energy cost. Default 1.2.
 */
export default {
  id: 'sand',
  typeId: 2,
  name: 'Sand',
  color: '#c8a850',
  effects: {
    grassSpreadChance: 1.3,
    treeSpreadChance:  0.4,
    moveEnergyCost:    1.2,
  },
};
