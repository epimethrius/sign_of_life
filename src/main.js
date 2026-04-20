/* global __APP_VERSION__, __COMMIT_HASH__ */
import {
  Grid,
  GRASS, TREE, LILY, HERBIVORE, PREDATOR, OMNIVORE, SMALL_FISH, BIG_FISH, BIRD,
  SOIL, WATER, EMPTY,
  LAYER_TERRAIN, LAYER_VEGETATION, LAYER_ANIMALS,
} from './grid.js';
import { seasonState, resetSeasonState, SEASON_INFO, EVENT_INFO } from './season-state.js';
import { WebGLRenderer, OVERLAY_NORMAL, OVERLAY_AGE, OVERLAY_ENERGY, OVERLAY_TRAIT, setCellSize } from './renderer-webgl.js';
import { Renderer }           from './renderer.js';
import { Loop }               from './loop.js';
import { StatsBuffer }        from './stats.js';
import { EventLog }           from './events.js';
import { createRuleRegistry } from './rules/index.js';
import { createRng, randomSeed, seedToHex, hexToSeed } from './rng.js';
import { computeLifespan }    from './actions.js';
import { encodeWorld, decodeWorld } from './serializer.js';
import { ChartRenderer }           from './chart.js';
import { generateTerrain }    from './terrain-gen.js';
import { ALL_TERRAINS, terrainOf } from './terrains/index.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const canvas        = document.getElementById('grid-canvas');  // WebGL terrain
const iconCanvas    = document.getElementById('grid-icons');   // 2D emoji overlay
const statusLine    = document.getElementById('status-line');
const statsTableEl  = document.getElementById('stats-table');
const statsSumEl    = document.getElementById('stats-summary');
const btnNext       = document.getElementById('btn-next');
const btnReset      = document.getElementById('btn-reset');
const toggleAuto    = document.getElementById('toggle-auto');
const inputDelay    = document.getElementById('input-delay');
const seedDisplay   = document.getElementById('seed-display');
const btnNewSeed    = document.getElementById('btn-new-seed');
const shareInput    = document.getElementById('share-input');
const btnCopy       = document.getElementById('btn-copy');
const btnLoad       = document.getElementById('btn-load');
const rulesList     = document.getElementById('rules-list');
const tagFilterEl   = document.getElementById('tag-filter');
const legendEl      = document.getElementById('legend-content');
const gridSizeEl    = document.getElementById('grid-size');
const chartCanvas   = document.getElementById('chart-canvas');
const overlayModeEl = document.getElementById('overlay-mode');
const overlayKeyEl  = document.getElementById('overlay-key');
const keySwatch     = document.getElementById('key-swatch');
const keyLo         = document.getElementById('key-lo');
const keyHi         = document.getElementById('key-hi');

const terrainPctInputs = {
  water: document.getElementById('pct-water'),
  rock:  document.getElementById('pct-rock'),
  sand:  document.getElementById('pct-sand'),
};
const soilPctDisplay = document.getElementById('soil-pct');

const popInputs = {
  [GRASS]: document.getElementById('pop-grass'),
  [TREE]:  document.getElementById('pop-tree'),
  [LILY]:  document.getElementById('pop-lily'),
};
const popInputAnimals = {
  [HERBIVORE]:  document.getElementById('pop-herbivore'),
  [PREDATOR]:   document.getElementById('pop-predator'),
  [OMNIVORE]:   document.getElementById('pop-omnivore'),
  [SMALL_FISH]: document.getElementById('pop-small-fish'),
  [BIG_FISH]:   document.getElementById('pop-big-fish'),
  [BIRD]:       document.getElementById('pop-bird'),
};
const seasonDisplayEl  = document.getElementById('season-display');
const traitSpeciesEl   = document.getElementById('trait-species');
const traitTableEl     = document.getElementById('trait-table');
const mapViewport      = document.getElementById('map-viewport');
const canvasContainer  = document.getElementById('canvas-container');
const zoomInBtn        = document.getElementById('btn-zoom-in');
const zoomOutBtn       = document.getElementById('btn-zoom-out');
const zoomFitBtn       = document.getElementById('btn-zoom-fit');
const zoomLevelEl      = document.getElementById('zoom-level');

// ── Zoom / fit ────────────────────────────────────────────────────────────────
let zoomScale = 1.0;

function computeFitCellSize(gridSize) {
  const availH = Math.round(window.innerHeight * 0.72);
  const availW = window.innerWidth - 300; // sidebar + padding estimate
  return Math.max(6, Math.min(40, Math.floor(Math.min(availH, availW) / gridSize)));
}

function applyZoom() {
  canvasContainer.style.transform       = `scale(${zoomScale})`;
  canvasContainer.style.transformOrigin = 'top left';
  mapViewport.style.width  = `${Math.round(canvas.width  * zoomScale)}px`;
  mapViewport.style.height = `${Math.round(canvas.height * zoomScale)}px`;
  zoomLevelEl.textContent  = `${Math.round(zoomScale * 100)}%`;
}

