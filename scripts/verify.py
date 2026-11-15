"""Independent SciPy/Python check of the JavaScript analysis on a NASA snapshot."""

import json
import math
import subprocess
from pathlib import Path

import numpy as np
from scipy import stats

try:
    import pymannkendall as pymk
except ImportError:
    pymk = None

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT_PATH = ROOT / "public" / "data" / "snapshots" / "sahara.json"
snapshot = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
response = snapshot["response"]
parameter = snapshot["case"]["parameter"]
values = response["properties"]["parameter"][parameter]

monthly = {}
for key, value in values.items():
    if len(key) != 6 or key[-2:] == "13" or value == -999:
        continue
    year, month = int(key[:4]), int(key[4:])
    if 1 <= month <= 12:
        monthly.setdefault(month, []).append(float(value))
climatology = {month: float(np.mean(group)) for month, group in monthly.items()}
annual = {}
for key, value in values.items():
    if len(key) != 6 or key[-2:] == "13" or value == -999:
        continue
    year, month = int(key[:4]), int(key[4:])
    if 1 <= month <= 12 and month in climatology:
        annual.setdefault(year, []).append(float(value) - climatology[month])
series = [(year, float(np.mean(months))) for year, months in sorted(annual.items()) if len(months) == 12]
years = np.asarray([row[0] for row in series], dtype=float)
observations = np.asarray([row[1] for row in series], dtype=float)

js_run = subprocess.run(
    ["node", "scripts/report-js-stats.mjs", "public/data/snapshots/sahara.json"],
    cwd=ROOT,
    check=True,
    capture_output=True,
    text=True,
)
js = json.loads(js_run.stdout)
ols = stats.linregress(years, observations)
ols_ci = stats.t.ppf(0.975, len(years) - 2) * ols.stderr
sen = stats.theilslopes(observations, years, alpha=0.95)

sen_pairs = np.asarray([
    (observations[j] - observations[i]) / (years[j] - years[i])
    for i in range(len(years) - 1)
    for j in range(i + 1, len(years))
])
s_value = sum(
    int(np.sign(observations[j] - observations[i]))
    for i in range(len(observations) - 1)
    for j in range(i + 1, len(observations))
)
tie_counts = np.unique(observations, return_counts=True)[1]
variance = len(observations) * (len(observations) - 1) * (2 * len(observations) + 5)
variance -= sum(int(count * (count - 1) * (2 * count + 5)) for count in tie_counts if count > 1)
variance /= 18
continuity = 1 if s_value > 0 else -1 if s_value < 0 else 0
raw_z = (s_value - continuity) / math.sqrt(variance) if variance else 0
raw_p = 2 * stats.norm.sf(abs(raw_z))

sen_slope = float(np.median(sen_pairs))
residuals = observations - sen_slope * (years - years[0])
centered = residuals - residuals.mean()
rho1 = float(np.dot(centered[1:], centered[:-1]) / np.dot(centered, centered)) if np.dot(centered, centered) else 0.0
bounded_rho = min(0.8, max(-0.8, rho1))
effective_n = max(3, min(len(years), len(years) * (1 - bounded_rho) / (1 + bounded_rho)))
adjusted_variance = variance * len(years) / effective_n
adjusted_z = (s_value - continuity) / math.sqrt(adjusted_variance) if adjusted_variance else 0
adjusted_p = 2 * stats.norm.sf(abs(adjusted_z))

def check_close(js_value, python_value, tolerance=1e-5):
    return abs(float(js_value) - float(python_value)) <= tolerance

checks = {
    "OLS slope per year": check_close(js["ols"]["slope"], ols.slope),
    "OLS p-value": check_close(js["ols"]["p"], ols.pvalue),
    "OLS standard error": check_close(js["ols"]["standardError"], ols.stderr),
    "OLS R-squared": check_close(js["ols"]["rSquared"], ols.rvalue**2),
    "Sen slope per year": check_close(js["mannKendall"]["sen"]["slope"], sen.slope),
    "Mann-Kendall raw p-value": check_close(js["mannKendall"]["rawP"], raw_p),
    "Mann-Kendall adjusted p-value": check_close(js["mannKendall"]["p"], adjusted_p),
}

