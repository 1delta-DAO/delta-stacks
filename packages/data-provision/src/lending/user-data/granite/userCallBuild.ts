import type { StacksCall } from '../../../stacks-call'
import { encodeClarityPrincipal } from '../../../stacks-call'
import {
  GRANITE_MARKETS,
  GRANITE_COLLATERAL_TOKENS,
  GRANITE_CONTRACT_NAMES,
} from '../../public-data/granite/constants'

/**
 * Build read-only calls to fetch user data for Granite protocol.
 *
 * Per market (aeusdc, usdcx):
 *   [0] get-user-position(user)           → { debt-shares, last-updated-at }
 *   [1] get-user-collateral(user, token)  → collateral amount per token
 *   [2] get-borrow-repay-params(user)     → current debt accounting
 *
 * Total: 2 markets × 3 calls = 6 calls
 */
export function buildGraniteUserCalls(account: string): StacksCall[] {
  const userArg = encodeClarityPrincipal(account)
  const calls: StacksCall[] = []

  for (const market of GRANITE_MARKETS) {
    const [stateAddr, stateName] = market.state.split('.')

    // get-user-position
    calls.push({
      contractAddress: stateAddr,
      contractName: stateName,
      functionName: 'get-user-position',
      args: [userArg],
    })

    // get-user-collateral for each collateral token
    const collaterals = GRANITE_COLLATERAL_TOKENS[market.id] ?? []
    for (const collateral of collaterals) {
      calls.push({
        contractAddress: stateAddr,
        contractName: stateName,
        functionName: 'get-user-collateral',
        args: [userArg, encodeClarityPrincipal(collateral)],
      })
    }

    // get-borrow-repay-params
    calls.push({
      contractAddress: stateAddr,
      contractName: stateName,
      functionName: 'get-borrow-repay-params',
      args: [userArg],
    })
  }

  return calls
}

/** Number of calls per market: position + collateral(s) + borrow-params */
export function getCallsPerMarket(marketId: string): number {
  const collateralCount = (GRANITE_COLLATERAL_TOKENS[marketId] ?? []).length
  return 2 + collateralCount // position + collateral(s) + borrow-params
}

export function getExpectedGraniteUserCallCount(): number {
  return GRANITE_MARKETS.reduce((sum, m) => sum + getCallsPerMarket(m.id), 0)
}
