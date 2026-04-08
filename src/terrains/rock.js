/**
 * Rock — hard surface. Very slow vegetation growth; costly for animals to traverse.
 *
 * Effects (all values are multipliers; 1.0 = neutral):
 * @property {number} grassSpreadChance  Grass barely clings to rock. Default 0.1.
 * @property {number} treeSpreadChance   Trees rarely root in cracks. Default 0.15.
 * @property {number} moveEnergyCost     Rough terrain, costly to cross. Default 2.0.
 * @property {number} lifespanMultiplier Plants on bare rock wither quickly. Default 0.5.
 */
export default {
  id: 'rock',
  typeId: 4,
  name: 'Rock',
  color: '#5a5a5a',
  effects: {
    grassSpreadChance:  0.1,
    treeSpreadChance:   0.15,
    moveEnergyCost:     2.0,
    lifespanMultiplier: 0.5,
  },
};