pymk_details = "Not installed (kept dependency-free as requested)."
if pymk:
    independent_mk = pymk.original_test(observations)
    pymk_details = f"{independent_mk.trend}; p={independent_mk.p:.8g}; Sen={independent_mk.slope:.8g} per year"

lines = [
    "# Independent Statistics Verification",
    "",
    f"- NASA POWER request: {snapshot['requestUrl']}",
    f"- Snapshot fetched: {snapshot['fetchedAtUtc']} (API {snapshot.get('api', {}).get('version', 'metadata unavailable')})",
    f"- Variable: {parameter}; {len(series)} complete deseasonalized annual values; {series[0][0]}–{series[-1][0]}.",
    "- The Python path reads the raw NASA response, removes each calendar month's mean, and independently computes yearly means.",
    "",
    "| Statistic | JavaScript | Independent Python/SciPy | Match |",
    "|---|---:|---:|:---:|",
    f"| OLS slope (per year) | {js['ols']['slope']:.10g} | {ols.slope:.10g} | {'PASS' if checks['OLS slope per year'] else 'FAIL'} |",
    f"| OLS slope 95% CI | [{js['ols']['ci95'][0]:.10g}, {js['ols']['ci95'][1]:.10g}] | [{ols.slope - ols_ci:.10g}, {ols.slope + ols_ci:.10g}] | computed independently |",
    f"| OLS p-value | {js['ols']['p']:.10g} | {ols.pvalue:.10g} | {'PASS' if checks['OLS p-value'] else 'FAIL'} |",
    f"| OLS standard error | {js['ols']['standardError']:.10g} | {ols.stderr:.10g} | {'PASS' if checks['OLS standard error'] else 'FAIL'} |",
    f"| OLS R-squared | {js['ols']['rSquared']:.10g} | {ols.rvalue**2:.10g} | {'PASS' if checks['OLS R-squared'] else 'FAIL'} |",
    f"| Sen slope (per year) | {js['mannKendall']['sen']['slope']:.10g} | {sen.slope:.10g} | {'PASS' if checks['Sen slope per year'] else 'FAIL'} |",
    f"| Sen slope 95% CI | [{js['mannKendall']['sen']['ci95'][0]:.10g}, {js['mannKendall']['sen']['ci95'][1]:.10g}] | [{sen.low_slope:.10g}, {sen.high_slope:.10g}] | compare estimator conventions |",
    f"| Mann–Kendall raw p-value | {js['mannKendall']['rawP']:.10g} | {raw_p:.10g} | {'PASS' if checks['Mann-Kendall raw p-value'] else 'FAIL'} |",
    f"| Mann–Kendall lag-1 adjusted p-value | {js['mannKendall']['p']:.10g} | {adjusted_p:.10g} | {'PASS' if checks['Mann-Kendall adjusted p-value'] else 'FAIL'} |",
    "",
    f"- Tie-corrected Mann–Kendall S: JavaScript {js['mannKendall']['s']}, Python {s_value}; lag-1 rho: JavaScript {js['mannKendall']['rho1']:.8g}, Python {rho1:.8g}.",
    f"- Autocorrelation adjustment changed the 95% conclusion: JavaScript {js['mannKendall']['adjustmentChangedConclusion']}; Python {((raw_p < 0.05) != (adjusted_p < 0.05))}.",
    f"- pymannkendall cross-check: {pymk_details}",
    "- The browser remains a static JavaScript application; this Python script is a verification tool only.",
]
report = "\n".join(lines) + "\n"
(ROOT / "docs" / "verification.md").write_text(report, encoding="utf-8")
print(report)
if not all(checks.values()):
    raise SystemExit("One or more JavaScript/Python statistics checks failed.")
