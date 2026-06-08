"use client"

import { useRegistryStore } from "@/stores/useRegistryStore"

interface Row {
  id: string
  label: string
  backbone: string
  denoiser: string
  ticker: string
  rmse: number | null
  mae: number | null
  mape: number | null
  da: number | null
}

function Cell({
  value,
  highlight,
}: {
  value: string
  highlight?: "best" | "worst" | "good" | "bad" | null
}) {
  const color =
    highlight === "best"
      ? "text-[#22c55e]"
      : highlight === "worst"
      ? "text-[#ef4444]"
      : highlight === "good"
      ? "text-[#22c55e]"
      : highlight === "bad"
      ? "text-[#ef4444]"
      : "text-[#d4d4d4]"

  return <td className={`py-2 px-3 font-mono text-xs ${color} whitespace-nowrap`}>{value}</td>
}

export function MetricsTable() {
  const models = useRegistryStore((s) => s.models)
  const activeOverlays = useRegistryStore((s) => s.activeChartOverlays)
  const arimaIncluded = useRegistryStore((s) => s.arimaIncluded)
  const arimaResult = useRegistryStore((s) => s.arimaResult)
  const colorAssignments = useRegistryStore((s) => s.colorAssignments)

  const rows: Row[] = []

  if (arimaIncluded && arimaResult) {
    rows.push({
      id: "__arima__",
      label: "ARIMA Baseline",
      backbone: "—",
      denoiser: "—",
      ticker: arimaResult.ticker,
      rmse: arimaResult.metrics.rmse,
      mae: arimaResult.metrics.mae,
      mape: arimaResult.metrics.mape,
      da: arimaResult.metrics.directionalAccuracy,
    })
  }

  for (const runId of activeOverlays) {
    const m = models.find((x) => x.runId === runId)
    if (!m || !m.metrics) continue
    rows.push({
      id: runId,
      label: runId.slice(0, 8),
      backbone: m.backbone,
      denoiser: m.denoiser,
      ticker: m.ticker,
      rmse: m.metrics.rmse,
      mae: m.metrics.mae,
      mape: m.metrics.mape,
      da: m.metrics.directionalAccuracy,
    })
  }

  if (rows.length === 0) return null

  const rmseValues = rows.map((r) => r.rmse).filter((v): v is number => v != null)
  const minRmse = Math.min(...rmseValues)
  const maxRmse = Math.max(...rmseValues)

  return (
    <div className="shrink-0 border-t border-[#404040] overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[#262626]">
            {["Model", "Backbone", "Denoiser", "Ticker", "RMSE", "MAE", "MAPE", "Dir. Accuracy"].map(
              (h) => (
                <th
                  key={h}
                  className="py-1.5 px-3 text-left text-[9px] font-semibold text-[#a3a3a3] uppercase tracking-wider whitespace-nowrap"
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rmseHighlight =
              rmseValues.length > 1
                ? row.rmse === minRmse
                  ? ("best" as const)
                  : row.rmse === maxRmse
                  ? ("worst" as const)
                  : null
                : null

            const daHighlight =
              row.da != null
                ? row.da >= 0.55
                  ? ("good" as const)
                  : row.da <= 0.5
                  ? ("bad" as const)
                  : null
                : null

            const color =
              row.id === "__arima__"
                ? "#64748b"
                : (colorAssignments[row.id] ?? "#06b6d4")

            return (
              <tr key={row.id} className="border-b border-[#1a1a1a] hover:bg-[#111] transition-colors">
                <td className="py-2 px-3 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs font-mono text-[#d4d4d4]">{row.label}</span>
                  </div>
                </td>
                <td className="py-2 px-3 text-xs text-[#a3a3a3] whitespace-nowrap">{row.backbone}</td>
                <td className="py-2 px-3 text-xs text-[#a3a3a3] whitespace-nowrap">{row.denoiser}</td>
                <td className="py-2 px-3 text-xs font-mono text-[#a3a3a3] whitespace-nowrap">{row.ticker}</td>
                <Cell
                  value={row.rmse != null ? row.rmse.toFixed(3) : "—"}
                  highlight={rmseHighlight}
                />
                <Cell value={row.mae != null ? row.mae.toFixed(3) : "—"} />
                <Cell value={row.mape != null ? `${row.mape.toFixed(2)}%` : "—"} />
                <Cell
                  value={row.da != null ? `${(row.da * 100).toFixed(1)}%` : "—"}
                  highlight={daHighlight}
                />
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
