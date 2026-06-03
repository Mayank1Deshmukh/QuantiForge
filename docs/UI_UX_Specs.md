# QuantiForge MVP — UI/UX Component & State Management Specification

**Version:** 1.1  
**Status:** Draft  
**Project Type:** Academic Capstone — Educational ML Simulation Platform  
**Last Updated:** June 2026  
**Supersedes:** UI/UX Component & State Management Plan v1.0

---

## 1. Executive Summary

This document defines the interface architecture, component hierarchy, and client-side state management strategy for the QuantiForge MVP. It is aligned with and subordinate to the PRD (v1.1), Data Engineering Spec (v1.1), and System Architecture & Tech Stack Spec (v1.1). Where those documents specify functional requirements, this document defines how those requirements are expressed in the UI layer.

**Design Mandate:** Demo-readiness above all else. Every layout, animation, and interaction decision is optimized for a live capstone presentation on a projected screen. The visual language is a "Modern Quant Terminal" — high-contrast dark mode, monospaced metrics, neon prediction lines, and deliberate motion only where it conveys meaningful computation.

**Key decisions captured in this document:**
- Architecture Forge uses a card-based linear wizard (PRD §4.1) — one step visible at a time, with a persistent top step-indicator strip.
- The Active Training Drawer is minimizable but not dismissible.
- Daemon status and active job controls are persistently visible in the Global Header during training.
- The Model Registry (Zustand) is a read-through cache of the daemon SQLite — never the source of truth.
- The Evaluation Deck control panel is collapsible for full-width chart moments.
- ARIMA is computed on demand when the user enables the ARIMA row or uses Compare All.

---

## 2. Global Layout & Navigation Architecture

### 2.1 Application Shell

The application is a Single Page Application within the Next.js App Router paradigm. All stateful UI is client components; layout shells are Server Components.

```
┌─────────────────────────────────────────────────────────────────┐
│  GLOBAL HEADER (60px fixed)                                     │
│  [Logo] [Daemon Status Indicator] [Active Job Pill*] [Settings] │
└────────────────────────────────┬────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────┐
│  TAB BAR (40px)                                                  │
│  [ Architecture Forge ]  [ Evaluation Deck ]                    │
└────────────────────────────────┬────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────┐
│  MAIN CONTENT CANVAS  (calc(100vh - 100px))                      │
│  Renders the active tab view                                     │
└─────────────────────────────────────────────────────────────────┘

* Active Job Pill is only rendered when daemonStatus === 'training'
```

**Viewport height budget:**

| Zone | Height | Notes |
|---|---|---|
| Global Header | 60px | Fixed; always visible |
| Tab Bar | 40px | Fixed; always visible |
| Main Content Canvas | `calc(100vh - 100px)` | Scrollable within tab |
| Training Drawer (when open) | 320px | Overlays bottom of canvas; content scrolls behind it |
| Training Drawer (minimized) | 48px | Pill at bottom edge |

### 2.2 Global Header Specification

**Left zone:** QuantiForge logotype in monospace font.

**Center zone (conditional — visible only when `daemonStatus === 'training'`):**  
An "Active Job Pill" showing `[spinner] Training · run_abc123 · BiLSTM · Epoch 12/50 · [Cancel]`. The pill disappears when training completes or fails. This satisfies the PRD §4.3 requirement for a Cancel Training control while keeping it accessible from anywhere in the app during a training run.

**Right zone:**
- **Daemon Status Indicator:** A 10px dot with label. Three states:
  - `online` → green dot + "Daemon Online"
  - `offline` → red dot + "Daemon Offline"
  - `training` → amber pulsing dot + "Training Active"
- **Settings cog** → opens the Settings Dialog (see §3.5).

### 2.3 Tab Navigation

Two tabs only:
1. **Architecture Forge** — the model configuration wizard
2. **Evaluation Deck** — the comparison dashboard

Tab switching is always allowed, even during training (the drawer persists across tab changes). The Evaluation Deck tab re-fetches the registry from the daemon on every activation.

---

## 3. View Specifications

### 3.1 Tab 1 — Architecture Forge (Model Configuration Wizard)

**Layout:** Centered, `max-w-2xl`, vertically scrollable.

**Interaction model:** Strict linear wizard — only one step card is fully expanded and interactive at a time. Completed steps are shown as collapsed summary cards above the active step. Future steps are rendered as locked/dimmed placeholders below. A persistent step indicator strip sits at the top of the canvas (not the global header).

```
┌─────────────────────────────────────────────────┐
│  STEP INDICATOR STRIP                            │
│  ①──②──③──④──⑤──⑥  (progress dots + labels)  │
├─────────────────────────────────────────────────┤
│  [✓ STEP 1: SPY · 2yr · Hourly]  (collapsed)   │
│  [✓ STEP 2: DWT Denoising]        (collapsed)   │
├─────────────────────────────────────────────────┤
│  STEP 3: Architecture Backbone                   │
│  ┌──────────────────────────────────────────┐   │
│  │  [active expanded card content]          │   │
│  │  [Back]                    [Continue →]  │   │
│  └──────────────────────────────────────────┘   │
├─────────────────────────────────────────────────┤
│  [◌ STEP 4: Hyperparameters]      (locked)      │
│  [◌ STEP 5: Compute Target]       (locked)      │
│  [◌ STEP 6: Review & Submit]      (locked)      │
└─────────────────────────────────────────────────┘
```

