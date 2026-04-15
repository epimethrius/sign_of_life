import { EMPTY, LAYER_VEGETATION } from '../grid.js';
import { getSeasonEffect } from '../season-state.js';

export default {
  id: 'vegetation-aging',
  category: 'Vegetation',
  tags: ['vegetation', 'aging'],
  entity: null,
  name: 'Vegetation Aging',
  description: 'Vegetation dies when its lifespan expires, freeing the cell.',
  actions: [],

  apply(grid, rng, events) {
    const types    = grid.layers[LAYER_VEGETATION];
    const age      = grid.age[LAYER_VEGETATION];
    const lifespan = grid.lifespan[LAYER_VEGETATION];

    // Seasonal attrition: in harsh seasons (vegLifespanMult < 1) existing plants
    // have a small extra chance to die early each tick.
    const seasonLM   = getSeasonEffect('vegLifespanMult');
    const attrition  = Math.max(0, (1 - seasonLM) * 0.02); // 0 in spring/summer, ~1% in winter

    for (let i = 0; i < grid.size; i++) {
      if (types[i] === EMPTY) continue;

      age[i]++;

      // Attrition check (skip in benign seasons where attrition = 0).
      if (attrition > 0 && rng() < attrition) {
        events.log('death-age', types[i], LAYER_VEGETATION);
        types[i] = EMPTY; age[i] = 0; lifespan[i] = 0;
        continue;
      }

      if (lifespan[i] > 0 && age[i] >= lifespan[i]) {
        events.log('death-age', types[i], LAYER_VEGETATION);
        types[i]    = EMPTY;
        age[i]      = 0;
        lifespan[i] = 0;
      }
    }
  },
};
