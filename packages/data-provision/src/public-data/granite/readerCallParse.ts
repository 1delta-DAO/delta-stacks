import { StacksCallResult } from '../../stacks-call'
import { decodeClarityValue, extractTuple } from '../../stacks-call'
import { GRANITE_MARKETS } from './constants'
import type { GraniteMarketData, GranitePublicResponse } from './publicCallParse'

const STACKS_CHAIN_ID = 'stacks-mainnet'
const RATE_PRECISION = 1e18

/**
 * Parse results from the per-market reader calls built by buildGraniteReaderCalls.
 *
 * Layout: [0] granite-stx, [1] granite-usdcx
 *
 * Each result is a tuple:
 *   { lp-params, debt-params, open-interest, reserve-balance, asset-cap,
 *     borrow-enabled, deposit-enabled, ir-params, protocol-reserve-pct }
 */
export function parseGraniteReaderResults(
  results: StacksCallResult[],
  prices: Record<string, number> = {},
): GranitePublicResponse | undefined {
  if (results.length !== GRANITE_MARKETS.length) {
    console.warn(`Granite reader: expected ${GRANITE_MARKETS.length} results, got ${results.length}`)
    return undefined
  }

  try {
    const data: Record<string, GraniteMarketData> = {}

    for (let i = 0; i < GRANITE_MARKETS.length; i++) {
      const result = results[i]
      if (!result.okay) continue

      const market = GRANITE_MARKETS[i]
      const decoded = decodeClarityValue(result.result)
      const marketTuple = decoded?.value ?? decoded
      if (!marketTuple || typeof marketTuple !== 'object') continue

      const marketUid = `${STACKS_CHAIN_ID}:granite:${market.id}`

      const lpParams = extractNestedTuple(marketTuple['lp-params'])
      const debtParams = extractNestedTuple(marketTuple['debt-params'])
      const irParams = extractNestedTuple(marketTuple['ir-params'])

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

      const decimals = market.id === 'stx' ? 6 : 8
      const divisor = 10 ** decimals

      const totalAssetsNum = Number(totalAssets) / divisor
      const openInterestNum = Number(openInterest) / divisor
      const availableLiquidity = totalAssetsNum - openInterestNum
      const utilization = totalAssetsNum > 0 ? openInterestNum / totalAssetsNum : 0

      const borrowRate = computeBorrowRate(
        Number(baseIr), Number(irSlope1), Number(irSlope2),
        Number(utilizationKink), utilization,
      )
      const protocolReservePct = Number(protocolReservePercentage) / RATE_PRECISION
      const supplyRate = borrowRate * utilization * (1 - protocolReservePct)

      const price = prices[market.symbol.toLowerCase()] ?? prices[market.symbol] ?? 0

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
          baseIr: Number(baseIr) / RATE_PRECISION,
          irSlope1: Number(irSlope1) / RATE_PRECISION,
          irSlope2: Number(irSlope2) / RATE_PRECISION,
          utilizationKink: Number(utilizationKink) / RATE_PRECISION,
        },
        borrowEnabled,
        depositEnabled,
      }
    }

    return { data, chainId: STACKS_CHAIN_ID }
  } catch (e) {
    console.warn('Granite reader: parse error', e)
    return undefined
  }
}

function computeBorrowRate(
  baseIr: number, slope1: number, slope2: number,
  kink: number, utilization: number,
): number {
  const base = baseIr / RATE_PRECISION
  const s1 = slope1 / RATE_PRECISION
  const s2 = slope2 / RATE_PRECISION
  const k = kink / RATE_PRECISION
  if (utilization <= k) return base + s1 * utilization
  return base + s1 * k + s2 * (utilization - k)
}

function extractNestedTuple(field: any): Record<string, any> | null {
  if (!field) return null
  if (field.value && typeof field.value === 'object') return field.value
  if (typeof field === 'object') return field
  return null
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
