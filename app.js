const DATA = {
  metadata: './data/grid-metadata.json',
  grid: './data/annual-grid.bin',
  global: './data/global-mean.csv',
};

const LANDSCAPE_IDEAS = {
  desert: 'Look for precipitation, soil moisture and land-surface temperature; compare dry-season changes over time.',
  rainforest: 'Explore vegetation greenness, rainfall and canopy moisture; compare wet- and dry-season patterns.',
  estuary: 'Investigate surface-water extent, flooding and water quality indicators; pair satellite observations with local gauges.',
  city: 'Explore land-surface temperature, vegetation cover and air-temperature records around expanding urban areas.',
};

const state = { meta: null, grid: null, years: [], globalSeries: [], start: 1880, end: 2025, region: 'global', local: null, map: null, trendLayer: null, chart: null, mapTrends: null, promptText: '', demo: null, demoStep: 0 };
const $ = (id) => document.getElementById(id);

function parseGlobalCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[1].split(',').map((v) => v.trim());
  const annualIndex = header.indexOf('J-D');
  return lines.slice(2).map((line) => {
    const fields = line.split(',').map((v) => v.trim());
    const year = Number(fields[0]);
    const value = Number(fields[annualIndex]);
    return Number.isFinite(year) && Number.isFinite(value) ? { year, value } : null;
  }).filter(Boolean);
}

async function loadData() {
  const [metaResponse, gridResponse, globalResponse] = await Promise.all([
    fetch(DATA.metadata), fetch(DATA.grid), fetch(DATA.global),
  ]);
  if (![metaResponse, gridResponse, globalResponse].every((response) => response.ok)) {
    throw new Error('NASA data files could not be loaded. Start the local web server from the project folder.');
  }
  state.meta = await metaResponse.json();
  const binary = await gridResponse.arrayBuffer();
  state.grid = new Int16Array(binary);
  state.globalSeries = parseGlobalCsv(await globalResponse.text());
  state.years = Array.from({ length: state.meta.last_complete_year - state.meta.first_year + 1 }, (_, i) => state.meta.first_year + i);
  state.start = state.meta.first_year;
  state.end = state.meta.last_complete_year;
}

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

function selectedSeries() {
  if (state.region === 'global') {
    return state.globalSeries.filter((point) => point.year >= state.start && point.year <= state.end);
  }
  const { rows, columns, lat_first_center, lon_first_center, step_degrees } = state.meta.grid;
  const first = state.start - state.meta.first_year;
  const last = state.end - state.meta.first_year;
  const points = [];
  for (let yi = first; yi <= last; yi++) {
    let sum = 0, weights = 0;
    for (let row = 0; row < rows; row++) {
      const lat = lat_first_center + row * step_degrees;
      for (let col = 0; col < columns; col++) {
        const lon = lon_first_center + col * step_degrees;
        let include = state.region === 'north' ? lat >= 0 : state.region === 'south' ? lat < 0 : false;
        if (state.region === 'map' && state.local) {
          const deltaLon = ((lon - state.local.lon + 540) % 360) - 180;
          include = Math.abs(lat - state.local.lat) <= 6 && Math.abs(deltaLon) <= 6;
        }
        if (!include) continue;
        const value = valueAt(yi, row, col);
        if (!Number.isFinite(value)) continue;
        const weight = Math.cos(lat * Math.PI / 180);
        sum += value * weight; weights += weight;
      }
    }
    if (weights > 0) points.push({ year: state.years[yi], value: sum / weights });
  }
  return points;
}

function median(values) {
  if (!values.length) return NaN;
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function senSlope(points) {
  const slopes = [];
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = i + 1; j < points.length; j++) {
      slopes.push((points[j].value - points[i].value) / (points[j].year - points[i].year));
    }
  }
  return median(slopes);
}

function erfc(x) {
  const z = Math.abs(x), t = 1 / (1 + z / 2);
  const answer = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))));
  return x >= 0 ? answer : 2 - answer;
}

