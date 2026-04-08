import { EMPTY, LAYER_VEGETATION } from '../grid.js';

export default {
  id: 'vegetation-aging',
  entity: null,
  name: 'Vegetation Aging',
  description: 'Vegetation dies when its lifespan expires, freeing the cell.',
  actions: [],

  apply(grid, rng, events) {
    const types    = grid.layers[LAYER_VEGETATION];
    const age      = grid.age[LAYER_VEGETATION];
    const lifespan = grid.lifespan[LAYER_VEGETATION];

    for (let i = 0; i < grid.size; i++) {
      if (types[i] === EMPTY) continue;

      age[i]++;

      if (lifespan[i] > 0 && age[i] >= lifespan[i]) {
        events.log('death-age', types[i], LAYER_VEGETATION);
        types[i]    = EMPTY;
        age[i]      = 0;
        lifespan[i] = 0;
      }
    }
  },
};
