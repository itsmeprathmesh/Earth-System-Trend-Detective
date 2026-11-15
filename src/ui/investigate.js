import { VARIABLES, fetchPowerSeries, makePowerUrl, receiptMetrics, snapshotSeries } from '../data/power.js';
import { aggregateSeason, mannKendall, monthlyAnomalies, olsTrend } from '../stats/index.js';

const CASES = {
  sahara: { name: 'Sahara', latitude: 23.416, longitude: 31.131, parameter: 'T2M' },
  amazon: { name: 'Amazon basin', latitude: -3.465, longitude: -62.215, parameter: 'PRECTOTCORR' },
  arctic: { name: 'Arctic', latitude: 78.223, longitude: 15.647, parameter: 'T2M' },
  himalaya: { name: 'Himalayan highlands', latitude: 27.988, longitude: 86.925, parameter: 'T2M_MAX' },
  megacity: { name: 'Delhi', latitude: 28.614, longitude: 77.209, parameter: 'T2M' },
  estuary: { name: 'Ganges-Brahmaputra delta', latitude: 22.303, longitude: 90.226, parameter: 'PRECTOTCORR' },
  nagpur: { name: 'Nagpur', latitude: 21.145, longitude: 79.088, parameter: 'T2M' },
  'central-us': { name: 'Central US plains', latitude: 39.099, longitude: -98.5, parameter: 'PRECTOTCORR' },
};
const FIRST_DATA_YEAR = 1981;
const LAST_DATA_YEAR = new Date().getUTCFullYear() - 1;
const $ = (id) => document.getElementById(id);
let requestNumber = 0;
let selectedPlaceName = CASES.sahara.name;
let map;
let marker;
let lastInvestigation = null;
let activeDemo = null;
let demoStep = 0;

const FOCUS_VARIABLES = {
  heat: 'T2M', rain: 'PRECTOTCORR', drought: 'GWETROOT', wind: 'WS10M',
  sunlight: 'ALLSKY_SFC_SW_DWN', humidity: 'RH2M',
};

const SEASONS = {
  annual: Array.from({ length: 12 }, (_, index) => index + 1),
  mam: [3, 4, 5],
  jjas: [6, 7, 8, 9],
  djf: [12, 1, 2],
};

const DEMO_STEPS = [
  'The selected location and variable come from NASA POWER. Check the request URL and LIVE or SNAPSHOT mode in the Data receipt.',
  'The app removes each calendar month’s long-term mean, then averages the chosen months by year before estimating a trend.',
];

function setNotice(message, kind = '') {
  $('notice').textContent = message;
  $('notice').className = `notice ${kind}`.trim();
}

function coordinateLabel(latitude, longitude) {
  return `${latitude.toFixed(3)}°, ${longitude.toFixed(3)}°`;
}

function currentRequest() {
  const latitude = Number($('latitude').value);
  const longitude = Number($('longitude').value);
  const parameter = $('parameter').value;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RangeError('Enter a latitude from −90 to 90 and a longitude from −180 to 180.');
  }
  const startYear = Number($('start-year').value);
  const endYear = Number($('end-year').value);
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear < FIRST_DATA_YEAR || endYear > LAST_DATA_YEAR || startYear > endYear) {
    throw new RangeError(`Choose a valid year window from ${FIRST_DATA_YEAR} to ${LAST_DATA_YEAR}.`);
  }
  let months = SEASONS[$('season').value];
  if ($('season').value === 'custom') {
    const rawMonths = $('custom-months').value.split(',').map((value) => value.trim()).filter(Boolean);
    months = rawMonths.map(Number);
    if (!months.length || months.some((month) => !Number.isInteger(month) || month < 1 || month > 12) || new Set(months).size !== months.length) {
      throw new RangeError('Enter one or more unique month numbers from 1 to 12.');
    }
  }
  return { latitude, longitude, parameter, startYear, endYear, months, season: $('season').value };
}

function selectedSiteName(request) {
  const current = CASES[$('case-select').value];
  return current && current.latitude === request.latitude && current.longitude === request.longitude
    ? current.name
    : (selectedPlaceName || coordinateLabel(request.latitude, request.longitude));
}

