"use client"

import { useEffect, useRef } from "react"
import { useRegistryStore } from "@/stores/useRegistryStore"
import { useSystemStore } from "@/stores/useSystemStore"
import { alpacaSocket } from "@/lib/alpacaSocket"
import { simulationRunner } from "@/lib/simulationRunner"
import dynamic from "next/dynamic"
import { ControlPanel } from "./ControlPanel"
import { MetricsTable } from "./MetricsTable"

const MasterChart = dynamic(
  () => import("./MasterChart").then((m) => ({ default: m.MasterChart })),
  { ssr: false, loading: () => <div className="w-full h-full bg-[#0a0a0a]" /> }
)
import * as Select from "@radix-ui/react-select"
import { ChevronDown, Check } from "lucide-react"

const TICKERS = ["SPY", "AAPL", "NVDA", "TSLA"]

function TickerSelect() {
  const ticker = useRegistryStore((s) => s.evaluationTicker)
  const setTicker = useRegistryStore((s) => s.setEvaluationTicker)
  return (
    <Select.Root value={ticker} onValueChange={setTicker}>
      <Select.Trigger className="flex items-center gap-1.5 bg-[#262626] border border-[#404040] rounded px-2.5 py-1.5 text-sm font-mono text-[#fafafa] hover:bg-[#2a2a2a] focus:outline-none focus:border-[#06b6d4] transition-colors cursor-pointer">
        <Select.Value />
        <Select.Icon className="text-[#a3a3a3]">
          <ChevronDown size={12} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="bg-[#171717] border border-[#404040] rounded-lg shadow-xl z-50 min-w-[80px]"
          position="popper"
          sideOffset={4}
        >
          <Select.Viewport className="p-1">
            {TICKERS.map((t) => (
              <Select.Item
                key={t}
                value={t}
                className="flex items-center justify-between px-3 py-1.5 text-sm font-mono text-[#fafafa] rounded cursor-pointer outline-none data-[highlighted]:bg-[#262626] transition-colors"
              >
                <Select.ItemText>{t}</Select.ItemText>
                <Select.ItemIndicator>
                  <Check size={11} className="text-[#06b6d4]" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

function DeckHeader() {
  const isSimulation = useSystemStore((s) => s.isSimulationActive)
  const evaluationTicker = useRegistryStore((s) => s.evaluationTicker)

  return (
    <>
      {isSimulation && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-[#f59e0b]/10 border-b border-[#f59e0b]/30 text-xs text-[#f59e0b] font-mono shrink-0">
          <span
            className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]"
            style={{ animation: "pulse 1s ease-in-out infinite" }}
          />
          SIMULATION — Replaying {evaluationTicker}
        </div>
      )}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[#404040] bg-[#0a0a0a] shrink-0">
        <TickerSelect />
        {/* Live/Sim controls are rendered inside ControlPanel */}
      </div>
    </>
  )
}

export function EvaluationDeck() {
  const fetchRegistry = useRegistryStore((s) => s.fetchRegistry)
  const isLive = useSystemStore((s) => s.isLiveModeActive)
  const isSimulation = useSystemStore((s) => s.isSimulationActive)
  const simulationSpeed = useSystemStore((s) => s.simulationSpeed)
  const evaluationTicker = useRegistryStore((s) => s.evaluationTicker)
  // Track previous sim state to detect speed-only changes
  const prevSimRef = useRef(false)

  // Fetch registry on tab activation
  useEffect(() => {
    fetchRegistry()
  }, [fetchRegistry])

  // Live mode — connect/disconnect alpacaSocket
  useEffect(() => {
    if (!isLive) {
      alpacaSocket.disconnect()
      return
    }
    const key = localStorage.getItem("qf_alpaca_key") ?? ""
    const secret = localStorage.getItem("qf_alpaca_secret") ?? ""
    if (!key || !secret) {
      // Credentials missing — live mode was toggled without keys configured
      useSystemStore.getState().setLiveMode(false)
      return
    }
    alpacaSocket.connect(key, secret, evaluationTicker)
    return () => alpacaSocket.disconnect()
  }, [isLive, evaluationTicker])

  // Simulation mode — start/stop runner
  useEffect(() => {
    if (!isSimulation) {
      simulationRunner.stop()
      prevSimRef.current = false
      return
    }
    simulationRunner.start(evaluationTicker, simulationSpeed)
    prevSimRef.current = true
  }, [isSimulation, evaluationTicker]) // eslint-disable-line react-hooks/exhaustive-deps

  // Speed change while simulation is already running
  useEffect(() => {
    if (isSimulation && prevSimRef.current) {
      simulationRunner.changeSpeed(simulationSpeed)
    }
  }, [simulationSpeed]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <DeckHeader />

      {/* Chart + Control Panel */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 relative min-w-0">
          <MasterChart />
        </div>
        <ControlPanel />
      </div>

      {/* Metrics table — only rendered when there is data */}
      <MetricsTable />
    </div>
  )
}
