import type { StacksCall } from '../../../stacks-call'
import { encodeClarityPrincipal } from '../../../stacks-call'
import { getZestAssets, ZEST_CONTRACTS, ZEST_Z_TOKENS } from '../../public-data/zest-v1/constants'

/**
 * Build read-only calls to fetch user reserve data for Zest V1.
 *
 * Layout:
 *   [0..N)           get-user-reserve-data-read per asset (borrow data + collateral flag)
 *   [N]              get-user-e-mode
 *   [N+1..N+1+M)    z-token get-balance per asset that has a z-token (deposit balances)
 *
 * The z-token balance calls are appended after the reserve + emode calls.
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

  // Z-token balance calls for deposit amounts
  const zTokenCalls: StacksCall[] = []
  for (const asset of assets) {
    const zToken = ZEST_Z_TOKENS[asset]
    if (!zToken) continue
    const [addr, name] = zToken.split('.')
    zTokenCalls.push({
      contractAddress: addr,
      contractName: name,
      functionName: 'get-balance',
      args: [userArg],
    })
  }

  return [...reserveCalls, ...emodeCalls, ...zTokenCalls]
}

export function getExpectedV1UserCallCount(): number {
  const assets = getZestAssets()
  const zTokenCount = assets.filter((a) => ZEST_Z_TOKENS[a]).length
  return assets.length + 1 + zTokenCount
}
