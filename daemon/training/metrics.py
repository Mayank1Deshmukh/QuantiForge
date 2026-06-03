"""Evaluation metrics computed on inverse-transformed USD values."""

import numpy as np


def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    """
    All inputs are USD-denominated inverse-transformed values.
    Returns dict with rmse, mae, mape, directional_accuracy.
    """
    y_true = np.asarray(y_true, dtype=float).flatten()
    y_pred = np.asarray(y_pred, dtype=float).flatten()
    n = len(y_true)

    rmse = float(np.sqrt(np.mean((y_true - y_pred) ** 2)))
    mae = float(np.mean(np.abs(y_true - y_pred)))
    mape = float(np.mean(np.abs((y_true - y_pred) / y_true)) * 100)

    # Directional accuracy: 1/n * sum( sign(y[i+1]-y[i]) == sign(yhat[i+1]-y[i]) )
    if n > 1:
        actual_dir = np.sign(y_true[1:] - y_true[:-1])
        pred_dir = np.sign(y_pred[1:] - y_true[:-1])
        da = float(np.mean(actual_dir == pred_dir))
    else:
        da = 0.5

    return {
        "rmse": round(rmse, 4),
        "mae": round(mae, 4),
        "mape": round(mape, 4),
        "directional_accuracy": round(da, 4),
    }
