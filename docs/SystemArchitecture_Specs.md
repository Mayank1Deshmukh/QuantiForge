# QuantiForge MVP — System Architecture & Tech Stack Specification

**Version:** 1.1
**Status:** Draft
**Project Type:** Academic Capstone — Educational ML Simulation Platform
**Last Updated:** June 2026

---

## 1. System Topology Overview

QuantiForge uses a decoupled, multi-runtime architecture designed to operate at zero infrastructure cost. The system eliminates hosted databases and persistent cloud application servers by shifting state persistence to a local SQLite file (written by the daemon) and offloading all compute to either a transient local daemon or a serverless cloud container.

```
                  ┌──────────────────────────────────────────────────┐
                  │               NEXT.JS FRONTEND                   │
                  │        (Deployed on Vercel Hobby Tier)           │
                  │                                                  │
                  │   ┌──────────────────┐    ┌──────────────────┐   │
                  │   │  Zustand State   │    │  Browser Storage │   │
                  │   │ (UI, logs, chart │    │  (localStorage)  │   │
                  │   │  render state)   │    │  API keys only   │   │
                  │   └──────────────────┘    └──────────────────┘   │
                  └──────────┬───────────────────────────┬───────────┘
                             │                           │
               (Local WS)   │                           │  (REST + API Key)
          ws://localhost:8765│                           │  https://api.runpod.ai
                             ▼                           ▼
┌────────────────────────────────────────┐  ┌──────────────────────────────────────┐
│         LOCAL PYTHON DAEMON            │  │     RUNPOD SERVERLESS TIER           │
│      (Runs on User's Windows Machine)  │  │    (Transient GPU Container)         │
│                                        │  │                                      │
│  ┌────────────┐  ┌──────────────────┐  │  │  ┌──────────────┐  ┌─────────────┐  │
│  │ FastAPI /  │  │ PyTorch / CUDA   │  │  │  │ PyTorch/CUDA │  │  S3/MinIO   │  │
│  │ WebSocket  │  │ Training Engine  │  │  │  │   Worker     │  │   Bucket    │  │
│  │ Server     │  │ + ARIMA Engine   │  │  │  └──────────────┘  └─────────────┘  │
│  └────────────┘  └──────────────────┘  │  └──────────────────────────────────────┘
│                                        │
│  ┌─────────────────────────────────┐   │
│  │  SQLite — Model Registry Store  │   │
│  │  ./models/registry.db           │   │
│  └─────────────────────────────────┘   │
└────────────────────────────────────────┘
```

---

## 2. Runtime Components

### 2.1 Presentation & Orchestration Layer — Next.js Frontend

**Deployment:** Vercel Hobby Tier (serverless functions capped at 10-second execution timeout).

**Responsibilities:**
- Renders the multi-step Architecture Builder wizard
- Displays the live Training Progress Monitor (driven by WebSocket frames from the daemon)
- Renders the Evaluation & Comparison Dashboard (chart + metrics table)
- Manages Simulation Mode replay via a client-side `setInterval` scheduler
- Initiates and maintains the Alpaca Markets WebSocket connection for Live Stream Mode

**State Management:**
- Zustand for all transient UI state: wizard step progress, active training job, chart overlay selections, real-time epoch logs
- `localStorage` for API credentials **only** (Alpaca key/secret, RunPod API key, daemon URL override) — never written to any server
- Model Registry metadata is the authoritative source of truth in SQLite (written by the daemon). The frontend queries this via a dedicated REST endpoint on the daemon rather than maintaining its own copy in localStorage.

**Security posture:** The frontend transmits no credentials to any QuantiForge-controlled server. Alpaca WebSocket connections are established directly from the browser using client-stored credentials. This is acceptable for a single-user local/demo deployment.

---

### 2.2 Local Compute Tier — Python Daemon

**Process type:** Persistent background process (`daemon.py`) launched manually by the user on their local Windows machine before using the app.

**Network interface:** Binds exclusively to `127.0.0.1:8765`. Exposes:
- A WebSocket endpoint (`/ws`) for training telemetry streaming and live inference forward-pass results
- A REST HTTP endpoint (`/api/`) for synchronous operations: registry reads, ARIMA on-demand execution, daemon health checks

