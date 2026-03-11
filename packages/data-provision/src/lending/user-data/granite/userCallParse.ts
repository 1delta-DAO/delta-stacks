import { createBaseTypeUserState } from '../utils'
import { parseRawAmount } from '../utils/formatting'
import { getDisplayPrice, getOraclePrice } from '../utils/oraclePrice'
import type { LenderCrossPoolMeta, UserData } from '../utils/types'
import type { StacksCallResult } from '../../../stacks-call'
import { decodeClarityValue } from '../../../stacks-call'
import {
  GRANITE_MARKETS,
  GRANITE_COLLATERAL_TOKENS,
  GRANITE_COLLATERAL_META,
  GRANITE_ASSET_PRINCIPALS,
} from '../../public-data/granite/constants'
import { getCallsPerMarket, getExpectedGraniteUserCallCount } from './userCallBuild'
import type { GranitePerMarketUserData } from './readerCallParse'

const STACKS_CHAIN_ID = 'stacks-mainnet'
const LENDER_ID = 'granite'

/** Safely extract a uint from a decoded Clarity value. */
function safeUint(val: any): number {
  if (val == null) return 0
  if (val?.type?.startsWith('uint')) return Number(val.value ?? 0)
  if (typeof val === 'string' || typeof val === 'number') return Number(val)
  if (val && val.value !== null && val.value !== undefined) return safeUint(val.value)
  return 0
}

/** Unwrap (optional ...) — returns null for none, inner value for some. */
function unwrapOptional(val: any): any {
  if (val == null) return null
  if (val.value === null || val.value === undefined) return null
  return val.value
}

/** Filter metaMap to only include entries for a specific Granite market. */
function filterMetaForMarket(metaMap: LenderCrossPoolMeta, marketId: string): LenderCrossPoolMeta {
  const prefix = `${STACKS_CHAIN_ID}:${LENDER_ID}:${marketId}`
  const filtered: LenderCrossPoolMeta = {}
  for (const [key, val] of Object.entries(metaMap)) {
    if (key === prefix || key.startsWith(`${prefix}:`)) {
      filtered[key] = val
    }
  }
  return filtered
}

/**
 * Returns a [converter, expectedCount] tuple for Granite user data.
 *
 * Granite state-v1 return types:
 *   get-user-position:        (optional { borrowed-amount, borrowed-block, collaterals, debt-shares })
 *   get-user-collateral:      (optional { amount: uint })
 *   get-borrow-repay-params:  { total-borrowed-amount: uint, user-position: (optional { ... }) }
 *
 * Returns per-market UserData (separate health factors for isolated markets).
 */
export function getGraniteUserDataConverter(
  account: string,
  metaMap?: LenderCrossPoolMeta,
  prices?: Record<string, number>,
): [(data: StacksCallResult[]) => GranitePerMarketUserData | undefined, number] {
  const expectedCount = getExpectedGraniteUserCallCount()

  const converter = (data: StacksCallResult[]): GranitePerMarketUserData | undefined => {
    if (data.length !== expectedCount) return undefined

    try {
      const perMarket: GranitePerMarketUserData = {}
      let offset = 0

      for (const market of GRANITE_MARKETS) {
        const callCount = getCallsPerMarket(market.id)
        const collaterals = GRANITE_COLLATERAL_TOKENS[market.id] ?? []
        const lendingPositions: Record<string, any> = {}
        let totalDebt24h = 0
        let totalDeposits24h = 0

        // --- Parse collateral amounts ---
        const collateralAmounts: Record<string, number> = {}
        for (let c = 0; c < collaterals.length; c++) {
          const collateralResult = data[offset + 1 + c]
          if (!collateralResult.okay) continue
          try {
            const decoded = decodeClarityValue(collateralResult.result)
            const inner = unwrapOptional(decoded)
            if (inner) {
              const innerTuple = inner.value ?? inner
              if (innerTuple && typeof innerTuple === 'object' && innerTuple['amount']) {
                collateralAmounts[collaterals[c]] = safeUint(innerTuple['amount'])
              } else {
                collateralAmounts[collaterals[c]] = safeUint(inner)
              }
            }
          } catch {
            collateralAmounts[collaterals[c]] = 0
          }
        }

        // --- Parse debt from borrow-repay-params ---
        let borrowedAmountRaw = '0'
        try {
          const borrowParamsResult = data[offset + 1 + collaterals.length]
          if (borrowParamsResult.okay) {
            const decoded = decodeClarityValue(borrowParamsResult.result)
            const tuple = decoded?.value ?? decoded
            if (tuple && typeof tuple === 'object') {
              const userPos = unwrapOptional(tuple['user-position'])
              if (userPos) {
                const userPosTuple = userPos.value ?? userPos
                borrowedAmountRaw = String(safeUint(userPosTuple?.['borrowed-amount'] ?? userPosTuple?.['debt-shares']) || 0)
              }
            }
          }
        } catch { /* no borrow position */ }

        // Borrowable asset position
        const borrowMarketUid = `${STACKS_CHAIN_ID}:${LENDER_ID}:${market.id}`
        const borrowMeta = metaMap?.[borrowMarketUid]
        const borrowDecimals = borrowMeta?.asset?.decimals ?? 6
        const debt = parseRawAmount(borrowedAmountRaw, borrowDecimals)
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

        // Collateral positions
        for (const collateral of collaterals) {
          const rawAmount = collateralAmounts[collateral] ?? 0
          if (rawAmount === 0 || isNaN(rawAmount)) continue

          const collateralMeta = GRANITE_COLLATERAL_META[collateral]
          const collSymbol = collateralMeta?.symbol ?? 'unknown'
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

        // Only emit market if user has any positions
        if (Object.keys(lendingPositions).length > 0) {
          const marketMeta = filterMetaForMarket(metaMap ?? {}, market.id)
          const payload = {
            chainId: STACKS_CHAIN_ID,
            account,
            lendingPositions,
            rewards: [],
            userEMode: 0,
          }
          perMarket[market.id] = createBaseTypeUserState(payload, marketMeta, totalDeposits24h, totalDebt24h)
        }

        offset += callCount
      }

      return Object.keys(perMarket).length > 0 ? perMarket : undefined
    } catch (e) {
      console.warn('Failed to parse Granite user data:', e)
      return undefined
    }
  }

  return [converter, expectedCount]
}
