"use client"

import { useBuilderStore } from "@/stores/useBuilderStore"
import { getDaemonHttpUrl } from "@/lib/daemon"
import { AreaChart, Area, ResponsiveContainer } from "recharts"
import { Loader2, RefreshCw } from "lucide-react"
import * as Select from "@radix-ui/react-select"
import { ChevronDown, Check } from "lucide-react"

const TICKERS = ["SPY", "AAPL", "NVDA", "TSLA"]

function TickerSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select.Root value={value} onValueChange={onChange}>
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
            {TICKERS.map((t) => (
              <Select.Item
                key={t}
                value={t}
                className="flex items-center justify-between px-3 py-2 text-sm text-[#fafafa] rounded cursor-pointer outline-none data-[highlighted]:bg-[#262626] transition-colors"
              >
                <Select.ItemText className="font-mono font-semibold">{t}</Select.ItemText>
                <Select.ItemIndicator><Check size={12} className="text-[#06b6d4]" /></Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

export function Step1Ticker() {
  const ticker = useBuilderStore((s) => s.draftConfig.ticker)
  const previewStatus = useBuilderStore((s) => s.dataPreviewStatus)
  const previewClose = useBuilderStore((s) => s.dataPreviewClose)
  const previewError = useBuilderStore((s) => s.dataPreviewError)
  const updateDraftConfig = useBuilderStore((s) => s.updateDraftConfig)
  const setDataPreviewStatus = useBuilderStore((s) => s.setDataPreviewStatus)
  const markStepComplete = useBuilderStore((s) => s.markStepComplete)

  const handleFetch = async () => {
    setDataPreviewStatus("loading")
    try {
      const res = await fetch(`${getDaemonHttpUrl()}/api/data-preview?ticker=${ticker}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setDataPreviewStatus("success", undefined, data.preview_close ?? [])
    } catch (e) {
      setDataPreviewStatus("error", (e as Error).message)
    }
  }

  const chartData = previewClose.map((v) => ({ v }))
  const canContinue = previewStatus === "success"

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-[#a3a3a3] uppercase tracking-wider">Ticker</label>
        <TickerSelect
          value={ticker}
          onChange={(v) => {
            updateDraftConfig({ ticker: v })
            setDataPreviewStatus("idle")
          }}
        />
        <p className="text-xs text-[#a3a3a3]">
          Date range: most recent 2 years of hourly data (fixed for MVP).
        </p>
      </div>

      {/* Preview area */}
      <div className="rounded-lg border border-[#404040] overflow-hidden bg-[#0d0d0d]" style={{ minHeight: "140px" }}>
        {previewStatus === "idle" && (
          <div className="flex items-center justify-center h-[140px] text-sm text-[#404040]">
            Fetch data to see a preview
          </div>
        )}
        {previewStatus === "loading" && (
          <div className="flex items-center justify-center gap-2 h-[140px] text-sm text-[#a3a3a3]">
            <Loader2 size={16} className="animate-spin" />
            Fetching {ticker} data…
          </div>
        )}
        {previewStatus === "error" && (
          <div className="flex flex-col items-center justify-center gap-2 h-[140px] text-sm">
            <span className="text-[#ef4444]">Data unavailable for {ticker}.</span>
            <span className="text-xs text-[#a3a3a3]">{previewError}</span>
            <button
              onClick={handleFetch}
              className="flex items-center gap-1 text-xs text-[#06b6d4] hover:text-cyan-300 transition-colors"
            >
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        )}
        {previewStatus === "success" && chartData.length > 0 && (
          <div className="p-2">
            <div className="text-[10px] text-[#a3a3a3] font-mono mb-1 px-1">
              {ticker} · Last {chartData.length} hourly bars · Close
            </div>
            <ResponsiveContainer width="100%" height={110}>
              <AreaChart data={chartData} margin={{ top: 2, right: 4, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#06b6d4"
                  strokeWidth={1.5}
                  fill="url(#spark-fill)"
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleFetch}
          disabled={previewStatus === "loading"}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#262626] hover:bg-[#2e2e2e] border border-[#404040] rounded-lg text-sm text-[#fafafa] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {previewStatus === "loading" ? <Loader2 size={14} className="animate-spin" /> : null}
          Fetch &amp; Preview
        </button>
        <button
          onClick={() => markStepComplete(1)}
          disabled={!canContinue}
          className="flex-1 px-4 py-2.5 bg-[#06b6d4] hover:bg-[#0891b2] text-[#0a0a0a] font-semibold rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}
