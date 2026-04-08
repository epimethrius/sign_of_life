/**
 * Sand — dry, loose ground. Poor conditions for most vegetation.
 *
 * Effects (all values are multipliers; 1.0 = neutral):
 * @property {number} grassSpreadChance  Grass struggles in dry sand. Default 0.3.
 * @property {number} treeSpreadChance   Trees rarely take root in sand. Default 0.15.
 * @property {number} moveEnergyCost     Soft ground, slightly costly to cross. Default 1.2.
 * @property {number} lifespanMultiplier Plants on sand dry out faster. Default 0.65.
 */
export default {
  id: 'sand',
  typeId: 2,
  name: 'Sand',
  color: '#c8a850',
  effects: {
    grassSpreadChance:  0.3,
    treeSpreadChance:   0.15,
    moveEnergyCost:     1.2,
    lifespanMultiplier: 0.65,
  },
};
