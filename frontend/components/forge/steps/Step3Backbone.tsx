"use client"

import { useBuilderStore } from "@/stores/useBuilderStore"
import type { Backbone } from "@/stores/useBuilderStore"
import * as Select from "@radix-ui/react-select"
import { ChevronDown, Check, AlertTriangle } from "lucide-react"

const BACKBONES: { value: Backbone; label: string; info: string }[] = [
  {
    value: "TFT",
    label: "Temporal Fusion Transformer (TFT)",
    info: "Attention-based architecture with gating and variable selection. Highest complexity; uses a separate pytorch_forecasting training path.",
  },
  {
    value: "TCN",
    label: "TCN (CNN-LSTM)",
    info: "Temporal Convolutional Network: Conv1d extracts local OHLCV feature maps, followed by LSTM for temporal dependencies.",
  },
  {
    value: "BiLSTM",
    label: "BiLSTM",
    info: "Bidirectional LSTM processes each sequence in both directions, doubling the effective hidden representation.",
  },
  {
    value: "LSTM",
    label: "LSTM",
    info: "Standard Long Short-Term Memory — the canonical recurrent baseline for sequence regression tasks.",
  },
  {
    value: "GRU",
    label: "GRU",
    info: "Gated Recurrent Unit: faster convergence than LSTM with fewer parameters and no cell state.",
  },
]

export function Step3Backbone() {
  const backbone = useBuilderStore((s) => s.draftConfig.backbone)
  const updateDraftConfig = useBuilderStore((s) => s.updateDraftConfig)
  const markStepComplete = useBuilderStore((s) => s.markStepComplete)
  const editStep = useBuilderStore((s) => s.editStep)

  const selected = BACKBONES.find((b) => b.value === backbone)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-[#a3a3a3] uppercase tracking-wider">Architecture Backbone</label>
        <Select.Root value={backbone} onValueChange={(v) => updateDraftConfig({ backbone: v as Backbone })}>
          <Select.Trigger className="flex items-center justify-between w-full bg-[#262626] border border-[#404040] rounded-lg px-3 py-2.5 text-sm text-[#fafafa] hover:bg-[#2a2a2a] focus:outline-none focus:border-[#06b6d4] transition-colors cursor-pointer">
            <Select.Value />
            <Select.Icon className="text-[#a3a3a3]"><ChevronDown size={14} /></Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content
              className="bg-[#171717] border border-[#404040] rounded-lg shadow-xl z-50 overflow-hidden min-w-[var(--radix-select-trigger-width)]"
              position="popper"
              sideOffset={4}
            >
              <Select.Viewport className="p-1">
                {BACKBONES.map((b) => (
                  <Select.Item
                    key={b.value}
                    value={b.value}
                    className="flex items-center justify-between px-3 py-2 text-sm text-[#fafafa] rounded cursor-pointer outline-none data-[highlighted]:bg-[#262626] transition-colors"
                  >
                    <Select.ItemText>{b.label}</Select.ItemText>
                    <Select.ItemIndicator><Check size={12} className="text-[#06b6d4]" /></Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>

      {/* Info block */}
      {selected && (
        <div className="rounded-lg bg-[#171717] border border-[#404040] px-4 py-3">
          <p className="text-xs text-[#a3a3a3] leading-relaxed">{selected.info}</p>
        </div>
      )}

      {/* TFT warning */}
      {backbone === "TFT" && (
        <div className="flex items-start gap-2 rounded-lg bg-[#f59e0b]/5 border border-[#f59e0b]/30 px-4 py-3">
          <AlertTriangle size={14} className="text-[#f59e0b] mt-0.5 shrink-0" />
          <p className="text-xs text-[#f59e0b] leading-relaxed">
            TFT uses a separate data preparation path with{" "}
            <span className="font-mono">TimeSeriesDataSet</span> and trains via PyTorch Lightning.
            Expect longer setup time before the first epoch metric arrives.
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => editStep(2)}
          className="px-4 py-2.5 bg-[#262626] hover:bg-[#2e2e2e] border border-[#404040] rounded-lg text-sm text-[#a3a3a3] transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={() => markStepComplete(3)}
          className="flex-1 px-4 py-2.5 bg-[#06b6d4] hover:bg-[#0891b2] text-[#0a0a0a] font-semibold rounded-lg text-sm transition-colors"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}
