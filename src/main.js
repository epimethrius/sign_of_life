import { Grid, GRASS } from './grid.js';
import { Renderer } from './renderer.js';
import { Loop } from './loop.js';
import { createRuleRegistry } from './rules/index.js';

const WIDTH = 10;
const HEIGHT = 10;

// --- DOM refs ---
const canvas     = document.getElementById('grid-canvas');
const statusLine = document.getElementById('status-line');
const btnNext    = document.getElementById('btn-next');
const btnReset   = document.getElementById('btn-reset');
const toggleAuto = document.getElementById('toggle-auto');
const inputDelay = document.getElementById('input-delay');
const rulesList  = document.getElementById('rules-list');

// --- Core objects ---
const grid     = new Grid(WIDTH, HEIGHT);
const renderer = new Renderer(canvas, grid);
const rules    = createRuleRegistry();

let generation = 0;
let finished   = false;

// --- Init / reset ---
function init() {
  grid.clear();
  const x = Math.floor(Math.random() * WIDTH);
  const y = Math.floor(Math.random() * HEIGHT);
  grid.set(x, y, GRASS);

  generation = 0;
  finished   = false;

  loop.stop();
  toggleAuto.checked = false;
  btnNext.disabled   = false;

  updateStatus();
  renderer.draw();
}

// --- Tick ---
function tick() {
  if (finished) return;

  rules.applyAll(grid);
  generation++;

  if (grid.isFull()) {
    finished = true;
    loop.stop();
    toggleAuto.checked = false;
    btnNext.disabled   = true;
    renderDone();
  } else {
    updateStatus();
  }

  renderer.draw();
}

function updateStatus() {
  const grassCount = grid.countState(GRASS);
  const total      = WIDTH * HEIGHT;
  statusLine.innerHTML = `Generation: ${generation} &nbsp;|&nbsp; Grass: ${grassCount} / ${total}`;
}

function renderDone() {
  const total = WIDTH * HEIGHT;
  statusLine.innerHTML =
    `<span class="done">Field full after ${generation} ticks — ${total} / ${total} grass cells.</span>`;
}

// --- Loop ---
const loop = new Loop(tick);

// --- Control events ---
btnNext.addEventListener('click', () => tick());

btnReset.addEventListener('click', () => init());

toggleAuto.addEventListener('change', () => {
  if (finished) {
    toggleAuto.checked = false;
    return;
  }
  loop.setAuto(toggleAuto.checked);
  btnNext.disabled = toggleAuto.checked;
});

inputDelay.addEventListener('change', () => {
  const ms = parseInt(inputDelay.value, 10);
  if (!isNaN(ms) && ms > 0) loop.setDelay(ms);
});

// --- Build rule checkboxes ---
for (const rule of rules.rules) {
  const wrapper = document.createElement('div');

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

// --- Start ---
init();