function fitToScreen() {
  setCellSize(computeFitCellSize(grid.width));
  webglRenderer.resize(grid);
  iconRenderer.resize(grid);
  zoomScale = 1.0;
  applyZoom();
  draw();
}

zoomInBtn.addEventListener('click',  () => { zoomScale = Math.min(4, parseFloat((zoomScale + 0.25).toFixed(2))); applyZoom(); });
zoomOutBtn.addEventListener('click', () => { zoomScale = Math.max(0.25, parseFloat((zoomScale - 0.25).toFixed(2))); applyZoom(); });
zoomFitBtn.addEventListener('click', fitToScreen);
window.addEventListener('resize', fitToScreen);

function getPopCount(typeId, layer) {
  const inp = layer === LAYER_VEGETATION
    ? popInputs[typeId]
    : popInputAnimals[typeId];
  return Math.max(0, parseInt(inp?.value ?? '1', 10) || 0);
}

// ── Core objects ──────────────────────────────────────────────────────────────
const _initSize = parseInt(gridSizeEl.value, 10);
setCellSize(computeFitCellSize(_initSize));
let grid          = new Grid(_initSize, _initSize);
let webglRenderer = new WebGLRenderer(canvas, grid);
let iconRenderer  = new Renderer(iconCanvas, grid);
_applyEntityIcons();

let overlayMode = OVERLAY_NORMAL;

function draw() {
  webglRenderer.draw(overlayMode);
  iconRenderer.draw();
}
const rules  = createRuleRegistry();
const events = new EventLog();
const stats  = new StatsBuffer(9, 1000); // 0=GRASS,1=TREE,2=LILY,3=HERBIVORE,4=PREDATOR,5=OMNIVORE,6=SMALL_FISH,7=BIG_FISH,8=BIRD

const CHART_SERIES = [
  { label: 'Grass',      color: '#5a9e4a' },
  { label: 'Tree',       color: '#2d6e2d' },
  { label: 'Lily',       color: '#c44faa' },
  { label: 'Herbivore',  color: '#7b68cc' },
  { label: 'Predator',   color: '#d45f2a' },
  { label: 'Omnivore',   color: '#a0622a' },
  { label: 'Small Fish', color: '#2299cc' },
  { label: 'Big Fish',   color: '#115577' },
  { label: 'Bird',       color: '#cc8822' },
];
chartCanvas.width  = 640;
chartCanvas.height = 140;
const chartRenderer = new ChartRenderer(chartCanvas, CHART_SERIES);

const ENTITY_KEYS = [
  { typeId: GRASS,      layer: LAYER_VEGETATION, label: 'Grass',      icon: '🌿', statsIdx: 0 },
  { typeId: TREE,       layer: LAYER_VEGETATION, label: 'Tree',       icon: '🌲', statsIdx: 1 },
  { typeId: LILY,       layer: LAYER_VEGETATION, label: 'Lily',       icon: '🪷', statsIdx: 2 },
  { typeId: HERBIVORE,  layer: LAYER_ANIMALS,    label: 'Herbivore',  icon: '🐇', statsIdx: 3 },
  { typeId: PREDATOR,   layer: LAYER_ANIMALS,    label: 'Predator',   icon: '🦊', statsIdx: 4 },
  { typeId: OMNIVORE,   layer: LAYER_ANIMALS,    label: 'Omnivore',   icon: '🦝', statsIdx: 5 },
  { typeId: SMALL_FISH, layer: LAYER_ANIMALS,    label: 'Small Fish', icon: '🐟', statsIdx: 6 },
  { typeId: BIG_FISH,   layer: LAYER_ANIMALS,    label: 'Big Fish',   icon: '🐠', statsIdx: 7 },
  { typeId: BIRD,       layer: LAYER_ANIMALS,    label: 'Bird',       icon: '🦅', statsIdx: 8 },
];

const TRAIT_BASELINES = {
  [HERBIVORE]:  { decay: 0.30, repro: 10 },
  [PREDATOR]:   { decay: 0.80, repro: 20 },
  [OMNIVORE]:   { decay: 0.35, repro: 10 },
  [SMALL_FISH]: { decay: 0.30, repro:  8 },
  [BIG_FISH]:   { decay: 0.30, repro: 12 },
  [BIRD]:       { decay: 0.50, repro: 14 },
};
webglRenderer.setTraitBaselines(TRAIT_BASELINES);

let lifetimeBirths = {};
let lifetimeDeaths = {};
function resetLifetimeCounts() {
  for (const k of ENTITY_KEYS) {
    lifetimeBirths[_ekey(k)] = 0;
    lifetimeDeaths[_ekey(k)] = 0;
  }
}
function _ekey(k) { return `${k.typeId}:${k.layer}`; }

