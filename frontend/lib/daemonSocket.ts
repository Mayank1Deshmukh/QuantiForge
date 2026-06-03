import { useSystemStore } from "@/stores/useSystemStore"
import { useTrainingStore } from "@/stores/useTrainingStore"
import { useRegistryStore } from "@/stores/useRegistryStore"
import { chartBridge } from "./chartBridge"
import { toast } from "sonner"

let ws: WebSocket | null = null
let reconnectAttempts = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let currentUrl = "ws://localhost:8765"

const BACKOFF_MS = [2000, 4000, 8000]

function onOpen() {
  reconnectAttempts = 0
  ws!.send(
    JSON.stringify({ action: "PING", timestamp: new Date().toISOString() })
  )
}

function onClose() {
  ws = null
  useSystemStore.getState().setDaemonStatus("offline")
  scheduleReconnect()
}

function onMessage(event: MessageEvent) {
  let msg: any
  try {
    msg = JSON.parse(event.data)
  } catch {
    return
  }

  // Handshake response
  if (msg.status === "READY") {
    useSystemStore.getState().setDaemonStatus("online", {
      deviceName: msg.device_name,
      cudaAvailable: msg.cuda_available,
      version: msg.daemon_version,
    })
    return
  }

  switch (msg.event) {
    case "EPOCH_METRIC":
      useTrainingStore.getState().handleEpochMetric(msg)
      useSystemStore.getState().setDaemonStatus("training")
      break
    case "TRAINING_COMPLETE":
      useTrainingStore.getState().handleTrainingComplete(msg)
      useSystemStore.getState().setDaemonStatus("online")
      useRegistryStore.getState().fetchRegistry()
      break
    case "TRAINING_FAILED":
      useTrainingStore.getState().handleTrainingFailed(msg)
      useSystemStore.getState().setDaemonStatus("online")
      break
    case "INFER_RESULT":
      chartBridge.appendInferencePoint(msg)
      break
  }
}

function scheduleReconnect() {
  if (reconnectAttempts >= BACKOFF_MS.length) {
    toast.error("Daemon connection lost. Reload the app to reconnect.")
    return
  }
  const delay = BACKOFF_MS[reconnectAttempts]
  reconnectAttempts++
  toast.warning(`Daemon disconnected. Reconnecting in ${delay / 1000}s…`)
  reconnectTimer = setTimeout(() => connect(currentUrl), delay)
}

export function connect(url: string) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (ws) {
    ws.onclose = null
    ws.close()
    ws = null
  }

  currentUrl = url
  try {
    ws = new WebSocket(`${url}/ws`)
    ws.onopen = onOpen
    ws.onclose = onClose
    ws.onmessage = onMessage
  } catch {
    useSystemStore.getState().setDaemonStatus("offline")
    scheduleReconnect()
  }
}

export function send(payload: object) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload))
  }
}

export function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  reconnectAttempts = BACKOFF_MS.length // prevent further reconnects
  if (ws) {
    ws.onclose = null
    ws.close()
    ws = null
  }
}

export const daemonSocket = { connect, send, disconnect }
