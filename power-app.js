const POWER_ENDPOINT = 'https://power.larc.nasa.gov/api/temporal/monthly/point';
const START_YEAR = 1990;
const END_YEAR = new Date().getUTCFullYear() - 1;
const VARIABLES = {
  T2M: { name: 'Air temperature', unit: '°C' },
  PRECTOTCORR: { name: 'Precipitation', unit: 'mm/day' },
  RH2M: { name: 'Relative humidity', unit: '%' },
  WS10M: { name: 'Wind speed', unit: 'm/s' },
  ALLSKY_SFC_SW_DWN: { name: 'Surface sunlight', unit: 'kWh/m²/day' },
};
const SEASONS = {
  annual: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  mam: [3, 4, 5],
  jjas: [6, 7, 8, 9],
  djf: [12, 1, 2],
};
const INTERESTS = {
  heat: 'T2M', rain: 'PRECTOTCORR', humidity: 'RH2M', wind: 'WS10M', sunlight: 'ALLSKY_SFC_SW_DWN',
};
const REGIONS = {
  desert: { name: 'Sahara', type: 'Desert', latitude: 23.416, longitude: 31.131, variable: 'T2M', context: 'Air temperature is a regional climate measure, not a reading of the local desert surface.' },
  rainforest: { name: 'Amazon basin', type: 'Rain forest', latitude: -3.465, longitude: -62.215, variable: 'PRECTOTCORR', context: 'Rainfall can frame a climate question; it does not measure forest cover or canopy health.' },
  estuary: { name: 'Ganges-Brahmaputra delta', type: 'Tidal estuary', latitude: 22.303, longitude: 90.226, variable: 'PRECTOTCORR', context: 'Precipitation is regional climate context, not a tide, water-level, or flood measurement.' },
  city: { name: 'Delhi', type: 'Large city atmosphere', latitude: 28.614, longitude: 77.209, variable: 'T2M', context: 'Gridded air temperature does not isolate a city’s urban-heat effect.' },
  polar: { name: 'Arctic', type: 'Polar region', latitude: 78.223, longitude: 15.647, variable: 'T2M', context: 'This is a gridded atmospheric estimate, not a local polar weather-station record.' },
  nagpur: { name: 'Nagpur', type: 'Home city', latitude: 21.145, longitude: 79.088, variable: 'T2M', context: 'The point represents a NASA grid estimate near Nagpur, not a city sensor.' },
};
const DEMOS = {
  sahara: { region: 'desert', interest: 'heat', question: 'What does the long air-temperature record show at a desert point?' },
  amazon: { region: 'rainforest', interest: 'rain', question: 'How has monthly precipitation varied over a rain forest?' },
  arctic: { region: 'polar', interest: 'heat', question: 'What does the same temperature measure show at high latitude?' },
};
const form = document.getElementById('investigation-form');
const status = document.getElementById('status');
let chart;
let currentDemo = null;
let walkthroughStep = 0;
let lastSeries = null;

function updateGuideSuggestion() {
  const region = REGIONS[document.getElementById('region-type').value];
  const variableCode = INTERESTS[document.getElementById('interest').value] || region.variable;
  const variable = VARIABLES[variableCode];
  document.getElementById('guide-suggestion').textContent = `${region.type} · ${region.name} point · ${variable.name}. ${region.context} The suggestion does not predict the trend.`;
}

function applyGuide({ run = true } = {}) {
  const region = REGIONS[document.getElementById('region-type').value];
  const variableCode = INTERESTS[document.getElementById('interest').value] || region.variable;
  form.elements.latitude.value = region.latitude;
  form.elements.longitude.value = region.longitude;
  form.elements.variable.value = variableCode;
  document.getElementById('guide-suggestion').textContent = `${region.type} · ${region.name} point · ${VARIABLES[variableCode].name}. ${region.context} The suggestion does not assume a trend.`;
  if (run) return runInvestigation({ preventDefault() {} });
  return true;
}

async function startDemo(id) {
  const demo = DEMOS[id];
  if (!demo) return;
  currentDemo = demo;
  walkthroughStep = 0;
  document.getElementById('region-type').value = demo.region;
  document.getElementById('interest').value = demo.interest;
  updateGuideSuggestion();
  document.getElementById('walkthrough-text').textContent = `Loading live NASA POWER data for this question: ${demo.question}`;
  document.getElementById('walkthrough-next').hidden = true;
  const completed = await applyGuide();
  if (!completed) {
    document.getElementById('walkthrough-text').textContent = `This live case could not load. ${status.textContent}`;
    return;
  }
  document.getElementById('walkthrough-text').textContent = `Step 1 of 3 · NASA POWER returned live monthly data for ${REGIONS[demo.region].name}. The chart shows ${lastSeries.labels.length} yearly values.`;
  document.getElementById('walkthrough-next').hidden = false;
}

