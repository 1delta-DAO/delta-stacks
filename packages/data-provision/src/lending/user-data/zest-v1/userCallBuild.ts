import type { StacksCall } from '../../../stacks-call'
import { encodeClarityPrincipal } from '../../../stacks-call'
import { getZestAssets, ZEST_CONTRACTS } from '../../public-data/zest-v1/constants'

/**
 * Build individual read-only calls to fetch user reserve data for Zest V1.
 *
 * Layout:
 *   [0..N) get-user-reserve-data-read per asset (sorted)
 *   [N]    get-user-e-mode
 *
 * Total: N + 1 calls (9 assets + 1 emode = 10)
 */
export function buildZestV1UserCalls(account: string): StacksCall[] {
  const assets = getZestAssets()
  const userArg = encodeClarityPrincipal(account)

  const reserveCalls: StacksCall[] = assets.map((asset) => ({
    contractAddress: ZEST_CONTRACTS.poolReserveData.address,
    contractName: ZEST_CONTRACTS.poolReserveData.name,
    functionName: 'get-user-reserve-data-read',
    args: [userArg, encodeClarityPrincipal(asset)],
  }))

  const emodeCalls: StacksCall[] = [
    {
      contractAddress: ZEST_CONTRACTS.poolReserve.address,
      contractName: ZEST_CONTRACTS.poolReserve.name,
      functionName: 'get-user-e-mode',
      args: [userArg],
    },
  ]

  return [...reserveCalls, ...emodeCalls]
}

export function getExpectedV1UserCallCount(): number {
  return getZestAssets().length + 1
}