**Collapsed completed card:** Shows a one-line summary of the selection (e.g., "SPY · 2yr · Hourly") and an **Edit** link that collapses all subsequent steps and returns to that card. Editing a step resets all downstream steps.

**Locked placeholder card:** Dimmed card with step number, title, and a lock icon. Not interactive until the preceding step is completed.

#### Step Card Specifications

**Step 1 — Ticker & Data Selection**
- `Select` dropdown: SPY, AAPL, NVDA, TSLA (shadcn/ui Select)
- Date range: implicit (always "last 2 years of hourly data" per PRD §3); no date picker exposed in MVP
- "Fetch & Preview" button: triggers daemon REST call; shows inline skeleton loader while fetching, then renders a sparkline (Recharts `AreaChart`, ~120px tall) of the last 30 trading days' close prices on success; inline error with retry CTA on failure

**Step 2 — Denoising Pipeline**
- `ToggleGroup` (shadcn/ui), single-select, horizontal layout
- Options: `None` / `Kalman Filter` / `DWT (db4)`
- Each option has a 1-line sub-label describing the method in plain English

**Step 3 — Architecture Backbone**
- `Select` dropdown with five options: TFT, TCN (CNN-LSTM), BiLSTM, LSTM, GRU
- A collapsible info block below the dropdown renders a 2-sentence description of the selected architecture (static copy, no API call)
- **TFT warning:** If TFT is selected, display a `Badge` variant="warning": "TFT uses a separate data preparation path and trains via PyTorch Lightning. Expect longer setup time."

**Step 4 — Hyperparameter Configuration**

| Parameter | Component | Constraints |
|---|---|---|
| Sequence / Lookback Length | Segmented control (`ToggleGroup`): 24h / 48h / 72h | Three fixed values per PRD |
| Learning Rate | `Input` (type=number) with step=0.0001 | Range: 0.0001–0.1 |
| Batch Size | Segmented control: 16 / 32 / 64 / 128 | Fixed options per PRD |
| Epochs | `Slider` (1–100) + `Input` (synchronized) | Slider and input are two-way bound |
| Dropout Rate | `Slider` (0.0–0.5, step 0.05) + numeric readout | |
| Optimizer | `Select`: AdamW / Ranger / SGD | |

The entire hyperparameter grid uses a 2-column CSS Grid layout on wide viewports.

**Step 5 — Compute Target**
- `RadioGroup` (shadcn/ui): Local Daemon / RunPod Serverless
- **Local Daemon option:** Shows current daemon status inline (green/red badge). If daemon is offline, the option is visually disabled with a note: "Start daemon.py to enable."
- **RunPod option:** Shows whether a RunPod API key is configured (green "Key Configured" badge or amber "No Key — configure in Settings" badge). Selecting RunPod when no key is set auto-opens the Settings Dialog.

**Step 6 — Review & Submit**
- Read-only summary card of all configuration values, rendered in a 2-column definition list
- A generated `run_id` (UUID) is shown — this is generated client-side at this step and passed in the dispatch payload
- **"Start Training" CTA button** (primary, full-width): Triggers `START_TRAINING` dispatch and opens the Training Drawer. Button is disabled if daemon is offline and Local is selected, or if RunPod key is missing and RunPod is selected.

---

### 3.2 Active Training Drawer

**Trigger:** Opened automatically when "Initialize Training" is clicked. Cannot be dismissed (closed entirely) while training is active. Can be minimized.

**States:**

| State | Height | Description |
|---|---|---|
| Open | 320px | Full drawer, all panels visible |
| Minimized | 48px | Pill at bottom showing run progress + expand button |
| Post-completion | — | Drawer closes automatically 3 seconds after `TRAINING_COMPLETE` is received; a toast notification summarizes the results |

**Minimize/Expand:** A chevron-down / chevron-up icon button in the drawer's top-right corner. The minimized pill shows: `[animated bar] BiLSTM · Epoch 24/50 · 48% · [↑ Expand]`.

**Drawer interior layout (when open):**

```
┌────────────────────────────────────────────────────────┐
│  run_abc123 · BiLSTM · DWT · SPY              [−] [✕*] │
├────────────────────────────────────────────────────────┤
│  PROGRESS BAR  ████████░░░░░░░░░░  Epoch 24/50 (48%)  │
│  ETA: ~3 min 12 sec                                    │
├──────────────────────┬─────────────────────────────────┤
│  LOSS CHART (Recharts│  EPOCH LOG (ScrollArea)         │
│  train vs val loss)  │  > Epoch 24 | train: 0.0142    │
│  ~180px tall SVG     │  > Epoch 23 | val:   0.0165    │
│                      │  > Epoch 22 | ...              │
├──────────────────────┴─────────────────────────────────┤
│  [Cancel Training]                    Compute: Local   │
└────────────────────────────────────────────────────────┘

* ✕ button only enabled after TRAINING_COMPLETE or TRAINING_FAILED
```

