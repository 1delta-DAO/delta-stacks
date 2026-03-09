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
import { EXPECTED_V2_USER_CALL_COUNT } from './userCallBuild'

const STACKS_CHAIN_ID = 'stacks-mainnet'
const LENDER_ID = 'zest-v2'
const DEFAULT_DECIMALS = 6
const NUM_VAULTS = ZEST_V2_UNDERLYING_IDS.length // 6

/** Collateral entry from lookup-collateral: { aid: z-token asset ID, amount: raw units } */
export interface V2CollateralEntry {
  aid: number
  amount: string
}

/**
 * Returns a [converter, expectedCount] tuple for Zest V2 user data.
 *
 * Call layout (from userCallBuild):
 *   [0]       resolve-safe(account)               -> { id, mask, ... }
 *   [1..6]    vault.get-balance(account)           -> (ok uint) supply shares per vault
 *   [7..12]   market-vault.get-account-scaled-debt -> uint debt per asset
 */
export function getZestV2UserDataConverter(
  account: string,
  metaMap?: LenderCrossPoolMeta,
  prices?: Record<string, number>,
): [(data: StacksCallResult[]) => UserData | undefined, number] {
  const converter = (data: StacksCallResult[]): UserData | undefined => {
    if (data.length !== EXPECTED_V2_USER_CALL_COUNT) return undefined

    // resolve-safe may return (err) if user has no position — that's ok
    // We still check vault balances in case of z-token transfers
    const resolveOk = data[0].okay
    let userMask = 0

    if (resolveOk) {
      try {
        const resolved = decodeClarityValue(data[0].result)
        // resolve-safe returns (ok { id, mask, ... }) or (err uint)
        if (resolved?.success !== false) {
          const tuple = extractTuple(resolved?.value ?? resolved)
          userMask = Number(tuple?.['mask']?.value ?? 0)
        }
      } catch { /* no position */ }
    }

    const lendingPositions: Record<string, any> = {}
    let totalDebt24h = 0
    let totalDeposits24h = 0

    for (let i = 0; i < NUM_VAULTS; i++) {
      const assetId = ZEST_V2_UNDERLYING_IDS[i]
      const marketUid = `${STACKS_CHAIN_ID}:${LENDER_ID}:${assetId}`
      const meta = metaMap?.[marketUid]
      const symbol = ZEST_V2_SYMBOLS[assetId] ?? String(assetId)
      const decimals = meta?.asset?.decimals ?? ZEST_V2_DECIMALS[assetId] ?? DEFAULT_DECIMALS

      // Supply: vault.get-balance at index 1 + i
      let supplyRaw = '0'
      const supplyResult = data[1 + i]
      if (supplyResult?.okay) {
        try {
          const decoded = decodeClarityValue(supplyResult.result)
          // May be (ok uint) or plain uint
          const inner = decoded?.success === true ? decoded.value : decoded
          supplyRaw = String(inner?.value ?? 0)
        } catch { /* 0 */ }
      }

      // Debt: market-vault.get-account-scaled-debt at index 1 + NUM_VAULTS + i
      let debtRaw = '0'
      const debtResult = data[1 + NUM_VAULTS + i]
      if (debtResult?.okay) {
        try {
          const decoded = decodeClarityValue(debtResult.result)
          const inner = decoded?.success === true ? decoded.value : decoded
          debtRaw = String(inner?.value ?? 0)
        } catch { /* 0 */ }
      }

      const deposits = parseRawAmount(supplyRaw, decimals)
      const debt = parseRawAmount(debtRaw, decimals)

      if (deposits === '0' && debt === '0') continue

      const price = prices?.[marketUid] ?? prices?.[symbol.toLowerCase()] ?? getDisplayPrice(meta ?? {})
      const oPrice = getOraclePrice(meta ?? {})
      const priceHist = meta?.price?.priceUsd24h ?? price

      // Collateral enabled if user's mask has the z-token bit set
      // z-token bit = assetId + 1
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

    // If no positions found, return empty data
    const payload = {
      chainId: STACKS_CHAIN_ID,
      account,
      lendingPositions,
      rewards: [],
      userEMode: 0,
    }

    return createBaseTypeUserState(payload, metaMap ?? {}, totalDeposits24h, totalDebt24h)
  }

  return [converter, EXPECTED_V2_USER_CALL_COUNT]
}

/**
 * Parse resolve-safe result to extract user's internal ID and position mask.
 * Returns undefined if the user has no position.
 */
export function parseV2ResolveSafe(
  data: StacksCallResult[],
): { userId: number; userMask: number } | undefined {
  if (!data[0]?.okay) return undefined
  try {
    const decoded = decodeClarityValue(data[0].result)
    if (decoded?.success === false) return undefined
    const tuple = extractTuple(decoded?.value ?? decoded)
    const userId = Number(tuple?.['id']?.value ?? 0)
    const userMask = Number(tuple?.['mask']?.value ?? 0)
    if (userId === 0) return undefined
    return { userId, userMask }
  } catch {
    return undefined
  }
}

/**
 * Parse the result of lookup-collateral into an array of collateral entries.
 * Returns z-token asset IDs and their raw amounts.
 */
export function parseV2CollateralResult(
  result: StacksCallResult,
): V2CollateralEntry[] {
  if (!result?.okay) return []
  try {
    const decoded = decodeClarityValue(result.result)
    // lookup-collateral returns a list of { aid: uint, amount: uint }
    const list = decoded?.value ?? decoded
    if (!Array.isArray(list)) return []
    return list.map((entry: any) => {
      const tuple = entry?.value ?? entry
      return {
        aid: Number(tuple?.aid?.value ?? tuple?.['aid']?.value ?? 0),
        amount: String(tuple?.amount?.value ?? tuple?.['amount']?.value ?? '0'),
      }
    })
  } catch {
    return []
  }
}

/**
 * Merge z-token collateral amounts into existing UserData positions.
 *
 * Z-token collateral (from market-vault) represents supply shares deposited as
 * collateral. These should be ADDED to any existing vault balance for the
 * corresponding underlying asset.
 *
 * Z-token asset IDs are odd: aid 1→STX(0), 3→sBTC(2), 5→stSTX(4), 7→USDC(6), 9→USDH(8), 11→stSTXbtc(10)
 */
export function mergeV2Collateral(
  userData: UserData | undefined,
  collateral: V2CollateralEntry[],
  metaMap?: LenderCrossPoolMeta,
  prices?: Record<string, number>,
): UserData | undefined {
  if (!userData || collateral.length === 0) return userData

  const pool = userData.data[0]
  if (!pool) return userData

  for (const entry of collateral) {
    // Z-token asset ID → underlying asset ID (odd - 1 = even)
    const underlyingId = entry.aid - 1
    if (underlyingId < 0 || underlyingId % 2 !== 0) continue

    const marketUid = `${STACKS_CHAIN_ID}:${LENDER_ID}:${underlyingId}`
    const meta = metaMap?.[marketUid]
    const symbol = ZEST_V2_SYMBOLS[underlyingId] ?? String(underlyingId)
    const decimals = meta?.asset?.decimals ?? ZEST_V2_DECIMALS[underlyingId] ?? DEFAULT_DECIMALS

    const collateralAmount = parseRawAmount(entry.amount, decimals)
    if (collateralAmount === '0') continue

    const price = prices?.[marketUid] ?? prices?.[symbol.toLowerCase()] ?? getDisplayPrice(meta ?? {})
    const oPrice = getOraclePrice(meta ?? {})

    const existing = pool.positions.find((p: any) => p.marketUid === marketUid)
    if (existing) {
      // Add collateral to existing deposit amount
      const newDeposits = String(Number(existing.deposits) + Number(collateralAmount))
      existing.deposits = newDeposits
      existing.depositsUSD = Number(newDeposits) * price
      existing.depositsUSDOracle = Number(newDeposits) * oPrice
      existing.collateralEnabled = true
    } else {
      // Create new position for collateral-only entry
      pool.positions.push({
        marketUid,
        underlying: meta?.asset?.address,
        deposits: collateralAmount,
        debtStable: '0',
        debt: '0',
        depositsUSD: Number(collateralAmount) * price,
        debtStableUSD: 0,
        debtUSD: 0,
        depositsUSDOracle: Number(collateralAmount) * oPrice,
        debtStableUSDOracle: 0,
        debtUSDOracle: 0,
        collateralEnabled: true,
        claimableRewards: 0,
      } as any)
    }
  }

  // Recalculate totals
  let totalDeposits = 0
  let totalDebt = 0
  for (const pos of pool.positions) {
    totalDeposits += pos.depositsUSD
    totalDebt += pos.debtUSD
  }
  pool.balanceData = {
    ...pool.balanceData,
    deposits: totalDeposits,
    debt: totalDebt,
  }

  return userData
}
