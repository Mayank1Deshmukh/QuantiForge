"use client"

import { useEffect, useRef } from "react"
import { useTrainingStore } from "@/stores/useTrainingStore"
import { daemonSocket } from "@/lib/daemonSocket"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts"
import * as ScrollArea from "@radix-ui/react-scroll-area"
import { ChevronDown, ChevronUp, X, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { stopRunpodPoller } from "@/lib/runpodPoller"

function calcEta(
  metrics: { elapsedSeconds: number }[],
  currentEpoch: number,
  totalEpochs: number
): string {
  if (metrics.length < 2) return "Calculating…"
  const recent = metrics.slice(-Math.min(5, metrics.length))
  const avg = recent.reduce((s, m) => s + m.elapsedSeconds, 0) / recent.length
  const remaining = totalEpochs - currentEpoch
  const sec = Math.round(remaining * avg)
  if (sec <= 0) return "Finishing…"
  if (sec < 60) return `~${sec}s`
  return `~${Math.floor(sec / 60)}m ${sec % 60}s`
}

export function TrainingDrawer() {
  const status = useTrainingStore((s) => s.status)
  const isMinimized = useTrainingStore((s) => s.isDrawerMinimized)
  const setDrawerMinimized = useTrainingStore((s) => s.setDrawerMinimized)
  const resetTraining = useTrainingStore((s) => s.resetTraining)
  const cancelTraining = useTrainingStore((s) => s.cancelTraining)
  const epoch = useTrainingStore((s) => s.currentEpoch)
  const total = useTrainingStore((s) => s.totalEpochs)
  const config = useTrainingStore((s) => s.activeConfig)
  const runId = useTrainingStore((s) => s.activeRunId)
  const error = useTrainingStore((s) => s.errorMessage)
  const epochMetrics = useTrainingStore((s) => s.epochMetrics)
  const logLines = useTrainingStore((s) => s.logLines)
  const completionMetrics = useTrainingStore((s) => s.completionMetrics)

  const viewportRef = useRef<HTMLDivElement>(null)

  // Auto-scroll log to bottom on new lines
  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight
    }
  }, [logLines])

  // Toast + auto-close 3s after completion
  useEffect(() => {
    if (status !== "completed") return
    const m = completionMetrics
    toast.success(
      m
        ? `Training complete — RMSE ${m.rmse.toFixed(3)} · DA ${(m.directional_accuracy * 100).toFixed(1)}%`
        : "Training complete"
    )
    const t = setTimeout(() => resetTraining(), 3000)
    return () => clearTimeout(t)
  }, [status, completionMetrics, resetTraining])

  if (status === "idle") return null

  const pct = total > 0 ? Math.round((epoch / total) * 100) : 0
  const canClose = status === "completed" || status === "failed"
  const isRunpod = config?.computeTarget === "runpod"
  const isBusy = status === "training" || status === "dispatched"

  const barColor =
    status === "failed" ? "#ef4444" : status === "completed" ? "#22c55e" : "#06b6d4"

  const chartData = epochMetrics.map((m) => ({
    epoch: m.epoch,
    trainLoss: parseFloat(m.trainLoss.toFixed(5)),
    valLoss: parseFloat(m.valLoss.toFixed(5)),
  }))

  // ── Minimized pill ──────────────────────────────────────────────
  if (isMinimized) {
    return (
      <div className="fixed bottom-0 left-0 right-0 h-[48px] bg-[#171717] border-t border-[#404040] flex items-center px-4 gap-3 z-30">
        <div className="h-1 w-[160px] bg-[#262626] rounded-full overflow-hidden shrink-0">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${pct}%`, backgroundColor: barColor }}
          />
        </div>
        <span className="font-mono text-xs text-[#d4d4d4] truncate">
          {config?.backbone ?? "Training"} ·{" "}
          {status === "dispatched"
            ? "Starting…"
            : status === "failed"
            ? "Failed"
            : status === "completed"
            ? "Done"
            : `Epoch ${epoch}/${total} · ${pct}%`}
        </span>
        <button
          onClick={() => setDrawerMinimized(false)}
          className="ml-auto text-[#a3a3a3] hover:text-[#fafafa] transition-colors shrink-0"
        >
          <ChevronUp size={16} />
        </button>
      </div>
    )
  }

  // ── Full drawer ─────────────────────────────────────────────────
  return (
    <div className="fixed bottom-0 left-0 right-0 h-[320px] bg-[#171717] border-t border-[#404040] flex flex-col z-30">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#404040] shrink-0">
        <span className="font-mono text-xs text-[#a3a3a3]">
          {runId?.slice(0, 8)} · {config?.backbone} · {config?.denoiser} · {config?.ticker}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDrawerMinimized(true)}
            className="text-[#a3a3a3] hover:text-[#fafafa] transition-colors"
            title="Minimize"
          >
            <ChevronDown size={16} />
          </button>
          <button
            onClick={() => resetTraining()}
            disabled={!canClose}
            className="text-[#a3a3a3] hover:text-[#ef4444] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Progress + ETA */}
      <div className="px-4 pt-2.5 pb-2 shrink-0">
        <div className="flex items-center justify-between mb-1.5 text-xs">
          <span
            className={
              status === "failed"
                ? "text-[#ef4444]"
                : status === "completed"
                ? "text-[#22c55e]"
                : "text-[#a3a3a3]"
            }
          >
            {status === "dispatched"
              ? "Starting…"
              : status === "failed"
              ? (error ?? "Training failed")
              : status === "completed"
              ? "Completed ✓"
              : `Epoch ${epoch} / ${total}  (${pct}%)`}
          </span>
          {status === "training" && !isRunpod && (
            <span className="font-mono text-[#a3a3a3]">
              ETA {calcEta(epochMetrics, epoch, total)}
            </span>
          )}
        </div>
        <div className="h-1 bg-[#262626] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${pct}%`, backgroundColor: barColor }}
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex border-t border-[#262626]">
        {isRunpod ? (
          // RunPod: no epoch stream — show latest log lines + spinner
          <div className="flex-1 px-4 py-3 flex flex-col gap-1.5 overflow-hidden">
            <span className="text-[10px] text-[#a3a3a3] uppercase tracking-wider font-semibold shrink-0">
              RunPod Status
            </span>
            {logLines.slice(-8).map((line, i, arr) => (
              <div key={i} className="flex items-center gap-2 text-xs font-mono text-[#d4d4d4]">
                {i === arr.length - 1 && isBusy && (
                  <Loader2 size={10} className="animate-spin text-[#06b6d4] shrink-0" />
                )}
                <span className="truncate">{line}</span>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Loss chart */}
            <div className="w-[54%] py-2 pl-2 pr-0 border-r border-[#262626] flex flex-col">
              <div className="flex gap-3 px-2 mb-0.5 shrink-0">
                <span className="flex items-center gap-1 text-[10px] text-[#a3a3a3]">
                  <span className="w-3 h-0.5 rounded bg-[#06b6d4] inline-block" />
                  train_loss
                </span>
                <span className="flex items-center gap-1 text-[10px] text-[#a3a3a3]">
                  <span className="w-3 h-0.5 rounded bg-[#f59e0b] inline-block" />
                  val_loss
                </span>
              </div>
              {chartData.length >= 2 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 6, bottom: 2, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                    <XAxis
                      dataKey="epoch"
                      tick={{ fill: "#404040", fontSize: 8, fontFamily: "monospace" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#404040", fontSize: 8, fontFamily: "monospace" }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <Line
                      type="monotone"
                      dataKey="trainLoss"
                      stroke="#06b6d4"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="valLoss"
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex-1 flex items-center justify-center text-xs text-[#404040]">
                  {status === "dispatched" ? "Waiting for first epoch…" : "Collecting data…"}
                </div>
              )}
            </div>

            {/* Epoch log */}
            <div className="flex-1 flex flex-col py-2 px-3 min-w-0 overflow-hidden">
              <span className="text-[10px] text-[#a3a3a3] uppercase tracking-wider font-semibold mb-1 shrink-0">
                Epoch Log
              </span>
              <ScrollArea.Root className="flex-1 overflow-hidden min-h-0">
                <ScrollArea.Viewport ref={viewportRef} className="h-full w-full">
                  {logLines.map((line, i) => (
                    <div
                      key={i}
                      className="text-[10px] font-mono text-[#a3a3a3] leading-5 overflow-hidden whitespace-nowrap text-ellipsis"
                    >
                      {line}
                    </div>
                  ))}
                  <div />
                </ScrollArea.Viewport>
                <ScrollArea.Scrollbar
                  orientation="vertical"
                  className="flex select-none touch-none p-0.5 w-1.5"
                >
                  <ScrollArea.Thumb className="flex-1 bg-[#404040] rounded-full" />
                </ScrollArea.Scrollbar>
              </ScrollArea.Root>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-[#404040] shrink-0">
        <button
          onClick={() => {
            if (isRunpod) {
              // RunPod: stop polling only — do NOT send STOP_TRAINING to the local daemon
              stopRunpodPoller()
            } else {
              if (runId) daemonSocket.send({ action: "STOP_TRAINING", run_id: runId })
            }
            cancelTraining()
          }}
          disabled={!isBusy}
          className="text-xs text-[#ef4444] hover:text-red-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Cancel Training
        </button>
        <span className="text-xs font-mono text-[#404040]">
          Compute: {isRunpod ? "RunPod" : "Local"}
        </span>
      </div>
    </div>
  )
}