**Loss Chart (Recharts `LineChart`):**
- Two lines: `train_loss` (cyan `#06b6d4`) and `val_loss` (amber `#f59e0b`)
- X-axis: epoch number; Y-axis: loss value (auto-scaled)
- Updates on each `EPOCH_METRIC` WebSocket event
- No animation on data append (performance) — `isAnimationActive={false}`

**Epoch Log (shadcn/ui `ScrollArea`):**
- Fixed height, auto-scrolls to the latest entry
- Each line: `Epoch {n} | train: {train_loss} | val: {val_loss} | {elapsed}s`
- Rendered in monospace font
- Max retained lines: 200 (older entries dropped from the top)

**Training failure state:** The progress bar turns red, an error message replaces the ETA line, and the ✕ button becomes active so the drawer can be dismissed.

**RunPod training:** The loss chart and epoch log are replaced by a polling status indicator ("Waiting for RunPod container…", "Container started", "Training in progress…") since RunPod does not stream epoch-level events. The ETA is not shown.

---

### 3.3 Tab 2 — Evaluation Deck (Comparison Dashboard)

This is the primary presentation surface. It must look operationally impressive and remain snappy under model toggles (≤ 300ms re-render per PRD §5.1).

**Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  DECK HEADER: [SPY ▾] [Live Mode ⚡] [Simulation 🎬] [SIMULATION BANNER*]
├──────────────────────────────────────────────────┬──────────────┤
│                                                  │  CONTROL     │
│  MASTER CHART CANVAS                             │  PANEL       │
│  (Chart.js canvas — 75% width)                   │  (25% width) │
│                                                  │              │
│                                                  │  [← Collapse]│
│                                                  │              │
│  Hourly OHLCV close + model prediction overlays  │  Model list  │
│                                                  │  + metrics   │
│                                                  │              │
├──────────────────────────────────────────────────┴──────────────┤
│  METRICS COMPARISON TABLE (full width, below chart)             │
└─────────────────────────────────────────────────────────────────┘

* SIMULATION BANNER: persistent amber top-strip reading "● SIMULATION" 
  when simulation mode is active. Hidden in live mode.
```

#### Master Chart Canvas

**Library:** Chart.js (Canvas renderer) — chosen for multi-line high-frequency update performance per System Architecture Spec §3.1.1.

**Chart configuration:**
- Dark canvas background (`#0a0a0a`), matching `bg-neutral-950`
- X-axis: hourly timestamps, auto-formatted (`HH:mm` for intraday, `MMM D` for multi-day)
- Y-axis: USD price, right-aligned, monospace font
- Pan and zoom: enabled via `chartjs-plugin-zoom` (mouse wheel = zoom, drag = pan)
- Legend: hidden (the Control Panel sidebar serves as the legend)

**Dataset lines:**

| Series | Color | Style | Notes |
|---|---|---|---|
| Actual Close | `#FFFFFF` with 0.15 opacity fill below | Solid, 2px | Always rendered; not toggleable |
| ARIMA Baseline | `#64748b` | Dashed, 1.5px | Shown when ARIMA row is checked |
| DL Model 1 | `#06b6d4` (Cyan) | Solid, 1.5px | Assigned in registration order |
| DL Model 2 | `#d946ef` (Magenta) | Solid, 1.5px | |
| DL Model 3 | `#84cc16` (Lime) | Solid, 1.5px | |
| DL Model 4 | `#f59e0b` (Amber) | Solid, 1.5px | |

Colors are assigned to `run_id`s at registration time and persist for the session. If more than 4 DL models are active simultaneously, colors cycle.

**Live/Simulation append behavior:** New data points are appended to the Chart.js dataset and `chart.update('none')` is called (no animation) to meet the ≤ 300ms constraint. The chart auto-scrolls to the latest timestamp.

#### Control Panel (Right Column)

**Width:** 25% of canvas width. Collapsible — a `[⟨]` chevron button at the panel's left edge collapses it to a 32px-wide collapsed rail. Clicking the rail re-expands it. When collapsed, the chart canvas expands to 100% width.

**Collapsed rail:** Shows only the color-coded dots for active models stacked vertically — a visual-only indicator.

**Panel interior (when expanded):**

```
┌──────────────────────────────┐
│  [⟨ Collapse]               │
├──────────────────────────────┤
│  ● LIVE MODE    ○ SIMULATION │  ← Switch (shadcn/ui Switch)
├──────────────────────────────┤
│  MODELS                      │
│  [Compare All]               │
│  ─────────────────────────   │
│  [●] ARIMA Baseline   [⌛*]  │  ← pinned, always first
│      RMSE: 2.11              │
│  ─────────────────────────   │
│  [●] run_abc · BiLSTM        │
│      DWT · SPY               │
│      RMSE: 1.24  DA: 61%     │
│  ─────────────────────────   │
│  [○] run_def · TFT           │
│      None · AAPL             │
│      RMSE: 1.87  DA: 55%     │
└──────────────────────────────┘

* ⌛ shown while ARIMA is computing on tab open (pre-compute path)
```

