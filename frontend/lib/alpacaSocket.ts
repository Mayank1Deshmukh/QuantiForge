/**
 * Alpaca Markets Free Tier WebSocket singleton.
 *
 * TODO: Alpaca IEX free tier streams 1-minute bars, not 1-hour bars.
 * If you have a subscription that supports 1H bars, change ALPACA_URL to
 * "wss://stream.data.alpaca.markets/v2/sip" and update the subscribe message
 * to include a timeframe param (if the streaming API exposes it). Until then,
 * this implementation accumulates 60 one-minute bars and aggregates to a
 * single hourly OHLCV bar before forwarding to the inference engine.
 * Bars with T="b" from Alpaca contain: S, o, h, l, c, v, t fields.
 */

import { dispatchInferForActiveOverlays } from "./infer"
import type { OHLCVBar } from "./infer"
import { toast } from "sonner"

const ALPACA_URL = "wss://stream.data.alpaca.markets/v2/iex"
const BACKOFF_MS = [2000, 4000, 8000]

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempts = 0
let currentTicker = ""
let currentKey = ""
let currentSecret = ""

// 1-minute bar accumulation buffer for hourly aggregation
interface MinBar { o: number; h: number; l: number; c: number; v: number; t: string }
let minuteBuffer: MinBar[] = []

function aggregateToHour(): OHLCVBar {
  return {
    ticker: currentTicker,
    timestamp: minuteBuffer[minuteBuffer.length - 1].t,
    open: minuteBuffer[0].o,
    high: Math.max(...minuteBuffer.map((b) => b.h)),
    low: Math.min(...minuteBuffer.map((b) => b.l)),
    close: minuteBuffer[minuteBuffer.length - 1].c,
    volume: minuteBuffer.reduce((s, b) => s + b.v, 0),
  }
}

function onOpen() {
  reconnectAttempts = 0
  ws?.send(JSON.stringify({ action: "auth", key: currentKey, secret: currentSecret }))
}

function onMessage(event: MessageEvent) {
  let msgs: any[]
  try {
    const parsed = JSON.parse(event.data)
    msgs = Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return
  }

  for (const msg of msgs) {
    if (msg.T === "success" && msg.msg === "authenticated") {
      // Subscribe to minute bars for the ticker
      ws?.send(JSON.stringify({ action: "subscribe", bars: [currentTicker] }))
      continue
    }
    if (msg.T === "error") {
      toast.error(`Alpaca error: ${msg.msg ?? "Unknown"}`)
      continue
    }
    // Bar event
    if (msg.T === "b" && msg.S === currentTicker) {
      minuteBuffer.push({ o: msg.o, h: msg.h, l: msg.l, c: msg.c, v: msg.v, t: msg.t })

      // Flush when 60 minute bars accumulated OR the bar's minute === 0 (hour boundary)
      const barMinute = new Date(msg.t).getUTCMinutes()
      if (minuteBuffer.length >= 60 || barMinute === 0) {
        if (minuteBuffer.length > 0) {
          dispatchInferForActiveOverlays(aggregateToHour())
          minuteBuffer = []
        }
      }
    }
  }
}

function onClose() {
  ws = null
  scheduleReconnect()
}

function scheduleReconnect() {
  if (reconnectAttempts >= BACKOFF_MS.length) {
    toast.error("Live connection lost. Reload to reconnect.")
    return
  }
  const delay = BACKOFF_MS[reconnectAttempts++]
  toast.warning("Live connection lost. Reconnecting…")
  reconnectTimer = setTimeout(connectWs, delay)
}

function connectWs() {
  if (ws) { ws.onclose = null; ws.close(); ws = null }
  try {
    ws = new WebSocket(ALPACA_URL)
    ws.onopen = onOpen
    ws.onclose = onClose
    ws.onmessage = onMessage
  } catch {
    scheduleReconnect()
  }
}

export function connect(key: string, secret: string, ticker: string): void {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  currentKey = key
  currentSecret = secret
  currentTicker = ticker
  minuteBuffer = []
  reconnectAttempts = 0
  connectWs()
}

export function disconnect(): void {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  reconnectAttempts = BACKOFF_MS.length
  if (ws) { ws.onclose = null; ws.close(); ws = null }
  minuteBuffer = []
}

export const alpacaSocket = { connect, disconnect }
