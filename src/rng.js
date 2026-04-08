// mulberry32 — fast, seedable, good statistical quality
export function createRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  return (Math.random() * 0x100000000) >>> 0;
}

export function seedToHex(seed) {
  return (seed >>> 0).toString(16).padStart(8, '0');
}

export function hexToSeed(hex) {
  const n = parseInt(hex.trim(), 16);
  return isNaN(n) ? null : n >>> 0;
}
