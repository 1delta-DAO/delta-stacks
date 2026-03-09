import { StacksCallResult } from '../../../stacks-call'
import { decodeClarityValue, extractTuple, extractUint, extractBool } from '../../../stacks-call'
import { CALLS_PER_MARKET, getExpectedCallCount } from './publicCallBuild'
import { GRANITE_MARKETS, GRANITE_COLLATERAL_TOKENS, GRANITE_COLLATERAL_PRECISION, GRANITE_COLLATERAL_META, GRANITE_ASSET_PRINCIPALS } from './constants'
import { lookupToken } from '../../../token-list'
import type { StacksToken } from '../../../token-list'

const STACKS_CHAIN_ID = 'stacks-mainnet'

/** Granite IR params use 1e12 precision (1e12 = 100%) */
const IR_PRECISION = 1e12
/** Protocol reserve percentage uses 1e8 precision */
const RESERVE_PCT_PRECISION = 1e8

export interface GraniteMarketData {
  marketUid: string
  name: string
  marketId: string
  symbol: string
  deployer: string
  // Pool state
  totalAssets: number
  totalShares: number
  openInterest: number
  totalDebtShares: number
  reserveBalance: number
  assetCap: number
  protocolReservePercentage: number
  // Derived
  availableLiquidity: number
  utilization: number
  // USD amounts (requires prices)
  totalAssetsUSD: number
  openInterestUSD: number
  availableLiquidityUSD: number
  // Rates (annualized, as decimals e.g. 0.05 = 5%)
  borrowRate: number
  supplyRate: number
  // Interest rate model params
  irParams: {
    baseIr: number
    irSlope1: number
    irSlope2: number
    utilizationKink: number
  }
  // Flags
  borrowEnabled: boolean
  depositEnabled: boolean
  // Collateral LTV (only set on collateral entries)
  baseLtv: number
  liquidationThreshold: number
  liquidationPremium: number
  collaterals: GraniteCollateralConfig[]
  /**
   * true for collateral-only entries (e.g. sBTC).
   * Collateral assets are not borrowable — rates and pool state are 0.
   */
  isCollateral: boolean
  /** For collateral entries, the parent borrowable market id (e.g. 'aeusdc') */
  parentMarketId?: string
  /** Asset metadata from token list (undefined if not found) */
  asset?: StacksToken
  /** Protocol-specific metadata */
  params?: { metadata: { deployer: string; marketId: string } }
}

export interface GraniteCollateralConfig {
  token: string
  maxLtv: number
  liquidationLtv: number
  liquidationPremium: number
  decimals: number
}

export interface GranitePublicResponse {
  data: Record<string, GraniteMarketData>
  chainId: string
}

