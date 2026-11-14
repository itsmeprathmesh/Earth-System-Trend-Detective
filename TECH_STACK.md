# Technology Stack: Earth System Trend Detective

## 1. Overview & Architecture

Earth System Trend Detective is an offline-capable static web application with an offline data preparation pipeline. There is no active server-side application runtime or database.

| Layer | Technology | Runtime Location | Primary Purpose |
| :--- | :--- | :--- | :--- |
| **Frontend UI** | HTML5, CSS3, Vanilla JS (ES2020+) | Browser (Client) | App layout, state management, interactions, canvas rendering |
| **Mapping Engine** | Leaflet `v1.9.4` | Browser (Client) | Interactive pan/zoom globe, custom tile canvas grid rendering |
| **Basemap Tiles** | CartoDB Dark Matter | Remote CDN | Dark aesthetic base map tiles |
| **Chart Engine** | Chart.js `v4.4.7` (UMD) | Browser (Client) | Time-series charting of annual anomalies and Sen slope line |
| **Typography** | Google Fonts API | Remote CDN | `DM Sans`, `DM Mono`, `Manrope` web fonts |
| **Speech Engine** | Web Speech API | Native Browser | Audio narration for guided walkthroughs and assistant |
| **Data Ingestion** | Python 3 (`numpy`, `scipy`) | Offline Developer CLI | Decompress NetCDF, filter complete years, write binary array |
| **Web Server** | Any Static File Server | Host / Localhost | Serves static assets (`.html`, `.js`, `.css`, `.bin`, `.json`, `.csv`) |

---

## 2. Languages & Manifests

### Exact Versions & Sources
- **Runtime Versions Identified:**
  - **JavaScript:** ES2020+ (uses `async/await`, `Promise.all`, arrow functions, `Int16Array`, `Float32Array`, `Blob`, `URL.createObjectURL`, `window.speechSynthesis`).
  - **Python:** Python 3.8+ compatible (tested on Python 3.13.7).
  - **Leaflet:** `1.9.4` (CDN: `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js`).
  - **Chart.js:** `4.4.7` (CDN: `https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js`).

---

## 3. Libraries, Services & Component Breakdown

### Frontend Libraries
| Library | Version | Source | Why Used |
| :--- | :--- | :--- | :--- |
| **Leaflet** | `1.9.4` | `unpkg.com` | Provides coordinate projection, map viewport navigation, tile loading, and `L.GridLayer` canvas extension. |
| **Chart.js** | `4.4.7` | `jsdelivr.net` | Lightweight zero-config canvas plotting for annual temperature time series and trendlines. |
| **CartoDB Dark Matter** | Dynamic | `cartocdn.com` | High-contrast dark basemap tiles optimized for climate anomaly overlays. |
| **Google Fonts** | Dynamic | `fonts.googleapis.com` | Typefaces: `DM Sans` (body), `DM Mono` (metrics/headers), `Manrope` (display typography). |

### Data Pipeline Dependencies (Offline)
| Library | Version Requirement | Why Used |
| :--- | :--- | :--- |
| **NumPy** | `>=1.20` (`2.2.3` tested) | Vectorized grid calculations, threshold filtering (`count >= 9`), little-endian signed 16-bit binary serialization (`<i2`). |
| **SciPy** | `>=1.7` (`1.15.2` tested) | NetCDF 3 reader (`scipy.io.netcdf_file`) used to parse NASA monthly files without heavy GDAL/HDF dependencies. |
| **gzip** | Standard Library | Decompressing `.nc.gz` archives in streaming mode. |
| **json** | Standard Library | Serializing `grid-metadata.json`. |
| **pathlib** | Standard Library | Cross-platform filesystem path resolution. |
