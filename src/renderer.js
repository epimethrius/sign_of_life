import { LAYER_TERRAIN, LAYER_VEGETATION, LAYER_ANIMALS, EMPTY } from './grid.js';
import { colorOf as terrainColor } from './terrains/index.js';

const CELL_SIZE = 40;
const GAP       = 1;

export class Renderer {
  constructor(canvas, grid) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.grid   = grid;

    canvas.width  = grid.width  * CELL_SIZE;
    canvas.height = grid.height * CELL_SIZE;

    this.ctx.textAlign    = 'center';
    this.ctx.textBaseline = 'middle';

    // Map from { layer → Map<typeId, icon> }
    // Populated by main.js via setEntityIcons().
    this._icons = new Map();
  }

  /**
   * @param {number} layer
   * @param {Map<number, string>} iconMap  e.g. new Map([[1, '🌿'], [2, '🌲']])
   */
  setEntityIcons(layer, iconMap) {
    this._icons.set(layer, iconMap);
  }

  draw() {
    const { ctx, grid } = this;
    const cellInner = CELL_SIZE - GAP;

    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (let y = 0; y < grid.height; y++) {
      const py = y * CELL_SIZE + GAP;
      const cy = y * CELL_SIZE + CELL_SIZE / 2;

      for (let x = 0; x < grid.width; x++) {
        const px = x * CELL_SIZE + GAP;
        const cx = x * CELL_SIZE + CELL_SIZE / 2;

        // ── Pass 1: terrain fill ────────────────────────────────────────────
        ctx.fillStyle = terrainColor(grid.get(x, y, LAYER_TERRAIN));
        ctx.fillRect(px, py, cellInner, cellInner);

        const vegType    = grid.get(x, y, LAYER_VEGETATION);
        const animalType = grid.get(x, y, LAYER_ANIMALS);
        const hasAnimal  = animalType !== EMPTY;
        const hasVeg     = vegType    !== EMPTY;

        // ── Pass 2: vegetation icon ─────────────────────────────────────────
        if (hasVeg) {
          const icon = this._icons.get(LAYER_VEGETATION)?.get(vegType);
          if (icon) {
            if (hasAnimal) {
              // Both present: vegetation to top-left corner.
              ctx.font = `${Math.floor(CELL_SIZE * 0.42)}px serif`;
              ctx.fillText(icon, x * CELL_SIZE + CELL_SIZE * 0.27, y * CELL_SIZE + CELL_SIZE * 0.27);
            } else {
              // Vegetation only: centered.
              ctx.font = `${Math.floor(CELL_SIZE * 0.55)}px serif`;
              ctx.fillText(icon, cx, cy + 1);
            }
          }
        }

        // ── Pass 3: animal icon ─────────────────────────────────────────────
        if (hasAnimal) {
          const icon = this._icons.get(LAYER_ANIMALS)?.get(animalType);
          if (icon) {
            if (hasVeg) {
              // Both present: animal to bottom-right corner.
              ctx.font = `${Math.floor(CELL_SIZE * 0.42)}px serif`;
              ctx.fillText(icon, x * CELL_SIZE + CELL_SIZE * 0.73, y * CELL_SIZE + CELL_SIZE * 0.73);
            } else {
              // Animal only: centered.
              ctx.font = `${Math.floor(CELL_SIZE * 0.60)}px serif`;
              ctx.fillText(icon, cx, cy + 1);
            }
          }
        }
      }
    }
  }
}
