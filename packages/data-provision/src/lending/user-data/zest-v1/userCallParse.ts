import { createBaseTypeUserState } from '../utils'
import { parseRawAmount } from '../utils/formatting'
import { getDisplayPrice, getOraclePrice } from '../utils/oraclePrice'
import type { LenderCrossPoolMeta, LenderYieldComplete, UserData } from '../utils/types'
import type { StacksCallResult } from '../../../stacks-call'
import { decodeClarityValue, extractTuple, extractUint } from '../../../stacks-call'
import { getZestAssets, ZEST_ASSET_SYMBOLS } from '../../public-data/zest-v1/constants'

const STACKS_CHAIN_ID = 'stacks-mainnet'
const LENDER_ID = 'zest-v1'

/**
 * Returns a [converter, expectedCount] tuple for Zest V1 user data.
 * Follows the same pattern as getAaveV3UserDataConverter.
 */
export function getZestV1UserDataConverter(
  account: string,
  metaMap?: LenderCrossPoolMeta,
  prices?: Record<string, number>,
): [(data: StacksCallResult[]) => UserData | undefined, number] {
  const assets = getZestAssets()
  const expectedCount = assets.length + 1 // per-asset + emode

  const converter = (data: StacksCallResult[]): UserData | undefined => {
    if (data.length !== expectedCount) return undefined

    // Validate all calls succeeded
    if (data.some((r) => !r.okay)) return undefined

    // Last call is e-mode
    let userEMode = 0
    try {
      const emodeDecoded = decodeClarityValue(data[assets.length].result)
      userEMode = Number(extractUint(emodeDecoded) ?? 0)
    } catch {
      // default to 0
    }

    const lendingPositions: Record<string, any> = {}
    let totalDebt24h = 0
    let totalDeposits24h = 0

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i]
      const symbol = ZEST_ASSET_SYMBOLS[asset] ?? ''
      const marketUid = `${STACKS_CHAIN_ID}:${LENDER_ID}:${asset}`
      const metaEntity = metaMap?.[marketUid]

      const entry = parseV1UserReserveData(
        data[i],
        marketUid,
        metaEntity,
        prices?.[marketUid] ?? prices?.[symbol.toLowerCase()] ?? prices?.[asset],
      )
      if (!entry.dataForAsset) continue

      totalDebt24h += entry.addedDebt
      totalDeposits24h += entry.addedDeposits
      lendingPositions[marketUid] = entry.dataForAsset
    }

    const payload = {
      chainId: STACKS_CHAIN_ID,
      account,
      lendingPositions,
      rewards: [],
      userEMode,
    }

    return createBaseTypeUserState(payload, metaMap ?? {}, totalDeposits24h, totalDebt24h)
  }

  return [converter, expectedCount]
}

/**
 * Parse a single get-user-reserve-data-read response.
 * Zest V1 (Aave-like) returns a tuple with:
 *   current-atoken-balance, current-stable-debt, current-variable-debt,
 *   principal-stable-debt, scaled-variable-debt, stable-borrow-rate,
 *   liquidity-rate, usage-as-collateral-enabled
 */
function parseV1UserReserveData(
  result: StacksCallResult,
  marketUid: string,
  meta?: LenderYieldComplete,
  priceOverride?: number,
) {
  try {
    const decoded = decodeClarityValue(result.result)
    const t = extractTuple(decoded)

    const aTokenBalanceRaw = String(t['current-atoken-balance']?.value ?? 0)
    const stableDebtRaw = String(t['current-stable-debt']?.value ?? 0)
    const variableDebtRaw = String(t['current-variable-debt']?.value ?? 0)

    if (aTokenBalanceRaw === '0' && stableDebtRaw === '0' && variableDebtRaw === '0') {
      return { dataForAsset: undefined, addedDeposits: 0, addedDebt: 0 }
    }

    const decimals = meta?.asset?.decimals ?? 8
    const deposits = parseRawAmount(aTokenBalanceRaw, decimals)
    const debtStable = parseRawAmount(stableDebtRaw, decimals)
    const debt = parseRawAmount(variableDebtRaw, decimals)

    const price = priceOverride ?? getDisplayPrice(meta ?? {})
    const oPrice = getOraclePrice(meta ?? {})
    const priceHist = meta?.price?.priceUsd24h ?? price

    const collateralEnabled = t['usage-as-collateral-enabled']?.value === true

    const dataForAsset = {
      marketUid,
      underlying: meta?.asset?.address,
      deposits,
      debtStable,
      debt,
      depositsUSD: Number(deposits) * price,
      debtStableUSD: Number(debtStable) * price,
      debtUSD: Number(debt) * price,
      depositsUSDOracle: Number(deposits) * oPrice,
      debtStableUSDOracle: Number(debtStable) * oPrice,
      debtUSDOracle: Number(debt) * oPrice,
      collateralEnabled,
      claimableRewards: 0,
    }

    return {
      dataForAsset,
      addedDeposits: Number(deposits) * priceHist,
      addedDebt: (Number(debt) + Number(debtStable)) * priceHist,
    }
  } catch {
    return { dataForAsset: undefined, addedDeposits: 0, addedDebt: 0 }
  }
}