function fillVariables() {
  $('parameter').replaceChildren(...Object.entries(VARIABLES).map(([key, variable]) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = `${variable.name} (${key})`;
    return option;
  }));
}

function updateDefinition() {
  const info = VARIABLES[$('parameter').value];
  $('variable-definition').textContent = `${info.definition} ${info.care} Model/source: ${info.mission}. Unit: ${info.unit}.`;
}

async function getSnapshot(caseId, requestUrl) {
  if (!CASES[caseId]) return null;
  const response = await fetch(`public/data/snapshots/${caseId}.json`, { cache: 'no-store' });
  if (!response.ok) return null;
  const snapshot = await response.json();
  return snapshot.requestUrl === requestUrl ? snapshot : null;
}

function getCached(requestUrl) {
  try {
    const entry = JSON.parse(localStorage.getItem(`power:${requestUrl}`) || 'null');
    return entry?.requestUrl === requestUrl ? entry : null;
  } catch { return null; }
}

function saveCache(result) {
  try {
    localStorage.setItem(`power:${result.requestUrl}`, JSON.stringify({
      requestUrl: result.requestUrl,
      fetchedAtUtc: result.fetchedAtUtc,
      response: result.rawResponse,
    }));
  } catch { /* Browser storage may be disabled or full. */ }
}

async function getSeries(request, caseId) {
  const fullRequest = { ...request, startYear: FIRST_DATA_YEAR, endYear: LAST_DATA_YEAR };
  const requestUrl = makePowerUrl(fullRequest);
  try {
    const result = await fetchPowerSeries(fullRequest);
    saveCache(result);
    return result;
  } catch (liveError) {
    const cached = getCached(requestUrl);
    if (cached) return { ...snapshotSeries(cached), liveError: liveError.message, cache: true };
    const snapshot = await getSnapshot(caseId, requestUrl);
    if (snapshot) return { ...snapshotSeries(snapshot), liveError: liveError.message };
    throw new Error(`${liveError.message} No saved NASA response exists for this exact location, variable, and request window.`);
  }
}

