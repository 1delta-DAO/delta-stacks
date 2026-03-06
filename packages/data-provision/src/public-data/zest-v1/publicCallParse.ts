import { StacksCallResult } from '../../stacks-call'
import { decodeClarityValue, extractTuple, extractUint } from '../../stacks-call'
import { CALLS_PER_ASSET, getExpectedCallCount, ZEST_EMODE_TYPES } from './publicCallBuild'
import {
  getZestAssets,
  ZEST_ASSET_SYMBOLS,
  ZEST_NON_BORROWABLE,
  ZEST_Z_TOKENS,
} from './constants'

const STACKS_CHAIN_ID = 'stacks-mainnet'
// Zest uses 8-decimal fixed point for rates and LTV/threshold values (1e8 = 100%)
const RATE_PRECISION = 1e8

export interface ZestReserveData {
  marketUid: string
  name: string
  poolId: string
  underlying: string
  symbol: string
  // token amounts
  totalDeposits: number
  totalDebtStable: number
  totalDebt: number
  totalLiquidity: number
  // USD amounts (populated externally if prices provided)
  totalDepositsUSD: number
  totalDebtStableUSD: number
  totalDebtUSD: number
  totalLiquidityUSD: number
  // rates (annualized, as decimals e.g. 0.05 = 5%)
  depositRate: number
  variableBorrowRate: number
  stableBorrowRate: number
  // config
  decimals: number
  config: Record<number, ZestEModeConfig>
  collateralActive: boolean
  borrowingEnabled: boolean
  isActive: boolean
  isFrozen: boolean
  supplyCap: number
  borrowCap: number
  debtCeiling: number
  liquidationThreshold: number
  liquidationBonus: number
  baseLtv: number
  // metadata
  zToken: string | undefined
}

export interface ZestEModeConfig {
  category: number
  label: string
  borrowCollateralFactor: number
  collateralFactor: number
  borrowFactor: number
  collateralDisabled: boolean
  debtDisabled: boolean
}

export interface ZestPublicResponse {
  data: Record<string, ZestReserveData>
  chainId: string
}

/**
 * Returns a [converter, expectedCount] tuple, matching the Aave-style pattern.
 * The converter takes raw StacksCallResult[] and returns parsed reserve data.
 */
export function getZestReservesDataConverter(
  prices: Record<string, number> = {},
): [(results: StacksCallResult[]) => ZestPublicResponse | undefined, number] {
  const expectedCount = getExpectedCallCount()
  const assets = getZestAssets()

  const converter = (
    results: StacksCallResult[],
  ): ZestPublicResponse | undefined => {
    if (results.length !== expectedCount) {
      console.warn(
        `Zest: expected ${expectedCount} results, got ${results.length}`,
      )
      return undefined
    }

    // Validate all calls succeeded
    const failedIdx = results.findIndex((r) => !r.okay)
    if (failedIdx !== -1) {
      console.warn(`Zest: call at index ${failedIdx} failed: ${results[failedIdx].result}`)
      return undefined
    }

    // Decode e-mode configs
    const emodeStart = assets.length * CALLS_PER_ASSET
    const emodeConfigs: Record<number, any> = {}
    ZEST_EMODE_TYPES.forEach((type, i) => {
      try {
        const decoded = decodeClarityValue(results[emodeStart + i].result)
        const tuple = extractTuple(decoded)
        emodeConfigs[type] = {
          label: tuple?.label?.value ?? `E-Mode ${type}`,
          ltv: Number(tuple?.ltv?.value ?? 0),
          liquidationThreshold: Number(
            tuple?.['liquidation-threshold']?.value ?? 0,
          ),
        }
      } catch {
        // E-mode type may not exist
      }
    })

    const reserveData: Record<string, ZestReserveData> = {}

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i]
      const symbol = ZEST_ASSET_SYMBOLS[asset] ?? asset.split('.').pop() ?? ''
      const marketUid = `${STACKS_CHAIN_ID}:zest-v1:${asset}`

      // Decode the 4 per-asset results
      const baseIdx = i * CALLS_PER_ASSET

      // 0: reserve-state tuple
      const reserveState = decodeReserveState(results[baseIdx])
      // 1: supply APY
      const supplyApy = decodeRate(results[baseIdx + 1])
      // 2: borrow APY
      const borrowApy = decodeRate(results[baseIdx + 2])
      // 3: e-mode type
      const assetEModeType = decodeEModeType(results[baseIdx + 3])

      if (!reserveState) continue

      const decimals = Number(reserveState.decimals)
      const divisor = 10 ** decimals

      // Calculate totals from reserve state
      // totalBorrowsVariable is the main debt metric
      const totalDebt =
        Number(reserveState.totalBorrowsVariable) / divisor
      const totalDebtStable =
        Number(reserveState.totalBorrowsStable) / divisor

      // Total deposits = we need to derive from z-token supply or use
      // total borrows + available liquidity conceptually.
      // The reserve state gives us borrows; supply is borrows + available liquidity.
      // We approximate from the rate model: supply ~= totalBorrows / utilization
      // But more accurately, we read the a-token total supply.
      // For now, we use the available data.
      const totalDeposits = totalDebt + totalDebtStable // placeholder - will be enriched
      const totalLiquidity = 0 // will be calculated when we have supply data

      const price = prices[symbol.toLowerCase()] ?? prices[asset] ?? 0

      // Build e-mode config map
      const config: Record<number, ZestEModeConfig> = {}

      // Base mode (no e-mode)
      config[0] = {
        category: 0,
        label: 'Disabled',
        borrowCollateralFactor: Number(reserveState.baseLtvAsCollateral) / RATE_PRECISION,
        collateralFactor: Number(reserveState.liquidationThreshold) / RATE_PRECISION,
        borrowFactor: 1,
        collateralDisabled: !reserveState.usageAsCollateralEnabled,
        debtDisabled: !reserveState.borrowingEnabled,
      }

      // E-mode configs if asset belongs to one
      if (assetEModeType > 0 && emodeConfigs[assetEModeType]) {
        const eCfg = emodeConfigs[assetEModeType]
        config[assetEModeType] = {
          category: assetEModeType,
          label: eCfg.label,
          borrowCollateralFactor: eCfg.ltv / RATE_PRECISION,
          collateralFactor: eCfg.liquidationThreshold / RATE_PRECISION,
          borrowFactor: 1,
          collateralDisabled: !reserveState.usageAsCollateralEnabled,
          debtDisabled: ZEST_NON_BORROWABLE.has(asset),
        }
      }

      reserveData[marketUid] = {
        marketUid,
        name: `Zest ${symbol}`,
        poolId: asset,
        underlying: asset,
        symbol,
        // amounts
        totalDeposits,
        totalDebtStable,
        totalDebt,
        totalLiquidity,
        // USD
        totalDepositsUSD: totalDeposits * price,
        totalDebtStableUSD: totalDebtStable * price,
        totalDebtUSD: totalDebt * price,
        totalLiquidityUSD: totalLiquidity * price,
        // rates
        depositRate: supplyApy / RATE_PRECISION - 1,
        variableBorrowRate: borrowApy / RATE_PRECISION - 1,
        stableBorrowRate: 0, // Zest doesn't have stable rates
        // config
        decimals,
        config,
        collateralActive: reserveState.usageAsCollateralEnabled,
        borrowingEnabled:
          reserveState.borrowingEnabled && !ZEST_NON_BORROWABLE.has(asset),
        isActive: reserveState.isActive,
        isFrozen: reserveState.isFrozen,
        supplyCap: Number(reserveState.supplyCap),
        borrowCap: Number(reserveState.borrowCap),
        debtCeiling: Number(reserveState.debtCeiling),
        liquidationThreshold:
          Number(reserveState.liquidationThreshold) / RATE_PRECISION,
        liquidationBonus: Number(reserveState.liquidationBonus) / RATE_PRECISION,
        baseLtv: Number(reserveState.baseLtvAsCollateral) / RATE_PRECISION,
        // metadata
        zToken: ZEST_Z_TOKENS[asset],
      }
    }

    return {
      data: reserveData,
      chainId: STACKS_CHAIN_ID,
    }
  }

  return [converter, expectedCount]
}