**Model rows:**
- Each row is a `ToggleCard` (custom, built on shadcn/ui `Checkbox` + `Card`)
- Left: colored swatch dot matching the chart line color
- Middle: `run_id` (truncated to 8 chars), backbone label, denoiser badge, ticker badge
- Bottom: RMSE and Directional Accuracy (the two most presentation-friendly metrics per PRD §8)
- Right: a trash icon (`DELETE /api/registry/{run_id}`) — only visible on hover; shows a confirmation popover before deletion
- Toggling a checkbox triggers an immediate `chart.update('none')` — no intermediate loading state

**ARIMA row specifics:** Pinned at the top of the model list, always present. The row is idle until the user checks ARIMA or clicks "Compare All"; either action fires `POST /api/arima` for the currently selected ticker if no cached ARIMA result is available. The ARIMA row shows a spinner (`⌛`) while the request is in flight, then populates metrics and keeps the checkbox interactive. If ARIMA computation fails, the row shows an inline "Retry" link.

**"Compare All" button:** Sets all completed model checkboxes to checked state and triggers ARIMA computation if needed. Triggers a single `chart.update('none')` call after all immediately available datasets are set; the ARIMA dataset is added when its response arrives.

#### Metrics Comparison Table

Rendered below the chart canvas, full width. Auto-populates for all checked models.

| Model | Backbone | Denoiser | Ticker | RMSE | MAE | MAPE | Dir. Accuracy |
|---|---|---|---|---|---|---|---|
| ARIMA Baseline | — | — | SPY | 2.11 | 1.67 | 0.78% | 52% |
| run_abc123 | BiLSTM | DWT | SPY | 1.24 | 0.98 | 0.46% | 61% |

**Styling notes:**
- Numbers rendered in monospace font
- RMSE column: the best (lowest) value is highlighted with a green text accent; the worst is highlighted red
- Directional Accuracy column: values ≥ 0.55 shown in green; values ≤ 0.50 shown in red/muted
- Table updates instantly (≤ 300ms) when model toggles change — driven by the Zustand `activeChartOverlays` slice

---

### 3.4 Simulation Mode — Visual Distinctions

When simulation mode is active, the following UI elements change:

1. A persistent amber banner strip at the top of the Evaluation Deck canvas reads `● SIMULATION — Replaying {ticker} · {date}`. The dot pulses at 1Hz.
2. The Live Mode / Simulation toggle in the Control Panel reflects the active state.
3. A speed control appears below the toggle: a `SegmentedControl` with options `1×`, `10×`, `30×`, `60×`. Default: `10×` (per PRD §4.7). Changing speed takes effect on the next tick.
4. All inference behavior is identical to Live Mode — the daemon receives `INFER` WebSocket messages and responds with `INFER_RESULT` exactly as it would for real live bars.

---

### 3.5 Settings Dialog

**Trigger:** Settings cog in the Global Header.  
**Component:** shadcn/ui `Dialog` (modal).

**Sections:**

| Section | Fields | Notes |
|---|---|---|
| Alpaca Markets | API Key, API Secret | Masked inputs; read/write `localStorage` keys `qf_alpaca_key`, `qf_alpaca_secret` |
| RunPod | API Key | Masked input; `qf_runpod_key` |
| Daemon | WebSocket URL override | Default `ws://localhost:8765`; `qf_daemon_url` |
| Preferences | Default Ticker, Default Simulation Speed | `qf_default_ticker`, `qf_sim_speed` |

All fields write directly to `localStorage` on change (no Save button needed). A "Test Connection" button for the Daemon URL sends a `PING` to the configured URL and reports the result inline.

---

### 3.6 Error & Empty States

| Condition | Component | UI Behavior |
|---|---|---|
| Daemon offline on mount | Global Header + Forge | Persistent red warning banner below the tab bar: "Local daemon offline. Run `python daemon.py` to enable local training and inference." |
| Daemon WebSocket drops mid-training | Training Drawer | Auto-reconnect toasts (3 attempts). On final failure: Drawer shows error state; Active Job Pill in header turns red. |
| `yfinance` fetch fails (Step 1) | Step 1 card | Inline error replacing the sparkline: "Data unavailable for {ticker}. [Retry]" |
| Alpaca WebSocket disconnects | Evaluation Deck header | Toast notification "Live connection lost. Reconnecting…"; auto-reconnect with exponential backoff |
| RunPod job fails | Model Registry row | Status badge "Failed" in red; tooltip with raw error message from RunPod |
| Model weights unavailable | Control Panel model row | "Weights unavailable" badge; checkbox disabled; model excluded from chart |
| CUDA OOM | Training Drawer | `TRAINING_FAILED` displayed with message: "GPU out of memory. Try reducing Batch Size or Sequence Length." |
| No models in registry | Evaluation Deck control panel | Empty state illustration + "No trained models yet. Go to Architecture Forge to train your first model." |

---

## 4. Component Library Map

Built on **shadcn/ui** (Radix UI primitives) + **Tailwind CSS**. All components are customized to the dark terminal theme.

