# Agent Instructions: Earth System Trend Detective

## 1. Project Summary
Earth System Trend Detective is a client-side scientific visualization tool for exploring historical temperature anomalies from NASA GISTEMP v4 (1880–2025). The architecture has no active server runtime; calculations (Sen median slope, Mann-Kendall trend significance with lag-1 autocorrelation variance adjustment, and spatial averaging) execute directly in the browser using precomputed binary assets.

---

## 2. Documentation Reading Order
Before making changes, future AI agents and contributors must read the documentation in this exact order:

1. [`/docs/_inventory.md`](file:///C:/Users/YASH%20BINEKAR/langflow/New%20folder/Earth-System-Trend-Detective/docs/_inventory.md): Initial code inventory and file layout.
2. [`/docs/AUDIT.md`](file:///C:/Users/YASH%20BINEKAR/langflow/New%20folder/Earth-System-Trend-Detective/docs/AUDIT.md): **Crucial evidence-based findings**, including the known P0 compile-time syntax error on `app.js:122`.
3. [`/docs/PRD.md`](file:///C:/Users/YASH%20BINEKAR/langflow/New%20folder/Earth-System-Trend-Detective/docs/PRD.md): Problem scope, user requirements, goals, and non-goals.
4. [`/docs/APP_FLOW.md`](file:///C:/Users/YASH%20BINEKAR/langflow/New%20folder/Earth-System-Trend-Detective/docs/APP_FLOW.md): UI navigation, user journeys, and empty/error states.
5. [`/docs/TECH_STACK.md`](file:///C:/Users/YASH%20BINEKAR/langflow/New%20folder/Earth-System-Trend-Detective/docs/TECH_STACK.md): Confirmed library versions, CDN dependencies, and runtime characteristics.
6. [`/docs/DB_BACKEND.md`](file:///C:/Users/YASH%20BINEKAR/langflow/New%20folder/Earth-System-Trend-Detective/docs/DB_BACKEND.md): Data schemas, binary grid layouts, and pipeline operations.
7. [`/docs/FRONTEND_GUIDELINES.md`](file:///C:/Users/YASH%20BINEKAR/langflow/New%20folder/Earth-System-Trend-Detective/docs/FRONTEND_GUIDELINES.md): Styling tokens, CSS variables, typography, and state sync lifecycle.
8. [`/docs/IMPLEMENTATION_PLAN.md`](file:///C:/Users/YASH%20BINEKAR/langflow/New%20folder/Earth-System-Trend-Detective/docs/IMPLEMENTATION_PLAN.md): Ordered roadmap of tasks to bring the project to release state.
9. [`/PROGRESS.md`](file:///C:/Users/YASH%20BINEKAR/langflow/New%20folder/Earth-System-Trend-Detective/PROGRESS.md): Current task execution status.

---

## 3. Verified Setup, Run, Test, and Build Commands

### Run the Application Locally
```powershell
# From the project root
python -m http.server 8000
```
Open [http://localhost:8000](http://localhost:8000) in your browser.

### Verify JavaScript Syntax
```powershell
node -c app.js
```
*(Note: Exits with code 1 until Step 1 of the implementation plan resolves `app.js:122`).*

### Run Statistical & Data Audits
```powershell
# Verify binary grid integrity against NASA global mean
python audit/check_data.py

# Verify statistical calculations against SciPy reference fixtures
python audit/fixtures.py
```

### Re-generate Binary Grid (Offline Pipeline)
```powershell
# Requires gistemp1200_GHCNv4_ERSSTv5.nc.gz downloaded from NASA
python scripts/prepare_data.py <path_to_nc_gz>
```

---

## 4. Coding Conventions & Architecture Rules

- **Vanilla Web Architecture:** Do not introduce modern heavy frameworks (React, Vue, Angular) or bundlers (Vite, Webpack) unless explicitly instructed. The project is designed to run directly via static file serving.
- **Unidirectional State Synchronization:**
  - Modify `state` properties.
  - Trigger `updateControls()` to sync range inputs.
  - Trigger `updateMapTrends()` to recalculate OLS grid slopes and redraw canvas tiles.
  - Trigger `updateSummary()` to recalculate active regional series, Sen slope, Mann-Kendall statistics, Chart.js datasets, and DOM cards.
- **Binary Grid Protocol:**
  - `data/annual-grid.bin` is a 3D tensor ($146 \times 90 \times 180$) in little-endian signed 16-bit integers (`<i2`).
  - Indexing: `index = (yearIndex * 90 + row) * 180 + col`.
  - Latitudes: Row 0 is South Pole ($-89^\circ$), Row 89 is North Pole ($+89^\circ$).
  - Longitudes: Col 0 is Date Line West ($-179^\circ$), Col 179 is Date Line East ($+179^\circ$).
  - Never open or edit `annual-grid.bin` in a text editor.

---

## 5. Repository Folder Map

```text
Earth-System-Trend-Detective/
├── AGENTS.md                  # Instructions for AI assistants (this file)
├── PROGRESS.md                # Task tracker and open questions
├── README.md                  # Project overview and run instructions
├── index.html                 # Main single-page interface
├── app.js                     # Core application logic, mapping, and statistics
├── styles.css                 # Unified stylesheet with CSS custom properties
├── audit/                     # Verification and audit tools
│   ├── check_data.py          # Data array validation vs official NASA series
│   ├── fixtures.py            # Statistical engine benchmark vs SciPy
│   ├── extract_urls.py        # URL inventory and dependency extractor
│   └── run_js_stats.js        # Node.js runner for JavaScript statistical routines
├── data/                      # Static precomputed data assets
│   ├── annual-grid.bin        # 2°x2° annual anomalies (1880-2025, int16, 4.7MB)
│   ├── global-mean.csv        # Official NASA global annual anomaly table
│   └── grid-metadata.json     # Metadata and dimensional definitions
├── docs/                      # Architectural specifications and audit report
│   ├── _inventory.md          # Repo inventory
│   ├── AUDIT.md               # Evidence-based audit report
│   ├── PRD.md                 # Product requirements
│   ├── APP_FLOW.md            # User journeys and navigation maps
│   ├── TECH_STACK.md          # Technology stack and dependencies
│   ├── DB_BACKEND.md          # Data specifications and pipeline models
│   ├── FRONTEND_GUIDELINES.md # UI/UX styling and component guidelines
│   └── IMPLEMENTATION_PLAN.md # Phased implementation roadmap
└── scripts/                   # Data ingestion pipelines
    └── prepare_data.py        # Python script to convert NASA NetCDF into binary grid
```

---

## 6. Strict "Never Do" List

1. **NEVER** commit secrets, API keys, or credentials into the repository.
2. **NEVER** perform unrelated refactoring across files when fixing a localized bug.
3. **NEVER** add new dependencies (npm or pip) without asking and confirming.
4. **NEVER** alter the binary encoding or coordinate order (South-to-North, West-to-East) in `prepare_data.py` without coordinating matching changes in `app.js`.
5. **NEVER** replace the canvas tile rendering system (`L.GridLayer`) with individual DOM/SVG markers, which will crash browser rendering performance.
6. **NEVER** edit files under `data/` manually.

---

## 7. How to Update `PROGRESS.md`
When completing a task from `docs/IMPLEMENTATION_PLAN.md`:
1. Locate the corresponding row in `PROGRESS.md`.
2. Change the status from `Not started` or `In progress` to `Done`.
3. Fill in the completion date (`YYYY-MM-DD`).
4. Add concise verification notes detailing the command output or test result that confirmed completion.
