/**
 * Delta sBTC Vault V5 contract addresses (Stacks Mainnet).
 *
 * Markets: Zest V1 (sBTC, Aave-like pool) + Zest V2 (sBTC, ERC-4626 vault).
 * No Granite market for sBTC.
 *
 * V5: Same architecture as STX v5-5.  Withdrawals pull from idle + V2 only.
 * V1 operations via external zest-v1-sbtc-manager.
 */

export const VAULT_SBTC_DEPLOYER = 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H'

export const VAULT_SBTC_CONTRACTS = {
  vault: `${VAULT_SBTC_DEPLOYER}.vault-sbtc-v6`,
  adapterZestV1: `${VAULT_SBTC_DEPLOYER}.adapter-zest-v1-sbtc-thin-v3`,
  adapterZestV2: `${VAULT_SBTC_DEPLOYER}.adapter-zest-v2-sbtc-v5`,
  trait: `${VAULT_SBTC_DEPLOYER}.lending-adapter-trait`,
  zestV1Manager: `${VAULT_SBTC_DEPLOYER}.zest-v1-sbtc-manager`,
} as const

/**
 * The underlying asset managed by the vault (sBTC = SIP-010 Bitcoin-backed token).
 */
export const VAULT_SBTC_UNDERLYING = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token'

/** Split a "deployer.name" string into [address, name] */
export function splitContract(contractId: string): [string, string] {
  const dot = contractId.indexOf('.')
  return [contractId.slice(0, dot), contractId.slice(dot + 1)]
}
