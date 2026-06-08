# QuantiForge

A low-code deep-learning simulation platform for comparing time-series neural network architectures against ARIMA on hourly US equity data.

---

## Architecture Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (localhost:3000 or Vercel HTTPS)                           │
│                                                                     │
│  Next.js 14+ App Router  ──Zustand stores──  Chart.js canvas       │
│       │  REST (fetch)                    ▲                          │
│       │  WebSocket (ws://)               │                          │
└───────┼──────────────────────────────────┼──────────────────────────┘
        │                             chartBridge.ts
        ▼                                  │
┌───────────────────────────────────────────────────────────────────────┐
│  Python Daemon  (127.0.0.1:8765)                                      │
│                                                                       │
│  FastAPI + Uvicorn                                                    │
│  ├── WebSocket /ws                                                    │
│  │     PING/READY, START_TRAINING, EPOCH_METRIC, TRAINING_COMPLETE   │
│  │     INFER / INFER_RESULT                                           │
│  ├── REST /api/registry (CRUD, SQLite)                                │
│  ├── REST /api/arima    (statsmodels ARIMA walk-forward)              │
│  └── REST /api/data-preview                                           │
│                                                                       │
│  Training pipeline:                                                   │
│  yfinance → gap filter → 80/10/10 split → denoiser → MinMaxScaler   │
│  → sliding windows → LSTM / GRU / BiLSTM / TCN / TFT (Lightning)    │
│                                                                       │
│  GPU: NVIDIA CUDA (RTX 4070 Ti recommended)                          │
│  SQLite registry: ./models/registry.db                                │
└───────────────────────────────────────────────────────────────────────┘
        │
        ▼ (optional cloud compute)
┌─────────────────────────────────────────────────────────────────────┐
│  RunPod Serverless  (pytorch worker)                                │
│  Mirrors daemon training pipeline; artifacts returned as URLs       │
│  Frontend polls /api/runpod/status; downloads → registers locally   │
└─────────────────────────────────────────────────────────────────────┘
```

**Supported tickers:** SPY · AAPL · NVDA · TSLA (2-year hourly, yfinance)  
**Supported backbones:** LSTM · GRU · BiLSTM · TCN · TFT  
**Denoisers:** None · Kalman · DWT (db4)

---

## Quick Start (local development)

### 1 — Start the Python daemon

```powershell
cd daemon
.\.venv\Scripts\Activate.ps1          # or: source .venv/bin/activate on macOS/Linux
python daemon.py
# Daemon binds to ws://127.0.0.1:8765
```

Verify with: `GET http://127.0.0.1:8765/health` → `{"status": "ok"}`

### 2 — Start the Next.js frontend

```powershell
cd frontend
npm install
npm run dev
# Serves on http://localhost:3000
```

Open `http://localhost:3000` in Chrome. The header should show **Daemon Online** (green dot).

### 3 — Optional: Configure API keys

Click the settings cog in the top-right corner to open Settings:
- **Alpaca Markets** key + secret — required for Live Mode inference
- **RunPod** API key — required for cloud compute
- **Daemon URL** — default `ws://localhost:8765`

All keys are stored exclusively in `localStorage`; nothing is persisted server-side.

---

## Mixed-Content / Chrome Security Block

**Why this exists:**

When the frontend is deployed to Vercel (HTTPS, e.g. `https://quantiforge.vercel.app`), Chrome's
**Private Network Access** and **Mixed Content** rules prevent it from connecting to an unencrypted
local WebSocket at `ws://127.0.0.1:8765`:

- **Mixed content** — an HTTPS page cannot initiate `ws://` connections (only `wss://`).
- **Private Network Access** — Chrome blocks HTTPS → localhost connections unless the server
  returns a `Access-Control-Allow-Private-Network: true` header and the browser has explicitly
  granted permission.

Neither restriction applies when both the frontend and daemon are served from `localhost`, because
the connection is entirely within the same network context.

---

## Recommended Presentation Workflow

For demo / committee evaluation, **always run both sides locally**:

```
http://localhost:3000  ←WebSocket→  ws://127.0.0.1:8765
```

This sidesteps all mixed-content and Private Network Access restrictions entirely.

**Step-by-step setup for the presentation machine:**

1. Clone repo; install daemon deps (`pip install -r daemon/requirements.txt`).
2. `cd daemon && python daemon.py` — leave this terminal open.
3. `cd frontend && npm install && npm run dev` — leave this terminal open.
4. Open Chrome at `http://localhost:3000` — do NOT use the Vercel URL during live training.
5. The Settings dialog pre-fills `ws://localhost:8765`; no changes needed.
6. Walk through the Architecture Forge wizard → Start Training → watch live loss chart.

> If you want to show the Vercel deployment URL on screen while training locally, open the
> **deployed Vercel page** in a separate tab, open DevTools → Application → Local Storage,
> and manually set `qf_daemon_url` = `ws://localhost:8765`.  Chrome will still block the
> connection because of mixed-content rules.  Use the localhost URL for the actual demo.

---

## Simulation Mode Fallback

If the live daemon is unavailable (network issue, GPU driver crash, etc.) during the presentation,
switch to **Simulation Mode**:

1. In the Evaluation Deck, toggle **Simulation** (the 🎬 button in the deck header).
2. An amber **SIMULATION** banner appears at the top of the deck.
3. Pre-recorded OHLCV bars from `frontend/public/sim_data/{ticker}_sim.json` are replayed
   through the same inference path at the selected speed multiplier (1× / 10× / 30× / 60×).
4. Trained models still generate inference overlays in real time — the daemon IS still required
   for inference in simulation mode. If the daemon is completely unavailable, the inference
   lines will simply not appear, but the actual close line continues to animate.

**Sim data files:** Each JSON contains one complete high-volatility trading day (6–7 hourly
bars) selected for visual clarity on a projected screen.

---

## Running the Test Suite

### Python daemon tests

```powershell
cd daemon
.\.venv\Scripts\Activate.ps1
pytest tests/ -v
```

Individual suites:
```powershell
pytest tests/test_metrics.py   -v   # RMSE / MAE / MAPE / DA math
pytest tests/test_scaling.py   -v   # MinMaxScaler round-trip (tol 1e-5)
pytest tests/test_windowing.py -v   # sliding windows + continuity flags
pytest tests/test_arima.py     -v   # ARIMA smoke + O(1) append path
```

Integration smoke test (requires running daemon):
```powershell
python tests/smoke_run.py
```

### Frontend store tests

```powershell
cd frontend
npm install          # installs vitest if not already present
npm test
```

Tests cover:
- `builderStore` — `editStep(n)` resets all downstream steps
- `registryStore` — `assignColor()` cycles the four-color palette
- `trainingStore` — `handleEpochMetric()` caps `logLines` at 200

---

## Project Structure

```
QuantiForge/
├── docs/                      # Spec files (source of truth)
├── frontend/                  # Next.js App Router (deploy to Vercel)
│   ├── app/
│   ├── components/
│   ├── lib/                   # daemonSocket.ts, chartBridge.ts, etc.
│   ├── stores/                # Zustand: system, builder, training, registry
│   ├── public/sim_data/       # Pre-recorded OHLCV JSONs for Simulation Mode
│   ├── __tests__/             # Vitest store tests
│   └── vercel.json
├── daemon/                    # Python local compute daemon
│   ├── daemon.py              # FastAPI + Uvicorn entry point
│   ├── data/                  # ingestion, denoising, scaling, windowing
│   ├── training/              # architectures, trainer, metrics
│   ├── arima/                 # ARIMA(5,1,0) baseline
│   ├── inference/             # live rolling-buffer inference engine
│   ├── registry/              # SQLite CRUD
│   ├── config.yaml            # port, CORS origins
│   └── tests/                 # pytest suite + smoke_run.py
└── runpod/                    # Optional cloud compute worker
    ├── worker.py
    └── Dockerfile
```

---

## Security Notes

- API keys (`qf_alpaca_key`, `qf_alpaca_secret`, `qf_runpod_key`) are stored exclusively in
  the browser's `localStorage` — zero server-side persistence.
- The RunPod key is transmitted transiently through the Next.js `/api/runpod/trigger` route
  only to initiate the job and is never logged or stored on the server.
- Model registry data is never written to `localStorage` — always read from
  `GET /api/registry` on the local daemon.
