/**
 * Price source definitions for all lending assets across Zest V1, V2, and Granite.
 *
 * Each asset maps to a price source:
 *   - 'pyth': fetched from Pyth Hermes API
 *   - 'peg': pegged to another asset (e.g. stablecoins → USDC)
 *   - 'on-chain': derived from on-chain exchange rate × base price
 */

export const PYTH_HERMES_URL = 'https://hermes.pyth.network'

export const PYTH_FEED_IDS = {
  BTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  STX: '0xec7a775f46379b5e943c3526b1c8d54cd49749176b0b98e02dde68d1bd335c17',
  USDC: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
} as const

export type PriceSourceType = 'pyth' | 'peg' | 'on-chain'

export interface PythSource {
  type: 'pyth'
  feedId: string
}

export interface PegSource {
  type: 'peg'
  /** The symbol this asset is pegged to */
  pegTo: string
}

export interface OnChainSource {
  type: 'on-chain'
  /** The base symbol whose price to multiply by the on-chain ratio */
  baseSymbol: string
  /** Contract address for the exchange rate call */
  contractAddress: string
  contractName: string
  functionName: string
  /** Precision divisor for the returned ratio (e.g. 1e6) */
  precision: number
}

export type PriceSource = PythSource | PegSource | OnChainSource

/**
 * Canonical price source for each unique asset symbol (lowercase).
 * Keys match the symbols used in `prices: Record<string, number>` throughout the codebase.
 */
export const PRICE_SOURCES: Record<string, PriceSource> = {
  // --- Pyth-sourced ---
  btc: { type: 'pyth', feedId: PYTH_FEED_IDS.BTC },
  stx: { type: 'pyth', feedId: PYTH_FEED_IDS.STX },
  usdc: { type: 'pyth', feedId: PYTH_FEED_IDS.USDC },

  // --- Pegged to base assets ---
  // sBTC ≈ BTC (1:1 peg via sBTC bridge)
  sbtc: { type: 'peg', pegTo: 'btc' },
  // wSTX ≈ STX (wrapped 1:1)
  wstx: { type: 'peg', pegTo: 'stx' },
  // Stablecoins pegged to USDC
  aeusdc: { type: 'peg', pegTo: 'usdc' },
  usdcx: { type: 'peg', pegTo: 'usdc' },
  usdh: { type: 'peg', pegTo: 'usdc' },
  susdt: { type: 'peg', pegTo: 'usdc' },

  // --- On-chain exchange rate × base price ---
  // stSTX: StackingDAO liquid staking token, ratio from data-core-v2
  ststx: {
    type: 'on-chain',
    baseSymbol: 'stx',
    contractAddress: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG',
    contractName: 'data-core-v2',
    functionName: 'get-stx-per-ststx',
    precision: 1e6,
  },

  // stSTXbtc-v2: StackingDAO BTC-denominated liquid staking token
  'ststxbtc-v2': {
    type: 'on-chain',
    baseSymbol: 'stx',
    contractAddress: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG',
    contractName: 'data-core-v2',
    functionName: 'get-stx-per-ststxbtc',
    precision: 1e6,
  },
  // V2 uses 'ststxbtc' (no -v2 suffix)
  ststxbtc: {
    type: 'on-chain',
    baseSymbol: 'stx',
    contractAddress: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG',
    contractName: 'data-core-v2',
    functionName: 'get-stx-per-ststxbtc',
    precision: 1e6,
  },

  // DIKO: Arkadiko governance token — no reliable on-chain oracle
  // Price must be provided externally or defaults to 0
  diko: { type: 'peg', pegTo: '_diko' },

  // ALEX: ALEX Lab token — no reliable on-chain oracle
  // Price must be provided externally or defaults to 0
  alex: { type: 'peg', pegTo: '_alex' },
}

// ---------------------------------------------------------------------------
// Market registry — maps every market to its asset ref, lender, and assetGroup
// ---------------------------------------------------------------------------

export const STACKS_CHAIN_ID = 'stacks-mainnet'

export interface MarketPriceEntry {
  /** Asset reference used in the marketUid (principal, numeric ID, or market ID) */
  assetRef: string
  /** Lender protocol key */
  lender: string
  /** Price symbol key in PRICE_SOURCES */
  priceSymbol: string
  /** Canonical asset group for cross-lender deduplication */
  assetGroup: string
}

