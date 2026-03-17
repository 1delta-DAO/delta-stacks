import { AllLendingData, VaultSnapshot } from "@delta-stacks/data-provision";
import { VaultAllocConfig } from "./types";
import { REBALANCE_THRESHOLD } from "./const";

/** Fraction of the bookkeeping allocation retained in the source market on recall.
 *  LP tokens appreciate over time, so the bookkeeping amount may exceed what can
 *  actually be withdrawn. Keeping 5% back ensures ft-burn never underflows. */
const RECALL_SAFETY_BPS = 500n  // 5%

/**
 * Decide whether to rebalance and return the amounts to move, or null to skip.
 * Strategy: move ALL funds to the higher-APR market when the APR delta exceeds
 * REBALANCE_THRESHOLD. The reallocate function is zero-sum so from1+from2 = to1+to2.
 */
export function computeRebalance(
  cfg: VaultAllocConfig,
  snapshot: VaultSnapshot,
  lending: AllLendingData,
  force = false,
): {
  fromMarket1: bigint; fromMarket2: bigint
  toMarket1: bigint;   toMarket2: bigint
  apr1: number; apr2: number
} | null {
  const alloc1 = BigInt(snapshot.allocMarket1)
  const alloc2 = BigInt(snapshot.allocMarket2)
  const total  = alloc1 + alloc2

  if (total === 0n) return null   // nothing deployed

  const apr1 = cfg.getMarket1Apr(lending)
  const apr2 = cfg.getMarket2Apr(lending)

  if (apr1 === undefined || apr2 === undefined) return null  // no APR data

  const delta = Math.abs(apr1 - apr2)
  if (!force && delta < REBALANCE_THRESHOLD) return null  // difference too small

  if (apr1 > apr2) {
    // Move all market-2 funds to market-1
    if (alloc2 < cfg.dustThreshold) return null
    const amount = alloc2 * (10000n - RECALL_SAFETY_BPS) / 10000n
    return { fromMarket1: 0n, fromMarket2: amount, toMarket1: amount, toMarket2: 0n, apr1, apr2 }
  } else {
    // Move all market-1 funds to market-2
    if (alloc1 < cfg.dustThreshold) return null
    const amount = alloc1 * (10000n - RECALL_SAFETY_BPS) / 10000n
    return { fromMarket1: amount, fromMarket2: 0n, toMarket1: 0n, toMarket2: amount, apr1, apr2 }
  }
}
