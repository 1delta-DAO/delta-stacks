import { executeStacksReadCalls } from '../stacks-call'
import { buildZestReserveCalls } from './zest-v1/publicCallBuild'
import {
  getZestReservesDataConverter,
  ZestPublicResponse,
} from './zest-v1/publicCallParse'
import { buildV1ReaderCalls } from './zest-v1/readerCallBuild'
import { parseV1ReaderResults } from './zest-v1/readerCallParse'
import { buildZestV2ReserveCalls } from './zest-v2/publicCallBuild'
import {
  getZestV2ReservesDataConverter,
  ZestV2PublicResponse,
} from './zest-v2/publicCallParse'
import { buildV2ReaderCalls } from './zest-v2/readerCallBuild'
import { parseV2ReaderResults } from './zest-v2/readerCallParse'
import { buildGraniteReserveCalls } from './granite/publicCallBuild'
import {
  getGraniteReservesDataConverter,
  GranitePublicResponse,
} from './granite/publicCallParse'
import { buildGraniteReaderCalls } from './granite/readerCallBuild'
import { parseGraniteReaderResults } from './granite/readerCallParse'

export type StacksLender = 'zest-v1' | 'zest-v2' | 'granite'

/** Deployed lending-reader-v1 contract address on mainnet */
export const READER_CONTRACT_ADDRESS = 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H'
export const READER_CONTRACT_NAME = 'lending-reader-v1'

export interface StacksLenderOptions {
  apiUrl?: string
  concurrency?: number
  /**
   * Controls how data is fetched:
   * - `undefined` (default): uses the deployed reader contract per-asset helpers
   *   (11 calls for V1, 6 for V2, 2 for Granite instead of 39+60+18)
   * - `false`: forces individual calls directly to each protocol's contracts
   * - `string`: uses a custom reader contract deployer address
   */
  aggregatorAddress?: string | false
}

export interface AllLendingData {
  v1: ZestPublicResponse | undefined
  v2: ZestV2PublicResponse | undefined
  granite: GranitePublicResponse | undefined
}

/**
 * Fetch public reserve data for a Stacks-based lending protocol.
 *
 * By default uses the deployed lending-reader-v1 contract which bundles
 * multiple sub-calls per asset into single read-only calls:
 *   - V1: 11 calls (9 assets + 2 emode) instead of 39
 *   - V2: 6 calls (6 vaults) instead of 60
 *   - Granite: 2 calls (2 markets) instead of 18
 *
 * Set `aggregatorAddress: false` to use individual calls directly.
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
  const useReader = options?.aggregatorAddress !== false
  const readerAddr = typeof options?.aggregatorAddress === 'string'
    ? options.aggregatorAddress
    : useReader ? READER_CONTRACT_ADDRESS : undefined

  switch (lender) {
    case 'zest-v1': {
      if (readerAddr) {
        const calls = buildV1ReaderCalls(readerAddr)
        const results = await executeStacksReadCalls(calls, options)
        const parsed = parseV1ReaderResults(results, prices)
        if (parsed) return parsed
        // Fall through to individual calls on parse failure
      }
      const calls = buildZestReserveCalls()
      const results = await executeStacksReadCalls(calls, options)
      const [converter] = getZestReservesDataConverter(prices)
      return converter(results)
    }
    case 'zest-v2': {
      if (readerAddr) {
        const calls = buildV2ReaderCalls(readerAddr)
        const results = await executeStacksReadCalls(calls, options)
        const parsed = parseV2ReaderResults(results, prices)
        if (parsed) return parsed
      }
      const calls = buildZestV2ReserveCalls()
      const results = await executeStacksReadCalls(calls, options)
      const [converter] = getZestV2ReservesDataConverter(prices)
      return converter(results)
    }
    case 'granite': {
      if (readerAddr) {
        const calls = buildGraniteReaderCalls(readerAddr)
        const results = await executeStacksReadCalls(calls, options)
        const parsed = parseGraniteReaderResults(results, prices)
        if (parsed) return parsed
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

/**
 * Fetch all lending protocol data via the reader contract.
 * Fires all per-asset reader calls in parallel (19 total instead of 117).
 * Falls back to individual calls per-protocol on reader failure.
 */
export async function getAllLendingData(
  prices: Record<string, number> = {},
  options?: StacksLenderOptions,
): Promise<AllLendingData> {
  const readerAddr = typeof options?.aggregatorAddress === 'string'
    ? options.aggregatorAddress
    : READER_CONTRACT_ADDRESS

  // Build all reader calls and fire them in parallel
  const v1Calls = buildV1ReaderCalls(readerAddr)
  const v2Calls = buildV2ReaderCalls(readerAddr)
  const graniteCalls = buildGraniteReaderCalls(readerAddr)

  const allCalls = [...v1Calls, ...v2Calls, ...graniteCalls]
  const allResults = await executeStacksReadCalls(allCalls, options)

  // Split results back by protocol
  const v1Results = allResults.slice(0, v1Calls.length)
  const v2Results = allResults.slice(v1Calls.length, v1Calls.length + v2Calls.length)
  const graniteResults = allResults.slice(v1Calls.length + v2Calls.length)

  let v1 = parseV1ReaderResults(v1Results, prices)
  let v2 = parseV2ReaderResults(v2Results, prices)
  let granite = parseGraniteReaderResults(graniteResults, prices)

  // Fallback to individual calls for any that failed
  if (!v1) {
    v1 = await getStacksLenderPublicData('zest-v1', prices, { ...options, aggregatorAddress: false })
  }
  if (!v2) {
    v2 = await getStacksLenderPublicData('zest-v2', prices, { ...options, aggregatorAddress: false })
  }
  if (!granite) {
    granite = await getStacksLenderPublicData('granite', prices, { ...options, aggregatorAddress: false })
  }

  return { v1, v2, granite }
}
