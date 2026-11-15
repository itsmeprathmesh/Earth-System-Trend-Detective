export const POWER_API = 'https://power.larc.nasa.gov/api/temporal/monthly/point';

export const VARIABLES = {
  T2M: { name: 'Near-surface air temperature', unit: '°C', definition: 'Monthly air temperature at about 2 metres above the surface.', care: 'Tracks heat exposure and long-term warming in the lower atmosphere.', mission: 'MERRA-2 atmospheric reanalysis' },
  T2M_MAX: { name: 'Daily maximum air temperature', unit: '°C', definition: 'Monthly average of daily maximum air temperature at 2 metres.', care: 'Helps describe changes in hot-day conditions and heat stress.', mission: 'MERRA-2 atmospheric reanalysis' },
  T2M_MIN: { name: 'Daily minimum air temperature', unit: '°C', definition: 'Monthly average of daily minimum air temperature at 2 metres.', care: 'Shows how overnight temperatures and cold extremes are changing.', mission: 'MERRA-2 atmospheric reanalysis' },
  PRECTOTCORR: { name: 'Corrected precipitation', unit: 'mm/day', definition: 'Bias-corrected precipitation rate averaged over the month.', care: 'Helps examine changing water availability and rainfall patterns.', mission: 'MERRA-2 atmospheric reanalysis' },
  RH2M: { name: 'Relative humidity', unit: '%', definition: 'Monthly mean relative humidity at 2 metres.', care: 'Influences heat stress, evaporation, and ecosystem water demand.', mission: 'MERRA-2 atmospheric reanalysis' },
  WS10M: { name: 'Wind speed', unit: 'm/s', definition: 'Monthly mean wind speed at 10 metres above the surface.', care: 'Matters for ventilation, wind energy, and transport of heat and moisture.', mission: 'MERRA-2 atmospheric reanalysis' },
  ALLSKY_SFC_SW_DWN: { name: 'Surface sunlight', unit: 'kW-hr/m²/day', definition: 'Downward shortwave solar energy at the surface under all-sky conditions.', care: 'Describes the solar energy available to land, water, and solar systems.', mission: 'NASA GEWEX SRB and CERES satellite radiation products' },
  PS: { name: 'Surface air pressure', unit: 'kPa', definition: 'Monthly mean atmospheric pressure at the surface.', care: 'Useful for studying circulation patterns and high-altitude conditions.', mission: 'MERRA-2 atmospheric reanalysis' },
  QV2M: { name: 'Specific humidity', unit: 'g/kg', definition: 'Monthly mean mass of water vapour per mass of air near 2 metres.', care: 'Tracks atmospheric moisture that affects clouds, rainfall, and heat.', mission: 'MERRA-2 atmospheric reanalysis' },
  EVLAND: { name: 'Land evaporation', unit: 'mm/day', definition: 'Monthly mean evaporation from land surfaces.', care: 'Connects soil water, plant activity, and atmospheric moisture.', mission: 'MERRA-2 land-surface reanalysis' },
  GWETROOT: { name: 'Root-zone soil wetness', unit: 'fraction', definition: 'Modelled root-zone soil moisture as a fraction of available water.', care: 'Indicates water stress affecting vegetation and agriculture.', mission: 'MERRA-2 land-surface reanalysis' },
  GWETTOP: { name: 'Top-layer soil wetness', unit: 'fraction', definition: 'Modelled near-surface soil moisture as a fraction of available water.', care: 'Responds quickly to rainfall and surface drying.', mission: 'MERRA-2 land-surface reanalysis' },
};

export const NASA_SOURCE_LABEL = 'NASA POWER, derived from satellite observations and MERRA-2/GEOS reanalysis';

export function makePowerUrl({ parameter, latitude, longitude, startYear = 1981, endYear = new Date().getUTCFullYear() - 1 }) {
  if (!VARIABLES[parameter]) throw new RangeError(`Unsupported NASA POWER parameter: ${parameter}`);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RangeError('Coordinates must be valid latitude and longitude values.');
  }
  const query = new URLSearchParams({
    parameters: parameter,
    community: 'RE',
    longitude: String(longitude),
    latitude: String(latitude),
    start: String(startYear),
    end: String(endYear),
    format: 'JSON',
  });
  return `${POWER_API}?${query.toString()}`;
}

export function parsePowerResponse(response) {
  const params = response?.properties?.parameter;
  const parameter = Object.keys(params || {})[0];
  if (!parameter || !VARIABLES[parameter]) throw new Error('NASA POWER response has no supported parameter values.');
  const values = params[parameter];
  const rows = Object.entries(values)
    .filter(([key]) => /^\d{4}(0[1-9]|1[0-2])$/.test(key))
    .map(([key, raw]) => {
      const value = Number(raw);
      return { year: Number(key.slice(0, 4)), month: Number(key.slice(4, 6)), value: value === -999 || !Number.isFinite(value) ? null : value };
    })
    .sort((a, b) => a.year - b.year || a.month - b.month);
  const valid = rows.filter((row) => row.value !== null);
  return {
    parameter,
    rows,
    metadata: response.parameters?.[parameter] || {},
    api: response.header?.api || {},
    sources: response.header?.sources || [],
    coordinates: response.geometry?.coordinates || [],
    validCount: valid.length,
    missingCount: rows.length - valid.length,
    firstYear: valid[0]?.year ?? null,
    lastYear: valid.at(-1)?.year ?? null,
  };
}

export function receiptMetrics(series) {
  const validRows = series.rows.filter((row) => row.value !== null && Number.isFinite(row.value));
  const mean = validRows.length ? validRows.reduce((sum, row) => sum + row.value, 0) / validRows.length : NaN;
  return {
    validCount: validRows.length,
    missingCount: series.rows.length - validRows.length,
    mean,
    first: validRows[0] || null,
    last: validRows.at(-1) || null,
    firstYear: validRows[0]?.year ?? null,
    lastYear: validRows.at(-1)?.year ?? null,
  };
}

export async function fetchPowerSeries(request, fetcher = fetch) {
  const requestUrl = makePowerUrl(request);
  const response = await fetcher(requestUrl, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`NASA POWER returned HTTP ${response.status}.`);
  const body = await response.json();
  return { ...parsePowerResponse(body), requestUrl, fetchedAtUtc: new Date().toISOString(), mode: 'LIVE', rawResponse: body };
}

export function snapshotSeries(snapshot) {
  const parsed = parsePowerResponse(snapshot.response);
  return { ...parsed, requestUrl: snapshot.requestUrl, fetchedAtUtc: snapshot.fetchedAtUtc, mode: 'SNAPSHOT', rawResponse: snapshot.response };
}

export async function loadPowerSeries(request, snapshot, fetcher = fetch) {
  try {
    return await fetchPowerSeries(request, fetcher);
  } catch (error) {
    if (!snapshot || snapshot.requestUrl !== makePowerUrl(request)) throw error;
    return { ...snapshotSeries(snapshot), liveError: error.message };
  }
}
