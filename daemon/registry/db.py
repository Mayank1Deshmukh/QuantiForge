"""SQLite registry — source of truth for all model runs."""

import json
import os
import sqlite3
from typing import Any


def _db_path(models_dir: str) -> str:
    return os.path.join(models_dir, "registry.db")


def init_db(models_dir: str) -> None:
    conn = sqlite3.connect(_db_path(models_dir))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS runs (
            run_id          TEXT PRIMARY KEY,
            ticker          TEXT NOT NULL,
            backbone        TEXT NOT NULL,
            denoiser        TEXT NOT NULL,
            hyperparams_json TEXT NOT NULL,
            metrics_json    TEXT,
            weights_path    TEXT,
            created_at      TEXT NOT NULL,
            status          TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()


def _row_to_dict(row: tuple) -> dict:
    keys = ["run_id", "ticker", "backbone", "denoiser",
            "hyperparams_json", "metrics_json", "weights_path",
            "created_at", "status"]
    d = dict(zip(keys, row))
    d["hyperparams"] = json.loads(d.pop("hyperparams_json") or "{}")
    d["metrics"] = json.loads(d.pop("metrics_json") or "null")
    return d


def get_all_runs(models_dir: str) -> list[dict]:
    conn = sqlite3.connect(_db_path(models_dir))
    rows = conn.execute("SELECT * FROM runs ORDER BY created_at DESC").fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def get_run(models_dir: str, run_id: str) -> dict | None:
    conn = sqlite3.connect(_db_path(models_dir))
    row = conn.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone()
    conn.close()
    return _row_to_dict(row) if row else None


def upsert_run(models_dir: str, payload: dict) -> None:
    conn = sqlite3.connect(_db_path(models_dir))
    conn.execute("""
        INSERT INTO runs
            (run_id, ticker, backbone, denoiser, hyperparams_json,
             metrics_json, weights_path, created_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET
            metrics_json = excluded.metrics_json,
            weights_path = excluded.weights_path,
            status = excluded.status
    """, (
        payload["run_id"],
        payload.get("ticker", ""),
        payload.get("backbone", ""),
        payload.get("denoiser", "None"),
        json.dumps(payload.get("hyperparams", payload.get("hyperparameters", {}))),
        json.dumps(payload.get("metrics")) if payload.get("metrics") else None,
        payload.get("weights_path", ""),
        payload.get("created_at", ""),
        payload.get("status", "training"),
    ))
    conn.commit()
    conn.close()


def delete_run(models_dir: str, run_id: str) -> None:
    # Remove artifact files
    for suffix in [".pt", "_scaler.joblib", "_config.json", "_metrics.json", "_denoiser.json"]:
        path = os.path.join(models_dir, f"{run_id}{suffix}")
        if os.path.exists(path):
            os.remove(path)
    conn = sqlite3.connect(_db_path(models_dir))
    conn.execute("DELETE FROM runs WHERE run_id = ?", (run_id,))
    conn.commit()
    conn.close()
