"""TFT training path using pytorch_forecasting + pytorch_lightning."""

import asyncio
import datetime
import json
import os

import joblib
import numpy as np
import pandas as pd
import torch

from data.ingestion import fetch_ohlcv, chronological_split
from data.denoising import denoise
from data.scaling import fit_scalers, scale_df, inverse_transform_close, FEATURE_COLS
from training.metrics import compute_metrics
from registry.db import upsert_run


async def run_tft_training(ws, run_id, config, models_dir, cancel_event):
    """TFT-specific training path using TimeSeriesDataSet + Lightning."""
    try:
        from pytorch_forecasting import TimeSeriesDataSet, TemporalFusionTransformer
        from pytorch_lightning import Trainer
        from pytorch_lightning.callbacks import Callback

        hp = config.get("hyperparameters", {})
        ticker = config["ticker"]
        denoiser = config.get("denoiser", "None")
        seq_len = int(hp.get("sequenceLength", hp.get("sequence_length", 48)))
        epochs = int(hp.get("epochs", 20))
        lr = float(hp.get("learning_rate", hp.get("learningRate", 0.001)))
        batch_size = int(hp.get("batchSize", hp.get("batch_size", 32)))

        # Data pipeline
        df = fetch_ohlcv(ticker)
        train_df, val_df, test_df = chronological_split(df)
        train_df, val_df, test_df, denoiser_params = denoise(train_df, val_df, test_df, denoiser)
        scalers = fit_scalers(train_df)

        train_arr = scale_df(train_df, scalers)
        val_arr = scale_df(val_df, scalers)
        test_arr = scale_df(test_df, scalers)

        # Build combined DataFrame for TFT
        def _make_df(arr, offset):
            d = pd.DataFrame(arr, columns=FEATURE_COLS)
            d["time_idx"] = np.arange(offset, offset + len(d))
            d["ticker_id"] = "0"
            return d

        n_train = len(train_df)
        n_val = len(val_df)
        all_arr = np.concatenate([train_arr, val_arr], axis=0)
        combined = _make_df(all_arr, 0)
        training_cutoff = n_train - 1

        training_ds = TimeSeriesDataSet(
            combined[combined.time_idx <= training_cutoff],
            time_idx="time_idx",
            target="close",
            group_ids=["ticker_id"],
            max_encoder_length=seq_len,
            max_prediction_length=1,
            time_varying_unknown_reals=FEATURE_COLS,
            target_normalizer=None,
        )
        val_ds = TimeSeriesDataSet.from_dataset(
            training_ds,
            combined,
            predict=True,
            stop_randomization=True,
        )

        train_loader = training_ds.to_dataloader(train=True, batch_size=batch_size)
        val_loader = val_ds.to_dataloader(train=False, batch_size=batch_size)

        # Epoch callback to emit EPOCH_METRIC back over the WebSocket
        loop = asyncio.get_event_loop()

        class EpochCallback(Callback):
            def on_train_epoch_end(self, trainer, pl_module):
                epoch = trainer.current_epoch + 1
                logs = trainer.callback_metrics
                train_loss = float(logs.get("train_loss_epoch", logs.get("train_loss", 0)))
                val_loss = float(logs.get("val_loss", 0))
                asyncio.run_coroutine_threadsafe(
                    ws.send_json({
                        "event": "EPOCH_METRIC",
                        "run_id": run_id,
                        "current_epoch": epoch,
                        "total_epochs": epochs,
                        "metrics": {
                            "train_loss": round(train_loss, 6),
                            "val_loss": round(val_loss, 6),
                            "elapsed_seconds": 0.0,
                        },
                    }),
                    loop,
                )

        model = TemporalFusionTransformer.from_dataset(
            training_ds,
            learning_rate=lr,
            hidden_size=64,
            attention_head_size=4,
            dropout=float(hp.get("dropout", hp.get("dropoutRate", 0.2))),
            log_interval=1,
        )

        trainer = Trainer(
            max_epochs=epochs,
            enable_progress_bar=False,
            callbacks=[EpochCallback()],
            enable_checkpointing=False,
            logger=False,
        )
        trainer.fit(model, train_loader, val_loader)

        # Test metrics via manual forward pass
        test_tdf = _make_df(test_arr, n_train + n_val)
        test_ds = TimeSeriesDataSet.from_dataset(training_ds, pd.concat([combined, test_tdf]), predict=True)
        predictions = trainer.predict(model, test_ds.to_dataloader(train=False, batch_size=batch_size))
        y_pred_scaled = np.concatenate([p.numpy() for p in predictions]).flatten()
        y_true_scaled = test_arr[:len(y_pred_scaled), FEATURE_COLS.index("close")]

        y_pred_usd = inverse_transform_close(y_pred_scaled, scalers)
        y_true_usd = inverse_transform_close(y_true_scaled, scalers)
        metrics = compute_metrics(y_true_usd, y_pred_usd)

        # Save artifacts
        weights_path = os.path.join(models_dir, f"{run_id}.pt")
        torch.save(model.state_dict(), weights_path)
        joblib.dump(scalers, os.path.join(models_dir, f"{run_id}_scaler.joblib"))
        with open(os.path.join(models_dir, f"{run_id}_config.json"), "w") as f:
            json.dump(config, f)
        with open(os.path.join(models_dir, f"{run_id}_metrics.json"), "w") as f:
            json.dump(metrics, f)
        with open(os.path.join(models_dir, f"{run_id}_denoiser.json"), "w") as f:
            json.dump(denoiser_params, f)

        upsert_run(models_dir, {
            "run_id": run_id, "ticker": ticker, "backbone": "TFT",
            "denoiser": denoiser, "hyperparams": hp, "metrics": metrics,
            "weights_path": weights_path,
            "created_at": datetime.datetime.utcnow().isoformat() + "Z",
            "status": "completed",
        })

        await ws.send_json({
            "event": "TRAINING_COMPLETE",
            "run_id": run_id,
            "metrics": metrics,
            "artifacts": {"weights_path": weights_path},
        })

    except Exception as e:
        await ws.send_json({
            "event": "TRAINING_FAILED",
            "run_id": run_id,
            "error": f"TFT training error: {e}",
        })
