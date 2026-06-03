"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { daemonSocket } from "@/lib/daemonSocket"
import { useSystemStore } from "@/stores/useSystemStore"
import { GlobalHeader } from "@/components/layout/GlobalHeader"
import { TabBar } from "@/components/layout/TabBar"
import { TrainingDrawer } from "@/components/layout/TrainingDrawer"
import { Toaster } from "sonner"

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const daemonUrl = useSystemStore((s) => s.daemonUrl)
  const setDefaultTicker = useSystemStore((s) => s.setDefaultTicker)
  const setSimulationSpeed = useSystemStore((s) => s.setSimulationSpeed)
  const setDaemonUrl = useSystemStore((s) => s.setDaemonUrl)
  const daemonStatus = useSystemStore((s) => s.daemonStatus)

  // Hydrate preferences from localStorage on mount
  useEffect(() => {
    const url = localStorage.getItem("qf_daemon_url")
    const ticker = localStorage.getItem("qf_default_ticker")
    const speed = localStorage.getItem("qf_sim_speed")
    if (url) setDaemonUrl(url)
    if (ticker) setDefaultTicker(ticker)
    if (speed) setSimulationSpeed(Number(speed) as 1 | 10 | 30 | 60)
  }, [])

  // Connect daemon WebSocket on mount; reconnect if URL changes
  useEffect(() => {
    daemonSocket.connect(daemonUrl)
    return () => {
      // Don't disconnect on cleanup — the drawer must persist across tab changes.
      // The socket stays alive for the app lifetime.
    }
  }, [daemonUrl])

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <GlobalHeader />
      <TabBar />

      {/* Daemon offline banner */}
      {daemonStatus === "offline" && (
        <div className="bg-[#ef4444]/10 border-b border-[#ef4444]/30 px-4 py-2 text-sm text-[#ef4444] flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#ef4444] shrink-0" />
          Local daemon offline. Run{" "}
          <code className="font-mono bg-[#ef4444]/10 px-1 rounded">
            python daemon.py
          </code>{" "}
          to enable local training and inference.
        </div>
      )}

      <main
        className="flex-1 overflow-auto"
        style={{ paddingBottom: "48px" /* min clearance for minimized drawer */ }}
      >
        {children}
      </main>

      <TrainingDrawer />
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: "#171717",
            border: "1px solid #404040",
            color: "#fafafa",
          },
        }}
      />
    </div>
  )
}
