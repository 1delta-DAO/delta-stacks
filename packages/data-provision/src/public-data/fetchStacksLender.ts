import { StacksCall, executeStacksReadCalls } from '../stacks-call'
import { buildZestReserveCalls } from './zest-v1/publicCallBuild'
import {
  getZestReservesDataConverter,
  ZestPublicResponse,
} from './zest-v1/publicCallParse'
import { parseV1AggregatorResult } from './zest-v1/aggregatorParse'
import { buildZestV2ReserveCalls } from './zest-v2/publicCallBuild'
import {
  getZestV2ReservesDataConverter,
  ZestV2PublicResponse,
} from './zest-v2/publicCallParse'
import { parseAggregatorResult } from './zest-v2/aggregatorParse'
import { buildGraniteReserveCalls } from './granite/publicCallBuild'
import {
  getGraniteReservesDataConverter,
  GranitePublicResponse,
} from './granite/publicCallParse'
import { parseGraniteAggregatorResult } from './granite/aggregatorParse'

export type StacksLender = 'zest-v1' | 'zest-v2' | 'granite'

export interface StacksLenderOptions {
  apiUrl?: string
  concurrency?: number
  /**
   * Use the deployed aggregator contract (1 call instead of many).
   * Requires the reader contract to be deployed on-chain.
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
 *
 * When `aggregatorAddress` is provided, uses a single on-chain call
 * to the reader contract instead of N individual calls.
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
  lender: 'granite',
  prices?: Record<string, number>,
  options?: StacksLenderOptions,
): Promise<GranitePublicResponse | undefined>
export async function getStacksLenderPublicData(
  lender: StacksLender,
  prices?: Record<string, number>,
  options?: StacksLenderOptions,
): Promise<ZestPublicResponse | ZestV2PublicResponse | GranitePublicResponse | undefined>
export async function getStacksLenderPublicData(
  lender: StacksLender,
  prices: Record<string, number> = {},
  options?: StacksLenderOptions,
): Promise<ZestPublicResponse | ZestV2PublicResponse | GranitePublicResponse | undefined> {
  switch (lender) {
    case 'zest-v1': {
      if (options?.aggregatorAddress) {
        return fetchZestV1ViaAggregator(
          options.aggregatorAddress,
          prices,
          options,
        )
      }
      const calls = buildZestReserveCalls()
      const results = await executeStacksReadCalls(calls, options)
      const [converter] = getZestReservesDataConverter(prices)
      return converter(results)
    }
    case 'zest-v2': {
      if (options?.aggregatorAddress) {
        return fetchZestV2ViaAggregator(
          options.aggregatorAddress,
          prices,
          options,
        )
      }
      const calls = buildZestV2ReserveCalls()
      const results = await executeStacksReadCalls(calls, options)
      const [converter] = getZestV2ReservesDataConverter(prices)
      return converter(results)
    }
    case 'granite': {
      if (options?.aggregatorAddress) {
        return fetchGraniteViaAggregator(
          options.aggregatorAddress,
          prices,
          options,
        )
      }
      const calls = buildGraniteReserveCalls()
      const results = await executeStacksReadCalls(calls, options)
      const [converter] = getGraniteReservesDataConverter(prices)
      return converter(results)
    }
    default:
      throw new Error(`Unknown Stacks lender: ${lender}`)
  }
}

async function fetchZestV1ViaAggregator(
  aggregatorAddress: string,
  prices: Record<string, number>,
  options?: StacksLenderOptions,
): Promise<ZestPublicResponse | undefined> {
  const call: StacksCall = {
    contractAddress: aggregatorAddress,
    contractName: 'zest-reader',
    functionName: 'get-v1-reserve-data',
    args: [],
  }

  const [result] = await executeStacksReadCalls([call], options)
  return parseV1AggregatorResult(result, prices)
}

async function fetchZestV2ViaAggregator(
  aggregatorAddress: string,
  prices: Record<string, number>,
  options?: StacksLenderOptions,
): Promise<ZestV2PublicResponse | undefined> {
  const call: StacksCall = {
    contractAddress: aggregatorAddress,
    contractName: 'zest-reader',
    functionName: 'get-v2-reserve-data',
    args: [],
  }

  const [result] = await executeStacksReadCalls([call], options)
  return parseAggregatorResult(result, prices)
}

async function fetchGraniteViaAggregator(
  aggregatorAddress: string,
  prices: Record<string, number>,
  options?: StacksLenderOptions,
): Promise<GranitePublicResponse | undefined> {
  const call: StacksCall = {
    contractAddress: aggregatorAddress,
    contractName: 'zest-reader',
    functionName: 'get-granite-reserve-data',
    args: [],
  }

  const [result] = await executeStacksReadCalls([call], options)
  return parseGraniteAggregatorResult(result, prices)
}
