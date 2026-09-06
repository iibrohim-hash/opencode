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
