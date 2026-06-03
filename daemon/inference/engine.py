"""
Live inference engine with per-run_id rolling buffers.
Handles None/Kalman/DWT denoising for single bars.
"""

import json
import os
from collections import deque

import joblib
import numpy as np
import torch

from data.scaling import scale_row, inverse_transform_close, FEATURE_COLS
from data.denoising import apply_kalman_step, apply_dwt_buffer


class InferenceEngine:
    def __init__(self, models_dir: str):
        self.models_dir = models_dir
        self._state: dict[str, dict] = {}

    def load_run(self, run_id: str) -> None:
        """Load model, scalers, denoiser params for a run_id."""
        base = os.path.join(self.models_dir, run_id)
        weights_path = base + ".pt"
        scaler_path = base + "_scaler.joblib"
        config_path = base + "_config.json"
        denoiser_path = base + "_denoiser.json"

        if not os.path.exists(weights_path):
            raise FileNotFoundError(f"Weights not found: {weights_path}")

        with open(config_path) as f:
            config = json.load(f)

        with open(denoiser_path) as f:
            denoiser_params = json.load(f)

        scalers = joblib.load(scaler_path)

        from training.architectures import build_model
        model = build_model(config)
        model.load_state_dict(torch.load(weights_path, map_location="cpu"))
        model.eval()

        seq_len = int(
            config.get("hyperparameters", {}).get(
                "sequenceLength",
                config.get("hyperparameters", {}).get("sequence_length", 48)
            )
        )
        denoiser = config.get("denoiser", "None")

        # Determine initial Kalman state
        kalman_state = None
        if denoiser == "Kalman" and denoiser_params:
            kalman_state = (
                denoiser_params.get("final_state_mean", [denoiser_params.get("initial_state_mean", 0.0)]),
                denoiser_params.get("final_state_cov", [[1.0]]),
            )

        self._state[run_id] = {
            "model": model,
            "scalers": scalers,
            "config": config,
            "denoiser": denoiser,
            "denoiser_params": denoiser_params,
            "seq_len": seq_len,
            "raw_close_buf": deque(maxlen=seq_len),
            "scaled_buf": deque(maxlen=seq_len),
            "kalman_state": kalman_state,
        }

    def seed_buffer(self, run_id: str, historical_close: list[float], historical_rows: list[dict]) -> None:
        """Pre-seed buffers with the last L bars of historical data."""
        if run_id not in self._state:
            return
        s = self._state[run_id]
        L = s["seq_len"]
        for row in historical_rows[-L:]:
            close_val = float(row.get("close", 0.0))
            s["raw_close_buf"].append(close_val)
            scaled = scale_row(row, s["scalers"])
            s["scaled_buf"].append(scaled)

    def infer(self, run_id: str, bar: dict) -> float | None:
        """
        Process one incoming bar and return predicted_close (USD) or None if buffer not full.
        """
        if run_id not in self._state:
            try:
                self.load_run(run_id)
            except FileNotFoundError:
                return None

        s = self._state[run_id]
        denoiser = s["denoiser"]
        params = s["denoiser_params"]
        scalers = s["scalers"]
        raw_close = float(bar.get("close", 0.0))

        # Step 1: Denoising
        if denoiser == "None":
            close_for_scaling = raw_close
        elif denoiser == "Kalman":
            if s["kalman_state"] is not None:
                filtered_close, new_mean, new_cov = apply_kalman_step(
                    raw_close, params, s["kalman_state"][0], s["kalman_state"][1]
                )
                s["kalman_state"] = (new_mean, new_cov)
                close_for_scaling = filtered_close
            else:
                close_for_scaling = raw_close
        elif denoiser == "DWT":
            s["raw_close_buf"].append(raw_close)
            if len(s["raw_close_buf"]) == s["seq_len"]:
                close_for_scaling = apply_dwt_buffer(list(s["raw_close_buf"]), params)
            else:
                close_for_scaling = raw_close
        else:
            close_for_scaling = raw_close

        # Step 2: Scale the full bar row using denoised close
        bar_for_scaling = dict(bar)
        bar_for_scaling["close"] = close_for_scaling
        scaled_row = scale_row(bar_for_scaling, scalers)

        # Step 3: Append to scaled buffer
        s["scaled_buf"].append(scaled_row)

        # Step 4: Inference only when buffer is full
        if len(s["scaled_buf"]) < s["seq_len"]:
            return None

        buf_array = np.array(list(s["scaled_buf"]), dtype=np.float32)  # (L, 5)
        tensor = torch.from_numpy(buf_array).unsqueeze(0)  # (1, L, 5)

        model = s["model"]
        with torch.no_grad():
            pred_scaled = model(tensor).numpy().flatten()[0]

        pred_usd = float(inverse_transform_close(np.array([pred_scaled]), scalers)[0])
        return round(pred_usd, 4)

    def unload_run(self, run_id: str) -> None:
        self._state.pop(run_id, None)