function mannKendall(points, slope) {
  const n = points.length;
  if (n < 8) return { p: NaN, tau: NaN, rho: 0 };
  let s = 0;
  for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) s += Math.sign(points[j].value - points[i].value);
  const ties = new Map();
  for (const point of points) ties.set(point.value, (ties.get(point.value) || 0) + 1);
  let variance = n * (n - 1) * (2 * n + 5);
  for (const count of ties.values()) if (count > 1) variance -= count * (count - 1) * (2 * count + 5);
  variance /= 18;

  // Estimate lag-1 correlation after removing the robust trend; inflate the
  // MK variance for positive persistence so repeated years count less strongly.
  const residuals = points.map((point) => point.value - slope * point.year);
  const mean = residuals.reduce((a, b) => a + b, 0) / n;
  let numerator = 0, denominator = 0;
  for (let i = 0; i < n; i++) denominator += (residuals[i] - mean) ** 2;
  for (let i = 1; i < n; i++) numerator += (residuals[i] - mean) * (residuals[i - 1] - mean);
  const rho = denominator ? numerator / denominator : 0;
  const persistence = Math.max(0, Math.min(0.8, rho));
  variance *= (1 + persistence) / (1 - persistence);
  const z = s > 0 ? (s - 1) / Math.sqrt(variance) : s < 0 ? (s + 1) / Math.sqrt(variance) : 0;
  return { p: erfc(Math.abs(z) / Math.SQRT2), tau: s / (n * (n - 1) / 2), rho };
}

function regionLabel() {
  if (state.region === 'north') return 'NORTHERN HEMISPHERE';
  if (state.region === 'south') return 'SOUTHERN HEMISPHERE';
  if (state.region === 'map' && state.local) return `${state.local.lat.toFixed(0)}° LAT, ${state.local.lon.toFixed(0)}° LON AREA`;
  if (state.region === 'map') return 'CHOOSE A MAP LOCATION';
  return 'GLOBAL MEAN';
}

function buildChart(points, slope) {
  const ctx = $('trend-chart').getContext('2d');
  if (state.chart) state.chart.destroy();
  const slopeLine = points.map((point) => ({ x: point.year, y: median(points.map((p) => p.value - slope * p.year)) + slope * point.year }));
  state.chart = new Chart(ctx, {
    type: 'line',
    data: { datasets: [
      { label: 'Annual anomaly', data: points.map((p) => ({ x: p.year, y: p.value })), borderColor: '#63d3d0', backgroundColor: 'rgba(99,211,208,.13)', borderWidth: 1.5, pointRadius: points.length > 90 ? 0 : 2, pointHoverRadius: 4, tension: .18, fill: true },
      { label: 'Sen slope', data: slopeLine, borderColor: '#f79a62', borderWidth: 1.5, pointRadius: 0, borderDash: [5, 4], fill: false },
    ] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#071923', borderColor: '#35545f', borderWidth: 1, titleFont: { family: 'DM Mono', size: 9 }, bodyFont: { family: 'DM Sans', size: 10 }, callbacks: { label: (item) => `${item.dataset.label}: ${item.parsed.y.toFixed(2)} °C` } } },
      scales: { x: { type: 'linear', min: state.start, max: state.end, grid: { color: 'rgba(140,170,180,.09)' }, ticks: { color: '#8da2aa', maxTicksLimit: 6, font: { family: 'DM Mono', size: 8 }, callback: (v) => `${v}` }, border: { display: false } },
        y: { grid: { color: 'rgba(140,170,180,.09)' }, ticks: { color: '#8da2aa', maxTicksLimit: 5, font: { family: 'DM Mono', size: 8 }, callback: (v) => `${v.toFixed(1)}°` }, border: { display: false } } },
    },
  });
}

