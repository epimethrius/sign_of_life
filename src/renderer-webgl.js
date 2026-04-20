/**
 * WebGL terrain + overlay renderer.
 *
 * Renders one full-screen quad per draw call. Per-cell data is packed into a
 * small RGBA texture (one texel per cell) and decoded in the fragment shader.
 *
 * Data texture encoding (RGBA uint8):
 *   R — packed: bits 0-3 = terrainId (0-4), bit 4 = hasVeg, bit 5 = hasAnimal
 *   G — vegetation age ratio × 255  (only valid when bit 4 of R is set)
 *   B — animal energy ratio × 255   (only valid when bit 5 of R is set)
 *   A — animal age ratio × 255      (only valid when bit 5 of R is set)
 *
 * Overlay modes:
 *   OVERLAY_NORMAL (0) — standard terrain colours
 *   OVERLAY_AGE    (1) — blue (young) → green → red (old) heat-map
 *   OVERLAY_ENERGY (2) — red (low) → yellow → green (high) for animals
 */

import {
  LAYER_TERRAIN, LAYER_VEGETATION, LAYER_ANIMALS, EMPTY,
} from './grid.js';

export const OVERLAY_NORMAL = 0;
export const OVERLAY_AGE    = 1;
export const OVERLAY_ENERGY = 2;
export const OVERLAY_TRAIT  = 3;

export let CELL_SIZE = 40;
export const GAP     = 1;

export function setCellSize(n) { CELL_SIZE = n; }

// Terrain palette (5 entries, typeId 0-4): empty, soil, sand, water, rock.
// Must match src/terrains/*.js `color` fields exactly.
const TERRAIN_PALETTE = new Uint8Array([
  232, 232, 232, 255,  // 0 empty / gap → #e8e8e8
  122,  92,  46, 255,  // 1 soil        → #7a5c2e
  200, 168,  80, 255,  // 2 sand        → #c8a850
   42, 100, 150, 255,  // 3 water       → #2a6496
   90,  90,  90, 255,  // 4 rock        → #5a5a5a
]);

// ── Shaders ───────────────────────────────────────────────────────────────────

const VERT_SRC = /* glsl */`
attribute vec2 a_pos;
varying   vec2 v_uv;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  // Map clip-space (-1..1) to UV (0..1), flip Y so top-left = cell(0,0).
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
}`;

