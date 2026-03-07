/**
 * Parse on-chain exchange rate call results.
 *
 * Each result is a uint representing a ratio (e.g. STX per stSTX)
 * divided by the source's precision to get a decimal multiplier.
 */

import type { StacksCallResult } from '../stacks-call'
import { decodeClarityValue, extractUint } from '../stacks-call'
import type { OnChainPriceCall } from './onChainCallBuild'

/**
 * Parse on-chain exchange rate results and combine with base prices
 * to produce final USD prices.
 *
 * @param results - raw call results from executeStacksReadCalls
 * @param sources - the source metadata from buildOnChainPriceCalls
 * @param basePrices - already-resolved base prices (e.g. { stx: 1.23 })
 * @returns map of symbol → USD price
 */
export function parseOnChainPriceResults(
  results: StacksCallResult[],
  sources: OnChainPriceCall[],
  basePrices: Record<string, number>,
): Record<string, number> {
  const prices: Record<string, number> = {}

  // Track which contract call each source maps to.
  // Sources that share the same call (deduped in build) get the same result.
  const callKeyToResultIdx = new Map<string, number>()
  let resultIdx = 0

  for (const source of sources) {
    const callKey = `${source.source.contractAddress}.${source.source.contractName}::${source.source.functionName}`

    if (!callKeyToResultIdx.has(callKey)) {
      callKeyToResultIdx.set(callKey, resultIdx++)
    }

    const idx = callKeyToResultIdx.get(callKey)!
    const result = results[idx]
    if (!result?.okay) continue

    try {
      const decoded = decodeClarityValue(result.result)
      const rawRatio = extractUint(decoded)
      const ratio = Number(rawRatio) / source.source.precision
      const basePrice = basePrices[source.source.baseSymbol] ?? 0
      prices[source.symbol] = ratio * basePrice
    } catch {
      // Failed to parse — leave price unset (will default to 0)
    }
  }

  return prices
}