function number(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

function pValue(value) {
  if (!Number.isFinite(value)) return '—';
  return value < 0.00001 ? '< 0.00001' : value.toFixed(5);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function annualSeries(series, request) {
  const anomalies = monthlyAnomalies(series.rows.map((row) => ({ ...row, value: row.value ?? -999 })));
  return aggregateSeason(anomalies, request.months)
    .filter((point) => point.year >= request.startYear && point.year <= request.endYear);
}

function renderChart(points, trend, name, unit, season) {
  const node = $('chart');
  if (!points.length) {
    node.replaceChildren(Object.assign(document.createElement('p'), { textContent: 'The selected period has no complete annual values.' }));
    $('data-table').replaceChildren();
    return;
  }
  const width = 920, height = 360;
  const margin = { top: 25, right: 30, bottom: 52, left: 72 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const x0 = points[0].year, x1 = points.at(-1).year;
  const meanX = points.reduce((s, p) => s + p.year, 0) / points.length;
  const meanY = points.reduce((s, p) => s + p.value, 0) / points.length;
  const fit = (year, slope) => meanY + slope * (year - meanX);
  const candidates = points.map((p) => p.value);
  if (Number.isFinite(trend.slope)) candidates.push(fit(x0, trend.slope), fit(x1, trend.slope));
  if (Number.isFinite(trend.ci95[0])) candidates.push(fit(x0, trend.ci95[0]), fit(x1, trend.ci95[0]), fit(x0, trend.ci95[1]), fit(x1, trend.ci95[1]));
  let y0 = Math.min(...candidates), y1 = Math.max(...candidates);
  const padding = (y1 - y0 || 1) * 0.12;
  y0 -= padding; y1 += padding;
  const x = (year) => margin.left + (x1 === x0 ? 0.5 : (year - x0) / (x1 - x0)) * plotW;
  const y = (value) => margin.top + (y1 - value) / (y1 - y0) * plotH;
  const pathFor = (slope) => `M ${x(x0)} ${y(fit(x0, slope))} L ${x(x1)} ${y(fit(x1, slope))}`;
  const grid = Array.from({ length: 5 }, (_, i) => {
    const value = y0 + (y1 - y0) * i / 4;
    return `<line class="chart-grid" x1="${margin.left}" x2="${width - margin.right}" y1="${y(value)}" y2="${y(value)}"/><text class="chart-axis" x="${margin.left - 10}" y="${y(value) + 3}" text-anchor="end">${value.toFixed(1)}</text>`;
  }).join('');
  const tickYears = [...new Set([x0, Math.round((x0 + x1) / 2), x1])];
  const ticks = tickYears.map((year) => `<text class="chart-axis" x="${x(year)}" y="${height - 18}" text-anchor="middle">${year}</text>`).join('');
  const seriesPath = points.map((point, index) => `${index ? 'L' : 'M'} ${x(point.year)} ${y(point.value)}`).join(' ');
  const band = Number.isFinite(trend.ci95[0])
    ? `<path class="confidence-band" d="M ${x(x0)} ${y(fit(x0, trend.ci95[0]))} L ${x(x1)} ${y(fit(x1, trend.ci95[0]))} L ${x(x1)} ${y(fit(x1, trend.ci95[1]))} L ${x(x0)} ${y(fit(x0, trend.ci95[1]))} Z"/>`
    : '';
  const fitLine = Number.isFinite(trend.slope)
    ? `<path class="trend-line" d="${pathFor(trend.slope)}"/><text class="chart-label" x="${width - margin.right}" y="${margin.top + 12}" text-anchor="end">OLS FIT · ${number(trend.slope * 10, 2)} ${unit}/DECADE</text>`
    : '';
  node.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="series-svg-title series-svg-desc"><title id="series-svg-title">${escapeHtml(name)} ${season} mean anomaly series</title><desc id="series-svg-desc">${points.length} ${season} yearly means${Number.isFinite(trend.slope) ? ' with a linear OLS estimate and slope confidence band' : ''}. Values are in ${unit}.</desc>${grid}${band}<path class="series-line" d="${seriesPath}"/>${fitLine}${ticks}</svg>`;
  $('data-table').replaceChildren(...points.map((point) => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${point.year}</td><td>${point.value.toFixed(4)}</td>`;
    return row;
  }));
}

function renderReceipt(result, request) {
  const info = VARIABLES[request.parameter];
  $('mode-badge').textContent = result.mode;
  $('mode-badge').className = `mode-badge ${result.mode === 'SNAPSHOT' ? 'snapshot' : ''}`;
  $('request-url').href = result.requestUrl;
  $('request-url').textContent = result.requestUrl;
  $('api-metadata').textContent = `${result.api.version || 'version not supplied'} · ${(result.sources || []).join(', ') || 'source not supplied'}`;
  $('fetched-at').textContent = result.fetchedAtUtc ? new Date(result.fetchedAtUtc).toISOString() : '—';
  $('counts').textContent = `${result.validCount} monthly values · ${result.missingCount} missing values dropped`;
  $('coverage').textContent = result.firstYear == null ? 'No valid values' : `${result.firstYear}–${result.lastYear}`;
  const metrics = receiptMetrics(result);
  $('mean-value').textContent = Number.isFinite(metrics.mean) ? `${number(metrics.mean, 4)} ${info.unit}` : '—';
  $('first-last').textContent = metrics.first && metrics.last
    ? `${metrics.first.year}-${String(metrics.first.month).padStart(2, '0')}: ${number(metrics.first.value, 4)} · ${metrics.last.year}-${String(metrics.last.month).padStart(2, '0')}: ${number(metrics.last.value, 4)} ${info.unit}`
    : '—';
  $('provenance').textContent = `${info.unit} (NASA API: ${result.metadata.units || 'unit not supplied'}) · ${info.mission}`;
  $('fallback-note').hidden = !result.liveError;
  if (result.liveError) {
    $('fallback-note').textContent = `${result.cache ? 'Cached NASA response' : 'Shipped NASA case snapshot'} used after the live request failed: ${result.liveError}`;
  }
}

