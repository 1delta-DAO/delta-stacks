import { createBaseTypeUserState } from '../utils'
import { parseRawAmount } from '../utils/formatting'
import { getDisplayPrice, getOraclePrice } from '../utils/oraclePrice'
import type { LenderCrossPoolMeta, UserData } from '../utils/types'
import type { StacksCallResult } from '../../../stacks-call'
import { decodeClarityValue, extractTuple } from '../../../stacks-call'
import {
  GRANITE_MARKETS,
  GRANITE_COLLATERAL_TOKENS,
  GRANITE_COLLATERAL_META,
  GRANITE_ASSET_PRINCIPALS,
} from '../../public-data/granite/constants'

const STACKS_CHAIN_ID = 'stacks-mainnet'
const LENDER_ID = 'granite'

/**
 * Parse Granite user reader results.
 * Each result is a tuple from a per-market reader function containing:
 *   { position, collateral-sbtc, borrow-params }
 */
export function parseGraniteUserReaderResults(
  results: StacksCallResult[],
  account: string,
  metaMap?: LenderCrossPoolMeta,
  prices?: Record<string, number>,
): UserData | undefined {
  if (results.length !== GRANITE_MARKETS.length) return undefined
  if (results.some((r) => !r.okay)) return undefined

  try {
    const lendingPositions: Record<string, any> = {}
    let totalDebt24h = 0
    let totalDeposits24h = 0

    for (let i = 0; i < GRANITE_MARKETS.length; i++) {
      const market = GRANITE_MARKETS[i]
      const decoded = decodeClarityValue(results[i].result)
      const outerTuple = extractTuple(decoded)
      if (!outerTuple) continue

      const collaterals = GRANITE_COLLATERAL_TOKENS[market.id] ?? []

      // Parse debt from borrow-params
      const borrowTuple = extractTuple(outerTuple['borrow-params'])
      const currentDebtRaw = String(borrowTuple?.['current-debt']?.value ?? 0)

      const borrowMarketUid = `${STACKS_CHAIN_ID}:${LENDER_ID}:${market.id}`
      const borrowMeta = metaMap?.[borrowMarketUid]
      const borrowDecimals = borrowMeta?.asset?.decimals ?? 6
      const debt = parseRawAmount(currentDebtRaw, borrowDecimals)
      const borrowSymbol = market.symbol.toLowerCase()
      const borrowPrice = prices?.[borrowMarketUid] ?? prices?.[borrowSymbol] ?? getDisplayPrice(borrowMeta ?? {})
      const borrowOPrice = getOraclePrice(borrowMeta ?? {})
      const borrowPriceHist = borrowMeta?.price?.priceUsd24h ?? borrowPrice

      if (Number(debt) > 0) {
        lendingPositions[borrowMarketUid] = {
          marketUid: borrowMarketUid,
          underlying: borrowMeta?.asset?.address ?? GRANITE_ASSET_PRINCIPALS[market.id],
          deposits: '0',
          debtStable: '0',
          debt,
          depositsUSD: 0,
          debtStableUSD: 0,
          debtUSD: Number(debt) * borrowPrice,
          depositsUSDOracle: 0,
          debtStableUSDOracle: 0,
          debtUSDOracle: Number(debt) * borrowOPrice,
          collateralEnabled: false,
          claimableRewards: 0,
        }
        totalDebt24h += Number(debt) * borrowPriceHist
      }

      // Parse collateral: currently only sBTC
      for (const collateral of collaterals) {
        const collateralMeta = GRANITE_COLLATERAL_META[collateral]
        const collSymbol = collateralMeta?.symbol ?? 'unknown'
        const collKey = `collateral-${collSymbol.toLowerCase()}`

        let rawAmount = 0
        const collVal = outerTuple[collKey]
        if (collVal) {
          try {
            const inner = collVal?.success === true ? collVal.value : collVal
            rawAmount = Number(inner?.value ?? inner ?? 0)
          } catch {
            rawAmount = 0
          }
        }

        if (rawAmount === 0) continue

        const collDecimals = collateralMeta?.decimals ?? 8
        const collMarketUid = `${STACKS_CHAIN_ID}:${LENDER_ID}:${market.id}:${collSymbol.toLowerCase()}`
        const collMeta = metaMap?.[collMarketUid]
        const deposits = parseRawAmount(String(rawAmount), collDecimals)
        const collPrice = prices?.[collMarketUid] ?? prices?.[collSymbol.toLowerCase()] ?? getDisplayPrice(collMeta ?? {})
        const collOPrice = getOraclePrice(collMeta ?? {})
        const collPriceHist = collMeta?.price?.priceUsd24h ?? collPrice

        lendingPositions[collMarketUid] = {
          marketUid: collMarketUid,
          underlying: collateral,
          deposits,
          debtStable: '0',
          debt: '0',
          depositsUSD: Number(deposits) * collPrice,
          debtStableUSD: 0,
          debtUSD: 0,
          depositsUSDOracle: Number(deposits) * collOPrice,
          debtStableUSDOracle: 0,
          debtUSDOracle: 0,
          collateralEnabled: true,
          claimableRewards: 0,
        }
        totalDeposits24h += Number(deposits) * collPriceHist
      }
    }

    const payload = {
      chainId: STACKS_CHAIN_ID,
      account,
      lendingPositions,
      rewards: [],
      userEMode: 0,
    }

    return createBaseTypeUserState(payload, metaMap ?? {}, totalDeposits24h, totalDebt24h)
  } catch (e) {
    console.warn('Failed to parse Granite user reader results:', e)
    return undefined
  }
}
