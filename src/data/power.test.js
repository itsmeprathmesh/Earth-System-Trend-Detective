import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPowerSeries, makePowerUrl, parsePowerResponse, receiptMetrics, snapshotSeries } from './power.js';

const testFixture = {
  type: 'Feature',
  geometry: { coordinates: [31.131, 23.416, 241.87] },
  properties: {
    parameter: { T2M: { '202001': 10, '202002': -999, '202013': 8, '202101': 12 } },
  },
  header: { api: { version: 'test fixture version' }, sources: ['MERRA2'] },
  parameters: { T2M: { units: 'C', longname: 'Temperature at 2 Meters' } },
};

test('makePowerUrl encodes an auditable NASA POWER monthly request', () => {
  const url = new URL(makePowerUrl({ parameter: 'T2M', latitude: 23.416, longitude: 31.131, startYear: 2020, endYear: 2025 }));
  assert.equal(url.origin + url.pathname, 'https://power.larc.nasa.gov/api/temporal/monthly/point');
  assert.equal(url.searchParams.get('parameters'), 'T2M');
  assert.equal(url.searchParams.get('community'), 'RE');
  assert.equal(url.searchParams.get('latitude'), '23.416');
  assert.equal(url.searchParams.get('longitude'), '31.131');
});

test('parsePowerResponse drops month 13 and flags NASA -999 missing values', () => {
  const parsed = parsePowerResponse(testFixture);
  assert.deepEqual(parsed.rows, [
    { year: 2020, month: 1, value: 10 },
    { year: 2020, month: 2, value: null },
    { year: 2021, month: 1, value: 12 },
  ]);
  assert.equal(parsed.validCount, 2);
  assert.equal(parsed.missingCount, 1);
  assert.equal(parsed.api.version, 'test fixture version');
  assert.deepEqual(receiptMetrics(parsed), {
    validCount: 2, missingCount: 1, mean: 11,
    first: { year: 2020, month: 1, value: 10 },
    last: { year: 2021, month: 1, value: 12 },
    firstYear: 2020, lastYear: 2021,
  });
});

test('snapshot mode retains its original request and fetch timestamp', () => {
  const request = { parameter: 'T2M', latitude: 23.416, longitude: 31.131, startYear: 2020, endYear: 2021 };
  const snapshot = { requestUrl: makePowerUrl(request), fetchedAtUtc: '2026-01-02T00:00:00.000Z', response: testFixture };
  assert.equal(snapshotSeries(snapshot).mode, 'SNAPSHOT');
  return loadPowerSeries(request, snapshot, async () => { throw new Error('offline'); }).then((loaded) => {
    assert.equal(loaded.mode, 'SNAPSHOT');
    assert.equal(loaded.liveError, 'offline');
    assert.equal(loaded.requestUrl, snapshot.requestUrl);
    assert.equal(loaded.fetchedAtUtc, snapshot.fetchedAtUtc);
  });
});

test('offline fallback refuses a snapshot for another place or request window', async () => {
  const request = { parameter: 'T2M', latitude: 23.416, longitude: 31.131, startYear: 2020, endYear: 2021 };
  const snapshot = { requestUrl: makePowerUrl({ ...request, latitude: 0 }), fetchedAtUtc: '2026-01-02T00:00:00.000Z', response: testFixture };
  await assert.rejects(loadPowerSeries(request, snapshot, async () => { throw new Error('offline'); }), /offline/);
});
