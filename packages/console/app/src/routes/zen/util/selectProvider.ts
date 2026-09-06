import type { ZenData } from "@opencode-ai/console-core/model.js"
import { ModelError } from "./error"
import { anthropicHelper } from "./provider/anthropic"
import { googleHelper } from "./provider/google"
import { openaiHelper } from "./provider/openai"
import { oaCompatHelper } from "./provider/openai-compatible"

export type RetryOptions = {
  excludeProviders: string[]
  retryCount: number
}

export interface SelectProviderParams {
  reqModel: string
  zenData: Awaited<ReturnType<typeof ZenData.list>>
  authInfo: any
  modelInfo: any
  stickyId: string
  trialProviders: string[] | undefined
  retry: RetryOptions
  stickyProviderId: string | undefined
  modelTpmLimits: Record<string, number> | undefined
  modelTpsLimits: Record<string, { qualify: number; unqualify: number }> | undefined
  providerBudget:
    | {
        qualify: (providerId: string, priority: number) => boolean
        prefer: (providerId: string, priority: number) => boolean
      }
    | undefined
  t: (key: any, params?: Record<string, string | number>) => string
}

export function selectProvider(params: SelectProviderParams) {
  const {
    reqModel,
    zenData,
    authInfo,
    modelInfo,
    stickyId,
    trialProviders,
    retry,
    stickyProviderId,
    modelTpmLimits,
    modelTpsLimits,
    providerBudget,
    t,
  } = params

  const MAX_FAILOVER_RETRIES = 3

  const modelProvider = (() => {
    if (authInfo?.provider?.credentials) {
      return modelInfo.providers.find((provider) => provider.id === modelInfo.byokProvider)
    }

    let allProviders = modelInfo.providers.filter((provider) => !provider.disabled)
    if (trialProviders) {
      allProviders = allProviders.map((provider) => ({
        ...provider,
        priority: trialProviders.includes(provider.id) ? 0 : provider.priority,
      }))
    }

    const fallbackProvider = allProviders.find((provider) => provider.id === modelInfo.fallbackProvider)
    if (retry.retryCount === MAX_FAILOVER_RETRIES) return fallbackProvider

    let topPriority = Infinity
    const providers = allProviders
      .filter((provider) => provider.weight !== 0)
      .filter((provider) => !retry.excludeProviders.includes(provider.id))
      .filter((provider) => {
        if (provider.budgetPriority === undefined) return true
        if (!providerBudget) return true
        return providerBudget.qualify(provider.id, provider.budgetPriority)
      })
      .filter((provider) => {
        if (!provider.tpmLimit) return true
        const usage = modelTpmLimits?.[`${provider.id}/${provider.model}`] ?? 0
        return usage < provider.tpmLimit * 1_000_000
      })
      .filter((provider) => {
        if (!provider.tpsGoal) return true
        const tps = modelTpsLimits?.[`${provider.id}/${provider.model}/${provider.tpsGoal}`] ?? {
          qualify: 0,
          unqualify: 0,
        }
        const isLowTps = tps.qualify + tps.unqualify > 10 && tps.qualify < tps.unqualify
        return !isLowTps
      })
      .map((provider) => {
        topPriority = Math.min(topPriority, provider.priority)
        return provider
      })
      .filter((p) => p.priority <= topPriority)
      .flatMap((provider) => Array<typeof provider>(provider.weight).fill(provider))

    let h = 0
    const l = stickyId.length
    for (let i = l - 4; i < l; i++) {
      h = (h * 31 + stickyId.charCodeAt(i)) | 0
    }
    const index = (h >>> 0) % providers.length
    const provider = providers[index || 0] ?? fallbackProvider

    if (!stickyProviderId) return provider
    const stickProvider = allProviders.find((provider) => provider.id === stickyProviderId)
    if (!stickProvider) return provider

    const preferBudgetProvider =
      provider.budgetPriority !== undefined && providerBudget?.prefer(provider.id, provider.budgetPriority)

    const preferTpsProvider = (() => {
      if (!provider.tpsGoal) return false
      const tps = modelTpsLimits?.[`${provider.id}/${provider.model}/${provider.tpsGoal}`] ?? {
        qualify: 0,
        unqualify: 0,
      }
      return tps.qualify > tps.unqualify * 3
    })()

    if (!preferBudgetProvider && !preferTpsProvider) return stickProvider

    return provider
  })()

  if (!modelProvider) throw new ModelError(t("zen.api.error.noProviderAvailable"))
  if (!(modelProvider.id in zenData.providers))
    throw new ModelError(t("zen.api.error.providerNotSupported", { provider: modelProvider.id }))

  return {
    ...modelProvider,
    ...zenData.providers[modelProvider.id],
    ...(() => {
      const providerProps = zenData.providers[modelProvider.id]
      const format = providerProps.format
      const opts = {
        reqModel,
        providerModel: modelProvider.model,
        adjustCacheUsage: providerProps.adjustCacheUsage,
        workspaceID: authInfo?.workspaceID,
      }
      if (format === "anthropic") return anthropicHelper(opts)
      if (format === "google") return googleHelper(opts)
      if (format === "openai") return openaiHelper(opts)
      return oaCompatHelper(opts)
    })(),
  }
}
