"""Generic PyTorch training loop with WebSocket epoch streaming."""

import asyncio
import datetime
import json
import os
import time

import joblib
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from data.ingestion import fetch_ohlcv, chronological_split
from data.denoising import denoise
from data.scaling import fit_scalers, scale_df, inverse_transform_close
from data.windowing import build_windows, to_tensor_dataset
from training.architectures import build_model
from training.metrics import compute_metrics
from registry.db import upsert_run


def _get_optimizer(model: nn.Module, config: dict) -> torch.optim.Optimizer:
    hp = config.get("hyperparameters", {})
    lr = float(hp.get("learning_rate", hp.get("learningRate", 0.001)))
    opt_name = hp.get("optimizer", "AdamW")

    if opt_name == "AdamW":
        return torch.optim.AdamW(model.parameters(), lr=lr)
    if opt_name == "SGD":
        return torch.optim.SGD(model.parameters(), lr=lr, momentum=0.9)
    if opt_name == "Ranger":
        try:
            from torch_optimizer import Ranger
            return Ranger(model.parameters(), lr=lr)
        except ImportError:
            return torch.optim.AdamW(model.parameters(), lr=lr)
    return torch.optim.AdamW(model.parameters(), lr=lr)


async def run_training(
    ws,
    run_id: str,
    config: dict,
    models_dir: str,
    cancel_event: asyncio.Event,
) -> None:
    """Full training pipeline. Sends EPOCH_METRIC, TRAINING_COMPLETE, or TRAINING_FAILED."""
    try:
        if config.get("backbone") == "TFT":
            from training.tft_path import run_tft_training
            await run_tft_training(ws, run_id, config, models_dir, cancel_event)
            return

        await _run_generic_training(ws, run_id, config, models_dir, cancel_event)

    except asyncio.CancelledError:
        await ws.send_json({
            "event": "TRAINING_FAILED",
            "run_id": run_id,
            "error": "Cancelled by user",
        })
    except torch.cuda.OutOfMemoryError:
        await ws.send_json({
            "event": "TRAINING_FAILED",
            "run_id": run_id,
            "error": "GPU out of memory. Try reducing Batch Size or Sequence Length.",
        })
    except Exception as e:
        await ws.send_json({
            "event": "TRAINING_FAILED",
            "run_id": run_id,
            "error": str(e),
        })


async def _run_generic_training(ws, run_id, config, models_dir, cancel_event):
    hp = config.get("hyperparameters", {})
    ticker = config["ticker"]
    denoiser = config.get("denoiser", "None")
    backbone = config["backbone"]
    seq_len = int(hp.get("sequenceLength", hp.get("sequence_length", 48)))
    batch_size = int(hp.get("batchSize", hp.get("batch_size", 32)))
    epochs = int(hp.get("epochs", 20))

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    # 1. Data pipeline
    df = fetch_ohlcv(ticker)
    train_df, val_df, test_df = chronological_split(df)
    train_df, val_df, test_df, denoiser_params = denoise(train_df, val_df, test_df, denoiser)
    scalers = fit_scalers(train_df)

    train_arr = scale_df(train_df, scalers)
    val_arr = scale_df(val_df, scalers)
    test_arr = scale_df(test_df, scalers)

    cont = df["continuous"].tolist()
    n_train = len(train_df)
    n_val = len(val_df)
    train_cont = cont[:n_train]
    val_cont = cont[n_train : n_train + n_val]
    test_cont = cont[n_train + n_val :]

    X_train, Y_train = build_windows(train_arr, seq_len, train_cont)
    X_val, Y_val = build_windows(val_arr, seq_len, val_cont)
    X_test, Y_test = build_windows(test_arr, seq_len, test_cont)

    train_loader = DataLoader(to_tensor_dataset(X_train, Y_train), batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(to_tensor_dataset(X_val, Y_val), batch_size=batch_size)

    # 2. Model
    model = build_model(config).to(device)
    optimizer = _get_optimizer(model, config)
    criterion = nn.MSELoss()

    # 3. Training loop
    for epoch in range(1, epochs + 1):
        if cancel_event.is_set():
            raise asyncio.CancelledError

        t0 = time.time()
        model.train()
        total_loss = 0.0
        for xb, yb in train_loader:
            xb, yb = xb.to(device), yb.to(device)
            optimizer.zero_grad()
            pred = model(xb)
            loss = criterion(pred, yb)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
        train_loss = total_loss / len(train_loader)

        model.eval()
        val_loss_total = 0.0
        with torch.no_grad():
            for xb, yb in val_loader:
                xb, yb = xb.to(device), yb.to(device)
                val_loss_total += criterion(model(xb), yb).item()
        val_loss = val_loss_total / len(val_loader)
        elapsed = time.time() - t0

        await ws.send_json({
            "event": "EPOCH_METRIC",
            "run_id": run_id,
            "current_epoch": epoch,
            "total_epochs": epochs,
            "metrics": {
                "train_loss": round(train_loss, 6),
                "val_loss": round(val_loss, 6),
                "elapsed_seconds": round(elapsed, 2),
            },
        })

    # 4. Test metrics
    model.eval()
    preds = []
    with torch.no_grad():
        test_loader = DataLoader(to_tensor_dataset(X_test, Y_test), batch_size=batch_size)
        for xb, _ in test_loader:
            preds.append(model(xb.to(device)).cpu().numpy())
    y_pred_scaled = np.concatenate(preds).flatten()
    y_true_scaled = Y_test.flatten()

    y_pred_usd = inverse_transform_close(y_pred_scaled, scalers)
    y_true_usd = inverse_transform_close(y_true_scaled, scalers)
    metrics = compute_metrics(y_true_usd, y_pred_usd)

    # 5. Save artifacts
    weights_path = os.path.join(models_dir, f"{run_id}.pt")
    torch.save(model.state_dict(), weights_path)
    joblib.dump(scalers, os.path.join(models_dir, f"{run_id}_scaler.joblib"))
    with open(os.path.join(models_dir, f"{run_id}_config.json"), "w") as f:
        json.dump(config, f)
    # Include predictions so the Evaluation Deck can backfill the chart line
    metrics_to_save = dict(metrics)
    metrics_to_save["predictions"] = y_pred_usd.round(4).tolist()
    with open(os.path.join(models_dir, f"{run_id}_metrics.json"), "w") as f:
        json.dump(metrics_to_save, f)
    with open(os.path.join(models_dir, f"{run_id}_denoiser.json"), "w") as f:
        json.dump(denoiser_params, f)

    # 6. Registry
    upsert_run(models_dir, {
        "run_id": run_id,
        "ticker": ticker,
        "backbone": backbone,
        "denoiser": denoiser,
        "hyperparams": hp,
        "metrics": metrics,
        "weights_path": weights_path,
        "created_at": datetime.datetime.utcnow().isoformat() + "Z",
        "status": "completed",
    })

    await ws.send_json({
        "event": "TRAINING_COMPLETE",
        "run_id": run_id,
        "metrics": metrics,
        "artifacts": {
            "weights_path": weights_path,
            "scaler_path": os.path.join(models_dir, f"{run_id}_scaler.joblib"),
            "config_path": os.path.join(models_dir, f"{run_id}_config.json"),
            "metrics_path": os.path.join(models_dir, f"{run_id}_metrics.json"),
        },
    })
