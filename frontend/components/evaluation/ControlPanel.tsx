"use client"

import { useState } from "react"
import { useRegistryStore } from "@/stores/useRegistryStore"
import { useSystemStore } from "@/stores/useSystemStore"
import * as Checkbox from "@radix-ui/react-checkbox"
import * as Popover from "@radix-ui/react-popover"
import * as Switch from "@radix-ui/react-switch"
import * as ToggleGroup from "@radix-ui/react-toggle-group"
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Trash2,
  Check,
} from "lucide-react"

function ModelRow({ runId }: { runId: string }) {
  const models = useRegistryStore((s) => s.models)
  const activeOverlays = useRegistryStore((s) => s.activeChartOverlays)
  const colorAssignments = useRegistryStore((s) => s.colorAssignments)
  const toggleModelOverlay = useRegistryStore((s) => s.toggleModelOverlay)
  const deleteModel = useRegistryStore((s) => s.deleteModel)

  const model = models.find((m) => m.runId === runId)
  if (!model) return null

  const color = colorAssignments[runId] ?? "#06b6d4"
  const checked = activeOverlays.includes(runId)
  const hasWeights = model.status === "completed" && !!model.weightsPath
  const isFailed = model.status === "failed"
  const isTraining = model.status === "training"
  const canToggle = hasWeights && !isFailed && !isTraining

  return (
    <div className="group relative flex items-start gap-2 py-3 px-3 border-b border-[#1e1e1e] last:border-0">
      {/* Color swatch + checkbox */}
      <div className="flex items-center gap-2 pt-0.5 shrink-0">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <Checkbox.Root
          checked={checked}
          onCheckedChange={() => canToggle && toggleModelOverlay(runId)}
          disabled={!canToggle}
          className="w-4 h-4 rounded border border-[#404040] bg-[#262626] flex items-center justify-center outline-none data-[state=checked]:bg-[#06b6d4] data-[state=checked]:border-[#06b6d4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Checkbox.Indicator>
            <Check size={10} className="text-[#0a0a0a] stroke-[3]" />
          </Checkbox.Indicator>
        </Checkbox.Root>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] font-mono text-[#d4d4d4]">
            {runId.slice(0, 8)}
          </span>
          <span className="text-[10px] text-[#a3a3a3]">· {model.backbone}</span>
        </div>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          <span className="text-[9px] bg-[#262626] text-[#a3a3a3] px-1.5 py-px rounded font-mono">
            {model.denoiser}
          </span>
          <span className="text-[9px] bg-[#262626] text-[#a3a3a3] px-1.5 py-px rounded font-mono">
            {model.ticker}
          </span>
        </div>
        {model.metrics && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] font-mono text-[#d4d4d4]">
              RMSE {model.metrics.rmse.toFixed(2)}
            </span>
            <span
              className={`text-[10px] font-mono ${
                model.metrics.directionalAccuracy >= 0.55
                  ? "text-[#22c55e]"
                  : model.metrics.directionalAccuracy <= 0.5
                  ? "text-[#ef4444]"
                  : "text-[#a3a3a3]"
              }`}
            >
              DA {(model.metrics.directionalAccuracy * 100).toFixed(0)}%
            </span>
          </div>
        )}
        {isFailed && (
          <span className="text-[9px] bg-[#ef4444]/10 text-[#ef4444] px-1.5 py-px rounded font-mono">
            Failed
          </span>
        )}
        {isTraining && (
          <span className="text-[9px] bg-[#f59e0b]/10 text-[#f59e0b] px-1.5 py-px rounded font-mono">
            Training…
          </span>
        )}
        {!isFailed && !isTraining && !hasWeights && (
          <span className="text-[9px] text-[#ef4444]">Weights unavailable</span>
        )}
      </div>

      {/* Delete — hover only */}
      <Popover.Root>
        <Popover.Trigger asChild>
          <button className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 text-[#a3a3a3] hover:text-[#ef4444] mt-0.5">
            <Trash2 size={12} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="left"
            sideOffset={4}
            className="bg-[#171717] border border-[#404040] rounded-lg p-3 shadow-xl z-50 w-44"
          >
            <p className="text-xs text-[#fafafa] mb-3">Delete this model?</p>
            <div className="flex gap-2">
              <button
                onClick={() => deleteModel(runId)}
                className="flex-1 px-2 py-1 bg-[#ef4444] hover:bg-red-400 text-white text-xs rounded transition-colors"
              >
                Delete
              </button>
              <Popover.Close asChild>
                <button className="flex-1 px-2 py-1 bg-[#262626] hover:bg-[#404040] text-[#a3a3a3] text-xs rounded transition-colors">
                  Cancel
                </button>
              </Popover.Close>
            </div>
            <Popover.Arrow className="fill-[#404040]" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}

function ArimaRow() {
  const arimaStatus = useRegistryStore((s) => s.arimaStatus)
  const arimaResult = useRegistryStore((s) => s.arimaResult)
  const arimaIncluded = useRegistryStore((s) => s.arimaIncluded)
  const toggleArimaOverlay = useRegistryStore((s) => s.toggleArimaOverlay)
  const retryArima = useRegistryStore((s) => s.retryArima)

  return (
    <div className="flex items-start gap-2 py-3 px-3 border-b border-[#404040]">
      <div className="flex items-center gap-2 pt-0.5 shrink-0">
        <span className="w-2.5 h-2.5 rounded-full bg-[#64748b] shrink-0" />
        <Checkbox.Root
          checked={arimaIncluded}
          onCheckedChange={() => toggleArimaOverlay()}
          className="w-4 h-4 rounded border border-[#404040] bg-[#262626] flex items-center justify-center outline-none data-[state=checked]:bg-[#64748b] data-[state=checked]:border-[#64748b] transition-colors"
        >
          <Checkbox.Indicator>
            <Check size={10} className="text-white stroke-[3]" />
          </Checkbox.Indicator>
        </Checkbox.Root>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#fafafa]">ARIMA Baseline</span>
          {arimaStatus === "computing" && (
            <Loader2 size={10} className="animate-spin text-[#a3a3a3]" />
          )}
        </div>
        {arimaStatus === "ready" && arimaResult && (
          <span className="text-[10px] font-mono text-[#d4d4d4] mt-0.5 block">
            RMSE {arimaResult.metrics.rmse.toFixed(2)}
          </span>
        )}
        {arimaStatus === "error" && (
          <button
            onClick={retryArima}
            className="flex items-center gap-1 text-[10px] text-[#ef4444] hover:text-red-300 mt-0.5 transition-colors"
          >
            <RefreshCw size={9} /> Retry
          </button>
        )}
      </div>
    </div>
  )
}

export function ControlPanel() {
  const models = useRegistryStore((s) => s.models)
  const isCollapsed = useRegistryStore((s) => s.isControlPanelCollapsed)
  const setCollapsed = useRegistryStore((s) => s.setControlPanelCollapsed)
  const activeOverlays = useRegistryStore((s) => s.activeChartOverlays)
  const colorAssignments = useRegistryStore((s) => s.colorAssignments)
  const toggleAllModels = useRegistryStore((s) => s.toggleAllModels)
  const fetchStatus = useRegistryStore((s) => s.fetchStatus)
  const isLive = useSystemStore((s) => s.isLiveModeActive)
  const isSimulation = useSystemStore((s) => s.isSimulationActive)
  const simulationSpeed = useSystemStore((s) => s.simulationSpeed)
  const setLiveMode = useSystemStore((s) => s.setLiveMode)
  const setSimulationMode = useSystemStore((s) => s.setSimulationMode)
  const setSimulationSpeed = useSystemStore((s) => s.setSimulationSpeed)

  const completedModels = models.filter((m) => m.status === "completed")
  const visibleModels = models // show all: completed, failed, training

  // Collapsed rail
  if (isCollapsed) {
    return (
      <div className="w-8 border-l border-[#404040] bg-[#0d0d0d] flex flex-col items-center py-2 gap-3 shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="text-[#a3a3a3] hover:text-[#fafafa] transition-colors"
          title="Expand"
        >
          <ChevronLeft size={14} />
        </button>
        {activeOverlays.map((id) => (
          <span
            key={id}
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: colorAssignments[id] ?? "#06b6d4" }}
            title={id.slice(0, 8)}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="w-[280px] shrink-0 border-l border-[#404040] bg-[#0d0d0d] flex flex-col overflow-hidden transition-all duration-200">
      {/* Panel header */}
      <div className="flex flex-col border-b border-[#404040] shrink-0">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-3">
            {/* Live toggle */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[#a3a3a3]">Live</span>
              <Switch.Root
                checked={isLive}
                onCheckedChange={(v) => {
                  setLiveMode(v)
                  if (v) setSimulationMode(false)
                }}
                className="w-7 h-4 rounded-full bg-[#262626] data-[state=checked]:bg-[#06b6d4] transition-colors outline-none"
              >
                <Switch.Thumb className="block w-3 h-3 rounded-full bg-white shadow translate-x-0.5 transition-transform data-[state=checked]:translate-x-3.5" />
              </Switch.Root>
            </div>
            {/* Simulation toggle */}
            <button
              onClick={() => {
                const next = !isSimulation
                setSimulationMode(next)
                if (next) setLiveMode(false)
              }}
              className={`text-[10px] px-2 py-0.5 rounded border transition-colors outline-none ${
                isSimulation
                  ? "border-[#f59e0b] bg-[#f59e0b]/10 text-[#f59e0b]"
                  : "border-[#404040] text-[#a3a3a3] hover:border-[#f59e0b] hover:text-[#f59e0b]"
              }`}
            >
              Sim
            </button>
          </div>
          <button
            onClick={() => setCollapsed(true)}
            className="text-[#a3a3a3] hover:text-[#fafafa] transition-colors"
            title="Collapse"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        {/* Speed control — visible only when simulation is active */}
        {isSimulation && (
          <div className="flex items-center gap-2 px-3 pb-2">
            <span className="text-[10px] text-[#a3a3a3] shrink-0">Speed</span>
            <ToggleGroup.Root
              type="single"
              value={String(simulationSpeed)}
              onValueChange={(v) => {
                if (v) setSimulationSpeed(Number(v) as 1 | 10 | 30 | 60)
              }}
              className="flex gap-1"
            >
              {([1, 10, 30, 60] as const).map((s) => (
                <ToggleGroup.Item
                  key={s}
                  value={String(s)}
                  className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-[#404040] text-[#a3a3a3] outline-none cursor-pointer data-[state=on]:bg-[#f59e0b]/10 data-[state=on]:border-[#f59e0b] data-[state=on]:text-[#f59e0b] transition-colors"
                >
                  {s}×
                </ToggleGroup.Item>
              ))}
            </ToggleGroup.Root>
          </div>
        )}
      </div>

      {/* Models header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#262626] shrink-0">
        <span className="text-[10px] font-semibold text-[#a3a3a3] uppercase tracking-wider">
          Models
          {fetchStatus === "loading" && (
            <Loader2 size={9} className="inline ml-1.5 animate-spin" />
          )}
        </span>
        <button
          onClick={toggleAllModels}
          disabled={completedModels.length === 0}
          className="text-[10px] text-[#06b6d4] hover:text-cyan-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Compare All
        </button>
      </div>

      {/* Scrollable model list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <ArimaRow />

        {visibleModels.length === 0 && fetchStatus !== "loading" ? (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center gap-2">
            <span className="text-xs text-[#404040]">No trained models yet.</span>
            <span className="text-[10px] text-[#404040]">
              Go to Architecture Forge to train your first model.
            </span>
          </div>
        ) : (
          visibleModels.map((m) => <ModelRow key={m.runId} runId={m.runId} />)
        )}
      </div>
    </div>
  )
}
