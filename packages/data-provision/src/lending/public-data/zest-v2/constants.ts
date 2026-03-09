/**
 * Zest Protocol V2 contract addresses and asset registry (Stacks Mainnet).
 *
 * V2 uses a hub-spoke architecture with market.clar as the central orchestrator,
 * numeric asset IDs (uint), bitmask-based positions, and efficiency groups.
 *
 * Deployer: SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7
 */

export const ZEST_V2_DEPLOYER = 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7'

/** Core contracts */
export const ZEST_V2_CONTRACTS = {
  market: { address: ZEST_V2_DEPLOYER, name: 'v0-4-market' },
  marketVault: { address: ZEST_V2_DEPLOYER, name: 'v0-market-vault' },
  assets: { address: ZEST_V2_DEPLOYER, name: 'v0-assets' },
  egroup: { address: ZEST_V2_DEPLOYER, name: 'v0-egroup' },
  data: { address: ZEST_V2_DEPLOYER, name: 'v0-1-data' },
  // Individual vaults
  vaultStx: { address: ZEST_V2_DEPLOYER, name: 'v0-vault-stx' },
  vaultSbtc: { address: ZEST_V2_DEPLOYER, name: 'v0-vault-sbtc' },
  vaultStstx: { address: ZEST_V2_DEPLOYER, name: 'v0-vault-ststx' },
  vaultUsdc: { address: ZEST_V2_DEPLOYER, name: 'v0-vault-usdc' },
  vaultUsdh: { address: ZEST_V2_DEPLOYER, name: 'v0-vault-usdh' },
  vaultStstxbtc: { address: ZEST_V2_DEPLOYER, name: 'v0-vault-ststxbtc' },
} as const

/**
 * V2 asset ID mapping.
 * Even IDs = underlying asset, odd IDs = z-token (ztoken_id = underlying_id + 1).
 */
export const ZEST_V2_ASSET_IDS = {
  STX: 0,
  zSTX: 1,
  sBTC: 2,
  zsBTC: 3,
  stSTX: 4,
  zstSTX: 5,
  USDC: 6,
  zUSDC: 7,
  USDH: 8,
  zUSDH: 9,
  stSTXbtc: 10,
  zstSTXbtc: 11,
} as const

/** Underlying asset IDs only (even numbers) */
export const ZEST_V2_UNDERLYING_IDS = [0, 2, 4, 6, 8, 10] as const

/** Human-readable symbols keyed by asset ID */
export const ZEST_V2_SYMBOLS: Record<number, string> = {
  0: 'STX',
  1: 'zSTX',
  2: 'sBTC',
  3: 'zsBTC',
  4: 'stSTX',
  5: 'zstSTX',
  6: 'USDC',
  7: 'zUSDC',
  8: 'USDH',
  9: 'zUSDH',
  10: 'stSTXbtc',
  11: 'zstSTXbtc',
}

/** Asset ID → vault contract mapping */
export const ZEST_V2_VAULT_FOR_ASSET: Record<number, { address: string; name: string }> = {
  0: ZEST_V2_CONTRACTS.vaultStx,
  2: ZEST_V2_CONTRACTS.vaultSbtc,
  4: ZEST_V2_CONTRACTS.vaultStstx,
  6: ZEST_V2_CONTRACTS.vaultUsdc,
  8: ZEST_V2_CONTRACTS.vaultUsdh,
  10: ZEST_V2_CONTRACTS.vaultStstxbtc,
}

/**
 * All asset IDs including z-tokens.
 * Z-tokens can be used as collateral (rehypothecation).
 */
export const ZEST_V2_ALL_ASSET_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const

/** Token decimals per underlying asset ID */
export const ZEST_V2_DECIMALS: Record<number, number> = {
  0: 6,   // STX
  2: 8,   // sBTC
  4: 6,   // stSTX
  6: 6,   // USDC (aeUSDC)
  8: 6,   // USDH
  10: 6,  // stSTXbtc
}

/** Oracle price precision: 8 decimals */
export const ORACLE_DECIMALS = 8

/** Known token principals per underlying asset ID (for token list lookup in reader/aggregator) */
export const ZEST_V2_ASSET_PRINCIPALS: Record<number, string> = {
  // 0: STX is native, no contract principal
  2: 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token',
  4: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token',
  6: 'SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc',
  8: 'SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1',
  10: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2',
}
