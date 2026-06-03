/** Convert the stored daemon WebSocket URL to an HTTP base URL for REST calls. */
export function getDaemonHttpUrl(): string {
  if (typeof window === "undefined") return "http://localhost:8765"
  const stored = localStorage.getItem("qf_daemon_url") ?? "ws://localhost:8765"
  return stored.replace(/^wss?:\/\//, (m) => (m === "wss://" ? "https://" : "http://"))
}
