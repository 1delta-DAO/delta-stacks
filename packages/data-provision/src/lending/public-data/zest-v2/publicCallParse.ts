import { StacksCallResult } from '../../../stacks-call'
import { decodeClarityValue, extractTuple, extractUint } from '../../../stacks-call'
import {
  ASSET_REGISTRY_CALLS_PER_ASSET,
  VAULT_CALLS_PER_UNDERLYING,
  getExpectedCallCount,
} from './publicCallBuild'
import {
  ZEST_V2_UNDERLYING_IDS,
  ZEST_V2_ALL_ASSET_IDS,
  ZEST_V2_SYMBOLS,
  ZEST_V2_VAULT_FOR_ASSET,
} from './constants'
import { lookupToken } from '../../../token-list'
import type { StacksToken } from '../../../token-list'

const STACKS_CHAIN_ID = 'stacks-mainnet'

/**
 * V2 rate/utilization/fee precision.
 * Vault rates, utilization, and fees use BPS (10000 = 100%).
 */
const BPS = 10_000

/**
 * Index precision.
 * Liquidity/borrow indexes use 8-decimal fixed point.
 */
const INDEX_PRECISION = 1e8

export interface ZestV2ReserveData {
  marketUid: string
  name: string
  assetId: number
  symbol: string
  // Vault name for reference
  vault: string
  // Token amounts
  totalSupplyShares: number
  totalBorrows: number
  availableLiquidity: number
  totalDeposits: number
  // USD amounts
  totalDepositsUSD: number
  totalBorrowsUSD: number
  availableLiquidityUSD: number
  // Rates (annualized, as decimals e.g. 0.05 = 5%)
  supplyRate: number
  borrowRate: number
  // Indexes
  borrowIndex: number
  liquidityIndex: number
  // Config
  decimals: number
  collateralEnabled: boolean
  debtEnabled: boolean
  // Z-token info
  zTokenId: number
  zTokenSymbol: string
  zTokenCollateralEnabled: boolean
  // Asset registry metadata
  oracleType: string | null
  principal: string | null
  // Egroup LTV (from z-token's efficiency group, BPS / 10000)
  baseLtv: number
  liquidationThreshold: number
  // asset metadata from token list (undefined if not found)
  asset?: StacksToken
  // Structured config (matches V1 shape for unified rendering)
  config: Record<number, ZestV2Config>
  params?: { metadata: { vault: string; zTokenId: number; zTokenSymbol: string } }
}

export interface ZestV2Config {
  category: number
  borrowCollateralFactor: number
  collateralFactor: number
  borrowFactor: number
  collateralDisabled: boolean
  debtDisabled: boolean
}

export interface ZestV2AssetStatus {
  assetId: number
  symbol: string
  collateralEnabled: boolean
  debtEnabled: boolean
}

export interface ZestV2PublicResponse {
  data: Record<string, ZestV2ReserveData>
  assetStatuses: Record<number, ZestV2AssetStatus>
  chainId: string
}

/**
 * Returns a [converter, expectedCount] tuple.
 * The converter takes raw StacksCallResult[] and returns parsed V2 reserve data.
 */
