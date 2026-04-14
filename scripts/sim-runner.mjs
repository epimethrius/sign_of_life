#!/usr/bin/env node
/**
 * Sign of Life — Headless Balance Runner
 *
 * Runs N simulations with identical parameters but different seeds,
 * collects per-tick population history, and reports ecosystem balance
 * metrics with concrete tuning suggestions.
 *
 * Usage:
 *   node scripts/sim-runner.mjs [options]
 *   node scripts/sim-runner.mjs --help
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, resolve }    from 'path';
import { fileURLToPath }       from 'url';
import { Grid, GRASS, TREE, LILY, HERBIVORE, PREDATOR,
         WATER, EMPTY, LAYER_TERRAIN, LAYER_VEGETATION, LAYER_ANIMALS }
  from '../src/grid.js';
import { createRuleRegistry } from '../src/rules/index.js';
import { generateTerrain }    from '../src/terrain-gen.js';
import { createRng, randomSeed } from '../src/rng.js';
import { computeLifespan }    from '../src/actions.js';
import { EventLog }           from '../src/events.js';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH  = resolve(__dirname, 'sim-config.json');

// ── CLI & config ─────────────────────────────────────────────────────────────

const HELP = `
Sign of Life — Headless Balance Runner

Usage: node scripts/sim-runner.mjs [options]

All options can also be set in scripts/sim-config.json.
CLI flags always take precedence over the config file.

Simulation:
  --runs=N              Number of runs (different seeds)    default: 30
  --ticks=N             Max ticks per run                   default: 500
  --size=N              Grid size N×N                       default: 20

Terrain (percentages, remainder = soil):
  --water=N                                                 default: 15
  --rock=N                                                  default: 10
  --sand=N                                                  default: 10

Initial population (auto-scaled from 10×10 baseline if omitted):
  --pop-grass=N         --pop-tree=N          --pop-lily=N
  --pop-herbivore=N     --pop-predator=N

Rule parameter overrides:
  --grass-lifespan=N    Grass baseLifespan                  default: 4
  --tree-lifespan=N     Tree  baseLifespan                  default: 6
  --herb-lifespan=N     Herbivore baseLifespan              default: 15
  --pred-lifespan=N     Predator  baseLifespan              default: 20
  --herb-cooldown=N     Herbivore reproCooldownDivisor       default: 4
  --pred-cooldown=N     Predator  reproCooldownDivisor       default: 4

Output:
  --output=FILE         Save report to file (.txt or .json)
  --seed=HEX            Base seed (run i uses seed+i)       default: random
  --help                Show this message
`.trim();

/** Parse only what was explicitly provided on the command line (null = not set). */
function parseCliRaw() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) { console.log(HELP); process.exit(0); }

  const raw = {};
  for (const arg of argv) {
    const m = arg.match(/^--([^=]+)(?:=(.+))?$/);
    if (!m) { console.error(`Unknown argument: ${arg}\nRun --help for usage.`); process.exit(1); }
    raw[m[1]] = m[2] ?? true;
  }

  const int = k => raw[k] != null ? parseInt(raw[k], 10)  : null;
  const num = k => raw[k] != null ? parseFloat(raw[k])    : null;
  const hex = k => raw[k] != null ? parseInt(raw[k], 16)  : null;
  const str = k => raw[k] != null ? String(raw[k])        : null;

  return {
    runs:          int('runs'),
    ticks:         int('ticks'),
    size:          int('size'),
    water:         num('water'),
    rock:          num('rock'),
    sand:          num('sand'),
    popGrass:      int('pop-grass'),
    popTree:       int('pop-tree'),
    popLily:       int('pop-lily'),
    popHerbivore:  int('pop-herbivore'),
    popPredator:   int('pop-predator'),
    grassLifespan: int('grass-lifespan'),
    treeLifespan:  int('tree-lifespan'),
    herbLifespan:  int('herb-lifespan'),
    predLifespan:  int('pred-lifespan'),
    herbCooldown:  int('herb-cooldown'),
    predCooldown:  int('pred-cooldown'),
    seed:          hex('seed'),
    output:        str('output'),
  };
}

