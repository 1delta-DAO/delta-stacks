/**
 * Prices fetcher — orchestrates Pyth API + on-chain exchange rate calls
 * to produce structured oracle price data for all Stacks lending assets.
 *
 * Flow:
 *   1. Fetch base prices from Pyth Hermes API (BTC, STX, USDC)
 *   2. Resolve peg relationships (sBTC→BTC, aeUSDC→USDC, etc.)
 *   3. Build & execute on-chain exchange rate calls (stSTX ratio, etc.)
 *   4. Derive on-chain asset prices = ratio × base price
 *   5. Emit OraclePriceEntry[] grouped by chainId → lender
 */

import { executeStacksReadCalls } from '../stacks-call'
import {
  PRICE_SOURCES,
  STACKS_CHAIN_ID,
  MARKET_REGISTRY,
  buildMarketUid,
  getRequiredPythFeedIds,
  getMarketUidPriceSymbols,
} from './constants'
import { fetchPythPrices } from './pythFetch'
import { buildOnChainPriceCalls } from './onChainCallBuild'
import { parseOnChainPriceResults } from './onChainCallParse'
import type { OraclePriceEntry, StructuredOraclePrices, USDPriceMap } from './types'

export type { OraclePriceEntry, StructuredOraclePrices, USDPriceMap } from './types'
export type { PythPriceResult } from './pythFetch'
export { PRICE_SOURCES, PYTH_FEED_IDS, STACKS_CHAIN_ID, MARKET_REGISTRY } from './constants'
export { selectAssetGroupPrices, type StacksPriorityConfig } from './selectAssetGroupPrices'

export interface FetchPricesOptions {
  /** Pyth Hermes API URL override */
  hermesUrl?: string
  /** Hiro API URL override for on-chain calls */
  apiUrl?: string
  /** Max concurrent on-chain calls */
  concurrency?: number
  /** Pre-set prices that skip fetching (e.g. from external source for DIKO, ALEX) */
  overrides?: Record<string, number>
}

/**
 * Fetch all lending asset prices and return structured oracle data.
 *
 * Returns `StructuredOraclePrices`: `{ [chainId]: { [lender]: OraclePriceEntry[] } }`
 * matching the template pattern used by EVM oracle fetchers.
 */
export async function fetchOraclePrices(
  options?: FetchPricesOptions,
): Promise<StructuredOraclePrices> {
  // Step 1: Resolve all symbol prices
  const symbolPrices = await resolveSymbolPrices(options)

  // Step 2: Build structured output grouped by chainId → lender
  const lenderEntries: Record<string, OraclePriceEntry[]> = {}

  for (const market of MARKET_REGISTRY) {
    const marketUid = buildMarketUid(market)
    const priceUSD = symbolPrices[market.priceSymbol] ?? 0

    const entry: OraclePriceEntry = {
      asset: market.assetRef,
      price: priceUSD,
      priceUSD,
      marketUid,
    }

    if (!lenderEntries[market.lender]) {
      lenderEntries[market.lender] = []
    }
    lenderEntries[market.lender].push(entry)
  }

  return { [STACKS_CHAIN_ID]: lenderEntries }
}

/**
 * Convenience: fetch prices and return a flat `USDPriceMap` keyed by
 * lowercase symbol + marketUid (backwards-compatible with previous API).
 */
export async function fetchAllPrices(
  options?: FetchPricesOptions,
): Promise<USDPriceMap> {
  const symbolPrices = await resolveSymbolPrices(options)

  // Also add marketUid keys
  const uidMap = getMarketUidPriceSymbols()
  for (const [uid, symbol] of Object.entries(uidMap)) {
    if (symbolPrices[symbol] !== undefined) {
      symbolPrices[uid] = symbolPrices[symbol]
    }
  }

  return symbolPrices
}

// ---------------------------------------------------------------------------
// Internal: resolve all symbol → USD price mappings
// ---------------------------------------------------------------------------

async function resolveSymbolPrices(
  options?: FetchPricesOptions,
): Promise<Record<string, number>> {
  const prices: Record<string, number> = {}

  // Apply overrides first
  if (options?.overrides) {
    for (const [k, v] of Object.entries(options.overrides)) {
      prices[k.toLowerCase()] = v
    }
  }

  // Pyth base prices
  const feedIds = getRequiredPythFeedIds()
  const pythPrices = await fetchPythPrices(feedIds, options?.hermesUrl)

  for (const [symbol, source] of Object.entries(PRICE_SOURCES)) {
    if (source.type === 'pyth') {
      const result = pythPrices.get(source.feedId)
      if (result) prices[symbol] = result.price
    }
  }

  // Resolve pegs
  for (const [symbol, source] of Object.entries(PRICE_SOURCES)) {
    if (source.type === 'peg' && !prices[symbol]) {
      prices[symbol] = prices[source.pegTo] ?? 0
    }
  }

  // On-chain exchange rates
  const { calls, sources } = buildOnChainPriceCalls()
  if (calls.length > 0) {
    const results = await executeStacksReadCalls(calls, {
      apiUrl: options?.apiUrl,
      concurrency: options?.concurrency,
    })
    const onChainPrices = parseOnChainPriceResults(results, sources, prices)
    Object.assign(prices, onChainPrices)
  }

  // Ensure overrides always win
  if (options?.overrides) {
    for (const [k, v] of Object.entries(options.overrides)) {
      prices[k.toLowerCase()] = v
    }
  }

  return prices
}
