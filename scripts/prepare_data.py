#!/usr/bin/env python3
"""Convert NASA GISTEMP v4 monthly NetCDF into a compact annual browser grid."""
from __future__ import annotations

import datetime as dt
import gzip
import json
import sys
from pathlib import Path

import numpy as np
from scipy.io import netcdf_file

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data"
FILL = 32767


def main(source: str) -> None:
    source_path = Path(source)
    if not source_path.is_file():
        raise SystemExit(f"NetCDF gzip file not found: {source_path}")

    with gzip.open(source_path, "rb") as stream:
        ds = netcdf_file(stream, mmap=False)
        try:
            dates = [dt.date(1800, 1, 1) + dt.timedelta(days=int(day)) for day in ds.variables["time"][:]]
            raw = np.array(ds.variables["tempanomaly"][:], dtype=np.int16)
            scale = float(ds.variables["tempanomaly"]._attributes["scale_factor"])
            lat = np.array(ds.variables["lat"][:], dtype=float)
            lon = np.array(ds.variables["lon"][:], dtype=float)
        finally:
            ds.close()

    complete_year = max(d.year for d in dates if sum(x.year == d.year for x in dates) == 12)
    first_year = min(d.year for d in dates)
    annual = []
    for year in range(first_year, complete_year + 1):
        indices = [i for i, day in enumerate(dates) if day.year == year]
        values = raw[indices]
        valid = values != FILL
        count = valid.sum(axis=0)
        total = np.where(valid, values, 0).sum(axis=0, dtype=np.int32)
        mean = np.divide(total, count, out=np.zeros_like(total, dtype=np.float64), where=count > 0) * scale
        encoded = np.full(mean.shape, FILL, dtype="<i2")
        accepted = count >= 9
        encoded[accepted] = np.rint(mean[accepted] * 100).clip(-32768, 32766).astype("<i2")
        annual.append(encoded)

    OUT.mkdir(exist_ok=True)
    grid = np.stack(annual).astype("<i2", copy=False)
    grid.tofile(OUT / "annual-grid.bin")
    metadata = {
        "product": "NASA GISS GISTEMP v4 LOTI, ERSST v5, 1200 km smoothing",
        "source_url": "https://data.giss.nasa.gov/pub/gistemp/gistemp1200_GHCNv4_ERSSTv5.nc.gz",
        "citation_url": "https://data.giss.nasa.gov/gistemp/",
        "accessed": "2026-11-14",
        "units": "degC anomaly relative to 1951-1980",
        "grid": {"rows": int(len(lat)), "columns": int(len(lon)), "lat_first_center": float(lat[0]), "lon_first_center": float(lon[0]), "step_degrees": 2},
        "first_year": first_year,
        "last_complete_year": complete_year,
        "months_per_year_required": 9,
        "scale": 100,
        "fill_value": FILL,
        "binary_format": "little-endian signed int16; year-major, then latitude south-to-north, longitude west-to-east",
    }
    (OUT / "grid-metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(annual)} years × {len(lat)} × {len(lon)} cells to {OUT / 'annual-grid.bin'}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/prepare_data.py <GISTEMP .nc.gz>")
    main(sys.argv[1])