/** Load scripts/sim-config.json; returns {} if missing or invalid. */
function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error(`Warning: could not parse ${CONFIG_PATH}: ${e.message}`);
    return {};
  }
}

/**
 * Merge: CLI (non-null) > config file > hardcoded defaults.
 * Population values of null mean "auto-scale from grid size".
 */
function buildOpts(cli, cfg) {
  const first = (...vals) => vals.find(v => v != null) ?? null;

  return {
    runs:          first(cli.runs,          cfg.runs)                          ?? 30,
    ticks:         first(cli.ticks,         cfg.ticks)                         ?? 500,
    size:          first(cli.size,          cfg.size)                          ?? 20,
    water:         first(cli.water,         cfg.terrain?.water)                ?? 15,
    rock:          first(cli.rock,          cfg.terrain?.rock)                 ?? 10,
    sand:          first(cli.sand,          cfg.terrain?.sand)                 ?? 10,
    popGrass:      first(cli.popGrass,      cfg.population?.grass),
    popTree:       first(cli.popTree,       cfg.population?.tree),
    popLily:       first(cli.popLily,       cfg.population?.lily),
    popHerbivore:  first(cli.popHerbivore,  cfg.population?.herbivore),
    popPredator:   first(cli.popPredator,   cfg.population?.predator),
    grassLifespan: first(cli.grassLifespan, cfg.rules?.grassLifespan),
    treeLifespan:  first(cli.treeLifespan,  cfg.rules?.treeLifespan),
    herbLifespan:  first(cli.herbLifespan,  cfg.rules?.herbLifespan),
    predLifespan:  first(cli.predLifespan,  cfg.rules?.predLifespan),
    herbCooldown:  first(cli.herbCooldown,  cfg.rules?.herbCooldownDivisor),
    predCooldown:  first(cli.predCooldown,  cfg.rules?.predCooldownDivisor),
    seed:          first(cli.seed,          cfg.seed),
    output:        first(cli.output,        cfg.output),
  };
}

function parseArgs() { return buildOpts(parseCliRaw(), loadConfig()); }

// ── Population scaling ────────────────────────────────────────────────────────

// Baseline defaults match the UI on a 10×10 grid (100 cells).
const BASE_POPS = { grass: 5, tree: 3, lily: 2, herb: 4, pred: 2 };

function scaledPops(opts) {
  const scale = (opts.size * opts.size) / 100;
  return {
    grass: opts.popGrass     ?? Math.max(1, Math.round(BASE_POPS.grass * scale)),
    tree:  opts.popTree      ?? Math.max(1, Math.round(BASE_POPS.tree  * scale)),
    lily:  opts.popLily      ?? Math.max(1, Math.round(BASE_POPS.lily  * scale)),
    herb:  opts.popHerbivore ?? Math.max(1, Math.round(BASE_POPS.herb  * scale)),
    pred:  opts.popPredator  ?? Math.max(1, Math.round(BASE_POPS.pred  * scale)),
  };
}

// ── Rule patching ─────────────────────────────────────────────────────────────
// Rule entity objects are module-level singletons — patch once before all runs.

function patchRules(registry, opts) {
  // NOTE: HERBIVORE=1=GRASS and PREDATOR=2=TREE — must also match layer.
  for (const rule of registry.rules) {
    const e = rule.entity;
    if (!e) continue;
    const isVeg    = e.layer === LAYER_VEGETATION;
    const isAnimal = e.layer === LAYER_ANIMALS;
    if (isVeg    && e.typeId === GRASS     && opts.grassLifespan != null) e.baseLifespan         = opts.grassLifespan;
    if (isVeg    && e.typeId === TREE      && opts.treeLifespan  != null) e.baseLifespan         = opts.treeLifespan;
    if (isAnimal && e.typeId === HERBIVORE && opts.herbLifespan  != null) e.baseLifespan         = opts.herbLifespan;
    if (isAnimal && e.typeId === HERBIVORE && opts.herbCooldown  != null) e.reproCooldownDivisor = opts.herbCooldown;
    if (isAnimal && e.typeId === PREDATOR  && opts.predLifespan  != null) e.baseLifespan         = opts.predLifespan;
    if (isAnimal && e.typeId === PREDATOR  && opts.predCooldown  != null) e.reproCooldownDivisor = opts.predCooldown;
  }
}