function _applyEntityIcons() {
  iconRenderer.setEntityIcons(LAYER_VEGETATION, new Map([[GRASS, '🌿'], [TREE, '🌲'], [LILY, '🪷']]));
  iconRenderer.setEntityIcons(LAYER_ANIMALS,    new Map([[HERBIVORE, '🐇'], [PREDATOR, '🦊'], [OMNIVORE, '🦝'], [SMALL_FISH, '🐟'], [BIG_FISH, '🐠'], [BIRD, '🦅']]));
}

let simRng;
let currentSeed;
let generation      = 0;
let finished        = false;
let stableTicks     = 0;
let prevTotalVeg    = 0;
let prevTotalAnimal = 0;

// ── Terrain % helpers ─────────────────────────────────────────────────────────
function getTerrainPct() {
  return {
    water: clamp(parseFloat(terrainPctInputs.water.value) || 0, 0, 100) / 100,
    rock:  clamp(parseFloat(terrainPctInputs.rock.value)  || 0, 0, 100) / 100,
    sand:  clamp(parseFloat(terrainPctInputs.sand.value)  || 0, 0, 100) / 100,
  };
}
function updateSoilDisplay() {
  const { water, rock, sand } = getTerrainPct();
  soilPctDisplay.textContent = `Soil: ${Math.max(0, 100 - Math.round((water + rock + sand) * 100))}%`;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
for (const inp of Object.values(terrainPctInputs)) inp.addEventListener('input', updateSoilDisplay);
updateSoilDisplay();

// ── Init ──────────────────────────────────────────────────────────────────────
function init(seed) {
  currentSeed = seed !== undefined ? seed : randomSeed();
  const initRng = createRng(currentSeed);
  simRng        = createRng(currentSeed ^ 0x9E3779B9);

  grid.clearAll();
  generateTerrain(grid, getTerrainPct(), initRng);

  // Seed vegetation (no food constraint needed for plants).
  _seedMany(GRASS, LAYER_VEGETATION, getPopCount(GRASS, LAYER_VEGETATION), null, initRng);
  _seedMany(TREE,  LAYER_VEGETATION, getPopCount(TREE,  LAYER_VEGETATION), null, initRng);
  _seedAquatic(LILY, LAYER_VEGETATION, getPopCount(LILY, LAYER_VEGETATION), initRng);

  // Seed land animals near their food source.
  const herbRule = rules.rules.find(r => r.entity?.typeId === HERBIVORE);
  const predRule = rules.rules.find(r => r.entity?.typeId === PREDATOR);
  const omniRule = rules.rules.find(r => r.entity?.typeId === OMNIVORE);
  _seedMany(HERBIVORE, LAYER_ANIMALS, getPopCount(HERBIVORE, LAYER_ANIMALS), herbRule?.entity?.spawnNearFood ?? null, initRng);
  _seedMany(PREDATOR,  LAYER_ANIMALS, getPopCount(PREDATOR,  LAYER_ANIMALS), predRule?.entity?.spawnNearFood ?? null, initRng);
  _seedMany(OMNIVORE,  LAYER_ANIMALS, getPopCount(OMNIVORE,  LAYER_ANIMALS), omniRule?.entity?.spawnNearFood ?? null, initRng);
  _seedMany(BIRD,      LAYER_ANIMALS, getPopCount(BIRD,      LAYER_ANIMALS), null, initRng);

  // Seed aquatic animals on water cells.
  _seedAquatic(SMALL_FISH, LAYER_ANIMALS, getPopCount(SMALL_FISH, LAYER_ANIMALS), initRng);
  _seedAquatic(BIG_FISH,   LAYER_ANIMALS, getPopCount(BIG_FISH,   LAYER_ANIMALS), initRng);

  resetSeasonState();

  generation      = 0;
  finished        = false;
  stableTicks     = 0;
  prevTotalVeg    = grid.countState(GRASS, LAYER_VEGETATION) + grid.countState(TREE, LAYER_VEGETATION) + grid.countState(LILY, LAYER_VEGETATION);
  prevTotalAnimal = grid.countState(HERBIVORE,  LAYER_ANIMALS) + grid.countState(PREDATOR, LAYER_ANIMALS)
                  + grid.countState(OMNIVORE,   LAYER_ANIMALS)
                  + grid.countState(SMALL_FISH, LAYER_ANIMALS) + grid.countState(BIG_FISH, LAYER_ANIMALS)
                  + grid.countState(BIRD,       LAYER_ANIMALS);

  stats.reset();
  events.reset();
  resetLifetimeCounts();

  // Count the initial seeded population as births at tick 0.
  for (const k of ENTITY_KEYS) {
    lifetimeBirths[_ekey(k)] = grid.countState(k.typeId, k.layer);
  }

  seedDisplay.value      = seedToHex(currentSeed);
  shareInput.value       = encodeWorld(grid, currentSeed, rules);
  statsSumEl.textContent = '';

  loop.stop();
  toggleAuto.checked = false;
  btnNext.disabled   = false;

  updateStatus();
  draw();
}

/**
 * Seed `count` entities of `entityType` on `layer`.
 * If `foodConstraint` is provided, each entity is placed within 2 cells
 * (Chebyshev distance) of a compatible food cell. Falls back to any valid
 * cell if no constrained position is available.
 */
function _seedMany(entityType, layer, count, foodConstraint, rng) {
  const rule = rules.rules.find(r => r.entity?.typeId === entityType && r.entity?.layer === layer);
  const baseLifespan    = rule?.entity?.baseLifespan    ?? 0;
  const lifespanVariance = rule?.entity?.lifespanVariance ?? 0;
  const baseEnergy      = rule?.entity?.baseEnergy      ?? 0;

  for (let n = 0; n < count; n++) {
    // Build candidate list: non-water, unoccupied, (optionally) near food.
    let candidates = _validCells(layer);

    if (foodConstraint && candidates.length > 0) {
      const constrained = candidates.filter(([cx, cy]) =>
        _hasNearbyFood(cx, cy, foodConstraint.layer, foodConstraint.types, 2)
      );
      // Fall back to unconstrained if no valid constrained cell exists.
      if (constrained.length > 0) candidates = constrained;
    }

    if (candidates.length === 0) continue;

    const [x, y] = candidates[Math.floor(rng() * candidates.length)];
    const ls = baseLifespan > 0 ? computeLifespan(baseLifespan, lifespanVariance, rng) : 0;
    grid.place(x, y, entityType, layer, ls, baseEnergy);
    if (layer === LAYER_ANIMALS) {
      const tb = TRAIT_BASELINES[entityType];
      if (tb) {
        const idx = y * grid.width + x;
        grid.traitDecay[layer][idx] = tb.decay;
        grid.traitRepro[layer][idx] = tb.repro;
      }
    }
  }
}

function _seedAquatic(entityType, layer, count, rng) {
  const rule = rules.rules.find(r => r.entity?.typeId === entityType && r.entity?.layer === layer);
  const baseLifespan     = rule?.entity?.baseLifespan     ?? 0;
  const lifespanVariance = rule?.entity?.lifespanVariance ?? 0;
  const baseEnergy       = rule?.entity?.baseEnergy       ?? 0;

  const candidates = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.get(x, y, LAYER_TERRAIN) !== WATER) continue;
      if (grid.get(x, y, layer) !== EMPTY) continue;
      candidates.push([x, y]);
    }
  }

  for (let n = 0; n < count && candidates.length > 0; n++) {
    const idx = Math.floor(rng() * candidates.length);
    const [x, y] = candidates[idx];
    candidates.splice(idx, 1);
    const ls = baseLifespan > 0 ? computeLifespan(baseLifespan, lifespanVariance, rng) : 0;
    grid.place(x, y, entityType, layer, ls, baseEnergy);
    if (layer === LAYER_ANIMALS) {
      const tb = TRAIT_BASELINES[entityType];
      if (tb) {
        const ci = y * grid.width + x;
        grid.traitDecay[layer][ci] = tb.decay;
        grid.traitRepro[layer][ci] = tb.repro;
      }
    }
  }
}

