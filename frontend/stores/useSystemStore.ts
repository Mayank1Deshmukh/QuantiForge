"use client"

import { create } from "zustand"

export type DaemonStatus = "offline" | "online" | "training"
export type SimSpeed = 1 | 10 | 30 | 60

interface SystemState {
  daemonStatus: DaemonStatus
  daemonDeviceName: string | null
  cudaAvailable: boolean
  daemonVersion: string | null

  defaultTicker: string
  simulationSpeed: SimSpeed
  daemonUrl: string

  isLiveModeActive: boolean
  isSimulationActive: boolean

  setDaemonStatus: (
    status: DaemonStatus,
    meta?: {
      deviceName?: string
      cudaAvailable?: boolean
      version?: string
    }
  ) => void
  setLiveMode: (active: boolean) => void
  setSimulationMode: (active: boolean) => void
  setSimulationSpeed: (speed: SimSpeed) => void
  setDaemonUrl: (url: string) => void
  setDefaultTicker: (ticker: string) => void
}

export const useSystemStore = create<SystemState>()((set) => ({
  daemonStatus: "offline",
  daemonDeviceName: null,
  cudaAvailable: false,
  daemonVersion: null,

  defaultTicker: "SPY",
  simulationSpeed: 10,
  daemonUrl: "ws://localhost:8765",

  isLiveModeActive: false,
  isSimulationActive: false,

  setDaemonStatus: (status, meta) =>
    set({
      daemonStatus: status,
      ...(meta?.deviceName !== undefined && { daemonDeviceName: meta.deviceName }),
      ...(meta?.cudaAvailable !== undefined && { cudaAvailable: meta.cudaAvailable }),
      ...(meta?.version !== undefined && { daemonVersion: meta.version }),
    }),

  setLiveMode: (active) => set({ isLiveModeActive: active }),
  setSimulationMode: (active) => set({ isSimulationActive: active }),
  setSimulationSpeed: (speed) => set({ simulationSpeed: speed }),
  setDaemonUrl: (url) => set({ daemonUrl: url }),
  setDefaultTicker: (ticker) => set({ defaultTicker: ticker }),
}))
