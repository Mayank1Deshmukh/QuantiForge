"use client"

import { create } from "zustand"
import type { DraftConfig } from "./useBuilderStore"

export type TrainingStatus =
  | "idle"
  | "dispatched"
  | "training"
  | "completed"
  | "failed"

export interface EpochMetric {
  epoch: number
  trainLoss: number
  valLoss: number
  elapsedSeconds: number
}

export interface EpochMetricEvent {
  event: "EPOCH_METRIC"
  run_id: string
  current_epoch: number
  total_epochs: number
  metrics: {
    train_loss: number
    val_loss: number
    elapsed_seconds: number
  }
}

export interface TrainingCompleteEvent {
  event: "TRAINING_COMPLETE"
  run_id: string
  metrics: {
    rmse: number
    mae: number
    mape: number
    directional_accuracy: number
  }
  artifacts: {
    weights_path: string
    scaler_path: string
    config_path: string
    metrics_path: string
  }
}

export interface TrainingFailedEvent {
  event: "TRAINING_FAILED"
  run_id: string
  error: string
}

const MAX_LOG_LINES = 200

interface TrainingState {
  status: TrainingStatus
  activeRunId: string | null
  activeConfig: DraftConfig | null
  currentEpoch: number
  totalEpochs: number
  epochMetrics: EpochMetric[]
  logLines: string[]
  errorMessage: string | null
  completionMetrics: { rmse: number; mae: number; mape: number; directional_accuracy: number } | null
  isDrawerOpen: boolean
  isDrawerMinimized: boolean
  runpodJobId: string | null

  dispatchTraining: (runId: string, config: DraftConfig) => void
  setRunpodJobId: (jobId: string) => void
  appendRunpodStatusLine: (line: string) => void
  handleEpochMetric: (event: EpochMetricEvent) => void
  handleTrainingComplete: (event: TrainingCompleteEvent) => void
  handleTrainingFailed: (event: TrainingFailedEvent) => void
  cancelTraining: () => void
  setDrawerOpen: (open: boolean) => void
  setDrawerMinimized: (minimized: boolean) => void
  resetTraining: () => void
}

function appendLog(lines: string[], newLine: string): string[] {
  const updated = [...lines, newLine]
  return updated.length > MAX_LOG_LINES ? updated.slice(-MAX_LOG_LINES) : updated
}

export const useTrainingStore = create<TrainingState>()((set) => ({
  status: "idle",
  activeRunId: null,
  activeConfig: null,
  currentEpoch: 0,
  totalEpochs: 0,
  epochMetrics: [],
  logLines: [],
  errorMessage: null,
  completionMetrics: null,
  isDrawerOpen: false,
  isDrawerMinimized: false,
  runpodJobId: null,

  dispatchTraining: (runId, config) =>
    set({
      status: "dispatched",
      activeRunId: runId,
      activeConfig: config,
      currentEpoch: 0,
      totalEpochs: config.hyperparameters.epochs,
      epochMetrics: [],
      logLines: [`Dispatching to ${config.computeTarget}...`],
      errorMessage: null,
      isDrawerOpen: true,
      isDrawerMinimized: false,
      runpodJobId: null,
    }),

  setRunpodJobId: (jobId) => set({ runpodJobId: jobId }),

  appendRunpodStatusLine: (line) =>
    set((s) => ({
      status: "training" as TrainingStatus,
      logLines: appendLog(s.logLines, line),
    })),

  handleEpochMetric: (event) =>
    set((s) => {
      const metric: EpochMetric = {
        epoch: event.current_epoch,
        trainLoss: event.metrics.train_loss,
        valLoss: event.metrics.val_loss,
        elapsedSeconds: event.metrics.elapsed_seconds,
      }
      const line = `Epoch ${event.current_epoch}/${event.total_epochs} | train: ${event.metrics.train_loss.toFixed(4)} | val: ${event.metrics.val_loss.toFixed(4)} | ${event.metrics.elapsed_seconds.toFixed(1)}s`
      return {
        status: "training",
        currentEpoch: event.current_epoch,
        totalEpochs: event.total_epochs,
        epochMetrics: [...s.epochMetrics, metric],
        logLines: appendLog(s.logLines, line),
      }
    }),

  handleTrainingComplete: (event) =>
    set((s) => {
      const m = event.metrics
      const line = `Training complete — RMSE: ${m.rmse.toFixed(3)} | DA: ${(m.directional_accuracy * 100).toFixed(1)}%`
      return {
        status: "completed",
        completionMetrics: m,
        logLines: appendLog(s.logLines, line),
      }
    }),

  handleTrainingFailed: (event) =>
    set((s) => ({
      status: "failed",
      errorMessage: event.error,
      logLines: appendLog(s.logLines, `ERROR: ${event.error}`),
    })),

  cancelTraining: () =>
    set((s) => ({
      status: "failed",
      errorMessage: "Cancelled by user",
      logLines: appendLog(s.logLines, "Cancelled by user."),
    })),

  setDrawerOpen: (open) => set({ isDrawerOpen: open }),
  setDrawerMinimized: (minimized) => set({ isDrawerMinimized: minimized }),

  resetTraining: () =>
    set({
      status: "idle",
      activeRunId: null,
      activeConfig: null,
      currentEpoch: 0,
      totalEpochs: 0,
      epochMetrics: [],
      logLines: [],
      errorMessage: null,
      completionMetrics: null,
      isDrawerOpen: false,
      isDrawerMinimized: false,
      runpodJobId: null,
    }),
}))
