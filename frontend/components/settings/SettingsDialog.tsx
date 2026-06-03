"use client"

import { useState } from "react"
import { useSystemStore } from "@/stores/useSystemStore"
import { X } from "lucide-react"

function MaskedInput({ label, storageKey }: { label: string; storageKey: string }) {
  const [val, setVal] = useState(
    () => (typeof window !== "undefined" ? localStorage.getItem(storageKey) ?? "" : "")
  )
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-[#a3a3a3]">{label}</label>
      <input
        type="password"
        value={val}
        onChange={(e) => {
          setVal(e.target.value)
          localStorage.setItem(storageKey, e.target.value)
        }}
        placeholder="Enter key…"
        className="bg-[#262626] border border-[#404040] rounded px-3 py-1.5 text-sm font-mono text-[#d4d4d4] placeholder-[#404040] focus:outline-none focus:border-[#06b6d4] transition-colors"
      />
    </div>
  )
}

export function SettingsDialog() {
  const open = useSystemStore((s) => s.isSettingsOpen)
  const setOpen = useSystemStore((s) => s.setSettingsOpen)
  const [pingResult, setPingResult] = useState<string | null>(null)
  const daemonUrl = useSystemStore((s) => s.daemonUrl)
  const setDaemonUrl = useSystemStore((s) => s.setDaemonUrl)
  const setSimulationSpeed = useSystemStore((s) => s.setSimulationSpeed)
  const setDefaultTicker = useSystemStore((s) => s.setDefaultTicker)
  const [localUrl, setLocalUrl] = useState(daemonUrl)

  const testConnection = () => {
    setPingResult("Testing…")
    try {
      const ws = new WebSocket(`${localUrl}/ws`)
      const timeout = setTimeout(() => { ws.close(); setPingResult("Timeout — no response") }, 5000)
      ws.onopen = () => ws.send(JSON.stringify({ action: "PING", timestamp: new Date().toISOString() }))
      ws.onmessage = (e) => {
        clearTimeout(timeout)
        try {
          const msg = JSON.parse(e.data)
          setPingResult(msg.status === "READY" ? `Connected — ${msg.device_name ?? "Device"}` : "Unexpected response")
        } catch { setPingResult("Got response (unreadable)") }
        ws.close()
      }
      ws.onerror = () => { clearTimeout(timeout); setPingResult("Connection refused") }
    } catch { setPingResult("Invalid URL") }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#171717] border border-[#404040] rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#404040]">
          <h2 className="font-semibold text-[#fafafa]">Settings</h2>
          <button onClick={() => setOpen(false)} className="text-[#a3a3a3] hover:text-[#fafafa] transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-6">
          <section>
            <h3 className="text-xs font-semibold text-[#a3a3a3] uppercase tracking-wider mb-3">Alpaca Markets</h3>
            <div className="flex flex-col gap-3">
              <MaskedInput label="API Key" storageKey="qf_alpaca_key" />
              <MaskedInput label="API Secret" storageKey="qf_alpaca_secret" />
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-[#a3a3a3] uppercase tracking-wider mb-3">RunPod</h3>
            <MaskedInput label="API Key" storageKey="qf_runpod_key" />
          </section>

          <section>
            <h3 className="text-xs font-semibold text-[#a3a3a3] uppercase tracking-wider mb-3">Daemon</h3>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-[#a3a3a3]">WebSocket URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={localUrl}
                  onChange={(e) => {
                    setLocalUrl(e.target.value)
                    localStorage.setItem("qf_daemon_url", e.target.value)
                    setDaemonUrl(e.target.value)
                  }}
                  className="flex-1 bg-[#262626] border border-[#404040] rounded px-3 py-1.5 text-sm font-mono text-[#d4d4d4] focus:outline-none focus:border-[#06b6d4] transition-colors"
                />
                <button
                  onClick={testConnection}
                  className="px-3 py-1.5 bg-[#262626] hover:bg-[#404040] border border-[#404040] rounded text-sm text-[#a3a3a3] transition-colors whitespace-nowrap"
                >
                  Test
                </button>
              </div>
              {pingResult && (
                <span className={`text-xs font-mono ${pingResult.startsWith("Connected") ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                  {pingResult}
                </span>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-[#a3a3a3] uppercase tracking-wider mb-3">Preferences</h3>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#a3a3a3]">Default Ticker</label>
                <select
                  defaultValue={typeof window !== "undefined" ? localStorage.getItem("qf_default_ticker") ?? "SPY" : "SPY"}
                  onChange={(e) => {
                    localStorage.setItem("qf_default_ticker", e.target.value)
                    setDefaultTicker(e.target.value)
                  }}
                  className="bg-[#262626] border border-[#404040] rounded px-3 py-1.5 text-sm text-[#d4d4d4] focus:outline-none focus:border-[#06b6d4] transition-colors"
                >
                  {["SPY", "AAPL", "NVDA", "TSLA"].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#a3a3a3]">Simulation Speed</label>
                <div className="flex gap-2">
                  {([1, 10, 30, 60] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => { localStorage.setItem("qf_sim_speed", String(s)); setSimulationSpeed(s) }}
                      className="px-3 py-1 bg-[#262626] hover:bg-[#404040] border border-[#404040] rounded text-sm font-mono text-[#d4d4d4] transition-colors"
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
