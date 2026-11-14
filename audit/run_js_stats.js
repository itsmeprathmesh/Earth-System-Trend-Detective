// Exact extract of app.js statistical functions for Node.js fixture testing
const fs = require('fs');

function median(values) {
  if (!values.length) return NaN;
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function senSlope(points) {
  const slopes = [];
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = i + 1; j < points.length; j++) {
      slopes.push((points[j].value - points[i].value) / (points[j].year - points[i].year));
    }
  }
  return median(slopes);
}

function erfc(x) {
  const z = Math.abs(x), t = 1 / (1 + z / 2);
  // Note: app.js line 122 has 9 open parens and only 8 close parens, causing a fatal SyntaxError.
  // In this audit runner, we add the missing 9th close paren to evaluate the formula.
  const answer = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? answer : 2 - answer;
}

function mannKendall(points, slope) {
  const n = points.length;
  if (n < 8) return { p: NaN, tau: NaN, rho: 0, s: NaN, variance: NaN, z: NaN };
  let s = 0;
  for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) s += Math.sign(points[j].value - points[i].value);
  const ties = new Map();
  for (const point of points) ties.set(point.value, (ties.get(point.value) || 0) + 1);
  let variance = n * (n - 1) * (2 * n + 5);
  for (const count of ties.values()) if (count > 1) variance -= count * (count - 1) * (2 * count + 5);
  variance /= 18;

  const residuals = points.map((point) => point.value - slope * point.year);
  const mean = residuals.reduce((a, b) => a + b, 0) / n;
  let numerator = 0, denominator = 0;
  for (let i = 0; i < n; i++) denominator += (residuals[i] - mean) ** 2;
  for (let i = 1; i < n; i++) numerator += (residuals[i] - mean) * (residuals[i - 1] - mean);
  const rho = denominator ? numerator / denominator : 0;
  const persistence = Math.max(0, Math.min(0.8, rho));
  variance *= (1 + persistence) / (1 - persistence);
  const z = s > 0 ? (s - 1) / Math.sqrt(variance) : s < 0 ? (s + 1) / Math.sqrt(variance) : 0;
  return { p: erfc(Math.abs(z) / Math.SQRT2), tau: s / (n * (n - 1) / 2), rho, s, variance, z };
}

// Read input from file argument or stdin
const inputPath = process.argv[2];
let inputJson;
if (inputPath && fs.existsSync(inputPath)) {
  inputJson = fs.readFileSync(inputPath, 'utf-8');
} else {
  inputJson = fs.readFileSync(0, 'utf-8');
}
const fixtures = JSON.parse(inputJson);
const results = {};

for (const [name, points] of Object.entries(fixtures)) {
  const slope = senSlope(points);
  const mk = mannKendall(points, slope);
  results[name] = {
    slope,
    rate_per_decade: slope * 10,
    ...mk
  };
}

console.log(JSON.stringify(results, null, 2));
