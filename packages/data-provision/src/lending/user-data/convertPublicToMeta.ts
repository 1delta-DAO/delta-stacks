/**
 * Converts public lending data (AllLendingData) into LenderCrossPoolMeta
 * for use by user-data fetchers.
 *
 * This bridges the gap between the public data provision output
 * (per-protocol reserve data) and the user data provision input
 * (unified per-market metadata with rates, prices, configs, flags).
 */

import type { AllLendingData } from '../public-data/fetchStacksLender'
import type { ZestReserveData } from '../public-data/zest-v1/publicCallParse'
import type { ZestV2ReserveData } from '../public-data/zest-v2/publicCallParse'
import type { GraniteMarketData } from '../public-data/granite/publicCallParse'
import type { LenderCrossPoolMeta, LenderYieldComplete } from './utils/types'

/**
 * Convert AllLendingData from public data provision into a unified
 * LenderCrossPoolMeta map keyed by marketUid.
 *
 * Optionally accepts a prices map to populate price data when the
 * public data was fetched without prices.
 */
export function convertPublicDataToMeta(
  publicData: AllLendingData,
  prices?: Record<string, number>,
): LenderCrossPoolMeta {
  const meta: LenderCrossPoolMeta = {}

  if (publicData.v1) {
    for (const [uid, reserve] of Object.entries(publicData.v1.data)) {
      meta[uid] = convertV1Reserve(reserve, prices)
    }
  }

  if (publicData.v2) {
    for (const [uid, reserve] of Object.entries(publicData.v2.data)) {
      meta[uid] = convertV2Reserve(reserve, prices)
    }
  }

  if (publicData.granite) {
    for (const [uid, market] of Object.entries(publicData.granite.data)) {
      meta[uid] = convertGraniteMarket(market, prices)
    }
  }

  return meta
}

function resolvePrice(
  marketUid: string,
  symbol: string,
  prices?: Record<string, number>,
): number {
  if (!prices) return 0
  return prices[marketUid]
    ?? prices[symbol.toLowerCase()]
    ?? prices[symbol]
    ?? 0
}

function convertV1Reserve(
  reserve: ZestReserveData,
  prices?: Record<string, number>,
): LenderYieldComplete {
  const price = resolvePrice(reserve.marketUid, reserve.symbol, prices)

  return {
    depositRate: reserve.depositRate,
    variableBorrowRate: reserve.variableBorrowRate,
    stableBorrowRate: reserve.stableBorrowRate,
    borrowLiquidity: reserve.totalLiquidity,
    withdrawLiquidity: reserve.totalLiquidity,
    asset: reserve.asset,
    flags: {
      collateralActive: reserve.collateralActive,
      borrowingEnabled: reserve.borrowingEnabled,
      isActive: reserve.isActive,
      isFrozen: reserve.isFrozen,
    },
    configs: Object.fromEntries(
      Object.entries(reserve.config).map(([cat, cfg]) => [
        cat,
        {
          collateralFactor: cfg.collateralFactor,
          borrowCollateralFactor: cfg.borrowCollateralFactor,
          borrowFactor: cfg.borrowFactor,
          collateralDisabled: cfg.collateralDisabled,
          debtDisabled: cfg.debtDisabled,
        },
      ]),
    ),
    price: {
      priceUsd: price || reserve.totalDepositsUSD / (reserve.totalDeposits || 1) || 0,
      oraclePrice: price || reserve.totalDepositsUSD / (reserve.totalDeposits || 1) || 0,
    },
  }
}

function convertV2Reserve(
  reserve: ZestV2ReserveData,
  prices?: Record<string, number>,
): LenderYieldComplete {
  const price = resolvePrice(reserve.marketUid, reserve.symbol, prices)

  return {
    depositRate: reserve.supplyRate,
    variableBorrowRate: reserve.borrowRate,
    stableBorrowRate: 0,
    borrowLiquidity: reserve.availableLiquidity,
    withdrawLiquidity: reserve.availableLiquidity,
    asset: reserve.asset
      ? { ...reserve.asset, decimals: reserve.decimals }
      : {
          chainId: 'stacks-mainnet',
          name: reserve.symbol,
          symbol: reserve.symbol,
          decimals: reserve.decimals,
          address: reserve.principal ?? '',
          logoURI: '',
        },
    flags: {
      collateralActive: reserve.collateralEnabled,
      borrowingEnabled: reserve.debtEnabled,
      isActive: true,
      isFrozen: false,
    },
    configs: Object.fromEntries(
      Object.entries(reserve.config).map(([cat, cfg]) => [
        cat,
        {
          collateralFactor: cfg.collateralFactor,
          borrowCollateralFactor: cfg.borrowCollateralFactor,
          borrowFactor: cfg.borrowFactor,
          collateralDisabled: cfg.collateralDisabled,
          debtDisabled: cfg.debtDisabled,
        },
      ]),
    ),
    price: {
      priceUsd: price || reserve.totalDepositsUSD / (reserve.totalDeposits || 1) || 0,
      oraclePrice: price || reserve.totalDepositsUSD / (reserve.totalDeposits || 1) || 0,
    },
  }
}

function convertGraniteMarket(
  market: GraniteMarketData,
  prices?: Record<string, number>,
): LenderYieldComplete {
  const price = resolvePrice(market.marketUid, market.symbol, prices)

  // For borrowable markets, build config from collateral LTVs
  // For collateral-only entries, use the baseLtv/liquidationThreshold directly
  const configs: Record<string, {
    collateralFactor?: number
    borrowCollateralFactor?: number
    borrowFactor?: number
    collateralDisabled?: boolean
    debtDisabled?: boolean
  }> = {}

  if (market.isCollateral) {
    configs['0'] = {
      collateralFactor: market.liquidationThreshold,
      borrowCollateralFactor: market.baseLtv,
      borrowFactor: 1,
      collateralDisabled: false,
      debtDisabled: true,
    }
  } else {
    configs['0'] = {
      collateralFactor: 0,
      borrowCollateralFactor: 0,
      borrowFactor: 1,
      collateralDisabled: true,
      debtDisabled: !market.borrowEnabled,
    }
  }

  return {
    depositRate: market.supplyRate,
    variableBorrowRate: market.borrowRate,
    stableBorrowRate: 0,
    borrowLiquidity: market.availableLiquidity,
    withdrawLiquidity: market.availableLiquidity,
    asset: market.asset,
    flags: {
      collateralActive: market.isCollateral,
      borrowingEnabled: market.borrowEnabled,
      isActive: true,
      isFrozen: false,
    },
    configs,
    price: {
      priceUsd: price || market.totalAssetsUSD / (market.totalAssets || 1) || 0,
      oraclePrice: price || market.totalAssetsUSD / (market.totalAssets || 1) || 0,
    },
  }
}