// ── Seeding ───────────────────────────────────────────────────────────────────

function seedLand(grid, rules, entityType, layer, count, rng) {
  const rule  = rules.rules.find(r => r.entity?.typeId === entityType && r.entity?.layer === layer);
  const baseLS = rule?.entity?.baseLifespan     ?? 0;
  const lsVar  = rule?.entity?.lifespanVariance ?? 0;
  const energy = rule?.entity?.baseEnergy       ?? 0;

  // Build candidate list once; splice removes placed cells so we don't double-place.
  const candidates = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.get(x, y, LAYER_TERRAIN) === WATER) continue;
      if (grid.get(x, y, layer)         !== EMPTY)  continue;
      candidates.push([x, y]);
    }
  }

  for (let n = 0; n < count && candidates.length > 0; n++) {
    const idx    = Math.floor(rng() * candidates.length);
    const [x, y] = candidates.splice(idx, 1)[0];
    const ls     = baseLS > 0 ? computeLifespan(baseLS, lsVar, rng) : 0;
    grid.place(x, y, entityType, layer, ls, energy);
  }
}

function seedWater(grid, rules, entityType, layer, count, rng) {
  const rule  = rules.rules.find(r => r.entity?.typeId === entityType && r.entity?.layer === layer);
  const baseLS = rule?.entity?.baseLifespan     ?? 0;
  const lsVar  = rule?.entity?.lifespanVariance ?? 0;

  const candidates = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.get(x, y, LAYER_TERRAIN) !== WATER) continue;
      if (grid.get(x, y, layer)         !== EMPTY)  continue;
      candidates.push([x, y]);
    }
  }

  for (let n = 0; n < count && candidates.length > 0; n++) {
    const idx    = Math.floor(rng() * candidates.length);
    const [x, y] = candidates.splice(idx, 1)[0];
    const ls     = baseLS > 0 ? computeLifespan(baseLS, lsVar, rng) : 0;
    grid.place(x, y, entityType, layer, ls, 0);
  }
}

// ── Single simulation run ─────────────────────────────────────────────────────

function runSim(seed, opts, rules, pops) {
  const grid    = new Grid(opts.size, opts.size);
  const initRng = createRng(seed);
  const simRng  = createRng(seed ^ 0x9E3779B9);
  const events  = new EventLog();

  generateTerrain(grid, {
    water: opts.water / 100,
    rock:  opts.rock  / 100,
    sand:  opts.sand  / 100,
  }, initRng);

  seedLand (grid, rules, GRASS,     LAYER_VEGETATION, pops.grass, initRng);
  seedLand (grid, rules, TREE,      LAYER_VEGETATION, pops.tree,  initRng);
  seedWater(grid, rules, LILY,      LAYER_VEGETATION, pops.lily,  initRng);
  seedLand (grid, rules, HERBIVORE, LAYER_ANIMALS,    pops.herb,  initRng);
  seedLand (grid, rules, PREDATOR,  LAYER_ANIMALS,    pops.pred,  initRng);

  // Population snapshot: [grass, tree, lily, herb, pred]
  const snap = () => [
    grid.countState(GRASS,     LAYER_VEGETATION),
    grid.countState(TREE,      LAYER_VEGETATION),
    grid.countState(LILY,      LAYER_VEGETATION),
    grid.countState(HERBIVORE, LAYER_ANIMALS),
    grid.countState(PREDATOR,  LAYER_ANIMALS),
  ];

  const history = [snap()];
  let prevSum    = history[0].reduce((a, b) => a + b, 0);
  let stableTicks = 0;

  for (let t = 0; t < opts.ticks; t++) {
    events.flush();
    rules.applyAll(grid, simRng, events);

    const s   = snap();
    const sum = s.reduce((a, b) => a + b, 0);
    history.push(s);

    if (sum === prevSum) {
      if (++stableTicks >= 5) break; // ecosystem frozen — stop early
    } else {
      stableTicks = 0;
    }
    prevSum = sum;
  }

  return history; // array of [g, tr, li, h, p] per tick
}

