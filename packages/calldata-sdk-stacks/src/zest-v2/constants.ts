export const ZEST_V2_DEPLOYER = 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7'

export const ZEST_V2_CONTRACTS = {
  market: `${ZEST_V2_DEPLOYER}.v0-4-market`,
  marketVault: `${ZEST_V2_DEPLOYER}.v0-market-vault`,
  assets: `${ZEST_V2_DEPLOYER}.v0-assets`,
  egroup: `${ZEST_V2_DEPLOYER}.v0-egroup`,
  data: `${ZEST_V2_DEPLOYER}.v0-1-data`,
  // Individual vaults
  vaultStx: `${ZEST_V2_DEPLOYER}.v0-vault-stx`,
  vaultSbtc: `${ZEST_V2_DEPLOYER}.v0-vault-sbtc`,
  vaultStstx: `${ZEST_V2_DEPLOYER}.v0-vault-ststx`,
  vaultUsdc: `${ZEST_V2_DEPLOYER}.v0-vault-usdc`,
  vaultUsdh: `${ZEST_V2_DEPLOYER}.v0-vault-usdh`,
  vaultStstxbtc: `${ZEST_V2_DEPLOYER}.v0-vault-ststxbtc`,
} as const

/** Map from underlying asset ID to the vault contract principal */
export const ZEST_V2_VAULT_FOR_ASSET: Record<number, string> = {
  0: ZEST_V2_CONTRACTS.vaultStx,
  2: ZEST_V2_CONTRACTS.vaultSbtc,
  4: ZEST_V2_CONTRACTS.vaultStstx,
  6: ZEST_V2_CONTRACTS.vaultUsdc,
  8: ZEST_V2_CONTRACTS.vaultUsdh,
  10: ZEST_V2_CONTRACTS.vaultStstxbtc,
}

/**
 * Map from vault contract principal to the underlying SIP-010 token principal.
 *
 * The Zest V2 market contract expects the UNDERLYING token as the `ft` trait
 * reference for supply, borrow, and repay operations.
 * The assets registry indexes by underlying token address.
 */
export const ZEST_V2_VAULT_TO_UNDERLYING: Record<string, string> = {
  [ZEST_V2_CONTRACTS.vaultStx]: `${ZEST_V2_DEPLOYER}.wstx`,
  [ZEST_V2_CONTRACTS.vaultSbtc]: 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token',
  [ZEST_V2_CONTRACTS.vaultStstx]: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token',
  [ZEST_V2_CONTRACTS.vaultUsdc]: 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx',
  [ZEST_V2_CONTRACTS.vaultUsdh]: 'SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1',
  [ZEST_V2_CONTRACTS.vaultStstxbtc]: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2',
}

/** Map from vault contract principal to the Pyth feed keys needed to price that asset */
export const ZEST_V2_VAULT_FEED_KEYS: Record<string, readonly string[]> = {
  [ZEST_V2_CONTRACTS.vaultStx]: ['STX'],
  [ZEST_V2_CONTRACTS.vaultSbtc]: ['BTC'],
  [ZEST_V2_CONTRACTS.vaultStstx]: ['STX'],
  [ZEST_V2_CONTRACTS.vaultUsdc]: ['USDC'],
  [ZEST_V2_CONTRACTS.vaultUsdh]: ['USDC'],
  [ZEST_V2_CONTRACTS.vaultStstxbtc]: ['STX', 'BTC'],
}

/** All vault contract principals (used to resolve all market price feeds at once) */
export const ZEST_V2_ALL_VAULTS = Object.keys(ZEST_V2_VAULT_FEED_KEYS)

/** Split a "deployer.name" string into [address, name] */
export function splitContract(contractId: string): [string, string] {
  const dot = contractId.indexOf('.')
  return [contractId.slice(0, dot), contractId.slice(dot + 1)]
}
