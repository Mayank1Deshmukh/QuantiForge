"""
QuantiForge Local Python Daemon
Binds to 127.0.0.1:8765.
Run: python daemon.py
"""

import asyncio
import json
import os
import sys

import torch
import uvicorn
import yaml
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from registry.db import init_db, get_all_runs, get_run, upsert_run, delete_run
from training.trainer import run_training
from inference.engine import InferenceEngine
from arima.baseline import run_arima

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

with open(os.path.join(os.path.dirname(__file__), "config.yaml")) as f:
    _cfg = yaml.safe_load(f)

HOST: str = _cfg.get("host", "127.0.0.1")
PORT: int = _cfg.get("port", 8765)
CORS_ORIGINS: list[str] = _cfg.get("cors_origins", ["http://localhost:3000"])
MODELS_DIR: str = _cfg.get("models_dir", "./models")
DAEMON_VERSION: str = _cfg.get("daemon_version", "1.0.0")

os.makedirs(MODELS_DIR, exist_ok=True)
init_db(MODELS_DIR)

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="QuantiForge Daemon", version=DAEMON_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

inference_engine = InferenceEngine(MODELS_DIR)
active_training_cancel: dict[str, asyncio.Event] = {}

# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "version": DAEMON_VERSION}

# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            action = msg.get("action")

            if action == "PING":
                cuda_available = torch.cuda.is_available()
                device_name = torch.cuda.get_device_name(0) if cuda_available else "CPU"
                await ws.send_json({
                    "status": "READY",
                    "cuda_available": cuda_available,
                    "device_name": device_name,
                    "daemon_version": DAEMON_VERSION,
                })

            elif action == "START_TRAINING":
                run_id = msg["run_id"]
                config = msg["configuration"]
                cancel_event = asyncio.Event()
                active_training_cancel[run_id] = cancel_event
                # Run training in background task so WS remains responsive
                asyncio.create_task(
                    run_training(ws, run_id, config, MODELS_DIR, cancel_event)
                )

            elif action == "STOP_TRAINING":
                run_id = msg.get("run_id", "")
                if run_id in active_training_cancel:
                    active_training_cancel[run_id].set()

            elif action == "INFER":
                run_id = msg["run_id"]
                bar = msg["bar"]
                result = inference_engine.infer(run_id, bar)
                if result is not None:
                    import datetime
                    bar_ts = bar.get("timestamp", "")
                    try:
                        dt = datetime.datetime.fromisoformat(bar_ts.replace("Z", "+00:00"))
                        next_ts = (dt + datetime.timedelta(hours=1)).isoformat()
                    except Exception:
                        next_ts = bar_ts
                    await ws.send_json({
                        "event": "INFER_RESULT",
                        "run_id": run_id,
                        "timestamp": next_ts,
                        "predicted_close": result,
                    })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error: {e}", file=sys.stderr)

# ---------------------------------------------------------------------------
# Registry REST
# ---------------------------------------------------------------------------

@app.get("/api/registry")
async def registry_list():
    return get_all_runs(MODELS_DIR)

@app.post("/api/registry", status_code=201)
async def registry_register(payload: dict):
    upsert_run(MODELS_DIR, payload)
    return {"status": "registered"}

@app.get("/api/registry/{run_id}")
async def registry_get(run_id: str):
    from fastapi import HTTPException
    row = get_run(MODELS_DIR, run_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return row

@app.delete("/api/registry/{run_id}", status_code=204)
async def registry_delete(run_id: str):
    delete_run(MODELS_DIR, run_id)

# ---------------------------------------------------------------------------
# ARIMA
# ---------------------------------------------------------------------------

@app.post("/api/arima")
async def arima_endpoint(payload: dict):
    ticker = payload.get("ticker", "SPY")
    result = await asyncio.to_thread(run_arima, ticker)
    return result

# ---------------------------------------------------------------------------
# Data preview
# ---------------------------------------------------------------------------

@app.get("/api/data-preview")
async def data_preview(ticker: str = "SPY"):
    from data.ingestion import fetch_ohlcv
    df = await asyncio.to_thread(fetch_ohlcv, ticker)
    # Return last 30 trading days of close prices
    close = df["close"].tail(30 * 7).tolist()  # rough upper bound; actual filter below
    # Filter to roughly 30 trading days (210 bars max)
    close = df["close"].tail(210).tolist()
    return {"ticker": ticker, "preview_close": close}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
