const CELL_COLORS = {
  0: '#1a1a1a', // EMPTY
  1: '#4a9e5c', // GRASS
};

const CELL_SIZE = 40; // px per cell
const GAP = 1;        // px gap between cells

export class Renderer {
  constructor(canvas, grid) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.grid = grid;

    canvas.width = grid.width * CELL_SIZE;
    canvas.height = grid.height * CELL_SIZE;
  }

  draw() {
    const { ctx, grid } = this;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const state = grid.get(x, y);
        ctx.fillStyle = CELL_COLORS[state] ?? '#000';
        ctx.fillRect(
          x * CELL_SIZE + GAP,
          y * CELL_SIZE + GAP,
          CELL_SIZE - GAP,
          CELL_SIZE - GAP,
        );
      }
    }
  }
}
