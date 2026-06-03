"use client"

import { useBuilderStore } from "@/stores/useBuilderStore"
import type { Denoiser } from "@/stores/useBuilderStore"
import * as ToggleGroup from "@radix-ui/react-toggle-group"

const OPTIONS: { value: Denoiser; label: string; sub: string }[] = [
  { value: "None", label: "None", sub: "Raw OHLCV fed directly — baseline for comparison" },
  { value: "Kalman", label: "Kalman Filter", sub: "Linear state-space smoothing of close price" },
  { value: "DWT", label: "DWT (db4)", sub: "Wavelet decomposition removes high-frequency noise" },
]

export function Step2Denoiser() {
  const denoiser = useBuilderStore((s) => s.draftConfig.denoiser)
  const updateDraftConfig = useBuilderStore((s) => s.updateDraftConfig)
  const markStepComplete = useBuilderStore((s) => s.markStepComplete)
  const editStep = useBuilderStore((s) => s.editStep)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium text-[#a3a3a3] uppercase tracking-wider">
          Preprocessing — Close Price Only
        </label>
        <ToggleGroup.Root
          type="single"
          value={denoiser}
          onValueChange={(v) => { if (v) updateDraftConfig({ denoiser: v as Denoiser }) }}
          className="flex flex-col gap-2"
        >
          {OPTIONS.map((opt) => (
            <ToggleGroup.Item
              key={opt.value}
              value={opt.value}
              className="flex flex-col items-start px-4 py-3 rounded-lg border border-[#404040] text-left transition-all outline-none cursor-pointer data-[state=on]:border-[#06b6d4] data-[state=on]:bg-[#06b6d4]/5 hover:bg-[#171717]"
            >
              <span className="text-sm font-medium text-[#fafafa]">{opt.label}</span>
              <span className="text-xs text-[#a3a3a3] mt-0.5">{opt.sub}</span>
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => editStep(1)}
          className="px-4 py-2.5 bg-[#262626] hover:bg-[#2e2e2e] border border-[#404040] rounded-lg text-sm text-[#a3a3a3] transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={() => markStepComplete(2)}
          className="flex-1 px-4 py-2.5 bg-[#06b6d4] hover:bg-[#0891b2] text-[#0a0a0a] font-semibold rounded-lg text-sm transition-colors"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}
