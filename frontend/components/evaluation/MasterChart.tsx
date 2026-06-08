"use client"

import { useEffect, useRef } from "react"
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  Filler,
  Tooltip,
} from "chart.js"
import zoomPlugin from "chartjs-plugin-zoom"
import { chartBridge } from "@/lib/chartBridge"
import { useRegistryStore } from "@/stores/useRegistryStore"
import { getDaemonHttpUrl } from "@/lib/daemon"

Chart.register(LineController, LineElement, PointElement, LinearScale, Filler, Tooltip, zoomPlugin)

function buildTimes(n: number): number[] {
  const now = Date.now()
  const step = 60 * 60 * 1000
  return Array.from({ length: n }, (_, i) => now - (n - 1 - i) * step)
}

export function MasterChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const actualTimesRef = useRef<number[]>([])

  const activeOverlays = useRegistryStore((s) => s.activeChartOverlays)
  const models = useRegistryStore((s) => s.models)
  const arimaResult = useRegistryStore((s) => s.arimaResult)
  const arimaIncluded = useRegistryStore((s) => s.arimaIncluded)
  const evaluationTicker = useRegistryStore((s) => s.evaluationTicker)
  const assignColor = useRegistryStore((s) => s.assignColor)

  // Mount: create Chart.js instance
  useEffect(() => {
    if (!canvasRef.current) return

    const chart = new Chart(canvasRef.current, {
      type: "line",
      data: {
        datasets: [
          {
            label: "Actual Close",
            data: [],
            borderColor: "rgba(255,255,255,0.85)",
            borderWidth: 2,
            backgroundColor: "rgba(255,255,255,0.04)",
            fill: true,
            pointRadius: 0,
            tension: 0,
          } as any,
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        parsing: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#171717",
            borderColor: "#404040",
            borderWidth: 1,
            titleColor: "#a3a3a3",
            bodyColor: "#fafafa",
            bodyFont: { family: "monospace", size: 11 },
            callbacks: {
              label: (ctx: any) =>
                ` ${ctx.dataset.label}: $${Number(ctx.parsed.y).toFixed(2)}`,
            },
          },
          zoom: {
            zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "x" },
            pan: { enabled: true, mode: "x" },
          },
        } as any,
        scales: {
          x: {
            type: "linear",
            grid: { color: "#1a1a1a" },
            border: { color: "#262626" },
            ticks: {
              color: "#404040",
              font: { family: "monospace", size: 10 } as any,
              maxTicksLimit: 8,
              callback: (v) => {
                const d = new Date(Number(v))
                const diffDays = (Date.now() - Number(v)) / (86400 * 1000)
                return diffDays < 2
                  ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  : `${d.toLocaleString("default", { month: "short" })} ${d.getDate()}`
              },
            },
          },
          y: {
            position: "right",
            grid: { color: "#1a1a1a" },
            border: { color: "#262626" },
            ticks: {
              color: "#404040",
              font: { family: "monospace", size: 10 } as any,
              callback: (v) => `$${Number(v).toFixed(0)}`,
            },
          },
        },
      },
    })

    chartRef.current = chart
    chartBridge.setChartInstance(chart)

    return () => {
      chartBridge.setChartInstance(null)
      chart.destroy()
      chartRef.current = null
    }
  }, [])

  // Fetch actual close when ticker changes
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    let cancelled = false

    ;(async () => {
      try {
        const res = await fetch(
          `${getDaemonHttpUrl()}/api/data-preview?ticker=${evaluationTicker}`
        )
        if (!res.ok || cancelled) return
        const json = await res.json()
        const close: number[] = json.preview_close ?? []
        const times = buildTimes(close.length)
        actualTimesRef.current = times
        ;(chart.data.datasets[0] as any).data = close.map((y, i) => ({ x: times[i], y }))
        chart.update("none")
      } catch {
        // daemon offline — leave chart empty
      }
    })()

    return () => {
      cancelled = true
    }
  }, [evaluationTicker])

  // Sync DL model + ARIMA datasets when overlay selection changes
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    let cancelled = false

    const actualDataset = chart.data.datasets[0]
    const next: any[] = [actualDataset]

    // ARIMA
    if (arimaIncluded && arimaResult) {
      const times = actualTimesRef.current
      const n = Math.min(arimaResult.predictions.length, times.length)
      const startIdx = times.length - n
      next.push({
        label: "ARIMA Baseline",
        data: arimaResult.predictions.slice(0, n).map((y, i) => ({
          x: times[startIdx + i],
          y,
        })),
        borderColor: "#64748b",
        borderWidth: 1.5,
        borderDash: [5, 3],
        pointRadius: 0,
        tension: 0,
        fill: false,
      })
    }

    // DL models — preserve existing dataset objects (they hold live inference data)
    for (const runId of activeOverlays) {
      const model = models.find((m) => m.runId === runId)
      if (!model) continue
      const existing = chart.data.datasets.find((d: any) => d.runId === runId)
      if (existing) {
        next.push(existing)
      } else {
        const color = assignColor(runId)
        const dataset: any = {
          label: `${runId.slice(0, 8)} · ${model.backbone}`,
          data: [],
          borderColor: color,
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0,
          fill: false,
          runId,
        }
        next.push(dataset)

        // Backfill with stored test-set predictions — same alignment ARIMA uses
        ;(async () => {
          try {
            const res = await fetch(
              `${getDaemonHttpUrl()}/api/registry/${runId}/predictions`
            )
            if (!res.ok || cancelled) return
            const json = await res.json()
            const predictions: number[] = json.predictions ?? []
            const times = actualTimesRef.current
            if (!predictions.length || !times.length || cancelled) return
            const n = Math.min(predictions.length, times.length)
            const startIdx = times.length - n
            dataset.data = predictions.slice(0, n).map((y: number, i: number) => ({
              x: times[startIdx + i],
              y,
            }))
            // Guard: only update if the dataset is still part of the chart
            if (
              chartRef.current &&
              chartRef.current.data.datasets.includes(dataset)
            ) {
              chartRef.current.update("none")
            }
          } catch {
            // daemon offline or predictions not saved — leave dataset empty
          }
        })()
      }
    }

    chart.data.datasets = next
    chart.update("none")

    return () => {
      cancelled = true
    }
  }, [activeOverlays, arimaIncluded, arimaResult, models, assignColor])

  return (
    <div className="relative w-full h-full bg-[#0a0a0a]">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  )
}
