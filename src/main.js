import {
  Grid,
  GRASS, TREE, HERBIVORE, PREDATOR,
  SOIL, WATER,
  LAYER_TERRAIN, LAYER_VEGETATION, LAYER_ANIMALS,
} from './grid.js';
import { Renderer }          from './renderer.js';
import { Loop }              from './loop.js';
import { StatsBuffer }       from './stats.js';
import { EventLog }          from './events.js';
import { createRuleRegistry } from './rules/index.js';
import { createRng, randomSeed, seedToHex, hexToSeed } from './rng.js';
import { computeLifespan }   from './actions.js';
import { encodeWorld, decodeWorld } from './serializer.js';
import { generateTerrain }   from './terrain-gen.js';
import { ALL_TERRAINS }      from './terrains/index.js';

const WIDTH  = 10;
const HEIGHT = 10;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const canvas       = document.getElementById('grid-canvas');
const statusLine   = document.getElementById('status-line');
const statsTableEl = document.getElementById('stats-table');
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
const terrainPctInputs = {
  water: document.getElementById('pct-water'),
  rock:  document.getElementById('pct-rock'),
  sand:  document.getElementById('pct-sand'),
};
const soilPctDisplay = document.getElementById('soil-pct');

// ── Core objects ──────────────────────────────────────────────────────────────
const grid   = new Grid(WIDTH, HEIGHT);
const renderer = new Renderer(canvas, grid);
const rules  = createRuleRegistry();
const events = new EventLog();

// Stats buffer: series 0=GRASS, 1=TREE, 2=HERBIVORE, 3=PREDATOR
const stats = new StatsBuffer(4, 1000);

// Running lifetime event totals: { births, deaths } per entity key.
const ENTITY_KEYS = [
  { typeId: GRASS,      layer: LAYER_VEGETATION, label: 'Grass',     icon: '🌿' },
  { typeId: TREE,       layer: LAYER_VEGETATION, label: 'Tree',      icon: '🌲' },
  { typeId: HERBIVORE,  layer: LAYER_ANIMALS,    label: 'Herbivore', icon: '🐇' },
  { typeId: PREDATOR,   layer: LAYER_ANIMALS,    label: 'Predator',  icon: '🦊' },
];
let lifetimeBirths = {};
let lifetimeDeaths = {};

function resetLifetimeCounts() {
  for (const k of ENTITY_KEYS) {
    lifetimeBirths[_ekey(k)] = 0;
    lifetimeDeaths[_ekey(k)] = 0;
  }
}
function _ekey(k) { return `${k.typeId}:${k.layer}`; }

// Register icons with renderer.
renderer.setEntityIcons(LAYER_VEGETATION, new Map([
  [GRASS, '🌿'], [TREE, '🌲'],
]));
renderer.setEntityIcons(LAYER_ANIMALS, new Map([
  [HERBIVORE, '🐇'], [PREDATOR, '🦊'],
]));

let simRng;
let currentSeed;
let generation    = 0;
let finished      = false;
let stableTicks   = 0;        // consecutive ticks with no change
let prevTotalVeg  = 0;
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

  _seedEntity(GRASS,      LAYER_VEGETATION, initRng);
  _seedEntity(TREE,       LAYER_VEGETATION, initRng);
  _seedEntity(HERBIVORE,  LAYER_ANIMALS,    initRng);
  _seedEntity(PREDATOR,   LAYER_ANIMALS,    initRng);

  generation    = 0;
  finished      = false;
  stableTicks   = 0;
  prevTotalVeg  = grid.countState(GRASS, LAYER_VEGETATION) + grid.countState(TREE, LAYER_VEGETATION);
  prevTotalAnimal = grid.countState(HERBIVORE, LAYER_ANIMALS) + grid.countState(PREDATOR, LAYER_ANIMALS);

  stats.reset();
  events.reset();
  resetLifetimeCounts();

  seedDisplay.value   = seedToHex(currentSeed);
  shareInput.value    = encodeWorld(grid, currentSeed, rules);
  statsSumEl.textContent = '';

  loop.stop();
  toggleAuto.checked = false;
  btnNext.disabled   = false;

  updateStatus();
  renderer.draw();
}

function _seedEntity(entityType, layer, rng) {
  const rule = rules.rules.find(r => r.entity?.typeId === entityType && r.entity?.layer === layer);
  const baseLifespan    = rule?.entity?.baseLifespan    ?? 0;
  const lifespanVariance = rule?.entity?.lifespanVariance ?? 0;
  const baseEnergy      = rule?.entity?.baseEnergy      ?? 0;

  for (let attempt = 0; attempt < 200; attempt++) {
    const x = Math.floor(rng() * WIDTH);
    const y = Math.floor(rng() * HEIGHT);
    if (grid.get(x, y, LAYER_TERRAIN) === WATER) continue;
    if (grid.get(x, y, layer) !== 0) continue;
    const ls = baseLifespan > 0 ? computeLifespan(baseLifespan, lifespanVariance, rng) : 0;
    grid.place(x, y, entityType, layer, ls, baseEnergy);
    return;
  }
}

