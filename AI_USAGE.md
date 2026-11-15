# AI Usage Disclosure

Codex generated or changed the files below for this milestone. Humans must review the scientific assumptions and test the live site, particularly on GitHub Pages and on a phone. No code or statistics were generated from simulated values.

| File | Tool and generated work | Human still needs to test or modify |
|---|---|---|
| `index.html` | Codex replaced the active entry page with the minimal NASA POWER form and Chart.js yearly-series view for Step 1. | Review labels and test the page on GitHub Pages. |
| `style.css` | Codex wrote the small responsive stylesheet for the minimal NASA POWER page. | Review the layout at desktop and phone widths. |
| `power-app.js` | Codex wrote live NASA POWER request construction, monthly parsing, season/year aggregation, Chart.js rendering, and honest request errors. | Verify live CORS and API coverage for the five listed variables. |
| `scripts/verify-step1-browser.mjs` | Codex wrote a headless Chrome smoke check for local page loading, Chart.js availability, and the Run flow. | Repeat against a browser profile with open network access; the isolated profile here cannot reach NASA POWER. |
| `gistemp.html` | Codex moved the pre-existing formatted GISTEMP page here so its earlier work remains accessible. | Check its navigation after publication. |
| `investigate.css` | Codex wrote the field-notebook layout, responsive rules, year sliders, dark theme, and reduced-motion handling. | Review contrast and layout on real devices. |
| `src/data/power.js` | Codex wrote NASA POWER URL construction, parameter descriptions, response parsing, provenance receipts, and exact-request fallback rules. | Recheck variable definitions, units, and NASA metadata as the API changes. |
| `src/data/power.test.js` | Codex wrote native Node tests using explicitly labeled test-only fixtures. | Review edge cases and keep fixtures out of app content. |
| `src/stats/index.js` | Codex wrote deseasonalizing, seasonal aggregation, OLS, Sen slope, tie-corrected Mann–Kendall, and lag-1 variance adjustment. | A climate statistician should review the autocorrelation and Sen interval conventions. |
| `src/stats/index.test.js` | Codex wrote textbook and hand-calculated test fixtures. | Expand references and review test assumptions. |
| `src/ui/investigate.js` | Codex wrote the static browser investigation, SVG chart, result panel, data receipt, cache, and case controls. | Test keyboard use, API failures, and all supported variables in target browsers. |
| `public/data/snapshots/*.json` | Codex ran `scripts/fetch-snapshots.mjs`; each file contains a raw NASA POWER response, request URL, UTC fetch time, API metadata, and case coordinates. | Refresh only by running the script; verify case suitability before presenting a story. |
| `scripts/fetch-snapshots.mjs` | Codex wrote the reproducible NASA snapshot fetcher. | Review NASA terms and re-run when the annual record updates. |
| `scripts/verify-power-parameters.mjs` | Codex wrote and ran the live endpoint check for all twelve candidate parameter codes. | Re-run when variables or NASA availability change. |
| `scripts/check-power-receipts.mjs` | Codex wrote a randomized three-case comparison of snapshot receipts against fresh NASA responses. | Run before each milestone and investigate any mismatch. |
| `scripts/verify-offline-fallback.mjs` | Codex wrote a headless-Chrome check that blocks NASA POWER and confirms the matching shipped snapshot renders. | Repeat in browsers and devices used for judging. |
| `scripts/inspect-mobile-layout.mjs` | Codex wrote headless-Chrome 410-pixel checks for year-slider synchronization, custom-month grouping, map clicks, and screenshot capture. | Review the screenshot and test touch interaction on a physical phone. |
| `scripts/report-js-stats.mjs` | Codex wrote a small JSON bridge for running the browser statistics against a saved NASA response. | Keep the bridge aligned with the app's analysis path. |
| `scripts/verify.py` | Codex wrote an independent SciPy/Python comparison using a real Sahara response. | `pymannkendall` was unavailable and no dependency was added; add that comparison only if dependency approval changes. |
| `docs/verification.md` | Codex generated this report by running `scripts/verify.py`. | Regenerate after snapshot or statistical changes. |
| `audit/shots/after/power-investigation.png` | Codex captured the live desktop investigation in headless Chrome. | Replace with a final deployed-site capture when available. |
| `audit/shots/after/power-investigation-receipt.png` | Codex captured the desktop chart view in headless Chrome. | Replace with a final deployed-site capture when available. |
| `audit/shots/after/power-investigation-mobile.png` | Codex captured the full mobile view in headless Chrome using a real NASA snapshot. | Replace with a final deployed-site capture when available. |
| `audit/shots/after/power-investigation-snapshot.png` | Codex captured the offline fallback view with the public NASA host blocked. | Review the visible snapshot date and receipt. |
| `README.md` | Codex documented the project, architecture, setup, screenshots, and this disclosure. | Fill in team identities, live URL, and demo video after human review/deployment. |
| `PROGRESS.md` | Codex recorded milestone status and verification evidence. | Confirm status and date after human publication. |

The prior `AGENTS.md`, precomputed GISTEMP data, and original statistical audit files were not generated or edited for this milestone.