// ── Metrics ───────────────────────────────────────────────────────────────────

// Column indices in history snapshots
const IDX = { grass: 0, tree: 1, lily: 2, herb: 3, pred: 4 };
const SPECIES = Object.keys(IDX);

function mean(arr)   { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}
function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function computeMetrics(allHistory) {
  const nRuns = allHistory.length;
  const sp = {};

  for (const name of SPECIES) {
    const idx = IDX[name];
    let survived = 0;
    const extTicks = [], finalPops = [], peakPops = [], cvs = [];

    for (const history of allHistory) {
      const series   = history.map(s => s[idx]);
      const final    = series.at(-1);
      const peak     = Math.max(...series);

      finalPops.push(final);
      peakPops.push(peak);

      if (final > 0) {
        survived++;
        // Stability: coefficient of variation over the last 20 % of ticks
        const tail = series.slice(Math.max(0, Math.floor(series.length * 0.8)));
        const m    = mean(tail);
        if (m > 0) cvs.push(stddev(tail) / m);
      } else if (peak > 0) {
        // Went extinct — find tick of first zero after nonzero
        for (let t = 1; t < series.length; t++) {
          if (series[t] === 0 && series[t - 1] > 0) { extTicks.push(t); break; }
        }
      }
    }

    sp[name] = {
      survivalRate:  survived / nRuns,
      medianExtTick: median(extTicks),
      meanFinalPop:  mean(finalPops),
      meanPeakPop:   mean(peakPops),
      meanCV:        mean(cvs),         // lower = more stable; NaN-free (only survivors)
    };
  }

  // Ecosystem-level aggregates
  let fullSurvival = 0, animalCollapse = 0;
  const predPreyRatios = [], vegAnimalRatios = [], runLengths = [];

  for (const history of allHistory) {
    const final = history.at(-1);
    const [g, tr, li, h, p] = final;
    const veg = g + tr + li;

    runLengths.push(history.length - 1);
    if (g > 0 && tr > 0 && li > 0 && h > 0 && p > 0) fullSurvival++;
    if (h === 0 && p === 0)                             animalCollapse++;
    if (h > 0 && p > 0) predPreyRatios.push(p / h);
    if (h + p > 0)       vegAnimalRatios.push(veg / (h + p));
  }

  return {
    species: sp,
    ecosystem: {
      fullSurvivalRate:   fullSurvival  / nRuns,
      animalCollapseRate: animalCollapse / nRuns,
      meanPredPreyRatio:  mean(predPreyRatios),
      meanVegAnimalRatio: mean(vegAnimalRatios),
      medianRunLength:    median(runLengths),
    },
  };
}

// ── Report ────────────────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',   bold:   '\x1b[1m',   dim:    '\x1b[2m',
  green:  '\x1b[32m',  yellow: '\x1b[33m',  red:    '\x1b[31m',
  cyan:   '\x1b[36m',  gray:   '\x1b[90m',
};

const ICONS = { grass: '🌿', tree: '🌲', lily: '🪷', herb: '🐇', pred: '🦊' };

function pct(r, pad = 4) { return `${Math.round(r * 100)}%`.padStart(pad); }
function f1(n)   { return n == null || isNaN(n) ? '  —' : n.toFixed(1).padStart(5); }
function f2(n)   { return n == null || isNaN(n) ? '   —' : n.toFixed(2).padStart(6); }
function tickFmt(t) { return t == null ? '     —' : `t=${Math.round(t)}`.padStart(6); }

function survColor(rate) {
  return rate >= 0.80 ? C.green : rate >= 0.50 ? C.yellow : C.red;
}

/**
 * Print the report to stdout and optionally collect lines for file output.
 * Pass a `lines` array to capture all output (ANSI codes included);
 * strip them later for plain-text files.
 */
