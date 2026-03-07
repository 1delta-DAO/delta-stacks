/**
 * Build on-chain read-only calls for exchange rate lookups.
 *
 * Follows the prepare-call-parse pattern: this module builds StacksCall
 * descriptors that can be batched with executeStacksReadCalls().
 */

import type { StacksCall } from '../stacks-call'
import { getOnChainSources, type OnChainSource } from './constants'

export interface OnChainPriceCall {
  symbol: string
  source: OnChainSource
}

/**
 * Build read-only calls for all on-chain exchange rate sources.
 * Returns both the calls array and the source metadata needed for parsing.
 */
export function buildOnChainPriceCalls(): {
  calls: StacksCall[]
  sources: OnChainPriceCall[]
} {
  const onChainSources = getOnChainSources()
  const calls: StacksCall[] = []
  const sources: OnChainPriceCall[] = []

  // Deduplicate: multiple symbols may share the same contract call
  // (e.g. ststxbtc and ststxbtc-v2 use the same function)
  const seen = new Set<string>()

  for (const source of onChainSources) {
    const callKey = `${source.contractAddress}.${source.contractName}::${source.functionName}`
    if (seen.has(callKey)) {
      // Find the index of the existing call and link this symbol to it
      const existingIdx = sources.findIndex(
        (s) =>
          s.source.contractAddress === source.contractAddress &&
          s.source.contractName === source.contractName &&
          s.source.functionName === source.functionName,
      )
      if (existingIdx !== -1) {
        // We'll handle dedup in parsing — still add to sources for mapping
        sources.push({ symbol: source.symbol, source })
      }
      continue
    }
    seen.add(callKey)

    calls.push({
      contractAddress: source.contractAddress,
      contractName: source.contractName,
      functionName: source.functionName,
      args: [],
    })

    sources.push({ symbol: source.symbol, source })
  }

  return { calls, sources }
}
