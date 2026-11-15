import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePowerResponse } from '../src/data/power.js';
import { aggregateSeason, mannKendall, monthlyAnomalies, olsTrend } from '../src/stats/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(root, process.argv[2] || 'public/data/snapshots/sahara.json');
const snapshot = JSON.parse(await readFile(source, 'utf8'));
const parsed = parsePowerResponse(snapshot.response);
const anomalies = monthlyAnomalies(parsed.rows.map((row) => ({ ...row, value: row.value ?? -999 })));
const series = aggregateSeason(anomalies).map(({ year, value }) => ({ year, value }));
console.log(JSON.stringify({
  source: snapshot.requestUrl,
  fetchedAtUtc: snapshot.fetchedAtUtc,
  annualValues: series.length,
  ols: olsTrend(series),
  mannKendall: mannKendall(series),
}, null, 2));
