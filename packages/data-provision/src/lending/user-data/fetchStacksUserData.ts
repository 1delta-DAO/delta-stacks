import { executeStacksReadCalls } from '../../stacks-call'
import type { StacksLender, StacksLenderOptions } from '../public-data/fetchStacksLender'
import type { LenderCrossPoolMeta, UserData } from './utils/types'
import { USER_READER_CONTRACT_ADDRESS } from './constants'

// Individual call builders
import { buildZestV1UserCalls } from './zest-v1/userCallBuild'
import { buildZestV2UserCalls, buildZestV2CollateralCall } from './zest-v2/userCallBuild'
import { buildGraniteUserCalls } from './granite/userCallBuild'

// Individual call parsers
import { getZestV1UserDataConverter } from './zest-v1/userCallParse'
import {
  getZestV2UserDataConverter,
  parseV2ResolveSafe,
  parseV2CollateralResult,
  mergeV2Collateral,
} from './zest-v2/userCallParse'
import { getGraniteUserDataConverter } from './granite/userCallParse'

// Reader call builders
import { buildV1UserReaderCalls } from './zest-v1/readerCallBuild'
import { buildV2UserReaderCalls } from './zest-v2/readerCallBuild'
import { buildGraniteUserReaderCalls } from './granite/readerCallBuild'

// Reader call parsers
import { parseV1UserReaderResults } from './zest-v1/readerCallParse'
import { parseV2UserReaderResults } from './zest-v2/readerCallParse'
import { parseGraniteUserReaderResults } from './granite/readerCallParse'

export interface AllUserData {
  v1: UserData | undefined
  v2: UserData | undefined
  granite: UserData | undefined
}

/**
 * Fetch user-specific lending data for a Stacks-based lending protocol.
 *
 * By default uses the deployed user-reader contract which batches
 * all per-asset user calls into single read-only calls (4 total instead of 19).
 *
 * Set `aggregatorAddress: false` to use individual calls directly.
 */
export async function getStacksUserData(
  lender: 'zest-v1',
  account: string,
  metaMap: LenderCrossPoolMeta,
  prices?: Record<string, number>,
  options?: StacksLenderOptions,
): Promise<UserData | undefined>
export async function getStacksUserData(
  lender: 'zest-v2',
  account: string,
  metaMap: LenderCrossPoolMeta,
  prices?: Record<string, number>,
  options?: StacksLenderOptions,
): Promise<UserData | undefined>
export async function getStacksUserData(
  lender: 'granite',
  account: string,
  metaMap: LenderCrossPoolMeta,
  prices?: Record<string, number>,
  options?: StacksLenderOptions,
): Promise<UserData | undefined>
export async function getStacksUserData(
  lender: StacksLender,
  account: string,
  metaMap: LenderCrossPoolMeta,
  prices?: Record<string, number>,
  options?: StacksLenderOptions,
): Promise<UserData | undefined>
export async function getStacksUserData(
  lender: StacksLender,
  account: string,
  metaMap: LenderCrossPoolMeta,
  prices: Record<string, number> = {},
  options?: StacksLenderOptions,
): Promise<UserData | undefined> {
  const useReader = options?.aggregatorAddress !== false
  const readerAddr = typeof options?.aggregatorAddress === 'string'
    ? options.aggregatorAddress
    : useReader ? USER_READER_CONTRACT_ADDRESS : undefined

  switch (lender) {
    case 'zest-v1': {
      if (readerAddr) {
        try {
          const calls = buildV1UserReaderCalls(account, readerAddr)
          const results = await executeStacksReadCalls(calls, options)
          const parsed = parseV1UserReaderResults(results, account, metaMap, prices)
          if (parsed) return parsed
        } catch { /* fall through */ }
      }
      const calls = buildZestV1UserCalls(account)
      const results = await executeStacksReadCalls(calls, options)
      const [converter] = getZestV1UserDataConverter(account, metaMap, prices)
      return converter(results)
    }
    case 'zest-v2': {
      if (readerAddr) {
        try {
          const calls = buildV2UserReaderCalls(account, readerAddr)
          const results = await executeStacksReadCalls(calls, options)
          const parsed = parseV2UserReaderResults(results, account, metaMap, prices)
          if (parsed) return parsed
        } catch { /* fall through */ }
      }
      // Phase 1: fetch vault balances + debt + resolve-safe
      const calls = buildZestV2UserCalls(account)
      const results = await executeStacksReadCalls(calls, options)
      const [converter] = getZestV2UserDataConverter(account, metaMap, prices)
      let userData = converter(results)

      // Phase 2: fetch z-token collateral from market-vault
      const resolved = parseV2ResolveSafe(results)
      if (resolved) {
        try {
          const colCall = buildZestV2CollateralCall(resolved.userId, resolved.userMask)
          const [colResult] = await executeStacksReadCalls([colCall], options)
          const collateral = parseV2CollateralResult(colResult)
          userData = mergeV2Collateral(userData, collateral, metaMap, prices)
        } catch { /* collateral fetch failed, proceed without */ }
      }

      return userData
    }
    case 'granite': {
      if (readerAddr) {
        try {
          const calls = buildGraniteUserReaderCalls(account, readerAddr)
          const results = await executeStacksReadCalls(calls, options)
          const parsed = parseGraniteUserReaderResults(results, account, metaMap, prices)
          if (parsed) return parsed
        } catch { /* fall through */ }
      }
      const calls = buildGraniteUserCalls(account)
      const results = await executeStacksReadCalls(calls, options)
      const [converter] = getGraniteUserDataConverter(account, metaMap, prices)
      return converter(results)
    }
    default:
      throw new Error(`Unknown Stacks lender: ${lender}`)
  }
}

/**
 * Fetch all user data across all lending protocols.
 * Fires all reader calls in parallel, falls back per-protocol on failure.
 */
export async function getAllUserData(
  account: string,
  metaMap: LenderCrossPoolMeta,
  prices: Record<string, number> = {},
  options?: StacksLenderOptions,
): Promise<AllUserData> {
  const readerAddr = typeof options?.aggregatorAddress === 'string'
    ? options.aggregatorAddress
    : USER_READER_CONTRACT_ADDRESS

  // Build all reader calls
  const v1Calls = buildV1UserReaderCalls(account, readerAddr)
  const v2Calls = buildV2UserReaderCalls(account, readerAddr)
  const graniteCalls = buildGraniteUserReaderCalls(account, readerAddr)

  const allCalls = [...v1Calls, ...v2Calls, ...graniteCalls]
  const allResults = await executeStacksReadCalls(allCalls, options)

  // Split results
  const v1Results = allResults.slice(0, v1Calls.length)
  const v2Results = allResults.slice(v1Calls.length, v1Calls.length + v2Calls.length)
  const graniteResults = allResults.slice(v1Calls.length + v2Calls.length)

  let v1 = parseV1UserReaderResults(v1Results, account, metaMap, prices)
  let v2 = parseV2UserReaderResults(v2Results, account, metaMap, prices)
  let granite = parseGraniteUserReaderResults(graniteResults, account, metaMap, prices)

  // Fallback to individual calls
  if (!v1) {
    v1 = await getStacksUserData('zest-v1', account, metaMap, prices, { ...options, aggregatorAddress: false })
  }
  if (!v2) {
    v2 = await getStacksUserData('zest-v2', account, metaMap, prices, { ...options, aggregatorAddress: false })
  }
  if (!granite) {
    granite = await getStacksUserData('granite', account, metaMap, prices, { ...options, aggregatorAddress: false })
  }

  return { v1, v2, granite }
}
