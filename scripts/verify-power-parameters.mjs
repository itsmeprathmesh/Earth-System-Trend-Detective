const parameters = ['T2M', 'T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'RH2M', 'WS10M', 'ALLSKY_SFC_SW_DWN', 'PS', 'QV2M', 'EVLAND', 'GWETROOT', 'GWETTOP'];
for (const parameter of parameters) {
  const query = new URLSearchParams({ parameters: parameter, community: 'RE', longitude: '0', latitude: '0', start: '2020', end: '2020', format: 'JSON' });
  const url = `https://power.larc.nasa.gov/api/temporal/monthly/point?${query}`;
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const data = await response.json();
    const accepted = response.ok && Boolean(data?.properties?.parameter?.[parameter]);
    const details = data?.parameters?.[parameter] || {};
    console.log(`${accepted ? 'AVAILABLE' : 'UNAVAILABLE'} ${parameter}${accepted ? ` · ${details.units || 'unit unspecified'} · ${data?.header?.sources?.join(', ') || 'source unspecified'}` : ` · ${data?.messages?.join('; ') || `HTTP ${response.status}`}`}`);
  } catch (error) {
    console.log(`UNAVAILABLE ${parameter} · ${error.message}`);
    process.exitCode = 1;
  }
}
