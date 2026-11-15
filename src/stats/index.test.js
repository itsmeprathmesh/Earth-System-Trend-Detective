import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateSeason, mannKendall, monthlyAnomalies, olsTrend, senSlope } from './index.js';

test('monthlyAnomalies subtracts calendar-month means and omits NASA missing values', () => {
  const rows = [
    { year: 2000, month: 1, value: 10 }, { year: 2001, month: 1, value: 12 },
    { year: 2000, month: 2, value: 20 }, { year: 2001, month: 2, value: -999 },
    { year: 2001, month: 13, value: 100 },
  ];
  assert.deepEqual(monthlyAnomalies(rows), [
    { year: 2000, month: 1, value: 10, anomaly: -1 },
    { year: 2001, month: 1, value: 12, anomaly: 1 },
    { year: 2000, month: 2, value: 20, anomaly: 0 },
  ]);
});

test('aggregateSeason computes complete yearly seasonal means and assigns December to DJF season-year', () => {
  const rows = [
    { year: 2000, month: 12, anomaly: 3 }, { year: 2001, month: 1, anomaly: 6 }, { year: 2001, month: 2, anomaly: 9 },
    { year: 2001, month: 12, anomaly: 6 }, { year: 2002, month: 1, anomaly: 9 }, { year: 2002, month: 2, anomaly: 12 },
    { year: 2002, month: 3, anomaly: 100 },
  ];
  assert.deepEqual(aggregateSeason(rows, [12, 1, 2]), [
    { year: 2001, value: 6 }, { year: 2002, value: 9 },
  ]);
});

test('olsTrend returns textbook slope, exact fit, and narrow confidence interval', () => {
  const result = olsTrend([0, 1, 2, 3, 4].map((year) => ({ year, value: 3 + 2 * year })));
  assert.equal(result.slope, 2);
  assert.equal(result.slopePerDecade, 20);
  assert.equal(result.rSquared, 1);
  assert.equal(result.p, 0);
  assert.deepEqual(result.ci95, [2, 2]);
});

test('olsTrend matches a hand-checkable noisy regression fixture', () => {
  const values = [2, 4, 5, 4, 5];
  const result = olsTrend(values.map((value, year) => ({ year: year + 1, value })));
  assert.ok(Math.abs(result.slope - 0.6) < 1e-12);
  assert.ok(Math.abs(result.standardError - 0.282842712474619) < 1e-12);
  assert.ok(Math.abs(result.t - 2.1213203435596424) < 1e-12);
  assert.ok(Math.abs(result.p - 0.124) < 0.002);
  assert.ok(Math.abs(result.rSquared - 0.6) < 1e-12);
  assert.ok(Math.abs(result.ci95[0] - (-0.300)) < 0.002);
  assert.ok(Math.abs(result.ci95[1] - 1.5) < 0.002);
});

test('Sen slope and Mann-Kendall match the eight-point monotone fixture', () => {
  const points = Array.from({ length: 8 }, (_, year) => ({ year, value: year + 1 }));
  assert.deepEqual(senSlope(points), { slope: 1, ci95: [1, 1], pairCount: 28 });
  const result = mannKendall(points);
  assert.equal(result.s, 28);
  assert.ok(Math.abs(result.baseVariance - 65.33333333333333) < 1e-12);
  assert.equal(result.tau, 1);
  assert.ok(result.p < 0.002);
  assert.equal(result.adjusted, false);
});

test('Mann-Kendall applies tie correction and reports short records as insufficient', () => {
  const short = Array.from({ length: 7 }, (_, year) => ({ year, value: year }));
  assert.ok(Number.isNaN(mannKendall(short).p));
  const tied = Array.from({ length: 8 }, (_, year) => ({ year, value: year < 4 ? 0 : 1 }));
  const result = mannKendall(tied);
  assert.equal(result.s, 16);
  assert.ok(Math.abs(result.baseVariance - 48) < 1e-12);
  assert.ok(result.variance >= result.baseVariance);
});
