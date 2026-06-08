"""
Integration smoke script for the QuantiForge daemon.

Simulates a complete client session:
  PING → READY → START_TRAINING (2 epochs, SPY, None) →
  EPOCH_METRIC × 2 → TRAINING_COMPLETE → INFER × N → INFER_RESULT → summary

Requirements:
  - Daemon must be running: cd daemon && python daemon.py
  - websockets must be installed: pip install websockets

Usage:
  python daemon/tests/smoke_run.py                        # default ws://127.0.0.1:8765/ws
  python daemon/tests/smoke_run.py ws://127.0.0.1:8765/ws
"""

import asyncio
import json
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone

try:
    import websockets
except ImportError:
    print("ERROR: 'websockets' not installed.")
    print("       Run: pip install websockets")
    sys.exit(1)

DAEMON_URL = sys.argv[1] if len(sys.argv) > 1 else "ws://127.0.0.1:8765/ws"
SEQ_LEN    = 24     # smallest sequence length — warms up buffer in 24 INFER calls
EPOCHS     = 2
TICKER     = "SPY"
DENOISER   = "None"

# Generous timeouts — data fetch + 2-epoch train can take 2–5 min on first run
TRAINING_TIMEOUT_S = 600
INFER_TIMEOUT_S    = 5


# ---------------------------------------------------------------------------
# Main smoke routine
# ---------------------------------------------------------------------------

