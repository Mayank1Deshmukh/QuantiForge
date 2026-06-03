# QuantiForge MVP — Data Engineering & Scoring Model Specification

**Version:** 1.1  
**Status:** Draft  
**Project Type:** Academic Capstone — Educational ML Simulation Platform  
**Last Updated:** June 2026

---

## 1. Executive Summary

This document defines the complete data lifecycle, mathematical transformations, and evaluation metrics for the QuantiForge MVP. It covers how raw hourly market data is ingested from two sources, cleaned, denoised, split, normalized, and vectorized into PyTorch tensors — and how trained models are scored against a classical ARIMA baseline.

The pipeline is designed for local Windows/CUDA execution. All tensor operations run on the user's NVIDIA GPU via CUDA. CPU fallback is supported but not the target path.

---

## 2. Data Ingestion

### 2.1 Data Sources

| Context | Source | Method |
|---|---|---|
| Historical (training, validation, test) | `yfinance` Python library | Batch pull at session start |
| Live inference | Alpaca Markets Free Tier | WebSocket streaming |

### 2.2 Core Feature Vector

The system uses **unadjusted** OHLCV hourly candlestick data. Split- and dividend-adjusted prices are explicitly avoided to prevent look-ahead bias when the model is eventually used for real-time inference.

| Feature | Description | Role |
|---|---|---|
| `open` | Opening price of the hour | Input |
| `high` | Maximum price during the hour | Input |
| `low` | Minimum price during the hour | Input |
| `close` | Closing price of the hour | Input + **Primary Target** |
| `volume` | Total shares traded during the hour | Input |

### 2.3 Data Quality & Gap Handling

Hourly equity data contains structural gaps (weekends, US market holidays, pre/post-market hours). These are **not** anomalies — they must be handled explicitly before any windowing occurs.

**Rules (applied in this order):**

1. **Filter to market hours only:** Retain rows where the timestamp falls within regular US market hours (09:30–16:00 ET, Monday–Friday). All pre-market, post-market, and overnight bars are dropped.
2. **Drop holiday and partial-session gaps:** Any trading day with fewer than 6 regular-session hourly bars is dropped entirely (partial sessions create sequence discontinuities).
3. **Forward-fill isolated missing bars:** If a single bar is missing within an otherwise complete trading day (data provider dropout), forward-fill from the prior bar. Maximum fill span: 1 bar. Gaps larger than 1 bar trigger a full day drop.
4. **Assert valid prices and volume:** Rows with non-positive prices or negative volume are dropped and logged as warnings. Zero-volume regular-session bars are retained only if the upstream provider marks them as valid; otherwise they are treated as provider dropouts under Rule 3.
5. **Reset index to a clean integer sequence** after all filtering.

> **Implementation note:** Gap handling must occur _before_ the train/val/test split. Do not apply it per-split.

### 2.4 Approximate Data Volume

For reference, at 2 years of hourly data filtered to market hours:

| Stat | Approx. Value |
|---|---|
| Trading days per year | ~252 |
| Market hours per day | 6.5 → typically 6–7 provider bars |
| Total bars (2 years) | ~3,000–3,500 rows per ticker |
| After 80/10/10 split | ~2,400–2,800 train / ~300–350 val / ~300–350 test |

These are approximations. Actual counts vary by ticker and data availability. The pipeline must tolerate ±5% variance without breaking.

---

## 3. Train / Validation / Test Split

**Ratios:** 80% train / 10% validation / 10% test

**Method:** Chronological (time-ordered) split. **Do not shuffle.** Shuffling would introduce look-ahead bias by allowing future data to appear in the training set.

```
|──────────────── TRAIN (80%) ───────────────|── VAL (10%) ──|── TEST (10%) ──|
t=0                                          t=0.8          t=0.9           t=1.0
```

- **Train:** Used for gradient descent and weight updates
- **Validation:** Used for early stopping and loss curve monitoring during training
- **Test:** Held out entirely until training is complete. Used exclusively for final metric computation reported in the Model Registry and Evaluation Dashboard

