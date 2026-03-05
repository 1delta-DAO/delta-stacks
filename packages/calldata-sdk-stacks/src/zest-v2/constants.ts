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

/** Split a "deployer.name" string into [address, name] */
export function splitContract(contractId: string): [string, string] {
  const dot = contractId.indexOf('.')
  return [contractId.slice(0, dot), contractId.slice(dot + 1)]
}