**CORS:** FastAPI `CORSMiddleware` must whitelist both `http://localhost:3000` (local dev) and the production Vercel deployment URL (set via a daemon config file or environment variable).

**Responsibilities:**

| Responsibility | Detail |
|---|---|
| Data ingestion | Fetches historical OHLCV via `yfinance`; applies gap handling rules from the Data Engineering Spec |
| Preprocessing pipeline | Applies denoising (Kalman / DWT / None), scaling, and sliding window tensor construction |
| Model compilation | Dynamically constructs a PyTorch model graph from the `ModelConfig` JSON payload |
| Training loop | Runs backpropagation, emits `EPOCH_METRIC` events per epoch, writes artifacts on completion |
| ARIMA execution | Fits and evaluates ARIMA(5,1,0) on-demand via a REST call from the dashboard; never pre-computed |
| Forward-pass inference | Loads saved weights and scaler for a given `run_id`, executes inference on a supplied input window |
| Model Registry writes | All training outcomes are persisted to `./models/registry.db` (SQLite) — this is the canonical store |
| Registry API | Exposes `GET /api/registry` (all runs), `GET /api/registry/{run_id}` (single run detail) |

**GPU handling:** Daemon auto-detects CUDA on startup and reports `cuda_available` in the handshake response. Falls back to CPU silently. All PyTorch operations use the detected device.

**Daemon startup UX:** The UI displays a persistent connection status indicator (green/amber/red). If the WebSocket connection cannot be established, a non-dismissible warning banner reads: *"Local daemon offline. Run `python daemon.py` to enable local training."*

---

### 2.3 Cloud Compute Tier — RunPod Serverless

**Process type:** On-demand GPU container, triggered via HTTPS POST to `https://api.runpod.ai/v2/{endpoint_id}/run`.

**Trigger path:** The Next.js client calls its own API route (`/api/runpod/trigger`), which proxies the request to RunPod using the user's API key (supplied in the request body from `localStorage` — never stored server-side).

**Responsibilities:**
- Receives the `ModelConfig` JSON payload (identical schema to the daemon contract — Section 4.2)
- Replicates the full data + preprocessing pipeline internally (same logic as the daemon)
- Trains the model on a CUDA-enabled container image
- Saves the artifact bundle (`{run_id}.pt`, `{run_id}_scaler.joblib`, `{run_id}_config.json`, `{run_id}_metrics.json`) to an ephemeral S3/MinIO bucket
- Signs and returns a time-limited download URL for each artifact
- Self-terminates immediately after upload to minimize cost (target: < $0.10 per full training run)

**Post-completion flow:** The Next.js client polls the RunPod job status endpoint until completion, downloads all four artifacts, and uploads them to the local daemon via `POST /api/registry`. The daemon writes the run record to SQLite and stores the weights at the configured `weights_path` (or a cloud URL reference). This ensures the Model Registry remains the daemon-managed SQLite store regardless of which compute backend was used.

---

## 3. Technology Stack

### 3.1 Frontend

| Concern | Choice | Rationale |
|---|---|---|
| Core framework | Next.js 14+ (App Router) | React Server Components for layout shells; client components for all stateful UI |
| State management | Zustand | Minimal boilerplate; low overhead for 100ms-interval WebSocket frame updates |
| Visualization | See Section 3.1.1 | Decision documented below |
| UI primitives | Tailwind CSS + shadcn/ui | Utility-first styling; accessible component primitives |
| WebSocket client | Native browser `WebSocket` API | No additional library needed for the daemon connection |

#### 3.1.1 Chart Renderer Decision

Two options are viable. **The recommendation is Chart.js (Canvas) for the live dashboard and Recharts (SVG) for the training loss monitor.** Use both in the same application — they are not mutually exclusive.