// ── Tick ──────────────────────────────────────────────────────────────────────
function tick() {
  if (finished) return;

  events.flush();
  rules.applyAll(grid, simRng, events);
  generation++;

  // Process events → update lifetime counts.
  for (const ev of events.current) {
    const k = ENTITY_KEYS.find(k => k.typeId === ev.entityTypeId && k.layer === ev.layer);
    if (!k) continue;
    const key = _ekey(k);
    if (ev.type === 'birth') lifetimeBirths[key] = (lifetimeBirths[key] || 0) + 1;
    else if (ev.type.startsWith('death')) lifetimeDeaths[key] = (lifetimeDeaths[key] || 0) + 1;
  }

  // Count current populations.
  const counts = [
    grid.countState(GRASS,     LAYER_VEGETATION),
    grid.countState(TREE,      LAYER_VEGETATION),
    grid.countState(HERBIVORE, LAYER_ANIMALS),
    grid.countState(PREDATOR,  LAYER_ANIMALS),
  ];
  stats.push(counts);

  // Stable-tick auto-stop: no change in any population for 5 consecutive ticks.
  const totalVeg    = counts[0] + counts[1];
  const totalAnimal = counts[2] + counts[3];
  if (totalVeg === prevTotalVeg && totalAnimal === prevTotalAnimal) {
    stableTicks++;
    if (stableTicks >= 5) {
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
  renderer.draw();
}

function updateStatus(counts) {
  const c = counts ?? [
    grid.countState(GRASS,     LAYER_VEGETATION),
    grid.countState(TREE,      LAYER_VEGETATION),
    grid.countState(HERBIVORE, LAYER_ANIMALS),
    grid.countState(PREDATOR,  LAYER_ANIMALS),
  ];
  statusLine.textContent = `Generation: ${generation}`;
  renderStatsTable(c);
}

function renderStatsTable(counts) {
  const rows = ENTITY_KEYS.map((k, i) => {
    const key    = _ekey(k);
    const pop    = counts[i];
    const births = lifetimeBirths[key] || 0;
    const deaths = lifetimeDeaths[key] || 0;
    const total  = births + deaths;
    const ratio  = total > 0 ? ((deaths / total) * 100).toFixed(1) + '%' : '—';
    return `<tr>
      <td>${k.icon} ${k.label}</td>
      <td>${pop}</td>
      <td>${births}</td>
      <td>${deaths}</td>
      <td>${ratio}</td>
    </tr>`;
  });
  statsTableEl.innerHTML = rows.join('');
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
btnNewSeed.addEventListener('click', () => init());
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
      if (decoded.lifespans?.[l]) grid.lifespan[l].set(decoded.lifespans[l]);
      if (decoded.energies?.[l])  grid.energy[l].set(decoded.energies[l]);
    }
    rules.setEnabledByIndices(decoded.enabledRuleIndices);
    rebuildRuleCheckboxes();

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
    renderer.draw();
  } catch (err) {
    alert(`Failed to load world: ${err.message}`);
  }
});

// ── Rule UI ───────────────────────────────────────────────────────────────────
function rebuildRuleCheckboxes() {
  rulesList.innerHTML = '';
  for (const rule of rules.rules) {
    const wrapper = document.createElement('div');
    wrapper.className = 'rule-entry';

    const lbl = document.createElement('label');
    const cb  = document.createElement('input');
    cb.type    = 'checkbox';
    cb.checked = rules.isEnabled(rule.id);
    cb.addEventListener('change', () => rules.toggle(rule.id));
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(` ${rule.name}`));
    wrapper.appendChild(lbl);

    const desc = document.createElement('div');
    desc.className   = 'rule-desc';
    desc.textContent = rule.description;
    wrapper.appendChild(desc);

    if (rule.entity?.baseLifespan !== undefined) {
      const params = document.createElement('div');
      params.className = 'rule-params';
      params.appendChild(_numInput('Lifespan (ticks)', rule.entity.baseLifespan, 1, 9999,
        v => { rule.entity.baseLifespan = v; }));
      params.appendChild(_numInput('Variance (%)', Math.round(rule.entity.lifespanVariance * 100), 0, 100,
        v => { rule.entity.lifespanVariance = v / 100; }));
      if (rule.entity.baseEnergy !== undefined) {
        params.appendChild(_numInput('Base energy', rule.entity.baseEnergy, 0, 9999,
          v => { rule.entity.baseEnergy = v; }));
      }
      wrapper.appendChild(params);
    }

    rulesList.appendChild(wrapper);
  }
}

function _numInput(label, initial, min, max, onChange) {
  const wrap  = document.createElement('label');
  wrap.className = 'param-label';
  const inp   = document.createElement('input');
  inp.type    = 'number';
  inp.className = 'param-input';
  inp.value   = initial;
  inp.min     = min;
  inp.max     = max;
  inp.addEventListener('change', () => {
    const v = parseFloat(inp.value);
    if (!isNaN(v)) onChange(v);
  });
  wrap.appendChild(document.createTextNode(label + ': '));
  wrap.appendChild(inp);
  return wrap;
}

// ── Legend ────────────────────────────────────────────────────────────────────
function buildLegend() {
  legendEl.innerHTML = '';

  const terrainHeader = document.createElement('div');
  terrainHeader.className   = 'legend-group-label';
  terrainHeader.textContent = 'Terrain';
  legendEl.appendChild(terrainHeader);

  for (const t of ALL_TERRAINS) {
    const row    = document.createElement('div');
    row.className = 'legend-row';
    const swatch = document.createElement('span');
    swatch.className        = 'legend-swatch';
    swatch.style.background = t.color;
    const name = document.createElement('span');
    name.textContent = t.name;
    row.appendChild(swatch);
    row.appendChild(name);
    legendEl.appendChild(row);
  }

  for (const [groupLabel, layerFilter] of [
    ['Vegetation', LAYER_VEGETATION],
    ['Animals',    LAYER_ANIMALS],
  ]) {
    const header = document.createElement('div');
    header.className   = 'legend-group-label';
    header.textContent = groupLabel;
    legendEl.appendChild(header);

    for (const rule of rules.rules) {
      if (!rule.entity || rule.entity.layer !== layerFilter) continue;
      const { icon, name, description } = rule.entity;
      const row    = document.createElement('div');
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
}

// ── Boot ──────────────────────────────────────────────────────────────────────
rebuildRuleCheckboxes();
buildLegend();
init();
