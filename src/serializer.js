import { NUM_LAYERS } from './grid.js';
import { seedToHex } from './rng.js';

const VERSION = 1;

// ── Encode ────────────────────────────────────────────────────────────────────
//
// Binary layout:
//   [0]      version (uint8)
//   [1..4]   seed    (uint32 big-endian)
//   [5..6]   width   (uint16 big-endian)
//   [7..8]   height  (uint16 big-endian)
//   [9]      numLayers (uint8)
//   [10..]   layer data: numLayers × (width × height) bytes
//   [n]      numEnabledRules (uint8)
//   [n+1..]  enabled rule indices (one uint8 each)
//
// The result is base64url-encoded (no padding, URL-safe).

export function encodeWorld(grid, seed, ruleRegistry) {
  const { width, height, size } = grid;
  const enabledIndices = ruleRegistry.rules
    .map((r, i) => (ruleRegistry.isEnabled(r.id) ? i : -1))
    .filter(i => i >= 0);

  const totalBytes =
    1 + 4 + 2 + 2 + 1          // header
    + NUM_LAYERS * size         // layer data
    + 1 + enabledIndices.length; // rule config

  const buf  = new Uint8Array(totalBytes);
  const view = new DataView(buf.buffer);
  let pos = 0;

  buf[pos++] = VERSION;
  view.setUint32(pos, seed, false); pos += 4;
  view.setUint16(pos, width,  false); pos += 2;
  view.setUint16(pos, height, false); pos += 2;
  buf[pos++] = NUM_LAYERS;

  for (let l = 0; l < NUM_LAYERS; l++) {
    buf.set(grid.layers[l], pos);
    pos += size;
  }

  buf[pos++] = enabledIndices.length;
  for (const idx of enabledIndices) buf[pos++] = idx;

  return toBase64Url(buf);
}

// ── Decode ────────────────────────────────────────────────────────────────────
//
// Returns { seed, width, height, layers: Uint8Array[], enabledRuleIndices: number[] }
// Throws if the string is malformed or the version is unknown.

export function decodeWorld(str) {
  const buf  = fromBase64Url(str);
  const view = new DataView(buf.buffer);
  let pos = 0;

  const version = buf[pos++];
  if (version !== VERSION) throw new Error(`Unknown world version: ${version}`);

  const seed      = view.getUint32(pos, false); pos += 4;
  const width     = view.getUint16(pos, false); pos += 2;
  const height    = view.getUint16(pos, false); pos += 2;
  const numLayers = buf[pos++];
  const size      = width * height;

  const layers = [];
  for (let l = 0; l < numLayers; l++) {
    layers.push(buf.slice(pos, pos + size));
    pos += size;
  }

  const numEnabled = buf[pos++];
  const enabledRuleIndices = [];
  for (let i = 0; i < numEnabled; i++) {
    enabledRuleIndices.push(buf[pos++]);
  }

  return { seed, width, height, layers, enabledRuleIndices };
}

// ── Base64url helpers ─────────────────────────────────────────────────────────

function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g,  '');
}

function fromBase64Url(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded  = base64 + '='.repeat((4 - base64.length % 4) % 4);
  const binary  = atob(padded);
  const bytes   = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
