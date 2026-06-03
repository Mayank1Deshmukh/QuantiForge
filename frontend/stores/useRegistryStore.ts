"use client"

import { create } from "zustand"
import type { Backbone, Denoiser, DraftConfig } from "./useBuilderStore"

export interface ModelRecord {
  runId: string
  ticker: string
  backbone: Backbone
  denoiser: Denoiser
  hyperparams: DraftConfig["hyperparameters"]
  metrics: {
    rmse: number
    mae: number
    mape: number
    directionalAccuracy: number
  } | null
  weightsPath: string
  createdAt: string
  status: "completed" | "failed" | "training"
}

export interface ArimaResult {
  ticker: string
  metrics: {
    rmse: number
    mae: number
    mape: number
    directionalAccuracy: number
  }
  predictions: number[]
}

const CHART_COLORS = ["#06b6d4", "#d946ef", "#84cc16", "#f59e0b"]

interface RegistryState {
  models: ModelRecord[]
  fetchStatus: "idle" | "loading" | "error"
  lastFetchedAt: number | null

  arimaResult: ArimaResult | null
  arimaStatus: "idle" | "computing" | "ready" | "error"
  arimaIncluded: boolean

  activeChartOverlays: string[]
  colorAssignments: Record<string, string>
  isControlPanelCollapsed: boolean
  evaluationTicker: string

  fetchRegistry: () => Promise<void>
  deleteModel: (runId: string) => Promise<void>
  triggerArimaCompute: (ticker: string) => Promise<void>
  retryArima: () => void

  toggleModelOverlay: (runId: string) => void
  toggleArimaOverlay: () => void
  toggleAllModels: () => void
  setControlPanelCollapsed: (collapsed: boolean) => void
  setEvaluationTicker: (ticker: string) => void
  assignColor: (runId: string) => string
}

function getDaemonUrl(): string {
  if (typeof window === "undefined") return "http://localhost:8765"
  return (
    localStorage.getItem("qf_daemon_url")?.replace("ws://", "http://").replace("wss://", "https://") ||
    "http://localhost:8765"
  )
}

export const useRegistryStore = create<RegistryState>()((set, get) => ({
  models: [],
  fetchStatus: "idle",
  lastFetchedAt: null,

  arimaResult: null,
  arimaStatus: "idle",
  arimaIncluded: false,

  activeChartOverlays: [],
  colorAssignments: {},
  isControlPanelCollapsed: false,
  evaluationTicker: "SPY",

  fetchRegistry: async () => {
    const { lastFetchedAt } = get()
    if (lastFetchedAt && Date.now() - lastFetchedAt < 2000) return

    set({ fetchStatus: "loading" })
    try {
      const res = await fetch(`${getDaemonUrl()}/api/registry`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const models: ModelRecord[] = data.map((r: any) => ({
        runId: r.run_id,
        ticker: r.ticker,
        backbone: r.backbone,
        denoiser: r.denoiser,
        hyperparams: r.hyperparams ?? r.hyperparams_json ?? {},
        metrics: r.metrics_json
          ? (typeof r.metrics_json === "string" ? JSON.parse(r.metrics_json) : r.metrics_json)
          : r.metrics ?? null,
        weightsPath: r.weights_path,
        createdAt: r.created_at,
        status: r.status,
      }))
      set({ models, fetchStatus: "idle", lastFetchedAt: Date.now() })
    } catch {
      set({ fetchStatus: "error" })
    }
  },

  deleteModel: async (runId) => {
    await fetch(`${getDaemonUrl()}/api/registry/${runId}`, { method: "DELETE" })
    set((s) => ({
      models: s.models.filter((m) => m.runId !== runId),
      activeChartOverlays: s.activeChartOverlays.filter((id) => id !== runId),
    }))
  },

  triggerArimaCompute: async (ticker) => {
    set({ arimaStatus: "computing", arimaIncluded: true })
    try {
      const res = await fetch(`${getDaemonUrl()}/api/arima`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const result: ArimaResult = {
        ticker: data.ticker,
        metrics: {
          rmse: data.metrics.rmse,
          mae: data.metrics.mae,
          mape: data.metrics.mape,
          directionalAccuracy: data.metrics.directional_accuracy,
        },
        predictions: data.predictions,
      }
      set({ arimaResult: result, arimaStatus: "ready" })
    } catch {
      set({ arimaStatus: "error" })
    }
  },

  retryArima: () => {
    const { evaluationTicker, triggerArimaCompute } = get()
    set({ arimaStatus: "idle", arimaResult: null })
    triggerArimaCompute(evaluationTicker)
  },

  toggleModelOverlay: (runId) =>
    set((s) => ({
      activeChartOverlays: s.activeChartOverlays.includes(runId)
        ? s.activeChartOverlays.filter((id) => id !== runId)
        : [...s.activeChartOverlays, runId],
    })),

  toggleArimaOverlay: () => {
    const { arimaIncluded, arimaStatus, evaluationTicker, triggerArimaCompute } = get()
    if (!arimaIncluded && (arimaStatus === "idle" || arimaStatus === "error")) {
      triggerArimaCompute(evaluationTicker)
    }
    set((s) => ({ arimaIncluded: !s.arimaIncluded }))
  },

  toggleAllModels: () => {
    const { models, arimaStatus, evaluationTicker, triggerArimaCompute } = get()
    const completed = models.filter((m) => m.status === "completed").map((m) => m.runId)
    if (arimaStatus === "idle" || arimaStatus === "error") {
      triggerArimaCompute(evaluationTicker)
    }
    set({ activeChartOverlays: completed, arimaIncluded: true })
  },

  setControlPanelCollapsed: (collapsed) => set({ isControlPanelCollapsed: collapsed }),

  setEvaluationTicker: (ticker) =>
    set({ evaluationTicker: ticker, arimaStatus: "idle", arimaResult: null, arimaIncluded: false }),

  assignColor: (runId) => {
    const { colorAssignments } = get()
    if (colorAssignments[runId]) return colorAssignments[runId]
    const used = Object.values(colorAssignments)
    const next = CHART_COLORS.find((c) => !used.includes(c)) ?? CHART_COLORS[used.length % CHART_COLORS.length]
    set((s) => ({ colorAssignments: { ...s.colorAssignments, [runId]: next } }))
    return next
  },
}))
