import { describe, expect, test } from "bun:test"
import { selectProvider } from "../src/routes/zen/util/selectProvider"

const baseZenData = {
  providers: {
    "provider-a": { format: "openai" as const },
    "provider-b": { format: "openai" as const },
  },
} as any

const baseModelInfo = {
  providers: [
    { id: "provider-a", model: "model-a", weight: 1, priority: 1 },
    { id: "provider-b", model: "model-b", weight: 1, priority: 1 },
  ],
}

const t = (key: string) => key

describe("selectProvider", () => {
  test("picks a provider from the available list", () => {
    const result = selectProvider({
      reqModel: "model-a",
      zenData: baseZenData,
      authInfo: undefined,
      modelInfo: baseModelInfo,
      stickyId: "session-123",
      trialProviders: undefined,
      retry: { excludeProviders: [], retryCount: 0 },
      stickyProviderId: undefined,
      modelTpmLimits: undefined,
      modelTpsLimits: undefined,
      providerBudget: undefined,
      t,
    })

    expect(["provider-a", "provider-b"]).toContain(result.id)
  })

  test("excludes providers listed in retry.excludeProviders", () => {
    const result = selectProvider({
      reqModel: "model-a",
      zenData: baseZenData,
      authInfo: undefined,
      modelInfo: baseModelInfo,
      stickyId: "session-123",
      trialProviders: undefined,
      retry: { excludeProviders: ["provider-a"], retryCount: 0 },
      stickyProviderId: undefined,
      modelTpmLimits: undefined,
      modelTpsLimits: undefined,
      providerBudget: undefined,
      t,
    })

    expect(result.id).toBe("provider-b")
  })

  test("respects sticky provider when set and eligible", () => {
    const result = selectProvider({
      reqModel: "model-a",
      zenData: baseZenData,
      authInfo: undefined,
      modelInfo: baseModelInfo,
      stickyId: "session-123",
      trialProviders: undefined,
      retry: { excludeProviders: [], retryCount: 0 },
      stickyProviderId: "provider-b",
      modelTpmLimits: undefined,
      modelTpsLimits: undefined,
      providerBudget: undefined,
      t,
    })

    expect(result.id).toBe("provider-b")
  })

  test("throws ModelError when no provider is available", () => {
    expect(() =>
      selectProvider({
        reqModel: "model-a",
        zenData: baseZenData,
        authInfo: undefined,
        modelInfo: { providers: [] },
        stickyId: "session-123",
        trialProviders: undefined,
        retry: { excludeProviders: [], retryCount: 0 },
        stickyProviderId: undefined,
        modelTpmLimits: undefined,
        modelTpsLimits: undefined,
        providerBudget: undefined,
        t,
      }),
    ).toThrow()
  })
})

  test("uses BYOK provider when authInfo has credentials", () => {
    const result = selectProvider({
      reqModel: "model-a",
      zenData: baseZenData,
      authInfo: { provider: { credentials: "sk-123" } },
      modelInfo: { ...baseModelInfo, byokProvider: "provider-b" },
      stickyId: "session-123",
      trialProviders: undefined,
      retry: { excludeProviders: [], retryCount: 0 },
      stickyProviderId: undefined,
      modelTpmLimits: undefined,
      modelTpsLimits: undefined,
      providerBudget: undefined,
      t,
    })

    expect(result.id).toBe("provider-b")
  })

  test("prioritizes trial providers", () => {
    const modelInfo = {
      providers: [
        { id: "provider-a", model: "model-a", weight: 1, priority: 5 },
        { id: "provider-b", model: "model-b", weight: 1, priority: 5 },
      ],
    }

    const result = selectProvider({
      reqModel: "model-a",
      zenData: baseZenData,
      authInfo: undefined,
      modelInfo,
      stickyId: "session-123",
      trialProviders: ["provider-b"],
      retry: { excludeProviders: [], retryCount: 0 },
      stickyProviderId: undefined,
      modelTpmLimits: undefined,
      modelTpsLimits: undefined,
      providerBudget: undefined,
      t,
    })

    expect(result.id).toBe("provider-b")
  })

  test("filters out providers that fail budget qualification", () => {
    const modelInfo = {
      providers: [
        { id: "provider-a", model: "model-a", weight: 1, priority: 1, budgetPriority: 1 },
        { id: "provider-b", model: "model-b", weight: 1, priority: 1 },
      ],
    }
    const providerBudget = {
      qualify: (id: string) => id !== "provider-a",
      prefer: () => false,
    }

    const result = selectProvider({
      reqModel: "model-a",
      zenData: baseZenData,
      authInfo: undefined,
      modelInfo,
      stickyId: "session-123",
      trialProviders: undefined,
      retry: { excludeProviders: [], retryCount: 0 },
      stickyProviderId: undefined,
      modelTpmLimits: undefined,
      modelTpsLimits: undefined,
      providerBudget,
      t,
    })

    expect(result.id).toBe("provider-b")
  })

  test("filters out providers over their TPM limit", () => {
    const modelInfo = {
      providers: [
        { id: "provider-a", model: "model-a", weight: 1, priority: 1, tpmLimit: 1 },
        { id: "provider-b", model: "model-b", weight: 1, priority: 1 },
      ],
    }
    const modelTpmLimits = { "provider-a/model-a": 2_000_000 }

    const result = selectProvider({
      reqModel: "model-a",
      zenData: baseZenData,
      authInfo: undefined,
      modelInfo,
      stickyId: "session-123",
      trialProviders: undefined,
      retry: { excludeProviders: [], retryCount: 0 },
      stickyProviderId: undefined,
      modelTpmLimits,
      modelTpsLimits: undefined,
      providerBudget: undefined,
      t,
    })

    expect(result.id).toBe("provider-b")
  })

  test("filters out providers with low TPS quality signal", () => {
    const modelInfo = {
      providers: [
        { id: "provider-a", model: "model-a", weight: 1, priority: 1, tpsGoal: "fast" },
        { id: "provider-b", model: "model-b", weight: 1, priority: 1 },
      ],
    }
    const modelTpsLimits = { "provider-a/model-a/fast": { qualify: 1, unqualify: 20 } }

    const result = selectProvider({
      reqModel: "model-a",
      zenData: baseZenData,
      authInfo: undefined,
      modelInfo,
      stickyId: "session-123",
      trialProviders: undefined,
      retry: { excludeProviders: [], retryCount: 0 },
      stickyProviderId: undefined,
      modelTpmLimits: undefined,
      modelTpsLimits,
      providerBudget: undefined,
      t,
    })

    expect(result.id).toBe("provider-b")
  })

  test("prefers sticky provider based on TPS signal over the selected one", () => {
    const modelInfo = {
      providers: [
        { id: "provider-a", model: "model-a", weight: 1, priority: 1, tpsGoal: "fast" },
        { id: "provider-b", model: "model-b", weight: 1, priority: 1 },
      ],
    }
    const modelTpsLimits = { "provider-a/model-a/fast": { qualify: 30, unqualify: 1 } }

    const result = selectProvider({
      reqModel: "model-a",
      zenData: baseZenData,
      authInfo: undefined,
      modelInfo,
      stickyId: "session-123",
      trialProviders: undefined,
      retry: { excludeProviders: ["provider-b"], retryCount: 0 },
      stickyProviderId: "provider-a",
      modelTpmLimits: undefined,
      modelTpsLimits,
      providerBudget: undefined,
      t,
    })

    expect(result.id).toBe("provider-a")
  })