function printReport(opts, pops, metrics, rules, elapsed, lines = null) {
  const { species: sp, ecosystem: eco } = metrics;
  // HERBIVORE=1=GRASS and PREDATOR=2=TREE — filter by layer to avoid collision.
  const herbE  = rules.rules.find(r => r.entity?.typeId === HERBIVORE && r.entity?.layer === LAYER_ANIMALS   )?.entity;
  const predE  = rules.rules.find(r => r.entity?.typeId === PREDATOR  && r.entity?.layer === LAYER_ANIMALS   )?.entity;
  const grassE = rules.rules.find(r => r.entity?.typeId === GRASS     && r.entity?.layer === LAYER_VEGETATION)?.entity;
  const treeE  = rules.rules.find(r => r.entity?.typeId === TREE      && r.entity?.layer === LAYER_VEGETATION)?.entity;
  const soil   = Math.max(0, 100 - opts.water - opts.rock - opts.sand);

  const emit = (s = '') => { console.log(s); if (lines) lines.push(s); };

  emit('');
  emit(`${C.bold}Sign of Life — Balance Runner${C.reset}`);
  emit(`${C.dim}${opts.runs} runs · ${opts.ticks} ticks/run · ${opts.size}×${opts.size} · ${(elapsed / 1000).toFixed(1)}s${C.reset}`);
  emit(`${C.dim}terrain  water=${opts.water}%  rock=${opts.rock}%  sand=${opts.sand}%  soil=${soil}%${C.reset}`);
  emit(`${C.dim}pop init 🌿${pops.grass} 🌲${pops.tree} 🪷${pops.lily} 🐇${pops.herb} 🦊${pops.pred}${C.reset}`);
  emit(`${C.dim}lifespan 🌿${grassE?.baseLifespan ?? '?'} 🌲${treeE?.baseLifespan ?? '?'} 🐇${herbE?.baseLifespan ?? '?'} 🦊${predE?.baseLifespan ?? '?'}    cooldown÷ 🐇${herbE?.reproCooldownDivisor ?? '?'} 🦊${predE?.reproCooldownDivisor ?? '?'}${C.reset}`);

  // ── Species table ──
  emit('');
  emit(`${C.bold}  Species    Survive  Ext.tick  FinalPop  PeakPop  Stability${C.reset}`);
  emit(`  ${'─'.repeat(57)}`);
  for (const name of SPECIES) {
    const m    = sp[name];
    const icon = ICONS[name];
    const col  = survColor(m.survivalRate);
    const cv   = m.meanCV > 0 ? f2(m.meanCV) : '     —';
    emit(
      `  ${icon} ${name.padEnd(8)} ` +
      `${col}${pct(m.survivalRate)}${C.reset}  ` +
      `${tickFmt(m.medianExtTick)}  ` +
      `${f1(m.meanFinalPop)}    ` +
      `${f1(m.meanPeakPop)}   ` +
      `${cv}`
    );
  }

  // ── Ecosystem block ──
  emit('');
  emit(`${C.bold}  Ecosystem${C.reset}`);
  const fsCol  = survColor(eco.fullSurvivalRate);
  const acCol  = eco.animalCollapseRate <= 0.1 ? C.green : eco.animalCollapseRate <= 0.3 ? C.yellow : C.red;
  emit(`    All 5 species at end:      ${fsCol}${pct(eco.fullSurvivalRate, 0)}${C.reset}`);
  emit(`    Animal collapse (none left): ${acCol}${pct(eco.animalCollapseRate, 0)}${C.reset}`);
  emit(`    Median run length (ticks):  ${Math.round(eco.medianRunLength)}`);
  if (eco.meanPredPreyRatio > 0)
    emit(`    Mean pred:prey ratio:        1 : ${(1 / eco.meanPredPreyRatio).toFixed(1)}`);
  if (eco.meanVegAnimalRatio > 0)
    emit(`    Mean veg:animal ratio:       ${eco.meanVegAnimalRatio.toFixed(1)} : 1`);

  // ── Diagnostics ──
  emit('');
  emit(`${C.bold}  Diagnostics${C.reset}`);
  const diags = buildDiagnostics(metrics, opts, pops, grassE, treeE, herbE, predE);
  if (diags.length === 0) {
    emit(`    ${C.green}✓ Ecosystem looks balanced across all metrics.${C.reset}`);
  } else {
    for (const d of diags) {
      const prefix = d.level === 'ok'   ? `${C.green}✓${C.reset}` :
                     d.level === 'warn' ? `${C.yellow}⚠${C.reset}` :
                                          `${C.red}✗${C.reset}`;
      emit(`    ${prefix} ${d.message}`);
      for (const hint of d.hints) emit(`      ${C.dim}→ ${hint}${C.reset}`);
    }
  }
  emit('');
}

