import { EMPTY, LAYER_VEGETATION } from '../grid.js';

export default {
  id: 'vegetation-aging',
  entity: null, // not an entity rule — no icon or legend entry
  name: 'Vegetation Aging',
  description: 'Vegetation dies when its lifespan expires, freeing the cell.',

  // No action dispatch — runs unconditionally on every occupied cell.
  actions: [],

  apply(grid /*, rng — not needed */) {
    const types    = grid.layers[LAYER_VEGETATION];
    const age      = grid.age[LAYER_VEGETATION];
    const lifespan = grid.lifespan[LAYER_VEGETATION];

    for (let i = 0; i < grid.size; i++) {
      if (types[i] === EMPTY) continue;

      age[i]++;

      // lifespan === 0 means immortal (e.g. manually painted or unaged entity).
      if (lifespan[i] > 0 && age[i] >= lifespan[i]) {
        types[i]    = EMPTY;
        age[i]      = 0;
        lifespan[i] = 0;
      }
    }
  },
};
