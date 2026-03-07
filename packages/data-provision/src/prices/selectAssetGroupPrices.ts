/**
 * Flatten structured oracle prices into a single USD price map
 * keyed by asset group (canonical cross-lender identifiers like BTC, STX, USDC).
 *
 * When multiple lenders report a price for the same asset group,
 * the priority config determines which one wins (first-write-wins after sorting).
 */

import type { StructuredOraclePrices, USDPriceMap } from './types'
import { getMarketUidAssetGroups } from './constants'

export interface StacksPriorityConfig {
  /** Lender keys in descending priority (index 0 = highest). */
  lenderPriority: string[]
  /** Lenders that are always lowest priority. */
  lowPriorityLenders: string[]
}

const DEFAULT_PRIORITY: StacksPriorityConfig = {
  lenderPriority: ['zest-v1', 'zest-v2', 'granite'],
  lowPriorityLenders: [],
}

interface PriceCandidate {
  oracleKey: string
  priceUSD: number
  priority: number
}

function computePriority(
  lender: string,
  cfg: StacksPriorityConfig,
): number {
  if (cfg.lowPriorityLenders.some((p) => lender.startsWith(p))) return 2_000_000
  const idx = cfg.lenderPriority.findIndex((p) => lender.startsWith(p))
  return idx >= 0 ? idx : 1000
}

/**
 * Flatten structured oracle prices to a `USDPriceMap` keyed by asset group.
 *
 * Output keys are canonical asset groups (e.g. 'BTC', 'STX', 'USDC', 'stSTX').
 * Also includes entries keyed by marketUid for direct per-market lookup.
 */
export function selectAssetGroupPrices(
  structuredPrices: StructuredOraclePrices,
  priorityCfg: StacksPriorityConfig = DEFAULT_PRIORITY,
): USDPriceMap {
  const assetGroupMap = getMarketUidAssetGroups()
  const candidates: PriceCandidate[] = []

  for (const [_chainId, lenders] of Object.entries(structuredPrices)) {
    for (const [lender, entries] of Object.entries(lenders)) {
      const prio = computePriority(lender, priorityCfg)

      for (const entry of entries) {
        if (entry.priceUSD <= 0) continue
        const oracleKey = assetGroupMap[entry.marketUid] ?? entry.asset
        candidates.push({ oracleKey, priceUSD: entry.priceUSD, priority: prio })
      }
    }
  }

  // Sort by priority (ascending = best first)
  candidates.sort((a, b) => a.priority - b.priority)

  // First-write-wins: highest-priority entry claims each asset group
  const flatPrices: USDPriceMap = {}
  for (const c of candidates) {
    if (!(c.oracleKey in flatPrices)) {
      flatPrices[c.oracleKey] = c.priceUSD
    }
  }

  // Also add marketUid-keyed entries for direct per-market lookup
  for (const [_chainId, lenders] of Object.entries(structuredPrices)) {
    for (const entries of Object.values(lenders)) {
      for (const entry of entries) {
        if (entry.priceUSD > 0) {
          flatPrices[entry.marketUid] = entry.priceUSD
        }
      }
    }
  }

  return flatPrices
}
