const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const root = path.resolve(__dirname, '..');
const metaPath = path.join(root, 'data', 'grid-metadata.json');
const binPath = path.join(root, 'data', 'annual-grid.bin');

const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
const buffer = fs.readFileSync(binPath);
const grid = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);

const state = {
  meta,
  grid,
  years: Array.from({ length: meta.last_complete_year - meta.first_year + 1 }, (_, i) => meta.first_year + i)
};

function valueAt(yearIndex, row, col) {
  const { rows, columns } = state.meta.grid;
  const raw = state.grid[(yearIndex * rows + row) * columns + col];
  return raw === state.meta.fill_value ? NaN : raw / state.meta.scale;
}

function cellTrendMap(start, end) {
  const { rows, columns } = state.meta.grid;
  const output = new Float32Array(rows * columns);
  const first = start - state.meta.first_year;
  const last = end - state.meta.first_year;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (let yi = first; yi <= last; yi++) {
        const value = valueAt(yi, row, col);
        if (!Number.isFinite(value)) continue;
        const x = state.years[yi];
        n++; sx += x; sy += value; sxx += x * x; sxy += x * value;
      }
      const denominator = n * sxx - sx * sx;
      output[row * columns + col] = n >= 3 && denominator ? ((n * sxy - sx * sy) / denominator) * 10 : NaN;
    }
  }
  return output;
}

function runBenchmark(start, end, label) {
  const warmup = cellTrendMap(start, end); // warmup JIT
  const iterations = 5;
  const times = [];
  let result;
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    result = cellTrendMap(start, end);
    const t1 = performance.now();
    times.push(t1 - t0);
  }
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const minTime = Math.min(...times);
  
  let validCells = 0;
  let nanCells = 0;
  for (let i = 0; i < result.length; i++) {
    if (Number.isFinite(result[i])) validCells++;
    else nanCells++;
  }
  
  const yearsCount = end - start + 1;
  const totalInputCells = yearsCount * meta.grid.rows * meta.grid.columns;
  const inputBytes = totalInputCells * 2;
  const outputBytes = result.byteLength;

  return {
    test: label,
    start,
    end,
    years_count: yearsCount,
    iterations,
    avg_execution_ms: Number(avgTime.toFixed(3)),
    min_execution_ms: Number(minTime.toFixed(3)),
    raw_times_ms: times.map(t => Number(t.toFixed(3))),
    input_records_processed: totalInputCells,
    input_bytes: inputBytes,
    output_cells: result.length,
    output_bytes: outputBytes,
    valid_trend_cells: validCells,
    nan_trend_cells: nanCells
  };
}

const testA = runBenchmark(1880, 2025, 'Test A (1880-2025)');
const testB = runBenchmark(2000, 2025, 'Test B (2000-2025)');

const output = {
  timestamp: new Date().toISOString(),
  environment: {
    node_version: process.version,
    platform: process.platform,
    arch: process.arch
  },
  testA,
  testB
};

console.log(JSON.stringify(output, null, 2));