function updateSummary() {
  const points = selectedSeries();
  const slope = senSlope(points);
  const mk = mannKendall(points, slope);
  const rate = slope * 10;
  const label = regionLabel();
  $('area-name').textContent = label;
  $('trend-value').textContent = Number.isFinite(rate) ? `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}` : '—';
  $('trend-direction').textContent = Number.isFinite(rate) ? (rate >= 0 ? '↗' : '↘') : '·';
  $('trend-direction').style.color = !Number.isFinite(rate) ? '#91a5ae' : rate >= 0 ? '#f79a62' : '#79b9d0';
  $('trend-interpretation').textContent = Number.isFinite(rate) ? `${rate >= 0 ? 'Warming' : 'Cooling'} trend estimated from selected period` : 'Insufficient data in this window';
  $('significance').textContent = Number.isFinite(mk.p) ? (mk.p < .05 ? 'Evidence found' : 'Not detected') : state.region === 'map' && !state.local ? 'Choose a place' : 'Not enough years';
  $('p-value').textContent = Number.isFinite(mk.p) ? mk.p.toFixed(3) : '—';
  $('years-used').textContent = `${points.length} YEARS`;
  $('confidence-note').textContent = Number.isFinite(mk.p)
    ? `Mann–Kendall p = ${mk.p.toFixed(3)} with an approximate lag-1 persistence adjustment (ρ₁ = ${mk.rho.toFixed(2)}). ${mk.p < .05 ? 'Evidence against no monotonic trend; this does not establish cause.' : 'A trend was not detected by this test. Variability or record length may limit evidence; a longer record may clarify, but does not guarantee significance.'}`
    : state.region === 'map' && !state.local ? 'Click anywhere on the global map to set your area of interest.' : 'At least eight annual observations are needed for a trend significance estimate.';
  $('insight-copy').textContent = state.promptText || (state.region === 'global'
    ? 'Global average uses NASA’s published annual LOTI series. The map uses the matching 2° gridded analysis; local and hemisphere averages are area-weighted.'
    : 'This regional series is an area-weighted average of available 2° grid cells. Missing cells are omitted each year, and the NASA analysis uses 1200 km smoothing.');
  buildChart(points, slope);
}

function updatePeriodLabels() {
  $('period-label').textContent = `${state.start} — ${state.end}`;
  $('start-label').textContent = state.start;
  $('end-label').textContent = state.end;
}

function updateMapTrends() {
  state.mapTrends = cellTrendMap(state.start, state.end);
  if (state.trendLayer) state.trendLayer.redraw();
}

function trendColor(value) {
  if (!Number.isFinite(value)) return null;
  const stops = [
    [-0.5, [64, 119, 148]], [-0.1, [113, 163, 174]], [0.12, [181, 198, 183]],
    [0.42, [235, 177, 111]], [0.8, [207, 102, 78]], [1.35, [153, 58, 53]],
  ];
  const v = Math.max(stops[0][0], Math.min(stops[stops.length - 1][0], value));
  let i = 0;
  while (i < stops.length - 2 && v > stops[i + 1][0]) i++;
  const [a, ca] = stops[i], [b, cb] = stops[i + 1];
  const f = (v - a) / (b - a);
  return ca.map((channel, index) => Math.round(channel + (cb[index] - channel) * f));
}

function initMap() {
  state.map = L.map('map', { zoomControl: false, minZoom: 2, maxZoom: 6, worldCopyJump: true }).setView([18, 0], 2);
  L.control.zoom({ position: 'bottomright' }).addTo(state.map);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>', subdomains: 'abcd', maxZoom: 6,
  }).addTo(state.map);

  const TrendGrid = L.GridLayer.extend({
    createTile(coords, done) {
      const canvas = document.createElement('canvas');
      const size = this.getTileSize(); canvas.width = size.x; canvas.height = size.y;
      const ctx = canvas.getContext('2d');
      const image = ctx.createImageData(size.x, size.y);
      const worldPixels = size.x * (2 ** coords.z);
      const { rows, columns } = state.meta.grid;
      for (let py = 0; py < size.y; py++) {
        const mapY = coords.y * size.y + py;
        const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * mapY / worldPixels))) * 180 / Math.PI;
        const row = Math.max(0, Math.min(rows - 1, Math.floor((lat + 90) / 2)));
        for (let px = 0; px < size.x; px++) {
          const mapX = coords.x * size.x + px;
          const lon = mapX / worldPixels * 360 - 180;
          const col = Math.max(0, Math.min(columns - 1, Math.floor((lon + 180) / 2)));
          const value = state.mapTrends[row * columns + col];
          const color = trendColor(value);
          if (!color) continue;
          const offset = (py * size.x + px) * 4;
          image.data[offset] = color[0]; image.data[offset + 1] = color[1]; image.data[offset + 2] = color[2]; image.data[offset + 3] = 194;
        }
      }
      ctx.putImageData(image, 0, 0);
      canvas.className = 'leaflet-tile trend-grid-canvas';
      done(null, canvas);
      return canvas;
    },
  });
  state.trendLayer = new TrendGrid({ opacity: .9, tileSize: 256, updateWhenIdle: true, keepBuffer: 2 }).addTo(state.map);
  state.map.on('click', (event) => {
    state.region = 'map'; state.local = { lat: event.latlng.lat, lon: event.latlng.lng };
    state.promptText = `Area selected near ${event.latlng.lat.toFixed(1)}°, ${event.latlng.lng.toFixed(1)}°. The estimate averages available grid cells within about 12° of this point.`;
    $('region-select').value = 'map'; updateQuestionState('map'); updateSummary();
  });
}

