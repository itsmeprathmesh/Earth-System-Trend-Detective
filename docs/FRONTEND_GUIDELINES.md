# Frontend Guidelines: Earth System Trend Detective

## 1. Project Organization & Directory Conventions

The frontend follows a lightweight, unbundled architecture without a build step (no Webpack, Vite, or Babel). All source files reside at the repository root:

```text
/
├── index.html       # Single-page DOM markup and asset links
├── app.js           # Core JavaScript application logic and event binding
├── styles.css       # Unified CSS stylesheet
└── data/            # Static precomputed data files fetched via HTTP
```

---

## 2. Component & Markup Conventions

- **Semantic HTML5:** Use `<header>`, `<main>`, `<section>`, `<aside>`, `<footer>`, `<article>`, and `<details>`.
- **Panels & Cards:** Independent content cards use the `.panel` utility class with glassmorphic backgrounds (`.glass-panel`) and cyan/amber/red accent glows.
- **Timeline Dock:** Dedicated mission-control bottom scrubber dock (`#timeline-scrubber-dock`) with Play/Pause 4D animation, speed toggles, epoch keyframe presets, and live year indicator.
- **Kick-off Labels (Eyebrows):** Use `.panel-kicker` with `'DM Mono'` uppercase tracking.
- **Modals:** Use the native HTML5 `<dialog>` element for overlays (e.g., `#demo-dialog`, `#ask-dialog`, `#method-dialog`). Open with `.showModal()` and close with `.close()`.
- **DOM Selection Helper:** Consistent helper:
  ```javascript
  const $ = (id) => document.getElementById(id);
  ```

---

## 3. State Management & Update Lifecycle

The application maintains an in-memory mutable singleton `state` object. Updates follow an explicit unidirectional synchronization pattern:

```text
User Event (Slider / Select / Click / Scrubber / Keydown)
  │
  ▼
Update State (e.g. state.start, state.end, state.region, state.local)
  │
  ├── updateControls()      # Sync range inputs, scrubber, bounds, and year labels
  ├── updateMapTrends()     # Recompute OLS slope Float32Array; call trendLayer.redraw()
  └── updateSummary()       # Recompute series, Sen slope, Mann-Kendall; redraw Chart.js & text
```

---

## 4. Styling System & Design Tokens

Defined in `:root` (`styles.css`):
- `--bg: #050c18`
- `--bg-darker: #030710`
- `--panel: rgba(8, 20, 36, 0.92)`
- `--line: rgba(0, 240, 255, 0.16)`
- `--cyan: #00f0ff` (Primary telemetry accent)
- `--amber: #ffaa00` (Warning / playback accent)
- `--red: #ff3366` (Critical warming accent)
- `--emerald: #00ffaa` (Online / significance status)
- `--glass-bg: rgba(6, 14, 27, 0.92)`
- `--glow-cyan: 0 0 16px rgba(0, 240, 255, 0.35)`
