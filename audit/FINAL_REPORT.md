# Earth System Trend Detective UI Port: Audit Report

**Date:** 2026-11-15  
**Reference inspected:** Ocean Watcher (read-only)  
**Target:** Earth-System-Trend-Detective

## Summary

The target app now includes a guided walkthrough, a deterministic Ask the Detective panel, a metadata and methods dialog, and an exportable trend report alongside the existing map, chart, dual year controls, and CSV export. The implementation stays in the existing vanilla HTML/CSS/JavaScript stack. No reference source or synthetic ocean data was copied, and the NASA data files and `AGENTS.md` were left unchanged.

The map startup order was corrected after a browser runtime trace showed that the first Leaflet tile could read `state.mapTrends` before it had been computed. Trend data is now computed before the layer is initialized. A misleading Ask the Detective answer about Arctic amplification was also replaced with a clear statement of what the loaded temperature-only dataset can support.

## Ported behavior

| Feature | Result |
|---|---|
| Year controls | Existing dual sliders keep a minimum eight-year span and expose current years to assistive technology. |
| Trend report | Markdown report is derived from the current selection; CSV remains available. JSON telemetry export is also present in the target. Confidence intervals are identified as unavailable. |
| Guided walkthrough | Native dialog provides readable steps and optional Web Speech narration with a text fallback. |
| Ask the Detective | Rule-based answers use loaded metadata and computed values; unsupported questions are declined. |
| Data & Method | Dialog explains provenance, data coverage and missing values, methods, spatial weighting, and limitations. |
| Visual system | Existing design is extended with spacing, color, focus, and responsive layout rules. |

## Verification

- `node --check app.js` and `node --check audit/test_ported_ui.js`: **PASS**.
- `node audit/test_ported_ui.js`: **PASS** for year bounds and accessible labels, deterministic answer limits, methodology content, narration states, and report fields.
- `node audit/run_js_stats.js audit/fixtures_input.json`: **PASS** on monotonic, flat, alternating, short-series, and NASA reference fixtures.
- `python audit/check_data.py`: **PASS**; grid size and dimensions match metadata, fill values are recognized, orientation checks pass, and the area-weighted grid series correlates with the published global series at `r = 0.999657`.
- Headless Chrome with a real local HTTP server: **PASS**. NASA data reached the `NASA DATASET LOADED` state; dashboard and all three dialogs were captured. The only console error was a missing `/favicon.ico` request.
- `python audit/fixtures.py`: **PASS** in the writable staging copy. Running it in the target checkout was blocked because it writes its fixture file there; the target's existing fixture runner and the UI test still passed.

The first screenshot attempt used a virtual-time capture that ran before local data settled and showed a load issue. Those captures were replaced with real-time Chrome captures. See [`shots/after/README.md`](shots/after/README.md).

## Performance and data parity

The actual `cellTrendMap` function and full grid were measured in the same Node VM before and after the UI-only edits, five repetitions per range after warmup. Median duration was 616.40 ms before and 595.82 ms after for 1880–2025 (−3.34%); for 2000–2025, 92.38 ms before and 89.10 ms after (−3.55%). Processed annual values and valid output-cell counts matched. See [`PERFORMANCE_COMPARISON.md`](PERFORMANCE_COMPARISON.md) for setup and counts.

The separate `audit/measure_cell_trend.js` helper reports much shorter durations because it measures an extracted duplicate implementation, not the function loaded from `app.js`; those numbers are not used as the app benchmark.

## Remaining limitations

- Browser map tiles and font rendering still depend on the external services already used by the project.
- The loaded variable is surface temperature anomaly only. The assistant explicitly avoids claiming ice-albedo causes or other measurements absent from the data.
- Speech synthesis may be unavailable; the walkthrough remains readable without it.
- The repository's existing license and deployment choices were not changed.
