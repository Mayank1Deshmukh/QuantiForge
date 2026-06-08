"""
Unit tests for training/metrics.py.
Uses static numpy arrays to assert exact math for RMSE, MAE, MAPE, and DA.
Run from daemon/ with: pytest tests/test_metrics.py -v
"""

import numpy as np
import pytest
from training.metrics import compute_metrics


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def clean_arrays():
    y_true = np.array([100.0, 102.0, 98.0, 105.0, 101.0])
    y_pred = np.array([101.0, 101.5, 99.0, 104.0, 102.0])
    return y_true, y_pred


# ---------------------------------------------------------------------------
# RMSE
# ---------------------------------------------------------------------------

def test_rmse_exact(clean_arrays):
    y_true, y_pred = clean_arrays
    result = compute_metrics(y_true, y_pred)
    expected = float(np.sqrt(np.mean((y_true - y_pred) ** 2)))
    assert abs(result["rmse"] - expected) < 1e-3


def test_rmse_zero_error():
    y = np.array([10.0, 20.0, 30.0])
    result = compute_metrics(y, y.copy())
    assert result["rmse"] == 0.0


def test_rmse_known_value():
    # errors = [1, 1, 1, 1] → RMSE = 1.0
    y_true = np.array([0.0, 0.0, 0.0, 0.0])
    y_pred = np.array([1.0, 1.0, 1.0, 1.0])
    result = compute_metrics(y_true, y_pred)
    assert abs(result["rmse"] - 1.0) < 1e-6


# ---------------------------------------------------------------------------
# MAE
# ---------------------------------------------------------------------------

def test_mae_exact(clean_arrays):
    y_true, y_pred = clean_arrays
    result = compute_metrics(y_true, y_pred)
    expected = float(np.mean(np.abs(y_true - y_pred)))
    assert abs(result["mae"] - expected) < 1e-3


def test_mae_zero_error():
    y = np.array([5.0, 10.0, 15.0])
    result = compute_metrics(y, y.copy())
    assert result["mae"] == 0.0


def test_mae_known_value():
    # errors = [1, 2, 3] → MAE = 2.0
    y_true = np.array([0.0, 0.0, 0.0])
    y_pred = np.array([1.0, 2.0, 3.0])
    result = compute_metrics(y_true, y_pred)
    assert abs(result["mae"] - 2.0) < 1e-6


# ---------------------------------------------------------------------------
# MAPE
# ---------------------------------------------------------------------------

def test_mape_exact():
    y_true = np.array([100.0, 200.0, 50.0])
    y_pred = np.array([110.0, 190.0, 55.0])
    result = compute_metrics(y_true, y_pred)
    expected = float(np.mean(np.abs((y_true - y_pred) / y_true)) * 100)
    assert abs(result["mape"] - expected) < 1e-3


def test_mape_zero_error():
    y = np.array([100.0, 200.0, 300.0])
    result = compute_metrics(y, y.copy())
    assert result["mape"] == 0.0


def test_mape_ten_percent():
    # Each prediction is 10% off → MAPE = 10.0
    y_true = np.array([100.0, 200.0])
    y_pred = np.array([110.0, 220.0])
    result = compute_metrics(y_true, y_pred)
    assert abs(result["mape"] - 10.0) < 1e-3


# ---------------------------------------------------------------------------
# Directional Accuracy
# ---------------------------------------------------------------------------

def test_da_all_correct():
    # actual: up, up, down; predicted correctly
    # actual_dir = sign([2, 2, -3]) = [+1, +1, -1]
    # pred_dir   = sign(y_pred[1:] - y_true[:-1]) = sign([3, 3, -4]) = [+1, +1, -1]
    y_true = np.array([100.0, 102.0, 104.0, 101.0])
    y_pred = np.array([100.5, 103.0, 105.0, 100.0])
    result = compute_metrics(y_true, y_pred)
    assert result["directional_accuracy"] == 1.0


def test_da_all_wrong():
    # actual goes up each step, predicted goes down each step
    # actual_dir = [+1, +1, +1]
    # pred_dir   = sign(y_pred[1:] - y_true[:-1]) = sign([-2, -4, -6]) = [-1, -1, -1]
    y_true = np.array([100.0, 102.0, 104.0, 106.0])
    y_pred = np.array([101.0, 99.0, 95.0, 89.0])
    result = compute_metrics(y_true, y_pred)
    assert result["directional_accuracy"] == 0.0


def test_da_single_element():
    y_true = np.array([100.0])
    y_pred = np.array([105.0])
    result = compute_metrics(y_true, y_pred)
    assert result["directional_accuracy"] == 0.5


def test_da_half_correct():
    # 4 pairs: 2 correct, 2 wrong → DA = 0.5
    # actual_dir: [+1, +1, -1, +1]
    # y_true = [10, 12, 14, 12, 15]  → actual_dir = [+1, +1, -1, +1]
    # y_pred = [11, 11, 15, 13, 14]  → pred_dir = sign([11-10, 15-12, 13-14, 14-12]) = sign([1, 3, -1, 2]) = [+1, +1, -1, +1]
    # All 4 correct — let me construct a 2/4 case instead
    # actual:  [10, 12, 14, 12, 10]  → actual_dir = [+1, +1, -1, -1]
    # y_pred:  [11, 11, 11, 13, 11]  → pred_dir = sign([11-10, 11-12, 13-14, 11-12]) = sign([1, -1, -1, -1]) = [+1, -1, -1, -1]
    # match:   [T, F, T, T] → 3/4 = 0.75
    # Let me just do a simpler 2-pair, 1-correct case:
    # actual:  [10, 11, 9]  → actual_dir = [+1, -1]
    # y_pred:  [10.5, 12, 10]  → pred_dir = sign([12-10, 10-11]) = sign([2, -1]) = [+1, -1]
    # match:   [T, T] → all correct, not 50%
    # Build an exact 50%: 2 pairs, 1 correct:
    # actual:  [10, 12, 11]  → actual_dir = [+1, -1]
    # y_pred:  [9, 13, 12]  → pred_dir = sign([13-10, 12-12]) = sign([3, 0]) = [+1, 0]
    # match:   [+1==+1, -1==0] → [T, F] → 0.5
    y_true = np.array([10.0, 12.0, 11.0])
    y_pred = np.array([9.0, 13.0, 12.0])
    result = compute_metrics(y_true, y_pred)
    assert result["directional_accuracy"] == 0.5


# ---------------------------------------------------------------------------
# Return type / format
# ---------------------------------------------------------------------------

def test_output_keys(clean_arrays):
    y_true, y_pred = clean_arrays
    result = compute_metrics(y_true, y_pred)
    assert set(result.keys()) == {"rmse", "mae", "mape", "directional_accuracy"}


def test_output_values_are_floats(clean_arrays):
    y_true, y_pred = clean_arrays
    result = compute_metrics(y_true, y_pred)
    for v in result.values():
        assert isinstance(v, float)


def test_accepts_1d_and_2d_arrays():
    y_true = np.array([[1.0], [2.0], [3.0]])
    y_pred = np.array([[1.1], [1.9], [3.2]])
    result = compute_metrics(y_true, y_pred)
    assert "rmse" in result
