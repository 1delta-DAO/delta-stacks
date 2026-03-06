import { StacksCallResult } from '../../stacks-call'
import { decodeClarityValue, extractTuple } from '../../stacks-call'
import { GRANITE_MARKETS, GRANITE_COLLATERAL_TOKENS, GRANITE_COLLATERAL_PRECISION } from './constants'
import type { GraniteMarketData, GranitePublicResponse, GraniteCollateralConfig } from './publicCallParse'

const STACKS_CHAIN_ID = 'stacks-mainnet'
const RATE_PRECISION = 1e18

/**
 * Parse results from the per-market reader calls + collateral config calls.
 *
 * Layout: [0..2) reader results, [2..) collateral config results
 */
export function parseGraniteReaderResults(
  results: StacksCallResult[],
  prices: Record<string, number> = {},
): GranitePublicResponse | undefined {
  const nCollateral = GRANITE_MARKETS.reduce(
    (sum, m) => sum + (GRANITE_COLLATERAL_TOKENS[m.id]?.length ?? 0), 0,
  )
  const expectedCount = GRANITE_MARKETS.length + nCollateral

  if (results.length !== expectedCount) {
    console.warn(`Granite reader: expected ${expectedCount} results, got ${results.length}`)
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
        baseLtv: 0,
        liquidationThreshold: 0,
        collaterals: [],
      }
    }

    // Parse collateral config results
    let collateralIdx = GRANITE_MARKETS.length
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

      if (data[marketUid] && collaterals.length > 0) {
        data[marketUid].collaterals = collaterals
        const best = collaterals.reduce((a, b) => a.maxLtv > b.maxLtv ? a : b)
        data[marketUid].baseLtv = best.maxLtv
        data[marketUid].liquidationThreshold = best.liquidationLtv
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

function decodeCollateralConfig(
  result: StacksCallResult,
  token: string,
): GraniteCollateralConfig | null {
  try {
    const decoded = decodeClarityValue(result.result)
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
