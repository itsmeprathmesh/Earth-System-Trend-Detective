# Database & Backend Specification: Earth System Trend Detective

## 1. Backend Architecture

Earth System Trend Detective operates without a persistent backend server, application API, or relational database. All analytical computing (spatial slicing, cosine-latitude weighting, linear regression, Sen median slope, and Mann-Kendall trend tests) executes directly on the client inside the web browser.

Static files served via HTTP:
```text
HTTP Server (e.g. Python http.server / Node http)
  │
  ├── GET /data/grid-metadata.json  (JSON configuration & metadata)
  ├── GET /data/annual-grid.bin     (Raw binary grid array, 4.73 MB)
  └── GET /data/global-mean.csv     (Pre-calculated NASA global series)
```

---

## 2. Data Models & Schemas

### 1. `data/grid-metadata.json`
Specifies dimensions, coordinates, quantization scale, and provenance:

| Key | Type | Description | Value |
| :--- | :--- | :--- | :--- |
| `product` | string | Source dataset name and smoothing radius | `"NASA GISS GISTEMP v4 LOTI, ERSST v5, 1200 km smoothing"` |
| `source_url` | string | NASA download URL | `"https://data.giss.nasa.gov/pub/gistemp/gistemp1200_GHCNv4_ERSSTv5.nc.gz"` |
| `citation_url` | string | Documentation URL | `"https://data.giss.nasa.gov/gistemp/"` |
| `accessed` | string | Access date | `"2026-11-14"` |
| `units` | string | Measurement units | `"degC anomaly relative to 1951-1980"` |
| `grid.rows` | integer | Number of latitude bands | `90` |
| `grid.columns` | integer | Number of longitude bands | `180` |
| `grid.lat_first_center` | float | Latitude center of row 0 | `-89.0` (South Pole) |
| `grid.lon_first_center` | float | Longitude center of column 0 | `-179.0` (Date Line West) |
| `grid.step_degrees` | integer | Angular resolution per cell | `2` |
| `first_year` | integer | Earliest complete year | `1880` |
| `last_complete_year` | integer | Latest complete year | `2025` |
| `months_per_year_required`| integer | Threshold for valid annual cell | `9` |
| `scale` | integer | Inverse quantization factor | `100` ($0.01^\circ\text{C}$ resolution) |
| `fill_value` | integer | Sentinel for missing observations | `32767` |
| `binary_format` | string | Byte layout specification | `"little-endian signed int16; year-major..."` |

### 2. `data/annual-grid.bin`
- **Format:** Uncompressed 3D array stored in little-endian signed 16-bit integers (`<i2`, `Int16Array`).
- **Dimensions:** $N_{\text{years}} \times N_{\text{rows}} \times N_{\text{cols}} = 146 \times 90 \times 180 = 2,365,200 \text{ elements}$.
- **Storage Size:** $2,365,200 \times 2 = 4,730,400 \text{ bytes}$ ($\approx 4.51\text{ MB}$).
- **Indexing Formula (`app.js:47`):**
  $$\text{index} = (y \cdot R + r) \cdot C + c$$
  where $y = \text{year} - 1880$, $R = 90$, $C = 180$, $r = \lfloor(\text{lat} + 90)/2\rfloor$, and $c = \lfloor(\text{lon} + 180)/2\rfloor$.
- **De-quantization Formula:**
  $$\text{Temperature Anomaly (°C)} = \begin{cases} \text{NaN} & \text{if } \text{raw} = 32767 \\ \frac{\text{raw}}{100.0} & \text{otherwise} \end{cases}$$

### 3. `data/global-mean.csv`
- Official published NASA global annual mean LOTI table with column headers `Year, No_Smoothing, Lowess(5)`.
- Used directly for global-scale time-series plotting to guarantee 100% agreement with NASA publications.
