import type { LenderYieldComplete } from './types'

/**
 * Get the display price for a market (general price).
 * Falls back to oracle price, then 0.
 */
export function getDisplayPrice(meta: LenderYieldComplete): number {
  return meta?.price?.priceUsd ?? meta?.price?.oraclePrice ?? 0
}

/**
 * Get the oracle price for risk calculations.
 * Falls back to display price, then 0.
 */
export function getOraclePrice(meta: LenderYieldComplete): number {
  return meta?.price?.oraclePrice ?? meta?.price?.priceUsd ?? 0
}
