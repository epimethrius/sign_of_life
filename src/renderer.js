import { LAYER_TERRAIN, LAYER_VEGETATION, EMPTY } from './grid.js';
import { colorOf as terrainColor } from './terrains/index.js';

const CELL_SIZE = 40; // px per cell
const GAP       = 1;  // px gap between cells

// Icon font size as a fraction of cell size.
const ICON_SCALE = 0.55;

export class Renderer {
  constructor(canvas, grid) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.grid   = grid;

    canvas.width  = grid.width  * CELL_SIZE;
    canvas.height = grid.height * CELL_SIZE;

    // Map from vegetation typeId → icon string.
    // Populated by main.js via setEntityIcons().
    this._entityIcons = new Map();

    // Pre-configure text rendering (doesn't change between frames).
    this.ctx.textAlign    = 'center';
    this.ctx.textBaseline = 'middle';
  }

  /**
   * Register icons for vegetation entity typeIds.
   * @param {Map<number, string>} iconMap  e.g. new Map([[1, '🌿'], [2, '🌲']])
   */
  setEntityIcons(iconMap) {
    this._entityIcons = iconMap;
  }

  draw() {
    const { ctx, grid } = this;
    const cellInner = CELL_SIZE - GAP;

    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (let y = 0; y < grid.height; y++) {
      const py = y * CELL_SIZE + GAP;
      const cy = y * CELL_SIZE + CELL_SIZE / 2;

      for (let x = 0; x < grid.width; x++) {
        const px = x * CELL_SIZE + GAP;
        const cx = x * CELL_SIZE + CELL_SIZE / 2;

        // ── Pass 1: terrain fill ────────────────────────────────────────────
        const terrainType = grid.get(x, y, LAYER_TERRAIN);
        ctx.fillStyle = terrainColor(terrainType);
        ctx.fillRect(px, py, cellInner, cellInner);

        // ── Pass 2: vegetation icon ─────────────────────────────────────────
        const vegType = grid.get(x, y, LAYER_VEGETATION);
        if (vegType !== EMPTY) {
          const icon = this._entityIcons.get(vegType);
          if (icon) {
            ctx.font = `${Math.floor(CELL_SIZE * ICON_SCALE)}px serif`;
            ctx.fillText(icon, cx, cy + 1); // +1 for optical centering
          }
        }
      }
    }
  }
}
