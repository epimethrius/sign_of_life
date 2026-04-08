// Fixed-size circular buffer storing per-tick snapshots of N series.
// Each series is one integer value per tick (e.g. population of a species).
export class StatsBuffer {
  constructor(numSeries, maxTicks = 1000) {
    this.numSeries  = numSeries;
    this.maxTicks   = maxTicks;
    this.buf        = new Int32Array(maxTicks * numSeries);
    this.writeHead  = 0;  // next slot index (0..maxTicks-1)
    this.totalPushed = 0; // total ticks ever pushed (unbounded)
  }

  push(values) {
    const offset = this.writeHead * this.numSeries;
    for (let i = 0; i < this.numSeries; i++) {
      this.buf[offset + i] = values[i] ?? 0;
    }
    this.writeHead   = (this.writeHead + 1) % this.maxTicks;
    this.totalPushed += 1;
  }

  // How many ticks are actually stored (capped at maxTicks).
  get stored() {
    return Math.min(this.totalPushed, this.maxTicks);
  }

  // Latest recorded value for series i.
  latest(seriesIdx) {
    if (this.totalPushed === 0) return 0;
    const lastSlot = (this.writeHead - 1 + this.maxTicks) % this.maxTicks;
    return this.buf[lastSlot * this.numSeries + seriesIdx];
  }

  // All stored values for series i in chronological order.
  getSeries(seriesIdx) {
    const n = this.stored;
    const out = new Int32Array(n);
    // If we've wrapped, the oldest slot is writeHead; otherwise it's 0.
    const startSlot = this.totalPushed > this.maxTicks ? this.writeHead : 0;
    for (let t = 0; t < n; t++) {
      const slot = (startSlot + t) % this.maxTicks;
      out[t] = this.buf[slot * this.numSeries + seriesIdx];
    }
    return out;
  }

  // Basic summary for series i over all stored ticks.
  summary(seriesIdx) {
    const series = this.getSeries(seriesIdx);
    if (series.length === 0) return { min: 0, max: 0, last: 0, avgGrowth: 0 };
    let min = Infinity, max = -Infinity, totalGrowth = 0;
    for (let i = 0; i < series.length; i++) {
      if (series[i] < min) min = series[i];
      if (series[i] > max) max = series[i];
      if (i > 0) totalGrowth += series[i] - series[i - 1];
    }
    const avgGrowth = series.length > 1
      ? (totalGrowth / (series.length - 1)).toFixed(2)
      : 0;
    return { min, max, last: series[series.length - 1], avgGrowth };
  }

  reset() {
    this.buf.fill(0);
    this.writeHead   = 0;
    this.totalPushed = 0;
  }
}
