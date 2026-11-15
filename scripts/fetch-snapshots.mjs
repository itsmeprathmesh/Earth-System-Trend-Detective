import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/data/snapshots');
const firstYear = 1981;
const lastYear = new Date().getUTCFullYear() - 1;
const cases = [
  { id: 'sahara', name: 'Sahara', latitude: 23.416, longitude: 31.131, parameter: 'T2M' },
  { id: 'amazon', name: 'Amazon basin', latitude: -3.465, longitude: -62.215, parameter: 'PRECTOTCORR' },
  { id: 'arctic', name: 'Arctic', latitude: 78.223, longitude: 15.647, parameter: 'T2M' },
  { id: 'himalaya', name: 'Himalayan highlands', latitude: 27.988, longitude: 86.925, parameter: 'T2M_MAX' },
  { id: 'megacity', name: 'Delhi', latitude: 28.614, longitude: 77.209, parameter: 'T2M' },
  { id: 'estuary', name: 'Ganges-Brahmaputra delta', latitude: 22.303, longitude: 90.226, parameter: 'PRECTOTCORR' },
  { id: 'nagpur', name: 'Nagpur', latitude: 21.145, longitude: 79.088, parameter: 'T2M' },
  { id: 'central-us', name: 'Central US plains', latitude: 39.099, longitude: -98.500, parameter: 'PRECTOTCORR' },
];

await mkdir(outDir, { recursive: true });
for (const site of cases) {
  const query = new URLSearchParams({
    parameters: site.parameter,
    community: 'RE',
    longitude: String(site.longitude),
    latitude: String(site.latitude),
    start: String(firstYear),
    end: String(lastYear),
    format: 'JSON',
  });
  const requestUrl = `https://power.larc.nasa.gov/api/temporal/monthly/point?${query}`;
  const result = await fetch(requestUrl, { headers: { Accept: 'application/json' } });
  if (!result.ok) throw new Error(`${site.id}: NASA POWER returned HTTP ${result.status}`);
  const response = await result.json();
  const snapshot = {
    format: 'NASA POWER raw response snapshot v1',
    case: { id: site.id, name: site.name, latitude: site.latitude, longitude: site.longitude, parameter: site.parameter },
    requestUrl,
    fetchedAtUtc: new Date().toISOString(),
    api: response?.header?.api ?? null,
    response,
  };
  await writeFile(resolve(outDir, `${site.id}.json`), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(`${site.id}: saved ${Object.keys(response?.properties?.parameter?.[site.parameter] || {}).length} raw time keys`);
  await new Promise((resolveWait) => setTimeout(resolveWait, 700));
}
