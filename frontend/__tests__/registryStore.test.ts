/**
 * Tests for useRegistryStore.
 *
 * Critical invariant: assignColor() cycles the four-color theme palette safely.
 *   - Each new runId gets the next unused palette color.
 *   - When all four colors are used the cycle wraps: color 5 → palette[0].
 *   - Calling assignColor() with the same runId always returns the same color.
 */

import { describe, it, expect, beforeEach } from "vitest"
import { useRegistryStore } from "../stores/useRegistryStore"

const CHART_COLORS = ["#06b6d4", "#d946ef", "#84cc16", "#f59e0b"]

// Reset color assignments before each test
beforeEach(() => {
  useRegistryStore.setState({ colorAssignments: {} })
})

// ---------------------------------------------------------------------------
// First assignment
// ---------------------------------------------------------------------------

describe("assignColor — first color", () => {
  it("assigns the first palette color to the first runId", () => {
    const color = useRegistryStore.getState().assignColor("run-a")
    expect(color).toBe(CHART_COLORS[0])
  })
})

// ---------------------------------------------------------------------------
// Sequential assignments use distinct palette colors
// ---------------------------------------------------------------------------

describe("assignColor — sequential distinct colors", () => {
  it("assigns all four palette colors to four different runIds", () => {
    const colors = ["run-1", "run-2", "run-3", "run-4"].map((id) =>
      useRegistryStore.getState().assignColor(id)
    )
    expect(colors).toEqual(CHART_COLORS)
  })

  it("each color in a four-run assignment is unique", () => {
    const colors = ["r1", "r2", "r3", "r4"].map((id) =>
      useRegistryStore.getState().assignColor(id)
    )
    const unique = new Set(colors)
    expect(unique.size).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// Palette cycles when exhausted
// ---------------------------------------------------------------------------

describe("assignColor — palette cycling", () => {
  it("wraps back to palette[0] on the 5th assignment", () => {
    ;["a", "b", "c", "d"].forEach((id) =>
      useRegistryStore.getState().assignColor(id)
    )
    // 5th assignment: all 4 colors used → wrap to index 0
    const fifth = useRegistryStore.getState().assignColor("e")
    expect(fifth).toBe(CHART_COLORS[0])
  })

  it("wraps back to palette[1] on the 6th assignment", () => {
    ;["a", "b", "c", "d", "e"].forEach((id) =>
      useRegistryStore.getState().assignColor(id)
    )
    const sixth = useRegistryStore.getState().assignColor("f")
    expect(sixth).toBe(CHART_COLORS[1])
  })
})

// ---------------------------------------------------------------------------
// Idempotency — same runId always returns the same color
// ---------------------------------------------------------------------------

describe("assignColor — idempotency", () => {
  it("returns the same color for the same runId called twice", () => {
    const first  = useRegistryStore.getState().assignColor("stable-id")
    const second = useRegistryStore.getState().assignColor("stable-id")
    expect(first).toBe(second)
  })

  it("does not consume a second palette slot for a repeated runId", () => {
    useRegistryStore.getState().assignColor("x")
    useRegistryStore.getState().assignColor("x") // repeated call — should not advance index
    const next = useRegistryStore.getState().assignColor("y")
    expect(next).toBe(CHART_COLORS[1]) // slot 2, not slot 3
  })
})

// ---------------------------------------------------------------------------
// colorAssignments state is persisted
// ---------------------------------------------------------------------------

describe("assignColor — state persistence", () => {
  it("records the assignment in colorAssignments", () => {
    useRegistryStore.getState().assignColor("test-run")
    const { colorAssignments } = useRegistryStore.getState()
    expect(colorAssignments["test-run"]).toBe(CHART_COLORS[0])
  })

  it("accumulates multiple assignments in colorAssignments", () => {
    useRegistryStore.getState().assignColor("r1")
    useRegistryStore.getState().assignColor("r2")
    const { colorAssignments } = useRegistryStore.getState()
    expect(Object.keys(colorAssignments)).toHaveLength(2)
    expect(colorAssignments["r1"]).toBe(CHART_COLORS[0])
    expect(colorAssignments["r2"]).toBe(CHART_COLORS[1])
  })
})
