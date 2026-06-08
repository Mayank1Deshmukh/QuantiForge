import { useSystemStore } from "@/stores/useSystemStore"
import { dispatchInferForActiveOverlays } from "./infer"
import type { OHLCVBar } from "./infer"
import { toast } from "sonner"

let timer: ReturnType<typeof setInterval> | null = null
let bars: OHLCVBar[] = []
let idx = 0

function tick() {
  if (idx >= bars.length) {
    stop()
    useSystemStore.getState().setSimulationMode(false)
    toast.success("Simulation complete")
    return
  }
  dispatchInferForActiveOverlays(bars[idx])
  idx++
}

function startTimer(speed: number) {
  if (timer) clearInterval(timer)
  // speed 1 = 3600s real-time, 10 = 360s, 30 = 120s, 60 = 60s per simulated hour
  const ms = (3600 / speed) * 1000
  timer = setInterval(tick, ms)
}

export async function start(ticker: string, speed: number): Promise<void> {
  stop()
  try {
    const res = await fetch(`/sim_data/${ticker}_sim.json`)
    if (!res.ok) throw new Error("not found")
    bars = await res.json()
  } catch {
    toast.error(`Simulation data unavailable for ${ticker}. Add /public/sim_data/${ticker}_sim.json.`)
    useSystemStore.getState().setSimulationMode(false)
    return
  }
  if (bars.length === 0) {
    toast.error(`Simulation data for ${ticker} is empty.`)
    useSystemStore.getState().setSimulationMode(false)
    return
  }
  idx = 0
  startTimer(speed)
}

/** Change replay speed without losing current bar position. */
export function changeSpeed(speed: number): void {
  if (!timer) return
  startTimer(speed)
}

export function stop(): void {
  if (timer) { clearInterval(timer); timer = null }
  bars = []
  idx = 0
}

export const simulationRunner = { start, stop, changeSpeed }
