/**
 * Tests for useTrainingStore.
 *
 * Critical invariant: handleEpochMetric() correctly truncates the logLines
 * array to a maximum of 200 entries, dropping from the front (oldest first).
 */

import { describe, it, expect, beforeEach } from "vitest"
import { useTrainingStore } from "../stores/useTrainingStore"
import type { EpochMetricEvent } from "../stores/useTrainingStore"

const MAX_LOG_LINES = 200

function makeEpochEvent(epoch: number, total: number = 10): EpochMetricEvent {
  return {
    event:         "EPOCH_METRIC",
    run_id:        "test-run-id",
    current_epoch: epoch,
    total_epochs:  total,
    metrics: {
      train_loss:      0.1 + epoch * 0.01,
      val_loss:        0.2 + epoch * 0.01,
      elapsed_seconds: epoch * 2.5,
    },
  }
}

beforeEach(() => {
  useTrainingStore.getState().resetTraining()
})

// ---------------------------------------------------------------------------
// handleEpochMetric — log line appended
// ---------------------------------------------------------------------------

describe("handleEpochMetric — log appended", () => {
  it("appends one log line per epoch event", () => {
    useTrainingStore.getState().handleEpochMetric(makeEpochEvent(1))
    expect(useTrainingStore.getState().logLines).toHaveLength(1)
  })

  it("log line contains epoch number and losses", () => {
    useTrainingStore.getState().handleEpochMetric(makeEpochEvent(3, 10))
    const line = useTrainingStore.getState().logLines[0]
    expect(line).toContain("3/10")
    expect(line).toContain("train")
    expect(line).toContain("val")
  })

  it("updates currentEpoch and totalEpochs", () => {
    useTrainingStore.getState().handleEpochMetric(makeEpochEvent(5, 20))
    const s = useTrainingStore.getState()
    expect(s.currentEpoch).toBe(5)
    expect(s.totalEpochs).toBe(20)
  })

  it("appends to epochMetrics array", () => {
    useTrainingStore.getState().handleEpochMetric(makeEpochEvent(1))
    useTrainingStore.getState().handleEpochMetric(makeEpochEvent(2))
    expect(useTrainingStore.getState().epochMetrics).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// handleEpochMetric — 200-line cap
// ---------------------------------------------------------------------------

describe("handleEpochMetric — 200-line cap", () => {
  it("does not exceed 200 log lines", () => {
    const initLines = Array.from({ length: MAX_LOG_LINES }, (_, i) => `pre-line-${i}`)
    useTrainingStore.setState({ ...useTrainingStore.getState(), logLines: initLines })

    useTrainingStore.getState().handleEpochMetric(makeEpochEvent(1))

    expect(useTrainingStore.getState().logLines).toHaveLength(MAX_LOG_LINES)
  })

  it("drops the oldest line (index 0) when cap is exceeded", () => {
    const initLines = Array.from({ length: MAX_LOG_LINES }, (_, i) => `pre-line-${i}`)
    useTrainingStore.setState({ ...useTrainingStore.getState(), logLines: initLines })

    useTrainingStore.getState().handleEpochMetric(makeEpochEvent(1))

    // The original first line ("pre-line-0") should be gone
    expect(useTrainingStore.getState().logLines[0]).toBe("pre-line-1")
  })

  it("places the new epoch line at the end after cap truncation", () => {
    const initLines = Array.from({ length: MAX_LOG_LINES }, (_, i) => `pre-line-${i}`)
    useTrainingStore.setState({ ...useTrainingStore.getState(), logLines: initLines })

    useTrainingStore.getState().handleEpochMetric(makeEpochEvent(7, 10))

    const last = useTrainingStore.getState().logLines[MAX_LOG_LINES - 1]
    expect(last).toContain("7/10")
  })

  it("stays exactly at cap after many epochs", () => {
    for (let i = 0; i < MAX_LOG_LINES + 50; i++) {
      useTrainingStore.getState().handleEpochMetric(makeEpochEvent(i + 1, MAX_LOG_LINES + 50))
    }
    expect(useTrainingStore.getState().logLines).toHaveLength(MAX_LOG_LINES)
  })

  it("does not truncate when lines are below the cap", () => {
    useTrainingStore.setState({
      ...useTrainingStore.getState(),
      logLines: ["existing-line-A", "existing-line-B"],
    })
    useTrainingStore.getState().handleEpochMetric(makeEpochEvent(1))

    const lines = useTrainingStore.getState().logLines
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe("existing-line-A")
    expect(lines[1]).toBe("existing-line-B")
  })
})

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

describe("status transitions", () => {
  it("handleEpochMetric sets status to training", () => {
    useTrainingStore.getState().handleEpochMetric(makeEpochEvent(1))
    expect(useTrainingStore.getState().status).toBe("training")
  })

  it("handleTrainingComplete sets status to completed", () => {
    useTrainingStore.getState().handleTrainingComplete({
      event:   "TRAINING_COMPLETE",
      run_id:  "test-run",
      metrics: { rmse: 1.23, mae: 0.9, mape: 5.1, directional_accuracy: 0.62 },
      artifacts: {
        weights_path: "/models/test.pt",
        scaler_path:  "/models/test_scaler.joblib",
        config_path:  "/models/test_config.json",
        metrics_path: "/models/test_metrics.json",
      },
    })
    expect(useTrainingStore.getState().status).toBe("completed")
  })

  it("handleTrainingFailed sets status to failed and records error", () => {
    useTrainingStore.getState().handleTrainingFailed({
      event:  "TRAINING_FAILED",
      run_id: "test-run",
      error:  "GPU out of memory",
    })
    const s = useTrainingStore.getState()
    expect(s.status).toBe("failed")
    expect(s.errorMessage).toBe("GPU out of memory")
  })
})

// ---------------------------------------------------------------------------
// resetTraining
// ---------------------------------------------------------------------------

describe("resetTraining", () => {
  it("returns store to initial idle state", () => {
    useTrainingStore.getState().handleEpochMetric(makeEpochEvent(1))
    useTrainingStore.getState().resetTraining()

    const s = useTrainingStore.getState()
    expect(s.status).toBe("idle")
    expect(s.logLines).toHaveLength(0)
    expect(s.epochMetrics).toHaveLength(0)
    expect(s.currentEpoch).toBe(0)
    expect(s.isDrawerOpen).toBe(false)
  })
})