| Renderer | Library | Strengths | Weaknesses | Recommended Use |
|---|---|---|---|---|
| Canvas (HTML5) | Chart.js | High-frequency update performance; no DOM node creation per data point; handles 5+ simultaneous prediction lines without lag | Harder to theme with Tailwind; less idiomatic in React | **Live Stream dashboard** — multi-line inference overlays, auto-scrolling, real-time appends |
| SVG | Recharts | React-native API; easy Tailwind/shadcn theming; declarative data binding | DOM degradation under high-frequency updates (>10 Hz) | **Training Progress Monitor** — epoch loss curves update once per epoch (low frequency) |

**Integration note:** Both libraries can coexist in the same Next.js app. Import Chart.js with its required `register` calls in the component that mounts the dashboard canvas. Recharts needs no global setup.

---

### 3.2 Python Daemon Stack

| Concern | Library | Version Target | Notes |
|---|---|---|---|
| HTTP + WebSocket server | FastAPI + Uvicorn | FastAPI 0.110+, Uvicorn 0.29+ | Async-native; handles concurrent WS streams and REST calls without threading complexity |
| Deep learning engine | PyTorch | 2.x (CUDA 12.x build) | All model architectures; `torch.compile()` optional for inference speedup |
| TFT architecture | pytorch-forecasting | 1.x | Requires `TimeSeriesDataSet` path — see Data Engineering Spec §7.2 |
| Recurrent / CNN-LSTM | PyTorch native | — | `nn.LSTM`, `nn.GRU`, `nn.Conv1d` — no additional library |
| Kalman filter | pykalman | 0.9+ | EM-fitted on training split only |
| Wavelet transform | PyWavelets (pywt) | 1.6+ | `db4` wavelet, level-2 decomposition, soft thresholding |
| ARIMA baseline | statsmodels | 0.14+ | `statsmodels.tsa.arima.model.ARIMA`; order fixed at (5,1,0) |
| Scaler persistence | scikit-learn + joblib | sklearn 1.4+ | `MinMaxScaler`; serialized via `joblib.dump` |
| Data ingestion | yfinance | 0.2+ | Batch pull at session start; unadjusted OHLCV |
| Model Registry store | SQLite (stdlib `sqlite3`) | Python 3.10+ stdlib | No ORM needed; direct SQL for the small schema |
| Dependency management | `requirements.txt` | — | No Docker required for local use |

**Python version requirement:** 3.10+ (for `match` statement support and current PyTorch CUDA wheels).

---

### 3.3 RunPod Container

| Concern | Specification |
|---|---|
| Base image | `runpod/pytorch:2.x-py3.10-cuda12.x-devel` (official RunPod image) |
| Entrypoint | `worker.py` — mirrors the daemon's training pipeline, accepts `ModelConfig` JSON via env var or mounted payload |
| Artifact storage | AWS S3 or RunPod's built-in volume; download URL returned in job result |
| Shutdown | Container exits immediately after artifact upload |

---

## 4. Communication Protocols & Data Contracts

### 4.1 Daemon Health Check (Handshake)

Direction: Next.js client → Daemon (WebSocket on connect)

```json
// Client sends on connection open
{ "action": "PING", "timestamp": "2026-06-03T19:20:00Z" }

// Daemon responds
{
  "status": "READY",
  "cuda_available": true,
  "device_name": "NVIDIA GeForce RTX 4070 Ti",
  "daemon_version": "1.0.0"
}
```

If `status` is not `READY`, the frontend shows the offline warning banner and disables local training.

---

### 4.2 Training Dispatch Payload

Direction: Next.js client → Daemon (WebSocket) **or** RunPod (HTTPS POST)

The payload schema is identical for both backends. The frontend does not fork logic — it sends the same JSON regardless of the selected compute target.

```json
{
  "action": "START_TRAINING",
  "run_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "configuration": {
    "ticker": "NVDA",
    "sequence_length": 48,
    "denoiser": "DWT",
    "backbone": "BiLSTM",
    "hyperparameters": {
      "learning_rate": 0.001,
      "batch_size": 32,
      "epochs": 50,
      "dropout": 0.2,
      "optimizer": "AdamW"
    }
  }
}
```

