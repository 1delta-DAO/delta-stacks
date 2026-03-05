import { StacksCall } from '../../stacks-call'
import { GRANITE_MARKETS, GRANITE_CONTRACT_NAMES } from './constants'

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

/**
 * Build the ordered call array for fetching all Granite market data.
 *
 * Layout: [0..N*CALLS_PER_MARKET) where N = number of markets (currently 2).
 * The parser depends on this exact ordering.
 */
export function buildGraniteReserveCalls(): StacksCall[] {
  return GRANITE_MARKETS.flatMap((market) => {
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
}

export function getExpectedCallCount(): number {
  return GRANITE_MARKETS.length * CALLS_PER_MARKET
}