function updateQuestionState(active) {
  document.querySelectorAll('.question-option').forEach((button) => button.classList.toggle('active', button.dataset.question === active));
}

function setInvestigation(region, start, message) {
  state.region = region;
  state.local = region === 'map' ? null : state.local;
  state.start = start;
  state.end = state.meta.last_complete_year;
  state.promptText = message;
  $('region-select').value = region;
  updateQuestionState(region === 'south' ? 'north' : region);
  updateControls();
  updateMapTrends();
  updateSummary();
  if (region === 'map' && !state.local) state.map.setView([15, 0], 2);
}

const DEMOS = {
  global: {
    tag: 'DEMO 01 · GLOBAL', region: 'global', start: 1880,
    steps: [
      ['Start with a question', 'Can we distinguish the long-term global temperature signal from year-to-year weather? This example starts with the full published record.'],
      ['Read the evidence', 'The chart uses NASA’s published annual global LOTI series. The anomaly compares each year with the 1951–1980 reference average; the map shows the corresponding gridded trend magnitude.'],
      ['Interpret with care', 'Check the Sen slope, Mann–Kendall result and p-value together. “Not detected” is still useful: variability, record length and test assumptions affect the evidence. The result does not identify a cause.'],
    ],
  },
  hemisphere: {
    tag: 'DEMO 02 · HEMISPHERES', region: 'north', start: 1979,
    steps: [
      ['Ask a comparison question', 'Does a shorter, recent record show the same directional signal in both hemispheres? Start by examining the Northern Hemisphere from 1979.'],
      ['Compare the other half', 'The current chart and map now describe the Northern Hemisphere. Use the area selector to switch to the Southern Hemisphere while keeping the same time window.'],
      ['Notice the limits', 'The two averages have different land–ocean coverage and missing-cell patterns. Compare the direction and uncertainty, not just the headline slope. Annual averaging reduces the seasonal cycle; this prototype fits linear trends only.'],
    ],
  },
};

function renderDemoStep() {
  const demo = state.demo;
  const [title, body] = demo.steps[state.demoStep];
  $('demo-tag').textContent = demo.tag;
  $('demo-step').textContent = `GUIDED WALKTHROUGH · STEP ${state.demoStep + 1} OF ${demo.steps.length}`;
  $('demo-title').textContent = title;
  $('demo-body').textContent = body;
  $('demo-progress-fill').style.width = `${((state.demoStep + 1) / demo.steps.length) * 100}%`;
  $('demo-back').disabled = state.demoStep === 0;
  $('demo-next').innerHTML = state.demoStep === demo.steps.length - 1 ? 'VIEW ANALYSIS <span>↗</span>' : 'NEXT STEP <span>→</span>';
}

function beginDemo(name) {
  const demo = DEMOS[name];
  state.demo = demo; state.demoStep = 0;
  setInvestigation(demo.region, demo.start, `${demo.tag}: ${demo.steps[0][1]}`);
  renderDemoStep();
  $('demo-dialog').showModal();
}

