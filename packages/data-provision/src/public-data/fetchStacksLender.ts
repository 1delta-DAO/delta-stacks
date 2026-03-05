import { executeStacksReadCalls } from '../stacks-call'
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

export type StacksLender = 'zest-v1' | 'zest-v2'

interface StacksLenderOptions {
  apiUrl?: string
  concurrency?: number
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
      const calls = buildZestV2ReserveCalls()
      const results = await executeStacksReadCalls(calls, options)
      const [converter] = getZestV2ReservesDataConverter(prices)
      return converter(results)
    }
    default:
      throw new Error(`Unknown Stacks lender: ${lender}`)
  }
}
