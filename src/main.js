import {
  Grid,
  GRASS, TREE, HERBIVORE, PREDATOR,
  SOIL, WATER, EMPTY,
  LAYER_TERRAIN, LAYER_VEGETATION, LAYER_ANIMALS,
} from './grid.js';
import { Renderer }           from './renderer.js';
import { Loop }               from './loop.js';
import { StatsBuffer }        from './stats.js';
import { EventLog }           from './events.js';
import { createRuleRegistry } from './rules/index.js';
import { createRng, randomSeed, seedToHex, hexToSeed } from './rng.js';
import { computeLifespan }    from './actions.js';
import { encodeWorld, decodeWorld } from './serializer.js';
import { generateTerrain }    from './terrain-gen.js';
import { ALL_TERRAINS }       from './terrains/index.js';

const WIDTH  = 10;
const HEIGHT = 10;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const canvas        = document.getElementById('grid-canvas');
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

const terrainPctInputs = {
  water: document.getElementById('pct-water'),
  rock:  document.getElementById('pct-rock'),
  sand:  document.getElementById('pct-sand'),
};
const soilPctDisplay = document.getElementById('soil-pct');

const popInputs = {
  [GRASS]:      document.getElementById('pop-grass'),
  [TREE]:       document.getElementById('pop-tree'),
  // Animal pops keyed differently since HERBIVORE=1 and GRASS=1 clash.
  // Use string keys for the input map.
};
const popInputAnimals = {
  [HERBIVORE]: document.getElementById('pop-herbivore'),
  [PREDATOR]:  document.getElementById('pop-predator'),
};

function getPopCount(typeId, layer) {
  const inp = layer === LAYER_VEGETATION
    ? popInputs[typeId]
    : popInputAnimals[typeId];
  return Math.max(0, parseInt(inp?.value ?? '1', 10) || 0);
}

// ── Core objects ──────────────────────────────────────────────────────────────
const grid   = new Grid(WIDTH, HEIGHT);
const renderer = new Renderer(canvas, grid);
const rules  = createRuleRegistry();
const events = new EventLog();
const stats  = new StatsBuffer(4, 1000); // series: 0=GRASS,1=TREE,2=HERBIVORE,3=PREDATOR

const ENTITY_KEYS = [
  { typeId: GRASS,     layer: LAYER_VEGETATION, label: 'Grass',     icon: '🌿', statsIdx: 0 },
  { typeId: TREE,      layer: LAYER_VEGETATION, label: 'Tree',      icon: '🌲', statsIdx: 1 },
  { typeId: HERBIVORE, layer: LAYER_ANIMALS,    label: 'Herbivore', icon: '🐇', statsIdx: 2 },
  { typeId: PREDATOR,  layer: LAYER_ANIMALS,    label: 'Predator',  icon: '🦊', statsIdx: 3 },
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

renderer.setEntityIcons(LAYER_VEGETATION, new Map([[GRASS, '🌿'], [TREE, '🌲']]));
renderer.setEntityIcons(LAYER_ANIMALS,    new Map([[HERBIVORE, '🐇'], [PREDATOR, '🦊']]));

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

  // Seed animals near their food source.
  const herbRule = rules.rules.find(r => r.entity?.typeId === HERBIVORE);
  const predRule = rules.rules.find(r => r.entity?.typeId === PREDATOR);
  _seedMany(HERBIVORE, LAYER_ANIMALS, getPopCount(HERBIVORE, LAYER_ANIMALS), herbRule?.entity?.spawnNearFood ?? null, initRng);
  _seedMany(PREDATOR,  LAYER_ANIMALS, getPopCount(PREDATOR,  LAYER_ANIMALS), predRule?.entity?.spawnNearFood ?? null, initRng);

  generation      = 0;
  finished        = false;
  stableTicks     = 0;
  prevTotalVeg    = grid.countState(GRASS, LAYER_VEGETATION) + grid.countState(TREE, LAYER_VEGETATION);
  prevTotalAnimal = grid.countState(HERBIVORE, LAYER_ANIMALS) + grid.countState(PREDATOR, LAYER_ANIMALS);

  stats.reset();
  events.reset();
  resetLifetimeCounts();

  seedDisplay.value      = seedToHex(currentSeed);
  shareInput.value       = encodeWorld(grid, currentSeed, rules);
  statsSumEl.textContent = '';

  loop.stop();
  toggleAuto.checked = false;
  btnNext.disabled   = false;

  updateStatus();
  renderer.draw();
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
  }
}

function _validCells(layer) {
  const cells = [];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
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
      if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) continue;
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
    grid.countState(GRASS,     LAYER_VEGETATION),
    grid.countState(TREE,      LAYER_VEGETATION),
    grid.countState(HERBIVORE, LAYER_ANIMALS),
    grid.countState(PREDATOR,  LAYER_ANIMALS),
  ];
  stats.push(counts);

  const totalVeg    = counts[0] + counts[1];
  const totalAnimal = counts[2] + counts[3];
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
    renderer.draw();
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

    // Editable entity params
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
      wrapper.appendChild(params);
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

// ── Boot ──────────────────────────────────────────────────────────────────────
buildTagFilter();
rebuildRuleUI();
buildLegend();
init();