> **Critical constraint:** The test set must never be observed during training or hyperparameter selection. It is the ground truth for all reported scores.

---

## 4. Preprocessing & Denoising

Denoising is applied **only to the `close` price feature** before scaling or windowing. The `open`, `high`, `low`, and `volume` features are passed through raw. The three options are mutually exclusive.

### Option A — Raw (None)

Raw OHLCV values pass directly to the scaling phase. Establishes a baseline to quantify the uplift (or lack thereof) from denoising.

---

### Option B — Kalman Filter

A linear state-space model that estimates the true underlying price by filtering out Gaussian transaction noise.

**State transition model:**

$$x_k = x_{k-1} + w_k$$

**Observation model:**

$$z_k = x_k + v_k$$

Where:
- $x_k$ = true (latent) price state at time $k$
- $z_k$ = observed close price at time $k$
- $w_k \sim \mathcal{N}(0, Q)$ = process noise
- $v_k \sim \mathcal{N}(0, R)$ = measurement noise

**Implementation:** `pykalman.KalmanFilter`

**Key parameters:**
- `transition_matrices = [[1]]`
- `observation_matrices = [[1]]`
- `initial_state_mean = close[0]`
- Noise covariances $Q$ and $R$ estimated via EM on the training split only

**Output:** Filtered state means replace raw `close` values in the dataset. The fitted Kalman parameters are saved alongside the model weights for use during live inference.

> **Fit constraint:** The Kalman filter is fit on the **training split only**. The same fitted parameters are applied (transform-only) to the validation, test, and live data.

---

### Option C — Discrete Wavelet Transform (DWT)

Decomposes the price signal into frequency sub-bands and suppresses high-frequency noise components.

**Wavelet family:** Daubechies 4 (`db4`)  
**Decomposition level:** 2  
**Implementation:** `PyWavelets` (`pywt`)

**Steps:**

1. **Decompose** the `close` price series into approximation and detail coefficients:
   ```
   [cA2, cD2, cD1] = pywt.wavedec(close, 'db4', level=2)
   ```
2. **Threshold** the detail coefficients using soft thresholding to suppress high-frequency noise:
   ```
   threshold = σ × √(2 × log(N))    # Universal threshold (Donoho & Johnstone)
   ```
   Where $\sigma$ is the median absolute deviation of `cD1` and $N$ is the signal length.
3. **Reconstruct** using the Inverse DWT:
   ```
   close_denoised = pywt.waverec([cA2, cD2_thresh, cD1_thresh], 'db4')
   ```
4. Trim the reconstructed signal to the original length (DWT boundary padding can add 1–2 samples).

> **Fit constraint:** The threshold $\sigma$ is computed on the **training split only** and reused for validation, test, and live data transforms.

---

## 5. Normalization & Scaler Persistence

### 5.1 Normalization Method

**Min-Max Scaling** mapping all features to the range $[-1, 1]$:

$$x_{\text{scaled}} = 2 \times \frac{x - x_{\min}}{x_{\max} - x_{\min}} - 1$$

A separate scaler is fit per feature (i.e., one scaler for `close`, one for `volume`, etc.) to prevent high-volume values from dominating the `close` scale.

### 5.2 Fit Constraint (Data Leakage Prevention)

| Split | Scaler Action |
|---|---|
| Train | `scaler.fit_transform(X_train)` — parameters computed here |
| Validation | `scaler.transform(X_val)` — training parameters reused |
| Test | `scaler.transform(X_test)` — training parameters reused |
| Live stream bar | `scaler.transform(bar)` — training parameters reused |

**Never** call `fit` or `fit_transform` on the validation, test, or live data.

### 5.3 Scaler Persistence

The fitted scalers must be serialized and saved alongside the model weights so inference can correctly inverse-transform predictions back to USD.

**Serialization:** `joblib.dump(scaler, f"./models/{run_id}_scaler.joblib")`

**Saved artifact bundle per training run:**

