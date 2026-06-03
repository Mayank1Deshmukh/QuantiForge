"use client"

import { useTrainingStore } from "@/stores/useTrainingStore"
import { useSystemStore } from "@/stores/useSystemStore"
import { SettingsDialog } from "@/components/settings/SettingsDialog"
import { Settings } from "lucide-react"

function DaemonStatusIndicator() {
  const status = useSystemStore((s) => s.daemonStatus)
  const deviceName = useSystemStore((s) => s.daemonDeviceName)

  const colors = {
    online: "#22c55e",
    offline: "#ef4444",
    training: "#f59e0b",
  }
  const labels = {
    online: "Daemon Online",
    offline: "Daemon Offline",
    training: "Training Active",
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{
          backgroundColor: colors[status],
          animation: status === "training" ? "pulse 1.5s ease-in-out infinite" : undefined,
        }}
      />
      <span className="text-[#a3a3a3]">{labels[status]}</span>
      {deviceName && status !== "offline" && (
        <span className="text-[#404040] text-xs font-mono">{deviceName}</span>
      )}
    </div>
  )
}

function ActiveJobPill() {
  const status = useTrainingStore((s) => s.status)
  const runId = useTrainingStore((s) => s.activeRunId)
  const config = useTrainingStore((s) => s.activeConfig)
  const epoch = useTrainingStore((s) => s.currentEpoch)
  const total = useTrainingStore((s) => s.totalEpochs)
  const cancelTraining = useTrainingStore((s) => s.cancelTraining)
  const { daemonSocket } = require("@/lib/daemonSocket")

  if (status !== "training" && status !== "dispatched") return null

  const shortId = runId?.slice(0, 8) ?? "..."

  const handleCancel = () => {
    if (runId) {
      daemonSocket.send({ action: "STOP_TRAINING", run_id: runId })
    }
    cancelTraining()
  }

  return (
    <div className="flex items-center gap-2 bg-[#171717] border border-[#404040] rounded-full px-3 py-1 text-sm">
      <span
        className="w-2 h-2 rounded-full bg-[#f59e0b] shrink-0"
        style={{ animation: "pulse 1.5s ease-in-out infinite" }}
      />
      <span className="font-mono text-[#d4d4d4]">
        Training · {shortId} · {config?.backbone ?? "—"} ·{" "}
        {status === "dispatched" ? "Starting…" : `Epoch ${epoch}/${total}`}
      </span>
      <button
        onClick={handleCancel}
        className="ml-1 text-[#ef4444] hover:text-red-300 text-xs transition-colors"
      >
        Cancel
      </button>
    </div>
  )
}

export function GlobalHeader() {
  return (
    <header className="h-[60px] flex items-center justify-between px-4 bg-[#0a0a0a] border-b border-[#404040] shrink-0 z-20">
      <span className="font-mono font-bold text-lg tracking-tight text-[#fafafa]">
        QuantiForge
      </span>

      <ActiveJobPill />

      <div className="flex items-center gap-4">
        <DaemonStatusIndicator />
        <SettingsDialog>
          <button className="p-1.5 rounded hover:bg-[#262626] transition-colors text-[#a3a3a3] hover:text-[#fafafa]">
            <Settings size={18} />
          </button>
        </SettingsDialog>
      </div>
    </header>
  )
}