export function getGraniteReservesDataConverter(
  prices: Record<string, number> = {},
): [
  (results: StacksCallResult[]) => GranitePublicResponse | undefined,
  number,
] {
  const expectedCount = getExpectedCallCount()

  const converter = (
    results: StacksCallResult[],
  ): GranitePublicResponse | undefined => {
    if (results.length !== expectedCount) {
      console.warn(
        `Granite: expected ${expectedCount} results, got ${results.length}`,
      )
      return undefined
    }

    // Validate market calls only (collateral calls may return none for unknown tokens)
    const marketCallCount = GRANITE_MARKETS.length * CALLS_PER_MARKET
    const failedIdx = results.slice(0, marketCallCount).findIndex((r) => !r.okay)
    if (failedIdx !== -1) {
      console.warn(
        `Granite: call at index ${failedIdx} failed: ${results[failedIdx].result}`,
      )
      return undefined
    }

    const data: Record<string, GraniteMarketData> = {}

    for (let i = 0; i < GRANITE_MARKETS.length; i++) {
      const market = GRANITE_MARKETS[i]
      const base = i * CALLS_PER_MARKET
      const marketUid = `${STACKS_CHAIN_ID}:granite:${market.id}`

      // 0: get-lp-params -> { total-assets, total-shares }
      const lpParams = decodeTuple(results[base])
      const totalAssets = extractBigInt(lpParams, 'total-assets')
      const totalShares = extractBigInt(lpParams, 'total-shares')

      // 1: get-debt-params -> { open-interest, total-debt-shares }
      const debtParams = decodeTuple(results[base + 1])
      const openInterest = extractBigInt(debtParams, 'open-interest')
      const totalDebtShares = extractBigInt(debtParams, 'total-debt-shares')

      // 2: get-open-interest -> { lp-open-interest, protocol-open-interest, staked-open-interest }
      // (We already have total open-interest from debt-params; this gives breakdown)

      // 3: get-reserve-balance -> uint
      const reserveBalance = decodeUintValue(results[base + 3])

      // 4: get-asset-cap -> uint
      const assetCap = decodeUintValue(results[base + 4])

      // 5: is-borrow-enabled -> bool
      const borrowEnabled = decodeBoolValue(results[base + 5])

      // 6: is-deposit-asset-enabled -> bool
      const depositEnabled = decodeBoolValue(results[base + 6])

      // 7: get-ir-params -> { base-ir, ir-slope-1, ir-slope-2, utilization-kink }
      const irTuple = decodeTuple(results[base + 7])
      const baseIr = extractBigInt(irTuple, 'base-ir')
      const irSlope1 = extractBigInt(irTuple, 'ir-slope-1')
      const irSlope2 = extractBigInt(irTuple, 'ir-slope-2')
      const utilizationKink = extractBigInt(irTuple, 'utilization-kink')

      // 8: get-protocol-reserve-percentage -> uint
      const protocolReservePercentage = decodeUintValue(results[base + 8])

      const decimals = 6 // both aeUSDC and USDCx use 6 decimals
      const divisor = 10 ** decimals

      const totalAssetsNum = Number(totalAssets) / divisor
      const openInterestNum = Number(openInterest) / divisor
      const availableLiquidity = totalAssetsNum - openInterestNum
      const utilization = totalAssetsNum > 0 ? openInterestNum / totalAssetsNum : 0

      // Compute borrow rate from IR model params
      const borrowRate = computeBorrowRate(
        Number(baseIr),
        Number(irSlope1),
        Number(irSlope2),
        Number(utilizationKink),
        utilization,
      )

      // Supply rate = borrow rate * utilization * (1 - protocol reserve %)
      const protocolReservePct = Number(protocolReservePercentage) / RESERVE_PCT_PRECISION
      const supplyRate = borrowRate * utilization * (1 - protocolReservePct)

      const price =
        prices[marketUid] ?? prices[market.symbol.toLowerCase()] ?? prices[market.symbol] ?? 0

      data[marketUid] = {
        marketUid,
        name: `Granite ${market.symbol}`,
        marketId: market.id,
        symbol: market.symbol,
        deployer: market.deployer,
        totalAssets: totalAssetsNum,
        totalShares: Number(totalShares) / divisor,
        openInterest: openInterestNum,
        totalDebtShares: Number(totalDebtShares) / divisor,
        reserveBalance: Number(reserveBalance) / divisor,
        assetCap: Number(assetCap) / divisor,
        protocolReservePercentage: protocolReservePct,
        availableLiquidity,
        utilization,
        totalAssetsUSD: totalAssetsNum * price,
        openInterestUSD: openInterestNum * price,
        availableLiquidityUSD: availableLiquidity * price,
        borrowRate,
        supplyRate,
        irParams: {
          baseIr: Number(baseIr) / IR_PRECISION,
          irSlope1: Number(irSlope1) / IR_PRECISION,
          irSlope2: Number(irSlope2) / IR_PRECISION,
          utilizationKink: Number(utilizationKink) / IR_PRECISION,
        },
        borrowEnabled,
        depositEnabled,
        baseLtv: 0,
        liquidationThreshold: 0,
        liquidationPremium: 0,
        collaterals: [],
        isCollateral: false,
        asset: GRANITE_ASSET_PRINCIPALS[market.id] ? lookupToken(GRANITE_ASSET_PRINCIPALS[market.id]) : undefined,
        params: { metadata: { deployer: market.deployer, marketId: market.id } },
      }
    }

    // Parse collateral config calls (section 2)
    // Emit separate collateral entries (e.g. sBTC) with LTV data and 0 rates
    const collateralStart = GRANITE_MARKETS.length * CALLS_PER_MARKET
    let collateralIdx = collateralStart
    for (const market of GRANITE_MARKETS) {
      const marketUid = `${STACKS_CHAIN_ID}:granite:${market.id}`
      const tokens = GRANITE_COLLATERAL_TOKENS[market.id] ?? []
      const collaterals: GraniteCollateralConfig[] = []

      for (const token of tokens) {
        const result = results[collateralIdx++]
        if (!result?.okay) continue
        const parsed = decodeCollateralConfig(result, token)
        if (parsed) collaterals.push(parsed)
      }

      if (data[marketUid]) {
        data[marketUid].collaterals = collaterals
      }

      // Emit a collateral-only entry per collateral token
      for (const col of collaterals) {
        const meta = GRANITE_COLLATERAL_META[col.token]
        if (!meta) continue
        const colUid = `${STACKS_CHAIN_ID}:granite:${market.id}:${meta.symbol.toLowerCase()}`
        data[colUid] = {
          marketUid: colUid,
          name: `Granite ${meta.symbol} (${market.symbol})`,
          marketId: `${market.id}:${meta.symbol.toLowerCase()}`,
          symbol: meta.symbol,
          deployer: market.deployer,
          totalAssets: 0,
          totalShares: 0,
          openInterest: 0,
          totalDebtShares: 0,
          reserveBalance: 0,
          assetCap: 0,
          protocolReservePercentage: 0,
          availableLiquidity: 0,
          utilization: 0,
          totalAssetsUSD: 0,
          openInterestUSD: 0,
          availableLiquidityUSD: 0,
          borrowRate: 0,
          supplyRate: 0,
          irParams: { baseIr: 0, irSlope1: 0, irSlope2: 0, utilizationKink: 0 },
          borrowEnabled: false,
          depositEnabled: true,
          baseLtv: col.maxLtv,
          liquidationThreshold: col.liquidationLtv,
          liquidationPremium: col.liquidationPremium,
          collaterals: [],
          isCollateral: true,
          parentMarketId: market.id,
          asset: lookupToken(col.token),
          params: { metadata: { deployer: market.deployer, marketId: `${market.id}:${meta.symbol.toLowerCase()}` } },
        }
      }
    }

    return { data, chainId: STACKS_CHAIN_ID }
  }

  return [converter, expectedCount]
}

