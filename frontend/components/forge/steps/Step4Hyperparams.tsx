"use client"

import { useBuilderStore } from "@/stores/useBuilderStore"
import type { SequenceLength, BatchSize, Optimizer } from "@/stores/useBuilderStore"
import * as ToggleGroup from "@radix-ui/react-toggle-group"
import * as Slider from "@radix-ui/react-slider"
import * as Select from "@radix-ui/react-select"
import { ChevronDown, Check } from "lucide-react"

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium text-[#a3a3a3] uppercase tracking-wider">{children}</label>
}

function SegmentedControl<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={String(value)}
      onValueChange={(v) => { if (v) onChange(v as unknown as T) }}
      className="flex gap-1"
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={String(o.value)}
          value={String(o.value)}
          className="flex-1 px-3 py-2 text-sm text-center rounded-lg border border-[#404040] text-[#a3a3a3] font-mono transition-all outline-none cursor-pointer data-[state=on]:bg-[#06b6d4]/10 data-[state=on]:border-[#06b6d4] data-[state=on]:text-[#06b6d4] hover:bg-[#1a1a1a]"
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}

function QFSlider({
  value,
  onChange,
  min,
  max,
  step,
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
}) {
  return (
    <Slider.Root
      value={[value]}
      onValueChange={([v]) => onChange(v)}
      min={min}
      max={max}
      step={step ?? 1}
      className="relative flex items-center w-full h-5 cursor-pointer"
    >
      <Slider.Track className="relative h-1 flex-1 bg-[#262626] rounded-full">
        <Slider.Range className="absolute h-full bg-[#06b6d4] rounded-full" />
      </Slider.Track>
      <Slider.Thumb className="block w-4 h-4 bg-[#06b6d4] rounded-full shadow-md focus:outline-none focus:ring-2 focus:ring-[#06b6d4]/50 hover:bg-cyan-300 transition-colors" />
    </Slider.Root>
  )
}

function OptimizerSelect({ value, onChange }: { value: Optimizer; onChange: (v: Optimizer) => void }) {
  const opts: Optimizer[] = ["AdamW", "Ranger", "SGD"]
  return (
    <Select.Root value={value} onValueChange={(v) => onChange(v as Optimizer)}>
      <Select.Trigger className="flex items-center justify-between w-full bg-[#262626] border border-[#404040] rounded-lg px-3 py-2.5 text-sm text-[#fafafa] hover:bg-[#2a2a2a] focus:outline-none focus:border-[#06b6d4] transition-colors cursor-pointer">
        <Select.Value />
        <Select.Icon className="text-[#a3a3a3]"><ChevronDown size={14} /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="bg-[#171717] border border-[#404040] rounded-lg shadow-xl z-50 min-w-[var(--radix-select-trigger-width)]" position="popper" sideOffset={4}>
          <Select.Viewport className="p-1">
            {opts.map((o) => (
              <Select.Item key={o} value={o} className="flex items-center justify-between px-3 py-2 text-sm text-[#fafafa] rounded cursor-pointer outline-none data-[highlighted]:bg-[#262626] transition-colors">
                <Select.ItemText>{o}</Select.ItemText>
                <Select.ItemIndicator><Check size={12} className="text-[#06b6d4]" /></Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

export function Step4Hyperparams() {
  const hp = useBuilderStore((s) => s.draftConfig.hyperparameters)
  const updateHyperparameter = useBuilderStore((s) => s.updateHyperparameter)
  const markStepComplete = useBuilderStore((s) => s.markStepComplete)
  const editStep = useBuilderStore((s) => s.editStep)

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        {/* Sequence Length */}
        <div className="flex flex-col gap-2">
          <Label>Sequence / Lookback</Label>
          <SegmentedControl<SequenceLength>
            value={hp.sequenceLength}
            onChange={(v) => updateHyperparameter("sequenceLength", Number(v) as SequenceLength)}
            options={[
              { value: 24, label: "24h" },
              { value: 48, label: "48h" },
              { value: 72, label: "72h" },
            ]}
          />
        </div>

        {/* Batch Size */}
        <div className="flex flex-col gap-2">
          <Label>Batch Size</Label>
          <SegmentedControl<BatchSize>
            value={hp.batchSize}
            onChange={(v) => updateHyperparameter("batchSize", Number(v) as BatchSize)}
            options={[
              { value: 16, label: "16" },
              { value: 32, label: "32" },
              { value: 64, label: "64" },
              { value: 128, label: "128" },
            ]}
          />
        </div>

        {/* Epochs */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label>Epochs</Label>
            <span className="text-xs font-mono text-[#d4d4d4]">{hp.epochs}</span>
          </div>
          <QFSlider
            value={hp.epochs}
            onChange={(v) => updateHyperparameter("epochs", v)}
            min={1}
            max={100}
          />
          <input
            type="number"
            value={hp.epochs}
            onChange={(e) => {
              const v = Math.min(100, Math.max(1, Number(e.target.value)))
              updateHyperparameter("epochs", v)
            }}
            min={1}
            max={100}
            className="bg-[#262626] border border-[#404040] rounded-lg px-3 py-1.5 text-sm font-mono text-[#d4d4d4] focus:outline-none focus:border-[#06b6d4] w-full transition-colors"
          />
        </div>

        {/* Dropout */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label>Dropout Rate</Label>
            <span className="text-xs font-mono text-[#d4d4d4]">{hp.dropoutRate.toFixed(2)}</span>
          </div>
          <QFSlider
            value={hp.dropoutRate}
            onChange={(v) => updateHyperparameter("dropoutRate", v)}
            min={0}
            max={0.5}
            step={0.05}
          />
        </div>

        {/* Learning Rate */}
        <div className="flex flex-col gap-2">
          <Label>Learning Rate</Label>
          <input
            type="number"
            value={hp.learningRate}
            onChange={(e) => {
              const v = Math.min(0.1, Math.max(0.0001, parseFloat(e.target.value) || 0.001))
              updateHyperparameter("learningRate", v)
            }}
            step={0.0001}
            min={0.0001}
            max={0.1}
            className="bg-[#262626] border border-[#404040] rounded-lg px-3 py-2.5 text-sm font-mono text-[#d4d4d4] focus:outline-none focus:border-[#06b6d4] transition-colors"
          />
        </div>

        {/* Optimizer */}
        <div className="flex flex-col gap-2">
          <Label>Optimizer</Label>
          <OptimizerSelect
            value={hp.optimizer}
            onChange={(v) => updateHyperparameter("optimizer", v)}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => editStep(3)}
          className="px-4 py-2.5 bg-[#262626] hover:bg-[#2e2e2e] border border-[#404040] rounded-lg text-sm text-[#a3a3a3] transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={() => markStepComplete(4)}
          className="flex-1 px-4 py-2.5 bg-[#06b6d4] hover:bg-[#0891b2] text-[#0a0a0a] font-semibold rounded-lg text-sm transition-colors"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}
