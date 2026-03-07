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
 *   0: get-interest-rate (vault)          — current borrow interest rate (BPS)
 *   1: get-utilization (vault)            — current utilization ratio (BPS)
 *   2: get-fee-reserve (vault)            — protocol reserve fee (BPS)
 *   3: get-total-supply (vault)           — total z-token supply (shares)
 *   4: get-debt (vault)                   — total borrowed amount
 *   5: get-available-assets (vault)       — available to borrow
 */
export const ASSET_REGISTRY_CALLS_PER_ASSET = 3
export const VAULT_CALLS_PER_UNDERLYING = 6
/** Number of egroup resolve calls (one per underlying's z-token) */
export const EGROUP_CALLS = ZEST_V2_UNDERLYING_IDS.length

/**
 * Build the ordered call array for fetching all Zest V2 reserve data.
 *
 * Call layout:
 *   Section 1: [0, N_underlying * 3)                    — asset registry calls
 *   Section 2: [N_underlying * 3, N_underlying * 9)     — vault calls (6 per underlying)
 *   Section 3: [N_underlying * 9, N_underlying * 9 + N_all)  — all asset statuses
 *   Section 4: [N_underlying * 9 + N_all, ... + N_underlying) — egroup resolve per z-token
 *
 * Where N_underlying = 6, N_all = 12
 */
export function buildZestV2ReserveCalls(): StacksCall[] {
  const { assets, market, egroup } = ZEST_V2_CONTRACTS

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
        functionName: 'get-interest-rate',
        args: [],
      },
      {
        contractAddress: vault.address,
        contractName: vault.name,
        functionName: 'get-utilization',
        args: [],
      },
      {
        contractAddress: vault.address,
        contractName: vault.name,
        functionName: 'get-fee-reserve',
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
        functionName: 'get-debt',
        args: [],
      },
      {
        contractAddress: vault.address,
        contractName: vault.name,
        functionName: 'get-available-assets',
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

  // Section 4: Egroup resolve for each underlying's z-token
  // resolve(mask) where mask = 2^zTokenId, zTokenId = underlyingId + 1
  const egroupCalls: StacksCall[] = ZEST_V2_UNDERLYING_IDS.map((aid) => ({
    contractAddress: egroup.address,
    contractName: egroup.name,
    functionName: 'resolve',
    args: [encodeClarityUint(BigInt(1) << BigInt(aid + 1))],
  }))

  return [...assetRegistryCalls, ...vaultCalls, ...allStatusCalls, ...egroupCalls]
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
    nAll +
    EGROUP_CALLS
  )
}
