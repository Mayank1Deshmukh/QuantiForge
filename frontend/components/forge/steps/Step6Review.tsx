"use client"

import { useEffect } from "react"
import { useBuilderStore } from "@/stores/useBuilderStore"
import { useTrainingStore } from "@/stores/useTrainingStore"
import { useSystemStore } from "@/stores/useSystemStore"
import { daemonSocket } from "@/lib/daemonSocket"
import { Loader2, Rocket } from "lucide-react"
import { toast } from "sonner"

function DefRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-[#262626] last:border-0">
      <span className="text-xs text-[#a3a3a3]">{label}</span>
      <span className="text-xs font-mono text-[#d4d4d4]">{value}</span>
    </div>
  )
}

export function Step6Review() {
  const config = useBuilderStore((s) => s.draftConfig)
  const pendingRunId = useBuilderStore((s) => s.pendingRunId)
  const generateRunId = useBuilderStore((s) => s.generateRunId)
  const resetWizard = useBuilderStore((s) => s.resetWizard)
  const editStep = useBuilderStore((s) => s.editStep)
  const dispatchTraining = useTrainingStore((s) => s.dispatchTraining)
  const setRunpodJobId = useTrainingStore((s) => s.setRunpodJobId)
  const daemonStatus = useSystemStore((s) => s.daemonStatus)

  // Generate run_id on mount
  useEffect(() => {
    if (!pendingRunId) generateRunId()
  }, [])

  const localDisabled = config.computeTarget === "local" && daemonStatus === "offline"
  const runpodDisabled = config.computeTarget === "runpod" && !localStorage.getItem("qf_runpod_key")
  const canStart = !localDisabled && !runpodDisabled

  const handleStartTraining = async () => {
    if (!pendingRunId) return
    dispatchTraining(pendingRunId, config)

    if (config.computeTarget === "local") {
      daemonSocket.send({
        action: "START_TRAINING",
        run_id: pendingRunId,
        configuration: {
          ticker: config.ticker,
          sequence_length: config.hyperparameters.sequenceLength,
          denoiser: config.denoiser,
          backbone: config.backbone,
          hyperparameters: {
            learning_rate: config.hyperparameters.learningRate,
            batch_size: config.hyperparameters.batchSize,
            epochs: config.hyperparameters.epochs,
            dropout: config.hyperparameters.dropoutRate,
            optimizer: config.hyperparameters.optimizer,
          },
        },
      })
      toast.success("Training dispatched to local daemon")
    } else {
      // RunPod path
      try {
        const runpodKey = localStorage.getItem("qf_runpod_key") ?? ""
        const endpointId = localStorage.getItem("qf_runpod_endpoint") ?? ""
        const res = await fetch("/api/runpod/trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelConfig: {
              ticker: config.ticker,
              sequence_length: config.hyperparameters.sequenceLength,
              denoiser: config.denoiser,
              backbone: config.backbone,
              hyperparameters: {
                learning_rate: config.hyperparameters.learningRate,
                batch_size: config.hyperparameters.batchSize,
                epochs: config.hyperparameters.epochs,
                dropout: config.hyperparameters.dropoutRate,
                optimizer: config.hyperparameters.optimizer,
              },
              run_id: pendingRunId,
            },
            runpodApiKey: runpodKey,
            endpointId,
          }),
        })
        if (!res.ok) throw new Error(`RunPod trigger failed: HTTP ${res.status}`)
        const { job_id } = await res.json()
        setRunpodJobId(job_id)
        toast.success("RunPod job started")
      } catch (e) {
        toast.error((e as Error).message)
        return
      }
    }

    resetWizard()
  }

  const hp = config.hyperparameters

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-[#404040] bg-[#0d0d0d] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#404040] bg-[#171717]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#a3a3a3] uppercase tracking-wider">Configuration Summary</span>
            {pendingRunId && (
              <span className="text-[10px] font-mono text-[#404040]">{pendingRunId}</span>
            )}
          </div>
        </div>
        <div className="px-4 py-2">
          <DefRow label="Ticker" value={`${config.ticker} · 2yr · Hourly`} />
          <DefRow label="Denoiser" value={config.denoiser} />
          <DefRow label="Backbone" value={config.backbone} />
          <DefRow label="Sequence Length" value={`${hp.sequenceLength}h`} />
          <DefRow label="Epochs" value={String(hp.epochs)} />
          <DefRow label="Batch Size" value={String(hp.batchSize)} />
          <DefRow label="Learning Rate" value={hp.learningRate.toFixed(4)} />
          <DefRow label="Dropout" value={hp.dropoutRate.toFixed(2)} />
          <DefRow label="Optimizer" value={hp.optimizer} />
          <DefRow label="Compute" value={config.computeTarget === "local" ? "Local Daemon" : "RunPod Serverless"} />
        </div>
      </div>

      {localDisabled && (
        <p className="text-xs text-[#ef4444] text-center">Daemon is offline — cannot start local training.</p>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => editStep(5)}
          className="px-4 py-2.5 bg-[#262626] hover:bg-[#2e2e2e] border border-[#404040] rounded-lg text-sm text-[#a3a3a3] transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={handleStartTraining}
          disabled={!canStart}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#06b6d4] hover:bg-[#0891b2] text-[#0a0a0a] font-bold rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Rocket size={15} />
          Start Training
        </button>
      </div>
    </div>
  )
}
