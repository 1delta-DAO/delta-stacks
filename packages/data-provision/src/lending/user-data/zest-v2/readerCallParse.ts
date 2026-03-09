import { createBaseTypeUserState } from '../utils'
import { parseRawAmount } from '../utils/formatting'
import { getDisplayPrice, getOraclePrice } from '../utils/oraclePrice'
import type { LenderCrossPoolMeta, UserData } from '../utils/types'
import type { StacksCallResult } from '../../../stacks-call'
import { decodeClarityValue, extractTuple } from '../../../stacks-call'
import {
  ZEST_V2_UNDERLYING_IDS,
  ZEST_V2_SYMBOLS,
  ZEST_V2_DECIMALS,
} from '../../public-data/zest-v2/constants'
import { parseV2CollateralResult, mergeV2Collateral } from './userCallParse'

const STACKS_CHAIN_ID = 'stacks-mainnet'
const LENDER_ID = 'zest-v2'
const DEFAULT_DECIMALS = 6

/**
 * Reader tuple keys matching user-reader-v1.clar read-v2-user.
 * Order must correspond to ZEST_V2_UNDERLYING_IDS: [0, 2, 4, 6, 8, 10]
 */
const BAL_KEYS = ['bal-stx', 'bal-sbtc', 'bal-ststx', 'bal-usdc', 'bal-usdh', 'bal-ststxbtc']
const DEBT_KEYS = ['debt-stx', 'debt-sbtc', 'debt-ststx', 'debt-usdc', 'debt-usdh', 'debt-ststxbtc']

/**
 * Parse the results of V2 reader calls:
 *   [0] read-v2-user -> tuple with resolve, bal-*, debt-*
 *   [1] read-v2-user-collateral -> z-token collateral (may fail if no position)
 */
export function parseV2UserReaderResults(
  results: StacksCallResult[],
  account: string,
  metaMap?: LenderCrossPoolMeta,
  prices?: Record<string, number>,
): UserData | undefined {
  if (results.length < 1 || !results[0].okay) return undefined

  try {
    const decoded = decodeClarityValue(results[0].result)
    const outerTuple = extractTuple(decoded)
    if (!outerTuple) return undefined

    // Parse resolve result for mask
    let userMask = 0
    const resolveVal = outerTuple['resolve']
    if (resolveVal) {
      try {
        const resolveTuple = extractTuple(resolveVal?.success !== false ? (resolveVal?.value ?? resolveVal) : null)
        userMask = Number(resolveTuple?.['mask']?.value ?? 0)
      } catch { /* no position */ }
    }

    const lendingPositions: Record<string, any> = {}
    let totalDebt24h = 0
    let totalDeposits24h = 0

    for (let i = 0; i < ZEST_V2_UNDERLYING_IDS.length; i++) {
      const assetId = ZEST_V2_UNDERLYING_IDS[i]
      const marketUid = `${STACKS_CHAIN_ID}:${LENDER_ID}:${assetId}`
      const meta = metaMap?.[marketUid]
      const symbol = ZEST_V2_SYMBOLS[assetId] ?? String(assetId)
      const decimals = meta?.asset?.decimals ?? ZEST_V2_DECIMALS[assetId] ?? DEFAULT_DECIMALS

      const supplyRaw = extractResponseUint(outerTuple[BAL_KEYS[i]])
      const debtRaw = extractResponseUint(outerTuple[DEBT_KEYS[i]])

      const deposits = parseRawAmount(supplyRaw, decimals)
      const debt = parseRawAmount(debtRaw, decimals)

      if (deposits === '0' && debt === '0') continue

      const price = prices?.[marketUid] ?? prices?.[symbol.toLowerCase()] ?? getDisplayPrice(meta ?? {})
      const oPrice = getOraclePrice(meta ?? {})
      const priceHist = meta?.price?.priceUsd24h ?? price

      const zTokenBit = 1 << (assetId + 1)
      const collateralEnabled = Number(deposits) > 0 && (userMask & zTokenBit) !== 0

      lendingPositions[marketUid] = {
        marketUid,
        underlying: meta?.asset?.address,
        deposits,
        debtStable: '0',
        debt,
        depositsUSD: Number(deposits) * price,
        debtStableUSD: 0,
        debtUSD: Number(debt) * price,
        depositsUSDOracle: Number(deposits) * oPrice,
        debtStableUSDOracle: 0,
        debtUSDOracle: Number(debt) * oPrice,
        collateralEnabled,
        claimableRewards: 0,
      }

      totalDeposits24h += Number(deposits) * priceHist
      totalDebt24h += Number(debt) * priceHist
    }

    const payload = {
      chainId: STACKS_CHAIN_ID,
      account,
      lendingPositions,
      rewards: [],
      userEMode: 0,
    }

    let userData = createBaseTypeUserState(payload, metaMap ?? {}, totalDeposits24h, totalDebt24h)

    // Merge z-token collateral from second reader call
    if (results.length >= 2 && results[1]?.okay) {
      try {
        const colDecoded = decodeClarityValue(results[1].result)
        // read-v2-user-collateral returns (ok { id, mask, collateral: (response (list ...) uint) })
        const colOuter = colDecoded?.success !== false ? (colDecoded?.value ?? colDecoded) : null
        const colTuple = extractTuple(colOuter)
        const colListVal = colTuple?.['collateral']
        // The collateral field is a response from contract-call? on lookup-collateral
        const colInner = colListVal?.success !== false ? (colListVal?.value ?? colListVal) : null
        if (colInner) {
          // Re-encode as a fake StacksCallResult so parseV2CollateralResult can handle it
          // Actually, parse inline since we have the decoded value
          const list = Array.isArray(colInner) ? colInner : (colInner?.value ?? [])
          const collateral = Array.isArray(list) ? list.map((entry: any) => {
            const t = entry?.value ?? entry
            return {
              aid: Number(t?.aid?.value ?? t?.['aid']?.value ?? 0),
              amount: String(t?.amount?.value ?? t?.['amount']?.value ?? '0'),
            }
          }) : []
          userData = mergeV2Collateral(userData, collateral, metaMap, prices) ?? userData
        }
      } catch { /* collateral parse failed, proceed without */ }
    }

    return userData
  } catch (e) {
    console.warn('Failed to parse V2 user reader results:', e)
    return undefined
  }
}

/** Extract uint from a Clarity value that may be (ok uint), (response uint), or plain uint */
function extractResponseUint(val: any): string {
  if (!val) return '0'
  try {
    const inner = val?.success === true ? val.value : val
    return String(inner?.value ?? 0)
  } catch {
    return '0'
  }
}