Valid `backbone` values: `"LSTM"`, `"GRU"`, `"BiLSTM"`, `"TCN"`, `"TFT"`
Valid `denoiser` values: `"None"`, `"Kalman"`, `"DWT"`
Valid `sequence_length` values: `24`, `48`, `72`

---

### 4.3 Training Telemetry Stream

Direction: Daemon → Next.js client (WebSocket, one event per completed epoch)

```json
{
  "event": "EPOCH_METRIC",
  "run_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "current_epoch": 12,
  "total_epochs": 50,
  "metrics": {
    "train_loss": 0.0142,
    "val_loss": 0.0165,
    "elapsed_seconds": 4.2
  }
}
```

On job completion, the daemon emits a final event:

```json
{
  "event": "TRAINING_COMPLETE",
  "run_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "metrics": {
    "rmse": 1.24,
    "mae": 0.98,
    "mape": 0.46,
    "directional_accuracy": 0.61
  },
  "artifacts": {
    "weights_path": "./models/9b1deb4d.pt",
    "scaler_path": "./models/9b1deb4d_scaler.joblib",
    "config_path": "./models/9b1deb4d_config.json",
    "metrics_path": "./models/9b1deb4d_metrics.json"
  }
}
```

On job failure:

```json
{
  "event": "TRAINING_FAILED",
  "run_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "error": "CUDA out of memory. Try reducing batch_size."
}
```

---

### 4.4 ARIMA On-Demand Execution

Direction: Next.js client → Daemon (REST)

```
POST /api/arima
Body: { "ticker": "AAPL" }
```

The daemon fits ARIMA(5,1,0) on the training split for the specified ticker (fetching data fresh if not already cached in memory) and returns:

```json
{
  "ticker": "AAPL",
  "order": [5, 1, 0],
  "metrics": {
    "rmse": 2.11,
    "mae": 1.67,
    "mape": 0.78,
    "directional_accuracy": 0.52
  },
  "predictions": [213.45, 213.67, 214.02, "..."]
}
```

Expected runtime: < 30 seconds. The frontend shows a loading spinner on the ARIMA row in the comparison table until the response arrives.

---

### 4.5 Forward-Pass Inference (Live Stream & Simulation)

Direction: Next.js client → Daemon (WebSocket or REST, per live bar received)

```json
// Request
{
  "action": "INFER",
  "run_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "bar": {
    "ticker": "AAPL",
    "timestamp": "2026-06-03T14:00:00Z",
    "open": 213.45,
    "high": 214.10,
    "low": 213.00,
    "close": 213.78,
    "volume": 482910
  }
}

// Response
{
  "event": "INFER_RESULT",
  "run_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "timestamp": "2026-06-03T15:00:00Z",
  "predicted_close": 214.20
}
```

The daemon maintains a per-`run_id` rolling FIFO buffer of length `L` (the configured `sequence_length`). On activation of Live Stream Mode, the buffer is pre-seeded with the last `L` bars of the historical dataset (already scaled). Inference fires on the first live bar immediately.

Multiple `run_id`s can have active buffers simultaneously (one per checked model in the dashboard sidebar).

---

### 4.6 Model Registry API

All registry reads are REST calls to the daemon. The daemon is the authoritative owner of `registry.db`.

| Endpoint | Method | Description |
|---|---|---|
| `/api/registry` | GET | Returns all completed, failed, and in-progress run records |
| `/api/registry` | POST | Registers a new run record (used by the frontend after a RunPod job completes — `REGISTER_RUN` flow) |
| `/api/registry/{run_id}` | GET | Returns full detail for a single run |
| `/api/registry/{run_id}` | DELETE | Removes a run record and its local artifact files |

Example response for `GET /api/registry`:

```json
[
  {
    "run_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "ticker": "NVDA",
    "backbone": "BiLSTM",
    "denoiser": "DWT",
    "hyperparams": { "learning_rate": 0.001, "batch_size": 32, "epochs": 50, "dropout": 0.2, "optimizer": "AdamW" },
    "metrics": { "rmse": 1.24, "mae": 0.98, "mape": 0.46, "directional_accuracy": 0.61 },
    "weights_path": "./models/9b1deb4d.pt",
    "created_at": "2026-06-03T19:45:00Z",
    "status": "completed"
  }
]
```

