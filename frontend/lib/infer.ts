import { useRegistryStore } from "@/stores/useRegistryStore"
import { daemonSocket } from "./daemonSocket"

export interface OHLCVBar {
  ticker: string
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** Send INFER to daemon for every model currently toggled on in the Evaluation Deck. */
export function dispatchInferForActiveOverlays(bar: OHLCVBar): void {
  const overlays = useRegistryStore.getState().activeChartOverlays
  for (const runId of overlays) {
    daemonSocket.send({ action: "INFER", run_id: runId, bar })
  }
}
