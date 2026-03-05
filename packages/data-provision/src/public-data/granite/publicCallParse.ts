import { StacksCallResult } from '../../stacks-call'
import { decodeClarityValue, extractTuple, extractUint, extractBool } from '../../stacks-call'
import { CALLS_PER_MARKET, getExpectedCallCount } from './publicCallBuild'
import { GRANITE_MARKETS } from './constants'

const STACKS_CHAIN_ID = 'stacks-mainnet'

/**
 * Granite uses 18-decimal fixed point for rates and interest.
 * 1e18 = 100% per year.
 */
const RATE_PRECISION = 1e18

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

    const failedIdx = results.findIndex((r) => !r.okay)
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

      // STX has 6 decimals, USDCx has 8 decimals
      const decimals = market.id === 'stx' ? 6 : 8
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
      const protocolReservePct = Number(protocolReservePercentage) / RATE_PRECISION
      const supplyRate = borrowRate * utilization * (1 - protocolReservePct)

      const price =
        prices[market.symbol.toLowerCase()] ?? prices[market.symbol] ?? 0

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
  const base = baseIr / RATE_PRECISION
  const s1 = slope1 / RATE_PRECISION
  const s2 = slope2 / RATE_PRECISION
  const k = kink / RATE_PRECISION

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
