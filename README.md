# Earth System Trend Detective

A global-scale prototype for exploring trends in NASA GISTEMP v4 annual surface-temperature anomalies. The app uses the observed 2° × 2° NASA grid, calculates regional time series and trend summaries in the browser, and keeps dataset provenance visible.

## Run locally

From this directory, start a static server:

```powershell
python -m http.server 8000
```

Open `http://localhost:8000` in a browser. The page loads Leaflet and Chart.js from public CDNs, so an internet connection is needed for the basemap and chart library.

## Data

- NASA GISS GISTEMP v4 Land-Ocean Temperature Index (LOTI), monthly anomalies relative to 1951–1980.
- Global mean series: `data/global-mean.csv`.
- Gridded source product: 2° × 2° monthly netCDF, ERSST v5, 1200 km smoothing.
- Browser data: `data/annual-grid.bin`, annual means stored as little-endian signed 16-bit integers in hundredths of a degree Celsius; `32767` marks missing cells.
- The upstream monthly product includes partial 2026 observations. The processed annual grid covers 1880–2025 and excludes incomplete years.

GISTEMP is a NASA analysis product combining NOAA land-station observations and ERSST sea-surface-temperature analysis. It is not a satellite-only measurement. Grid cells are 2 degrees in latitude and longitude and the analysis uses a 1200 km smoothing radius, so this is not local-scale ground truth.

Dataset citation: GISTEMP Team (2026), *GISS Surface Temperature Analysis (GISTEMP), version 4*, NASA Goddard Institute for Space Studies. Accessed 2026-11-14. https://data.giss.nasa.gov/gistemp/ . See also Lenssen et al. (2024), doi:10.1029/2023JD040179.

## Regenerate the browser grid

Download the official compressed monthly grid from NASA and run the preparation script:

```powershell
Invoke-WebRequest 'https://data.giss.nasa.gov/pub/gistemp/gistemp1200_GHCNv4_ERSSTv5.nc.gz' -OutFile 'gistemp1200_GHCNv4_ERSSTv5.nc.gz'
python -m pip install numpy scipy
python scripts/prepare_data.py gistemp1200_GHCNv4_ERSSTv5.nc.gz
```

The script writes the annual grid and `data/grid-metadata.json`. It keeps years with at least nine valid monthly observations per cell and excludes partial-year records from the interface.

## Analysis notes

- Regional trend magnitude is the Sen median slope, reported in °C per decade.
- The trend map shows ordinary least-squares slope by grid cell for visual exploration; it does not claim per-cell statistical significance.
- The selected-area significance summary uses a Mann–Kendall test with a lag-1 autocorrelation variance adjustment and Benjamini–Hochberg correction is not applied to individual map cells because the map does not display pixel-level significance.
- Statistical significance is evidence against a no-monotonic-trend null under the stated test assumptions; it does not establish cause or forecast future conditions.
- Region averages use cosine-latitude weights and exclude missing cells.
- Monthly values are summarized as annual means, which reduces the regular seasonal cycle; the current interface focuses on linear trend estimates.
- The guided questions and demos are curated for the currently loaded temperature dataset; they are not an AI-based variable search system.

## Related hydrology discovery

The app links to [CUAHSI HydroClient](https://data.cuahsi.org/), which helps users discover, preview, and download hydrologic station time series such as streamflow, meteorological observations, and soil moisture. Coverage depends on the selected data service and location; CUAHSI's HIS is undergoing modernization. These station series are a possible later data integration, not an input to the current global NASA temperature map.
