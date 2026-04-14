// Population line chart drawn onto a Canvas 2D context.
// Reads data from a StatsBuffer instance on every draw() call.

const PAD = { top: 12, right: 12, bottom: 28, left: 36 };

export class ChartRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Array<{label: string, color: string}>} series  — one entry per StatsBuffer series
   */
  constructor(canvas, series) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.series  = series;
  }

  draw(statsBuffer) {
    const { canvas, ctx, series } = this;
    const W = canvas.width;
    const H = canvas.height;
    const pw = W - PAD.left - PAD.right;   // plot width
    const ph = H - PAD.top  - PAD.bottom;  // plot height

    ctx.clearRect(0, 0, W, H);

    const n = statsBuffer.stored;
    if (n === 0) {
      ctx.fillStyle = '#bbb';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No data yet', W / 2, H / 2);
      return;
    }

    // Gather all series data and find global max for Y scale.
    const data = series.map((_, i) => statsBuffer.getSeries(i));
    let maxVal = 1;
    for (const d of data)
      for (let i = 0; i < d.length; i++)
        if (d[i] > maxVal) maxVal = d[i];

    // Round max up to a nice number for grid lines.
    const niceMax = niceRound(maxVal);
    const gridStep = niceGridStep(niceMax);

    // ── Background ───────────────────────────────────────────────────────────
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, W, H);

    // ── Grid lines + Y labels ────────────────────────────────────────────────
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth   = 1;
    ctx.fillStyle   = '#aaa';
    ctx.font        = '10px monospace';
    ctx.textAlign   = 'right';
    ctx.textBaseline = 'middle';

    for (let v = 0; v <= niceMax; v += gridStep) {
      const y = PAD.top + ph - (v / niceMax) * ph;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(PAD.left + pw, y);
      ctx.stroke();
      ctx.fillText(v, PAD.left - 4, y);
    }

    // ── X axis tick labels (generation numbers) ───────────────────────────────
    ctx.fillStyle   = '#aaa';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'top';
    const totalTicks = statsBuffer.totalPushed;
    const startTick  = totalTicks - n;
    const xLabelStep = niceXStep(n);
    for (let t = 0; t < n; t += xLabelStep) {
      const x = PAD.left + (t / Math.max(n - 1, 1)) * pw;
      ctx.fillText(startTick + t, x, PAD.top + ph + 4);
    }
    // Always label the last tick.
    ctx.fillText(totalTicks, PAD.left + pw, PAD.top + ph + 4);

    // ── Series lines ─────────────────────────────────────────────────────────
    ctx.lineWidth = 1.5;
    for (let s = 0; s < series.length; s++) {
      const d = data[s];
      if (d.length === 0) continue;

      ctx.strokeStyle = series[s].color;
      ctx.beginPath();
      for (let t = 0; t < d.length; t++) {
        const x = PAD.left + (t / Math.max(d.length - 1, 1)) * pw;
        const y = PAD.top  + ph - (d[t] / niceMax) * ph;
        if (t === 0) ctx.moveTo(x, y);
        else         ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // ── Border ───────────────────────────────────────────────────────────────
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth   = 1;
    ctx.strokeRect(PAD.left, PAD.top, pw, ph);

    // ── Legend ───────────────────────────────────────────────────────────────
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.font         = '10px monospace';
    let lx = PAD.left + 4;
    for (const { label, color } of series) {
      ctx.fillStyle = color;
      ctx.fillRect(lx, PAD.top + 4, 16, 3);
      ctx.fillStyle = '#555';
      ctx.fillText(label, lx + 20, PAD.top + 5);
      lx += ctx.measureText(label).width + 36;
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function niceRound(v) {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / mag) * mag;
}

function niceGridStep(niceMax) {
  const candidates = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  for (const c of candidates) if (niceMax / c <= 6) return c;
  return Math.ceil(niceMax / 5);
}

function niceXStep(n) {
  if (n <= 20)  return 5;
  if (n <= 50)  return 10;
  if (n <= 100) return 20;
  if (n <= 200) return 50;
  return 100;
}