/**
 * Complete registry of all lending markets and their price mappings.
 * Used to build OraclePriceEntry[] and to map marketUid → assetGroup.
 */
export const MARKET_REGISTRY: MarketPriceEntry[] = [
  // --- Zest V1 ---
  { assetRef: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx', lender: 'zest-v1', priceSymbol: 'wstx', assetGroup: 'STX' },
  { assetRef: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token', lender: 'zest-v1', priceSymbol: 'ststx', assetGroup: 'stSTX' },
  { assetRef: 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token', lender: 'zest-v1', priceSymbol: 'sbtc', assetGroup: 'BTC' },
  { assetRef: 'SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc', lender: 'zest-v1', priceSymbol: 'aeusdc', assetGroup: 'USDC' },
  { assetRef: 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token', lender: 'zest-v1', priceSymbol: 'diko', assetGroup: 'DIKO' },
  { assetRef: 'SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1', lender: 'zest-v1', priceSymbol: 'usdh', assetGroup: 'USDH' },
  { assetRef: 'SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt', lender: 'zest-v1', priceSymbol: 'susdt', assetGroup: 'USDT' },
  { assetRef: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2', lender: 'zest-v1', priceSymbol: 'ststxbtc-v2', assetGroup: 'stSTXbtc' },
  { assetRef: 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex', lender: 'zest-v1', priceSymbol: 'alex', assetGroup: 'ALEX' },

  // --- Zest V2 ---
  { assetRef: '0', lender: 'zest-v2', priceSymbol: 'stx', assetGroup: 'STX' },
  { assetRef: '2', lender: 'zest-v2', priceSymbol: 'sbtc', assetGroup: 'BTC' },
  { assetRef: '4', lender: 'zest-v2', priceSymbol: 'ststx', assetGroup: 'stSTX' },
  { assetRef: '6', lender: 'zest-v2', priceSymbol: 'usdc', assetGroup: 'USDC' },
  { assetRef: '8', lender: 'zest-v2', priceSymbol: 'usdh', assetGroup: 'USDH' },
  { assetRef: '10', lender: 'zest-v2', priceSymbol: 'ststxbtc', assetGroup: 'stSTXbtc' },

  // --- Granite borrowable ---
  { assetRef: 'aeusdc', lender: 'granite', priceSymbol: 'aeusdc', assetGroup: 'USDC' },
  { assetRef: 'usdcx', lender: 'granite', priceSymbol: 'usdcx', assetGroup: 'USDC' },

  // --- Granite collateral ---
  { assetRef: 'aeusdc:sbtc', lender: 'granite', priceSymbol: 'sbtc', assetGroup: 'BTC' },
  { assetRef: 'usdcx:sbtc', lender: 'granite', priceSymbol: 'sbtc', assetGroup: 'BTC' },
]

/** Build a marketUid from a registry entry */
export function buildMarketUid(entry: MarketPriceEntry): string {
  return `${STACKS_CHAIN_ID}:${entry.lender}:${entry.assetRef}`
}

/**
 * Map every known marketUid to the price symbol used in PRICE_SOURCES.
 */
export function getMarketUidPriceSymbols(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const entry of MARKET_REGISTRY) {
    map[buildMarketUid(entry)] = entry.priceSymbol
  }
  return map
}

/**
 * Map every known marketUid to its asset group.
 */
export function getMarketUidAssetGroups(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const entry of MARKET_REGISTRY) {
    map[buildMarketUid(entry)] = entry.assetGroup
  }
  return map
}

/**
 * All Pyth feed IDs needed, deduplicated.
 */
export function getRequiredPythFeedIds(): string[] {
  const ids = new Set<string>()
  for (const source of Object.values(PRICE_SOURCES)) {
    if (source.type === 'pyth') ids.add(source.feedId)
  }
  return [...ids]
}

/**
 * All on-chain price sources.
 */
export function getOnChainSources(): Array<{ symbol: string } & OnChainSource> {
  const sources: Array<{ symbol: string } & OnChainSource> = []
  for (const [symbol, source] of Object.entries(PRICE_SOURCES)) {
    if (source.type === 'on-chain') sources.push({ symbol, ...source })
  }
  return sources
}
