/**
 * Icon renderer — draws entity emoji on a transparent 2D canvas that sits on
 * top of the WebGL terrain canvas. Only this file handles text/emoji; terrain
 * colour and overlays are rendered by WebGLRenderer (renderer-webgl.js).
 */

import { LAYER_VEGETATION, LAYER_ANIMALS, EMPTY } from './grid.js';
import { CELL_SIZE } from './renderer-webgl.js';

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas  The 2D icon overlay canvas.
   * @param {import('./grid.js').Grid} grid
   */
  constructor(canvas, grid) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.grid   = grid;

    this._setSize();

    this.ctx.textAlign    = 'center';
    this.ctx.textBaseline = 'middle';

    // Map from layer → Map<typeId, icon string>.
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

  /** Call after changing grid dimensions. */
  resize(newGrid) {
    this.grid = newGrid;
    this._setSize();
  }

  _setSize() {
    this.canvas.width  = this.grid.width  * CELL_SIZE;
    this.canvas.height = this.grid.height * CELL_SIZE;
  }

  draw() {
    const { ctx, grid } = this;

    // Re-apply text alignment — canvas resize resets all context state.
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    // Clear to fully transparent so the WebGL terrain canvas shows through.
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let y = 0; y < grid.height; y++) {
      const cy = y * CELL_SIZE + CELL_SIZE / 2;

      for (let x = 0; x < grid.width; x++) {
        const cx = x * CELL_SIZE + CELL_SIZE / 2;

        const vegType    = grid.get(x, y, LAYER_VEGETATION);
        const animalType = grid.get(x, y, LAYER_ANIMALS);
        const hasAnimal  = animalType !== EMPTY;
        const hasVeg     = vegType    !== EMPTY;

        // ── Vegetation icon ────────────────────────────────────────────────
        if (hasVeg) {
          const icon = this._icons.get(LAYER_VEGETATION)?.get(vegType);
          if (icon) {
            if (hasAnimal) {
              // Vegetation to top-left corner when sharing a cell with an animal.
              ctx.font = `${Math.floor(CELL_SIZE * 0.42)}px serif`;
              ctx.fillText(icon,
                x * CELL_SIZE + CELL_SIZE * 0.27,
                y * CELL_SIZE + CELL_SIZE * 0.27);
            } else {
              ctx.font = `${Math.floor(CELL_SIZE * 0.55)}px serif`;
              ctx.fillText(icon, cx, cy + 1);
            }
          }
        }

        // ── Animal icon ────────────────────────────────────────────────────
        if (hasAnimal) {
          const icon = this._icons.get(LAYER_ANIMALS)?.get(animalType);
          if (icon) {
            if (hasVeg) {
              // Animal to bottom-right corner when sharing a cell with vegetation.
              ctx.font = `${Math.floor(CELL_SIZE * 0.42)}px serif`;
              ctx.fillText(icon,
                x * CELL_SIZE + CELL_SIZE * 0.73,
                y * CELL_SIZE + CELL_SIZE * 0.73);
            } else {
              ctx.font = `${Math.floor(CELL_SIZE * 0.60)}px serif`;
              ctx.fillText(icon, cx, cy + 1);
            }
          }
        }
      }
    }
  }
}
