"""Sliding window tensor construction respecting continuity flags."""

import numpy as np
import torch
from torch.utils.data import TensorDataset

CLOSE_IDX = 3  # index in OHLCV array


def build_windows(
    scaled_array: np.ndarray,
    sequence_length: int,
    continuity_flags: list[bool],
) -> tuple[np.ndarray, np.ndarray]:
    """
    Build (X, Y) windows from scaled_array (N, 5).

    A window [i : i+L] is valid only if continuity_flags[i+1 .. i+L] are all True
    (no dropped partial sessions or unfilled gaps within the window).
    Normal overnight/weekend gaps do NOT produce False flags, so windows freely
    span day boundaries.

    Returns:
        X: (M, L, 5) float32
        Y: (M, 1) float32  — close at t+L
    """
    N = len(scaled_array)
    L = sequence_length
    flags = continuity_flags

    X_list, Y_list = [], []
    for i in range(N - L):
        # Window covers rows [i .. i+L-1]; target is row i+L
        # Check continuity for rows i+1 through i+L (i.e., the transitions)
        if not all(flags[i + 1 : i + L + 1]):
            continue
        X_list.append(scaled_array[i : i + L])
        Y_list.append([scaled_array[i + L, CLOSE_IDX]])

    if not X_list:
        raise ValueError(f"No valid windows found for sequence_length={L}")

    X = np.array(X_list, dtype=np.float32)
    Y = np.array(Y_list, dtype=np.float32)
    return X, Y


def to_tensor_dataset(X: np.ndarray, Y: np.ndarray) -> TensorDataset:
    return TensorDataset(torch.from_numpy(X), torch.from_numpy(Y))