function _validCells(layer) {
  const cells = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.get(x, y, LAYER_TERRAIN) === WATER) continue;
      if (grid.get(x, y, layer) !== EMPTY) continue;
      cells.push([x, y]);
    }
  }
  return cells;
}

function _hasNearbyFood(x, y, foodLayer, foodTypes, maxDist) {
  for (let dy = -maxDist; dy <= maxDist; dy++) {
    for (let dx = -maxDist; dx <= maxDist; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) continue;
      if (foodTypes.includes(grid.get(nx, ny, foodLayer))) return true;
    }
  }
  return false;
}

// ── Tick ──────────────────────────────────────────────────────────────────────
function tick() {
  if (finished) return;

  events.flush();
  rules.applyAll(grid, simRng, events);
  generation++;

  for (const ev of events.current) {
    const k = ENTITY_KEYS.find(k => k.typeId === ev.entityTypeId && k.layer === ev.layer);
    if (!k) continue;
    const key = _ekey(k);
    if (ev.type === 'birth') lifetimeBirths[key] = (lifetimeBirths[key] || 0) + 1;
    else if (ev.type.startsWith('death')) lifetimeDeaths[key] = (lifetimeDeaths[key] || 0) + 1;
  }

  const counts = [
    grid.countState(GRASS,      LAYER_VEGETATION),
    grid.countState(TREE,       LAYER_VEGETATION),
    grid.countState(LILY,       LAYER_VEGETATION),
    grid.countState(HERBIVORE,  LAYER_ANIMALS),
    grid.countState(PREDATOR,   LAYER_ANIMALS),
    grid.countState(OMNIVORE,   LAYER_ANIMALS),
    grid.countState(SMALL_FISH, LAYER_ANIMALS),
    grid.countState(BIG_FISH,   LAYER_ANIMALS),
    grid.countState(BIRD,       LAYER_ANIMALS),
  ];
  stats.push(counts);

  const totalVeg    = counts[0] + counts[1] + counts[2];
  const totalAnimal = counts[3] + counts[4] + counts[5] + counts[6] + counts[7] + counts[8];
  if (totalVeg === prevTotalVeg && totalAnimal === prevTotalAnimal) {
    if (++stableTicks >= 5) {
      finished = true;
      loop.stop();
      toggleAuto.checked = false;
      btnNext.disabled   = true;
      statsSumEl.textContent = `Simulation stabilised after ${generation} ticks.`;
    }
  } else {
    stableTicks = 0;
  }
  prevTotalVeg    = totalVeg;
  prevTotalAnimal = totalAnimal;

  updateStatus(counts);
  draw();
}

