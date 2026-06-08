"""
QuantiForge RunPod Serverless Worker
Mirrors the daemon training pipeline; runs inside a GPU container triggered via RunPod API.

Expected input (via RunPod job `input` field):
{
    "ticker": "NVDA",
    "backbone": "BiLSTM",
    "denoiser": "DWT",
    "sequence_length": 48,
    "hyperparameters": {
        "learning_rate": 0.001,
        "batch_size": 32,
        "epochs": 50,
        "dropout": 0.2,
        "optimizer": "AdamW"
    },
    "run_id": "<uuid>"
}

Output on success:
{
    "status": "COMPLETED",
    "weights_url":  "<signed S3 URL for .pt>",
    "scaler_url":   "<signed S3 URL for _scaler.joblib>",
    "config_url":   "<signed S3 URL for _config.json>",
    "metrics_url":  "<signed S3 URL for _metrics.json>",
    "denoiser_url": "<signed S3 URL for _denoiser.json>"
}

NOTE: This file is a safe stub. Full implementation requires:
  1. Real RunPod credentials and an endpoint deployment.
  2. An S3/MinIO bucket reachable from the container.
  3. boto3 or runpod SDK for signed URL generation.
To deploy: build the Docker image (see Dockerfile), push to a registry,
and configure the endpoint in the RunPod dashboard with this image.
"""

import os
import json
import sys

# Lazily import the daemon data/training pipeline — the worker shares the same code.
# On the container, /app/daemon is on PYTHONPATH.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "daemon"))

try:
    import runpod  # type: ignore  # only available inside the RunPod container
    RUNPOD_AVAILABLE = True
except ImportError:
    RUNPOD_AVAILABLE = False


def upload_artifact(local_path: str, key: str) -> str:
    """Upload a file to S3/MinIO and return a signed URL. Stub — implement with boto3."""
    # TODO: replace with real boto3 upload + presign
    # Example:
    #   s3 = boto3.client("s3")
    #   s3.upload_file(local_path, BUCKET, key)
    #   return s3.generate_presigned_url("get_object",
    #       Params={"Bucket": BUCKET, "Key": key}, ExpiresIn=3600)
    raise NotImplementedError("S3 upload not configured — set BUCKET and AWS credentials.")


def handler(event: dict) -> dict:
    """RunPod serverless entry point."""
    import asyncio
    import tempfile
    import torch

    job_input: dict = event.get("input", {})
    run_id: str = job_input.get("run_id", "runpod-run")

    models_dir = tempfile.mkdtemp(prefix="qf_models_")

    # Import daemon training pipeline
    from training.trainer import _run_generic_training  # type: ignore

    # Build a mock WebSocket that collects EPOCH_METRIC events as log lines
    # (RunPod does not stream back to the frontend in real-time)
    class _Sink:
        async def send_json(self, payload: dict) -> None:
            if payload.get("event") == "EPOCH_METRIC":
                ep = payload.get("current_epoch", 0)
                tot = payload.get("total_epochs", 0)
                tl = payload.get("metrics", {}).get("train_loss", 0)
                print(f"Epoch {ep}/{tot} | train_loss={tl:.5f}", flush=True)

    cancel = asyncio.Event()

    async def _run():
        await _run_generic_training(_Sink(), run_id, job_input, models_dir, cancel)

    asyncio.run(_run())

    # Upload artifacts
    artifact_suffixes = {
        "weights":  f"{run_id}.pt",
        "scaler":   f"{run_id}_scaler.joblib",
        "config":   f"{run_id}_config.json",
        "metrics":  f"{run_id}_metrics.json",
        "denoiser": f"{run_id}_denoiser.json",
    }

    output: dict = {}
    for key, filename in artifact_suffixes.items():
        local_path = os.path.join(models_dir, filename)
        if os.path.exists(local_path):
            try:
                url = upload_artifact(local_path, f"{run_id}/{filename}")
                output[f"{key}_url"] = url
            except NotImplementedError:
                # Stub mode: return local path so integration can be tested locally
                output[f"{key}_path"] = local_path

    return output


if RUNPOD_AVAILABLE:
    runpod.serverless.start({"handler": handler})
else:
    # Local smoke-test: python worker.py '{"input": {...}}'
    if len(sys.argv) > 1:
        event = json.loads(sys.argv[1])
        print(json.dumps(handler(event), indent=2))
    else:
        print("RunPod SDK not available. Pass event JSON as first argument to smoke-test locally.")
