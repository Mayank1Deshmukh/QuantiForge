"use client"

import { create } from "zustand"

export type Backbone = "TFT" | "TCN" | "BiLSTM" | "LSTM" | "GRU"
export type Denoiser = "None" | "Kalman" | "DWT"
export type Optimizer = "AdamW" | "Ranger" | "SGD"
export type SequenceLength = 24 | 48 | 72
export type BatchSize = 16 | 32 | 64 | 128
export type ComputeTarget = "local" | "runpod"

export interface DraftConfig {
  ticker: string
  denoiser: Denoiser
  backbone: Backbone
  hyperparameters: {
    sequenceLength: SequenceLength
    learningRate: number
    batchSize: BatchSize
    epochs: number
    dropoutRate: number
    optimizer: Optimizer
  }
  computeTarget: ComputeTarget
}

const DEFAULT_CONFIG: DraftConfig = {
  ticker: "SPY",
  denoiser: "None",
  backbone: "LSTM",
  hyperparameters: {
    sequenceLength: 48,
    learningRate: 0.001,
    batchSize: 32,
    epochs: 20,
    dropoutRate: 0.2,
    optimizer: "AdamW",
  },
  computeTarget: "local",
}

interface BuilderState {
  currentStep: 1 | 2 | 3 | 4 | 5 | 6
  completedSteps: Set<number>
  draftConfig: DraftConfig
  dataPreviewStatus: "idle" | "loading" | "success" | "error"
  dataPreviewError: string | null
  dataPreviewClose: number[]
  pendingRunId: string | null

  setStep: (step: number) => void
  markStepComplete: (step: number) => void
  editStep: (step: number) => void
  updateDraftConfig: (patch: Partial<DraftConfig>) => void
  updateHyperparameter: (
    key: keyof DraftConfig["hyperparameters"],
    value: unknown
  ) => void
  setDataPreviewStatus: (
    status: BuilderState["dataPreviewStatus"],
    error?: string,
    close?: number[]
  ) => void
  generateRunId: () => void
  resetWizard: () => void
}

export const useBuilderStore = create<BuilderState>()((set) => ({
  currentStep: 1,
  completedSteps: new Set(),
  draftConfig: { ...DEFAULT_CONFIG },
  dataPreviewStatus: "idle",
  dataPreviewError: null,
  dataPreviewClose: [],
  pendingRunId: null,

  setStep: (step) => set({ currentStep: step as BuilderState["currentStep"] }),

  markStepComplete: (step) =>
    set((s) => ({
      completedSteps: new Set([...s.completedSteps, step]),
      currentStep: Math.min(step + 1, 6) as BuilderState["currentStep"],
    })),

  editStep: (step) =>
    set((s) => {
      const kept = new Set([...s.completedSteps].filter((n) => n < step))
      return {
        currentStep: step as BuilderState["currentStep"],
        completedSteps: kept,
        dataPreviewStatus: step === 1 ? "idle" : s.dataPreviewStatus,
        dataPreviewError: step === 1 ? null : s.dataPreviewError,
        dataPreviewClose: step === 1 ? [] : s.dataPreviewClose,
      }
    }),

  updateDraftConfig: (patch) =>
    set((s) => ({ draftConfig: { ...s.draftConfig, ...patch } })),

  updateHyperparameter: (key, value) =>
    set((s) => ({
      draftConfig: {
        ...s.draftConfig,
        hyperparameters: { ...s.draftConfig.hyperparameters, [key]: value },
      },
    })),

  setDataPreviewStatus: (status, error, close) =>
    set({
      dataPreviewStatus: status,
      dataPreviewError: error ?? null,
      dataPreviewClose: close ?? [],
    }),

  generateRunId: () =>
    set({ pendingRunId: crypto.randomUUID() }),

  resetWizard: () =>
    set({
      currentStep: 1,
      completedSteps: new Set(),
      draftConfig: { ...DEFAULT_CONFIG },
      dataPreviewStatus: "idle",
      dataPreviewError: null,
      dataPreviewClose: [],
      pendingRunId: null,
    }),
}))
