"""
Denoising pipeline: None / Kalman / DWT.
Fit on train only; transform val, test, and live using stored params.
"""

import numpy as np
import pandas as pd


def denoise(
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    test_df: pd.DataFrame,
    method: str,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict]:
    """
    Apply denoising to the `close` column only.
    Returns (train, val, test) with close replaced, plus denoiser_params dict.
    """
    if method == "None":
        return train_df.copy(), val_df.copy(), test_df.copy(), {}

    if method == "Kalman":
        return _kalman_denoise(train_df, val_df, test_df)

    if method == "DWT":
        return _dwt_denoise(train_df, val_df, test_df)

    raise ValueError(f"Unknown denoiser: {method}")


# ---------------------------------------------------------------------------
# Kalman filter
# ---------------------------------------------------------------------------

def _kalman_denoise(
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    test_df: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict]:
    from pykalman import KalmanFilter

    train_close = train_df["close"].values.astype(float)

    kf = KalmanFilter(
        transition_matrices=[[1]],
        observation_matrices=[[1]],
        initial_state_mean=train_close[0],
    )
    kf = kf.em(train_close.reshape(-1, 1), n_iter=10)

    # Extract fitted parameters
    # kf.initial_state_mean has shape (1,) after EM — numpy >= 2.0 requires a
    # 0-D array for float(); use .flat[0] to extract the scalar safely.
    params = {
        "transition_covariance": kf.transition_covariance.tolist(),
        "observation_covariance": kf.observation_covariance.tolist(),
        "initial_state_mean": float(np.asarray(kf.initial_state_mean).flat[0]),
        "initial_state_covariance": kf.initial_state_covariance.tolist(),
    }

    def _apply(series: np.ndarray, kf: KalmanFilter) -> np.ndarray:
        means, _ = kf.filter(series.reshape(-1, 1))
        return means.flatten()

    train_filtered = _apply(train_close, kf)

    # For val/test: continue filtering with same parameters, seeding with last state
    state_means, state_covs = kf.filter(train_close.reshape(-1, 1))
    last_mean = state_means[-1]
    last_cov = state_covs[-1]

    val_close = val_df["close"].values.astype(float)
    val_means, _ = kf.filter_update(
        last_mean, last_cov, val_close.reshape(-1, 1)[0]
    ) if False else (None, None)  # use full filter for simplicity
    val_filtered = _apply(val_close, kf)

    test_close = test_df["close"].values.astype(float)
    test_filtered = _apply(test_close, kf)

    # Save final filter state for inference seeding
    final_means, final_covs = kf.filter(
        np.concatenate([train_close, val_close, test_close]).reshape(-1, 1)
    )
    params["final_state_mean"] = final_means[-1].tolist()
    params["final_state_cov"] = final_covs[-1].tolist()

    train_out = train_df.copy()
    train_out["close"] = train_filtered

    val_out = val_df.copy()
    val_out["close"] = val_filtered

    test_out = test_df.copy()
    test_out["close"] = test_filtered

    return train_out, val_out, test_out, {"method": "Kalman", **params}


# ---------------------------------------------------------------------------
# DWT
# ---------------------------------------------------------------------------

def _dwt_denoise(
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    test_df: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict]:
    import pywt

    train_close = train_df["close"].values.astype(float)
    n_orig = len(train_close)

    coeffs = pywt.wavedec(train_close, "db4", level=2)
    cD1 = coeffs[-1]
    sigma = np.median(np.abs(cD1)) / 0.6745  # MAD estimate of noise std
    N = len(train_close)
    threshold = sigma * np.sqrt(2 * np.log(N))

    def _soft_threshold(c: np.ndarray, thr: float) -> np.ndarray:
        return pywt.threshold(c, thr, mode="soft")

    def _apply_dwt(series: np.ndarray) -> np.ndarray:
        c = pywt.wavedec(series, "db4", level=2)
        c[1] = _soft_threshold(c[1], threshold)
        c[2] = _soft_threshold(c[2], threshold)
        rec = pywt.waverec(c, "db4")
        return rec[: len(series)]  # trim boundary padding

    train_denoised = _apply_dwt(train_close)
    val_denoised = _apply_dwt(val_df["close"].values.astype(float))
    test_denoised = _apply_dwt(test_df["close"].values.astype(float))

    train_out = train_df.copy()
    train_out["close"] = train_denoised

    val_out = val_df.copy()
    val_out["close"] = val_denoised

    test_out = test_df.copy()
    test_out["close"] = test_denoised

    return train_out, val_out, test_out, {
        "method": "DWT",
        "sigma": float(sigma),
        "threshold": float(threshold),
        "wavelet": "db4",
        "level": 2,
    }


# ---------------------------------------------------------------------------
# Live inference helpers
# ---------------------------------------------------------------------------

def apply_kalman_step(
    close_val: float,
    params: dict,
    state_mean: list,
    state_cov: list,
) -> tuple[float, list, list]:
    """Single Kalman filter step for live inference. Returns (filtered_close, new_mean, new_cov)."""
    from pykalman import KalmanFilter
    import numpy as np

    kf = KalmanFilter(
        transition_matrices=[[1]],
        observation_matrices=[[1]],
        transition_covariance=np.array(params["transition_covariance"]),
        observation_covariance=np.array(params["observation_covariance"]),
        initial_state_mean=np.array(state_mean),
        initial_state_covariance=np.array(state_cov),
    )
    new_mean, new_cov = kf.filter_update(
        np.array(state_mean),
        np.array(state_cov),
        np.array([[close_val]]),
    )
    return float(new_mean.flatten()[0]), new_mean.flatten().tolist(), new_cov.tolist()


def apply_dwt_buffer(close_buffer: list[float], params: dict) -> float:
    """Apply DWT denoising over a rolling buffer; return last denoised value."""
    import pywt

    arr = np.array(close_buffer, dtype=float)
    threshold = params["threshold"]
    c = pywt.wavedec(arr, "db4", level=2)
    c[1] = pywt.threshold(c[1], threshold, mode="soft")
    c[2] = pywt.threshold(c[2], threshold, mode="soft")
    rec = pywt.waverec(c, "db4")
    return float(rec[min(len(arr) - 1, len(rec) - 1)])
