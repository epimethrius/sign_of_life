/**
 * Water — impassable for land vegetation and animals.
 * Reserved for future aquatic vegetation and water-based life chains.
 *
 * Effects (all values are multipliers; 1.0 = neutral):
 * @property {number} grassSpreadChance       Land grass cannot spread here. 0.0.
 * @property {number} treeSpreadChance        Trees cannot grow in water. 0.0.
 * @property {number} aquaticGrassSpreadChance Aquatic grass spreads normally (future). 1.0.
 * @property {number} moveEnergyCost          Land animals cannot enter. Infinity.
 */
export default {
  id: 'water',
  typeId: 3,
  name: 'Water',
  color: '#2a6496',
  effects: {
    grassSpreadChance:        0.0,
    treeSpreadChance:         0.0,
    aquaticGrassSpreadChance: 1.0,
    moveEnergyCost:           Infinity,
  },
};
