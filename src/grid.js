export const EMPTY = 0;
export const GRASS = 1;

const NEIGHBORS_4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export class Grid {
  constructor(width = 10, height = 10) {
    this.width = width;
    this.height = height;
    this.cells = new Uint8Array(width * height);
  }

  get(x, y) {
    return this.cells[y * this.width + x];
  }

  set(x, y, state) {
    this.cells[y * this.width + x] = state;
  }

  inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  emptyNeighbors(x, y) {
    const result = [];
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (this.inBounds(nx, ny) && this.get(nx, ny) === EMPTY) {
        result.push([nx, ny]);
      }
    }
    return result;
  }

  countState(state) {
    let n = 0;
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] === state) n++;
    }
    return n;
  }

  isFull() {
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] === EMPTY) return false;
    }
    return true;
  }

  clear() {
    this.cells.fill(EMPTY);
  }
}
