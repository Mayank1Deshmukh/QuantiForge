# QuantiForge MVP — Product Requirements Document

**Version:** 1.1  
**Status:** Draft  
**Project Type:** Academic Capstone — Educational ML Simulation Platform  
**Last Updated:** June 2026

---

## 1. Executive Summary

QuantiForge is a low-code/no-code deep learning simulation platform built for educational validation and architecture comparison. The platform enables users to visually configure time-series neural network architectures, train them against historical US Equity hourly data, and compare their predictive accuracy against classical baselines (ARIMA) and other trained model iterations — all within a zero-ongoing-cost infrastructure.

**Primary Deliverable:** A live, interactive capstone demonstration showing real-time convergence between actual market prices and ML model inferences, deployable at zero ongoing cost.

---

## 2. User Persona

**The Academic Presenter / Student Researcher**

- Possesses theoretical knowledge of ML architectures (sequence modeling, backpropagation, hyperparameter tuning)
- Needs a unified workspace to rapidly prototype and compare models without writing data pipeline or charting boilerplate
- Must present results convincingly to an evaluation committee under live demo conditions
- Has access to a Windows machine with an NVIDIA GPU for local compute

---

## 3. Data Scope & Constraints

All data parameters are strictly bounded to maintain performance on local hardware and remain within the zero-budget tier.

| Parameter | Specification |
|---|---|
| Asset Class | US Equities (SPY, AAPL, NVDA, TSLA) |
| Data Granularity | Hourly (1H) candles |
| Historical Depth | Up to 2 years per ticker |
| Historical Source | `yfinance` (open-source Python wrapper) |
| Live Streaming Source | Alpaca Markets Free Tier WebSocket API |
| Local Compute | Windows + NVIDIA GPU (CUDA-enabled PyTorch) |

---

## 4. Functional Requirements

### 4.1 Architecture Builder (Model Configuration Wizard)

A step-by-step, card-based UI wizard that replaces code-based model configuration. Each section is a discrete configuration card that advances linearly.

#### Step 1 — Ticker & Data Selection
- Dropdown for ticker selection (SPY, AAPL, NVDA, TSLA; extensible)
- Date range is fixed to the most recent 2 years of hourly data for the MVP; no date picker is exposed
- "Fetch & Preview" action that validates data availability and shows a sparkline preview

#### Step 2 — Denoising Pipeline (Optional Preprocessing)
Toggle button group — mutually exclusive selection:

| Option | Description |
|---|---|
| None | Raw OHLCV data fed directly |
| Kalman Filter | Linear state-space smoothing |
| Discrete Wavelet Transform (DWT) | Signal decomposition using `db4` wavelet |

#### Step 3 — Architecture Backbone Selection
Dropdown with the following supported architectures:

| Backbone | Notes |
|---|---|
| Temporal Fusion Transformer (TFT) | Attention-based; highest complexity |
| CNN-LSTM / Temporal Convolutional Network (TCN) | Hybrid spatial-temporal |
| BiLSTM | Bidirectional LSTM |
| Standard LSTM | Baseline recurrent architecture |
| GRU | Faster convergence than LSTM; fewer parameters |

#### Step 4 — Hyperparameter Configuration

| Parameter | Input Type | Valid Range / Options |
|---|---|---|
| Sequence / Lookback Length | Segmented control | 24h, 48h, 72h |
| Learning Rate | Numerical input | 0.0001 – 0.1 |
| Batch Size | Segmented control | 16, 32, 64, 128 |
| Epochs | Slider + number input | 1 – 100 |
| Dropout Rate | Slider | 0.0 – 0.5 |
| Optimizer | Dropdown | AdamW, Ranger, SGD |

#### Step 5 — Compute Target Selection
Radio group:
- **Local Daemon** — Train using local Python daemon (CUDA via NVIDIA GPU)
- **RunPod Serverless** — Train on cloud GPU (requires user-provided API key entered in Settings)

#### Step 6 — Review & Submit
- Summary card of all selected configuration values
- "Start Training" CTA that triggers the appropriate compute backend

---

### 4.2 Compute Engine

The frontend communicates with two compute backends. The web app itself has no training logic.

