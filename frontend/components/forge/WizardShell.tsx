"use client"

import React from "react"
import { useBuilderStore, type DraftConfig } from "@/stores/useBuilderStore"
import { CheckCircle2, Lock, Pencil } from "lucide-react"
import { Step1Ticker } from "./steps/Step1Ticker"
import { Step2Denoiser } from "./steps/Step2Denoiser"
import { Step3Backbone } from "./steps/Step3Backbone"
import { Step4Hyperparams } from "./steps/Step4Hyperparams"
import { Step5Compute } from "./steps/Step5Compute"
import { Step6Review } from "./steps/Step6Review"

const STEPS = [
  { n: 1, label: "Data Source" },
  { n: 2, label: "Denoiser" },
  { n: 3, label: "Backbone" },
  { n: 4, label: "Hyperparams" },
  { n: 5, label: "Compute" },
  { n: 6, label: "Review" },
] as const

function stepSummary(step: number, config: DraftConfig, previewStatus: string): string {
  const hp = config.hyperparameters
  switch (step) {
    case 1: return previewStatus === "success" ? `${config.ticker} · 2yr · Hourly` : `${config.ticker}`
    case 2: return `${config.denoiser} Denoising`
    case 3: return config.backbone
    case 4: return `${hp.sequenceLength}h · ${hp.epochs} epochs · ${hp.optimizer}`
    case 5: return config.computeTarget === "local" ? "Local Daemon" : "RunPod Serverless"
    default: return ""
  }
}

function StepContent({ step }: { step: number }) {
  switch (step) {
    case 1: return <Step1Ticker />
    case 2: return <Step2Denoiser />
    case 3: return <Step3Backbone />
    case 4: return <Step4Hyperparams />
    case 5: return <Step5Compute />
    case 6: return <Step6Review />
    default: return null
  }
}

function StepIndicatorStrip({
  currentStep,
  completedSteps,
}: {
  currentStep: number
  completedSteps: Set<number>
}) {
  return (
    <div className="flex items-start gap-1 mb-8">
      {STEPS.map((s, i) => {
        const done = completedSteps.has(s.n)
        const active = currentStep === s.n
        return (
          <React.Fragment key={s.n}>
            <div className="flex flex-col items-center gap-1.5" style={{ minWidth: "60px" }}>
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all ${
                  done
                    ? "bg-[#06b6d4] text-[#0a0a0a]"
                    : active
                    ? "bg-[#171717] border-2 border-[#06b6d4] text-[#06b6d4]"
                    : "bg-[#1a1a1a] border border-[#404040] text-[#404040]"
                }`}
              >
                {done ? <CheckCircle2 size={13} /> : s.n}
              </div>
              <span
                className={`text-[9px] text-center leading-tight transition-colors ${
                  active ? "text-[#fafafa]" : done ? "text-[#06b6d4]" : "text-[#404040]"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="flex-1 h-px mt-3.5 transition-colors"
                style={{ backgroundColor: done ? "#06b6d4" : "#262626" }}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export function WizardShell() {
  const currentStep = useBuilderStore((s) => s.currentStep)
  const completedSteps = useBuilderStore((s) => s.completedSteps)
  const draftConfig = useBuilderStore((s) => s.draftConfig)
  const previewStatus = useBuilderStore((s) => s.dataPreviewStatus)
  const editStep = useBuilderStore((s) => s.editStep)

  return (
    <div className="flex flex-col">
      <StepIndicatorStrip currentStep={currentStep} completedSteps={completedSteps} />

      <div className="flex flex-col gap-2">
        {STEPS.map((s) => {
          const done = completedSteps.has(s.n)
          const active = currentStep === s.n
          const locked = s.n > currentStep

          if (done) {
            // Collapsed completed card
            return (
              <div
                key={s.n}
                className="flex items-center justify-between px-4 py-3 rounded-lg border border-[#2a2a2a] bg-[#171717] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={14} className="text-[#06b6d4] shrink-0" />
                  <div>
                    <span className="text-xs text-[#a3a3a3] mr-2">{s.label}</span>
                    <span className="text-xs font-mono text-[#d4d4d4]">
                      {stepSummary(s.n, draftConfig, previewStatus)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => editStep(s.n)}
                  className="flex items-center gap-1 text-xs text-[#a3a3a3] hover:text-[#06b6d4] transition-colors"
                >
                  <Pencil size={11} />
                  Edit
                </button>
              </div>
            )
          }

          if (active) {
            // Expanded active card
            return (
              <div
                key={s.n}
                className="rounded-xl border border-[#404040] bg-[#0d0d0d] overflow-hidden shadow-lg"
              >
                <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-[#262626]">
                  <div className="w-6 h-6 rounded-full bg-[#06b6d4] flex items-center justify-center text-[#0a0a0a] text-xs font-bold shrink-0">
                    {s.n}
                  </div>
                  <span className="text-sm font-semibold text-[#fafafa]">
                    {[
                      "Ticker & Data Selection",
                      "Denoising Pipeline",
                      "Architecture Backbone",
                      "Hyperparameter Configuration",
                      "Compute Target",
                      "Review & Submit",
                    ][s.n - 1]}
                  </span>
                </div>
                <div className="px-4 py-4">
                  <StepContent step={s.n} />
                </div>
              </div>
            )
          }

          // Locked placeholder
          return (
            <div
              key={s.n}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[#1e1e1e] opacity-40"
            >
              <Lock size={12} className="text-[#404040] shrink-0" />
              <span className="text-xs text-[#404040]">
                Step {s.n} — {s.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
