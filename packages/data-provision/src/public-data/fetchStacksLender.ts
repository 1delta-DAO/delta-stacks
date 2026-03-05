import { StacksCall, executeStacksReadCalls } from '../stacks-call'
import { buildZestReserveCalls } from './zest-v1/publicCallBuild'
import {
  getZestReservesDataConverter,
  ZestPublicResponse,
} from './zest-v1/publicCallParse'
import { buildZestV2ReserveCalls } from './zest-v2/publicCallBuild'
import {
  getZestV2ReservesDataConverter,
  ZestV2PublicResponse,
} from './zest-v2/publicCallParse'
import { parseAggregatorResult } from './zest-v2/aggregatorParse'

export type StacksLender = 'zest-v1' | 'zest-v2'

export interface StacksLenderOptions {
  apiUrl?: string
  concurrency?: number
  /**
   * For zest-v2: use the deployed aggregator contract (1 call instead of 60).
   * Requires zest-v2-reader to be deployed on-chain.
   * Provide the full deployer address, e.g. "SP123...".
   */
  aggregatorAddress?: string
}

/**
 * Fetch public reserve data for a Stacks-based lending protocol.
 *
 * Follows the same 3-step pattern as the EVM data provision:
 *   1. Build calls (publicCallBuild)
 *   2. Execute batch read-only calls (stacks-call executor)
 *   3. Parse results (publicCallParse)
 */
export async function getStacksLenderPublicData(
  lender: 'zest-v1',
  prices?: Record<string, number>,
  options?: StacksLenderOptions,
): Promise<ZestPublicResponse | undefined>
export async function getStacksLenderPublicData(
  lender: 'zest-v2',
  prices?: Record<string, number>,
  options?: StacksLenderOptions,
): Promise<ZestV2PublicResponse | undefined>
export async function getStacksLenderPublicData(
  lender: StacksLender,
  prices?: Record<string, number>,
  options?: StacksLenderOptions,
): Promise<ZestPublicResponse | ZestV2PublicResponse | undefined>
export async function getStacksLenderPublicData(
  lender: StacksLender,
  prices: Record<string, number> = {},
  options?: StacksLenderOptions,
): Promise<ZestPublicResponse | ZestV2PublicResponse | undefined> {
  switch (lender) {
    case 'zest-v1': {
      const calls = buildZestReserveCalls()
      const results = await executeStacksReadCalls(calls, options)
      const [converter] = getZestReservesDataConverter(prices)
      return converter(results)
    }
    case 'zest-v2': {
      // If aggregator contract is deployed, use single-call path
      if (options?.aggregatorAddress) {
        return fetchZestV2ViaAggregator(
          options.aggregatorAddress,
          prices,
          options,
        )
      }
      // Otherwise, use individual calls
      const calls = buildZestV2ReserveCalls()
      const results = await executeStacksReadCalls(calls, options)
      const [converter] = getZestV2ReservesDataConverter(prices)
      return converter(results)
    }
    default:
      throw new Error(`Unknown Stacks lender: ${lender}`)
  }
}

async function fetchZestV2ViaAggregator(
  aggregatorAddress: string,
  prices: Record<string, number>,
  options?: StacksLenderOptions,
): Promise<ZestV2PublicResponse | undefined> {
  const call: StacksCall = {
    contractAddress: aggregatorAddress,
    contractName: 'zest-v2-reader',
    functionName: 'get-all-reserve-data',
    args: [],
  }

  const [result] = await executeStacksReadCalls([call], options)
  return parseAggregatorResult(result, prices)
}
