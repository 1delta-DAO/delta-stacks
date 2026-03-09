import type { StacksToken } from '../../../token-list'

/**
 * Per-market metadata from public data provision.
 * Maps marketUid → market yield/config/flag data.
 */
export type LenderCrossPoolMeta = Record<string, LenderYieldComplete>

export interface LenderYieldComplete {
  depositRate?: number
  variableBorrowRate?: number
  stableBorrowRate?: number
  intrinsicYield?: number
  rewards?: Array<{
    asset: string
    depositRate: number
    variableBorrowRate: number
    stableBorrowRate?: number
  }>
  flags?: {
    collateralActive?: boolean
    borrowingEnabled?: boolean
    isActive?: boolean
    isFrozen?: boolean
  }
  configs?: Record<string, {
    collateralFactor?: number
    borrowCollateralFactor?: number
    borrowFactor?: number
    collateralDisabled?: boolean
    debtDisabled?: boolean
  }>
  borrowLiquidity?: number
  withdrawLiquidity?: number
  asset?: StacksToken
  price?: {
    priceUsd?: number
    priceUsd24h?: number
    oraclePrice?: number
  }
}

export interface LendingPosition {
  marketUid: string
  underlying?: string
  deposits: string
  debt: string
  debtStable: string
  depositsUSD: number
  debtUSD: number
  debtStableUSD: number
  depositsUSDOracle?: number
  debtUSDOracle?: number
  debtStableUSDOracle?: number
  collateralEnabled: boolean
  claimableRewards: number
  withdrawable?: string
  borrowable?: string
  underlyingInfo?: UnderlyingInfo
}

export interface UnderlyingInfo {
  symbol?: string
  decimals?: number
  address?: string
}

export interface UserDataPayload {
  chainId: string
  account: string
  lendingPositions: Record<string, LendingPosition>
  rewards?: any[]
  userEMode?: number
  notWhitelisted?: boolean
}

export interface UserData {
  lender: string
  account: string
  chainId: string
  data: Array<{
    health: number | null
    borrowCapacityUSD: number
    accountId: string
    balanceData: {
      borrowDiscountedCollateral: number
      borrowDiscountedCollateralAllActive: number
      collateral: number
      collateralAllActive: number
      deposits: number
      debt: number
      adjustedDebt: number
      nav: number
      deposits24h: number
      debt24h: number
      nav24h: number
      rewards?: any[]
    }
    aprData: {
      apr: number
      borrowApr: number
      depositApr: number
      rewards: any
      rewardApr: number
      rewardDepositApr: number
      rewardBorrowApr: number
      intrinsicApr: number
      intrinsicDepositApr: number
      intrinsicBorrowApr: number
    }
    userConfig: {
      selectedMode: string
      id: string
      isWhitelisted: boolean
    }
    positions: LendingPosition[]
  }>
}

export function getMarketUidsFromMeta(meta: LenderCrossPoolMeta): string[] {
  return Object.keys(meta)
}

export function buildUnderlyingInfo(market: LenderYieldComplete): UnderlyingInfo {
  return {
    symbol: market.asset?.symbol,
    decimals: market.asset?.decimals,
    address: market.asset?.address,
  }
}
