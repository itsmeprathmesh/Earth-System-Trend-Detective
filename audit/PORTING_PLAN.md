# Porting Plan

## Architecture choice

The target uses a single classic script (`app.js`) with shared `state` and existing render/update functions. The added behavior stays in that script so it can use the same state and is loaded by the existing static page. New UI uses semantic HTML, CSS, browser dialogs, Blob downloads, and optional Web Speech API support. No framework, build step, library, or API key is introduced.

## Ordered implementation

1. **Design tokens:** extend the target's existing root color variables with spacing, radius, font, focus, surface, border, and dialog-shadow tokens. Keep the existing dark scientific palette.
2. **Year scrubber:** retain the two existing data-bounded year inputs; dynamically couple thumb limits to keep at least eight annual values, update visible values and ARIA value text, and preserve existing region selection and rendering paths.
3. **Trend report:** keep CSV export and add a Markdown report derived from `selectedSeries()`, `senSlope()`, `mannKendall()`, and loaded `state.meta`. Explicitly mark confidence intervals as not computed.
4. **Guided demo:** keep existing science-specific text steps; add native speech with pause/resume, step narration, cancellation on exit, and a visible text fallback when speech is unsupported.
5. **Ask the Detective:** add a deterministic local answer function using actual metadata and selected analysis results; answer unknown or unavailable questions explicitly.
6. **Data & Method:** populate a native dialog from loaded metadata and known calculation behavior. State annual aggregation, grid spacing, smoothing, missing-value handling, significance interpretation, and limitations.

## Verification approach

- Run `node --check` on each JavaScript file.
- Run the existing statistics fixture runner and data integrity checker.
- Add a dependency-free Node smoke script for bounded years, rule-based answers, report contents, metadata rendering, and no-speech fallback.
- Measure the unmodified `cellTrendMap` with the real binary grid before/after; compare outputs as well as median timing.
- Attempt local HTTP browser and screenshot validation. If host Chrome cannot reach localhost from this environment, mark browser checks and screenshots BLOCKED rather than claiming success.

