# Independent Statistics Verification

- NASA POWER request: https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M&community=RE&longitude=31.131&latitude=23.416&start=1981&end=2025&format=JSON
- Snapshot fetched: 2026-11-15T05:39:20.558Z (API v2.10.0)
- Variable: T2M; 45 complete deseasonalized annual values; 1981–2025.
- The Python path reads the raw NASA response, removes each calendar month's mean, and independently computes yearly means.

| Statistic | JavaScript | Independent Python/SciPy | Match |
|---|---:|---:|:---:|
| OLS slope (per year) | 0.04167182697 | 0.04167182697 | PASS |
| OLS slope 95% CI | [0.03092881824, 0.05241483569] | [0.03092881824, 0.05241483569] | computed independently |
| OLS p-value | 8.464644541e-10 | 8.464643921e-10 | PASS |
| OLS standard error | 0.005327044319 | 0.005327044319 | PASS |
| OLS R-squared | 0.5873103107 | 0.5873103107 | PASS |
| Sen slope (per year) | 0.03863782051 | 0.03863782051 | PASS |
| Sen slope 95% CI | [0.02877777778, 0.04986111111] | [0.02877777778, 0.04979166667] | compare estimator conventions |
| Mann–Kendall raw p-value | 3.263802006e-09 | 3.252794074e-09 | PASS |
| Mann–Kendall lag-1 adjusted p-value | 3.263802006e-09 | 3.252794074e-09 | PASS |

- Tie-corrected Mann–Kendall S: JavaScript 606, Python 606; lag-1 rho: JavaScript -0.22503423, Python -0.22503423.
- Autocorrelation adjustment changed the 95% conclusion: JavaScript False; Python False.
- pymannkendall cross-check: Not installed (kept dependency-free as requested).
- The browser remains a static JavaScript application; this Python script is a verification tool only.
