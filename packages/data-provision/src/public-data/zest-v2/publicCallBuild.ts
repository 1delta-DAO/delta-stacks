import { StacksCall } from '../../stacks-call'
import { encodeClarityUint } from '../../stacks-call'
import {
  ZEST_V2_CONTRACTS,
  ZEST_V2_UNDERLYING_IDS,
  ZEST_V2_ALL_ASSET_IDS,
  ZEST_V2_VAULT_FOR_ASSET,
} from './constants'

/**
 * Calls per underlying asset:
 *   0: asset lookup (v0-assets)           — asset config (decimals, oracle, principal)
 *   1: asset status (v0-assets)           — collateral/debt enabled bitmask
 *   2: get-cached-indexes (market)        — borrow index + liquidity index
 *
 * Calls per vault (1 per underlying):
 *   0: get-supply-rate (vault)            — current supply interest rate
 *   1: get-borrow-rate (vault)            — current borrow interest rate
 *   2: get-total-supply (vault)           — total z-token supply (shares)
 *   3: get-total-borrows (vault)          — total borrowed amount
 *   4: get-available-liquidity (vault)    — available to borrow
 */
export const ASSET_REGISTRY_CALLS_PER_ASSET = 3
export const VAULT_CALLS_PER_UNDERLYING = 5

/**
 * Build the ordered call array for fetching all Zest V2 reserve data.
 *
 * Call layout:
 *   Section 1: [0, N_underlying * 3)                    — asset registry calls
 *   Section 2: [N_underlying * 3, N_underlying * 8)     — vault calls (5 per underlying)
 *   Section 3: [N_underlying * 8, N_underlying * 8 + N_all)  — all asset statuses
 *   Section 4: [last]                                    — egroup count / global
 *
 * Where N_underlying = 6, N_all = 12
 */
export function buildZestV2ReserveCalls(): StacksCall[] {
  const { assets, market } = ZEST_V2_CONTRACTS

  // Section 1: Asset registry lookups for underlying assets
  const assetRegistryCalls: StacksCall[] = ZEST_V2_UNDERLYING_IDS.flatMap(
    (aid) => [
      {
        contractAddress: assets.address,
        contractName: assets.name,
        functionName: 'lookup',
        args: [encodeClarityUint(aid)],
      },
      {
        contractAddress: assets.address,
        contractName: assets.name,
        functionName: 'status',
        args: [encodeClarityUint(aid)],
      },
      {
        contractAddress: market.address,
        contractName: market.name,
        functionName: 'get-cached-indexes',
        args: [encodeClarityUint(aid)],
      },
    ],
  )

  // Section 2: Vault calls for each underlying asset
  const vaultCalls: StacksCall[] = ZEST_V2_UNDERLYING_IDS.flatMap((aid) => {
    const vault = ZEST_V2_VAULT_FOR_ASSET[aid]
    return [
      {
        contractAddress: vault.address,
        contractName: vault.name,
        functionName: 'get-supply-rate',
        args: [],
      },
      {
        contractAddress: vault.address,
        contractName: vault.name,
        functionName: 'get-borrow-rate',
        args: [],
      },
      {
        contractAddress: vault.address,
        contractName: vault.name,
        functionName: 'get-total-supply',
        args: [],
      },
      {
        contractAddress: vault.address,
        contractName: vault.name,
        functionName: 'get-total-borrows',
        args: [],
      },
      {
        contractAddress: vault.address,
        contractName: vault.name,
        functionName: 'get-available-liquidity',
        args: [],
      },
    ]
  })

  // Section 3: Status for ALL asset IDs (including z-tokens, since they can be collateral)
  const allStatusCalls: StacksCall[] = ZEST_V2_ALL_ASSET_IDS.map((aid) => ({
    contractAddress: assets.address,
    contractName: assets.name,
    functionName: 'status',
    args: [encodeClarityUint(aid)],
  }))

  return [...assetRegistryCalls, ...vaultCalls, ...allStatusCalls]
}

/**
 * Returns the expected number of call results for validation.
 */
export function getExpectedCallCount(): number {
  const nUnderlying = ZEST_V2_UNDERLYING_IDS.length
  const nAll = ZEST_V2_ALL_ASSET_IDS.length
  return (
    nUnderlying * ASSET_REGISTRY_CALLS_PER_ASSET +
    nUnderlying * VAULT_CALLS_PER_UNDERLYING +
    nAll
  )
}