// --- Internal helpers ---

/**
 * Compute borrow rate using linear-kinked model.
 * If utilization <= kink:  rate = base + slope1 * utilization
 * If utilization >  kink:  rate = base + slope1 * kink + slope2 * (utilization - kink)
 */
function computeBorrowRate(
  baseIr: number,
  slope1: number,
  slope2: number,
  kink: number,
  utilization: number,
): number {
  const base = baseIr / IR_PRECISION
  const s1 = slope1 / IR_PRECISION
  const s2 = slope2 / IR_PRECISION
  const k = kink / IR_PRECISION

  if (utilization <= k) {
    return base + s1 * utilization
  }
  return base + s1 * k + s2 * (utilization - k)
}

function decodeTuple(
  result: StacksCallResult,
): Record<string, any> | null {
  try {
    const decoded = decodeClarityValue(result.result)
    return extractTuple(decoded)
  } catch {
    return null
  }
}

function extractBigInt(tuple: Record<string, any> | null, key: string): bigint {
  try {
    return BigInt(tuple?.[key]?.value ?? 0)
  } catch {
    return 0n
  }
}

function decodeUintValue(result: StacksCallResult): bigint {
  try {
    const decoded = decodeClarityValue(result.result)
    return extractUint(decoded)
  } catch {
    return 0n
  }
}

function decodeBoolValue(result: StacksCallResult): boolean {
  try {
    const decoded = decodeClarityValue(result.result)
    return extractBool(decoded)
  } catch {
    return false
  }
}

/**
 * Decode state-v1.get-collateral(principal) result.
 * Returns (optional (tuple (decimals uint) (liquidation-ltv uint)
 *   (liquidation-premium uint) (max-ltv uint)))
 * Values use 1e8 precision.
 */
function decodeCollateralConfig(
  result: StacksCallResult,
  token: string,
): GraniteCollateralConfig | null {
  try {
    const decoded = decodeClarityValue(result.result)
    // Unwrap optional — if none, value is null
    let inner = decoded
    if (inner?.value !== undefined && inner?.value !== null) inner = inner.value
    if (inner?.value !== undefined && inner?.value !== null) inner = inner.value
    if (!inner || typeof inner !== 'object') return null

    const maxLtv = Number(inner['max-ltv']?.value ?? 0) / GRANITE_COLLATERAL_PRECISION
    const liquidationLtv = Number(inner['liquidation-ltv']?.value ?? 0) / GRANITE_COLLATERAL_PRECISION
    const liquidationPremium = Number(inner['liquidation-premium']?.value ?? 0) / GRANITE_COLLATERAL_PRECISION
    const decimals = Number(inner['decimals']?.value ?? 8)

    return { token, maxLtv, liquidationLtv, liquidationPremium, decimals }
  } catch {
    return null
  }
}
