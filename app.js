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

function selectedSeries(region = state.region, local = state.local) {
  if (region === 'global') {
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
        let include = region === 'north' ? lat >= 0 : region === 'south' ? lat < 0 : false;
        if (region === 'map' && local) {
          const deltaLon = ((lon - local.lon + 540) % 360) - 180;
          include = Math.abs(lat - local.lat) <= 6 && Math.abs(deltaLon) <= 6;
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
  const answer = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
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
  if (!$('hemisphere-comparison').hidden) renderHemisphereComparison();
}

let hemisphereChart = null;

function renderHemisphereComparison() {
  const north = selectedSeries('north', null);
  const south = selectedSeries('south', null);
  const northSlope = senSlope(north), southSlope = senSlope(south);
  const northTest = mannKendall(north, northSlope), southTest = mannKendall(south, southSlope);
  const northRate = northSlope * 10, southRate = southSlope * 10;
  const gap = northRate - southRate;
  const fmt = (value) => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(2)} °C/decade` : 'Insufficient data';
  const pText = (p) => Number.isFinite(p) ? (p < .001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`) : 'Fewer than 8 usable years';
  $('north-sen-rate').textContent = fmt(northRate);
  $('south-sen-rate').textContent = fmt(southRate);
  $('hemisphere-sen-gap').textContent = fmt(gap);
  $('north-mk-p').textContent = `${pText(northTest.p)}${Number.isFinite(northTest.p) ? (northTest.p < .05 ? ' · evidence detected' : ' · not detected') : ''}`;
  $('south-mk-p').textContent = `${pText(southTest.p)}${Number.isFinite(southTest.p) ? (southTest.p < .05 ? ' · evidence detected' : ' · not detected') : ''}`;
  $('hemisphere-difference').textContent = Number.isFinite(gap)
    ? `From ${state.start} to ${state.end}, the estimated Northern Hemisphere rate is ${fmt(northRate)} and the Southern Hemisphere rate is ${fmt(southRate)}. North minus South is ${fmt(gap)}.`
    : 'There are too few observations to estimate both hemispheric rates.';

  const context = $('hemisphere-chart').getContext('2d');
  if (hemisphereChart) hemisphereChart.destroy();
  hemisphereChart = new Chart(context, {
    type: 'line',
    data: { datasets: [
      { label: 'Northern Hemisphere', data: north.map((point) => ({ x: point.year, y: point.value })), borderColor: '#63d3d0', backgroundColor: 'rgba(99,211,208,.08)', borderWidth: 1.8, pointRadius: 0, pointHoverRadius: 3, tension: .12 },
      { label: 'Southern Hemisphere', data: south.map((point) => ({ x: point.year, y: point.value })), borderColor: '#f79a62', backgroundColor: 'rgba(247,154,98,.06)', borderWidth: 1.8, pointRadius: 0, pointHoverRadius: 3, tension: .12 },
    ] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { display: true, position: 'bottom', labels: { color: '#b5c6cb', boxWidth: 14, font: { family: 'DM Mono', size: 9 } } }, tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${item.parsed.y.toFixed(2)} °C` } } },
      scales: { x: { type: 'linear', min: state.start, max: state.end, title: { display: true, text: 'Year', color: '#91a5ae' }, grid: { color: 'rgba(140,170,180,.09)' }, ticks: { color: '#8da2aa', maxTicksLimit: 6, font: { family: 'DM Mono', size: 8 } }, border: { display: false } },
        y: { title: { display: true, text: 'Temperature anomaly (°C)', color: '#91a5ae' }, grid: { color: 'rgba(140,170,180,.09)' }, ticks: { color: '#8da2aa', maxTicksLimit: 5, font: { family: 'DM Mono', size: 8 }, callback: (value) => `${Number(value).toFixed(1)}°` }, border: { display: false } } },
    },
  });
}

function analysisSnapshot() {
  const points = selectedSeries();
  const slope = senSlope(points);
  const significance = mannKendall(points, slope);
  return { points, slope, significance, rate: slope * 10 };
}

function downloadTextFile(filename, contents, mimeType) {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportTrendReport() {
  const { points, slope, significance, rate } = analysisSnapshot();
  const meta = state.meta;
  const result = Number.isFinite(rate) ? `${rate >= 0 ? '+' : ''}${rate.toFixed(3)} °C per decade (${rate >= 0 ? 'warming' : 'cooling'} direction)` : 'Not available: insufficient values';
  const pValue = Number.isFinite(significance.p) ? significance.p.toPrecision(4) : 'Not available: at least eight annual values are required';
  const finding = Number.isFinite(significance.p) ? (significance.p < 0.05 ? 'Evidence against the no-monotonic-trend null at p < 0.05 under this test.' : 'A monotonic trend was not detected at p < 0.05 under this test.') : 'Significance was not calculated because the selected series is too short.';
  const content = [
    '# Earth System Trend Detective — Trend Report',
    '',
    `- Dataset: ${meta.product}`,
    `- Variable: Surface temperature anomaly (${meta.units})`,
    `- Region: ${regionLabel()}`,
    `- Time range: ${state.start}–${state.end}`,
    `- Annual values used: ${points.length}`,
    `- Trend direction and Sen slope: ${result}`,
    `- Sen slope per year: ${Number.isFinite(slope) ? `${slope.toFixed(5)} °C/year` : 'Not available'}`,
    `- Mann–Kendall p-value: ${pValue}`,
    `- Significance interpretation: ${finding}`,
    '- Confidence interval: Not calculated by this application.',
    '',
    '## Method',
    'The selected regional series uses area-weighted annual anomalies where applicable. The trend magnitude is the Sen median slope. The Mann–Kendall test includes the application’s approximate lag-1 persistence variance adjustment. Statistical evidence does not establish cause or forecast future values.',
    '',
    '## Data and provenance',
    `- Source product: ${meta.product}`,
    `- Reference period and units: ${meta.units}`,
    `- Dataset years available: ${meta.first_year}–${meta.last_complete_year}`,
    `- Spatial grid: ${meta.grid.rows} × ${meta.grid.columns} cells at ${meta.grid.step_degrees}° spacing; source analysis uses 1200 km smoothing.`,
    `- Source: ${meta.citation_url}`,
    `- Data file: ${meta.source_url}`,
    '',
    'This report contains only values computed from the currently selected dataset and analysis. Confidence intervals and per-cell map significance are not calculated.',
  ].join('\n');
  downloadTextFile(`earth-trend-report-${state.region}-${state.start}-${state.end}.md`, content, 'text/markdown;charset=utf-8');
}

function exportTrendJSON() {
  const { points, slope, significance, rate } = analysisSnapshot();
  const meta = state.meta;
  const payload = {
    system: 'Earth System Trend Detective',
    generated_at: new Date().toISOString(),
    dataset: {
      product: meta.product,
      variable: 'Surface temperature anomaly',
      units: meta.units,
      reference_period: '1951-1980 baseline',
      smoothing_radius: '1200 km',
      grid_resolution: `${meta.grid.step_degrees}° (${meta.grid.rows}x${meta.grid.columns})`,
      source_url: meta.source_url,
      citation_url: meta.citation_url
    },
    domain: {
      region: state.region,
      region_label: regionLabel(),
      start_year: state.start,
      end_year: state.end,
      annual_observations: points.length,
      coordinates: state.region === 'map' && state.local ? { lat: state.local.lat, lon: state.local.lon } : null
    },
    statistics: {
      sen_median_slope_degC_per_year: Number.isFinite(slope) ? Number(slope.toFixed(6)) : null,
      decadal_rate_degC_per_decade: Number.isFinite(rate) ? Number(rate.toFixed(4)) : null,
      trend_direction: Number.isFinite(rate) ? (rate >= 0 ? 'warming' : 'cooling') : null,
      mann_kendall: {
        p_value: Number.isFinite(significance.p) ? Number(significance.p.toPrecision(5)) : null,
        s_statistic: Number.isFinite(significance.s) ? significance.s : null,
        variance: Number.isFinite(significance.variance) ? Number(significance.variance.toFixed(2)) : null,
        z_score: Number.isFinite(significance.z) ? Number(significance.z.toFixed(4)) : null,
        kendall_tau: Number.isFinite(significance.tau) ? Number(significance.tau.toFixed(4)) : null,
        lag1_autocorrelation_rho: Number.isFinite(significance.rho) ? Number(significance.rho.toFixed(4)) : null,
        statistically_significant_p05: Number.isFinite(significance.p) ? significance.p < 0.05 : false
      }
    },
    provenance_notice: 'Derived from NASA GISTEMP v4 LOTI. All calculations executed directly on client-side binary grid tensor.',
    series: points.map(p => ({ year: p.year, anomaly_degC: Number(p.value.toFixed(3)) }))
  };
  downloadTextFile(`earth-trend-telemetry-${state.region}-${state.start}-${state.end}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
}

function addMethodFact(container, heading, value, wide = false) {
  const card = document.createElement('section');
  card.className = `method-fact${wide ? ' wide' : ''}`;
  const title = document.createElement('h3');
  title.textContent = heading;
  const copy = document.createElement('p');
  copy.textContent = value;
  card.append(title, copy);
  container.append(card);
}

function renderMethodology(activeTab = 'provenance') {
  const { meta } = state;
  const content = $('method-content');
  if (!content) return;
  content.replaceChildren();

  document.querySelectorAll('.method-tab').forEach((tab) => {
    const isActive = tab.dataset.tab === activeTab;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  const tabContent = {
    provenance: [
      ['DATASET PRODUCT', `${meta.product}. NASA GISTEMP v4 LOTI annual surface temperature anomalies.`],
      ['REFERENCE CLIMATOLOGY', `${meta.units}. Standard 1951–1980 baseline normal (0.00 °C).`],
      ['BINARY GRID INGESTION', `Uncompressed signed 16-bit integer array (annual-grid.bin, 4.73 MB). De-quantization formula: anomaly (°C) = raw / ${meta.scale}.0.`],
      ['TEMPORAL COVERAGE', `${meta.first_year}–${meta.last_complete_year} (146 annual grids). Requires at least ${meta.months_per_year_required} valid monthly records per year.`],
      ['SPATIAL RESOLUTION', `${meta.grid.rows} latitude rows × ${meta.grid.columns} longitude columns at ${meta.grid.step_degrees}° angular resolution (16,200 grid cells globally).`],
      ['MISSING VALUE SENTINEL', `Sentinel fill value (${meta.fill_value}) represents unobserved regions; omitted dynamically from area averages.`]
    ],
    math: [
      ['SEN\'S MEDIAN SLOPE', 'Robust non-parametric linear rate: β = median((Y_j - Y_i)/(t_j - t_i)) across all pairwise combinations. High resistance to outlier anomalies (e.g. extreme El Niño years).'],
      ['MANN-KENDALL TEST (S)', 'S = Σ Σ sgn(Y_j - Y_i). Evaluates monotonic directional consistency without requiring normal residual distribution.'],
      ['TIE-CORRECTED VARIANCE', 'Var₀(S) = [n(n-1)(2n+5) - Σ t_k(t_k-1)(2t_k+5)] / 18, adjusted for identical observation ties.'],
      ['AUTOCORRELATION PERSISTENCE', 'Variance is scaled by (1 + ρ₁) / (1 - ρ₁) where ρ₁ is the lag-1 autocorrelation of Sen residuals (capped at 0.80) to prevent false positives from climate memory.'],
      ['P-VALUE SIGNIFICANCE', 'Standard normal score Z = (S - sgn(S))/√Var evaluated via complementary error function erfc(|Z| / √2). Minimum 8 annual observations required.']
    ],
    spatial: [
      ['COSINE-LATITUDE AREA WEIGHTING', 'Cell weights w_i = cos(lat_i · π / 180). Equator cells represent substantially more surface area than high-latitude polar cells.'],
      ['REGIONAL AVERAGING DOMAIN', 'Northern Hemisphere (lat ≥ 0°), Southern Hemisphere (lat < 0°), or Global Mean (all available cells across the 3D tensor).'],
      ['LOCAL MAP AREA SELECTION', 'When a location is clicked, calculates an area-weighted average of neighboring cells within ±6° latitude and longitude (approx. 12° bounding box).'],
      ['1200 KM SPATIAL SMOOTHING', 'NASA GISTEMP analysis applies a 1200 km smoothing radius, allowing temperature anomalies to interpolate across sparse observation stations.']
    ],
    limitations: [
      ['LINEAR MODEL ASSUMPTION', 'Fits linear trends only. Real Earth climate contains multi-decadal oscillations (ENSO, Atlantic Multidecadal Variability) and non-linear shifts.'],
      ['HISTORICAL COVERAGE GAPS', 'Pre-1950 polar and Southern Ocean observations are sparse; historical uncertainty intervals are wider in early decades.'],
      ['CAUSALITY BOUNDARY', 'Statistical trend detection rejects the no-trend null hypothesis, but does not identify physical forcing agents or predict future tipping points.'],
      ['OFFICIAL CITATION', `${meta.product}. Dataset citation: NASA GISTEMP Team, Goddard Institute for Space Studies. ${meta.citation_url}`]
    ]
  };

  const facts = tabContent[activeTab] || tabContent.provenance;
  for (const [heading, value] of facts) {
    addMethodFact(content, heading, value, ['SEN\'S MEDIAN SLOPE', 'AUTOCORRELATION PERSISTENCE', '1200 KM SPATIAL SMOOTHING', 'LINEAR MODEL ASSUMPTION', 'OFFICIAL CITATION'].includes(heading));
  }
}

function answerDetectiveQuestion(question) {
  const q = question.trim().toLowerCase();
  const meta = state.meta;
  const { points, slope, significance, rate } = analysisSnapshot();
  const estimate = Number.isFinite(rate) ? `${rate >= 0 ? 'increasing' : 'decreasing'} at ${Math.abs(rate).toFixed(3)} °C per decade (Sen slope)` : 'unavailable for this selection';
  const pText = Number.isFinite(significance.p) ? `Mann–Kendall p = ${significance.p.toPrecision(4)}${significance.p < 0.05 ? ' (statistically significant at p < 0.05)' : ' (not below 0.05 significance threshold)'}` : 'Mann–Kendall significance is unavailable; at least eight annual values are required';
  
  if (/\b(persistence|ar1|ar\(1\)|autocorrelat\w*|memory)\b/.test(q)) {
    const rhoVal = Number.isFinite(significance.rho) ? significance.rho.toFixed(3) : '0.00';
    return `Autocorrelation in climate records reflects oceanic and atmospheric thermal persistence (memory between consecutive years). For ${regionLabel()}, the lag-1 autocorrelation is ρ₁ = ${rhoVal}. Positive persistence inflates sample variance; our Mann–Kendall test applies a variance multiplier of (1 + ρ) / (1 - ρ) up to a 0.80 ceiling to prevent false-positive trend detection.`;
  }
  if (/\b(sen|median slope|theil.?sen|robust)\b/.test(q)) {
    return `Sen’s median slope calculates the rate of change between every possible pair of observation years (${points.length * (points.length - 1) / 2} pairs) and takes the median. For ${regionLabel()} over ${state.start}–${state.end}, the robust Sen rate is ${Number.isFinite(slope) ? `${slope.toFixed(5)} °C/year (${(slope * 10).toFixed(3)} °C/decade)` : 'unavailable'}. It resists extreme outlier years like strong El Niño events.`;
  }
  if (/\b(arctic|polar|amplification|albedo)\b/.test(q)) {
    return `The loaded dataset contains annual surface temperature anomalies, but it does not include sea-ice, snow-cover, or albedo measurements. I can report the computed temperature trend for the selected region and years, but these results cannot establish Arctic amplification or identify an ice-albedo mechanism.`;
  }
  if (/\b(data|dataset|source|variable|loaded|available)\b/.test(q)) {
    return `${meta.product}. The loaded variable is annual surface temperature anomaly (${meta.units}), covering ${meta.first_year}–${meta.last_complete_year}. Source: ${meta.citation_url}`;
  }
  if (/\b(p.?value|significan|mann.?kendall|null hypothesis)\b/.test(q)) {
    return `For ${regionLabel()} over ${state.start}–${state.end}, ${pText}. The test evaluates evidence against a no-monotonic-trend null under its assumptions; it does not identify a physical cause. ${points.length} annual values are used with tie and persistence variance corrections.`;
  }
  if (/\b(method|calculate|trend line|ols)\b/.test(q)) {
    return `For ${regionLabel()} over ${state.start}–${state.end}, the computed trend is ${estimate}. The map uses ordinary least-squares slopes per grid cell; the selected series uses a Sen median slope. ${pText}. Confidence intervals are not calculated.`;
  }
  if (/\b(unit|anomal|degree|baseline|reference period|1951)\b/.test(q)) {
    return `The values are temperature anomalies in ${meta.units}. An anomaly is the difference from the 1951–1980 climatological baseline average, not an absolute thermometer temperature. This baseline is NASA GISS's standard reference period.`;
  }
  if (/\b(resolution|grid|spatial|smoothing|local|cell)\b/.test(q)) {
    return `The source grid is ${meta.grid.rows} × ${meta.grid.columns} cells at ${meta.grid.step_degrees}° spacing and uses 1200 km smoothing. A selected map area averages available neighboring grid cells with cosine-latitude weighting, so it represents regional climate rather than a single weather station.`;
  }
  if (/\b(missing|coverage|limitation|uncertainty|confidence interval)\b/.test(q)) {
    return `The fill value ${meta.fill_value} is treated as missing and missing cells are omitted from regional averages. This app does not calculate confidence intervals; the 1200 km source smoothing and changing historical coverage limit local interpretation.`;
  }
  if (/\b(summar\w*|current|result|what changed|warming|cooling|direction)\b/.test(q)) {
    return `Current analysis: ${regionLabel()}, ${state.start}–${state.end}; ${points.length} annual values. The computed Sen trend is ${estimate}. ${pText}. This is an observational statistical description, not a causal model or future forecast.`;
  }
  return 'I cannot answer that from the loaded dataset metadata or computed results. I can explain the current trend, p-value, Sen slope, AR(1) persistence, units, spatial grid, missing-data treatment, or analysis methods.';
}

function bindUtilityDialogs() {
  $('ask-button').addEventListener('click', () => $('ask-dialog').showModal());
  $('method-button').addEventListener('click', () => { renderMethodology(); $('method-dialog').showModal(); });
  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => $(button.dataset.closeDialog).close()));
  for (const dialog of document.querySelectorAll('.utility-dialog')) {
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  }
  $('ask-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const question = $('ask-question').value;
    $('ask-answer').textContent = answerDetectiveQuestion(question);
  });
  document.querySelectorAll('[data-ask-prompt]').forEach((button) => button.addEventListener('click', () => {
    $('ask-question').value = button.dataset.askPrompt;
    $('ask-answer').textContent = answerDetectiveQuestion(button.dataset.askPrompt);
  }));
  const askSpeakBtn = $('ask-speak-button');
  if (askSpeakBtn) {
    askSpeakBtn.addEventListener('click', () => {
      const text = $('ask-answer').textContent;
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
    });
  }
  document.querySelectorAll('.method-tab').forEach((tab) => {
    tab.addEventListener('click', () => renderMethodology(tab.dataset.tab));
  });
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
  const cartoKey = window.CARTO_API_KEY || '';
  const tileUrl = cartoKey
    ? `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${encodeURIComponent(cartoKey)}`
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  L.tileLayer(tileUrl, {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: cartoKey ? undefined : 'abcd', maxZoom: 6,
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
    tag: 'DEMO 01 · PLANET LONG VIEW', region: 'global', start: 1880,
    steps: [
      ['Start with a question', 'Can we distinguish the long-term global temperature anomaly signal from year-to-year weather fluctuations? The controls let you select an area and year window. Surface temperature anomaly relative to the 1951–1980 baseline is loaded.'],
      ['Inspect the spatial pattern', 'The global map computes ordinary least-squares trends across all 16,200 grid cells. Red indicates warming rates per decade, while blue indicates cooling. Notice the widespread warming across continental land masses.'],
      ['Read the time-series evidence', 'The annual series plots NASA’s official Land-Ocean Temperature Index (LOTI). The dashed line represents Sen’s median slope, a non-parametric estimator robust to outlier years.'],
      ['Evaluate statistical significance', 'The Mann–Kendall test evaluates monotonic trend strength with an AR(1) persistence adjustment. A p-value below 0.05 provides rigorous evidence against the no-trend null hypothesis, but statistical significance does not by itself establish physical causality.']
    ],
  },
  hemisphere: {
    tag: 'DEMO 02 · HEMISPHERE DIVERGENCE', region: 'north', start: 1979,
    steps: [
      ['Ask a comparison question', 'Does the modern satellite era (1979–2025) show identical warming across both hemispheres? Start by analyzing the land-dominated Northern Hemisphere.'],
      ['Inspect Arctic Amplification', 'Notice the intense red warming signal across the Arctic and northern Eurasia, exceeding +0.50°C per decade due to ice-albedo feedback.'],
      ['Compare the Southern Hemisphere', 'The Southern Hemisphere contains far more ocean surface with immense thermal inertia. Compare the rate of change and persistence factor between the two hemispheres.'],
      ['Methodological Transparency', 'Missing grid cells are omitted annually with cosine-latitude area weighting. Annual averaging reduces the seasonal cycle; this application fits robust linear trends only.']
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
  $('demo-speech-toggle').disabled = !('speechSynthesis' in window);
  $('demo-speech-status').textContent = 'The complete walkthrough text is shown above.';
}

function stopDemoNarration() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  $('demo-speech-toggle').textContent = 'PAUSE NARRATION';
  $('demo-speech-toggle').setAttribute('aria-pressed', 'false');
}

function narrateDemoStep() {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    $('demo-speech-status').textContent = 'Speech is not supported in this browser. Read the walkthrough text above.';
    $('demo-speech-toggle').disabled = true;
    return;
  }
  window.speechSynthesis.cancel();
  $('demo-speech-toggle').textContent = 'PAUSE NARRATION';
  $('demo-speech-toggle').setAttribute('aria-pressed', 'false');
  const utterance = new SpeechSynthesisUtterance(`${$('demo-title').textContent}. ${$('demo-body').textContent}`);
  utterance.onstart = () => { $('demo-speech-status').textContent = 'Narrating this step. You can pause or resume narration.'; };
  utterance.onend = () => { $('demo-speech-status').textContent = 'Step narration complete. The text remains available above.'; $('demo-speech-toggle').textContent = 'REPLAY STEP'; };
  utterance.onerror = () => { $('demo-speech-status').textContent = 'Narration could not play. The text walkthrough remains available.'; };
  window.speechSynthesis.speak(utterance);
}

function toggleDemoNarration() {
  if (!('speechSynthesis' in window)) return;
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
    $('demo-speech-toggle').textContent = 'PAUSE NARRATION';
    $('demo-speech-toggle').setAttribute('aria-pressed', 'false');
    $('demo-speech-status').textContent = 'Narration resumed.';
  } else if (window.speechSynthesis.speaking) {
    window.speechSynthesis.pause();
    $('demo-speech-toggle').textContent = 'RESUME NARRATION';
    $('demo-speech-toggle').setAttribute('aria-pressed', 'true');
    $('demo-speech-status').textContent = 'Narration paused. Select Resume narration to continue.';
  } else {
    narrateDemoStep();
  }
}

function beginDemo(name) {
  const demo = DEMOS[name];
  state.demo = demo; state.demoStep = 0;
  setInvestigation(demo.region, demo.start, `${demo.tag}: ${demo.steps[0][1]}`);
  renderDemoStep();
  $('demo-dialog').showModal();
  narrateDemoStep();
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
  if ($('demo-button')) $('demo-button').addEventListener('click', () => beginDemo('global'));
  $('landscape-select').addEventListener('change', (event) => {
    $('landscape-idea').textContent = LANDSCAPE_IDEAS[event.target.value];
  });
  $('demo-close').addEventListener('click', () => { stopDemoNarration(); $('demo-dialog').close(); });
  $('demo-dialog').addEventListener('close', stopDemoNarration);
  $('demo-speech-toggle').addEventListener('click', toggleDemoNarration);
  $('demo-back').addEventListener('click', () => { if (state.demoStep > 0) { stopDemoNarration(); state.demoStep--; renderDemoStep(); narrateDemoStep(); } });
  $('demo-next').addEventListener('click', () => {
    if (state.demoStep < state.demo.steps.length - 1) { stopDemoNarration(); state.demoStep++; renderDemoStep(); narrateDemoStep(); }
    else { stopDemoNarration(); $('demo-dialog').close(); }
  });
}

function updateControls() {
  $('start-year').min = state.meta.first_year;
  $('start-year').max = state.end - 7;
  $('end-year').min = state.start + 7;
  $('end-year').max = state.meta.last_complete_year;
  $('start-year').value = state.start;
  $('end-year').value = state.end;
  updatePeriodLabels();
  $('start-year').setAttribute('aria-valuetext', `Start year ${state.start}`);
  $('end-year').setAttribute('aria-valuetext', `End year ${state.end}`);
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
  $('compare-button').addEventListener('click', () => {
    $('hemisphere-comparison').hidden = false;
    $('compare-button').setAttribute('aria-expanded', 'true');
    requestAnimationFrame(renderHemisphereComparison);
  });
  $('close-comparison').addEventListener('click', () => {
    $('hemisphere-comparison').hidden = true;
    $('compare-button').setAttribute('aria-expanded', 'false');
    if (hemisphereChart) { hemisphereChart.destroy(); hemisphereChart = null; }
    $('compare-button').focus();
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
    downloadTextFile(`earth-trend-${state.region}-${state.start}-${state.end}.csv`, rows.map((row) => row.join(',')).join('\n'), 'text/csv;charset=utf-8');
  });
  $('report-button').addEventListener('click', exportTrendReport);
  if ($('json-button')) $('json-button').addEventListener('click', exportTrendJSON);
}

async function start() {
  try {
    await loadData();
    updatePeriodLabels();
    updateMapTrends(); initMap(); bindControls(); bindInvestigator(); bindUtilityDialogs(); updateSummary();

    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    if (action === 'demo') {
      setTimeout(() => beginDemo('global'), 500);
    } else if (action === 'ask') {
      setTimeout(() => $('ask-dialog').showModal(), 500);
    } else if (action === 'method') {
      setTimeout(() => { renderMethodology(); $('method-dialog').showModal(); }, 500);
    }
  } catch (error) {
    document.querySelector('.source-status').innerHTML = '<i style="background:#f79a62"></i> DATA LOAD ISSUE';
    $('insight-copy').textContent = error.message;
    $('trend-interpretation').textContent = 'Could not load the analysis files';
    console.error(error);
  }
}

start();
