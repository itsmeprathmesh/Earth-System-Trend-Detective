# AI Usage Disclosure

Codex generated or changed the files below for this milestone. Humans must review the scientific assumptions and test the live site, particularly on GitHub Pages and on a phone. No code or statistics were generated from simulated values.

| File | Tool and generated work | Human still needs to test or modify |
|---|---|---|
| `index.html` | Codex moved the NASA GISTEMP map and investigation interface to the site root and added the hemisphere comparison panel. | Review the comparison interpretation and verify all assets after deployment. |
| `style.css` | Codex wrote the responsive stylesheet for the question flow, case walkthroughs, and minimal NASA POWER page. | Review the layout at desktop and phone widths. |
| `power-app.js` | Codex added a rule-based mapping from interests and region types to NASA POWER variables and coordinates, live-data demo cases, a step-through explainer, and the existing live fetch/chart/error handling. | Test live CORS and all presets; confirm the case wording stays within what POWER measures. |
| `scripts/verify-step1-browser.mjs` | Codex wrote a headless Chrome smoke check for page loading, region-to-variable guidance, demo controls, and the Run flow. | Repeat against a browser profile with open network access; the isolated profile here cannot reach NASA POWER. |
| `vercel.json` | Codex configured Vercel to use the static “Other” preset, skip framework build detection, and serve the repository root. | Commit and redeploy from the Vercel-connected branch; verify the dashboard does not set a conflicting project Root Directory. |
| `investigate.html` | Codex kept the NASA POWER guided monthly field study as a separate page and added navigation back to the GISTEMP app. | Test live CORS and all presets after deployment. |
| `app.js` | Codex added a real-data North/South trend overlay with Sen rates and separate Mann–Kendall p-values, and changed the map to OpenStreetMap standard raster tiles to avoid CARTO's required API key. | Review the statistical caveat and comparison at published resolution; follow the OpenStreetMap tile usage policy. |
| `styles.css` | Codex added responsive styles for the GISTEMP comparison panel. | Review contrast and mobile layout. |
| `scripts/verify-prd-comparison.mjs` | Codex added a local headless browser check for GISTEMP asset loading and the comparison chart. | Repeat against the deployed URL after a human push. |
| `audit/shots/after/prd-hemisphere-comparison.png` | Codex captured the working real-grid hemisphere comparison locally. | Replace with a capture from the final deployed site if needed. |
| `map-runtime-config.js` and `scripts/generate-map-config.mjs` | Codex added Vercel build-time injection for `CARTO_API_KEY`, keeping the key out of tracked source while enabling keyed Voyager tiles. | Add `CARTO_API_KEY` in Vercel Project Settings → Environment Variables, then redeploy; browser-visible map keys are public and should be restricted in CARTO. |
| `README.md` | Codex updated project scope, routes, architecture, screenshots, and data-loading instructions to match the GISTEMP root app and POWER field study. | Add the real deployed URL, video, and team details. |
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

The prior `AGENTS.md`, precomputed GISTEMP data, and original statistical audit files were not generated or edited for this milestone.
