import { Grid, GRASS, TREE, SOIL, WATER, LAYER_TERRAIN, LAYER_VEGETATION } from './grid.js';
import { Renderer } from './renderer.js';
import { Loop } from './loop.js';
import { StatsBuffer } from './stats.js';
import { createRuleRegistry } from './rules/index.js';
import { createRng, randomSeed, seedToHex, hexToSeed } from './rng.js';
import { encodeWorld, decodeWorld } from './serializer.js';
import { generateTerrain } from './terrain-gen.js';
import { ALL_TERRAINS } from './terrains/index.js';

const WIDTH  = 10;
const HEIGHT = 10;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const canvas       = document.getElementById('grid-canvas');
const statusLine   = document.getElementById('status-line');
const statsLiveEl  = document.getElementById('stats-live');
const statsSumEl   = document.getElementById('stats-summary');
const btnNext      = document.getElementById('btn-next');
const btnReset     = document.getElementById('btn-reset');
const toggleAuto   = document.getElementById('toggle-auto');
const inputDelay   = document.getElementById('input-delay');
const seedDisplay  = document.getElementById('seed-display');
const btnNewSeed   = document.getElementById('btn-new-seed');
const shareInput   = document.getElementById('share-input');
const btnCopy      = document.getElementById('btn-copy');
const btnLoad      = document.getElementById('btn-load');
const rulesList    = document.getElementById('rules-list');
const legendEl     = document.getElementById('legend-content');

// Terrain % inputs — keyed by terrain id.
const terrainPctInputs = {
  water: document.getElementById('pct-water'),
  rock:  document.getElementById('pct-rock'),
  sand:  document.getElementById('pct-sand'),
};
const soilPctDisplay = document.getElementById('soil-pct');

// ── Core objects ──────────────────────────────────────────────────────────────
const grid     = new Grid(WIDTH, HEIGHT);
const renderer = new Renderer(canvas, grid);
const rules    = createRuleRegistry();
// Series: 0 = grass, 1 = tree
const stats    = new StatsBuffer(2, 1000);

// Register entity icons with renderer.
renderer.setEntityIcons(new Map(
  rules.rules
    .filter(r => r.entity)
    .map(r => [r.entity.typeId, r.entity.icon])
));

let simRng;
let currentSeed;
let generation    = 0;
let finished      = false;
let prevVegCount  = 0; // for delta display

// ── Terrain percentage helpers ────────────────────────────────────────────────
function getTerrainPct() {
  const water = clamp(parseFloat(terrainPctInputs.water.value) || 0, 0, 100) / 100;
  const rock  = clamp(parseFloat(terrainPctInputs.rock.value)  || 0, 0, 100) / 100;
  const sand  = clamp(parseFloat(terrainPctInputs.sand.value)  || 0, 0, 100) / 100;
  return { water, rock, sand };
}

function updateSoilDisplay() {
  const { water, rock, sand } = getTerrainPct();
  const soilPct = Math.max(0, 100 - Math.round((water + rock + sand) * 100));
  soilPctDisplay.textContent = `Soil: ${soilPct}%`;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

for (const input of Object.values(terrainPctInputs)) {
  input.addEventListener('input', updateSoilDisplay);
}
updateSoilDisplay();

// ── Simulation end condition ──────────────────────────────────────────────────
// All non-water cells in the vegetation layer are occupied.
function isVegetationComplete() {
  const terrain = grid.layers[LAYER_TERRAIN];
  const veg     = grid.layers[LAYER_VEGETATION];
  for (let i = 0; i < grid.size; i++) {
    if (terrain[i] === WATER) continue; // water blocks all land vegetation
    if (veg[i] === 0) return false;
  }
  return true;
}

// ── Init / reset ──────────────────────────────────────────────────────────────
function init(seed) {
  currentSeed = (seed !== undefined) ? seed : randomSeed();

  const initRng = createRng(currentSeed);
  simRng        = createRng(currentSeed ^ 0x9E3779B9);

  grid.clearAll();

  // Generate terrain using the init RNG.
  generateTerrain(grid, getTerrainPct(), initRng);

  // Seed one grass cell on a non-water cell.
  _seedEntity(grid, GRASS, LAYER_VEGETATION, initRng);
  // Seed one tree cell on a different non-water cell.
  _seedEntity(grid, TREE, LAYER_VEGETATION, initRng);

  generation   = 0;
  finished     = false;
  prevVegCount = grid.countState(GRASS, LAYER_VEGETATION)
               + grid.countState(TREE,  LAYER_VEGETATION);
  stats.reset();

  seedDisplay.value  = seedToHex(currentSeed);
  shareInput.value   = encodeWorld(grid, currentSeed, rules);
  statsSumEl.textContent  = '';
  statsLiveEl.textContent = '';

  loop.stop();
  toggleAuto.checked = false;
  btnNext.disabled   = false;

  updateStatus();
  renderer.draw();
}

/** Place one cell of `entityType` on the given layer, avoiding water and existing occupied cells. */
function _seedEntity(grid, entityType, layer, rng) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const x = Math.floor(rng() * WIDTH);
    const y = Math.floor(rng() * HEIGHT);
    if (grid.get(x, y, LAYER_TERRAIN) === WATER) continue;
    if (grid.get(x, y, layer) !== 0) continue;
    grid.set(x, y, entityType, layer);
    return;
  }
}

