import { HERBIVORE, PREDATOR, GRASS, TREE, WATER, LAYER_ANIMALS, LAYER_VEGETATION, LAYER_TERRAIN, EMPTY } from '../grid.js';

// Maps each animal typeId to what it eats.
const FOOD_DEF = {
  [HERBIVORE]: { layer: LAYER_VEGETATION, types: [GRASS, TREE] },
  [PREDATOR]:  { layer: LAYER_ANIMALS,    types: [HERBIVORE] },
};

export default {
  id: 'animal-seek-food',
  category: 'Animals',
  tags: ['animal', 'behavior', 'realistic'],
  entity: null,

  name: 'Animal Food Seeking',
  description: 'Animals with no compatible food at their current cell move one step toward the nearest food source.',

  actions: [],

  apply(grid, rng, events) {
    // Runs after animal behavior rules so it acts as a corrective nudge:
    // animals that didn't eat this tick take an extra step toward food.
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const animalType = grid.get(x, y, LAYER_ANIMALS);
        if (animalType === EMPTY) continue;

        const food = FOOD_DEF[animalType];
        if (!food) continue;

        // Skip if food is already at this cell.
        if (food.types.includes(grid.get(x, y, food.layer))) continue;

        // Find the nearest food cell (Manhattan distance).
        const nearest = _nearestFood(grid, x, y, food.layer, food.types);
        if (!nearest) continue;

        // Move to the adjacent cell that minimises distance to the food.
        const [fx, fy] = nearest;
        let bestNeighbor = null;
        let bestDist     = Infinity;

        for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
          const nx = x + dx, ny = y + dy;
          if (!grid.inBounds(nx, ny)) continue;
          if (grid.get(nx, ny, LAYER_TERRAIN) === WATER) continue;
          if (grid.get(nx, ny, LAYER_ANIMALS) !== EMPTY) continue;

          const dist = Math.abs(nx - fx) + Math.abs(ny - fy);
          if (dist < bestDist) { bestDist = dist; bestNeighbor = [nx, ny]; }
        }

        if (bestNeighbor) grid.move(x, y, bestNeighbor[0], bestNeighbor[1], LAYER_ANIMALS);
      }
    }
  },
};

function _nearestFood(grid, x, y, foodLayer, foodTypes) {
  let bestDist = Infinity;
  let bestPos  = null;
  for (let fy = 0; fy < grid.height; fy++) {
    for (let fx = 0; fx < grid.width; fx++) {
      if (!foodTypes.includes(grid.get(fx, fy, foodLayer))) continue;
      const dist = Math.abs(fx - x) + Math.abs(fy - y);
      if (dist < bestDist) { bestDist = dist; bestPos = [fx, fy]; }
    }
  }
  return bestPos;
}
