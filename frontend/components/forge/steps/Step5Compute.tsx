"use client"

import { useEffect, useState } from "react"
import { useBuilderStore } from "@/stores/useBuilderStore"
import type { ComputeTarget } from "@/stores/useBuilderStore"
import { useSystemStore } from "@/stores/useSystemStore"
import * as RadioGroup from "@radix-ui/react-radio-group"
import { Cpu, Cloud, CheckCircle2, XCircle, AlertCircle } from "lucide-react"

function StatusBadge({ ok, labelOk, labelFail }: { ok: boolean; labelOk: string; labelFail: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-mono rounded-full px-2 py-0.5 ${ok ? "bg-[#22c55e]/10 text-[#22c55e]" : "bg-[#ef4444]/10 text-[#ef4444]"}`}>
      {ok ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
      {ok ? labelOk : labelFail}
    </span>
  )
}

export function Step5Compute() {
  const computeTarget = useBuilderStore((s) => s.draftConfig.computeTarget)
  const updateDraftConfig = useBuilderStore((s) => s.updateDraftConfig)
  const markStepComplete = useBuilderStore((s) => s.markStepComplete)
  const editStep = useBuilderStore((s) => s.editStep)
  const daemonStatus = useSystemStore((s) => s.daemonStatus)
  const setSettingsOpen = useSystemStore((s) => s.setSettingsOpen)

  const [hasRunpodKey, setHasRunpodKey] = useState(false)
  useEffect(() => {
    setHasRunpodKey(Boolean(localStorage.getItem("qf_runpod_key")))
  }, [])

  const handleValueChange = (v: ComputeTarget) => {
    updateDraftConfig({ computeTarget: v })
    if (v === "runpod" && !hasRunpodKey) {
      setSettingsOpen(true)
    }
  }

  const localDisabled = computeTarget === "local" && daemonStatus === "offline"
  const runpodDisabled = computeTarget === "runpod" && !hasRunpodKey
  const canContinue = !localDisabled && !runpodDisabled

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium text-[#a3a3a3] uppercase tracking-wider">Compute Target</label>
        <RadioGroup.Root
          value={computeTarget}
          onValueChange={(v) => handleValueChange(v as ComputeTarget)}
          className="flex flex-col gap-3"
        >
          {/* Local Daemon */}
          <RadioGroup.Item value="local" asChild>
            <label className={`flex items-start gap-3 px-4 py-4 rounded-lg border cursor-pointer transition-all ${computeTarget === "local" ? "border-[#06b6d4] bg-[#06b6d4]/5" : "border-[#404040] hover:bg-[#171717]"}`}>
              <div className="mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors" style={{ borderColor: computeTarget === "local" ? "#06b6d4" : "#404040" }}>
                {computeTarget === "local" && <div className="w-2 h-2 rounded-full bg-[#06b6d4]" />}
              </div>
              <div className="flex-1 flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Cpu size={14} className="text-[#a3a3a3]" />
                    <span className="text-sm font-medium text-[#fafafa]">Local Daemon</span>
                  </div>
                  <p className="text-xs text-[#a3a3a3] mt-1">Train using your local GPU via the Python daemon. Fastest iteration.</p>
                </div>
                <StatusBadge
                  ok={daemonStatus !== "offline"}
                  labelOk="Daemon Online"
                  labelFail="Daemon Offline"
                />
              </div>
            </label>
          </RadioGroup.Item>

          {/* RunPod */}
          <RadioGroup.Item value="runpod" asChild>
            <label className={`flex items-start gap-3 px-4 py-4 rounded-lg border cursor-pointer transition-all ${computeTarget === "runpod" ? "border-[#06b6d4] bg-[#06b6d4]/5" : "border-[#404040] hover:bg-[#171717]"}`}>
              <div className="mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors" style={{ borderColor: computeTarget === "runpod" ? "#06b6d4" : "#404040" }}>
                {computeTarget === "runpod" && <div className="w-2 h-2 rounded-full bg-[#06b6d4]" />}
              </div>
              <div className="flex-1 flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Cloud size={14} className="text-[#a3a3a3]" />
                    <span className="text-sm font-medium text-[#fafafa]">RunPod Serverless</span>
                  </div>
                  <p className="text-xs text-[#a3a3a3] mt-1">Train on a cloud GPU. Requires RunPod API key in Settings. Target: &lt;$0.10/run.</p>
                </div>
                <StatusBadge
                  ok={hasRunpodKey}
                  labelOk="Key Configured"
                  labelFail="No Key"
                />
              </div>
            </label>
          </RadioGroup.Item>
        </RadioGroup.Root>
      </div>

      {/* Contextual warnings */}
      {localDisabled && (
        <div className="flex items-center gap-2 text-xs text-[#f59e0b] bg-[#f59e0b]/5 border border-[#f59e0b]/20 rounded-lg px-3 py-2">
          <AlertCircle size={12} className="shrink-0" />
          Start <code className="font-mono">python daemon.py</code> to enable local training.
        </div>
      )}
      {runpodDisabled && (
        <div className="flex items-center justify-between gap-2 text-xs text-[#f59e0b] bg-[#f59e0b]/5 border border-[#f59e0b]/20 rounded-lg px-3 py-2">
          <span className="flex items-center gap-2">
            <AlertCircle size={12} className="shrink-0" />
            No RunPod API key configured.
          </span>
          <button onClick={() => setSettingsOpen(true)} className="text-[#06b6d4] hover:underline whitespace-nowrap">
            Open Settings →
          </button>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => editStep(4)}
          className="px-4 py-2.5 bg-[#262626] hover:bg-[#2e2e2e] border border-[#404040] rounded-lg text-sm text-[#a3a3a3] transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={() => markStepComplete(5)}
          disabled={!canContinue}
          title={localDisabled ? "Start daemon.py to enable" : runpodDisabled ? "Configure RunPod key in Settings" : undefined}
          className="flex-1 px-4 py-2.5 bg-[#06b6d4] hover:bg-[#0891b2] text-[#0a0a0a] font-semibold rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}
