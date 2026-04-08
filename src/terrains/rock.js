/**
 * Rock — hard surface. Very slow vegetation growth; costly for animals to traverse.
 *
 * Effects (all values are multipliers; 1.0 = neutral):
 * @property {number} grassSpreadChance  Grass barely takes hold on rock. Default 0.15.
 * @property {number} treeSpreadChance   Trees can root in cracks over time. Default 0.4.
 * @property {number} moveEnergyCost     Rough terrain, costly to cross. Default 2.0.
 */
export default {
  id: 'rock',
  typeId: 4,
  name: 'Rock',
  color: '#5a5a5a',
  effects: {
    grassSpreadChance: 0.15,
    treeSpreadChance:  0.4,
    moveEnergyCost:    2.0,
  },
};
