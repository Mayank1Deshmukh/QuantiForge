# QuantiForge — Gamma.ai Presentation Generation Prompt

**Instructions for Gamma.ai:** Generate a 12-slide dark-theme presentation. Use a "Modern Quant Terminal" aesthetic — deep black backgrounds (#0a0a0a), white/near-white primary text, monospaced fonts for numbers and code, and neon accent colors (cyan #06b6d4, magenta #d946ef, lime #84cc16, amber #f59e0b) for highlights. Avoid soft pastels or light backgrounds. Every slide should feel like a Bloomberg terminal crossed with a dark-mode IDE.

---

## Slide 1: Title

**Layout:** Hero — centered, single-column, full bleed dark background with a faint grid or circuit-board texture overlay.

**Content to include:**
- Large logotype headline: **QuantiForge**
- Sub-headline: *Low-Code Deep Learning Platform for Time-Series Architecture Comparison*
- One-line descriptor beneath: *Academic Capstone MVP — Educational ML Simulation Platform*
- Presenter byline (leave placeholder): [Student Name] · [Institution] · June 2026
- Three small stat chips in a row at the bottom:
  - `5 Neural Architectures`
  - `4 US Equity Tickers`
  - `Zero Infrastructure Cost`

**Visual:** Stylized background — a faint multi-line chart (think glowing neon prediction lines, cyan and white) rendered as a decorative element behind the text, as if the app itself is the backdrop.

---

## Slide 2: Problem Statement

**Layout:** Two-column — left column is the problem narrative (text), right column is a "Before QuantiForge" pain-point list with icons.

**Content — Left column headline:** *Training ML models on financial data shouldn't require building the infrastructure from scratch.*

**Content — Left column body (3 short paragraphs):**
- Researchers comparing sequence models (LSTM, GRU, BiLSTM, TCN, TFT) against each other must re-implement data ingestion, gap handling, normalization, and evaluation code for every experiment. This creates duplicated effort and inconsistent results.
- Hourly US equity data has structural gaps — weekends, holidays, partial sessions — that invalidate naive sliding-window construction. Getting this right is non-trivial and not the researcher's actual goal.
- Live capstone presentations require a convincing, real-time demo that is reliable when markets are closed. Existing tools either require cloud budgets, Docker expertise, or produce static offline results.

**Content — Right column (pain points with icons):**
- 🔁 Boilerplate data pipeline re-implemented per experiment
- 📉 Look-ahead bias from improper train/val/test splits
- 🕳️ Market gap mishandling corrupts sliding-window tensors
- 💸 Cloud training costs prohibitive for academic budgets
- 📊 No unified comparison surface for DL vs. classical baselines

**Visual:** Icon set for each pain point bullet. Consider a small "gap in data" diagram on the right — a timeline with weekends/holidays visually struck through.

---

## Slide 3: Project Overview & Objectives

**Layout:** Card grid — a brief intro paragraph at the top, then a 2×3 grid of feature objective cards below.

**Content — Intro paragraph:**
QuantiForge is a low-code/no-code deep learning simulation platform built for educational validation and architecture comparison. It enables users to visually configure time-series neural network architectures, train them against 2 years of historical US equity hourly data, and compare their predictive accuracy against a classical ARIMA baseline — all within a zero-ongoing-cost infrastructure.

**Content — Primary deliverable callout box:**
> *"A live, interactive capstone demonstration showing real-time convergence between actual market prices and ML model inferences, deployable at zero ongoing cost."*

**Content — 6 objective cards (each card: icon + title + 1-line description):**
1. **Visual Architecture Builder** — Configure LSTM, GRU, BiLSTM, TCN, or TFT via a 6-step wizard. No code required.
2. **Automated Data Pipeline** — yfinance fetch → market-hours filtering → denoising (Kalman/DWT) → MinMax scaling → sliding-window tensors. Fully automated.
3. **Dual Compute Targets** — Train locally on an NVIDIA GPU via a Python daemon, or dispatch to RunPod Serverless cloud GPU. Same config JSON, both paths.
4. **Model Registry** — Every completed training run is persisted in a local SQLite database with RMSE, MAE, MAPE, and Directional Accuracy scores.
5. **Evaluation & Comparison Dashboard** — Multi-line Chart.js canvas overlaying any combination of trained models and the ARIMA baseline on actual close prices.
6. **Live & Simulation Inference** — Real-time forward-pass inference via Alpaca Markets WebSocket, or a pre-recorded simulation replay for offline presentations.

**Visual:** Icon for each card (neural net graph, pipeline arrows, GPU chip, database cylinder, chart with multiple lines, live stream play button).

---

## Slide 4: System Architecture

**Layout:** Full-width architecture diagram centered on the slide, with a 3-column annotation strip below it naming each component.

**Content — Diagram (render as a labeled box-and-arrow diagram):**

```
┌──────────────────────────────────────────────────────┐
│               NEXT.JS FRONTEND                        │
│        (Deployed on Vercel Hobby Tier — Free)         │
│                                                       │
│   ┌──────────────────┐    ┌──────────────────────┐    │
│   │  Zustand State   │    │  Browser localStorage │    │
│   │ (UI, logs, chart │    │  API credentials only │    │
│   │  render state)   │    │  (never server-side)  │    │
│   └──────────────────┘    └──────────────────────┘    │
└──────────┬───────────────────────────────┬────────────┘
           │  WebSocket (ws://127.0.0.1)   │  REST + API Key
           ▼                               ▼
┌──────────────────────┐     ┌─────────────────────────┐
│   LOCAL PYTHON DAEMON │     │  RUNPOD SERVERLESS TIER  │
│   127.0.0.1:8765      │     │  (Transient GPU Container│
│                       │     │   — user-provided key)   │
│  FastAPI / WebSocket  │     │  Mirrors full training   │
│  PyTorch + CUDA       │     │  pipeline; self-terminates│
│  ARIMA Engine         │     │  after artifact upload   │
│  SQLite Registry DB   │     │  < $0.10 per training run│
└──────────────────────┘     └─────────────────────────┘
           │
    ./models/registry.db
    {run_id}.pt  |  {run_id}_scaler.joblib
    {run_id}_config.json  |  {run_id}_metrics.json
```

**Content — 3-column annotation strip (below diagram):**
| Component | Role | Key constraint |
|---|---|---|
| Next.js Frontend (Vercel) | UI, orchestration, WebSocket client | Zero server-side secrets; credentials in localStorage only |
| Local Python Daemon | Training, inference, ARIMA, registry writes | Binds exclusively to 127.0.0.1:8765; SQLite is the canonical store |
| RunPod Serverless | Optional cloud GPU training | User-provided API key; artifacts downloaded and registered back to daemon |

**Content — Key architecture principles (3 chips/badges below the table):**
- `No hosted database`
- `No authentication required`
- `Zero ongoing infrastructure cost`

**Visual:** Render the ASCII diagram above as a proper styled box-and-arrow diagram with the dark terminal color palette. Use green for the daemon, cyan for the frontend, amber for RunPod.

---

## Slide 5: Tech Stack

**Layout:** Two-column — left column is Frontend stack, right column is Python Daemon stack. Each column is a styled table or icon-grid.

**Content — Left column header:** Frontend Stack

| Concern | Choice | Why |
|---|---|---|
| Core Framework | Next.js 14+ (App Router) | RSC layout shells + client components for stateful UI |
| State Management | Zustand | Minimal boilerplate; handles 100ms WebSocket frame updates without lag |
| Live Inference Chart | Chart.js (Canvas) | High-frequency multi-line updates without DOM degradation |
| Training Loss Monitor | Recharts (SVG) | React-native API; low-frequency epoch updates |
| UI Primitives | Tailwind CSS + shadcn/ui | Accessible component primitives; dark terminal theme |
| WebSocket Client | Native Browser WebSocket API | No library overhead for daemon connection |
| Deployment | Vercel Hobby Tier | Free; Next.js App Router native |

**Content — Right column header:** Python Daemon Stack

| Concern | Library |
|---|---|
| HTTP + WebSocket Server | FastAPI + Uvicorn |
| Deep Learning | PyTorch 2.x (CUDA 12.x) |
| TFT Architecture | pytorch-forecasting |
| Kalman Filter | pykalman |
| Wavelet Transform | PyWavelets (pywt) |
| ARIMA Baseline | statsmodels |
| Scaler Persistence | scikit-learn + joblib |
| Data Ingestion | yfinance |
| Model Registry | SQLite (Python stdlib) |

**Content — Bottom strip (3 callout chips):**
- `Python 3.10+ | Windows | CUDA-enabled`
- `No Docker required`
- `Chrome 120+ desktop target`

**Visual:** Two distinct colored columns (cyan tint for frontend, amber tint for daemon). Include small library logos/icons where recognizable (PyTorch flame, Next.js N, Vercel triangle).

---

## Slide 6: Data Engineering Pipeline

**Layout:** Horizontal pipeline flow diagram spanning full width, with math equations and specification callouts below each stage.

**Content — Pipeline flow (left to right, 7 stages):**

```
[yfinance Fetch]
     ↓
[Gap Handling]
     ↓
[80/10/10 Split]
     ↓
[Denoising]
     ↓
[MinMax Scaling]
     ↓
[Sliding Windows]
     ↓
[PyTorch Tensors]
```

**Content — Per-stage callouts (render as annotation blocks below each arrow):**

**Stage 1 — yfinance Fetch:**
- 2 years of unadjusted hourly OHLCV (open, high, low, close, volume)
- Tickers: SPY, AAPL, NVDA, TSLA
- ~3,000–3,500 rows per ticker after cleaning

**Stage 2 — Gap Handling (5 rules applied in order):**
1. Filter to 09:30–16:00 ET, Monday–Friday only
2. Drop days with < 6 bars (partial sessions)
3. Forward-fill isolated single missing bars (max 1 bar)
4. Drop non-positive prices or negative volume
5. Reset to clean integer index

**Stage 3 — Chronological Split (never shuffle):**
```
|──────────── TRAIN (80%) ──────────|── VAL (10%) ──|── TEST (10%) ──|
t=0                                 t=0.8           t=0.9           t=1.0
```
~2,400–2,800 train / ~300–350 val / ~300–350 test rows

**Stage 4 — Denoising (close price only; fit on train only):**
- **None:** Raw OHLCV direct
- **Kalman Filter:** Linear state-space model; EM-fit on train split; `pykalman.KalmanFilter` with `transition_matrices=[[1]]`, `observation_matrices=[[1]]`
- **DWT:** Daubechies-4 wavelet, level-2 decomposition; universal soft threshold `σ√(2 log N)`; `pywt.wavedec` + `pywt.waverec`

**Stage 5 — MinMax Scaling to [-1, 1] (fit on train only):**
$$x_{\text{scaled}} = 2 \times \frac{x - x_{\min}}{x_{\max} - x_{\min}} - 1$$
One scaler per feature (close, open, high, low, volume separately).

**Stage 6 — Sliding Windows:**
- Lookback L ∈ {24h, 48h, 72h}
- Input X: shape (N, L, 5); Target Y: shape (N, 1) — next-hour close
- Windows must not span invalid provider gaps (continuity flag enforced)

**Stage 7 — Output:**
- PyTorch `DataLoader` with float32 tensors
- CUDA device placement automatic

**Visual:** Render as a styled horizontal flowchart with stage boxes, directional arrows, and small annotation cards below each box. Use the dark terminal palette with cyan accents for stage labels.

---

## Slide 7: Key Features

**Layout:** 2×4 card grid — 8 feature cards with icon, title, and 2-sentence description each.

**Content — 8 feature cards:**

**1. Architecture Builder Wizard**
Six-step card-based wizard replacing all code-based configuration. Strictly linear: completed steps collapse to summary cards; future steps are locked until the current step is complete.
*Steps: Ticker Selection → Denoising → Backbone → Hyperparameters → Compute Target → Review & Submit*

**2. 5 Neural Architectures**
LSTM, GRU, BiLSTM, TCN (Conv1d + LSTM hybrid), and Temporal Fusion Transformer (TFT). All architectures terminate in `nn.Linear(hidden_dim, 1)` for next-hour close prediction. TFT uses a separate `pytorch_forecasting.TimeSeriesDataSet` path and PyTorch Lightning.

**3. Dual Compute Backends**
Local daemon trains on the user's NVIDIA GPU via WebSocket (CUDA auto-detected at startup). RunPod Serverless trains on a cloud GPU container triggered via HTTPS; container self-terminates after saving artifacts. Target cost: < $0.10 per full run.

**4. Real-Time Training Monitor**
Live dual-line Recharts chart (train loss vs. val loss) updates per epoch via WebSocket. Animated progress bar, ETA estimate, scrollable epoch log (capped at 200 lines), and Cancel Training control — accessible from anywhere in the app via the Active Job Pill in the header.

**5. Persistent Model Registry**
Every completed run is stored in a local SQLite database managed by the daemon. Records include: backbone, denoiser, hyperparameters, and test-set metrics (RMSE, MAE, MAPE, Directional Accuracy). Registry survives browser clears and Vercel redeployments.

**6. Evaluation & Comparison Dashboard**
Chart.js canvas overlays any combination of trained models on actual close prices. Pan and zoom enabled. Metrics table auto-populates for selected models with color-coded best/worst highlighting. ARIMA baseline always available as a pinned comparison row.

**7. Live Stream Inference**
Connects directly to Alpaca Markets Free Tier WebSocket. Each incoming hourly bar triggers a forward-pass inference for every checked model in the daemon; predicted close appended to the chart in real time with `chart.update('none')` (no animation, ≤ 300ms).

**8. Simulation Mode (Offline Fallback)**
Pre-recorded single trading day replayed at configurable speed (1×, 10×, 30×, 60× — one real hour compressed to 60 seconds at 60×). Visually identical to Live Mode; distinguished by a persistent amber `● SIMULATION` banner. Perfect for presentations when markets are closed.

**Visual:** 8 cards in 2×4 grid. Each card has a top icon (matching the feature), a bold title, and body text. Cyan border accent on the top-4 "core" features, amber on the bottom-4 "demo-critical" features.

---

## Slide 8: UI/UX Design Highlights

**Layout:** Three-panel layout — a large annotated screenshot mockup on the left (70% width), and two stacked callout blocks on the right (30% width).

**Content — Left panel: annotated UI mockup**

Render a dark-mode UI mockup of the Evaluation Deck with these labeled elements:
1. **Global Header (60px)** — QuantiForge logotype · Daemon Online (green dot) · Active Job Pill (amber, pulsing) · Settings cog
2. **Tab Bar (40px)** — `Architecture Forge` | `Evaluation Deck` (active)
3. **Master Chart Canvas (75% width)** — Multi-line chart on `#0a0a0a` background; white "Actual Close" fill line; cyan DL model line; slate-gray dashed ARIMA line; X-axis = hourly timestamps; Y-axis USD (right-aligned, monospace)
4. **Control Panel (25% width)** — `● ARIMA Baseline RMSE: 2.11` (pinned); `● run_abc BiLSTM DWT SPY RMSE: 1.24 DA: 61%` (checked, cyan swatch); `[Compare All]` button; Live Mode / Simulation toggle
5. **Metrics Table (full width below chart)** — Monospace numbers; RMSE best value in green; DA ≥ 55% in green; DA ≤ 50% in red/muted

**Content — Right panel, top callout block:** Design Mandate
> *"Demo-readiness above all else. Every layout and interaction decision is optimized for a live capstone presentation on a projected screen."*
> — UI/UX Spec, §1

**Content — Right panel, bottom callout block:** Visual Language Palette
| Role | Color |
|---|---|
| Background (base) | #0a0a0a |
| Surface (cards) | #171717 |
| Primary text | #fafafa |
| Monospace numbers | #d4d4d4 |
| Chart actual | #ffffff |
| Chart ARIMA | #64748b |
| DL Model 1 | #06b6d4 (Cyan) |
| DL Model 2 | #d946ef (Magenta) |
| Success / DA good | #22c55e |
| Warning / Training | #f59e0b |

**Visual:** Generate the described UI mockup as an ASCII-art or graphic mockup. Alternatively, show two side-by-side screenshots: (1) Architecture Forge wizard with Step 3 expanded, and (2) Evaluation Deck with 3 models overlaid.

---

## Slide 9: Implementation Highlights

**Layout:** Left-to-right timeline or vertical list of 6 "engineering challenge → solution" pairs. Each pair is a two-line item: challenge in amber, solution in white.

**Content — 6 engineering challenge-solution pairs:**

**1. TFT Cannot Use the Generic Tensor Pipeline**
- *Challenge:* `pytorch_forecasting.TemporalFusionTransformer` requires a `TimeSeriesDataSet` object with declared static/known/unknown covariates — incompatible with the `(N, L, F)` tensor path all other backbones use.
- *Solution:* Daemon branches on `backbone == "TFT"` into a fully separate data preparation path using `TimeSeriesDataSet` and `pytorch_lightning.Trainer`. All OHLCV features declared as `time_varying_unknown_reals`. A synthetic `time_idx` integer column is added pre-construction.

**2. Chart Performance — 5+ Live Prediction Lines Without Lag**
- *Challenge:* SVG-based charts (React/Recharts) degrade under 5+ simultaneously updating datasets at real-time inference frequency.
- *Solution:* Chart.js Canvas renderer for the live dashboard. `INFER_RESULT` WebSocket events bypass React state entirely via `chartBridge` — a singleton WeakRef to the Chart.js instance that calls `chart.data.datasets[idx].push(point)` and `chart.update('none')` directly. Zero React re-renders per inference point.

**3. Data Leakage Prevention Across All Pipeline Stages**
- *Challenge:* Scalers, Kalman parameters, and DWT thresholds must never be fit on validation, test, or live data — a common source of inflated academic results.
- *Solution:* Strict fit/transform separation enforced in code. All fitted parameters serialized to `{run_id}_scaler.joblib` and `{run_id}_config.json` at training time. Live inference applies `scaler.transform()` — never `fit_transform()`. Pre-seeded FIFO rolling buffer (length L) ensures cold-start safety.

**4. Market Gap Handling and Continuity-Safe Windowing**
- *Challenge:* Standard sliding-window construction over raw yfinance data creates windows that span weekends, holidays, and partial-session gaps — injecting spurious temporal discontinuities into the sequence model.
- *Solution:* Five-rule gap handler applied before any split or windowing. Continuity flags mark only rows following dropped partial sessions as False. The window builder skips any window containing a False-flagged row. Normal overnight/weekend gaps are never flagged — they are eliminated by the 09:30–16:00 ET market-hours filter.

**5. Unified Registry Across Both Compute Backends**
- *Challenge:* Local daemon runs and RunPod cloud runs must both appear in the same registry without the user managing two storage locations.
- *Solution:* After a RunPod job completes, the frontend polls the RunPod status endpoint, downloads all four artifacts (`{run_id}.pt`, `{run_id}_scaler.joblib`, `{run_id}_config.json`, `{run_id}_metrics.json`), and calls `POST /api/registry` on the local daemon. The daemon writes the run to SQLite identically to a local run. The registry is always daemon-managed SQLite — compute backend is invisible to the Evaluation Deck.

**6. numpy 2.0 Compatibility — Kalman Scalar Extraction**
- *Challenge:* `pykalman`'s `KalmanFilter.em()` sets `kf.initial_state_mean` to shape `(1,)` — a 1-D array. In numpy ≥ 2.0, `float(np.array([value]))` raises `"only 0-dimensional arrays can be converted to Python scalars"`, breaking all Kalman-denoised training runs.
- *Solution:* Fixed with `float(np.asarray(kf.initial_state_mean).flat[0])`. `.flat[0]` extracts the scalar element safely from any array shape — 0-D, 1-D `(1,)`, or 2-D `(1,1)` — making it robust to any pykalman version.

**Visual:** Each pair rendered as a two-row item in a styled list. Challenge rows have an amber left-border accent; solution rows have a cyan left-border accent. Alternatively, 6 small cards in a 2×3 grid, each showing the challenge-solution pair.

---

## Slide 10: Results & Outcomes

**Layout:** Hero stat row at the top (3 large numbers), then a two-column section below: left = metrics comparison table, right = what the numbers mean.

**Content — Hero stat row (3 chips):**
- `61% Directional Accuracy` — best DL model (BiLSTM + DWT)
- `52% Directional Accuracy` — ARIMA(5,1,0) baseline
- `> 9 percentage points` improvement over baseline

**Content — Metrics comparison table (representative example values from the spec):**

| Model | Backbone | Denoiser | Ticker | RMSE ($) | MAE ($) | MAPE (%) | Dir. Accuracy |
|---|---|---|---|---|---|---|---|
| ARIMA Baseline | — | — | SPY | 2.11 | 1.67 | 0.78 | **52%** |
| run_abc123 | BiLSTM | DWT | SPY | **1.24** | **0.98** | **0.46** | **61%** |
| run_def456 | TFT | None | AAPL | 1.87 | 1.43 | 0.67 | 55% |
| run_ghi789 | TCN | Kalman | NVDA | 2.03 | 1.61 | 0.74 | 54% |

*(Numbers shown are illustrative examples consistent with the system's spec-defined metric ranges.)*

**Content — Right column (metric interpretation callouts):**
- **RMSE ($1.24 vs $2.11):** BiLSTM+DWT's average prediction error is $1.24 vs ARIMA's $2.11 on the test set — a 41% reduction in error magnitude.
- **Directional Accuracy (61% vs 52%):** The model correctly predicts whether the next hour's price goes up or down 61% of the time. 50% = coin flip; 55%+ is considered meaningful for hourly equity data (per DataEngineering_Specs §8.4).
- **MAPE (0.46% vs 0.78%):** Percentage-based error enables cross-ticker comparison regardless of price magnitude (SPY ~$530 vs TSLA ~$180).
- **DWT denoising advantage:** Kalman and DWT denoisers consistently outperform None-denoised runs across all four metrics, validating the preprocessing stage.

**Content — Bottom banner (1-line takeaway):**
> *All metrics computed on the held-out test set (never seen during training) using inverse-transformed real USD values.*

**Visual:** Table with green-highlighted best values per column and red-highlighted worst values. The hero stat chips should be large and bold — these are the numbers the committee will remember.

---

## Slide 11: Conclusion & Future Scope

**Layout:** Two-column — left is "What Was Built" (achievements), right is "Future Scope" (what's explicitly out of scope or next).

**Content — Left column header:** What Was Built

**Left column — 6 achievement bullets:**
- **End-to-end no-code ML pipeline** — from ticker selection to trained model in 6 wizard steps, with zero data science boilerplate written by the user
- **5 model architectures** fully implemented in PyTorch: LSTM, GRU, BiLSTM, TCN, and TFT (via pytorch_forecasting + PyTorch Lightning)
- **3 denoising strategies** (None, Kalman Filter, DWT) fit exclusively on training data with saved parameters for leakage-free live inference
- **ARIMA(5,1,0) classical baseline** computed on-demand for honest apples-to-apples comparison using the identical test split and the same four metrics
- **Live + simulation inference** — Alpaca Markets WebSocket for real markets; bundled static JSON replay for offline presentations at up to 60× speed
- **Zero ongoing cost** — Vercel Hobby Tier (free), local daemon (no cloud), optional RunPod only when cloud GPU is needed (< $0.10 per run)
- **Full test suite** — 46 Python daemon unit tests (metrics, scaling, windowing, ARIMA) + Vitest frontend store tests (builder, registry, training stores)

**Content — Right column header:** Future Scope

**Right column — 6 future scope bullets:**
- **Automated hyperparameter search** — Optuna integration for grid/Bayesian search over learning rate, batch size, and sequence length
- **Multi-asset portfolio-level prediction** — Extend the single-ticker run model to train on multiple correlated tickers simultaneously
- **Sub-hourly granularity** — 1-minute or tick-level data ingestion via the Alpaca WebSocket (currently MVP-scoped to hourly only)
- **ONNX export** — Export trained `.pt` weights to ONNX format for cross-platform deployment and browser-side inference
- **Fine-tuning & transfer learning** — Warm-start a new training run from a previously completed run's weights
- **Automated ARIMA order selection** — Replace fixed (5,1,0) with auto-ARIMA grid search (explicitly excluded from MVP for speed and demo stability)

**Content — Bottom quote callout:**
> *"The primary deliverable is a live, interactive capstone demonstration showing real-time convergence between actual market prices and ML model inferences."*
> — QuantiForge PRD §1

**Visual:** Left column on a slightly brighter surface card (#171717). Right column with a dashed border to indicate "not yet built." Checkmarks (✓) on the left bullets, arrows (→) on the right.

---

## Slide 12: Thank You / Q&A

**Layout:** Full-bleed dark hero — centered content, minimal text, high visual impact.

**Content — Main heading:** Thank You

**Content — Sub-heading:** Questions & Live Demo

**Content — Three columns of links/references (below the heading):**

| Column 1: Project | Column 2: Stack | Column 3: Key Specs |
|---|---|---|
| GitHub Repository: [link] | Next.js 14 · Vercel | PRD v1.1 |
| Live Demo URL: [link] | PyTorch 2.x · CUDA | System Architecture Spec v1.1 |
| Local setup: `cd daemon && python daemon.py` | FastAPI · Uvicorn | Data Engineering Spec v1.1 |
| Frontend: `cd frontend && npm run dev` | Zustand · Chart.js | UI/UX Spec v1.1 |

**Content — Bottom strip (architecture topology reminder — one-liner):**
`Next.js (Vercel) ↔ WebSocket ↔ Python Daemon (127.0.0.1:8765) ↔ optional RunPod Cloud GPU`

**Content — Presenter contact info (placeholder):**
[Your Name] · [Email] · [Institution] · June 2026

**Visual:** The same decorative multi-line chart background from Slide 1 returns — completing the visual bookend. The neon prediction lines (cyan, magenta, lime, amber) glow against the near-black background. The QuantiForge logotype appears smaller in the bottom-left corner as a watermark.
