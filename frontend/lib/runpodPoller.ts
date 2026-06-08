/**
 * RunPod job polling loop.
 * Polls /api/runpod/status every 5 s until COMPLETED or FAILED.
 * On COMPLETED: downloads config+metrics JSON from signed URLs,
 *   POSTs the run record to the local daemon's /api/registry,
 *   then fires handleTrainingComplete so the drawer/toast flow works normally.
 * On FAILED: surfaces the error through handleTrainingFailed.
 * Cancel: just stops polling — does NOT send STOP_TRAINING to the daemon.
 */

import { useTrainingStore } from "@/stores/useTrainingStore"
import { useRegistryStore } from "@/stores/useRegistryStore"
import { getDaemonHttpUrl } from "@/lib/daemon"

const POLL_INTERVAL_MS = 5000

let timer: ReturnType<typeof setInterval> | null = null

function stopPoller() {
  if (timer) { clearInterval(timer); timer = null }
}

async function downloadAndRegister(
  runId: string,
  output: Record<string, string>
): Promise<void> {
  const store = useTrainingStore.getState()
  const daemonBase = getDaemonHttpUrl()

  // Best-effort download of config + metrics JSONs from signed URLs
  let config: Record<string, any> = {}
  let metrics: { rmse: number; mae: number; mape: number; directional_accuracy: number } | null = null

  const configUrl = output.config_url ?? output.config_path ?? ""
  const metricsUrl = output.metrics_url ?? output.metrics_path ?? ""

  try {
    if (configUrl) {
      const r = await fetch(configUrl)
      if (r.ok) config = await r.json()
    }
  } catch { /* signed URL missing — use empty config */ }

  try {
    if (metricsUrl) {
      const r = await fetch(metricsUrl)
      if (r.ok) {
        const raw = await r.json()
        metrics = {
          rmse: raw.rmse ?? 0,
          mae: raw.mae ?? 0,
          mape: raw.mape ?? 0,
          directional_accuracy: raw.directional_accuracy ?? raw.directionalAccuracy ?? 0,
        }
      }
    }
  } catch { /* metrics unavailable */ }

  const weightsPath = output.weights_url ?? output.weights_path ?? ""
  const scalerPath  = output.scaler_url  ?? output.scaler_path  ?? ""

  // Register with local daemon — this writes to SQLite so the Evaluation Deck sees the run
  try {
    await fetch(`${daemonBase}/api/registry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        run_id: runId,
        ticker:    config.ticker    ?? "",
        backbone:  config.backbone  ?? "",
        denoiser:  config.denoiser  ?? "None",
        hyperparams: config.hyperparameters ?? {},
        metrics,
        weights_path: weightsPath,
        created_at: new Date().toISOString(),
        status: "completed",
      }),
    })
  } catch {
    // Daemon may be unreachable — surface a warning but don't block the completion flow
    store.appendRunpodStatusLine("Warning: could not register with local daemon (is it running?)")
  }

  // Fire the same completion event the local path uses so the drawer, toast, and registry
  // refresh all work identically regardless of compute backend.
  store.handleTrainingComplete({
    event: "TRAINING_COMPLETE",
    run_id: runId,
    metrics: metrics ?? { rmse: 0, mae: 0, mape: 0, directional_accuracy: 0 },
    artifacts: {
      weights_path: weightsPath,
      scaler_path:  scalerPath,
      config_path:  configUrl,
      metrics_path: metricsUrl,
    },
  })

  useRegistryStore.getState().fetchRegistry()
}

export function startRunpodPoller(
  runId: string,
  jobId: string,
  endpointId: string,
  runpodApiKey: string
): void {
  stopPoller()
  const store = useTrainingStore.getState()

  // Status messages rotate while we wait for the container to start
  const statusMessages = [
    "Waiting for RunPod container…",
    "Container starting…",
    "Training in progress…",
    "Training in progress…", // repeats to avoid cycling past the last message
  ]
  let msgIdx = 0

  store.appendRunpodStatusLine(statusMessages[0])

  timer = setInterval(async () => {
    try {
      const res = await fetch("/api/runpod/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Key is only in this request body; never stored server-side
        body: JSON.stringify({ jobId, endpointId, runpodApiKey }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        stopPoller()
        store.handleTrainingFailed({
          event: "TRAINING_FAILED",
          run_id: runId,
          error: err.error ?? "RunPod status check failed",
        })
        return
      }

      const data = await res.json()
      const jobStatus: string = (data.status ?? "").toUpperCase()

      if (jobStatus === "COMPLETED") {
        stopPoller()
        store.appendRunpodStatusLine("Job complete — downloading artifacts…")
        await downloadAndRegister(runId, data.output ?? {})
        return
      }

      if (jobStatus === "FAILED" || jobStatus === "CANCELLED") {
        stopPoller()
        store.handleTrainingFailed({
          event: "TRAINING_FAILED",
          run_id: runId,
          error: data.error ?? data.output?.error ?? `RunPod job ${jobStatus.toLowerCase()}`,
        })
        return
      }

      // IN_QUEUE or IN_PROGRESS — advance the status message
      msgIdx = Math.min(msgIdx + 1, statusMessages.length - 1)
      store.appendRunpodStatusLine(statusMessages[msgIdx])
    } catch {
      // Transient network error — keep polling; the interval will fire again
    }
  }, POLL_INTERVAL_MS)
}

/** Call when the user cancels a RunPod job. Does NOT send STOP_TRAINING to the daemon. */
export function stopRunpodPoller(): void {
  stopPoller()
}
