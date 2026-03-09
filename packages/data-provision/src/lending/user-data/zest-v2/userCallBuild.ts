import type { StacksCall } from '../../../stacks-call'
import { encodeClarityPrincipal, encodeClarityUint } from '../../../stacks-call'
import {
  ZEST_V2_CONTRACTS,
  ZEST_V2_UNDERLYING_IDS,
  ZEST_V2_VAULT_FOR_ASSET,
} from '../../public-data/zest-v2/constants'

/**
 * Build read-only calls to fetch user data for Zest V2.
 *
 * `get-supplies-user` and `get-user-borrows` on v0-1-data exceed the read-only
 * cost budget, so we use per-vault calls instead:
 *
 * Layout:
 *   [0]       v0-market-vault.resolve-safe(account) -> id, mask
 *   [1..6]    vault.get-balance(account) per underlying (6 vaults)
 *   [7..12]   v0-market-vault.get-account-scaled-debt(account, assetId) per underlying
 *
 * Total: 1 + 6 + 6 = 13 calls
 */
export function buildZestV2UserCalls(account: string): StacksCall[] {
  const userArg = encodeClarityPrincipal(account)
  const calls: StacksCall[] = []

  // [0] resolve-safe to get user's position mask and internal ID
  calls.push({
    contractAddress: ZEST_V2_CONTRACTS.marketVault.address,
    contractName: ZEST_V2_CONTRACTS.marketVault.name,
    functionName: 'resolve-safe',
    args: [userArg],
  })

  // [1..6] Per-vault supply balance (z-token shares)
  for (const assetId of ZEST_V2_UNDERLYING_IDS) {
    const vault = ZEST_V2_VAULT_FOR_ASSET[assetId]
    calls.push({
      contractAddress: vault.address,
      contractName: vault.name,
      functionName: 'get-balance',
      args: [userArg],
    })
  }

  // [7..12] Per-asset scaled debt
  for (const assetId of ZEST_V2_UNDERLYING_IDS) {
    calls.push({
      contractAddress: ZEST_V2_CONTRACTS.marketVault.address,
      contractName: ZEST_V2_CONTRACTS.marketVault.name,
      functionName: 'get-account-scaled-debt',
      args: [userArg, encodeClarityUint(assetId)],
    })
  }

  return calls
}

/** 1 resolve + 6 supply + 6 debt = 13 */
export const EXPECTED_V2_USER_CALL_COUNT = 1 + ZEST_V2_UNDERLYING_IDS.length * 2

/**
 * Build a lookup-collateral call to fetch z-token collateral from market-vault.
 * Requires user's internal ID and position mask from resolve-safe.
 *
 * Returns a list of { aid: uint, amount: uint } for each z-token the user
 * has deposited as collateral.
 */
export function buildZestV2CollateralCall(userId: number, userMask: number): StacksCall {
  return {
    contractAddress: ZEST_V2_CONTRACTS.marketVault.address,
    contractName: ZEST_V2_CONTRACTS.marketVault.name,
    functionName: 'lookup-collateral',
    args: [
      encodeClarityUint(userId),
      encodeClarityUint(userMask),
      encodeClarityUint(0xFFFFFFFF), // enabled_mask: check all
    ],
  }
}
