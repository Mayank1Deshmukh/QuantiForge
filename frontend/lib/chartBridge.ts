import type { Chart } from "chart.js"

export interface InferResultEvent {
  event: "INFER_RESULT"
  run_id: string
  timestamp: string
  predicted_close: number
}

let chartRef: Chart | null = null

function setChartInstance(chart: Chart | null) {
  chartRef = chart
}

function appendInferencePoint(event: InferResultEvent) {
  if (!chartRef) return

  const datasets = chartRef.data.datasets as any[]
  const idx = datasets.findIndex((d: any) => d.runId === event.run_id)
  if (idx === -1) return

  const point = { x: new Date(event.timestamp).getTime(), y: event.predicted_close }
  datasets[idx].data.push(point)

  // Auto-scroll: extend x-axis max if auto-scroll is enabled
  const xScale = (chartRef.options.scales as any)?.x
  if (xScale) {
    xScale.max = point.x
  }

  chartRef.update("none")
}

export const chartBridge = { setChartInstance, appendInferencePoint }