| UI Element | shadcn/ui Component | Usage |
|---|---|---|
| Step cards | `Card`, `CardHeader`, `CardContent` | Each wizard step in Architecture Forge |
| Step indicator strip | Custom (CSS `flex` + `div` dots) | Persistent step progress above wizard |
| Dropdown selects | `Select`, `SelectTrigger`, `SelectContent` | Ticker, backbone, optimizer |
| Toggle groups | `ToggleGroup`, `ToggleGroupItem` | Denoiser selection, sequence length, batch size |
| Sliders | `Slider` | Epochs, dropout |
| Number inputs | `Input` (type=number) | Learning rate, synced epoch input |
| Compute radio | `RadioGroup`, `RadioGroupItem` | Local vs. RunPod |
| Training progress | `Progress` | Epoch progress bar in drawer |
| Loss chart | Recharts `LineChart` | train_loss vs. val_loss in drawer |
| Terminal log | `ScrollArea` | Epoch log stream in drawer |
| Model toggles | `Checkbox` + custom card wrapper | Model on/off in Evaluation Deck sidebar |
| Live/Sim switch | `Switch` | Mode toggle in control panel |
| Speed control | `ToggleGroup` | Simulation speed 1×/10×/30×/60× |
| Status badges | `Badge` | Daemon status, denoiser labels, RMSE |
| Settings modal | `Dialog` | API key configuration |
| Inline alerts | `Alert`, `AlertDescription` | Error states, TFT warning |
| Delete confirm | `Popover` | Model deletion confirmation |
| Drawer | Custom (CSS `fixed bottom-0`) | Training drawer (shadcn Sheet or custom) |
| Toast | `Sonner` (or shadcn `Toast`) | WebSocket events, training completion |
| Master chart | Chart.js Canvas | Multi-line live inference chart |
| Sparkline | Recharts `AreaChart` | Data preview in Step 1 |

---

## 5. State Management (Zustand)

Three stores cover all transient client state. **The daemon SQLite database is always the source of truth for registry data.** Zustand never writes registry state; it only caches a fetched snapshot.

### 5.1 `useSystemStore` — Global Hardware & Connection State

```typescript
type DaemonStatus = 'offline' | 'online' | 'training';
type SimSpeed = 1 | 10 | 30 | 60;

interface SystemState {
  // Connection state
  daemonStatus: DaemonStatus;
  daemonDeviceName: string | null;         // From PING handshake, e.g. "RTX 4070 Ti"
  cudaAvailable: boolean;
  daemonVersion: string | null;

  // Credentials (hydrated from localStorage on mount — never stored in Zustand)
  // Note: credentials are read directly from localStorage at call-sites;
  // they are NOT mirrored into Zustand to prevent accidental serialization.

  // Preferences (hydrated from localStorage)
  defaultTicker: string;
  simulationSpeed: SimSpeed;
  daemonUrl: string;                       // default: 'ws://localhost:8765'

  // Live/Simulation mode (Evaluation Deck)
  isLiveModeActive: boolean;
  isSimulationActive: boolean;

  // Actions
  setDaemonStatus: (status: DaemonStatus, meta?: { deviceName?: string; cudaAvailable?: boolean; version?: string }) => void;
  setLiveMode: (active: boolean) => void;
  setSimulationMode: (active: boolean) => void;
  setSimulationSpeed: (speed: SimSpeed) => void;
}
```

**Hydration:** On app mount, a `useEffect` in the root layout reads `localStorage` values for `qf_daemon_url`, `qf_default_ticker`, and `qf_sim_speed` and calls the appropriate setters. Credentials are never written into Zustand.

**WebSocket lifecycle:** A singleton WebSocket instance is managed outside Zustand (in a `daemonSocket.ts` module). It calls `setDaemonStatus` on `onopen`, `onclose`, and `onmessage` events where status changes. This avoids storing the `WebSocket` object in Zustand (non-serializable).

---

### 5.2 `useBuilderStore` — Architecture Forge Wizard State

```typescript
type Backbone = 'TFT' | 'TCN' | 'BiLSTM' | 'LSTM' | 'GRU';
type Denoiser = 'None' | 'Kalman' | 'DWT';
type Optimizer = 'AdamW' | 'Ranger' | 'SGD';
type SequenceLength = 24 | 48 | 72;
type BatchSize = 16 | 32 | 64 | 128;
type ComputeTarget = 'local' | 'runpod';

interface DraftConfig {
  ticker: string;
  denoiser: Denoiser;
  backbone: Backbone;
  hyperparameters: {
    sequenceLength: SequenceLength;
    learningRate: number;
    batchSize: BatchSize;
    epochs: number;
    dropoutRate: number;
    optimizer: Optimizer;
  };
  computeTarget: ComputeTarget;
}

interface BuilderState {
  currentStep: 1 | 2 | 3 | 4 | 5 | 6;
  completedSteps: Set<number>;
  draftConfig: DraftConfig;
  dataPreviewStatus: 'idle' | 'loading' | 'success' | 'error';
  dataPreviewError: string | null;
  pendingRunId: string | null;             // UUID generated at Step 6, cleared after dispatch

  // Actions
  setStep: (step: number) => void;
  markStepComplete: (step: number) => void;
  editStep: (step: number) => void;        // Resets all steps > step; sets currentStep = step
  updateDraftConfig: (patch: Partial<DraftConfig>) => void;
  updateHyperparameter: (key: keyof DraftConfig['hyperparameters'], value: unknown) => void;
  setDataPreviewStatus: (status: BuilderState['dataPreviewStatus'], error?: string) => void;
  generateRunId: () => void;               // Generates UUID, stores in pendingRunId
  resetWizard: () => void;                 // Called after successful training dispatch
}
```