function nextWalkthroughStep() {
  if (!currentDemo || !lastSeries) return;
  walkthroughStep += 1;
  if (walkthroughStep === 1) {
    document.getElementById('walkthrough-text').textContent = 'Step 2 of 3 · Month 13 (NASA’s annual summary key) was ignored, and missing -999 monthly values were dropped before yearly averaging.';
  } else {
    const { start, end } = lastSeries;
    document.getElementById('walkthrough-text').textContent = `Step 3 of 3 · You are looking at ${lastSeries.variableName} for ${lastSeries.season.toUpperCase()}, ${start}–${end}. This describes the measured record; it does not identify a cause.`;
    document.getElementById('walkthrough-next').hidden = true;
  }
}

function requestUrl(latitude, longitude, variable) {
  const query = new URLSearchParams({
    parameters: variable,
    community: 'AG',
    longitude: String(longitude),
    latitude: String(latitude),
    start: String(START_YEAR),
    end: String(END_YEAR),
    format: 'JSON',
  });
  return `${POWER_ENDPOINT}?${query}`;
}

function yearlyValues(parameter, season) {
  const selectedMonths = SEASONS[season];
  const buckets = new Map();
  let valuesUsed = 0;
  let missingDropped = 0;

  for (const [key, rawValue] of Object.entries(parameter)) {
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(4));
    if (month === 13 || month < 1 || month > 12) continue;
    if (!selectedMonths.includes(month)) continue;
    const value = Number(rawValue);
    if (value === -999 || !Number.isFinite(value)) {
      missingDropped += 1;
      continue;
    }
    const seasonYear = season === 'djf' && month === 12 ? year + 1 : year;
    const values = buckets.get(seasonYear) || [];
    values.push(value);
    buckets.set(seasonYear, values);
    valuesUsed += 1;
  }

  const labels = [];
  const data = [];
  for (const [year, values] of [...buckets].sort((a, b) => a[0] - b[0])) {
    if (year < START_YEAR || year > END_YEAR) continue;
    labels.push(year);
    data.push(values.reduce((sum, value) => sum + value, 0) / values.length);
  }
  return { labels, data, valuesUsed, missingDropped };
}

function showChart(labels, data, variable, season) {
  const info = VARIABLES[variable];
  const context = document.getElementById('series-chart').getContext('2d');
  if (chart) chart.destroy();
  chart = new Chart(context, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `${info.name} · ${season.toUpperCase()} (${info.unit})`,
        data,
        borderColor: '#8c392e',
        backgroundColor: '#8c392e',
        borderWidth: 2,
        pointRadius: 2,
        tension: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      scales: {
        x: { title: { display: true, text: 'Year' } },
        y: { title: { display: true, text: info.unit } },
      },
    },
  });
}

function ensureChart() {
  return window.chartReady || Promise.resolve(typeof Chart !== 'undefined');
}

async function runInvestigation(event) {
  event.preventDefault();
  if (event.target === form) {
    currentDemo = null;
    document.getElementById('walkthrough-next').hidden = true;
  }
  if (!await ensureChart() || typeof Chart === 'undefined') {
    status.className = 'error';
    status.textContent = 'Chart.js did not load. Check the connection and reload the page.';
    return;
  }
  const latitude = Number(form.elements.latitude.value);
  const longitude = Number(form.elements.longitude.value);
  const variable = form.elements.variable.value;
  const season = form.elements.season.value;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    status.className = 'error';
    status.textContent = 'Enter a valid latitude from −90 to 90 and longitude from −180 to 180.';
    return;
  }

  const url = requestUrl(latitude, longitude, variable);
  if (chart) { chart.destroy(); chart = null; }
  status.className = '';
  status.textContent = 'Requesting live monthly data from NASA POWER…';
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`NASA POWER returned HTTP ${response.status}.`);
    const payload = await response.json();
    const parameter = payload?.properties?.parameter?.[variable];
    if (!parameter || typeof parameter !== 'object') throw new Error('NASA POWER response did not contain the requested variable.');
    const result = yearlyValues(parameter, season);
    if (!result.data.length) throw new Error('NASA POWER returned no usable monthly values for this place and season.');
    showChart(result.labels, result.data, variable, season);
    lastSeries = { labels: result.labels, start: result.labels[0], end: result.labels.at(-1), variableName: VARIABLES[variable].name, season };
    status.textContent = `Live NASA POWER data · ${result.labels.length} yearly values from ${result.labels[0]} to ${result.labels.at(-1)}. ${result.valuesUsed} monthly values used; ${result.missingDropped} missing values dropped.`;
    return true;
  } catch (error) {
    status.className = 'error';
    status.textContent = `Live NASA POWER request failed. No substitute data were used. ${error.message}`;
    return false;
  }
}

document.getElementById('region-type').addEventListener('change', updateGuideSuggestion);
document.getElementById('interest').addEventListener('change', updateGuideSuggestion);
document.getElementById('apply-guide').addEventListener('click', () => applyGuide());
document.querySelectorAll('[data-place]').forEach((button) => button.addEventListener('click', async () => {
  document.getElementById('region-type').value = button.dataset.place;
  updateGuideSuggestion();
  await applyGuide();
}));
document.querySelectorAll('[data-demo]').forEach((button) => button.addEventListener('click', () => startDemo(button.dataset.demo)));
document.getElementById('walkthrough-next').addEventListener('click', nextWalkthroughStep);
updateGuideSuggestion();
form.addEventListener('submit', runInvestigation);
