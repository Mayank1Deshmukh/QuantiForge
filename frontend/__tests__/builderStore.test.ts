/**
 * Tests for useBuilderStore.
 *
 * Critical invariant: editStep(n) resets ALL configuration state for steps > n.
 *   - completedSteps keeps only steps whose number is strictly less than n.
 *   - currentStep becomes n.
 *   - When n === 1, dataPreviewStatus/Error/Close are also cleared.
 */

import { describe, it, expect, beforeEach } from "vitest"
import { useBuilderStore } from "../stores/useBuilderStore"

// Reset wizard state before each test so tests are isolated
beforeEach(() => {
  useBuilderStore.getState().resetWizard()
})

// ---------------------------------------------------------------------------
// editStep — completedSteps pruning
// ---------------------------------------------------------------------------

describe("editStep — completedSteps pruning", () => {
  it("keeps only steps < n after editStep(n)", () => {
    const store = useBuilderStore.getState()

    // Mark steps 1, 2, 3 complete
    store.markStepComplete(1)
    store.markStepComplete(2)
    store.markStepComplete(3)

    // Edit step 2 — should keep only step 1
    useBuilderStore.getState().editStep(2)

    const { completedSteps, currentStep } = useBuilderStore.getState()
    expect(completedSteps.has(1)).toBe(true)
    expect(completedSteps.has(2)).toBe(false)
    expect(completedSteps.has(3)).toBe(false)
    expect(currentStep).toBe(2)
  })

  it("editStep(3) keeps steps 1 and 2", () => {
    const store = useBuilderStore.getState()
    store.markStepComplete(1)
    store.markStepComplete(2)
    store.markStepComplete(3)

    useBuilderStore.getState().editStep(3)

    const { completedSteps, currentStep } = useBuilderStore.getState()
    expect(completedSteps.has(1)).toBe(true)
    expect(completedSteps.has(2)).toBe(true)
    expect(completedSteps.has(3)).toBe(false)
    expect(currentStep).toBe(3)
  })

  it("editStep(1) clears ALL completed steps", () => {
    const store = useBuilderStore.getState()
    store.markStepComplete(1)
    store.markStepComplete(2)
    store.markStepComplete(3)
    store.markStepComplete(4)

    useBuilderStore.getState().editStep(1)

    const { completedSteps, currentStep } = useBuilderStore.getState()
    expect(completedSteps.size).toBe(0)
    expect(currentStep).toBe(1)
  })

  it("editStep on a step beyond completedSteps is a no-op for earlier steps", () => {
    const store = useBuilderStore.getState()
    store.markStepComplete(1)

    useBuilderStore.getState().editStep(4)

    const { completedSteps, currentStep } = useBuilderStore.getState()
    expect(completedSteps.has(1)).toBe(true)
    expect(completedSteps.has(2)).toBe(false)
    expect(currentStep).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// editStep(1) resets dataPreview state
// ---------------------------------------------------------------------------

describe("editStep(1) — dataPreview state reset", () => {
  it("resets dataPreviewStatus to idle", () => {
    const store = useBuilderStore.getState()
    store.setDataPreviewStatus("success", undefined, [100, 101, 102])
    useBuilderStore.getState().editStep(1)

    expect(useBuilderStore.getState().dataPreviewStatus).toBe("idle")
  })

  it("clears dataPreviewError", () => {
    const store = useBuilderStore.getState()
    store.setDataPreviewStatus("error", "Network error")
    useBuilderStore.getState().editStep(1)

    expect(useBuilderStore.getState().dataPreviewError).toBeNull()
  })

  it("clears dataPreviewClose array", () => {
    const store = useBuilderStore.getState()
    store.setDataPreviewStatus("success", undefined, [1, 2, 3, 4, 5])
    useBuilderStore.getState().editStep(1)

    expect(useBuilderStore.getState().dataPreviewClose).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// editStep(n > 1) preserves dataPreview state
// ---------------------------------------------------------------------------

describe("editStep(n > 1) — dataPreview state preserved", () => {
  it("does NOT reset dataPreviewStatus when editing step 2+", () => {
    const store = useBuilderStore.getState()
    store.markStepComplete(1)
    store.setDataPreviewStatus("success", undefined, [100, 101])
    store.markStepComplete(2)
    store.markStepComplete(3)

    useBuilderStore.getState().editStep(2)

    expect(useBuilderStore.getState().dataPreviewStatus).toBe("success")
    expect(useBuilderStore.getState().dataPreviewClose).toEqual([100, 101])
  })
})

// ---------------------------------------------------------------------------
// markStepComplete advances currentStep
// ---------------------------------------------------------------------------

describe("markStepComplete", () => {
  it("advances currentStep to step + 1", () => {
    useBuilderStore.getState().markStepComplete(1)
    expect(useBuilderStore.getState().currentStep).toBe(2)
  })

  it("caps currentStep at 6", () => {
    useBuilderStore.getState().markStepComplete(6)
    expect(useBuilderStore.getState().currentStep).toBe(6)
  })

  it("adds step to completedSteps", () => {
    useBuilderStore.getState().markStepComplete(3)
    expect(useBuilderStore.getState().completedSteps.has(3)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// resetWizard
// ---------------------------------------------------------------------------

describe("resetWizard", () => {
  it("resets all state to initial values", () => {
    const store = useBuilderStore.getState()
    store.markStepComplete(1)
    store.markStepComplete(2)
    store.updateDraftConfig({ ticker: "NVDA" })
    store.resetWizard()

    const s = useBuilderStore.getState()
    expect(s.currentStep).toBe(1)
    expect(s.completedSteps.size).toBe(0)
    expect(s.draftConfig.ticker).toBe("SPY")
    expect(s.dataPreviewStatus).toBe("idle")
    expect(s.pendingRunId).toBeNull()
  })
})