**editStep behavior:** Calling `editStep(n)` sets `currentStep = n` and removes all step indices `> n` from `completedSteps`. This resets downstream step selections to their defaults, preventing invalid configurations (e.g., a ticker change that invalidates a prior sparkline preview).

---

### 5.3 `useTrainingStore` — Active Training Job State

This is separated from `useBuilderStore` because training state persists (and is visible in the header) even when the user navigates to the Evaluation Deck.

```typescript
type TrainingStatus = 'idle' | 'dispatched' | 'training' | 'completed' | 'failed';

interface EpochMetric {
  epoch: number;
  trainLoss: number;
  valLoss: number;
  elapsedSeconds: number;
}

interface TrainingState {
  status: TrainingStatus;
  activeRunId: string | null;
  activeConfig: DraftConfig | null;        // Snapshot of config at dispatch time
  currentEpoch: number;
  totalEpochs: number;
  epochMetrics: EpochMetric[];             // Full history for the loss chart
  logLines: string[];                      // Terminal-style epoch log; capped at 200 entries
  errorMessage: string | null;
  isDrawerOpen: boolean;
  isDrawerMinimized: boolean;

  // Actions
  dispatchTraining: (runId: string, config: DraftConfig) => void;
  handleEpochMetric: (event: EpochMetricEvent) => void;  // Called by WS message handler
  handleTrainingComplete: (event: TrainingCompleteEvent) => void;
  handleTrainingFailed: (event: TrainingFailedEvent) => void;
  cancelTraining: () => void;              // Sends STOP signal; sets status = 'failed'
  setDrawerOpen: (open: boolean) => void;
  setDrawerMinimized: (minimized: boolean) => void;
  resetTraining: () => void;              // Called 3s after completion; clears active job
}
```

**Log line cap:** `logLines` is maintained as a fixed-size array. When a new log line is appended and `logLines.length > 200`, the oldest entry is dropped from index 0. This prevents unbounded memory growth during long training runs.

**`dispatchTraining`:** Sets `status = 'dispatched'`, stores the config snapshot, sets `isDrawerOpen = true`, and generates the initial `logLines` entry `"Dispatching to {computeTarget}..."`. The actual WebSocket send is handled by the component, not the store.

---

### 5.4 `useRegistryStore` — Model Registry Cache & Evaluation Deck State

```typescript
interface ModelRecord {
  runId: string;
  ticker: string;
  backbone: Backbone;
  denoiser: Denoiser;
  hyperparams: DraftConfig['hyperparameters'];
  metrics: { rmse: number; mae: number; mape: number; directionalAccuracy: number } | null;
  weightsPath: string;
  createdAt: string;
  status: 'completed' | 'failed' | 'training';
}

interface ArimaResult {
  ticker: string;
  metrics: { rmse: number; mae: number; mape: number; directionalAccuracy: number };
  predictions: number[];
}

// Color palette for chart line assignment
const CHART_COLORS = ['#06b6d4', '#d946ef', '#84cc16', '#f59e0b'];

interface RegistryState {
  // Registry cache (source of truth: daemon SQLite)
  models: ModelRecord[];
  fetchStatus: 'idle' | 'loading' | 'error';
  lastFetchedAt: number | null;            // epoch ms; used to avoid redundant fetches

  // ARIMA state (computed on demand from the Evaluation Deck)
  arimaResult: ArimaResult | null;
  arimaStatus: 'idle' | 'computing' | 'ready' | 'error';
  arimaIncluded: boolean;                  // Whether ARIMA row is checked on the chart

  // Evaluation Deck chart state
  activeChartOverlays: string[];           // Array of run_ids currently toggled on
  colorAssignments: Record<string, string>; // { run_id: hex_color }
  isControlPanelCollapsed: boolean;

  // Selected ticker for Evaluation Deck (may differ from Builder ticker)
  evaluationTicker: string;

  // Actions
  fetchRegistry: () => Promise<void>;      // GET /api/registry; updates models cache
  deleteModel: (runId: string) => Promise<void>; // DELETE /api/registry/{run_id}; re-fetches
  triggerArimaCompute: (ticker: string) => Promise<void>; // POST /api/arima
  retryArima: () => void;                  // Re-triggers triggerArimaCompute for current ticker

  toggleModelOverlay: (runId: string) => void;
  toggleArimaOverlay: () => void;
  toggleAllModels: () => void;             // "Compare All" — checks completed models and computes ARIMA if needed
  setControlPanelCollapsed: (collapsed: boolean) => void;
  setEvaluationTicker: (ticker: string) => void;
  assignColor: (runId: string) => string;  // Returns color from palette; memoizes assignment
}
```