async def _run_smoke() -> bool:
    print(f"\n{'='*60}")
    print(f"  QuantiForge Daemon Smoke Test")
    print(f"  URL    : {DAEMON_URL}")
    print(f"  Config : {TICKER} · {DENOISER} denoiser · {EPOCHS} epochs · seq_len={SEQ_LEN}")
    print(f"{'='*60}\n")

    wall_start = time.time()
    run_id = str(uuid.uuid4())

    try:
        async with websockets.connect(DAEMON_URL) as ws:

            # ------------------------------------------------------------------
            # Step 1 — PING → READY
            # ------------------------------------------------------------------
            print("[1/5] PING →")
            await ws.send(json.dumps({
                "action":    "PING",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }))
            raw = await asyncio.wait_for(ws.recv(), timeout=10)
            ready = json.loads(raw)
            assert ready.get("status") == "READY", f"Unexpected PING response: {ready}"
            cuda = ready.get("cuda_available", False)
            device = ready.get("device_name", "unknown")
            version = ready.get("daemon_version", "?")
            print(f"       READY  daemon_version={version}  cuda={cuda}  device={device}")

            # ------------------------------------------------------------------
            # Step 2 — START_TRAINING
            # ------------------------------------------------------------------
            config = {
                "ticker":   TICKER,
                "denoiser": DENOISER,
                "backbone": "LSTM",
                "hyperparameters": {
                    "sequenceLength": SEQ_LEN,
                    "learningRate":   0.001,
                    "batchSize":      32,
                    "epochs":         EPOCHS,
                    "dropoutRate":    0.2,
                    "optimizer":      "AdamW",
                },
            }
            print(f"\n[2/5] START_TRAINING  run_id={run_id[:8]}… →")
            await ws.send(json.dumps({
                "action":        "START_TRAINING",
                "run_id":        run_id,
                "configuration": config,
            }))

            # ------------------------------------------------------------------
            # Step 3 — Collect EPOCH_METRIC × EPOCHS, then TRAINING_COMPLETE
            # ------------------------------------------------------------------
            print(f"\n[3/5] Waiting for {EPOCHS} EPOCH_METRIC + TRAINING_COMPLETE …")
            epoch_metrics: list[dict] = []
            training_complete: dict | None = None

            while training_complete is None:
                raw = await asyncio.wait_for(ws.recv(), timeout=TRAINING_TIMEOUT_S)
                event = json.loads(raw)
                evt = event.get("event", "")

                if evt == "EPOCH_METRIC":
                    epoch_metrics.append(event)
                    ep    = event.get("current_epoch", "?")
                    total = event.get("total_epochs",  "?")
                    m     = event.get("metrics", {})
                    tl    = m.get("train_loss", float("nan"))
                    vl    = m.get("val_loss",   float("nan"))
                    print(f"       EPOCH_METRIC {ep}/{total}  train_loss={tl:.5f}  val_loss={vl:.5f}")

                elif evt == "TRAINING_COMPLETE":
                    training_complete = event
                    tm = event.get("metrics", {})
                    print(
                        f"       TRAINING_COMPLETE  "
                        f"RMSE={tm.get('rmse')}  MAE={tm.get('mae')}  "
                        f"DA={tm.get('directional_accuracy')}"
                    )

                elif evt == "TRAINING_FAILED":
                    print(f"\n  ✗ TRAINING_FAILED: {event.get('error')}")
                    return False

            assert len(epoch_metrics) == EPOCHS, (
                f"Expected {EPOCHS} EPOCH_METRIC events, got {len(epoch_metrics)}"
            )
            assert training_complete is not None

            # ------------------------------------------------------------------
            # Step 4 — INFER: warm up buffer then await INFER_RESULT
            # ------------------------------------------------------------------
            print(f"\n[4/5] INFER — warming up buffer ({SEQ_LEN} bars needed) …")
            infer_result: dict | None = None
            base_close = 450.0
            base_time  = datetime.now(timezone.utc)

            for i in range(SEQ_LEN + 10):
                bar = {
                    "open":      base_close + i * 0.10,
                    "high":      base_close + i * 0.10 + 0.50,
                    "low":       base_close + i * 0.10 - 0.30,
                    "close":     base_close + i * 0.10,
                    "volume":    1_000_000,
                    "timestamp": (base_time + timedelta(hours=i)).isoformat(),
                }
                await ws.send(json.dumps({
                    "action": "INFER",
                    "run_id": run_id,
                    "bar":    bar,
                }))

                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=INFER_TIMEOUT_S)
                    event = json.loads(raw)
                    if event.get("event") == "INFER_RESULT":
                        infer_result = event
                        pc = event.get("predicted_close")
                        ts = event.get("timestamp", "")
                        print(f"       INFER_RESULT  predicted_close={pc}  timestamp={ts[:19]}")
                        break
                except asyncio.TimeoutError:
                    pass  # buffer not yet full — continue feeding bars

            # ------------------------------------------------------------------
            # Step 5 — Verify
            # ------------------------------------------------------------------
            print(f"\n[5/5] Verifying INFER_RESULT …")
            assert infer_result is not None, (
                f"Never received INFER_RESULT after {SEQ_LEN + 10} bars. "
                "Buffer did not fill — check InferenceEngine.seed_buffer() path."
            )
            assert "predicted_close" in infer_result,       "Missing predicted_close"
            assert isinstance(infer_result["predicted_close"], (int, float)), \
                "predicted_close is not numeric"
            assert infer_result.get("run_id") == run_id,    "run_id mismatch in INFER_RESULT"

            # ------------------------------------------------------------------
            # Summary
            # ------------------------------------------------------------------
            elapsed = time.time() - wall_start
            tm = training_complete.get("metrics", {})
            pc = infer_result["predicted_close"]

            print(f"\n{'='*60}")
            print(f"  SMOKE TEST PASSED  ({elapsed:.1f}s total)")
            print(f"{'='*60}")
            print(f"  PING → READY              ✓")
            print(f"  START_TRAINING dispatched ✓")
            print(f"  EPOCH_METRIC × {len(epoch_metrics):<3}          ✓")
            print(f"  TRAINING_COMPLETE         ✓  RMSE={tm.get('rmse')}  DA={tm.get('directional_accuracy')}")
            print(f"  INFER → INFER_RESULT      ✓  predicted_close={pc}")
            print()
            return True

    except ConnectionRefusedError:
        print(f"\n  ✗ Could not connect to daemon at {DAEMON_URL}")
        print("    Start the daemon first:  cd daemon && python daemon.py\n")
        return False

    except asyncio.TimeoutError:
        print("\n  ✗ Timed out waiting for daemon response.\n")
        return False

    except AssertionError as exc:
        print(f"\n  ✗ Assertion failed: {exc}\n")
        return False


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    success = asyncio.run(_run_smoke())
    sys.exit(0 if success else 1)
