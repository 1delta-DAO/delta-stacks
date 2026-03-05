import { executeStacksReadCalls } from '../stacks-call'
import { buildZestReserveCalls } from './zest-v1/publicCallBuild'
import {
  getZestReservesDataConverter,
  ZestPublicResponse,
} from './zest-v1/publicCallParse'

export type StacksLender = 'zest-v1'

/**
 * Fetch public reserve data for a Stacks-based lending protocol.
 *
 * Follows the same 3-step pattern as the EVM data provision:
 *   1. Build calls (publicCallBuild)
 *   2. Execute batch read-only calls (stacks-call executor)
 *   3. Parse results (publicCallParse)
 */
export async function getStacksLenderPublicData(
  lender: StacksLender,
  prices: Record<string, number> = {},
  options?: {
    apiUrl?: string
    concurrency?: number
  },
): Promise<ZestPublicResponse | undefined> {
  switch (lender) {
    case 'zest-v1': {
      // Step 1: Build the call array
      const calls = buildZestReserveCalls()

      // Step 2: Execute all calls in parallel
      const results = await executeStacksReadCalls(calls, options)

      // Step 3: Parse results into structured data
      const [converter] = getZestReservesDataConverter(prices)
      return converter(results)
    }
    default:
      throw new Error(`Unknown Stacks lender: ${lender}`)
  }
}
