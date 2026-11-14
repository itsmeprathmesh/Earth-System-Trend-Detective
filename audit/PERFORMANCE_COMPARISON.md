# `cellTrendMap` Performance Comparison

**Date:** 2026-11-15  
**Dataset:** NASA GISTEMP v4 `annual-grid.bin` (146 × 90 × 180 int16, 4,730,400 bytes)  
**Method:** Actual `cellTrendMap` loaded from `app.js` in a Node VM, full grid, one warmup and five timed repetitions per range. The same harness was used before and after UI edits; table reports medians.

| Range | Annual values scanned | Output cells | Before (ms) | After (ms) | Change |
|---|---:|---:|---:|---:|---:|
| 1880–2025 | 2,365,200 | 16,200 | 616.40 | 595.82 | −20.58 ms (−3.34%) |
| 2000–2025 | 421,200 | 16,200 | 92.38 | 89.10 | −3.28 ms (−3.55%) |

Output parity was exact for the checked results: 16,023 finite cells for 1880–2025 and 16,021 for 2000–2025. The function scans the same number of values in each comparison. Input is 4,730,400 bytes; the 16,200-element `Float32Array` output is 64,800 bytes.

`audit/measure_cell_trend.js` is a separate helper that benchmarks an extracted copy of the trend function. Its lower absolute durations are not comparable to the app-function measurements above and are not used here.