```
./models/
  {run_id}.pt               # PyTorch model weights (state_dict)
  {run_id}_scaler.joblib    # Fitted MinMaxScaler (all features)
  {run_id}_config.json      # Full ModelConfig snapshot (hyperparams, backbone, denoiser)
  {run_id}_metrics.json     # Final RMSE, MAE, MAPE, DA on test set
```

> All metric reporting (RMSE, MAE, MAPE, DA) must be computed on **inverse-transformed** (real USD) values, not scaled values.

---

## 6. Sliding Window Tensor Construction

### 6.1 Parameters

| Parameter | Symbol | Configurable Values |
|---|---|---|
| Sequence / Lookback Length | $L$ | 24, 48, 72 (hours) |
| Feature Dimension | $F$ | 5 (OHLCV) |
| Prediction Horizon | $H$ | 1 (fixed; next hour's close) |

### 6.2 Tensor Shapes

| Tensor | Shape | Description |
|---|---|---|
| Input $X$ | $(N, L, F)$ | $N$ windows of $L$ hours, each with $F$ features |
| Target $Y$ | $(N, 1)$ | The `close` price at $t + 1$ for each window |

### 6.3 Window Construction Logic

```python
for i in range(len(data) - L - H + 1):
    X[i] = data[i : i + L]          # shape: (L, F)
    Y[i] = data[i + L, close_idx]   # scalar: close at t+L
```

> **Boundary rule:** Windows are built over a contiguous trading-bar index, not wall-clock hours. A 24/48/72-bar lookback may span multiple trading days after overnight/weekend gaps are removed. Windows must not span invalid provider gaps, dropped partial sessions, or missing-bar spans larger than the one-bar forward-fill limit from Section 2.3. Preserve a continuity flag during gap handling and only window across rows marked as continuous.

---

## 7. Neural Network Architecture Specifications

All architectures are implemented in PyTorch and compiled dynamically by the daemon from the `ModelConfig` JSON payload. All models terminate in a `nn.Linear(hidden_dim, 1)` output layer producing a single continuous prediction.

### 7.1 Architecture Table

| Backbone | Key PyTorch Modules | Notes |
|---|---|---|
| LSTM | `nn.LSTM`, `nn.Dropout`, `nn.Linear` | Standard recurrent baseline |
| GRU | `nn.GRU`, `nn.Dropout`, `nn.Linear` | Faster convergence than LSTM; fewer parameters |
| BiLSTM | `nn.LSTM(bidirectional=True)`, `nn.Linear` | Input to Linear layer: `hidden_dim × 2` |
| TCN (CNN-LSTM) | `nn.Conv1d`, `nn.ReLU`, `nn.LSTM`, `nn.Linear` | Conv1d extracts local OHLCV feature maps; LSTM models temporal dependencies |
| TFT | `pytorch_forecasting.TemporalFusionTransformer` | **See Section 7.2** |

### 7.2 TFT Implementation Note

`pytorch_forecasting.TemporalFusionTransformer` does **not** accept raw PyTorch tensors. It requires a `TimeSeriesDataSet` object with explicitly declared static, known, and unknown covariates. This diverges from the unified tensor pipeline used by all other backbones.

**Daemon handling:**

- The daemon must detect `backbone == "TFT"` and branch into a separate data preparation path using `pytorch_forecasting.TimeSeriesDataSet`
- All OHLCV features are declared as `time_varying_unknown_reals`
- A synthetic `time_idx` integer column must be added to the DataFrame before `TimeSeriesDataSet` construction
- TFT training uses `pytorch_lightning.Trainer` rather than a raw PyTorch training loop

This is a known complexity. Do not attempt to force TFT into the generic tensor pipeline.

---

## 8. Model Evaluation & Scoring Metrics

All metrics are computed on the held-out **test set** using **inverse-transformed (real USD)** predictions and actuals. Let $y_i$ be the actual close price and $\hat{y}_i$ be the predicted close price for sample $i$.

### 8.1 Root Mean Squared Error (RMSE)

Primary loss proxy. Heavily penalizes large prediction errors (outliers).

$$RMSE = \sqrt{\frac{1}{n}\sum_{i=1}^{n}(y_i - \hat{y}_i)^2}$$

### 8.2 Mean Absolute Error (MAE)

Linear average error in USD. Easier to interpret than RMSE for a non-technical audience.

$$MAE = \frac{1}{n}\sum_{i=1}^{n}|y_i - \hat{y}_i|$$

### 8.3 Mean Absolute Percentage Error (MAPE)

Expresses error as a percentage. Enables cross-ticker comparison between stocks with different price magnitudes (e.g., SPY ~$530 vs TSLA ~$180).

$$MAPE = \frac{100\%}{n}\sum_{i=1}^{n}\left|\frac{y_i - \hat{y}_i}{y_i}\right|$$

### 8.4 Directional Accuracy (DA)

Measures how often the model correctly predicted the direction (up or down) of the next hourly move, regardless of magnitude. The most presentation-friendly metric.

$$DA = \frac{1}{n-1}\sum_{i=1}^{n-1} \mathbf{1}\left[\text{sgn}(y_{i+1} - y_i) = \text{sgn}(\hat{y}_{i+1} - y_i)\right]$$

Where $\mathbf{1}[\cdot]$ is the indicator function. A value of 0.50 is equivalent to a coin flip. Values above 0.55 are considered meaningful for hourly equity data.

### 8.5 Metric Reporting Rules

- All four metrics are computed once, on the test set, after training completes
- Metrics are written to `{run_id}_metrics.json` and stored in the Model Registry
- Metrics are **not** recomputed live — the values in the Registry are final
- ARIMA metrics are computed on-demand using the same test set slice and the same four metrics

---

## 9. ARIMA Baseline

### 9.1 Purpose

ARIMA serves as the classical statistical benchmark. ML models must demonstrably outperform it on at least RMSE and DA to validate the deep learning approach.

### 9.2 Implementation

**Library:** `statsmodels.tsa.arima.model.ARIMA`  
**Order:** Fixed at $(p=5, d=1, q=0)$

The fixed order is a deliberate MVP constraint. Auto-ARIMA (grid search over $p, d, q$) is explicitly excluded — it is too slow for live demo conditions and unnecessary for capstone comparison purposes.

**Parameter rationale:**
- $p=5$: Captures autoregressive patterns across the last 5 hours
- $d=1$: First differencing to achieve stationarity on price levels
- $q=0$: No moving average component (keeps the baseline simple and fast)

### 9.3 Execution Constraints

- ARIMA runs **entirely on CPU** — it does not use the PyTorch tensor pipeline or the daemon
- It is fit on the same training split used for neural network training
- Predictions are generated on the test split and scored using the same four metrics (Section 8)
- ARIMA is triggered on-demand when the user adds it to the Evaluation Dashboard; it is not pre-computed at data load time
- Expected runtime: < 30 seconds for 2,400 training samples at order (5,1,0)

---

## 10. Live Inference Data Contract

During Live Stream Mode, incoming Alpaca WebSocket bars must be transformed using the **same scaler** fit during training before being passed to the model.

**Inference pipeline per live bar:**

```
Raw bar (JSON)
    → Extract OHLCV
    → Apply denoiser (if configured; uses training-fit parameters)
    → Apply scaler.transform() (uses training-fit scaler)
    → Append to rolling buffer of length L
    → If buffer length == L: run model.forward(buffer) [no gradient]
    → Inverse-transform predicted close → USD
    → Emit inference result to frontend
```

**Rolling buffer:** A FIFO queue of length $L$ (the configured lookback). Each new live bar appends to the right and drops the oldest bar from the left. Inference only fires when the buffer is full.

**Buffer cold-start:** On Live Stream Mode activation, the buffer is pre-seeded with the last $L$ bars of the historical dataset for that ticker (already scaled). The first live bar triggers the first inference immediately.
