/**
 * Delta Vault contract addresses (Stacks Mainnet).
 *
 * The vault is an ERC-4626-style yield vault for USDCx with a constrained
 * allocation layer that deploys idle funds into Granite and Zest V2.
 *
 * Replace VAULT_DEPLOYER with the actual deployer address once deployed.
 */

// TODO: replace with actual deployer address after mainnet deployment
export const VAULT_DEPLOYER = 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H'

export const VAULT_CONTRACTS = {
  vault: `${VAULT_DEPLOYER}.vault-usdcx-v2-prod`,
  adapterGranite: `${VAULT_DEPLOYER}.adapter-granite-usdcx`,
  adapterZestV2: `${VAULT_DEPLOYER}.adapter-zest-v2-usdc`,
  trait: `${VAULT_DEPLOYER}.lending-adapter-trait`,
} as const

/** The underlying asset managed by the vault. */
export const VAULT_UNDERLYING = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx'

/** Split a "deployer.name" string into [address, name] */
export function splitContract(contractId: string): [string, string] {
  const dot = contractId.indexOf('.')
  return [contractId.slice(0, dot), contractId.slice(dot + 1)]
}
