import { defineConfig } from "vitest/config"
import { resolve } from "path"

export default defineConfig({
  test: {
    // Pure Zustand store tests — no DOM needed
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    // Silence Next.js "use client" / "use server" directive warnings
    server: {
      deps: {
        inline: ["zustand"],
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./"),
    },
  },
})