---

## 5. Persistence Strategy

### 5.1 Canonical Store — SQLite (Daemon-Managed)

**File:** `./models/registry.db` (relative to the daemon working directory)

**Table: `runs`**

| Column | Type | Description |
|---|---|---|
| `run_id` | TEXT (PK) | UUID generated at job submission |
| `ticker` | TEXT | e.g., `AAPL` |
| `backbone` | TEXT | e.g., `BiLSTM` |
| `denoiser` | TEXT | `None`, `Kalman`, or `DWT` |
| `hyperparams_json` | TEXT | Full hyperparameter snapshot (JSON string) |
| `metrics_json` | TEXT | RMSE, MAE, MAPE, DA (JSON string); NULL while training |
| `weights_path` | TEXT | Local file path or RunPod cloud URL |
| `created_at` | TEXT | ISO 8601 timestamp |
| `status` | TEXT | `training` / `completed` / `failed` |

This design survives browser clears, browser updates, and re-deployments of the Vercel frontend. The frontend always fetches registry state from the daemon REST API on mount — it never writes to or reads from its own localStorage for registry data.

### 5.2 Artifact Bundle — Local File System

Written by the daemon on training completion:

```
./models/
  {run_id}.pt                  # PyTorch model weights (state_dict)
  {run_id}_scaler.joblib       # Fitted MinMaxScaler (per-feature)
  {run_id}_config.json         # Full ModelConfig snapshot
  {run_id}_metrics.json        # Final test-set metrics (real USD values)
  registry.db                  # SQLite registry (all runs)
```

For RunPod runs, artifacts are downloaded from the signed cloud URL and written to the same local directory structure after the frontend calls `REGISTER_RUN`.

### 5.3 Browser localStorage — Credentials & Local Preferences

| Key | Value | Notes |
|---|---|---|
| `qf_alpaca_key` | string | Alpaca API key |
| `qf_alpaca_secret` | string | Alpaca API secret |
| `qf_runpod_key` | string | RunPod API key |
| `qf_daemon_url` | string | Override for daemon WebSocket URL |
| `qf_default_ticker` | string | Pre-selected ticker on app load |
| `qf_sim_speed` | number | Default simulation speed multiplier |

No model metadata is written to localStorage. All registry operations go through the daemon REST API.

---

## 6. Live Stream & Simulation Mode Architecture

### 6.1 Live Stream Mode — Data Flow

```
[Alpaca WebSocket]
        │
        │  (Raw bar JSON — direct browser WebSocket connection)
        ▼
[Next.js Client UI]
        │
        │  (INFER request per active run_id — daemon WebSocket)
        ▼
[Local Python Daemon]  →  loads scaler + weights for each run_id
        │
        │  (INFER_RESULT — predicted_close per run_id)
        ▼
[Next.js Client UI]  →  appends to Chart.js dataset, auto-scrolls
```

The frontend manages one Alpaca WebSocket connection per active session. Each incoming bar is broadcast as an `INFER` message to the daemon for every run_id currently checked in the Model Selection Sidebar.

### 6.2 Simulation Mode — Data Flow

When Live Stream Mode is unavailable (market closed or no Alpaca credentials):

1. The client loads a bundled static JSON file (`/public/sim_data/{ticker}_sim.json`) — a pre-recorded single trading day of hourly bars
2. A `setInterval` timer fires at the configured speed (default: 1 real hour = 60 seconds, i.e., 60×)
3. Each tick passes the next bar to the same `INFER` WebSocket path as live mode
4. A persistent `SIMULATION` banner is displayed in the dashboard header
5. Speed control options: `1×`, `10×`, `30×`, `60×` (adjustable in-session)

This path is visually identical to Live Stream Mode. No code path in the daemon distinguishes simulation bars from live bars.

---

## 7. Error States & Recovery