```
┌─────────────────────────────────┐
│     Next.js Web App (UI)        │
│   Sends: ModelConfig JSON       │
│   Receives: epoch logs, weights │
└────────────────┬────────────────┘
                 │
     ┌───────────┴───────────┐
     ▼                       ▼
┌─────────────────┐   ┌──────────────────────┐
│  Local Python   │   │  RunPod Serverless    │
│  Daemon         │   │  Container           │
│  (WebSocket)    │   │  (REST trigger)      │
│  Port: 8765     │   │  User API Key        │
└─────────────────┘   └──────────────────────┘
```

#### 4.2.1 Local Python Daemon

- Lightweight Python process running on the user's local Windows machine
- Communicates with the Next.js backend via WebSocket (default: `ws://localhost:8765`)
- Receives a `ModelConfig` JSON payload, dynamically constructs the corresponding PyTorch model, and begins training
- Streams back structured epoch-level progress events: `{ epoch, train_loss, val_loss, status }`
- On completion, saves model weights to a local directory (e.g., `./models/<run_id>.pt`) and emits a `TRAINING_COMPLETE` event with the run metadata
- Leverages CUDA automatically if an NVIDIA GPU is detected; falls back to CPU

**Daemon startup:** User runs `python daemon.py` locally before using the app. The UI shows a persistent connection status indicator.

#### 4.2.2 RunPod Serverless Backend

- User provides RunPod API key via the Settings screen (stored in `localStorage`; never stored server-side)
- The Next.js API route proxies a container trigger request to RunPod with the `ModelConfig` JSON payload and the user-provided key in memory for that request only
- The RunPod container trains the model, saves weights to a cloud storage bucket, and returns a download URL
- The container shuts down immediately post-training to minimize cost (target: < $0.10 per full training run)

---

### 4.3 Training Progress Monitor

Displayed while a training job is active:

- Animated epoch progress bar (current epoch / total epochs)
- Live dual-line chart: training loss vs. validation loss per epoch (updates in real time via WebSocket stream)
- ETA estimate (rolling average of epoch duration)
- "Cancel Training" control that sends a `STOP` signal to the active backend

---

### 4.4 Model Registry

A persistent local store of all successfully completed training runs. Model Registry metadata is stored in the daemon-managed SQLite database. The browser treats registry data as a fetched cache, not as the source of truth.

**Per model record:**

| Field | Description |
|---|---|
| `run_id` | UUID generated at job submission |
| `ticker` | e.g., `AAPL` |
| `backbone` | e.g., `BiLSTM` |
| `denoiser` | e.g., `DWT` or `None` |
| `hyperparams` | Full config snapshot (JSON) |
| `metrics` | RMSE, MAE, MAPE, Directional Accuracy on held-out test set |
| `weights_path` | Local file path or RunPod cloud URL |
| `created_at` | ISO timestamp |
| `status` | `completed` / `failed` / `training` |

The ARIMA baseline is computed on-demand (not stored as a trained model) and always available as a comparison reference.

---

### 4.5 Evaluation & Comparison Dashboard

The primary deliverable surface for the capstone presentation.

#### Chart Canvas
- High-fidelity multi-line chart (Recharts or Chart.js) displaying actual hourly OHLCV close prices
- Each overlaid model renders as a distinct colored prediction line
- X-axis: time (hourly); Y-axis: price (USD); both axes support dynamic zoom and pan
- Chart title reflects active ticker and evaluation date range

#### Model Selection Sidebar
- Checklist of all models from the Model Registry
- ARIMA baseline always present as a pinned row
- Checking/unchecking a model immediately adds/removes its prediction overlay
- Per-model color swatch, backbone label, and RMSE badge displayed inline
- "Compare All" shortcut selects all available models simultaneously

#### Metrics Comparison Table
Tabular view beneath the chart, auto-populated for all selected models:

| Model | Backbone | Denoiser | RMSE | MAE | MAPE | Dir. Accuracy |
|---|---|---|---|---|---|---|
| ARIMA Baseline | — | — | — | — | — | — |
| run_abc123 | BiLSTM | DWT | — | — | — | — |

---

### 4.6 Live Stream Mode

Connects the Evaluation Dashboard to real-time market data.

**Activation:** Toggle switch labeled "Live Mode" in the dashboard header.

**Behavior when active:**
1. Establishes a WebSocket connection to Alpaca Markets Free Tier using user-provided credentials (stored in Settings)
2. As each new hourly bar is received, the backend executes a forward-pass inference for every currently selected model
3. Inference results are pushed to the frontend and appended to each model's prediction line in real time
4. The chart auto-scrolls to the latest timestamp

