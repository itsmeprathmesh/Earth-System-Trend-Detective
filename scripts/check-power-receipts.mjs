import { readFile } from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePowerResponse, receiptMetrics, snapshotSeries } from '../src/data/power.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const options = [
  ['sahara', 'T2M'], ['amazon', 'PRECTOTCORR'], ['arctic', 'T2M'], ['himalaya', 'T2M_MAX'],
  ['megacity', 'T2M'], ['estuary', 'PRECTOTCORR'], ['nagpur', 'T2M'], ['central-us', 'PRECTOTCORR'],
];
const chosen = [];
while (chosen.length < 3) {
  const candidate = options[randomInt(options.length)];
  if (!chosen.some(([id]) => id === candidate[0])) chosen.push(candidate);
}

for (const [id, parameter] of chosen) {
  const file = JSON.parse(await readFile(resolve(root, `public/data/snapshots/${id}.json`), 'utf8'));
  if (file.case.parameter !== parameter) throw new Error(`${id}: selected variable does not match its case snapshot.`);
  const displayedMetrics = receiptMetrics(snapshotSeries(file));
  const response = await fetch(file.requestUrl, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (!response.ok) throw new Error(`${id}: fresh NASA request returned HTTP ${response.status}.`);
  const freshMetrics = receiptMetrics(parsePowerResponse(await response.json()));
  const sameValue = (a, b) => (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) < 0.00005;
  const match = displayedMetrics.validCount === freshMetrics.validCount
    && displayedMetrics.missingCount === freshMetrics.missingCount
    && sameValue(displayedMetrics.mean, freshMetrics.mean)
    && displayedMetrics.first?.year === freshMetrics.first?.year
    && displayedMetrics.first?.month === freshMetrics.first?.month
    && sameValue(displayedMetrics.first?.value, freshMetrics.first?.value)
    && displayedMetrics.last?.year === freshMetrics.last?.year
    && displayedMetrics.last?.month === freshMetrics.last?.month
    && sameValue(displayedMetrics.last?.value, freshMetrics.last?.value);
  console.log(`${match ? 'PASS' : 'FAIL'} ${id}/${parameter}: mean ${displayedMetrics.mean.toFixed(4)} vs fresh ${freshMetrics.mean.toFixed(4)}; first ${displayedMetrics.first?.year}-${displayedMetrics.first?.month} ${displayedMetrics.first?.value}; last ${displayedMetrics.last?.year}-${displayedMetrics.last?.month} ${displayedMetrics.last?.value}; values ${displayedMetrics.validCount}/${displayedMetrics.missingCount} missing`);
  if (!match) process.exitCode = 1;
}