| Failure | Detection | UI Behavior |
|---|---|---|
| Daemon not running | WebSocket connection refused on mount | Non-dismissible warning banner; local training and inference disabled |
| Daemon WebSocket drops mid-training | `onclose` event fires | Auto-reconnect (3 attempts, 2s / 4s / 8s backoff); toast notification; training job status set to `failed` if reconnect fails |
| `yfinance` fetch fails | Daemon returns error JSON on data preview call | Inline error on the data preview card with retry CTA |
| Alpaca WebSocket disconnects | `onclose` event on the Alpaca connection | Auto-reconnect (3 attempts, exponential backoff); toast notification |
| RunPod job fails | Non-200 or error payload from RunPod API | Error state in Model Registry row with the raw `error` message from RunPod |
| Model weights file missing | Daemon returns `weights_unavailable` on registry query | "Weights unavailable" badge on the model row; model excluded from chart overlay and inference |
| CUDA OOM during training | Daemon catches `torch.cuda.OutOfMemoryError` | `TRAINING_FAILED` event with descriptive error message (e.g., "Reduce batch size or sequence length") |
| TFT `TimeSeriesDataSet` construction error | Daemon catches and wraps exception | `TRAINING_FAILED` event with error message |

---

## 8. Non-Functional Constraints

| Constraint | Target |
|---|---|
| Chart toggle re-render | ≤ 300ms |
| Epoch event render latency (from daemon emission) | ≤ 500ms |
| Historical data fetch (2 years, 1H) | ≤ 10 seconds on standard broadband |
| ARIMA on-demand execution | ≤ 30 seconds |
| RunPod training cost | < $0.10 per full run |
| Frontend deployment | Vercel Hobby Tier (free); no server-side secrets |
| Daemon runtime | Python 3.10+, Windows, CUDA-enabled PyTorch; no Docker required |
| Browser target | Chrome 120+ (desktop only; no mobile responsiveness required) |
| Persistent database | None (SQLite is local to the daemon host) |

---

## 9. Implementation Clarifications for Claude Code

The following decisions are finalized and should not require further disambiguation during implementation:

**ARIMA runs in the daemon.** All ML logic — neural networks and ARIMA baseline — executes in the Python daemon. ARIMA is triggered on-demand via `POST /api/arima`. It is never run in the browser or in a Vercel serverless function.

**SQLite is the canonical Model Registry.** `localStorage` holds credentials only. The frontend always reads registry state from the daemon REST API (`GET /api/registry`). Do not write registry data to `localStorage`.

**The training dispatch schema is backend-agnostic.** The same `ModelConfig` JSON is sent to the daemon (WebSocket) and to RunPod (HTTPS POST). The frontend does not fork the payload structure.

**RunPod artifacts are repatriated to local storage.** After a RunPod job completes, the frontend downloads all four artifacts and registers them with the daemon via `POST /api/registry`. The daemon writes the run to SQLite. This keeps the registry unified.

**Chart.js for the dashboard, Recharts for the training monitor.** Both libraries coexist in the same Next.js app. Chart.js handles the high-frequency multi-line live inference canvas. Recharts handles the low-frequency epoch loss curves.

**Alpaca WebSocket connects directly from the browser.** No proxy server. API credentials are read from `localStorage` and used client-side. This is acceptable for a single-user local/demo deployment.

**CORS whitelist is required on the daemon.** FastAPI `CORSMiddleware` must allow both `http://localhost:3000` and the production Vercel URL. Configure via a `.env` file or `config.yaml` read at daemon startup.

**TFT requires a branched data preparation path.** When `backbone == "TFT"`, the daemon must use `pytorch_forecasting.TimeSeriesDataSet` and `pytorch_lightning.Trainer` rather than the generic PyTorch training loop. All other backbones use the unified tensor pipeline. Refer to Data Engineering Spec §7.2.

---

## 10. Out of Scope (Architectural)

The following are explicitly excluded from the MVP architecture:

- Hosted database (PostgreSQL, MongoDB, Firebase, etc.)
- User authentication or session management
- Server-side API key storage or secret management
- ONNX export or model format conversion
- Sub-hourly WebSocket data ingestion (tick or 1-minute bars)
- Docker containerization of the local daemon
- Automated hyperparameter search (Optuna or equivalent)
- Multi-user or collaborative access to the registry
