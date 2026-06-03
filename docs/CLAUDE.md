# CLAUDE.md

Guidance for Claude Code and other coding agents working on QuantiForge.

## Project Summary

QuantiForge is an academic capstone MVP: a low-code deep-learning simulation platform for comparing time-series neural network architectures on hourly US equity data. The demo priority is a polished desktop experience that can train locally, compare models against ARIMA, and show live or simulated inference overlays.

Primary user: a student/research presenter running the app on a Windows machine with an NVIDIA GPU.

## Source Documents

Treat these Markdown files as the project source of truth:

1. `PRD.md` - product scope, user flows, functional and non-functional requirements.
2. `SystemArchitecture_Specs.md` - runtime topology, tech stack, persistence, APIs, protocols.
3. `DataEngineering_Specs.md` - data ingestion, preprocessing, denoising, tensor construction, metrics.
4. `UI_UX_Specs.md` - UI layout, component choices, Zustand stores, interaction details.

When documents overlap, use this precedence:

1. Data behavior and metrics: `DataEngineering_Specs.md`
2. Runtime boundaries, persistence, APIs: `SystemArchitecture_Specs.md`
3. Product behavior and scope: `PRD.md`
4. UI expression and client state: `UI_UX_Specs.md`

If a conflict remains, prefer the narrowest document for that domain and update the docs before implementing.

## Non-Negotiable Architecture Decisions

- Frontend is Next.js 14+ App Router, deployed to Vercel Hobby Tier.
- Stateful UI must be client components; layout shells can be server components.
- Local compute runs in a Python daemon launched manually by the user.
- The daemon binds to `127.0.0.1:8765`.
- Training telemetry and inference use the daemon WebSocket.
- Registry reads/writes use daemon REST endpoints.
- Model Registry source of truth is daemon-managed SQLite at `./models/registry.db`.
- Browser `localStorage` is only for credentials and local preferences, never registry data.
- RunPod is optional cloud compute; completed RunPod artifacts are downloaded and registered with the daemon via `POST /api/registry`.
- No hosted database, user accounts, authentication, or server-side secret storage.

## Frontend Implementation Notes

- Use Tailwind CSS and shadcn/ui primitives.
- Use Zustand for transient client state.
- Use Chart.js for the Evaluation Deck master chart.
- Use Recharts for the training loss monitor and data preview sparkline.
- Keep the app desktop-only; mobile/tablet responsiveness is out of scope.
- Dark mode only. Do not add a theme toggle.
- The app has two tabs:
  - Architecture Forge
  - Evaluation Deck
- The Training Drawer mounts once in the app shell and persists across tab changes.
- The Active Job Pill appears when training is dispatched or active.

## Required Zustand Stores

Follow the UI spec store split:

- `useSystemStore`: daemon status, CUDA metadata, preferences, live/simulation flags.
- `useBuilderStore`: Architecture Forge wizard draft configuration.
- `useTrainingStore`: active training job, epoch metrics, drawer state.
- `useRegistryStore`: fetched registry cache, Evaluation Deck overlays, ARIMA result state.

Do not store `WebSocket` instances in Zustand. Manage daemon socket lifecycle in a singleton module such as `lib/daemonSocket.ts`.

## Data and ML Constraints

- Supported tickers for MVP: `SPY`, `AAPL`, `NVDA`, `TSLA`.
- Historical source: `yfinance`.
- Live source: Alpaca Markets Free Tier WebSocket.
- Granularity: hourly candles only.
- Historical depth: most recent 2 years.
- Features: unadjusted `open`, `high`, `low`, `close`, `volume`.
- Primary target: next-hour `close`.
- Train/validation/test split is chronological: 80/10/10. Never shuffle.
- Scalers, Kalman parameters, and DWT thresholds are fit on training data only.
- All metrics are computed on inverse-transformed USD values.
- ARIMA is fixed at `(p=5, d=1, q=0)` and runs on demand in the daemon.

## Supported Model Configuration

Valid backbones:

- `LSTM`
- `GRU`
- `BiLSTM`
- `TCN`
- `TFT`

Valid denoisers:

- `None`
- `Kalman`
- `DWT`

Valid sequence lengths:

- `24`
- `48`
- `72`

Valid batch sizes:

- `16`
- `32`
- `64`
- `128`

Valid optimizers:

- `AdamW`
- `Ranger`
- `SGD`

TFT must use a separate `pytorch_forecasting.TimeSeriesDataSet` path and PyTorch Lightning. Do not force TFT through the generic tensor pipeline.

## API and Protocol Contracts

Daemon WebSocket:

- Client sends `PING` on connect.
- Daemon responds with `READY`, CUDA availability, device name, and daemon version.
- Client sends `START_TRAINING` with `run_id` and `configuration`.
- Daemon emits `EPOCH_METRIC`, `TRAINING_COMPLETE`, `TRAINING_FAILED`, and `INFER_RESULT`.

Daemon REST:

- `GET /api/registry`
- `POST /api/registry`
- `GET /api/registry/{run_id}`
- `DELETE /api/registry/{run_id}`
- `POST /api/arima`

Use the exact payload shapes in `SystemArchitecture_Specs.md` unless the specs are intentionally updated first.

## Persistence and Artifacts

Each completed training run should write:

```text
./models/
  {run_id}.pt
  {run_id}_scaler.joblib
  {run_id}_config.json
  {run_id}_metrics.json
  registry.db
```

Registry records include:

- `run_id`
- `ticker`
- `backbone`
- `denoiser`
- `hyperparams`
- `metrics`
- `weights_path`
- `created_at`
- `status`

## UI Behavior to Preserve

- Architecture Forge is a strict linear wizard.
- Step 1 has no date picker in MVP; it always uses the most recent 2 years.
- The Step 6 CTA text is "Start Training".
- Evaluation Deck fetches registry data from the daemon on activation.
- ARIMA row is always visible but computes only when the user checks ARIMA or clicks Compare All.
- Live Mode and Simulation Mode share the same daemon inference path.
- Simulation uses bundled data from `/public/sim_data/{ticker}_sim.json`.
- Chart appends should use Chart.js direct updates with `chart.update('none')`.

## Common Pitfalls

- Do not write model registry data to `localStorage`.
- Do not run ARIMA in the browser or a Vercel serverless function.
- Do not expose a date picker unless the PRD is updated.
- Do not merge LSTM and GRU into a single UI option.
- Do not precompute ARIMA automatically on Evaluation Deck mount.
- Do not use adjusted OHLCV prices for training.
- Do not fit scalers or denoisers on validation, test, or live data.
- Do not let windows cross invalid provider gaps; use the continuity rules in the data spec.
- Do not store API keys server-side.
- Do not add mobile layouts, auth, hosted databases, ONNX export, or automated hyperparameter search for the MVP.

## Development Style

- Keep changes scoped to the relevant spec or feature.
- Update the Markdown specs when implementation choices change.
- Prefer explicit contracts over implicit behavior.
- Add focused tests for shared data transforms, metric calculations, API payload handling, and store actions.
- For frontend work, verify the actual UI in browser at desktop viewport before considering the task done.