// ── File output ───────────────────────────────────────────────────────────────

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function writeOutput(path, lines, opts, pops, metrics, allHistory, baseSeed) {
  if (path.endsWith('.json')) {
    const payload = {
      timestamp: new Date().toISOString(),
      config: {
        runs: opts.runs, ticks: opts.ticks, size: opts.size,
        terrain:    { water: opts.water, rock: opts.rock, sand: opts.sand },
        population: { grass: pops.grass, tree: pops.tree, lily: pops.lily,
                      herbivore: pops.herb, predator: pops.pred },
        rules: {
          grassLifespan:       opts.grassLifespan,
          treeLifespan:        opts.treeLifespan,
          herbLifespan:        opts.herbLifespan,
          predLifespan:        opts.predLifespan,
          herbCooldownDivisor: opts.herbCooldown,
          predCooldownDivisor: opts.predCooldown,
        },
        baseSeed: baseSeed.toString(16).padStart(8, '0'),
      },
      metrics: metrics,
      runs: allHistory.map((history, i) => ({
        seed:     ((baseSeed + i) >>> 0).toString(16).padStart(8, '0'),
        ticks:    history.length - 1,
        finalPop: { grass: history.at(-1)[0], tree: history.at(-1)[1],
                    lily:  history.at(-1)[2], herbivore: history.at(-1)[3],
                    predator: history.at(-1)[4] },
      })),
    };
    writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8');
  } else {
    // Plain text: strip ANSI codes
    const text = lines.map(l => l.replace(ANSI_RE, '')).join('\n') + '\n';
    writeFileSync(path, text, 'utf8');
  }
  console.log(`Results saved → ${path}`);
}

// ── Diagnostics engine ────────────────────────────────────────────────────────

