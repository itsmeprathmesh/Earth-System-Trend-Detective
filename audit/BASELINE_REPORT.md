# Baseline Report

Date: 2026-11-15 (Asia/Calcutta)

## Repository structure and architecture

The target is a static vanilla HTML/CSS/classic-JavaScript application. Its entry points are `index.html`, `styles.css`, and `app.js`; datasets are under `data/`, the existing Node statistics runner and integrity checker are under `audit/`, and the offline ingestion script is under `scripts/`. `AGENTS.md`, `PROGRESS.md`, and `README.md` are present. The `docs/` folder exists but was empty during inspection, despite `AGENTS.md` linking to several documents.

The app loads NASA GISTEMP v4 LOTI metadata, the binary 2° grid, and the published annual global series. It calculates selected-area series, Sen median slope, Mann–Kendall significance with approximate lag-1 persistence adjustment, and per-cell OLS map slopes. It uses Leaflet with canvas grid tiles and Chart.js. It already includes a two-thumb year control, filters, global and hemisphere summaries, click-to-select local areas, CSV export, guided text walkthroughs, landscape prompts, and reset controls.

## Syntax finding and repair history

The first `node --check app.js` run failed at line 122 in `erfc()` with `SyntaxError: missing ) after argument list`. The subsequent original-file read showed nine opening and nine closing parentheses on that line, and a later `node --check app.js` passed. No syntax edit was made by this agent; the source changed between observations, and Git status could not be inspected because the checkout was outside the permitted workspace. The origin of that repair is unknown. The checked staged source also passes `node --check`.

## Baseline command findings

- `node --check app.js`: initially FAIL at `app.js:122`; later PASS after the source line was observed balanced.
- `node audit/run_js_stats.js` without an input path: FAIL because the runner reads empty stdin and parses it as JSON.
- `node audit/run_js_stats.js audit/fixtures_input.json`: PASS. Complete output is recorded in [`baseline/statistics.json`](baseline/statistics.json). The NASA global fixture reports Sen rates of `+0.08 °C/decade` for 1880–2025 and `+0.2036 °C/decade` for 1979–2025; the runner's p-values are included in the JSON.
- `python audit/check_data.py`: PASS. It reports a 4,730,400-byte grid matching metadata dimensions (146 × 90 × 180 int16), 278,519 fill values (11.78%), and `r = 0.999657` between cosine-latitude weighted grid mean and the published global series. Grid orientation checks also pass.

## Baseline performance

The real `cellTrendMap` implementation was loaded in a Node VM with the actual `annual-grid.bin` and metadata. Five timed runs per range were performed on the same process before and after the UI-only edits; medians are recorded in [`PERFORMANCE_COMPARISON.md`](PERFORMANCE_COMPARISON.md). Baseline medians: 616.40 ms for 1880–2025 and 92.38 ms for 2000–2025. Both run over 16,200 cells; annual-value scans are 2,365,200 and 421,200 respectively. Input grid size is 4,730,400 bytes; output map is 64,800 bytes.

## Browser, screenshot, and console evidence

The app was requested through the local HTTP server in Chrome, but the browser showed `ERR_CONNECTION_TIMED_OUT`. The sandbox server process was not reachable from the host browser, and a host-side Python server request also timed out. No baseline screenshot or browser-console capture is claimed. [`shots/before/README.md`](shots/before/README.md) records the limitation. A browser functional review is still needed in an environment where localhost is reachable from Chrome.

## Existing limitations and errors

- The source inventory identifies several Google-hosted font names in CSS but no local font assets; rendered fallback depends on the browser.
- The available data is temperature anomaly only; other landscape prompts are ideas and do not represent loaded variables.
- No confidence interval is computed by the existing analysis.
- The original stats runner requires its fixture path or piped JSON; invoking it with no input is an error.
- Browser console output and screenshot evidence could not be collected in this environment.