function renderFinding(points, request, result) {
  const info = VARIABLES[request.parameter];
  const site = selectedSiteName(request);
  const ols = olsTrend(points);
  const mk = mannKendall(points);
  const validStats = Number.isFinite(mk.p);
  const significant = validStats && mk.p < 0.05;
  const direction = mk.tau > 0 ? 'increasing' : mk.tau < 0 ? 'decreasing' : 'no clear trend';
  let verdict = validStats
    ? `${direction[0].toUpperCase()}${direction.slice(1)} ${info.name.toLowerCase()} at ${site}: the OLS estimate is ${number(ols.slopePerDecade, 3)} ${info.unit} per decade; Mann–Kendall ${significant ? 'detects' : 'does not detect'} a trend at the 95% level.`
    : `Insufficient data at ${site}: fewer than eight complete annual values are available for the significance test.`;
  if (points.length < 15) verdict += ' The record is short; a longer record may clarify the signal.';
  else if (!significant && validStats) verdict += ' A non-significant result is not proof of no change; variability or record length may limit evidence.';
  $('verdict').textContent = verdict;
  $('result-variable').textContent = `${info.name} (${request.parameter})`;
  $('result-where').textContent = site;
  $('result-rate').textContent = Number.isFinite(ols.slopePerDecade) ? `${number(ols.slopePerDecade, 3)} ${info.unit}/decade` : 'Insufficient data';
  $('result-ci').textContent = Number.isFinite(ols.ci95[0]) ? `${number(ols.ci95[0] * 10, 3)} to ${number(ols.ci95[1] * 10, 3)} ${info.unit}/decade` : 'Insufficient data';
  $('result-sen').textContent = Number.isFinite(mk.sen.slope) ? `${number(mk.sen.slope * 10, 3)} [${number(mk.sen.ci95[0] * 10, 3)}, ${number(mk.sen.ci95[1] * 10, 3)}] ${info.unit}/decade` : 'Insufficient data';
  $('result-significance').textContent = validStats ? `${significant ? 'Significant' : 'Not significant'} · ${points.length} years` : 'Insufficient data';
  $('result-p').textContent = validStats ? `MK ${pValue(mk.p)} · OLS t-test ${pValue(ols.p)}` : '—';
  $('result-number').textContent = result.mode === 'SNAPSHOT' ? 'SAVED CASE' : 'LIVE REQUEST';
  const seasonNames = { annual: 'annual', mam: 'MAM', jjas: 'JJAS', djf: 'DJF', custom: 'custom-month' };
  const seasonLabel = request.season === 'custom' ? `${seasonNames.custom} ${request.months.join(',')}` : seasonNames[request.season];
  $('figure-label').textContent = `FIG. 1 · ${seasonLabel.toUpperCase()} MEAN ANOMALY`;
  $('chart').setAttribute('aria-label', `${seasonLabel} NASA POWER anomaly series with linear trend line`);
  renderChart(points, ols, `${info.name} at ${site}`, info.unit, seasonLabel);
  lastInvestigation = { points, request, result, ols, mk, site };
  $('compare-result').hidden = true;
  $('compare-notice').textContent = 'Choose a second region to compare its NASA series with this case.';
  $('export-csv').disabled = points.length === 0;
  $('export-png').disabled = points.length === 0;
  $('chart-caption').textContent = `${points.length} ${seasonLabel} means, formed after subtracting calendar-month averages over ${result.firstYear}–${result.lastYear}. Shaded area uses the OLS slope interval. The lag-1 correction ${mk.adjusted ? 'changed the variance' : 'left the variance unchanged'} (ρ₁ = ${number(mk.rho1, 2)}); it ${mk.adjustmentChangedConclusion ? 'changed' : 'did not change'} the 95% verdict.`;
}

