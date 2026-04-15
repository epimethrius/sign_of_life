/**
 * Season state — module-level singleton shared by the season-engine rule and
 * all rules that need to apply seasonal / weather modifiers.
 *
 * Seasons: 0 spring · 1 summer · 2 autumn · 3 winter
 * Events:  null | 'drought' | 'cold_snap'
 *
 * Call resetSeasonState() at the start of each simulation run (important for
 * the headless runner, which reuses rule instances across runs).
 */

// ── State object ──────────────────────────────────────────────────────────────

export const seasonState = {
  tick:      0,   // ticks elapsed since last reset
  season:    0,   // 0-3
  event:     null,
  eventLeft: 0,
};

export function resetSeasonState() {
  seasonState.tick      = 0;
  seasonState.season    = 0;
  seasonState.event     = null;
  seasonState.eventLeft = 0;
}

// ── Display metadata ──────────────────────────────────────────────────────────

export const SEASON_INFO = [
  { name: 'Spring',   icon: '🌱', color: '#5ab85a' },
  { name: 'Summer',   icon: '☀️',  color: '#c8a030' },
  { name: 'Autumn',   icon: '🍂', color: '#c86430' },
  { name: 'Winter',   icon: '❄️',  color: '#5090c8' },
];

export const EVENT_INFO = {
  drought:   { name: 'Drought',   icon: '🌵' },
  cold_snap: { name: 'Cold Snap', icon: '🌨️' },
};

// ── Effect tables ─────────────────────────────────────────────────────────────

/**
 * Per-season multipliers. All keys default to 1.0 (neutral) if missing.
 *
 * Keys used by rules:
 *   grassSpread      — multiplied onto grass spread chance
 *   treeSpread       — multiplied onto tree spread chance
 *   vegLifespanMult  — multiplied onto new-plant lifespan AND attrition rate
 *   energyDecay      — multiplied onto animal energyDecayPerTick
 *   reproThreshMult  — multiplied onto animal reproThreshold for the breed check
 */
const SEASON_EFFECTS = [
  // 0 Spring — growth, mild weather
  { grassSpread: 1.5, treeSpread: 1.4, vegLifespanMult: 1.3, energyDecay: 0.85, reproThreshMult: 0.90 },
  // 1 Summer — baseline
  { grassSpread: 1.0, treeSpread: 1.0, vegLifespanMult: 1.0, energyDecay: 1.00, reproThreshMult: 1.00 },
  // 2 Autumn — slowing growth, mild stress
  { grassSpread: 0.65, treeSpread: 0.75, vegLifespanMult: 0.75, energyDecay: 1.15, reproThreshMult: 1.00 },
  // 3 Winter — harsh, sparse vegetation
  { grassSpread: 0.15, treeSpread: 0.25, vegLifespanMult: 0.50, energyDecay: 1.45, reproThreshMult: 1.25 },
];

const EVENT_EFFECTS = {
  drought: {
    grassSpread:    0.25,
    treeSpread:     0.50,
    vegLifespanMult: 0.60,
    energyDecay:    1.30,
  },
  cold_snap: {
    grassSpread:    0.20,
    treeSpread:     0.30,
    vegLifespanMult: 0.65,
    energyDecay:    1.60,
    reproThreshMult: 1.40,
  },
};

/**
 * Returns the combined (season × event) effect multiplier for the given key.
 * Missing keys default to 1.0.
 *
 * @param {string} key  Effect key (see table above).
 * @returns {number}
 */
export function getSeasonEffect(key) {
  const s = SEASON_EFFECTS[seasonState.season] ?? {};
  const e = seasonState.event ? (EVENT_EFFECTS[seasonState.event] ?? {}) : {};
  return (s[key] ?? 1.0) * (e[key] ?? 1.0);
}
