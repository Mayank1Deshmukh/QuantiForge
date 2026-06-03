"""
ARIMA(5,1,0) baseline — walk-forward out-of-sample forecasts.
Runs on CPU only; no PyTorch dependency.
"""

import numpy as np
from statsmodels.tsa.arima.model import ARIMA

from data.ingestion import fetch_ohlcv, chronological_split
from training.metrics import compute_metrics


def run_arima(ticker: str) -> dict:
    """
    Fit ARIMA(5,1,0) on training close prices.
    Generate walk-forward out-of-sample forecasts on the test split.
    Returns { ticker, order, metrics, predictions }.
    """
    df = fetch_ohlcv(ticker)
    train_df, val_df, test_df = chronological_split(df)

    # ARIMA uses raw USD close values — no scaling
    train_close = train_df["close"].values.astype(float)
    test_close = test_df["close"].values.astype(float)

    # Fit initial model on training data
    fitted = ARIMA(train_close, order=(5, 1, 0)).fit()

    predictions = []
    for actual in test_close:
        predictions.append(float(fitted.forecast(1)[0]))
        # O(1) state update without re-estimating parameters
        fitted = fitted.append([actual], refit=False)

    y_pred = np.array(predictions)
    metrics = compute_metrics(test_close, y_pred)

    return {
        "ticker": ticker,
        "order": [5, 1, 0],
        "metrics": metrics,
        "predictions": y_pred.round(4).tolist(),
    }