function buildDiagnostics(metrics, opts, pops, grassE, treeE, herbE, predE) {
  const { species: sp, ecosystem: eco } = metrics;
  const diags = [];
  const add = (level, message, ...hints) =>
    diags.push({ level, message, hints: hints.filter(Boolean) });

  const gLS  = grassE?.baseLifespan          ?? 4;
  const tLS  = treeE?.baseLifespan           ?? 6;
  const hLS  = herbE?.baseLifespan           ?? 15;
  const pLS  = predE?.baseLifespan           ?? 20;
  const hCD  = herbE?.reproCooldownDivisor   ?? 4;
  const pCD  = predE?.reproCooldownDivisor   ?? 4;

  // Vegetation collapse
  if (sp.grass.survivalRate < 0.7 || sp.tree.survivalRate < 0.7) {
    add('error',
      `Vegetation collapse — grass ${pct(sp.grass.survivalRate,0)}, tree ${pct(sp.tree.survivalRate,0)} survival`,
      `Increase grass baseLifespan (${gLS}) → try ${gLS + 2}`,
      `Increase tree baseLifespan (${tLS}) → try ${tLS + 2}`,
      `Reduce herbivore initial population (currently ${pops.herb})`
    );
  }

  // Herbivore extinction
  if (sp.herb.survivalRate < 0.5) {
    add('error',
      `Herbivore extinction too frequent — ${pct(sp.herb.survivalRate,0)} survival`,
      `Increase herbivore baseLifespan (${hLS}) → try ${hLS + 5}`,
      `Increase predator reproCooldownDivisor (${pCD}) → try ${pCD + 1} (slower predator breeding)`,
      eco.meanVegAnimalRatio < 2
        ? `Vegetation sparse (${eco.meanVegAnimalRatio.toFixed(1)}:1) — increase grass lifespan or reduce herbivore pop`
        : null
    );
  } else if (sp.herb.survivalRate < 0.75) {
    add('warn',
      `Herbivore survival marginal — ${pct(sp.herb.survivalRate,0)}`,
      `Consider increasing herbivore baseLifespan (${hLS}) → try ${hLS + 3}`,
      `Or increase predator reproCooldownDivisor (${pCD}) → try ${pCD + 1}`
    );
  }

  // Predator extinction (only flagged when prey is reasonably healthy)
  if (sp.pred.survivalRate < 0.4 && sp.herb.survivalRate >= 0.6) {
    add('warn',
      `Predator extinction frequent — ${pct(sp.pred.survivalRate,0)} despite adequate prey`,
      `Increase predator baseLifespan (${pLS}) → try ${pLS + 5}`,
      `Reduce predator reproCooldownDivisor (${pCD}) → try ${Math.max(2, pCD - 1)} (faster breeding)`
    );
  }

  // Predator overhunting (high pred:prey ratio)
  if (eco.meanPredPreyRatio > 0.40 && sp.herb.survivalRate < 0.6) {
    add('warn',
      `Predators overhunting — pred:prey ratio ${eco.meanPredPreyRatio.toFixed(2)} (target < 0.30)`,
      `Increase predator reproCooldownDivisor (${pCD}) → try ${pCD + 1} or ${pCD + 2}`,
      `Reduce predator initial population (currently ${pops.pred})`,
      `Increase herbivore baseLifespan (${hLS}) to give prey more time`
    );
  }

  // Boom/bust oscillation in herbivores
  if (sp.herb.meanCV > 0.80 && sp.herb.survivalRate >= 0.6) {
    add('warn',
      `Herbivore boom/bust cycles — stability CV ${sp.herb.meanCV.toFixed(2)} (target < 0.60)`,
      `Reduce predator reproduction speed — increase reproCooldownDivisor (${pCD}) → try ${pCD + 1}`,
      `Or reduce predator baseLifespan (${pLS}) → try ${Math.max(8, pLS - 4)}`
    );
  }

  // Vegetation too sparse relative to animals
  if (eco.meanVegAnimalRatio < 1.5 && eco.animalCollapseRate < 0.4) {
    add('warn',
      `Vegetation sparse relative to animals — ratio ${eco.meanVegAnimalRatio.toFixed(1)}:1 (target ≥ 2.0)`,
      `Increase grass and tree initial populations`,
      `Reduce water % to add more soil area (currently water=${opts.water}%)`
    );
  }

  // Lily pad extinction (only notable if there's enough water)
  if (sp.lily.survivalRate < 0.5 && opts.water >= 15) {
    add('warn',
      `Lily pads rarely survive — ${pct(sp.lily.survivalRate,0)} with ${opts.water}% water`,
      `Increase initial lily population (currently ${pops.lily})`,
      `Or increase water % to give more spread surface`
    );
  }

  // Good state
  if (eco.fullSurvivalRate >= 0.5 && eco.animalCollapseRate <= 0.15) {
    add('ok',
      `Full coexistence in ${pct(eco.fullSurvivalRate,0)} of runs — ecosystem is viable`
    );
  }

  return diags;
}

// ── Progress ──────────────────────────────────────────────────────────────────

function progress(cur, total, width = 28) {
  const n = Math.round((cur / total) * width);
  return `[${'█'.repeat(n)}${'░'.repeat(width - n)}] ${cur}/${total}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const opts  = parseArgs();
const rules = createRuleRegistry();
patchRules(rules, opts);
const pops  = scaledPops(opts);
const base  = opts.seed ?? randomSeed();

if (existsSync(CONFIG_PATH)) {
  process.stdout.write(`Config: ${CONFIG_PATH}\n`);
}
process.stdout.write(`Running ${opts.runs} simulations (${opts.ticks} ticks, ${opts.size}×${opts.size})...\n`);

const t0 = Date.now();
const allHistory = [];
for (let i = 0; i < opts.runs; i++) {
  process.stdout.write(`\r  ${progress(i, opts.runs)}`);
  allHistory.push(runSim((base + i) >>> 0, opts, rules, pops));
}
process.stdout.write(`\r  ${progress(opts.runs, opts.runs)}\n`);

const metrics  = computeMetrics(allHistory);
const outLines = opts.output ? [] : null;
printReport(opts, pops, metrics, rules, Date.now() - t0, outLines);

if (opts.output) {
  writeOutput(opts.output, outLines, opts, pops, metrics, allHistory, base);
}
