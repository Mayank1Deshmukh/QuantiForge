"""
Unit tests for data/windowing.py.
Verifies build_windows output shapes and continuity-flag behaviour.

Key rules from the spec:
- Normal overnight/weekend gaps produce NO False flags and must NOT break windows.
- Only dropped partial sessions or unfilled multi-bar provider gaps produce False flags.
- A window starting at i is valid only if flags[i+1 .. i+L] are ALL True.
- flags[0] is always False per spec but is never checked by any window, so it
  has zero effect on the window count.

Run from daemon/ with: pytest tests/test_windowing.py -v
"""

import numpy as np
import pytest
from data.windowing import build_windows


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _arr(n: int = 20, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return rng.random((n, 5)).astype(np.float32)


# ---------------------------------------------------------------------------
# Basic shape
# ---------------------------------------------------------------------------

def test_basic_shape_all_true():
    N, L = 20, 5
    arr = _arr(N)
    flags = [True] * N
    X, Y = build_windows(arr, L, flags)
    assert X.shape == (N - L, L, 5)
    assert Y.shape == (N - L, 1)


def test_dtype_float32():
    arr = _arr(20)
    flags = [True] * 20
    X, Y = build_windows(arr, 5, flags)
    assert X.dtype == np.float32
    assert Y.dtype == np.float32


def test_target_is_close_at_t_plus_L():
    N, L = 10, 3
    arr = _arr(N)
    flags = [True] * N
    X, Y = build_windows(arr, L, flags)
    CLOSE_IDX = 3
    for i in range(N - L):
        assert Y[i, 0] == arr[i + L, CLOSE_IDX]


# ---------------------------------------------------------------------------
# Overnight gaps: windows must span freely (no False flags produced)
# ---------------------------------------------------------------------------

def test_overnight_gaps_do_not_break_windows():
    """Normal overnight gaps → all flags True → count == N - L."""
    N, L = 30, 5
    arr = _arr(N)
    # All True simulates clean consecutive trading days with overnight gaps
    # that have already been removed by the market-hours filter
    flags = [True] * N
    X, Y = build_windows(arr, L, flags)
    assert len(X) == N - L, (
        "Overnight gaps should NOT reduce window count; "
        "they are eliminated by the market-hours filter before windowing."
    )


def test_weekend_gap_spanning_window():
    """A window that spans a Friday-close to Monday-open boundary is valid."""
    # Simulate 5 bars: Mon-Fri day 1, then Mon-Fri day 2 (all True)
    N, L = 15, 7
    arr = _arr(N)
    flags = [True] * N  # no bad gaps
    X, Y = build_windows(arr, L, flags)
    assert len(X) == N - L


# ---------------------------------------------------------------------------
# Explicit discontinuity drops windows
# ---------------------------------------------------------------------------

def test_single_false_drops_L_windows():
    """
    flags[k] = False drops every window whose span [i+1 .. i+L] includes k.
    That is windows where i+1 <= k <= i+L  →  k-L <= i <= k-1 (L windows).
    """
    N, L = 20, 5
    arr = _arr(N)
    flags = [True] * N
    k = 10  # inject one bad gap at row 10
    flags[k] = False

    X_clean, _ = build_windows(arr, L, [True] * N)
    X_bad, _ = build_windows(arr, L, flags)

    # Exactly L windows are affected (those where i = k-L .. k-1)
    assert len(X_clean) - len(X_bad) == L


def test_false_at_index_5_L3_N10():
    """Explicit count for flags[5]=False, L=3, N=10."""
    N, L = 10, 3
    arr = _arr(N)
    flags = [True] * N
    flags[5] = False
    # windows: i=0..6 (7 total without gaps)
    # affected: i=2 (checks [3,4,5]), i=3 (checks [4,5,6]), i=4 (checks [5,6,7]) → 3 dropped
    X, Y = build_windows(arr, L, flags)
    assert len(X) == 4


def test_flags_index_0_false_has_no_effect():
    """flags[0] is never checked by any window (first checked index is 1)."""
    N, L = 10, 3
    arr = _arr(N)
    flags_all_true = [True] * N
    flags_first_false = [True] * N
    flags_first_false[0] = False

    X_all, _ = build_windows(arr, L, flags_all_true)
    X_first, _ = build_windows(arr, L, flags_first_false)
    assert len(X_first) == len(X_all)


def test_multiple_false_flags():
    N, L = 20, 3
    arr = _arr(N)
    flags = [True] * N
    # Two bad gaps that don't overlap in their affected window sets
    flags[5] = False   # affects windows i=3,4,5 (L=3 windows)
    flags[15] = False  # affects windows i=13,14,15 (L=3 windows)

    X_clean, _ = build_windows(arr, L, [True] * N)
    X_bad, _ = build_windows(arr, L, flags)
    assert len(X_clean) - len(X_bad) == 2 * L


def test_consecutive_false_flags():
    N, L = 20, 3
    arr = _arr(N)
    flags = [True] * N
    # Consecutive False at 8 and 9 — overlapping affected windows
    flags[8] = False
    flags[9] = False
    # flags[8]=False: affects i=6,7,8
    # flags[9]=False: affects i=7,8,9
    # Union: i=6,7,8,9 → 4 windows dropped (N-L = 17 clean → 13 remaining)
    X_clean, _ = build_windows(arr, L, [True] * N)
    X_bad, _ = build_windows(arr, L, flags)
    assert len(X_bad) == len(X_clean) - 4


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

def test_no_valid_windows_raises():
    N, L = 10, 9
    arr = _arr(N)
    # All False → no window can be valid (N - L = 1 window, but its inner flags are all False)
    flags = [False] * N
    with pytest.raises(ValueError):
        build_windows(arr, L, flags)


def test_minimum_valid_window():
    # N=L+1 → exactly 1 window possible
    L = 5
    N = L + 1
    arr = _arr(N)
    flags = [True] * N
    X, Y = build_windows(arr, L, flags)
    assert X.shape == (1, L, 5)
    assert Y.shape == (1, 1)


def test_large_sequence_length():
    N, L = 100, 72
    arr = _arr(N)
    flags = [True] * N
    X, Y = build_windows(arr, L, flags)
    assert X.shape == (N - L, L, 5)