async function investigate(event) {
  event?.preventDefault();
  const id = ++requestNumber;
  let request;
  try { request = currentRequest(); }
  catch (error) { setNotice(error.message, 'error'); return false; }
  setNotice('Requesting the monthly NASA POWER record…');
  $('case-number').textContent = `No. ${String(id).padStart(3, '0')}`;
  try {
    const caseId = $('case-select').value;
    const result = await getSeries(request, caseId);
    if (id !== requestNumber) return;
    if (!result.validCount) throw new Error('NASA POWER returned no valid values for this point. The point may be over ocean or outside this variable’s coverage.');
    const points = annualSeries(result, request);
    renderReceipt(result, request);
    renderFinding(points, request, result);
    setNotice(`${result.mode === 'LIVE' ? 'Live NASA POWER response received.' : 'Using a dated NASA POWER snapshot.'} ${result.validCount} valid monthly values; ${points.length} complete annual values in the selected window.`, 'success');
    const hash = new URLSearchParams({ lat: request.latitude, lon: request.longitude, variable: request.parameter, from: request.startYear, to: request.endYear, season: request.season, months: request.season === 'custom' ? request.months.join(',') : '' });
    history.replaceState(null, '', `#${hash.toString()}`);
    $('share-url').value = location.href;
    return true;
  } catch (error) {
    if (id !== requestNumber) return;
    setNotice(`Investigation unavailable. ${error.message}`, 'error');
    $('verdict').textContent = 'No NASA data are available for this request. The app has not substituted other values.';
    lastInvestigation = null;
    return false;
  }
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCsv() {
  if (!lastInvestigation) return;
  const { points, request, result, ols, mk, site } = lastInvestigation;
  const info = VARIABLES[request.parameter];
  const rows = [
    ['NASA POWER investigation'],
    ['Request URL', result.requestUrl],
    ['Mode', result.mode],
    ['Fetched at UTC', result.fetchedAtUtc || ''],
    ['Location', site],
    ['Coordinates', `${request.latitude}, ${request.longitude}`],
    ['Variable', `${request.parameter} (${info.name})`],
    ['Unit', info.unit],
    ['Season months', request.months.join(',')],
    ['Analysis years', `${request.startYear}-${request.endYear}`],
    ['OLS rate per decade', Number.isFinite(ols.slopePerDecade) ? ols.slopePerDecade : 'insufficient data'],
    ['OLS 95% CI per decade', ols.ci95.map((value) => Number.isFinite(value) ? value * 10 : '').join(' to ')],
    ['OLS t-test p-value', Number.isFinite(ols.p) ? ols.p : 'insufficient data'],
    ['OLS R-squared', Number.isFinite(ols.rSquared) ? ols.rSquared : 'insufficient data'],
    ['Mann-Kendall p-value', Number.isFinite(mk.p) ? mk.p : 'insufficient data'],
    ['Mann-Kendall lag-1 adjusted', mk.adjusted],
    ['Mann-Kendall adjustment changed verdict', mk.adjustmentChangedConclusion],
    [],
    ['Year', `Deseasonalized anomaly (${info.unit})`],
    ...points.map((point) => [point.year, point.value]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  downloadBlob(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), `trend-detective-${request.parameter}-${request.startYear}-${request.endYear}.csv`);
  $('export-status').textContent = 'CSV saved with the plotted series and calculated statistics.';
}

async function exportPng() {
  const svg = $('chart').querySelector('svg');
  if (!svg || !lastInvestigation) return;
  const source = new XMLSerializer().serializeToString(svg);
  const image = new Image();
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 1840; canvas.height = 720;
    const context = canvas.getContext('2d');
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The browser could not encode a PNG.');
    const { request } = lastInvestigation;
    downloadBlob(blob, `trend-detective-${request.parameter}-${request.startYear}-${request.endYear}.png`);
    $('export-status').textContent = 'PNG chart saved.';
  } catch (error) {
    $('export-status').textContent = `Chart export failed: ${error.message}`;
  } finally { URL.revokeObjectURL(url); }
}

async function compareRegions() {
  if (!lastInvestigation) {
    $('compare-notice').textContent = 'Run a NASA investigation first.';
    return;
  }
  const caseId = $('compare-case').value;
  const place = CASES[caseId];
  const request = { ...lastInvestigation.request, latitude: place.latitude, longitude: place.longitude };
  $('compare-notice').textContent = `Requesting ${place.name} from NASA POWER…`;
  try {
    const result = await getSeries(request, caseId);
    if (!result.validCount) throw new Error('No valid monthly values for the comparison point.');
    const points = annualSeries(result, request);
    const ols = olsTrend(points), mk = mannKendall(points);
    if (!points.length) throw new Error('No complete annual values in the selected window.');
    const primary = lastInvestigation;
    const slopes = [primary.ols.slopePerDecade, ols.slopePerDecade];
    const opposite = Number.isFinite(slopes[0]) && Number.isFinite(slopes[1]) && slopes[0] * slopes[1] < 0;
    const bothSignificant = primary.mk.p < 0.05 && mk.p < 0.05;
    $('compare-verdict').textContent = opposite
      ? `The estimated slopes have opposite signs. ${bothSignificant ? 'Both Mann–Kendall tests are significant at 95%.' : 'At least one Mann–Kendall test is not significant, so the sign difference is not evidence of two established trends.'}`
      : `The estimated slopes point in the same direction${bothSignificant ? ', and both Mann–Kendall tests are significant at 95%' : '; at least one Mann–Kendall test is not significant'}.`;
    const values = slopes.filter(Number.isFinite);
    let low = Math.min(0, ...values), high = Math.max(0, ...values);
    const pad = (high - low || 1) * 0.18; low -= pad; high += pad;
    const x = (value) => 370 + (value - low) / (high - low) * 280;
    const rows = [
      { name: primary.site, slope: primary.ols.slopePerDecade, ci: primary.ols.ci95.map((value) => value * 10), p: primary.mk.p },
      { name: place.name, slope: ols.slopePerDecade, ci: ols.ci95.map((value) => value * 10), p: mk.p },
    ];
    $('compare-chart').innerHTML = `<svg viewBox="0 0 700 128" role="img" aria-label="OLS slope comparison per decade; vertical line marks zero"><line class="compare-zero" x1="${x(0)}" x2="${x(0)}" y1="12" y2="116"/><text class="chart-axis" x="${x(0)}" y="10" text-anchor="middle">0</text>${rows.map((row, index) => `<text class="chart-axis" x="0" y="${43 + index * 52}">${escapeHtml(row.name)}</text><line class="compare-interval" x1="${x(row.ci[0])}" x2="${x(row.ci[1])}" y1="${38 + index * 52}" y2="${38 + index * 52}"/><circle class="compare-point" cx="${x(row.slope)}" cy="${38 + index * 52}" r="5"/><text class="chart-axis" x="665" y="${42 + index * 52}" text-anchor="end">${number(row.slope, 2)}</text>`).join('')}</svg>`;
    $('compare-rows').replaceChildren(...rows.map((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escapeHtml(row.name)}</td><td>${number(row.slope, 3)}</td><td>${row.ci.map((value) => number(value, 3)).join(' to ')}</td><td>${pValue(row.p)}</td>`;
      return tr;
    }));
    $('compare-receipts').innerHTML = `Comparison request: <a href="${escapeHtml(result.requestUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(result.requestUrl)}</a> · ${result.mode}${result.fetchedAtUtc ? ` · ${new Date(result.fetchedAtUtc).toISOString()}` : ''}`;
    $('compare-result').hidden = false;
    $('compare-notice').textContent = `${place.name} comparison loaded with ${points.length} complete annual values.`;
  } catch (error) {
    $('compare-notice').textContent = `Comparison unavailable: ${error.message}`;
  }
}

async function startDemo(caseId) {
  const site = CASES[caseId];
  $('case-select').value = caseId;
  $('latitude').value = site.latitude;
  $('longitude').value = site.longitude;
  $('parameter').value = site.parameter;
  $('season').value = 'annual';
  $('custom-months-field').hidden = true;
  $('custom-months-help').hidden = true;
  $('start-year').value = FIRST_DATA_YEAR;
  $('end-year').value = LAST_DATA_YEAR;
  syncYearControls();
  selectedPlaceName = site.name;
  updateDefinition();
  updateMarker(site.latitude, site.longitude, true);
  activeDemo = caseId;
  demoStep = 0;
  $('demo-step').textContent = 'Loading the real NASA POWER case…';
  $('demo-next').hidden = true;
  if (!await investigate()) return;
  $('demo-step').textContent = `Step 1 of 3 · ${DEMO_STEPS[0]}`;
  $('demo-next').hidden = false;
}

function nextDemoStep() {
  if (!activeDemo || !lastInvestigation) return;
  demoStep += 1;
  if (demoStep === 1) $('demo-step').textContent = `Step 2 of 3 · ${DEMO_STEPS[1]}`;
  else {
    $('demo-step').textContent = `Step 3 of 3 · Finding from NASA POWER: ${$('verdict').textContent}`;
    $('demo-next').hidden = true;
  }
}

function updateMarker(latitude, longitude, recenter = false) {
  if (!map || !window.L) return;
  if (!marker) marker = window.L.circleMarker([latitude, longitude], {
    radius: 6, weight: 2, color: '#1b1a17', fillColor: '#b23a2b', fillOpacity: 1,
  }).addTo(map);
  else marker.setLatLng([latitude, longitude]);
  if (recenter) map.setView([latitude, longitude], Math.max(map.getZoom(), 4));
}

function initializeMap() {
  if (!window.L) {
    $('map-caption').textContent = 'The map library did not load. Enter coordinates or search for a place above.';
    return;
  }
  map = window.L.map('investigation-map', { scrollWheelZoom: false, worldCopyJump: true }).setView([18, 0], 2);
  window.investigationMap = map;
  window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd', maxZoom: 19,
  }).addTo(map);
  updateMarker(Number($('latitude').value), Number($('longitude').value));
  map.on('click', (event) => {
    const latitude = Number(event.latlng.lat.toFixed(3));
    const longitude = Number(event.latlng.lng.toFixed(3));
    $('latitude').value = latitude;
    $('longitude').value = longitude;
    $('case-select').value = 'custom';
    selectedPlaceName = '';
    updateMarker(latitude, longitude);
    investigate();
  });
}

function showPlaceResults(results) {
  const container = $('place-results');
  container.replaceChildren();
  container.hidden = results.length === 0;
  for (const place of results) {
    const label = [place.name, place.admin1, place.country].filter(Boolean).join(', ');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'place-result';
    button.setAttribute('role', 'option');
    button.textContent = `${label} · ${Number(place.latitude).toFixed(3)}°, ${Number(place.longitude).toFixed(3)}°`;
    button.addEventListener('click', () => {
      $('latitude').value = Number(place.latitude).toFixed(3);
      $('longitude').value = Number(place.longitude).toFixed(3);
      $('case-select').value = 'custom';
      selectedPlaceName = label;
      container.hidden = true;
      updateMarker(Number(place.latitude), Number(place.longitude), true);
      $('geocoder-status').textContent = `Selected ${label}.`;
      investigate();
    });
    container.append(button);
  }
}

async function searchPlace() {
  const name = $('place-query').value.trim();
  if (name.length < 2) {
    $('geocoder-status').textContent = 'Enter at least two letters to search.';
    return;
  }
  $('geocoder-status').textContent = 'Searching Open-Meteo geocoding…';
  try {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.search = new URLSearchParams({ name, count: '6', language: 'en', format: 'json' });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Geocoder returned HTTP ${response.status}.`);
    const data = await response.json();
    const results = (data.results || []).filter((place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude));
    showPlaceResults(results);
    $('geocoder-status').textContent = results.length ? `${results.length} place matches. Choose one to set the map point.` : 'No place matches. Try a nearby city or region name.';
  } catch (error) {
    $('place-results').hidden = true;
    $('geocoder-status').textContent = `Place search is unavailable: ${error.message} You can still enter coordinates or click the map.`;
  }
}

function bindQuestionsAndSeasons() {
  document.querySelectorAll('[data-focus]').forEach((button) => button.addEventListener('click', () => {
    const parameter = FOCUS_VARIABLES[button.dataset.focus];
    $('parameter').value = parameter;
    document.querySelectorAll('[data-focus]').forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
    updateDefinition();
  }));
  $('season').addEventListener('change', () => {
    const custom = $('season').value === 'custom';
    $('custom-months-field').hidden = !custom;
    $('custom-months-help').hidden = !custom;
  });
  $('place-search-button').addEventListener('click', searchPlace);
  $('place-query').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); searchPlace(); }
  });
  for (const id of ['latitude', 'longitude']) $(id).addEventListener('input', () => {
    $('case-select').value = 'custom';
    selectedPlaceName = '';
    updateMarker(Number($('latitude').value), Number($('longitude').value));
  });
}

function bindTheme() {
  const root = document.documentElement;
  const button = $('theme-toggle');
  const stored = localStorage.getItem('trend-theme');
  if (stored) root.dataset.theme = stored;
  const sync = () => {
    const dark = root.dataset.theme === 'dark' || (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    button.textContent = dark ? 'LIGHT MODE' : 'DARK MODE';
    button.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
    button.setAttribute('aria-pressed', String(dark));
  };
  button.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('trend-theme', root.dataset.theme);
    sync();
  });
  sync();
}

fillVariables();
for (const id of ['start-year', 'end-year']) $(id).max = LAST_DATA_YEAR;
for (const id of ['start-range', 'end-range']) $(id).max = LAST_DATA_YEAR;
$('end-year').value = LAST_DATA_YEAR;
function syncYearControls(changed) {
  const start = $('start-year');
  const end = $('end-year');
  if (Number(start.value) > Number(end.value)) {
    if (changed === 'start-year' || changed === 'start-range') end.value = start.value;
    else start.value = end.value;
  }
  $('start-range').value = start.value;
  $('end-range').value = end.value;
  $('start-year-output').value = start.value;
  $('end-year-output').value = end.value;
}
for (const id of ['start-year', 'end-year']) $(id).addEventListener('input', () => syncYearControls(id));
for (const [rangeId, yearId] of [['start-range', 'start-year'], ['end-range', 'end-year']]) {
  $(rangeId).addEventListener('input', () => {
    $(yearId).value = $(rangeId).value;
    syncYearControls(rangeId);
  });
}
syncYearControls();
updateDefinition();
$('parameter').addEventListener('change', updateDefinition);
$('case-select').addEventListener('change', (event) => {
  const site = CASES[event.target.value];
  if (!site) return;
  $('latitude').value = site.latitude;
  $('longitude').value = site.longitude;
  $('parameter').value = site.parameter;
  selectedPlaceName = site.name;
  updateDefinition();
  updateMarker(site.latitude, site.longitude, true);
  investigate();
});
$('investigation-form').addEventListener('submit', investigate);
bindQuestionsAndSeasons();
initializeMap();
bindTheme();
$('run-compare').addEventListener('click', compareRegions);
$('export-csv').addEventListener('click', exportCsv);
$('export-png').addEventListener('click', exportPng);
$('export-csv').disabled = true;
$('export-png').disabled = true;
document.querySelectorAll('[data-demo-case]').forEach((button) => button.addEventListener('click', () => startDemo(button.dataset.demoCase)));
$('demo-next').addEventListener('click', nextDemoStep);
$('copy-share').addEventListener('click', async () => {
  const link = $('share-url').value;
  if (!link) { $('export-status').textContent = 'Run an investigation to create a shareable link.'; return; }
  try {
    await navigator.clipboard.writeText(link);
    $('export-status').textContent = 'Shareable case link copied.';
  } catch {
    $('share-url').focus(); $('share-url').select();
    $('export-status').textContent = 'Select and copy the shareable case link.';
  }
});

const shared = new URLSearchParams(location.hash.slice(1));
if (shared.has('lat') && shared.has('lon')) {
  $('case-select').value = 'custom';
  $('latitude').value = shared.get('lat');
  $('longitude').value = shared.get('lon');
  if (VARIABLES[shared.get('variable')]) $('parameter').value = shared.get('variable');
  if (/^\d{4}$/.test(shared.get('from') || '')) $('start-year').value = shared.get('from');
  if (/^\d{4}$/.test(shared.get('to') || '')) $('end-year').value = shared.get('to');
  if (SEASONS[shared.get('season')]) $('season').value = shared.get('season');
  if (shared.get('season') === 'custom') {
    $('season').value = 'custom';
    $('custom-months').value = shared.get('months') || '';
    $('custom-months-field').hidden = false;
    $('custom-months-help').hidden = false;
  }
  selectedPlaceName = '';
  updateDefinition();
  updateMarker(Number($('latitude').value), Number($('longitude').value), true);
}
syncYearControls();
investigate();
