/**
 * Season Engine — advances the season clock and triggers random weather events.
 *
 * Runs first in the rule pipeline so all other rules see the current season
 * effects immediately via getSeasonEffect().
 *
 * Season cycle (default 50 ticks each):
 *   Spring → Summer → Autumn → Winter → Spring → …
 *
 * Random events:
 *   Drought    — possible in Summer & Autumn; dries out vegetation, stresses animals
 *   Cold Snap  — possible in Autumn & Winter; severe energy drain, hard to breed
 */

import { LAYER_EVENTS } from '../grid.js';
import { seasonState, SEASON_INFO, EVENT_INFO } from '../season-state.js';

// Ticks per season (full year = 4 × SEASON_LENGTH ticks).
const SEASON_LENGTH = 50;

// Probability per tick that a weather event begins (when eligible season).
const DROUGHT_PROB   = 0.006;   // ~26% chance across a 50-tick summer
const COLD_SNAP_PROB = 0.008;   // ~33% chance across a 50-tick autumn

// Duration range for each event type [min, max] in ticks.
const DROUGHT_DUR   = [12, 22];
const COLD_SNAP_DUR = [ 8, 18];

export default {
  id:       'season-engine',
  category: 'Environment',
  tags:     ['environment', 'season'],

  name:        'Season Engine',
  description: 'Cycles spring→summer→autumn→winter; triggers drought and cold snaps.',
  entity: null,

  apply(grid, rng, events) {
    const s = seasonState;
    s.tick++;

    // ── Season transition ────────────────────────────────────────────────────
    const newSeason = Math.floor(s.tick / SEASON_LENGTH) % 4;
    if (newSeason !== s.season) {
      s.season = newSeason;
      events.log('season-change', 0, LAYER_EVENTS);
    }

    // ── Weather events ───────────────────────────────────────────────────────
    if (s.event === null) {
      // Drought: eligible in summer (1) and autumn (2).
      if ((s.season === 1 || s.season === 2) && rng() < DROUGHT_PROB) {
        s.event     = 'drought';
        s.eventLeft = DROUGHT_DUR[0] + Math.floor(rng() * (DROUGHT_DUR[1] - DROUGHT_DUR[0] + 1));
        events.log('event-start', 0, LAYER_EVENTS);
      // Cold snap: eligible in autumn (2) and winter (3).
      } else if ((s.season === 2 || s.season === 3) && rng() < COLD_SNAP_PROB) {
        s.event     = 'cold_snap';
        s.eventLeft = COLD_SNAP_DUR[0] + Math.floor(rng() * (COLD_SNAP_DUR[1] - COLD_SNAP_DUR[0] + 1));
        events.log('event-start', 0, LAYER_EVENTS);
      }
    } else {
      if (--s.eventLeft <= 0) {
        s.event = null;
        events.log('event-end', 0, LAYER_EVENTS);
      }
    }

    // ── Write season to LAYER_EVENTS for visualization ───────────────────────
    // Encoding: bits 0-2 = season (1-4), bit 3 = drought, bit 4 = cold snap.
    const evVal = (s.season + 1)
      + (s.event === 'drought'   ? 4  : 0)
      + (s.event === 'cold_snap' ? 8  : 0);
    grid.layers[LAYER_EVENTS].fill(evVal);
  },
};
