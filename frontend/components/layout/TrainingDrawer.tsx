"use client"

import { useTrainingStore } from "@/stores/useTrainingStore"
import { ChevronDown, ChevronUp, X } from "lucide-react"
import { useEffect } from "react"

export function TrainingDrawer() {
  const status = useTrainingStore((s) => s.status)
  const isOpen = useTrainingStore((s) => s.isDrawerOpen)
  const isMinimized = useTrainingStore((s) => s.isDrawerMinimized)
  const setDrawerOpen = useTrainingStore((s) => s.setDrawerOpen)
  const setDrawerMinimized = useTrainingStore((s) => s.setDrawerMinimized)
  const resetTraining = useTrainingStore((s) => s.resetTraining)
  const epoch = useTrainingStore((s) => s.currentEpoch)
  const total = useTrainingStore((s) => s.totalEpochs)
  const config = useTrainingStore((s) => s.activeConfig)
  const runId = useTrainingStore((s) => s.activeRunId)
  const error = useTrainingStore((s) => s.errorMessage)

  // Auto-close 3s after completion
  useEffect(() => {
    if (status === "completed") {
      const t = setTimeout(() => resetTraining(), 3000)
      return () => clearTimeout(t)
    }
  }, [status, resetTraining])

  if (status === "idle") return null

  const pct = total > 0 ? Math.round((epoch / total) * 100) : 0
  const canClose = status === "completed" || status === "failed"

  if (isMinimized) {
    return (
      <div
        className="fixed bottom-0 left-0 right-0 h-[48px] bg-[#171717] border-t border-[#404040] flex items-center px-4 gap-3 z-30 transition-all duration-150"
      >
        <div
          className="h-1.5 flex-1 bg-[#262626] rounded-full overflow-hidden"
          style={{ maxWidth: "200px" }}
        >
          <div
            className="h-full bg-[#06b6d4] rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="font-mono text-xs text-[#d4d4d4]">
          {config?.backbone ?? "Training"} · Epoch {epoch}/{total} · {pct}%
        </span>
        <button
          onClick={() => setDrawerMinimized(false)}
          className="text-[#a3a3a3] hover:text-[#fafafa] transition-colors"
        >
          <ChevronUp size={16} />
        </button>
      </div>
    )
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 h-[320px] bg-[#171717] border-t border-[#404040] flex flex-col z-30 transition-all duration-250">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#404040] shrink-0">
        <span className="font-mono text-xs text-[#a3a3a3]">
          {runId?.slice(0, 8)} · {config?.backbone} · {config?.denoiser} · {config?.ticker}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDrawerMinimized(true)}
            className="text-[#a3a3a3] hover:text-[#fafafa] transition-colors"
          >
            <ChevronDown size={16} />
          </button>
          <button
            onClick={() => { setDrawerOpen(false); resetTraining() }}
            disabled={!canClose}
            className="text-[#a3a3a3] hover:text-[#ef4444] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="px-4 pt-3 pb-2 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-[#a3a3a3]">
            Epoch {epoch}/{total} ({pct}%)
          </span>
          {error && (
            <span className="text-xs text-[#ef4444]">{error}</span>
          )}
          {status === "dispatched" && (
            <span className="text-xs text-[#f59e0b]">Starting…</span>
          )}
        </div>
        <div className="h-1.5 bg-[#262626] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${status === "failed" ? "bg-[#ef4444]" : "bg-[#06b6d4]"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Body — placeholder for loss chart + epoch log (Phase 7) */}
      <div className="flex-1 px-4 pb-2 flex items-center justify-center text-xs text-[#404040]">
        Loss chart and epoch log — Phase 7
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-[#404040] shrink-0">
        <span className="text-xs text-[#a3a3a3]">
          Compute: {config?.computeTarget === "runpod" ? "RunPod" : "Local"}
        </span>
      </div>
    </div>
  )
}