export function getZestV2ReservesDataConverter(
  prices: Record<string, number> = {},
): [
  (results: StacksCallResult[]) => ZestV2PublicResponse | undefined,
  number,
] {
  const expectedCount = getExpectedCallCount()
  const nUnderlying = ZEST_V2_UNDERLYING_IDS.length

  const converter = (
    results: StacksCallResult[],
  ): ZestV2PublicResponse | undefined => {
    if (results.length !== expectedCount) {
      console.warn(
        `Zest V2: expected ${expectedCount} results, got ${results.length}`,
      )
      return undefined
    }

    // Validate sections 1-3 (egroup resolve in section 4 may legitimately fail)
    const section4Start_ = nUnderlying * (ASSET_REGISTRY_CALLS_PER_ASSET + VAULT_CALLS_PER_UNDERLYING) + ZEST_V2_ALL_ASSET_IDS.length
    const failedIdx = results.slice(0, section4Start_).findIndex((r) => !r.okay)
    if (failedIdx !== -1) {
      console.warn(
        `Zest V2: call at index ${failedIdx} failed: ${results[failedIdx].result}`,
      )
      return undefined
    }

    // --- Section offsets ---
    const section1Start = 0
    const section2Start = nUnderlying * ASSET_REGISTRY_CALLS_PER_ASSET
    const section3Start =
      section2Start + nUnderlying * VAULT_CALLS_PER_UNDERLYING
    const section4Start = section3Start + ZEST_V2_ALL_ASSET_IDS.length

    // --- Parse Section 3: all asset statuses ---
    const assetStatuses: Record<number, ZestV2AssetStatus> = {}
    ZEST_V2_ALL_ASSET_IDS.forEach((aid, i) => {
      const statusResult = results[section3Start + i]
      const status = decodeAssetStatus(statusResult)
      assetStatuses[aid] = {
        assetId: aid,
        symbol: ZEST_V2_SYMBOLS[aid] ?? `asset-${aid}`,
        collateralEnabled: status?.collateralEnabled ?? false,
        debtEnabled: status?.debtEnabled ?? false,
      }
    })

    // --- Parse Section 4: egroup resolve per z-token ---
    // resolve() may fail (error response) for assets without an egroup
    const egroupLtvs: Record<number, { baseLtv: number; liquidationThreshold: number }> = {}
    for (let i = 0; i < nUnderlying; i++) {
      const aid = ZEST_V2_UNDERLYING_IDS[i]
      const egResult = results[section4Start + i]
      const parsed = decodeEGroupResolve(egResult)
      if (parsed) egroupLtvs[aid] = parsed
    }

    // --- Parse Sections 1 & 2: per-underlying reserve data ---
    const reserveData: Record<string, ZestV2ReserveData> = {}

    for (let i = 0; i < nUnderlying; i++) {
      const aid = ZEST_V2_UNDERLYING_IDS[i]
      const symbol = ZEST_V2_SYMBOLS[aid] ?? `asset-${aid}`
      const zTokenId = aid + 1
      const zTokenSymbol = ZEST_V2_SYMBOLS[zTokenId] ?? `z-${symbol}`
      const vault = ZEST_V2_VAULT_FOR_ASSET[aid]
      const marketUid = `${STACKS_CHAIN_ID}:zest-v2:${aid}`

      // Section 1: asset registry calls
      const regBase = section1Start + i * ASSET_REGISTRY_CALLS_PER_ASSET
      const assetLookup = decodeAssetLookup(results[regBase])
      const assetStatus = decodeAssetStatus(results[regBase + 1])
      const cachedIndexes = decodeCachedIndexes(results[regBase + 2])

      // Section 2: vault calls
      const vaultBase = section2Start + i * VAULT_CALLS_PER_UNDERLYING
      const interestRate = decodeOkUintResult(results[vaultBase])
      const utilization = decodeOkUintResult(results[vaultBase + 1])
      const feeReserve = decodeOkUintResult(results[vaultBase + 2])
      const totalSupplyShares = decodeOkUintResult(results[vaultBase + 3])
      const totalBorrows = decodeOkUintResult(results[vaultBase + 4])
      const availableLiquidity = decodeUintResult(results[vaultBase + 5])

      const decimals = assetLookup?.decimals ?? 8

      const divisor = 10 ** decimals

      // Total deposits = totalBorrows + availableLiquidity
      const totalBorrowsNum = Number(totalBorrows) / divisor
      const availableLiquidityNum = Number(availableLiquidity) / divisor
      const totalDepositsNum = totalBorrowsNum + availableLiquidityNum

      const price =
        prices[marketUid] ?? prices[symbol.toLowerCase()] ?? prices[symbol] ?? 0

      reserveData[marketUid] = {
        marketUid,
        name: `Zest V2 ${symbol}`,
        assetId: aid,
        symbol,
        vault: vault.name,
        // Amounts
        totalSupplyShares: Number(totalSupplyShares) / divisor,
        totalBorrows: totalBorrowsNum,
        availableLiquidity: availableLiquidityNum,
        totalDeposits: totalDepositsNum,
        // USD
        totalDepositsUSD: totalDepositsNum * price,
        totalBorrowsUSD: totalBorrowsNum * price,
        availableLiquidityUSD: availableLiquidityNum * price,
        // Rates (BPS: 10000 = 100%)
        // supplyRate = borrowRate * utilization * (1 - feeReserve)
        supplyRate:
          (Number(interestRate) / BPS) *
          (Number(utilization) / BPS) *
          (1 - Number(feeReserve) / BPS),
        borrowRate: Number(interestRate) / BPS,
        // Indexes
        borrowIndex: Number(cachedIndexes?.index ?? 0) / INDEX_PRECISION,
        liquidityIndex:
          Number(cachedIndexes?.lindex ?? 0) / INDEX_PRECISION,
        // Config
        decimals,
        collateralEnabled: assetStatus?.collateralEnabled ?? false,
        debtEnabled: assetStatus?.debtEnabled ?? false,
        // Z-token
        zTokenId,
        zTokenSymbol,
        zTokenCollateralEnabled:
          assetStatuses[zTokenId]?.collateralEnabled ?? false,
        // Metadata
        oracleType: assetLookup?.oracleType ?? null,
        principal: assetLookup?.principal ?? null,
        // Egroup LTV
        baseLtv: egroupLtvs[aid]?.baseLtv ?? 0,
        liquidationThreshold: egroupLtvs[aid]?.liquidationThreshold ?? 0,
        // Asset metadata from token list
        asset: assetLookup?.principal ? lookupToken(assetLookup.principal) : undefined,
        // Structured config
        config: {
          0: {
            category: 0,
            borrowCollateralFactor: egroupLtvs[aid]?.baseLtv ?? 0,
            collateralFactor: egroupLtvs[aid]?.liquidationThreshold ?? 0,
            borrowFactor: 1,
            collateralDisabled: !(assetStatus?.collateralEnabled ?? false),
            debtDisabled: !(assetStatus?.debtEnabled ?? false),
          },
        },
        params: {
          metadata: { vault: vault.name, zTokenId, zTokenSymbol },
        },
      }
    }

    return {
      data: reserveData,
      assetStatuses,
      chainId: STACKS_CHAIN_ID,
    }
  }

  return [converter, expectedCount]
}

