# Product Requirements Document (PRD): Earth System Trend Detective

## 1. Problem Statement
Analyzing long-term climate observations typically requires specialized GIS software, bulky NetCDF downloads (hundreds of megabytes), and scientific Python environments. Educators, students, and researchers need a lightweight, transparent, zero-install tool to explore historical temperature trends, inspect regional variations, understand statistical significance, and verify provenance directly in a web browser.

---

## 2. Target Users
- **Science Educators & Students:** Learning about Earth system climate trends, anomalies, and statistical significance.
- **Researchers & Science Communicators:** Demonstrating global and regional temperature changes with interactive, shareable visualizations.
- **General Public & Curious Investigators:** Exploring temperature records across specific regions without complex data wrangling.

---

## 3. Goals & Non-Goals

### Goals
- Provide an interactive, zero-configuration web interface to explore NASA GISTEMP v4 annual surface temperature anomalies (1880–2025).
- Compute spatial trend maps and regional time-series metrics dynamically on the client side without backend dependencies.
- Render statistical indicators (Sen slope, Mann-Kendall test with lag-1 autocorrelation variance adjustment, p-value) with transparent caveats.
- Provide guided walkthroughs with audio narration support to scaffold inquiry-based learning.
- Allow downloading the currently selected time-series data as CSV, Markdown trend report, or JSON telemetry packet.
- Include an on-demand, rule-based scientific interpretation assistant ("Ask the Detective").
- Provide a tabbed data provenance and methodology modal explaining data ingestion, mathematics, spatial aggregation, and caveats.

### Non-Goals
- Real-time querying of remote NASA NetCDF servers on user interaction (data is preprocessed into compact static binary formats).
- Non-linear, polynomial, or predictive climate modeling (scope is restricted to observational linear trend estimation).
- Hyper-local or station-specific forecasting (analysis is on a 2° × 2° grid with 1200 km smoothing radius).
- Direct multi-variable integration in v1 (links to CUAHSI HydroClient and NASA Giovanni serve as educational pointers only).

---

## 4. Core Features

### Implemented Features
| Feature | Description | Implementation Details |
| :--- | :--- | :--- |
| **Compact Grid Ingestion** | Rapid client-side loading of global gridded temperature anomaly data | Fetches `annual-grid.bin` (Int16Array, 4.73 MB), `grid-metadata.json`, and `global-mean.csv` |
| **Dynamic Spatial Trend Map** | Global 2° × 2° gridded map showing linear rate of change (°C / decade) | Leaflet `L.GridLayer` custom canvas tile renderer with dynamic color interpolation |
| **Interactive Region Selection** | Switch between Global Mean, Northern Hemisphere, Southern Hemisphere, or custom clicked coordinates | Dropdown selector or map click; local mode averages cells within ±6° lat/lon with cosine weights |
| **Interactive Year Scrubber** | Mission-control bottom dock with Play/Pause 4D animation loop, speed multiplier (1x, 2x, 5x), and keyframe presets (1880, 1945, 1979, 2000) | Synchronized with dual range sliders and keyboard navigation (`Space`, `←`, `→`) |
| **Statistical Trend Engine** | Client-side Sen median slope and Mann-Kendall trend test | Computes median pairwise slopes; calculates Mann-Kendall $S$, tie-adjusted variance, and lag-1 autocorrelation adjustment |
| **Time-Series Charting** | Visual chart displaying annual anomalies and Sen slope trendline | Chart.js line chart with responsive resizing, tooltips, and custom styling |
| **Metrics Summary Card** | Real-time display of slope rate, direction arrow, test result, p-value, and year count | DOM binding updated on state change with contextual statistical explanations |
| **Multi-Format Data Export** | One-click download of CSV series, Markdown scientific trend report, and JSON telemetry packet | Generates browser-side Blob downloads with complete calculated statistics and citations |
| **Narrated Guided Walkthroughs** | 4-step interactive tours covering global trends, Arctic amplification, hemispheric divergence, and statistical persistence | Modal dialog with step navigation, text transcript, and Web Speech API audio narration |
| **Ask the Detective Panel** | On-demand interactive scientific assistant explaining trends, p-values, AR(1) persistence, and metadata | Rule-based deterministic Q&A engine with keyword query matching and audio readout |
| **Data & Method Modal** | Tabbed methodology dialog detailing ingestion, mathematical models, spatial averaging, and uncertainty caveats | Tabs for Data Ingestion, Mathematical Models, Spatial Aggregation, and Limitations/Sources |
| **Curated Investigation Clues** | Quick-start research question presets | Preset buttons for Global Mean, Northern Hemisphere (1979+), and Map Point Exploration |
| **Landscape Idea Finder** | Conceptual prompts for exploring ecosystems | Dropdown for Desert, Rainforest, Estuary, and City with suggested variables and Giovanni link |
| **Map & Viewport Controls** | Viewport reset and map recentering | Buttons for resetting analysis filters and re-centering Leaflet map |