function bindInvestigator() {
  document.querySelectorAll('.question-option').forEach((button) => button.addEventListener('click', () => {
    const question = button.dataset.question;
    if (question === 'global') setInvestigation('global', state.meta.first_year, 'You are viewing NASA’s global annual mean record. Try changing the time window, then compare another area.');
    if (question === 'north') setInvestigation('north', 1979, 'The Northern Hemisphere is selected from 1979 to the latest complete year. Switch to the Southern Hemisphere to compare the two regional signals.');
    if (question === 'map') setInvestigation('map', state.start, 'Click any point on the map. The app will summarize nearby grid cells so you can inspect a region, not just one grid square.');
    updateQuestionState(question);
  }));
  document.querySelectorAll('[data-demo]').forEach((button) => button.addEventListener('click', () => beginDemo(button.dataset.demo)));
  $('landscape-select').addEventListener('change', (event) => {
    $('landscape-idea').textContent = LANDSCAPE_IDEAS[event.target.value];
  });
  $('demo-close').addEventListener('click', () => $('demo-dialog').close());
  $('demo-back').addEventListener('click', () => { if (state.demoStep > 0) state.demoStep--; renderDemoStep(); });
  $('demo-next').addEventListener('click', () => {
    if (state.demoStep < state.demo.steps.length - 1) { state.demoStep++; renderDemoStep(); }
    else $('demo-dialog').close();
  });
}

function updateControls() {
  $('start-year').value = state.start;
  $('end-year').value = state.end;
  updatePeriodLabels();
}

function bindControls() {
  const start = $('start-year'), end = $('end-year');
  start.min = end.min = state.meta.first_year;
  start.max = end.max = state.meta.last_complete_year;
  start.value = state.start; end.value = state.end;
  start.addEventListener('input', () => {
    state.start = Math.min(Number(start.value), state.end - 7);
    if (state.start < state.meta.first_year) state.start = state.meta.first_year;
    start.value = state.start; updateControls(); updateMapTrends(); updateSummary();
  });
  end.addEventListener('input', () => {
    state.end = Math.max(Number(end.value), state.start + 7);
    if (state.end > state.meta.last_complete_year) state.end = state.meta.last_complete_year;
    end.value = state.end; updateControls(); updateMapTrends(); updateSummary();
  });
  $('region-select').addEventListener('change', (event) => {
    state.region = event.target.value;
    if (state.region === 'map' && !state.local) {
      state.map.setView([15, 0], 2);
    }
    state.promptText = '';
    updateQuestionState(state.region === 'south' ? 'north' : state.region);
    updateSummary();
  });
  $('reset-button').addEventListener('click', () => {
    state.region = 'global'; state.local = null; state.promptText = '';
    state.start = state.meta.first_year; state.end = state.meta.last_complete_year;
    $('region-select').value = 'global'; updateControls(); updateMapTrends(); updateSummary();
    updateQuestionState('global');
    state.map.setView([18, 0], 2);
  });
  $('map-reset').addEventListener('click', () => state.map.setView([18, 0], 2));
  $('download-button').addEventListener('click', () => {
    const rows = [['year', 'temperature_anomaly_degC'], ...selectedSeries().map((p) => [p.year, p.value.toFixed(3)])];
    const blob = new Blob([rows.map((row) => row.join(',')).join('\n')], { type: 'text/csv' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `earth-trend-${state.region}-${state.start}-${state.end}.csv`; link.click(); URL.revokeObjectURL(link.href);
  });
}

async function start() {
  try {
    await loadData();
    updatePeriodLabels();
    initMap(); bindControls(); bindInvestigator(); updateMapTrends(); updateSummary();
  } catch (error) {
    document.querySelector('.source-status').innerHTML = '<i style="background:#f79a62"></i> DATA LOAD ISSUE';
    $('insight-copy').textContent = error.message;
    $('trend-interpretation').textContent = 'Could not load the analysis files';
    console.error(error);
  }
}

start();
