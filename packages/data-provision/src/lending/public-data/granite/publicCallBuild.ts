import { StacksCall } from '../../../stacks-call'
import { encodeClarityPrincipal } from '../../../stacks-call'
import { GRANITE_MARKETS, GRANITE_CONTRACT_NAMES, GRANITE_COLLATERAL_TOKENS } from './constants'

/**
 * Calls per market:
 *   0: get-lp-params           — { total-assets, total-shares }
 *   1: get-debt-params         — { open-interest, total-debt-shares }
 *   2: get-open-interest       — { lp-open-interest, protocol-open-interest, staked-open-interest }
 *   3: get-reserve-balance     — uint (protocol reserves)
 *   4: get-asset-cap           — uint (max deposit cap)
 *   5: is-borrow-enabled       — bool
 *   6: is-deposit-asset-enabled— bool
 *   7: get-ir-params (IR)      — { base-ir, ir-slope-1, ir-slope-2, utilization-kink }
 *   8: get-protocol-reserve-percentage — uint
 */
export const CALLS_PER_MARKET = 9

/** Total collateral config calls across all markets */
export function getCollateralCallCount(): number {
  return GRANITE_MARKETS.reduce(
    (sum, m) => sum + (GRANITE_COLLATERAL_TOKENS[m.id]?.length ?? 0),
    0,
  )
}

/**
 * Build the ordered call array for fetching all Granite market data.
 *
 * Layout:
 *   Section 1: [0..N*CALLS_PER_MARKET) — per-market state calls
 *   Section 2: [N*CALLS_PER_MARKET..)  — collateral config calls per market
 */
export function buildGraniteReserveCalls(): StacksCall[] {
  const marketCalls = GRANITE_MARKETS.flatMap((market) => {
    const state = { contractAddress: market.deployer, contractName: GRANITE_CONTRACT_NAMES.state }
    const ir = { contractAddress: market.deployer, contractName: GRANITE_CONTRACT_NAMES.ir }

    return [
      { ...state, functionName: 'get-lp-params', args: [] },
      { ...state, functionName: 'get-debt-params', args: [] },
      { ...state, functionName: 'get-open-interest', args: [] },
      { ...state, functionName: 'get-reserve-balance', args: [] },
      { ...state, functionName: 'get-asset-cap', args: [] },
      { ...state, functionName: 'is-borrow-enabled', args: [] },
      { ...state, functionName: 'is-deposit-asset-enabled', args: [] },
      { ...ir, functionName: 'get-ir-params', args: [] },
      { ...state, functionName: 'get-protocol-reserve-percentage', args: [] },
    ]
  })

  // Collateral config calls: get-collateral(token) per market per known collateral
  const collateralCalls = GRANITE_MARKETS.flatMap((market) => {
    const tokens = GRANITE_COLLATERAL_TOKENS[market.id] ?? []
    return tokens.map((token) => ({
      contractAddress: market.deployer,
      contractName: GRANITE_CONTRACT_NAMES.state,
      functionName: 'get-collateral',
      args: [encodeClarityPrincipal(token)],
    }))
  })

  return [...marketCalls, ...collateralCalls]
}

export function getExpectedCallCount(): number {
  return GRANITE_MARKETS.length * CALLS_PER_MARKET + getCollateralCallCount()
}