// ── Tick ──────────────────────────────────────────────────────────────────────
function tick() {
  if (finished) return;

  rules.applyAll(grid, simRng);
  generation++;

  const grassCount = grid.countState(GRASS, LAYER_VEGETATION);
  const treeCount  = grid.countState(TREE,  LAYER_VEGETATION);
  const vegCount   = grassCount + treeCount;
  const delta      = vegCount - prevVegCount;

  stats.push([grassCount, treeCount]);
  prevVegCount = vegCount;

  if (isVegetationComplete()) {
    finished = true;
    loop.stop();
    toggleAuto.checked = false;
    btnNext.disabled   = true;
    renderDone(grassCount, treeCount);
  } else {
    updateStatus(grassCount, treeCount, delta);
  }

  renderer.draw();
}

function updateStatus(grassCount, treeCount, delta) {
  const g = grassCount ?? grid.countState(GRASS, LAYER_VEGETATION);
  const t = treeCount  ?? grid.countState(TREE,  LAYER_VEGETATION);
  const d = delta ?? 0;
  const total = WIDTH * HEIGHT;
  statusLine.textContent  = `Generation: ${generation}  |  Grass: ${g}  |  Tree: ${t}  |  Total veg: ${g + t} / ${total}`;
  statsLiveEl.textContent = d >= 0 ? `+${d} this tick` : `${d} this tick`;
}

function renderDone(grassCount, treeCount) {
  const gs = stats.summary(0);
  const ts = stats.summary(1);
  statusLine.textContent = `Vegetation complete after ${generation} ticks.`;
  statsSumEl.innerHTML   =
    `Grass — peak: ${gs.max}, avg growth: ${gs.avgGrowth}/tick &nbsp;|&nbsp; ` +
    `Tree — peak: ${ts.max}, avg growth: ${ts.avgGrowth}/tick`;
  statsLiveEl.textContent = '';
}

// ── Loop ──────────────────────────────────────────────────────────────────────
const loop = new Loop(tick);

// ── Control events ────────────────────────────────────────────────────────────
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

// ── Seed controls ─────────────────────────────────────────────────────────────
btnNewSeed.addEventListener('click', () => init());

seedDisplay.addEventListener('change', () => {
  const seed = hexToSeed(seedDisplay.value);
  if (seed !== null) init(seed);
  else seedDisplay.value = seedToHex(currentSeed);
});

// ── Share controls ────────────────────────────────────────────────────────────
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
    }
    rules.setEnabledByIndices(decoded.enabledRuleIndices);
    rebuildRuleCheckboxes();

    currentSeed        = decoded.seed;
    seedDisplay.value  = seedToHex(currentSeed);
    simRng             = createRng(currentSeed ^ 0x9E3779B9);
    generation         = 0;
    finished           = false;
    prevVegCount       = grid.countState(GRASS, LAYER_VEGETATION)
                       + grid.countState(TREE,  LAYER_VEGETATION);
    stats.reset();
    statsSumEl.textContent  = '';
    statsLiveEl.textContent = '';

    loop.stop();
    toggleAuto.checked = false;
    btnNext.disabled   = false;

    updateStatus();
    renderer.draw();
  } catch (e) {
    alert(`Failed to load world: ${e.message}`);
  }
});

// ── Rule checkboxes ───────────────────────────────────────────────────────────
function rebuildRuleCheckboxes() {
  rulesList.innerHTML = '';
  for (const rule of rules.rules) {
    const wrapper  = document.createElement('div');
    const lbl      = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type    = 'checkbox';
    checkbox.checked = rules.isEnabled(rule.id);
    checkbox.addEventListener('change', () => rules.toggle(rule.id));
    lbl.appendChild(checkbox);
    lbl.appendChild(document.createTextNode(` ${rule.name}`));
    wrapper.appendChild(lbl);
    const desc = document.createElement('div');
    desc.className   = 'rule-desc';
    desc.textContent = rule.description;
    wrapper.appendChild(desc);
    rulesList.appendChild(wrapper);
  }
}

// ── Legend ────────────────────────────────────────────────────────────────────
function buildLegend() {
  legendEl.innerHTML = '';

  // Terrain section
  const terrainHeader = document.createElement('div');
  terrainHeader.className   = 'legend-group-label';
  terrainHeader.textContent = 'Terrain';
  legendEl.appendChild(terrainHeader);

  for (const t of ALL_TERRAINS) {
    const row   = document.createElement('div');
    row.className = 'legend-row';
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.background = t.color;
    const name = document.createElement('span');
    name.textContent = t.name;
    row.appendChild(swatch);
    row.appendChild(name);
    legendEl.appendChild(row);
  }

  // Vegetation entities
  const vegHeader = document.createElement('div');
  vegHeader.className   = 'legend-group-label';
  vegHeader.textContent = 'Vegetation';
  legendEl.appendChild(vegHeader);

  for (const rule of rules.rules) {
    if (!rule.entity) continue;
    const { icon, name, description } = rule.entity;
    const row  = document.createElement('div');
    row.className = 'legend-row';
    const iconEl = document.createElement('span');
    iconEl.className   = 'legend-icon';
    iconEl.textContent = icon;
    const nameEl = document.createElement('span');
    nameEl.textContent = `${name} — ${description}`;
    row.appendChild(iconEl);
    row.appendChild(nameEl);
    legendEl.appendChild(row);
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
rebuildRuleCheckboxes();
buildLegend();
init();