**Fetch policy:** `fetchRegistry` is called in three places:
1. On Evaluation Deck tab mount (always)
2. After `TRAINING_COMPLETE` is received in `useTrainingStore` (triggers a registry refresh so the new model appears)
3. After `deleteModel` completes

`lastFetchedAt` is used to skip redundant fetches if two calls happen within 2 seconds of each other (e.g., tab switch during a rapid training completion).

**Color assignment:** `assignColor(runId)` checks `colorAssignments` first. If not found, it picks the next unused color from `CHART_COLORS` (cycling after 4). The assignment is persisted in the store for the session, ensuring a model's line color doesn't change as other models are added/removed.

**ARIMA compute trigger:** When the user checks the ARIMA row or clicks "Compare All", the `EvaluationDeck` component calls `triggerArimaCompute(evaluationTicker)` if `arimaStatus === 'idle'` or `'error'`. The ARIMA row in the Control Panel shows a spinner until `arimaStatus === 'ready'`. Changing `evaluationTicker` resets `arimaStatus = 'idle'` and `arimaResult = null`; the next user action triggers a fresh compute for the new ticker.

---

## 6. WebSocket Message Handling Architecture

The daemon WebSocket connection is managed by a singleton module (`lib/daemonSocket.ts`) outside of React and Zustand, to avoid re-creating connections on re-renders.

```
[daemonSocket.ts singleton]
  │
  ├── onopen   → useSystemStore.setDaemonStatus('online', handshakeData)
  ├── onclose  → useSystemStore.setDaemonStatus('offline')
  │
  └── onmessage → switch(event.type):
        EPOCH_METRIC      → useTrainingStore.handleEpochMetric(event)
        TRAINING_COMPLETE → useTrainingStore.handleTrainingComplete(event)
                          → useRegistryStore.fetchRegistry()      [triggers registry refresh]
        TRAINING_FAILED   → useTrainingStore.handleTrainingFailed(event)
        INFER_RESULT      → chartBridge.appendInferencePoint(event) [direct Chart.js API call]
```

**`chartBridge`:** A lightweight module that holds a reference to the active Chart.js instance and exposes `appendInferencePoint(event)`. This allows `INFER_RESULT` events to update the chart canvas without going through React state — meeting the ≤ 300ms constraint for live data appends.

**Reconnection logic:** Handled inside `daemonSocket.ts`. On `onclose`, it schedules reconnection attempts at 2s, 4s, 8s intervals. After 3 failed attempts, it sets `daemonStatus = 'offline'` permanently and shows a toast: "Daemon connection lost. Reload the app to reconnect."

---

## 7. Data Flow Summary

### 7.1 Training Flow (Local Daemon)

```
User clicks "Start Training" (Step 6)
  → useBuilderStore.generateRunId()
  → useTrainingStore.dispatchTraining(runId, config)
  → daemonSocket.send({ action: "START_TRAINING", run_id, configuration })
  → Drawer opens (isDrawerOpen = true)

Daemon streams EPOCH_METRIC events
  → useTrainingStore.handleEpochMetric() updates epoch count, metrics, log lines
  → Recharts loss chart re-renders (driven by epochMetrics array in store)

Daemon emits TRAINING_COMPLETE
  → useTrainingStore.handleTrainingComplete() → sets status = 'completed'
  → useRegistryStore.fetchRegistry() → re-fetches SQLite; new model appears in registry
  → Drawer auto-closes after 3 seconds
  → useBuilderStore.resetWizard()
```

### 7.2 Live Inference Flow

```
Alpaca WebSocket (browser-direct) emits a new bar
  → useSystemStore (isLiveModeActive === true) gates processing
  → For each run_id in useRegistryStore.activeChartOverlays:
      daemonSocket.send({ action: "INFER", run_id, bar })
  → Daemon responds with INFER_RESULT per run_id
  → chartBridge.appendInferencePoint() calls chart.data.datasets[idx].push(point)
                                                         + chart.update('none')
```

### 7.3 Simulation Flow

```
setInterval fires at configured speed (1 real hour = 5000ms at 10×)
  → Picks next bar from loaded sim_data JSON
  → Passes bar through the same INFER path as live mode
  → SIMULATION banner remains visible throughout
```

---

## 8. Theming & Visual Language

### 8.1 Color Palette

```css
/* Background layers */
--bg-base:    #0a0a0a;   /* Main canvas, near black (bg-neutral-950) */
--bg-surface: #171717;   /* Cards, panels (bg-neutral-900) */
--bg-raised:  #262626;   /* Inputs, hover states (bg-neutral-800) */

/* Borders */
--border:     #404040;   /* Subtle dividers (border-neutral-700) */

/* Text */
--text-primary:   #fafafa;   /* Main readable text */
--text-secondary: #a3a3a3;   /* Labels, metadata */
--text-mono:      #d4d4d4;   /* Numbers, tickers, log output */

/* Semantic */
--success:  #22c55e;   /* Daemon online, positive DA */
--warning:  #f59e0b;   /* Amber alerts, val_loss line */
--error:    #ef4444;   /* Daemon offline, failed runs, negative DA */
--info:     #3b82f6;   /* Info badges */

/* Chart prediction lines */
--chart-actual: #ffffff;
--chart-arima:  #64748b;
--chart-cyan:   #06b6d4;
--chart-magenta:#d946ef;
--chart-lime:   #84cc16;
--chart-amber:  #f59e0b;
```

