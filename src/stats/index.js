const MISSING = -999;

function finite(value) {
  return Number.isFinite(value) && value !== MISSING;
}

export function monthlyAnomalies(rows) {
  const sums = Array(12).fill(0);
  const counts = Array(12).fill(0);
  for (const row of rows) {
    if (row.month < 1 || row.month > 12 || !finite(row.value)) continue;
    sums[row.month - 1] += row.value;
    counts[row.month - 1] += 1;
  }
  const means = sums.map((sum, month) => counts[month] ? sum / counts[month] : NaN);
  return rows
    .filter((row) => row.month >= 1 && row.month <= 12 && finite(row.value) && Number.isFinite(means[row.month - 1]))
    .map((row) => ({ ...row, anomaly: row.value - means[row.month - 1] }));
}

export function aggregateSeason(rows, months = Array.from({ length: 12 }, (_, i) => i + 1)) {
  const selected = new Set(months);
  if (!months.length || months.some((month) => !Number.isInteger(month) || month < 1 || month > 12)) {
    throw new RangeError('Season months must be integers from 1 to 12.');
  }
  const groups = new Map();
  for (const row of rows) {
    if (!selected.has(row.month) || !finite(row.anomaly)) continue;
    // December belongs to the following DJF season-year.
    const year = months.length === 3 && selected.has(1) && selected.has(2) && selected.has(12) && row.month === 12
      ? row.year + 1
      : row.year;
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(row.anomaly);
  }
  return [...groups.entries()]
    .filter(([, values]) => values.length === months.length)
    .map(([year, values]) => ({ year, value: values.reduce((sum, value) => sum + value, 0) / values.length }))
    .sort((a, b) => a.year - b.year);
}

function logGamma(z) {
  const coefficients = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = 0.9999999999998099;
  for (let i = 0; i < coefficients.length; i++) x += coefficients[i] / (z + i + 1);
  const t = z + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaFraction(a, b, x) {
  const maxIterations = 200;
  const epsilon = 3e-14;
  const tiny = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return h;
}

function regularizedBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  return x < (a + 1) / (a + b + 2)
    ? front * betaFraction(a, b, x) / a
    : 1 - front * betaFraction(b, a, 1 - x) / b;
}

