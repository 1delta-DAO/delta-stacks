import { createBaseTypeUserState } from '../utils'
import { parseRawAmount } from '../utils/formatting'
import { getDisplayPrice, getOraclePrice } from '../utils/oraclePrice'
import type { LenderCrossPoolMeta, UserData } from '../utils/types'
import type { StacksCallResult } from '../../../stacks-call'
import { decodeClarityValue, extractTuple, extractUint } from '../../../stacks-call'
import {
  GRANITE_MARKETS,
  GRANITE_COLLATERAL_TOKENS,
  GRANITE_COLLATERAL_META,
  GRANITE_ASSET_PRINCIPALS,
} from '../../public-data/granite/constants'
import { getCallsPerMarket, getExpectedGraniteUserCallCount } from './userCallBuild'

const STACKS_CHAIN_ID = 'stacks-mainnet'
const LENDER_ID = 'granite'

/**
 * Returns a [converter, expectedCount] tuple for Granite user data.
 *
 * Granite response layout per market:
 *   [0] get-user-position     → { debt-shares, last-updated-at }
 *   [1] get-user-collateral   → collateral amount (per token, currently 1 each)
 *   [2] get-borrow-repay-params → { current-debt, ... }
 */
export function getGraniteUserDataConverter(
  account: string,
  metaMap?: LenderCrossPoolMeta,
  prices?: Record<string, number>,
): [(data: StacksCallResult[]) => UserData | undefined, number] {
  const expectedCount = getExpectedGraniteUserCallCount()

  const converter = (data: StacksCallResult[]): UserData | undefined => {
    if (data.length !== expectedCount) return undefined
    if (data.some((r) => !r.okay)) return undefined

    try {
      const lendingPositions: Record<string, any> = {}
      let totalDebt24h = 0
      let totalDeposits24h = 0
      let offset = 0

      for (const market of GRANITE_MARKETS) {
        const callCount = getCallsPerMarket(market.id)
        const collaterals = GRANITE_COLLATERAL_TOKENS[market.id] ?? []

        // Parse user position (debt shares)
        const positionResult = data[offset]
        const positionTuple = extractTuple(decodeClarityValue(positionResult.result))
        const debtShares = Number(positionTuple?.['debt-shares']?.value ?? 0)

        // Parse collateral amounts (1 per collateral token)
        const collateralAmounts: Record<string, number> = {}
        for (let c = 0; c < collaterals.length; c++) {
          const collateralResult = data[offset + 1 + c]
          try {
            const decoded = decodeClarityValue(collateralResult.result)
            // May be wrapped in (ok uint) or just uint
            const inner = decoded?.success === true ? decoded.value : decoded
            collateralAmounts[collaterals[c]] = Number(inner?.value ?? inner ?? 0)
          } catch {
            collateralAmounts[collaterals[c]] = 0
          }
        }

        // Parse borrow-repay-params (actual debt amount)
        const borrowParamsResult = data[offset + 1 + collaterals.length]
        const borrowTuple = extractTuple(decodeClarityValue(borrowParamsResult.result))
        const currentDebtRaw = String(borrowTuple?.['current-debt']?.value ?? 0)

        // Borrowable asset position
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

        // Collateral positions
        for (const collateral of collaterals) {
          const rawAmount = collateralAmounts[collateral] ?? 0
          if (rawAmount === 0) continue

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

        offset += callCount
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
      console.warn('Failed to parse Granite user data:', e)
      return undefined
    }
  }

  return [converter, expectedCount]
}
