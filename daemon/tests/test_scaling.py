"""
Unit tests for data/scaling.py.
Verifies MinMaxScaler fit, transform, and inverse_transform round-trips (tolerance 1e-5).
Run from daemon/ with: pytest tests/test_scaling.py -v
"""

import numpy as np
import pandas as pd
import pytest
from data.scaling import fit_scalers, scale_df, scale_row, inverse_transform_close, FEATURE_COLS


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_train_df(n: int = 100, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    return pd.DataFrame({
        "open":   rng.uniform(400.0, 500.0, n).astype(np.float64),
        "high":   rng.uniform(500.0, 600.0, n).astype(np.float64),
        "low":    rng.uniform(300.0, 400.0, n).astype(np.float64),
        "close":  rng.uniform(400.0, 500.0, n).astype(np.float64),
        "volume": rng.uniform(1e6, 1e7, n).astype(np.float64),
    })


# ---------------------------------------------------------------------------
# fit_scalers
# ---------------------------------------------------------------------------

def test_fit_scalers_returns_one_per_feature():
    df = _make_train_df()
    scalers = fit_scalers(df)
    assert set(scalers.keys()) == set(FEATURE_COLS)


def test_fit_scalers_feature_range():
    df = _make_train_df()
    scalers = fit_scalers(df)
    for col in FEATURE_COLS:
        assert scalers[col].feature_range == (-1, 1)


# ---------------------------------------------------------------------------
# scale_df: output shape and range
# ---------------------------------------------------------------------------

def test_scale_df_shape():
    df = _make_train_df(n=50)
    scalers = fit_scalers(df)
    out = scale_df(df, scalers)
    assert out.shape == (50, 5)


def test_scale_df_range_on_train():
    df = _make_train_df()
    scalers = fit_scalers(df)
    out = scale_df(df, scalers)
    assert out.min() >= -1.0 - 1e-7
    assert out.max() <= 1.0 + 1e-7


def test_scale_df_dtype_float32():
    df = _make_train_df()
    scalers = fit_scalers(df)
    out = scale_df(df, scalers)
    assert out.dtype == np.float32


# ---------------------------------------------------------------------------
# scale_row
# ---------------------------------------------------------------------------

def test_scale_row_shape():
    df = _make_train_df()
    scalers = fit_scalers(df)
    row = {col: float(df[col].iloc[0]) for col in FEATURE_COLS}
    out = scale_row(row, scalers)
    assert out.shape == (5,)
    assert out.dtype == np.float32


def test_scale_row_consistent_with_scale_df():
    df = _make_train_df(n=10)
    scalers = fit_scalers(df)
    # First row via scale_df
    df_row_scaled = scale_df(df.iloc[[0]], scalers)[0]
    # Same row via scale_row
    row = {col: float(df[col].iloc[0]) for col in FEATURE_COLS}
    row_scaled = scale_row(row, scalers)
    np.testing.assert_allclose(df_row_scaled, row_scaled, atol=1e-5)


# ---------------------------------------------------------------------------
# inverse_transform_close: round-trip
# ---------------------------------------------------------------------------

def test_inverse_transform_close_round_trip():
    df = _make_train_df(n=200)
    scalers = fit_scalers(df)
    scaled_array = scale_df(df, scalers)
    close_scaled = scaled_array[:, FEATURE_COLS.index("close")]
    recovered = inverse_transform_close(close_scaled, scalers)
    original = df["close"].values.astype(np.float32)
    np.testing.assert_allclose(recovered, original, atol=1e-5)


def test_inverse_transform_single_value():
    df = _make_train_df()
    scalers = fit_scalers(df)
    # Scale a known value then invert
    val = np.array([450.0])
    scaled = scalers["close"].transform(val.reshape(-1, 1)).flatten()
    recovered = inverse_transform_close(scaled, scalers)
    assert abs(recovered[0] - 450.0) < 1e-5


def test_round_trip_preserves_ordering():
    df = _make_train_df(n=100)
    scalers = fit_scalers(df)
    scaled_array = scale_df(df, scalers)
    close_scaled = scaled_array[:, FEATURE_COLS.index("close")]
    recovered = inverse_transform_close(close_scaled, scalers)
    # Ordering should be preserved (monotone relationship)
    original_close = df["close"].values
    sort_orig = np.argsort(original_close)
    sort_rec = np.argsort(recovered)
    np.testing.assert_array_equal(sort_orig, sort_rec)


# ---------------------------------------------------------------------------
# Val/test data outside train range
# ---------------------------------------------------------------------------

def test_scale_df_val_outside_range():
    train_df = _make_train_df(n=100, seed=1)
    scalers = fit_scalers(train_df)
    # Val data with slightly different range — should still transform without error
    rng = np.random.default_rng(2)
    val_df = pd.DataFrame({
        "open":   rng.uniform(390.0, 510.0, 30).astype(np.float64),
        "high":   rng.uniform(490.0, 610.0, 30).astype(np.float64),
        "low":    rng.uniform(290.0, 410.0, 30).astype(np.float64),
        "close":  rng.uniform(390.0, 510.0, 30).astype(np.float64),
        "volume": rng.uniform(5e5, 2e7, 30).astype(np.float64),
    })
    out = scale_df(val_df, scalers)
    assert out.shape == (30, 5)
    # Some values may be outside [-1, 1] since they're outside the train range — that's expected
