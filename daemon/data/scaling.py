"""MinMaxScaler per feature, fit on train only."""

import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler


FEATURE_COLS = ["open", "high", "low", "close", "volume"]
CLOSE_IDX = FEATURE_COLS.index("close")


def fit_scalers(train_df: pd.DataFrame) -> dict[str, MinMaxScaler]:
    """Fit one MinMaxScaler(-1,1) per feature column on train data only."""
    scalers: dict[str, MinMaxScaler] = {}
    for col in FEATURE_COLS:
        scaler = MinMaxScaler(feature_range=(-1, 1))
        scaler.fit(train_df[[col]].values)
        scalers[col] = scaler
    return scalers


def scale_df(df: pd.DataFrame, scalers: dict[str, MinMaxScaler]) -> np.ndarray:
    """Transform a DataFrame to a scaled numpy array of shape (N, 5)."""
    cols = []
    for col in FEATURE_COLS:
        transformed = scalers[col].transform(df[[col]].values).flatten()
        cols.append(transformed)
    return np.stack(cols, axis=1).astype(np.float32)


def scale_row(row: dict, scalers: dict[str, MinMaxScaler]) -> np.ndarray:
    """Scale a single OHLCV dict to a (5,) float32 array."""
    vals = []
    for col in FEATURE_COLS:
        v = np.array([[float(row[col])]])
        vals.append(float(scalers[col].transform(v)[0, 0]))
    return np.array(vals, dtype=np.float32)


def inverse_transform_close(values: np.ndarray, scalers: dict[str, MinMaxScaler]) -> np.ndarray:
    """Inverse-transform predicted close values back to USD."""
    reshaped = values.reshape(-1, 1)
    return scalers["close"].inverse_transform(reshaped).flatten()
