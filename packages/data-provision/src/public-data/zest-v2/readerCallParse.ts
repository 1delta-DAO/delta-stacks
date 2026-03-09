import { StacksCallResult } from '../../stacks-call'
import { decodeClarityValue, extractTuple } from '../../stacks-call'
import { ZEST_V2_SYMBOLS, ZEST_V2_UNDERLYING_IDS, ZEST_V2_VAULT_FOR_ASSET, ZEST_V2_ASSET_PRINCIPALS } from './constants'
import type { ZestV2ReserveData, ZestV2PublicResponse, ZestV2AssetStatus } from './publicCallParse'
import { lookupToken } from '../../token-list'

const STACKS_CHAIN_ID = 'stacks-mainnet'
const BPS = 10_000
const INDEX_PRECISION = 1e8

const ASSET_DECIMALS: Record<number, number> = {
  0: 6, 2: 8, 4: 6, 6: 8, 8: 8, 10: 6,
}

/**
 * Parse results from the per-vault reader calls + egroup resolve calls.
 *
 * Layout: [0..6) per-vault tuples, [6..12) egroup resolve results
 */
export function parseV2ReaderResults(
  results: StacksCallResult[],
  prices: Record<string, number> = {},
): ZestV2PublicResponse | undefined {
  const nUnderlying = ZEST_V2_UNDERLYING_IDS.length
  const expectedCount = nUnderlying * 2 // 6 reader + 6 egroup

  if (results.length !== expectedCount) {
    console.warn(`V2 reader: expected ${expectedCount} results, got ${results.length}`)
    return undefined
  }

  try {
    // Default asset statuses (all enabled) since bitmap isn't in per-vault calls
    const assetStatuses: Record<number, ZestV2AssetStatus> = {}
    for (const aid of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      const isUnderlying = aid % 2 === 0
      assetStatuses[aid] = {
        assetId: aid,
        symbol: ZEST_V2_SYMBOLS[aid] ?? `asset-${aid}`,
        collateralEnabled: true,
        debtEnabled: isUnderlying,
      }
    }

    // Parse egroup resolve results (indices 6..12)
    const egroupLtvs: Record<number, { baseLtv: number; liquidationThreshold: number }> = {}
    for (let i = 0; i < nUnderlying; i++) {
      const aid = ZEST_V2_UNDERLYING_IDS[i]
      const egResult = results[nUnderlying + i]
      const parsed = decodeEGroupResolve(egResult)
      if (parsed) egroupLtvs[aid] = parsed
    }

    const reserveData: Record<string, ZestV2ReserveData> = {}

    for (let i = 0; i < nUnderlying; i++) {
      const result = results[i]
      if (!result.okay) continue

      const aid = ZEST_V2_UNDERLYING_IDS[i]
      const decoded = decodeClarityValue(result.result)
      const v = decoded?.value ?? decoded
      if (!v || typeof v !== 'object') continue

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
        totalSupplyShares,
        totalBorrows: debt,
        availableLiquidity: available,
        totalDeposits: totalAssets,
        totalDepositsUSD: totalAssets * price,
        totalBorrowsUSD: debt * price,
        availableLiquidityUSD: available * price,
        supplyRate: 0,
        borrowRate: extractNum(v['interest-rate']) / BPS,
        borrowIndex: extractNum(v['index']) / INDEX_PRECISION,
        liquidityIndex: extractNum(v['lindex']) / INDEX_PRECISION,
        decimals,
        collateralEnabled: assetStatuses[aid]?.collateralEnabled ?? true,
        debtEnabled: assetStatuses[aid]?.debtEnabled ?? true,
        zTokenId,
        zTokenSymbol,
        zTokenCollateralEnabled: assetStatuses[zTokenId]?.collateralEnabled ?? true,
        oracleType: null,
        principal: null,
        baseLtv: egroupLtvs[aid]?.baseLtv ?? 0,
        liquidationThreshold: egroupLtvs[aid]?.liquidationThreshold ?? 0,
        asset: ZEST_V2_ASSET_PRINCIPALS[aid] ? lookupToken(ZEST_V2_ASSET_PRINCIPALS[aid]) : undefined,
        config: {
          0: {
            category: 0,
            borrowCollateralFactor: egroupLtvs[aid]?.baseLtv ?? 0,
            collateralFactor: egroupLtvs[aid]?.liquidationThreshold ?? 0,
            borrowFactor: 1,
            collateralDisabled: !(assetStatuses[aid]?.collateralEnabled ?? true),
            debtDisabled: !(assetStatuses[aid]?.debtEnabled ?? true),
          },
        },
        params: {
          metadata: { vault: vault.name, zTokenId, zTokenSymbol },
        },
      }

      // Derive supply rate: borrowRate * utilization * (1 - feeReserve)
      const feeReserve = extractNum(v['fee-reserve']) / BPS
      // Use utilization from reader tuple if available, otherwise derive
      const readerUtil = extractNum(v['utilization'])
      const utilization = readerUtil > 0 ? readerUtil / BPS : (totalAssets > 0 ? debt / totalAssets : 0)
      reserveData[marketUid].supplyRate =
        reserveData[marketUid].borrowRate * utilization * (1 - feeReserve)
    }

    return { data: reserveData, assetStatuses, chainId: STACKS_CHAIN_ID }
  } catch (e) {
    console.warn('Failed to parse V2 reader results:', e)
    return undefined
  }
}

function extractNum(field: any): number {
  if (field === undefined || field === null) return 0
  if (typeof field === 'number') return field
  if (typeof field === 'bigint') return Number(field)
  if (field?.value !== undefined) return Number(field.value)
  return Number(field) || 0
}

/** Decode v0-egroup.resolve() — (ok tuple) or (err uint) */
function decodeEGroupResolve(
  result: StacksCallResult,
): { baseLtv: number; liquidationThreshold: number } | null {
  try {
    if (!result.okay) return null
    const decoded = decodeClarityValue(result.result)
    if (decoded?.success === false) return null
    const t = extractTuple(decoded?.value ?? decoded)
    const ltvBorrow = decodeBuff2Bps(t?.['LTV-BORROW'])
    const ltvLiqPartial = decodeBuff2Bps(t?.['LTV-LIQ-PARTIAL'])
    return { baseLtv: ltvBorrow, liquidationThreshold: ltvLiqPartial }
  } catch {
    return null
  }
}

function decodeBuff2Bps(field: any): number {
  if (!field) return 0
  const hex = String(field.value ?? field).replace('0x', '')
  return parseInt(hex, 16) / 10000
}