**Data contract — live bar event:**
```json
{
  "ticker": "AAPL",
  "timestamp": "2026-06-03T14:00:00Z",
  "open": 213.45,
  "high": 214.10,
  "low": 213.00,
  "close": 213.78,
  "volume": 482910
}
```

**Data contract — inference response:**
```json
{
  "run_id": "run_abc123",
  "timestamp": "2026-06-03T15:00:00Z",
  "predicted_close": 214.20
}
```

---

### 4.7 Simulation Mode (Presentation Fallback)

Activated when live markets are closed or Alpaca credentials are unavailable.

- Loads a pre-recorded historical day's hourly data (bundled as a static JSON asset in the repo)
- Replays bars at configurable accelerated speed (default: 1 real hour compressed to 60 seconds, i.e., 60×)
- Speed multiplier control: 1×, 10×, 30×, 60× (one hour in 60 seconds)
- Visually identical to Live Stream Mode; a persistent "SIMULATION" banner distinguishes it

---

### 4.8 Settings Screen

| Setting | Description |
|---|---|
| Alpaca API Key & Secret | For Live Stream Mode (stored in `localStorage`) |
| RunPod API Key | For cloud compute (stored in `localStorage`) |
| Local Daemon URL | Override default `ws://localhost:8765` |
| Default Ticker | Pre-selected on app load |
| Simulation Speed | Default replay speed multiplier |

---

## 5. Non-Functional Requirements

### 5.1 Performance
- Chart re-renders on model toggle must complete within 300ms
- Epoch progress events must render with ≤ 500ms latency from daemon emission
- Historical data fetch (2 years hourly) must complete within 10 seconds on a standard broadband connection

### 5.2 Reliability & Error States
Every integration point must have a defined error state:

| Failure | UI Behavior |
|---|---|
| Daemon not running | Persistent warning banner: "Local daemon offline. Start daemon.py to enable local training." |
| `yfinance` fetch fails | Inline error on data preview card with retry action |
| Alpaca WebSocket disconnects | Auto-reconnect (3 attempts, exponential backoff); toast notification |
| RunPod job fails | Error state in Model Registry row with raw error message |
| Model weights file missing | "Weights unavailable" badge on model; excluded from chart overlay |

### 5.3 Deployment
- **Frontend:** Vercel Hobby Tier (free). No server-side secret storage; API keys are user-provided and stored client-side only.
- **Python Daemon:** Runs locally on user's Windows machine. Must support Python 3.10+ with CUDA-enabled PyTorch. No Docker required.
- **No hosted persistent database:** Model registry data is stored in a local SQLite file written by the daemon. Browser `localStorage` is used only for credentials and user preferences.

### 5.4 Browser Support
- Chrome 120+ (primary target for live demo)
- No mobile responsiveness required (desktop-only presentation context)

### 5.5 Security
- No user authentication required (single-user local tool)
- API keys are stored only in browser `localStorage` and never logged. Alpaca credentials are used directly by the browser; the RunPod key may be sent transiently through the Vercel API route solely to trigger a RunPod job and is never stored server-side.

---

## 6. Out of Scope (MVP)

The following are explicitly excluded from the MVP to maintain scope:

- Portfolio-level multi-asset prediction (single ticker per run only)
- Model fine-tuning or transfer learning
- Options, futures, or crypto asset classes
- User accounts, authentication, or multi-user collaboration
- Automated hyperparameter search (e.g., Optuna)
- Export of trained weights to ONNX or other formats
- Mobile or tablet UI layouts
- Sub-hourly (tick, 1-minute) data granularity

---

## 7. Glossary

| Term | Definition |
|---|---|
| Daemon | Local Python process (`daemon.py`) that handles model compilation and training on the user's machine |
| Run | A single training job identified by a unique `run_id` |
| Backbone | The neural network architecture selected for a training run |
| Denoiser | An optional preprocessing transformation applied to input tensors before training |
| Forward pass | Inference only (no gradient computation); used during Live Stream Mode |
| ARIMA | AutoRegressive Integrated Moving Average; classical statistical baseline, computed on-demand |
| Simulation Mode | Replay of pre-recorded data mimicking live stream behavior for offline presentations |
