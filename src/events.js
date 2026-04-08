/**
 * Lightweight per-tick event log.
 *
 * Rules call events.log(type, entityTypeId, layer) during apply().
 * Main.js reads current[] after each tick to update running totals.
 *
 * Conventions for type strings:
 *   'birth'      — new entity placed (spread or reproduction)
 *   'death-age'  — entity died of old age
 *   'death-starve' — animal died of starvation
 *   'death-eaten'  — animal was consumed by a predator
 *   'eat-grass'  — herbivore consumed a grass cell
 *   'eat-tree'   — herbivore consumed a tree cell
 *   'eat-animal' — predator consumed an animal cell
 */
export class EventLog {
  constructor() {
    this._current = []; // events this tick only
  }

  /**
   * @param {string} type
   * @param {number} entityTypeId  — numeric entity type (GRASS, HERBIVORE, etc.)
   * @param {number} layer         — layer index the event occurred on
   */
  log(type, entityTypeId, layer) {
    this._current.push({ type, entityTypeId, layer });
  }

  /** Events logged during the current tick. Read by main.js after applyAll(). */
  get current() { return this._current; }

  /** Clear before each tick. */
  flush() { this._current = []; }

  /** Full reset (on simulation restart). */
  reset() { this._current = []; }
}
