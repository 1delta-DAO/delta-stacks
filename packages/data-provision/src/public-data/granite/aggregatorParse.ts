import { StacksCallResult } from '../../stacks-call'
import { decodeClarityValue, extractTuple, extractUint, extractBool } from '../../stacks-call'
import { GRANITE_MARKETS } from './constants'
import type { GraniteMarketData, GranitePublicResponse } from './publicCallParse'

const STACKS_CHAIN_ID = 'stacks-mainnet'
const IR_PRECISION = 1e12
const RESERVE_PCT_PRECISION = 1e8

/**
 * Parse the result of a single aggregator call to the reader contract's
 * `get-granite-reserve-data` function.
 *
 * The aggregator returns:
 *   (ok {
 *     aeusdc: { lp-params, debt-params, open-interest, reserve-balance, asset-cap,
 *               borrow-enabled, deposit-enabled, ir-params, protocol-reserve-pct },
 *     usdcx:  { ... same ... },
 *   })
 */
export function parseGraniteAggregatorResult(
  result: StacksCallResult,
  prices: Record<string, number> = {},
): GranitePublicResponse | undefined {
  if (!result.okay) {
    console.warn('Granite aggregator: call failed', result.result)
    return undefined
  }

  try {
    const decoded = decodeClarityValue(result.result)
    // Unwrap (ok ...) response
    const outerTuple = extractTuple(decoded)
    if (!outerTuple) return undefined

    const data: Record<string, GraniteMarketData> = {}

    for (const market of GRANITE_MARKETS) {
      const marketTuple = extractTuple(outerTuple[market.id]?.value ?? outerTuple[market.id])
      if (!marketTuple) continue

      const marketUid = `${STACKS_CHAIN_ID}:granite:${market.id}`

      // Extract nested tuples
      const lpParams = extractTuple(marketTuple['lp-params'])
      const debtParams = extractTuple(marketTuple['debt-params'])
      const irParams = extractTuple(marketTuple['ir-params'])

      const totalAssets = getBigInt(lpParams, 'total-assets')
      const totalShares = getBigInt(lpParams, 'total-shares')
      const openInterest = getBigInt(debtParams, 'open-interest')
      const totalDebtShares = getBigInt(debtParams, 'total-debt-shares')
      const reserveBalance = getBigInt(marketTuple, 'reserve-balance')
      const assetCap = getBigInt(marketTuple, 'asset-cap')
      const protocolReservePercentage = getBigInt(marketTuple, 'protocol-reserve-pct')

      const borrowEnabled = getBool(marketTuple, 'borrow-enabled')
      const depositEnabled = getBool(marketTuple, 'deposit-enabled')

      const baseIr = getBigInt(irParams, 'base-ir')
      const irSlope1 = getBigInt(irParams, 'ir-slope-1')
      const irSlope2 = getBigInt(irParams, 'ir-slope-2')
      const utilizationKink = getBigInt(irParams, 'utilization-kink')

      const decimals = 6 // both aeUSDC and USDCx use 6 decimals
      const divisor = 10 ** decimals

      const totalAssetsNum = Number(totalAssets) / divisor
      const openInterestNum = Number(openInterest) / divisor
      const availableLiquidity = totalAssetsNum - openInterestNum
      const utilization = totalAssetsNum > 0 ? openInterestNum / totalAssetsNum : 0

      const borrowRate = computeBorrowRate(
        Number(baseIr), Number(irSlope1), Number(irSlope2),
        Number(utilizationKink), utilization,
      )
      const protocolReservePct = Number(protocolReservePercentage) / RESERVE_PCT_PRECISION
      const supplyRate = borrowRate * utilization * (1 - protocolReservePct)

      const price = prices[marketUid] ?? prices[market.symbol.toLowerCase()] ?? prices[market.symbol] ?? 0

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
        // Collateral config not available from aggregator — populated via get-collateral calls
        baseLtv: 0,
        liquidationThreshold: 0,
        liquidationPremium: 0,
        collaterals: [],
        isCollateral: false,
      }
    }

    return { data, chainId: STACKS_CHAIN_ID }
  } catch (e) {
    console.warn('Granite aggregator: parse error', e)
    return undefined
  }
}

// --- helpers ---

function computeBorrowRate(
  baseIr: number, slope1: number, slope2: number,
  kink: number, utilization: number,
): number {
  const base = baseIr / IR_PRECISION
  const s1 = slope1 / IR_PRECISION
  const s2 = slope2 / IR_PRECISION
  const k = kink / IR_PRECISION
  if (utilization <= k) return base + s1 * utilization
  return base + s1 * k + s2 * (utilization - k)
}

function getBigInt(tuple: Record<string, any> | null, key: string): bigint {
  try {
    const v = tuple?.[key]
    if (!v) return 0n
    if (typeof v.value === 'bigint') return v.value
    return BigInt(v.value ?? 0)
  } catch { return 0n }
}

function getBool(tuple: Record<string, any> | null, key: string): boolean {
  try {
    const v = tuple?.[key]
    if (!v) return false
    return v.value === true || v.type === 'bool' && v.value === true
  } catch { return false }
}
