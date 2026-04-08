import { Grid, GRASS, SOIL, LAYER_TERRAIN, LAYER_VEGETATION } from './grid.js';
import { Renderer } from './renderer.js';
import { Loop } from './loop.js';
import { StatsBuffer } from './stats.js';
import { createRuleRegistry } from './rules/index.js';
import { createRng, randomSeed, seedToHex, hexToSeed } from './rng.js';
import { encodeWorld, decodeWorld } from './serializer.js';

const WIDTH  = 10;
const HEIGHT = 10;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const canvas      = document.getElementById('grid-canvas');
const statusLine  = document.getElementById('status-line');
const btnNext     = document.getElementById('btn-next');
const btnReset    = document.getElementById('btn-reset');
const toggleAuto  = document.getElementById('toggle-auto');
const inputDelay  = document.getElementById('input-delay');
const seedDisplay = document.getElementById('seed-display');
const btnNewSeed  = document.getElementById('btn-new-seed');
const shareInput  = document.getElementById('share-input');
const btnCopy     = document.getElementById('btn-copy');
const btnLoad     = document.getElementById('btn-load');
const statsEl     = document.getElementById('stats-live');
const statsSumEl  = document.getElementById('stats-summary');
const rulesList   = document.getElementById('rules-list');

// ── Core objects ──────────────────────────────────────────────────────────────
const grid  = new Grid(WIDTH, HEIGHT);
const renderer = new Renderer(canvas, grid);
const rules = createRuleRegistry();
// Series 0 = grass count on LAYER_VEGETATION
const stats = new StatsBuffer(1, 1000);

let simRng;       // seeded RNG used by rules — separate from init RNG
let currentSeed;
let generation = 0;
let finished   = false;

// ── Init / reset ──────────────────────────────────────────────────────────────
function init(seed) {
  currentSeed = (seed !== undefined) ? seed : randomSeed();

  // Init RNG: used only for placing the starting grass cell.
  // Kept separate so the simulation RNG always starts from a clean state.
  const initRng = createRng(currentSeed);
  simRng = createRng(currentSeed ^ 0x9E3779B9); // deterministic sub-seed

  grid.clearAll();
  grid.layers[LAYER_TERRAIN].fill(SOIL); // terrain is all soil for now

  const startX = Math.floor(initRng() * WIDTH);
  const startY = Math.floor(initRng() * HEIGHT);
  grid.set(startX, startY, GRASS, LAYER_VEGETATION);

  generation = 0;
  finished   = false;
  stats.reset();

  seedDisplay.value  = seedToHex(currentSeed);
  shareInput.value   = encodeWorld(grid, currentSeed, rules);
  statsSumEl.textContent = '';

  loop.stop();
  toggleAuto.checked = false;
  btnNext.disabled   = false;

  updateStatus();
  renderer.draw();
}

// ── Tick ──────────────────────────────────────────────────────────────────────
function tick() {
  if (finished) return;

  rules.applyAll(grid, simRng);
  generation++;

  const grassCount = grid.countState(GRASS, LAYER_VEGETATION);
  stats.push([grassCount]);
  updateStatus(grassCount);

  if (grid.isLayerFull(LAYER_VEGETATION)) {
    finished = true;
    loop.stop();
    toggleAuto.checked = false;
    btnNext.disabled   = true;
    renderSummary();
  }

  renderer.draw();
}

function updateStatus(grassCount) {
  const count = grassCount ?? grid.countState(GRASS, LAYER_VEGETATION);
  const total = WIDTH * HEIGHT;
  statusLine.textContent = `Generation: ${generation}  |  Grass: ${count} / ${total}`;
  statsEl.textContent    = `+${count - (stats.latest(0) || count)} this tick`;
}

function renderSummary() {
  const s     = stats.summary(0);
  const total = WIDTH * HEIGHT;
  statusLine.textContent = `Field full after ${generation} ticks — ${total} / ${total} grass cells.`;
  statsSumEl.innerHTML   =
    `Peak: ${s.max} &nbsp;|&nbsp; Avg growth: ${s.avgGrowth} cells/tick`;
  statsEl.textContent    = '';
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
  else seedDisplay.value = seedToHex(currentSeed); // revert invalid input
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
    // Restore grid layers
    for (let l = 0; l < decoded.layers.length && l < grid.layers.length; l++) {
      grid.layers[l].set(decoded.layers[l]);
    }
    // Restore rule config
    rules.setEnabledByIndices(decoded.enabledRuleIndices);
    rebuildRuleCheckboxes();

    currentSeed        = decoded.seed;
    seedDisplay.value  = seedToHex(currentSeed);
    simRng             = createRng(currentSeed ^ 0x9E3779B9);
    generation         = 0;
    finished           = false;
    stats.reset();
    statsSumEl.textContent = '';

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

rebuildRuleCheckboxes();
init();