### 8.2 Typography

| Use case | Font | Weight | Notes |
|---|---|---|---|
| UI labels, headings, body | Tailwind default sans-serif (`ui-sans-serif`) | 400–600 | Standard readability |
| Metrics, prices, tickers, epoch log | `JetBrains Mono` or `Roboto Mono` | 400–500 | Numbers must align vertically in tables |
| Chart axis labels | Inherits Chart.js font config; set to monospace | — | |

Apply `font-mono` Tailwind class to: all metric table cells, the RMSE/DA badges in the Control Panel, the epoch log `ScrollArea`, the progress pill text, and all price values on the chart.

### 8.3 Motion Guidelines

| Animation | Duration | Easing | Notes |
|---|---|---|---|
| Tab switch content fade | 100ms | `ease-out` | Barely perceptible — feels instant |
| Card expand/collapse (wizard) | 200ms | `ease-in-out` | Height transition via CSS `grid-rows` trick |
| Drawer open/close | 250ms | `ease-out` | Slides up from bottom |
| Drawer minimize | 150ms | `ease-in` | Collapses to pill; faster feels snappier |
| Control panel collapse | 200ms | `ease-in-out` | Width transition |
| Progress bar fill | Continuous | `linear` | The one "slow" animation — emphasizes computation |
| Daemon status dot pulse | 1.5s | `ease-in-out`, looping | Only on `training` state |
| Simulation banner pulse | 1s | `ease-in-out`, looping | Amber dot blinks |
| Chart data append | 0ms | — | `chart.update('none')` — no animation, pure performance |
| Toast notification | 300ms | `ease-out` | Slides in from bottom-right |

All transitions use CSS variables or Tailwind's built-in transition utilities. No third-party animation library is required for this scope.

### 8.4 Spacing & Density

The UI targets a "dense but breathable" layout appropriate for a technical dashboard viewed on a 1080p or 1440p projected screen:
- Card padding: `p-4` (16px) uniformly
- Grid gaps: `gap-4` within cards; `gap-6` between major sections
- Control Panel model rows: `py-3 px-4` with a `1px border-b border-neutral-800` divider
- Metrics table cells: `py-2 px-3`

---

## 9. Implementation Notes for Claude Code

The following decisions are finalized and should not require further disambiguation:

**Wizard step navigation is store-driven.** `useBuilderStore.currentStep` is the single source of truth for which card is active. Components read this value; they do not maintain local step state.

**The Training Drawer mounts once and persists across tab changes.** It is rendered in the app shell (outside the tab router), not inside the Architecture Forge tab. It reads from `useTrainingStore`.

**The Active Job Pill in the header is conditional on `useTrainingStore.status === 'training' || status === 'dispatched'`.** It disappears after `resetTraining()` is called.

**Chart.js instance lifecycle:** The Chart.js canvas mounts when the Evaluation Deck tab first renders and is destroyed on tab unmount. The `chartBridge` module holds a `WeakRef` or nullable ref to the instance and handles the case where the tab is not mounted when an `INFER_RESULT` arrives (drops the point silently — acceptable during tab switches).

**ARIMA is computed on demand per ticker.** Switching `evaluationTicker` in the Evaluation Deck resets `arimaStatus = 'idle'` and clears `arimaResult`. The next ARIMA toggle or Compare All action triggers a new `POST /api/arima` call; the ARIMA row shows a spinner until the result arrives.

**No loading gate on the Evaluation Deck.** The tab renders immediately with an empty chart and "Loading models…" skeleton in the Control Panel. Registry data populates as the `fetchRegistry` Promise resolves. This prevents a blank screen delay during the demo.

**RunPod polling:** The frontend polls `GET https://api.runpod.ai/v2/{endpoint_id}/status/{job_id}` every 5 seconds using a `setInterval`. On completion, it downloads all four artifacts and calls `POST /api/registry` on the daemon to register the run. Polling is cleared on component unmount or status = `COMPLETED`/`FAILED`.

**`editStep(n)` resets downstream state.** When the user clicks "Edit" on a completed collapsed step card, `useBuilderStore.editStep(n)` is called. This clears `completedSteps` for all steps `> n` and resets their `draftConfig` fields to defaults. The `dataPreviewStatus` is reset to `'idle'` if step 1 is re-edited.

---

## 10. Out of Scope (UI/UX MVP)

Consistent with PRD §6:

- Mobile or tablet responsive layouts
- Dark/light mode toggle (dark mode only)
- Keyboard shortcut navigation within the wizard
- Drag-and-drop reordering of models in the Control Panel
- Chart export (PNG/SVG download)
- Hyperparameter comparison diff view between two runs
- In-app `daemon.py` process launcher (user runs it manually in a terminal)
