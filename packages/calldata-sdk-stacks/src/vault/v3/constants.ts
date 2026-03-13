/**
 * Delta Vault V3 contract addresses (Stacks Mainnet).
 *
 * V3 features over V2:
 *   - Portable vault (initialize configures asset, name, symbol, decimals)
 *   - Symmetric virtual offset (10^decimals)
 *   - Auto-allocation on deposit (proportional to current lending balances)
 *   - Performance fees (MetaMorpho-style share dilution)
 *   - Zero-sum rebalancing (reallocate)
 *   - Recall from markets to idle
 *   - Dust threshold (allocations <= 100 units treated as zero)
 *   - Bookkeeping-based total-assets (donation-attack immune)
 */

export const VAULT_V3_DEPLOYER = 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H'

export const VAULT_V3_CONTRACTS = {
  vault: `${VAULT_V3_DEPLOYER}.vault-usdcx-v3`,
  adapterGranite: `${VAULT_V3_DEPLOYER}.adapter-granite-usdcx-v3`,
  adapterZestV2: `${VAULT_V3_DEPLOYER}.adapter-zest-v2-usdc-v3`,
  trait: `${VAULT_V3_DEPLOYER}.lending-adapter-trait`,
} as const

/** The underlying asset managed by the vault. */
export const VAULT_V3_UNDERLYING = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx'

/** Split a "deployer.name" string into [address, name] */
export function splitContract(contractId: string): [string, string] {
  const dot = contractId.indexOf('.')
  return [contractId.slice(0, dot), contractId.slice(dot + 1)]
}
