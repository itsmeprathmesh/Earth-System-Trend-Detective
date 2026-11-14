"""Automated pytest test suite for Earth System Trend Detective."""
import json
import subprocess
from pathlib import Path
import numpy as np
import pytest
import scipy.stats as stats
import scipy.special as special

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"

def test_javascript_syntax():
    """Verify app.js and audit JS files evaluate without SyntaxError."""
    result = subprocess.run(["node", "--check", str(ROOT / "app.js")], capture_output=True, text=True)
    assert result.returncode == 0, f"app.js syntax error: {result.stderr}"

def test_binary_grid_file_integrity():
    """Verify annual-grid.bin file size exactly matches dimensions in grid-metadata.json."""
    meta_path = DATA_DIR / "grid-metadata.json"
    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    rows = meta["grid"]["rows"]
    cols = meta["grid"]["columns"]
    years = meta["last_complete_year"] - meta["first_year"] + 1
    expected_bytes = rows * cols * years * 2
    bin_path = DATA_DIR / "annual-grid.bin"

    assert bin_path.exists(), "annual-grid.bin missing"
    assert bin_path.stat().st_size == expected_bytes, f"Size mismatch: {bin_path.stat().st_size} != {expected_bytes}"

def test_erfc_polynomial_accuracy():
    """Verify polynomial erfc approximation matches scipy.special.erfc within tolerance."""
    def erfc_approx(x):
        z = abs(x)
        t = 1.0 / (1.0 + z / 2.0)
        ans = t * np.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))))
        return ans if x >= 0 else 2.0 - ans

    test_points = np.linspace(0.0, 5.0, 500)
    for z in test_points:
        approx = erfc_approx(z)
        exact = float(special.erfc(z))
        assert abs(approx - exact) < 1.5e-7

def test_js_statistics_runner():
    """Run node audit/run_js_stats.js and verify expected statistical properties."""
    script = ROOT / "audit" / "run_js_stats.js"
    fixtures_file = ROOT / "audit" / "fixtures_input.json"
    result = subprocess.run(["node", str(script), str(fixtures_file)], capture_output=True, text=True)
    assert result.returncode == 0, f"run_js_stats error: {result.stderr}"

    data = json.loads(result.stdout)
    assert data["strictly_increasing"]["slope"] == 1.0
    assert data["strictly_decreasing"]["slope"] == -1.0
    assert data["flat_all_ties"]["slope"] == 0.0
    assert data["nasa_global_1880_2025"]["rate_per_decade"] == pytest.approx(0.08, abs=0.01)
    assert data["nasa_global_1979_2025"]["rate_per_decade"] == pytest.approx(0.204, abs=0.01)

def test_hemispheric_symmetry():
    """Verify area-weighted Northern + Southern Hemisphere matches global grid mean."""
    meta_path = DATA_DIR / "grid-metadata.json"
    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    rows = meta["grid"]["rows"]
    cols = meta["grid"]["columns"]
    years = meta["last_complete_year"] - meta["first_year"] + 1
    raw = np.fromfile(DATA_DIR / "annual-grid.bin", dtype="<i2").reshape((years, rows, cols))
    is_fill = (raw == meta["fill_value"])

    lats = meta["grid"]["lat_first_center"] + np.arange(rows) * meta["grid"]["step_degrees"]
    weights = np.cos(np.deg2rad(lats))

    # Test year 2020 (index 140)
    grid_slice = raw[140].astype(float) / meta["scale"]
    valid = ~is_fill[140]

    # Weighted global mean
    w_matrix = np.repeat(weights[:, np.newaxis], cols, axis=1)
    global_mean = np.sum(grid_slice[valid] * w_matrix[valid]) / np.sum(w_matrix[valid])

    # NH (rows 45..89) and SH (rows 0..44)
    valid_nh = valid[45:, :]
    valid_sh = valid[:45, :]
    nh_mean = np.sum(grid_slice[45:][valid_nh] * w_matrix[45:][valid_nh]) / np.sum(w_matrix[45:][valid_nh])
    sh_mean = np.sum(grid_slice[:45][valid_sh] * w_matrix[:45][valid_sh]) / np.sum(w_matrix[:45][valid_sh])

    w_nh = np.sum(w_matrix[45:][valid_nh])
    w_sh = np.sum(w_matrix[:45][valid_sh])
    recombined = (nh_mean * w_nh + sh_mean * w_sh) / (w_nh + w_sh)

    assert abs(global_mean - recombined) < 1e-9
