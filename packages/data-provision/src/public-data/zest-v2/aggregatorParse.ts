import { StacksCallResult } from '../../stacks-call'
import { decodeClarityValue, extractTuple } from '../../stacks-call'
import { ZEST_V2_SYMBOLS, ZEST_V2_UNDERLYING_IDS, ZEST_V2_VAULT_FOR_ASSET, ZEST_V2_ASSET_PRINCIPALS } from './constants'
import type { ZestV2ReserveData, ZestV2PublicResponse, ZestV2AssetStatus } from './publicCallParse'
import { lookupToken } from '../../token-list'

const STACKS_CHAIN_ID = 'stacks-mainnet'
const RATE_PRECISION = 1e8
const INDEX_PRECISION = 1e8

/**
 * Vault keys in the aggregator response tuple, in asset ID order.
 */
const VAULT_KEYS: Record<number, string> = {
  0: 'stx',
  2: 'sbtc',
  4: 'ststx',
  6: 'usdc',
  8: 'usdh',
  10: 'ststxbtc',
}

/**
 * Default decimals per asset ID (used when registry data isn't in aggregator).
 */
const ASSET_DECIMALS: Record<number, number> = {
  0: 6,   // STX
  2: 8,   // sBTC
  4: 6,   // stSTX
  6: 8,   // USDC (aeUSDC)
  8: 8,   // USDH
  10: 6,  // stSTXbtc
}

/**
 * Parse the single aggregator call result from zest-reader.clar's
 * `get-v2-reserve-data` into the same ZestV2PublicResponse format.
 */
export function parseAggregatorResult(
  result: StacksCallResult,
  prices: Record<string, number> = {},
): ZestV2PublicResponse | undefined {
  if (!result.okay) {
    console.warn(`Aggregator call failed: ${result.result}`)
    return undefined
  }

  try {
    const decoded = decodeClarityValue(result.result)
    // The response is (ok { stx: {...}, sbtc: {...}, ... , asset-bitmap: uint })
    // cvToJSON wraps ok in { value: { ... } }
    const outerTuple = extractOkTuple(decoded)
    if (!outerTuple) return undefined

    const assetBitmap = BigInt(outerTuple['asset-bitmap']?.value ?? 0)

    // Parse asset statuses from bitmap
    const assetStatuses: Record<number, ZestV2AssetStatus> = {}
    for (const aid of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      const collateralBit = (assetBitmap >> BigInt(aid)) & 1n
      const debtBit = (assetBitmap >> BigInt(aid + 64)) & 1n
      assetStatuses[aid] = {
        assetId: aid,
        symbol: ZEST_V2_SYMBOLS[aid] ?? `asset-${aid}`,
        collateralEnabled: collateralBit === 1n,
        debtEnabled: debtBit === 1n,
      }
    }

    // Parse per-vault data
    const reserveData: Record<string, ZestV2ReserveData> = {}

    for (const aid of ZEST_V2_UNDERLYING_IDS) {
      const key = VAULT_KEYS[aid]
      const vaultTuple = outerTuple[key]?.value ?? outerTuple[key]
      if (!vaultTuple) continue

      const v = typeof vaultTuple === 'object' ? vaultTuple : extractTuple(vaultTuple)

      const symbol = ZEST_V2_SYMBOLS[aid] ?? `asset-${aid}`
      const zTokenId = aid + 1
      const zTokenSymbol = ZEST_V2_SYMBOLS[zTokenId] ?? `z-${symbol}`
      const vault = ZEST_V2_VAULT_FOR_ASSET[aid]
      const marketUid = `${STACKS_CHAIN_ID}:zest-v2:${aid}`
      const decimals = ASSET_DECIMALS[aid] ?? 8
      const divisor = 10 ** decimals

      const totalSupplyShares = extractNum(v['total-supply']) / divisor
      const totalAssets = extractNum(v['total-assets']) / divisor
      const debt = extractNum(v['debt']) / divisor
      const available = extractNum(v['available']) / divisor

      const price = prices[marketUid] ?? prices[symbol.toLowerCase()] ?? prices[symbol] ?? 0

      reserveData[marketUid] = {
        marketUid,
        name: `Zest V2 ${symbol}`,
        assetId: aid,
        symbol,
        vault: vault.name,
        // Amounts
        totalSupplyShares,
        totalBorrows: debt,
        availableLiquidity: available,
        totalDeposits: totalAssets,
        // USD
        totalDepositsUSD: totalAssets * price,
        totalBorrowsUSD: debt * price,
        availableLiquidityUSD: available * price,
        // Rates
        supplyRate: 0, // Not directly in aggregator; derive from borrow rate * utilization * (1 - fee)
        borrowRate: extractNum(v['interest-rate']) / RATE_PRECISION,
        // Indexes
        borrowIndex: extractNum(v['index']) / INDEX_PRECISION,
        liquidityIndex: extractNum(v['lindex']) / INDEX_PRECISION,
        // Config
        decimals,
        collateralEnabled: assetStatuses[aid]?.collateralEnabled ?? false,
        debtEnabled: assetStatuses[aid]?.debtEnabled ?? false,
        // Z-token
        zTokenId,
        zTokenSymbol,
        zTokenCollateralEnabled: assetStatuses[zTokenId]?.collateralEnabled ?? false,
        // LTV (not available from aggregator — populated via egroup resolve)
        baseLtv: 0,
        liquidationThreshold: 0,
        // Metadata
        oracleType: null,
        principal: null,
        asset: ZEST_V2_ASSET_PRINCIPALS[aid] ? lookupToken(ZEST_V2_ASSET_PRINCIPALS[aid]) : undefined,
        config: {
          0: {
            category: 0,
            borrowCollateralFactor: 0,
            collateralFactor: 0,
            borrowFactor: 1,
            collateralDisabled: !(assetStatuses[aid]?.collateralEnabled ?? false),
            debtDisabled: !(assetStatuses[aid]?.debtEnabled ?? false),
          },
        },
        params: {
          metadata: { vault: vault.name, zTokenId, zTokenSymbol },
        },
      }

      // Derive supply rate: supplyRate ≈ borrowRate * utilization * (1 - reserveFee)
      const feeReserve = extractNum(v['fee-reserve']) / RATE_PRECISION
      const utilization = totalAssets > 0 ? debt / totalAssets : 0
      reserveData[marketUid].supplyRate =
        reserveData[marketUid].borrowRate * utilization * (1 - feeReserve)
    }

    return {
      data: reserveData,
      assetStatuses,
      chainId: STACKS_CHAIN_ID,
    }
  } catch (e) {
    console.warn('Failed to parse aggregator result:', e)
    return undefined
  }
}

/** Extract the inner tuple from an (ok ...) response */
function extractOkTuple(decoded: any): Record<string, any> | null {
  // cvToJSON for (ok {tuple}) => { type: 7, value: { ... }, success: true }
  if (decoded?.success === true && decoded?.value?.value) {
    return decoded.value.value
  }
  if (decoded?.value && typeof decoded.value === 'object') {
    return decoded.value
  }
  return null
}

/** Safely extract a number from a decoded Clarity uint field */
function extractNum(field: any): number {
  if (field === undefined || field === null) return 0
  if (typeof field === 'number') return field
  if (typeof field === 'bigint') return Number(field)
  if (field?.value !== undefined) return Number(field.value)
  return Number(field) || 0
}
