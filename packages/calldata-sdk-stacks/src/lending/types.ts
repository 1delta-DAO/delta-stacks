import type { AssetOracleLp } from '../zest-v1'
import type { PythFetchOptions } from '../pyth/fetch'

export type { PythFetchOptions }

export enum Lender {
  ZestV1 = 'zest-v1',
  ZestV2 = 'zest-v2',
  Granite = 'granite',
}

// ---------------------------------------------------------------------------
// Borrow
// ---------------------------------------------------------------------------

export interface BorrowZestV1Params {
  lender: Lender.ZestV1
  amount: bigint | number
  poolReserve: string
  oracle: string
  assetToBorrow: string
  lpToken: string
  assets: AssetOracleLp[]
  feeCalculator: string
  interestRateMode: number
  owner: string
}

export interface BorrowZestV2Params {
  lender: Lender.ZestV2
  amount: bigint | number
  vault: string
  receiver?: string
  pythOptions?: PythFetchOptions
}

export interface BorrowGraniteParams {
  lender: Lender.Granite
  amount: bigint | number
  marketId: 'aeusdc' | 'usdcx'
  onBehalfOf?: string
  pythOptions?: PythFetchOptions
}

export type BorrowParams = BorrowZestV1Params | BorrowZestV2Params | BorrowGraniteParams

// ---------------------------------------------------------------------------
// Deposit
// ---------------------------------------------------------------------------

export interface DepositZestV1Params {
  lender: Lender.ZestV1
  amount: bigint | number
  lpToken: string
  poolReserve: string
  asset: string
  owner: string
}

export interface DepositZestV2Params {
  lender: Lender.ZestV2
  amount: bigint | number
  vault: string
  minShares?: bigint | number
  pythOptions?: PythFetchOptions
}

export interface DepositGraniteParams {
  lender: Lender.Granite
  amount: bigint | number
  marketId: 'aeusdc' | 'usdcx'
  recipient: string
}

export type DepositParams = DepositZestV1Params | DepositZestV2Params | DepositGraniteParams

// ---------------------------------------------------------------------------
// Withdraw
// ---------------------------------------------------------------------------

export interface WithdrawZestV1Params {
  lender: Lender.ZestV1
  amount: bigint | number
  poolReserve: string
  asset: string
  lpToken: string
  oracle: string
  assets: AssetOracleLp[]
  owner: string
}

export interface WithdrawZestV2Params {
  lender: Lender.ZestV2
  amount: bigint | number
  vault: string
  minUnderlying?: bigint | number
  receiver?: string
  pythOptions?: PythFetchOptions
}

export interface WithdrawGraniteParams {
  lender: Lender.Granite
  amount: bigint | number
  marketId: 'aeusdc' | 'usdcx'
  recipient: string
}

export type WithdrawParams = WithdrawZestV1Params | WithdrawZestV2Params | WithdrawGraniteParams

// ---------------------------------------------------------------------------
// Repay
// ---------------------------------------------------------------------------

export interface RepayZestV1Params {
  lender: Lender.ZestV1
  amount: bigint | number
  asset: string
  onBehalfOf: string
  payer: string
}

export interface RepayZestV2Params {
  lender: Lender.ZestV2
  amount: bigint | number
  vault: string
  onBehalfOf?: string
}

export interface RepayGraniteParams {
  lender: Lender.Granite
  amount: bigint | number
  marketId: 'aeusdc' | 'usdcx'
  onBehalfOf?: string
}

export type RepayParams = RepayZestV1Params | RepayZestV2Params | RepayGraniteParams