function studentTCdf(t, degrees) {
  if (!Number.isFinite(t)) return t < 0 ? 0 : 1;
  const x = degrees / (degrees + t * t);
  const tail = 0.5 * regularizedBeta(x, degrees / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}

function tQuantile(probability, degrees) {
  let low = -100, high = 100;
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    if (studentTCdf(mid, degrees) < probability) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export function olsTrend(points) {
  const clean = points.filter((point) => Number.isFinite(point.year) && finite(point.value));
  const n = clean.length;
  if (n < 3) return { n, slope: NaN, slopePerDecade: NaN, standardError: NaN, t: NaN, p: NaN, ci95: [NaN, NaN], rSquared: NaN };
  const meanX = clean.reduce((s, p) => s + p.year, 0) / n;
  const meanY = clean.reduce((s, p) => s + p.value, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const point of clean) {
    sxx += (point.year - meanX) ** 2;
    sxy += (point.year - meanX) * (point.value - meanY);
    syy += (point.value - meanY) ** 2;
  }
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const residualSum = clean.reduce((sum, point) => sum + (point.value - intercept - slope * point.year) ** 2, 0);
  const standardError = Math.sqrt((residualSum / (n - 2)) / sxx);
  const t = standardError === 0 ? (slope === 0 ? 0 : Math.sign(slope) * Infinity) : slope / standardError;
  const p = Math.max(0, Math.min(1, 2 * (1 - studentTCdf(Math.abs(t), n - 2))));
  const halfWidth = tQuantile(0.975, n - 2) * standardError;
  return { n, slope, slopePerDecade: slope * 10, standardError, t, p, ci95: [slope - halfWidth, slope + halfWidth], rSquared: syy === 0 ? (residualSum === 0 ? 1 : 0) : 1 - residualSum / syy };
}

export function senSlope(points) {
  const clean = points.filter((point) => Number.isFinite(point.year) && finite(point.value));
  const slopes = [];
  for (let i = 0; i < clean.length - 1; i++) {
    for (let j = i + 1; j < clean.length; j++) {
      const elapsed = clean[j].year - clean[i].year;
      if (elapsed !== 0) slopes.push((clean[j].value - clean[i].value) / elapsed);
    }
  }
  slopes.sort((a, b) => a - b);
  if (!slopes.length) return { slope: NaN, ci95: [NaN, NaN], pairCount: 0 };
  const counts = new Map();
  for (const point of clean) counts.set(point.value, (counts.get(point.value) || 0) + 1);
  let variance = clean.length * (clean.length - 1) * (2 * clean.length + 5);
  for (const count of counts.values()) variance -= count * (count - 1) * (2 * count + 5);
  variance /= 18;
  const rankOffset = 1.959963984540054 * Math.sqrt(variance);
  const lower = Math.max(0, Math.floor((slopes.length - rankOffset) / 2));
  const upper = Math.min(slopes.length - 1, Math.ceil((slopes.length + rankOffset) / 2));
  return { slope: median(slopes), ci95: [slopes[lower], slopes[upper]], pairCount: slopes.length };
}

function median(values) {
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function erf(x) {
  const sign = Math.sign(x) || 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return sign * y;
}

export function mannKendall(points) {
  const clean = points.filter((point) => Number.isFinite(point.year) && finite(point.value)).sort((a, b) => a.year - b.year);
  const n = clean.length;
  const sen = senSlope(clean);
  if (n < 8) return { n, s: NaN, baseVariance: NaN, variance: NaN, z: NaN, rawP: NaN, p: NaN, tau: NaN, rho1: NaN, adjusted: false, adjustmentChangedConclusion: false, sen };
  let s = 0;
  const ties = new Map();
  for (let i = 0; i < n; i++) {
    ties.set(clean[i].value, (ties.get(clean[i].value) || 0) + 1);
    for (let j = i + 1; j < n; j++) s += Math.sign(clean[j].value - clean[i].value);
  }
  let variance = n * (n - 1) * (2 * n + 5);
  for (const count of ties.values()) variance -= count * (count - 1) * (2 * count + 5);
  variance /= 18;
  const baseVariance = variance;
  const rawZ = s > 0 ? (s - 1) / Math.sqrt(baseVariance) : s < 0 ? (s + 1) / Math.sqrt(baseVariance) : 0;
  const rawP = 1 - erf(Math.abs(rawZ) / Math.SQRT2);
  const residual = clean.map((point) => point.value - sen.slope * (point.year - clean[0].year));
  const mean = residual.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0, denominator = 0;
  for (let i = 0; i < n; i++) denominator += (residual[i] - mean) ** 2;
  for (let i = 1; i < n; i++) numerator += (residual[i] - mean) * (residual[i - 1] - mean);
  const rho1 = denominator ? numerator / denominator : 0;
  // Yue-Wang effective sample size correction, capped to avoid unstable variance.
  const rho = Math.max(-0.8, Math.min(0.8, rho1));
  const effectiveN = Math.max(3, Math.min(n, n * (1 - rho) / (1 + rho)));
  const adjustedVariance = variance * n / effectiveN;
  const z = s > 0 ? (s - 1) / Math.sqrt(adjustedVariance) : s < 0 ? (s + 1) / Math.sqrt(adjustedVariance) : 0;
  const p = 1 - erf(Math.abs(z) / Math.SQRT2);
  return { n, s, baseVariance, variance: adjustedVariance, z, rawP, p, tau: s / (n * (n - 1) / 2), rho1, adjusted: Math.abs(adjustedVariance - baseVariance) > 1e-12, adjustmentChangedConclusion: (rawP < 0.05) !== (p < 0.05), sen };
}
