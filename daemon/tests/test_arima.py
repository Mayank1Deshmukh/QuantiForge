"""
Non-blocking smoke tests for arima/baseline.py.
Mocks data fetching to avoid yfinance I/O, then verifies:
  1. run_arima returns well-formed output with all four metric keys.
  2. The statsmodels O(1) append(refit=False) path is used — only ONE initial
     ARIMA.fit() call regardless of test-split size.
  3. The entire run completes in < 30 seconds even with a realistic split size.

Run from daemon/ with: pytest tests/test_arima.py -v
"""

import time
import numpy as np
import pandas as pd
import pytest
from unittest.mock import patch, MagicMock, call


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_close_df(n: int = 300, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    close = 450.0 + np.cumsum(rng.standard_normal(n))
    return pd.DataFrame({
        "open":       close * 0.999,
        "high":       close * 1.001,
        "low":        close * 0.998,
        "close":      close,
        "volume":     rng.uniform(1e6, 2e6, n),
        "continuous": [True] * n,
    })


def _split(df: pd.DataFrame):
    n = len(df)
    i_train = int(n * 0.8)
    i_val   = i_train + int(n * 0.1)
    return df.iloc[:i_train], df.iloc[i_train:i_val], df.iloc[i_val:]


# ---------------------------------------------------------------------------
# Output shape / keys
# ---------------------------------------------------------------------------

def test_run_arima_returns_required_keys():
    df = _make_close_df(n=200)
    train_df, val_df, test_df = _split(df)

    with patch("arima.baseline.fetch_ohlcv", return_value=df), \
         patch("arima.baseline.chronological_split", return_value=(train_df, val_df, test_df)):
        from arima.baseline import run_arima
        result = run_arima("SPY")

    assert set(result.keys()) >= {"ticker", "order", "metrics", "predictions"}
    assert set(result["metrics"].keys()) == {"rmse", "mae", "mape", "directional_accuracy"}


def test_run_arima_predictions_length_matches_test_split():
    df = _make_close_df(n=200)
    train_df, val_df, test_df = _split(df)

    with patch("arima.baseline.fetch_ohlcv", return_value=df), \
         patch("arima.baseline.chronological_split", return_value=(train_df, val_df, test_df)):
        from arima.baseline import run_arima
        result = run_arima("SPY")

    assert len(result["predictions"]) == len(test_df)


def test_run_arima_metrics_are_finite():
    df = _make_close_df(n=200)
    train_df, val_df, test_df = _split(df)

    with patch("arima.baseline.fetch_ohlcv", return_value=df), \
         patch("arima.baseline.chronological_split", return_value=(train_df, val_df, test_df)):
        from arima.baseline import run_arima
        result = run_arima("SPY")

    for key, val in result["metrics"].items():
        assert np.isfinite(val), f"Metric {key} is not finite: {val}"


def test_run_arima_order():
    df = _make_close_df(n=200)
    train_df, val_df, test_df = _split(df)

    with patch("arima.baseline.fetch_ohlcv", return_value=df), \
         patch("arima.baseline.chronological_split", return_value=(train_df, val_df, test_df)):
        from arima.baseline import run_arima
        result = run_arima("SPY")

    assert result["order"] == [5, 1, 0]


# ---------------------------------------------------------------------------
# O(1) append(refit=False) path — only ONE initial fit
# ---------------------------------------------------------------------------

def test_arima_uses_append_refit_false_not_per_step_refit():
    """
    With the correct O(1) approach, statsmodels ARIMA.fit() is called exactly ONCE
    (for the initial training-set fit). All subsequent test steps use
    result.append([actual], refit=False) which does not re-invoke ARIMA.fit().
    """
    df = _make_close_df(n=150)
    train_df, val_df, test_df = _split(df)
    n_test = len(test_df)

    fit_call_count = {"n": 0}
    import statsmodels.tsa.arima.model as _arima_mod

    _OriginalARIMA = _arima_mod.ARIMA

    class _InstrumentedARIMA(_OriginalARIMA):
        def fit(self, *args, **kwargs):
            fit_call_count["n"] += 1
            return super().fit(*args, **kwargs)

    with patch("arima.baseline.fetch_ohlcv", return_value=df), \
         patch("arima.baseline.chronological_split", return_value=(train_df, val_df, test_df)), \
         patch("arima.baseline.ARIMA", _InstrumentedARIMA):
        from arima.baseline import run_arima
        run_arima("SPY")

    # Exactly one fit call (initial training fit); test steps use append(refit=False)
    assert fit_call_count["n"] == 1, (
        f"Expected 1 ARIMA.fit() call (O(1) path), got {fit_call_count['n']}. "
        "The naive per-step refit path was used instead."
    )


# ---------------------------------------------------------------------------
# Performance: must complete in < 30 s
# ---------------------------------------------------------------------------

def test_run_arima_completes_under_30_seconds():
    """
    Use a realistic-sized dataset (300 total, ~30 test points) and verify
    wall-clock completion stays under 30 seconds with the O(1) append path.
    """
    df = _make_close_df(n=300)
    train_df, val_df, test_df = _split(df)

    with patch("arima.baseline.fetch_ohlcv", return_value=df), \
         patch("arima.baseline.chronological_split", return_value=(train_df, val_df, test_df)):
        from arima.baseline import run_arima
        t0 = time.time()
        run_arima("SPY")
        elapsed = time.time() - t0

    assert elapsed < 30, (
        f"ARIMA took {elapsed:.2f}s — over the 30s budget. "
        "Verify the refit=False append path is used."
    )