// --- Internal decode helpers ---

interface DecodedAssetLookup {
  principal: string | null
  decimals: number
  oracleType: string | null
}

function decodeAssetLookup(
  result: StacksCallResult,
): DecodedAssetLookup | null {
  try {
    const decoded = decodeClarityValue(result.result)
    const t = extractTuple(decoded)
    return {
      principal: t?.['asset']?.value ?? t?.['principal']?.value ?? null,
      decimals: Number(t?.['decimals']?.value ?? 8),
      oracleType: t?.['oracle-type']?.value ?? null,
    }
  } catch {
    return null
  }
}

interface DecodedAssetStatus {
  collateralEnabled: boolean
  debtEnabled: boolean
}

function decodeAssetStatus(
  result: StacksCallResult,
): DecodedAssetStatus | null {
  try {
    const decoded = decodeClarityValue(result.result)
    // Status may return a tuple with collateral/debt flags or a bitmask
    const t = extractTuple(decoded)
    if (t?.['collateral'] !== undefined) {
      return {
        collateralEnabled: t['collateral']?.value === true,
        debtEnabled: t['debt']?.value === true,
      }
    }
    // Fallback: may be a single uint bitmask
    return {
      collateralEnabled: true,
      debtEnabled: true,
    }
  } catch {
    return null
  }
}

interface DecodedCachedIndexes {
  index: bigint
  lindex: bigint
}

function decodeCachedIndexes(
  result: StacksCallResult,
): DecodedCachedIndexes | null {
  try {
    const decoded = decodeClarityValue(result.result)
    const t = extractTuple(decoded)
    return {
      index: BigInt(t?.['index']?.value ?? 0),
      lindex: BigInt(t?.['lindex']?.value ?? 0),
    }
  } catch {
    return null
  }
}

function decodeUintResult(result: StacksCallResult): bigint {
  try {
    const decoded = decodeClarityValue(result.result)
    return extractUint(decoded)
  } catch {
    return 0n
  }
}

/** Decode a (response uint ...) result, unwrapping the ok wrapper */
function decodeOkUintResult(result: StacksCallResult): bigint {
  try {
    const decoded = decodeClarityValue(result.result)
    // (ok uint) → { success: true, value: { type: "uint128", value: "..." } }
    const inner = decoded?.success === true ? decoded.value : decoded
    if (inner?.value !== undefined && typeof inner.value !== 'object') {
      return BigInt(inner.value)
    }
    return extractUint(inner)
  } catch {
    return 0n
  }
}

/**
 * Decode v0-egroup.resolve() result.
 * Returns (ok tuple) on success or (err uint) if no egroup exists.
 * LTV values are (buff 2) in BPS (10000 = 100%).
 */
function decodeEGroupResolve(
  result: StacksCallResult,
): { baseLtv: number; liquidationThreshold: number } | null {
  try {
    if (!result.okay) return null
    const decoded = decodeClarityValue(result.result)
    // resolve returns (response (tuple ...) uint) — check for success
    if (decoded?.success === false) return null
    const t = extractTuple(decoded?.value ?? decoded)
    const ltvBorrow = decodeBuff2Bps(t?.['LTV-BORROW'])
    const ltvLiqPartial = decodeBuff2Bps(t?.['LTV-LIQ-PARTIAL'])
    return {
      baseLtv: ltvBorrow,
      liquidationThreshold: ltvLiqPartial,
    }
  } catch {
    return null
  }
}

/** Decode a (buff 2) BPS value to a decimal (e.g. 6000 -> 0.6) */
function decodeBuff2Bps(field: any): number {
  if (!field) return 0
  const hex = String(field.value ?? field).replace('0x', '')
  return parseInt(hex, 16) / 10000
}
