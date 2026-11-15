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
const form = document.getElementById('investigation-form');
const status = document.getElementById('status');
let chart;

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
  if (!await ensureChart()) {
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
    status.textContent = `Live NASA POWER data · ${result.labels.length} yearly values from ${result.labels[0]} to ${result.labels.at(-1)}. ${result.valuesUsed} monthly values used; ${result.missingDropped} missing values dropped.`;
  } catch (error) {
    status.className = 'error';
    status.textContent = `Live NASA POWER request failed. No substitute data were used. ${error.message}`;
  }
}

form.addEventListener('submit', runInvestigation);