const FRAG_SRC = /* glsl */`
precision mediump float;
varying vec2 v_uv;

uniform sampler2D u_data;      // per-cell RGBA data texture
uniform sampler2D u_terrain;   // 5×1 terrain palette texture
uniform int       u_mode;      // 0=normal 1=age 2=energy 3=trait(decay)
uniform float     u_gridW;
uniform float     u_gridH;
uniform float     u_gapFrac;   // gap fraction within a cell (GAP / CELL_SIZE)

// blue → green → red  (young → mature → old)
vec3 ageColor(float t) {
  if (t < 0.5)
    return mix(vec3(0.22, 0.52, 0.92), vec3(0.18, 0.78, 0.18), t * 2.0);
  return mix(vec3(0.18, 0.78, 0.18), vec3(0.90, 0.15, 0.15), (t - 0.5) * 2.0);
}

// blue → gray → red  (evolved-efficient → baseline → evolved-costly)
vec3 traitColor(float t) {
  vec3 lo = vec3(0.20, 0.45, 1.00);
  vec3 mid = vec3(0.65, 0.65, 0.65);
  vec3 hi  = vec3(1.00, 0.20, 0.20);
  if (t < 0.5)
    return mix(lo, mid, t * 2.0);
  return mix(mid, hi, (t - 0.5) * 2.0);
}

// red → yellow → green  (critical → healthy)
vec3 energyColor(float t) {
  if (t < 0.4)
    return mix(vec3(0.88, 0.10, 0.10), vec3(0.95, 0.80, 0.10), t / 0.4);
  return mix(vec3(0.95, 0.80, 0.10), vec3(0.10, 0.80, 0.20), (t - 0.4) / 0.6);
}

void main() {
  vec2 cellFrac = fract(v_uv * vec2(u_gridW, u_gridH));

  // Draw thin gap lines (same colour as the background).
  if (cellFrac.x < u_gapFrac || cellFrac.y < u_gapFrac) {
    gl_FragColor = vec4(0.910, 0.910, 0.910, 1.0);
    return;
  }

  // Sample data at the centre of the current cell.
  vec2 cellXY = floor(v_uv * vec2(u_gridW, u_gridH));
  vec2 texUV  = (cellXY + 0.5) / vec2(u_gridW, u_gridH);
  vec4 d = texture2D(u_data, texUV);

  // Unpack R byte.
  float rByte    = floor(d.r * 255.0 + 0.5);
  float terrainF = mod(rByte, 16.0);
  bool  hasVeg    = mod(floor(rByte / 16.0), 2.0) >= 0.5;
  bool  hasAnimal = floor(rByte / 32.0) >= 0.5;

  float vegAge   = d.g;   // 0..1 age fraction for vegetation
  float anEnergy = d.b;   // 0..1 energy fraction for animal
  float anAge    = d.a;   // 0..1 age fraction for animal

  // Terrain colour from palette (typeId 0..4 → texel index).
  vec3 tc = texture2D(u_terrain, vec2((terrainF + 0.5) / 5.0, 0.5)).rgb;

  vec3 color;

  if (u_mode == 1) {
    // Age overlay: animal age > veg age > terrain colour.
    if (hasAnimal) {
      color = ageColor(anAge);
    } else if (hasVeg) {
      color = ageColor(vegAge);
    } else {
      color = tc;
    }
  } else if (u_mode == 2) {
    // Energy overlay: only meaningful for animals.
    if (hasAnimal) {
      color = energyColor(anEnergy);
    } else {
      color = tc;
    }
  } else if (u_mode == 3) {
    // Trait overlay: B channel repurposed as decay-trait deviation (0=improved, 0.5=baseline, 1=worsened).
    if (hasAnimal) {
      color = traitColor(anEnergy);
    } else {
      color = tc;
    }
  } else {
    color = tc;
  }

  gl_FragColor = vec4(color, 1.0);
}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    throw new Error(`Shader compile error:\n${gl.getShaderInfoLog(sh)}`);
  return sh;
}

function createProgram(gl, vertSrc, fragSrc) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER,   vertSrc));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    throw new Error(`Program link error:\n${gl.getProgramInfoLog(prog)}`);
  return prog;
}

// ── WebGLRenderer ─────────────────────────────────────────────────────────────

export class WebGLRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('./grid.js').Grid} grid
   */
  constructor(canvas, grid) {
    this.canvas = canvas;
    this.grid   = grid;

    // Normalisation cap for animal energy (predator base is 25; 50 gives headroom).
    this.maxEnergy = 50.0;
    // Map typeId → { decay: number } for trait overlay normalisation. Set via setTraitBaselines().
    this._traitBaselines = {};

    this._setSize();

    const gl = canvas.getContext('webgl');
    if (!gl) throw new Error('WebGL is not supported in this browser.');
    this.gl = gl;

    // Shader program.
    this._prog = createProgram(gl, VERT_SRC, FRAG_SRC);
    gl.useProgram(this._prog);

    // Full-screen quad (2 triangles, 6 vertices).
    const quadVerts = new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(this._prog, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Uniform locations.
    this._uData    = gl.getUniformLocation(this._prog, 'u_data');
    this._uTerrain = gl.getUniformLocation(this._prog, 'u_terrain');
    this._uMode    = gl.getUniformLocation(this._prog, 'u_mode');
    this._uGridW   = gl.getUniformLocation(this._prog, 'u_gridW');
    this._uGridH   = gl.getUniformLocation(this._prog, 'u_gridH');
    this._uGapFrac = gl.getUniformLocation(this._prog, 'u_gapFrac');

    // Terrain palette texture (5×1).
    this._terrainTex = this._makePaletteTex();

    // Per-cell data texture + CPU-side buffer.
    this._dataTex = gl.createTexture();
    this._dataBuf = new Uint8Array(grid.width * grid.height * 4);
    this._initDataTex();
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  _setSize() {
    this.canvas.width  = this.grid.width  * CELL_SIZE;
    this.canvas.height = this.grid.height * CELL_SIZE;
  }

  _makePaletteTex() {
    const gl  = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 5, 1, 0,
                  gl.RGBA, gl.UNSIGNED_BYTE, TERRAIN_PALETTE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  _initDataTex() {
    const gl  = this.gl;
    const { grid } = this;
    gl.bindTexture(gl.TEXTURE_2D, this._dataTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
                  grid.width, grid.height, 0,
                  gl.RGBA, gl.UNSIGNED_BYTE, this._dataBuf);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Rebuild the CPU-side data buffer from current grid state. */
  _updateDataBuf(overlayMode = OVERLAY_NORMAL) {
    const { grid, _dataBuf: buf, maxEnergy } = this;
    const n  = grid.width * grid.height;
    const tl = LAYER_TERRAIN;
    const vl = LAYER_VEGETATION;
    const al = LAYER_ANIMALS;

    for (let i = 0; i < n; i++) {
      const terrainId = grid.layers[tl][i];
      const hasVeg    = grid.layers[vl][i] !== EMPTY;
      const hasAnimal = grid.layers[al][i] !== EMPTY;

      // R: bits 0-3 = terrainId, bit 4 = hasVeg, bit 5 = hasAnimal.
      buf[i * 4] = terrainId | (hasVeg ? 16 : 0) | (hasAnimal ? 32 : 0);

      // G: vegetation age ratio.
      if (hasVeg) {
        const ls = grid.lifespan[vl][i];
        buf[i * 4 + 1] = ls > 0
          ? Math.min(255, Math.round(grid.age[vl][i] / ls * 255))
          : 0;
      } else {
        buf[i * 4 + 1] = 0;
      }

      // B: animal energy ratio normally; trait deviation in OVERLAY_TRAIT mode.
      if (hasAnimal) {
        if (overlayMode === OVERLAY_TRAIT) {
          const anType   = grid.layers[al][i];
          const baseline = this._traitBaselines[anType]?.decay ?? 1;
          const lo = baseline * 0.60, hi = baseline * 1.40;
          buf[i * 4 + 2] = Math.max(0, Math.min(255,
            Math.round((grid.traitDecay[al][i] - lo) / (hi - lo) * 255)));
        } else {
          buf[i * 4 + 2] = Math.min(255, Math.round(Math.max(0, grid.energy[al][i]) / maxEnergy * 255));
        }
      } else {
        buf[i * 4 + 2] = 0;
      }

      // A: animal age ratio.
      if (hasAnimal) {
        const ls = grid.lifespan[al][i];
        buf[i * 4 + 3] = ls > 0
          ? Math.min(255, Math.round(grid.age[al][i] / ls * 255))
          : 0;
      } else {
        buf[i * 4 + 3] = 0;
      }
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Provide baseline trait values per typeId for OVERLAY_TRAIT normalisation. */
  setTraitBaselines(map) { this._traitBaselines = map; }

  /** Call after changing grid dimensions (e.g. grid size selector). */
  resize(newGrid) {
    this.grid    = newGrid;
    this._dataBuf = new Uint8Array(newGrid.width * newGrid.height * 4);
    this._setSize();
    this._initDataTex();
  }

  /** @param {0|1|2|3} overlayMode */
  draw(overlayMode = OVERLAY_NORMAL) {
    const { gl, grid } = this;

    this._updateDataBuf(overlayMode);

    // Upload updated data texture.
    gl.bindTexture(gl.TEXTURE_2D, this._dataTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0,
                     grid.width, grid.height,
                     gl.RGBA, gl.UNSIGNED_BYTE, this._dataBuf);

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    // Texture unit 0 = data, unit 1 = terrain palette.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._dataTex);
    gl.uniform1i(this._uData, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._terrainTex);
    gl.uniform1i(this._uTerrain, 1);

    gl.uniform1i(this._uMode,    overlayMode);
    gl.uniform1f(this._uGridW,   grid.width);
    gl.uniform1f(this._uGridH,   grid.height);
    gl.uniform1f(this._uGapFrac, GAP / CELL_SIZE);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