// --- Internal decode helpers ---

interface DecodedReserveState {
  totalBorrowsStable: bigint
  totalBorrowsVariable: bigint
  currentLiquidityRate: bigint
  currentVariableBorrowRate: bigint
  currentStableBorrowRate: bigint
  baseLtvAsCollateral: bigint
  liquidationThreshold: bigint
  liquidationBonus: bigint
  decimals: bigint
  borrowingEnabled: boolean
  usageAsCollateralEnabled: boolean
  isActive: boolean
  isFrozen: boolean
  supplyCap: bigint
  borrowCap: bigint
  debtCeiling: bigint
  aTokenAddress: string
}

function decodeReserveState(
  result: StacksCallResult,
): DecodedReserveState | null {
  try {
    const decoded = decodeClarityValue(result.result)
    const t = extractTuple(decoded)

    return {
      totalBorrowsStable: BigInt(t['total-borrows-stable']?.value ?? 0),
      totalBorrowsVariable: BigInt(t['total-borrows-variable']?.value ?? 0),
      currentLiquidityRate: BigInt(t['current-liquidity-rate']?.value ?? 0),
      currentVariableBorrowRate: BigInt(
        t['current-variable-borrow-rate']?.value ?? 0,
      ),
      currentStableBorrowRate: BigInt(
        t['current-stable-borrow-rate']?.value ?? 0,
      ),
      baseLtvAsCollateral: BigInt(t['base-ltv-as-collateral']?.value ?? 0),
      liquidationThreshold: BigInt(t['liquidation-threshold']?.value ?? 0),
      liquidationBonus: BigInt(t['liquidation-bonus']?.value ?? 0),
      decimals: BigInt(t['decimals']?.value ?? 8),
      borrowingEnabled: t['borrowing-enabled']?.value === true,
      usageAsCollateralEnabled:
        t['usage-as-collateral-enabled']?.value === true,
      isActive: t['is-active']?.value === true,
      isFrozen: t['is-frozen']?.value === true,
      supplyCap: BigInt(t['supply-cap']?.value ?? 0),
      borrowCap: BigInt(t['borrow-cap']?.value ?? 0),
      debtCeiling: BigInt(t['debt-ceiling']?.value ?? 0),
      aTokenAddress: t['a-token-address']?.value ?? '',
    }
  } catch (e) {
    console.warn('Failed to decode reserve state:', e)
    return null
  }
}

function decodeRate(result: StacksCallResult): number {
  try {
    const decoded = decodeClarityValue(result.result)
    return Number(extractUint(decoded))
  } catch {
    return 0
  }
}

function decodeEModeType(result: StacksCallResult): number {
  try {
    const decoded = decodeClarityValue(result.result)
    // E-mode type is returned as (buff 1), decode the byte
    if (decoded?.value) {
      const hex = String(decoded.value)
      return parseInt(hex.replace('0x', ''), 16)
    }
    return 0
  } catch {
    return 0
  }
}
