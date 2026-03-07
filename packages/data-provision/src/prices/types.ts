/**
 * Oracle price types — matching the structure from the EVM template
 * but adapted for Stacks lending protocols.
 */

/** Oracle price data for a single asset */
export interface OraclePriceEntry {
  /** Asset identifier (contract principal for V1, numeric ID for V2, market ID for Granite) */
  asset: string
  /** Raw oracle price (e.g. exchange rate for derived assets, or direct USD price) */
  price: number
  /** USD price of the asset */
  priceUSD: number
  /** Unique market identifier (chainId:protocol:ref) */
  marketUid: string
  /** Override lender key for output grouping */
  targetLender?: string
}

/**
 * Structured oracle price data: chainId → lender → price entries
 */
export type StructuredOraclePrices = {
  [chainId: string]: {
    [lender: string]: OraclePriceEntry[]
  }
}

/** Flat USD price map for lookups, keyed by assetGroup or marketUid */
export type USDPriceMap = {
  [assetKey: string]: number
}
