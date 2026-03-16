/**
 * Delta sBTC Vault V3 contract addresses (Stacks Mainnet).
 *
 * Markets: Zest V1 (sBTC, Aave-like pool) + Zest V2 (sBTC, ERC-4626 vault).
 * No Granite market for sBTC.
 *
 * sBTC is a standard SIP-010 token — no wrapping step required.
 */

export const VAULT_SBTC_DEPLOYER = 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H'

export const VAULT_SBTC_CONTRACTS = {
  vault: `${VAULT_SBTC_DEPLOYER}.vault-sbtc-v3`,
  adapterZestV1: `${VAULT_SBTC_DEPLOYER}.adapter-zest-v1-sbtc-v3`,
  adapterZestV2: `${VAULT_SBTC_DEPLOYER}.adapter-zest-v2-sbtc-v3`,
  trait: `${VAULT_SBTC_DEPLOYER}.lending-adapter-trait`,
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