function updateTraitTable() {
  if (!traitSpeciesEl || !traitTableEl) return;
  const typeId   = parseInt(traitSpeciesEl.value, 10);
  const key      = ENTITY_KEYS.find(k => k.typeId === typeId && k.layer === LAYER_ANIMALS);
  const baseline = TRAIT_BASELINES[typeId];
  if (!key || !baseline) return;

  const al = LAYER_ANIMALS;
  let sumDecay = 0, sumRepro = 0, count = 0;
  let minDecay = Infinity, maxDecay = -Infinity;
  let minRepro = Infinity, maxRepro = -Infinity;
  for (let i = 0; i < grid.width * grid.height; i++) {
    if (grid.layers[al][i] !== typeId) continue;
    const d = grid.traitDecay[al][i];
    const r = grid.traitRepro[al][i];
    sumDecay += d; sumRepro += r; count++;
    if (d < minDecay) minDecay = d;
    if (d > maxDecay) maxDecay = d;
    if (r < minRepro) minRepro = r;
    if (r > maxRepro) maxRepro = r;
  }

  if (count === 0) {
    traitTableEl.innerHTML = `<tr><td colspan="4" style="color:#bbb">No ${key.label} alive</td></tr>`;
    return;
  }

  const avgDecay = sumDecay / count;
  const avgRepro = sumRepro / count;
  const fmtDev = (avg, base) => {
    const pct = (avg - base) / base * 100;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}%`;
  };

  traitTableEl.innerHTML =
    `<tr><td>Energy decay/tick</td>` +
    `<td>${baseline.decay}</td>` +
    `<td>${avgDecay.toFixed(3)}</td>` +
    `<td>${fmtDev(avgDecay, baseline.decay)}</td>` +
    `<td>${minDecay.toFixed(3)}–${maxDecay.toFixed(3)}</td></tr>` +
    `<tr><td>Repro threshold</td>` +
    `<td>${baseline.repro}</td>` +
    `<td>${avgRepro.toFixed(2)}</td>` +
    `<td>${fmtDev(avgRepro, baseline.repro)}</td>` +
    `<td>${minRepro.toFixed(2)}–${maxRepro.toFixed(2)}</td></tr>`;
}

function updateStatus(counts) {
  const c = counts ?? [
    grid.countState(GRASS,      LAYER_VEGETATION),
    grid.countState(TREE,       LAYER_VEGETATION),
    grid.countState(LILY,       LAYER_VEGETATION),
    grid.countState(HERBIVORE,  LAYER_ANIMALS),
    grid.countState(PREDATOR,   LAYER_ANIMALS),
    grid.countState(OMNIVORE,   LAYER_ANIMALS),
    grid.countState(SMALL_FISH, LAYER_ANIMALS),
    grid.countState(BIG_FISH,   LAYER_ANIMALS),
    grid.countState(BIRD,       LAYER_ANIMALS),
  ];
  statusLine.textContent = `Generation: ${generation}`;

  // Season / event indicator.
  const si = SEASON_INFO[seasonState.season];
  let seasonText = `${si.icon} ${si.name}`;
  if (seasonState.event) {
    const ei = EVENT_INFO[seasonState.event];
    seasonText += `  ·  ${ei.icon} ${ei.name} (${seasonState.eventLeft} ticks)`;
  }
  if (seasonDisplayEl) seasonDisplayEl.textContent = seasonText;
  chartRenderer.draw(stats);
  updateTraitTable();
  statsTableEl.innerHTML = ENTITY_KEYS.map((k, i) => {
    const key    = _ekey(k);
    const pop    = c[i];
    const births = lifetimeBirths[key] || 0;
    const deaths = lifetimeDeaths[key] || 0;
    const total  = births + deaths;
    const ratio  = total > 0 ? ((deaths / total) * 100).toFixed(1) + '%' : '—';
    return `<tr><td>${k.icon} ${k.label}</td><td>${pop}</td><td>${births}</td><td>${deaths}</td><td>${ratio}</td></tr>`;
  }).join('');
}

// ── Loop ──────────────────────────────────────────────────────────────────────
const loop = new Loop(tick);

// ── Controls ──────────────────────────────────────────────────────────────────
btnNext.addEventListener('click', () => tick());
btnReset.addEventListener('click', () => init());
toggleAuto.addEventListener('change', () => {
  if (finished) { toggleAuto.checked = false; return; }
  loop.setAuto(toggleAuto.checked);
  btnNext.disabled = toggleAuto.checked;
});
inputDelay.addEventListener('change', () => {
  const ms = parseInt(inputDelay.value, 10);
  if (!isNaN(ms) && ms > 0) loop.setDelay(ms);
});

// ── Overlay mode ──────────────────────────────────────────────────────────────
const OVERLAY_META = {
  [OVERLAY_NORMAL]: null,
  [OVERLAY_AGE]:    { lo: 'young',     hi: 'old',      gradient: 'linear-gradient(to right, #385ced, #2ec82e, #e52626)' },
  [OVERLAY_ENERGY]: { lo: 'critical',  hi: 'full',     gradient: 'linear-gradient(to right, #e01a1a, #f2cc1a, #1acc33)' },
  [OVERLAY_TRAIT]:  { lo: 'efficient', hi: 'costly',   gradient: 'linear-gradient(to right, #336eff, #a6a6a6, #ff3333)' },
};

function updateOverlayKey() {
  const meta = OVERLAY_META[overlayMode];
  if (!meta) {
    overlayKeyEl.classList.remove('visible');
    return;
  }
  overlayKeyEl.classList.add('visible');
  keyLo.textContent = meta.lo;
  keyHi.textContent = meta.hi;
  // Draw gradient on the key swatch canvas.
  const ctx = keySwatch.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, keySwatch.width, 0);
  if (overlayMode === OVERLAY_AGE) {
    grad.addColorStop(0,    '#385ced');
    grad.addColorStop(0.5,  '#2ec82e');
    grad.addColorStop(1.0,  '#e52626');
  } else if (overlayMode === OVERLAY_TRAIT) {
    grad.addColorStop(0,    '#336eff');
    grad.addColorStop(0.5,  '#a6a6a6');
    grad.addColorStop(1.0,  '#ff3333');
  } else {
    grad.addColorStop(0,    '#e01a1a');
    grad.addColorStop(0.4,  '#f2cc1a');
    grad.addColorStop(1.0,  '#1acc33');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, keySwatch.width, keySwatch.height);
}

overlayModeEl.addEventListener('change', () => {
  overlayMode = parseInt(overlayModeEl.value, 10);
  updateOverlayKey();
  draw();
});

btnNewSeed.addEventListener('click', () => init());
gridSizeEl.addEventListener('change', () => {
  const size    = parseInt(gridSizeEl.value, 10);
  const oldArea = grid.width * grid.height;
  const newArea = size * size;
  const ratio   = newArea / oldArea;

  // Scale all population inputs proportionally to the new grid area.
  for (const inp of Object.values(popInputs).concat(Object.values(popInputAnimals))) {
    if (!inp) continue;
    inp.value = Math.max(1, Math.round(parseInt(inp.value, 10) * ratio));
  }

  loop.stop();
  grid = new Grid(size, size);
  setCellSize(computeFitCellSize(size));
  webglRenderer.resize(grid);
  iconRenderer.resize(grid);
  zoomScale = 1.0;
  _applyEntityIcons();
  init();
  applyZoom();
});
seedDisplay.addEventListener('change', () => {
  const seed = hexToSeed(seedDisplay.value);
  if (seed !== null) init(seed);
  else seedDisplay.value = seedToHex(currentSeed);
});

// ── Share ─────────────────────────────────────────────────────────────────────
btnCopy.addEventListener('click', () => {
  navigator.clipboard.writeText(shareInput.value).then(() => {
    btnCopy.textContent = 'Copied!';
    setTimeout(() => { btnCopy.textContent = 'Copy'; }, 1500);
  });
});
btnLoad.addEventListener('click', () => {
  try {
    const decoded = decodeWorld(shareInput.value.trim());
    for (let l = 0; l < decoded.layers.length && l < grid.layers.length; l++) {
      grid.layers[l].set(decoded.layers[l]);
      grid.age[l].fill(0);
      if (decoded.lifespans?.[l])      grid.lifespan[l].set(decoded.lifespans[l]);
      if (decoded.energies?.[l])       grid.energy[l].set(decoded.energies[l]);
      if (decoded.reproCooldowns?.[l]) grid.reproCooldown[l].set(decoded.reproCooldowns[l]);
    }
    rules.setEnabledByIndices(decoded.enabledRuleIndices);
    rebuildRuleUI();

    currentSeed = decoded.seed;
    seedDisplay.value = seedToHex(currentSeed);
    simRng      = createRng(currentSeed ^ 0x9E3779B9);
    generation  = 0;
    finished    = false;
    stableTicks = 0;
    stats.reset();
    events.reset();
    resetLifetimeCounts();
    statsSumEl.textContent = '';
    loop.stop();
    toggleAuto.checked = false;
    btnNext.disabled   = false;
    updateStatus();
    draw();
  } catch (err) {
    alert(`Failed to load world: ${err.message}`);
  }
});

// ── Rule UI with tag filter ───────────────────────────────────────────────────
let activeTag = null; // null = show all

function buildTagFilter() {
  // Collect all unique tags across rules.
  const allTags = [...new Set(rules.rules.flatMap(r => r.tags ?? []))].sort();

  tagFilterEl.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className   = 'tag-btn active';
  allBtn.textContent = 'All';
  allBtn.addEventListener('click', () => {
    activeTag = null;
    applyTagFilter();
    updateTagButtons();
  });
  tagFilterEl.appendChild(allBtn);

  for (const tag of allTags) {
    const btn = document.createElement('button');
    btn.className   = 'tag-btn';
    btn.textContent = tag;
    btn.dataset.tag = tag;
    btn.addEventListener('click', () => {
      activeTag = activeTag === tag ? null : tag;
      applyTagFilter();
      updateTagButtons();
    });
    tagFilterEl.appendChild(btn);
  }
}

function updateTagButtons() {
  for (const btn of tagFilterEl.querySelectorAll('.tag-btn')) {
    btn.classList.toggle('active',
      btn.dataset.tag === undefined ? activeTag === null : btn.dataset.tag === activeTag
    );
  }
}

function applyTagFilter() {
  for (const entry of rulesList.querySelectorAll('.rule-entry')) {
    const tags = (entry.dataset.tags ?? '').split(',');
    entry.classList.toggle('hidden',
      activeTag !== null && !tags.includes(activeTag)
    );
  }
}

function rebuildRuleUI() {
  rulesList.innerHTML = '';
  for (const rule of rules.rules) {
    const wrapper = document.createElement('div');
    wrapper.className    = 'rule-entry';
    wrapper.dataset.tags = (rule.tags ?? []).join(',');

    // Checkbox + name
    const lbl = document.createElement('label');
    const cb  = document.createElement('input');
    cb.type    = 'checkbox';
    cb.checked = rules.isEnabled(rule.id);
    cb.addEventListener('change', () => rules.toggle(rule.id));
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(` ${rule.name}`));
    wrapper.appendChild(lbl);

    // Tags
    if (rule.tags?.length) {
      const tagRow = document.createElement('div');
      tagRow.className = 'rule-tags';
      for (const t of rule.tags) {
        const span = document.createElement('span');
        span.className   = 'rule-tag';
        span.textContent = t;
        tagRow.appendChild(span);
      }
      wrapper.appendChild(tagRow);
    }

    // Description
    const desc = document.createElement('div');
    desc.className   = 'rule-desc';
    desc.textContent = rule.description;
    wrapper.appendChild(desc);

    // Editable entity params (for rules with a living entity)
    if (rule.entity?.baseLifespan !== undefined) {
      const params = document.createElement('div');
      params.className = 'rule-params';
      params.appendChild(_numInput('Lifespan (ticks)', rule.entity.baseLifespan, 1, 9999,
        v => { rule.entity.baseLifespan = v; }));
      params.appendChild(_numInput('Variance (%)', Math.round(rule.entity.lifespanVariance * 100), 0, 100,
        v => { rule.entity.lifespanVariance = v / 100; }));
      if (rule.entity.baseEnergy !== undefined)
        params.appendChild(_numInput('Base energy', rule.entity.baseEnergy, 0, 9999,
          v => { rule.entity.baseEnergy = v; }));
      if (rule.entity.reproThreshold !== undefined)
        params.appendChild(_numInput('Repro threshold', rule.entity.reproThreshold, 1, 9999,
          v => { rule.entity.reproThreshold = v; }));
      if (rule.entity.reproCooldownDivisor !== undefined)
        params.appendChild(_numInput('Repro cooldown (lifespan÷)', rule.entity.reproCooldownDivisor, 1, 100,
          v => { rule.entity.reproCooldownDivisor = v; }));
      wrapper.appendChild(params);
    }

    // Generic configurable params (e.g. season length on the season engine)
    if (rule.params?.length) {
      const paramRow = document.createElement('div');
      paramRow.className = 'rule-params';
      for (const p of rule.params) {
        paramRow.appendChild(_numInput(p.label, p.value, p.min ?? 1, p.max ?? 9999,
          v => { p.value = v; }));
      }
      wrapper.appendChild(paramRow);
    }

    rulesList.appendChild(wrapper);
  }
  applyTagFilter();
}

function _numInput(label, initial, min, max, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'param-label';
  const inp = document.createElement('input');
  inp.type  = 'number'; inp.className = 'param-input';
  inp.value = initial;  inp.min = min; inp.max = max;
  inp.addEventListener('change', () => { const v = parseFloat(inp.value); if (!isNaN(v)) onChange(v); });
  wrap.appendChild(document.createTextNode(label + ': '));
  wrap.appendChild(inp);
  return wrap;
}

// ── Legend ────────────────────────────────────────────────────────────────────
function buildLegend() {
  legendEl.innerHTML = '';

  const th = document.createElement('div');
  th.className = 'legend-group-label'; th.textContent = 'Terrain';
  legendEl.appendChild(th);
  for (const t of ALL_TERRAINS) {
    const row = document.createElement('div'); row.className = 'legend-row';
    const sw  = document.createElement('span'); sw.className = 'legend-swatch'; sw.style.background = t.color;
    const nm  = document.createElement('span'); nm.textContent = t.name;
    row.appendChild(sw); row.appendChild(nm); legendEl.appendChild(row);
  }

  for (const [groupLabel, layerFilter] of [['Vegetation', LAYER_VEGETATION], ['Animals', LAYER_ANIMALS]]) {
    const gh = document.createElement('div');
    gh.className = 'legend-group-label'; gh.textContent = groupLabel;
    legendEl.appendChild(gh);
    for (const rule of rules.rules) {
      if (!rule.entity || rule.entity.layer !== layerFilter) continue;
      const { icon, name, description } = rule.entity;
      const row  = document.createElement('div'); row.className = 'legend-row';
      const ico  = document.createElement('span'); ico.className = 'legend-icon'; ico.textContent = icon;
      const txt  = document.createElement('span'); txt.textContent = `${name} — ${description}`;
      row.appendChild(ico); row.appendChild(txt); legendEl.appendChild(row);
    }
  }
}

// ── Cell tooltip ──────────────────────────────────────────────────────────────
const tooltipEl = document.getElementById('cell-tooltip');

canvas.addEventListener('mousemove', e => {
  const rect     = canvas.getBoundingClientRect();
  const cellSize = rect.width / grid.width; // correct under any CSS scale or zoom
  const cx = Math.floor((e.clientX - rect.left) / cellSize);
  const cy = Math.floor((e.clientY - rect.top)  / cellSize);
  if (cx < 0 || cx >= grid.width || cy < 0 || cy >= grid.height) return;

  const lines = [];

  // Terrain
  const terrain = terrainOf(grid.get(cx, cy, LAYER_TERRAIN));
  lines.push(`<span class="tt-layer">Terrain</span>`);
  lines.push(terrain ? terrain.name : '<span class="tt-empty">—</span>');

  // Vegetation
  lines.push(`<span class="tt-layer">Vegetation</span>`);
  const vegType = grid.get(cx, cy, LAYER_VEGETATION);
  const vegKey  = ENTITY_KEYS.find(k => k.typeId === vegType && k.layer === LAYER_VEGETATION);
  if (vegKey) {
    const i   = cy * grid.width + cx;
    const age = grid.age[LAYER_VEGETATION][i];
    const ls  = grid.lifespan[LAYER_VEGETATION][i];
    lines.push(`${vegKey.icon} ${vegKey.label} &nbsp; age ${age}/${ls}`);
  } else {
    lines.push('<span class="tt-empty">—</span>');
  }

  // Animal
  lines.push(`<span class="tt-layer">Animal</span>`);
  const anType = grid.get(cx, cy, LAYER_ANIMALS);
  const anKey  = ENTITY_KEYS.find(k => k.typeId === anType && k.layer === LAYER_ANIMALS);
  if (anKey) {
    const i      = cy * grid.width + cx;
    const age    = grid.age[LAYER_ANIMALS][i];
    const ls     = grid.lifespan[LAYER_ANIMALS][i];
    const energy  = grid.energy[LAYER_ANIMALS][i].toFixed(1);
    const cd      = grid.reproCooldown[LAYER_ANIMALS][i];
    const cdStr   = cd > 0 ? ` &nbsp; 🍼cd ${cd}` : '';
    const decay   = grid.traitDecay[LAYER_ANIMALS][i].toFixed(3);
    const repro   = grid.traitRepro[LAYER_ANIMALS][i].toFixed(2);
    lines.push(`${anKey.icon} ${anKey.label} &nbsp; age ${age}/${ls} &nbsp; ⚡${energy}${cdStr}`);
    lines.push(`<span class="tt-layer">Traits</span>`);
    lines.push(`decay ${decay} &nbsp; repro-thr ${repro}`);
  } else {
    lines.push('<span class="tt-empty">—</span>');
  }

  tooltipEl.innerHTML = lines.join('<br>');
  tooltipEl.classList.remove('hidden');

  // Position near cursor, keep inside viewport.
  const tx = e.clientX + 14;
  const ty = e.clientY + 14;
  const tw = tooltipEl.offsetWidth;
  const th = tooltipEl.offsetHeight;
  tooltipEl.style.left = `${Math.min(tx, window.innerWidth  - tw - 8)}px`;
  tooltipEl.style.top  = `${Math.min(ty, window.innerHeight - th - 8)}px`;
});

canvas.addEventListener('mouseleave', () => tooltipEl.classList.add('hidden'));
traitSpeciesEl?.addEventListener('change', updateTraitTable);

// ── Version ───────────────────────────────────────────────────────────────────
document.getElementById('app-version').textContent =
  `v${__APP_VERSION__} · ${__COMMIT_HASH__}`;

// ── Boot ──────────────────────────────────────────────────────────────────────
buildTagFilter();
rebuildRuleUI();
buildLegend();
init();
applyZoom();
