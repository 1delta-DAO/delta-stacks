import type { StacksContractCall } from '../types'
import { principal, uint, optionalPrincipal, noneCV, someCV, listCV, bufferCV, tupleCV } from '../types/clarity-args'
import type { ClarityValue } from '../types/clarity-args'
import { ZEST_V2_DEPLOYER, ZEST_V2_CONTRACTS, splitContract } from './constants'
import { fetchPythPriceUpdates } from '../pyth/fetch'
import type { PythFetchOptions } from '../pyth/fetch'
import { PYTH_FEED_IDS } from '../pyth/feed-ids'

export { ZEST_V2_DEPLOYER, ZEST_V2_CONTRACTS }

const [MARKET_ADDR, MARKET_NAME] = splitContract(ZEST_V2_CONTRACTS.market)
const [EGROUP_ADDR, EGROUP_NAME] = splitContract(ZEST_V2_CONTRACTS.egroup)

/** Encode optional price feeds (list of buffers). Pass undefined/[] for no feeds. */
function encodePriceFeeds(feeds?: Uint8Array[]): ClarityValue {
  if (!feeds || feeds.length === 0) return noneCV()
  return someCV(listCV(feeds.map((f) => bufferCV(f))))
}

/**
 * Zest V2 calldata encoders — hub-spoke architecture with market.clar.
 *
 * V2 uses numeric asset IDs (0-11), trait references for vault/token contracts,
 * and optional price feed buffers for oracle data.
 */
export namespace ZestV2Lending {
  /**
   * Supply an asset to a vault and add the z-tokens as collateral in one step.
   * This is the primary "deposit" action for V2.
   *
   * @param ft         - vault/token contract principal (trait reference)
   * @param amount     - amount to supply in smallest units
   * @param minShares  - minimum z-token shares to receive (slippage protection)
   * @param priceFeeds - optional oracle price feed buffers
   */
  export const encodeSupplyCollateralAdd = (
    ft: string,
    amount: bigint | number,
    minShares: bigint | number,
    priceFeeds?: Uint8Array[],
  ): StacksContractCall => ({
    contractAddress: MARKET_ADDR,
    contractName: MARKET_NAME,
    functionName: 'supply-collateral-add',
    functionArgs: [
      principal(ft),
      uint(amount),
      uint(minShares),
      encodePriceFeeds(priceFeeds),
    ],
  })

  /**
   * Add z-tokens (already held) as collateral.
   *
   * @param ft         - vault/token contract principal
   * @param amount     - amount of z-tokens to collateralize
   * @param priceFeeds - optional oracle price feed buffers
   */
  export const encodeCollateralAdd = (
    ft: string,
    amount: bigint | number,
    priceFeeds?: Uint8Array[],
  ): StacksContractCall => ({
    contractAddress: MARKET_ADDR,
    contractName: MARKET_NAME,
    functionName: 'collateral-add',
    functionArgs: [
      principal(ft),
      uint(amount),
      encodePriceFeeds(priceFeeds),
    ],
  })

  /**
   * Remove z-tokens from collateral (keeps z-tokens in wallet).
   *
   * @param ft         - vault/token contract principal
   * @param amount     - amount of z-tokens to remove from collateral
   * @param receiver   - optional address to receive the z-tokens (defaults to sender)
   * @param priceFeeds - optional oracle price feed buffers
   */
  export const encodeCollateralRemove = (
    ft: string,
    amount: bigint | number,
    receiver?: string,
    priceFeeds?: Uint8Array[],
  ): StacksContractCall => ({
    contractAddress: MARKET_ADDR,
    contractName: MARKET_NAME,
    functionName: 'collateral-remove',
    functionArgs: [
      principal(ft),
      uint(amount),
      optionalPrincipal(receiver),
      encodePriceFeeds(priceFeeds),
    ],
  })

  /**
   * Remove collateral and redeem z-tokens back to underlying in one step.
   * This is the primary "withdraw" action for V2.
   *
   * @param ft             - vault/token contract principal
   * @param amount         - amount of z-tokens to redeem
   * @param minUnderlying  - minimum underlying to receive (slippage protection)
   * @param receiver       - optional address to receive underlying (defaults to sender)
   * @param priceFeeds     - optional oracle price feed buffers
   */
  export const encodeCollateralRemoveRedeem = (
    ft: string,
    amount: bigint | number,
    minUnderlying: bigint | number,
    receiver?: string,
    priceFeeds?: Uint8Array[],
  ): StacksContractCall => ({
    contractAddress: MARKET_ADDR,
    contractName: MARKET_NAME,
    functionName: 'collateral-remove-redeem',
    functionArgs: [
      principal(ft),
      uint(amount),
      uint(minUnderlying),
      optionalPrincipal(receiver),
      encodePriceFeeds(priceFeeds),
    ],
  })

  /**
   * Borrow an asset from the V2 market.
   *
   * @param ft         - vault/token contract principal for the asset to borrow
   * @param amount     - amount to borrow in smallest units
   * @param receiver   - optional address to receive borrowed funds (defaults to sender)
   * @param priceFeeds - optional oracle price feed buffers
   */
  export const encodeBorrow = (
    ft: string,
    amount: bigint | number,
    receiver?: string,
    priceFeeds?: Uint8Array[],
  ): StacksContractCall => ({
    contractAddress: MARKET_ADDR,
    contractName: MARKET_NAME,
    functionName: 'borrow',
    functionArgs: [
      principal(ft),
      uint(amount),
      optionalPrincipal(receiver),
      encodePriceFeeds(priceFeeds),
    ],
  })

  /**
   * Repay a borrowed asset.
   *
   * @param ft         - vault/token contract principal for the asset to repay
   * @param amount     - amount to repay in smallest units
   * @param onBehalfOf - optional address of the borrower (defaults to sender)
   */
  export const encodeRepay = (
    ft: string,
    amount: bigint | number,
    onBehalfOf?: string,
  ): StacksContractCall => ({
    contractAddress: MARKET_ADDR,
    contractName: MARKET_NAME,
    functionName: 'repay',
    functionArgs: [
      principal(ft),
      uint(amount),
      optionalPrincipal(onBehalfOf),
    ],
  })

  /**
   * Liquidate an under-collateralized borrower position.
   *
   * @param borrower              - address of the position to liquidate
   * @param collateralFt          - collateral vault/token contract principal
   * @param debtFt                - debt vault/token contract principal
   * @param debtAmount            - amount of debt to repay
   * @param minCollateralExpected - minimum collateral to receive (slippage protection)
   * @param collateralReceiver    - optional address to receive collateral
   * @param priceFeeds            - optional oracle price feed buffers
   */
  export const encodeLiquidate = (
    borrower: string,
    collateralFt: string,
    debtFt: string,
    debtAmount: bigint | number,
    minCollateralExpected: bigint | number,
    collateralReceiver?: string,
    priceFeeds?: Uint8Array[],
  ): StacksContractCall => ({
    contractAddress: MARKET_ADDR,
    contractName: MARKET_NAME,
    functionName: 'liquidate',
    functionArgs: [
      principal(borrower),
      principal(collateralFt),
      principal(debtFt),
      uint(debtAmount),
      uint(minCollateralExpected),
      optionalPrincipal(collateralReceiver),
      encodePriceFeeds(priceFeeds),
    ],
  })

  /**
   * Liquidate and redeem z-token collateral back to underlying in one step.
   */
  export const encodeLiquidateRedeem = (
    borrower: string,
    collateralFt: string,
    debtFt: string,
    debtAmount: bigint | number,
    minCollateralExpected: bigint | number,
    minUnderlying: bigint | number,
    receiver?: string,
    priceFeeds?: Uint8Array[],
  ): StacksContractCall => ({
    contractAddress: MARKET_ADDR,
    contractName: MARKET_NAME,
    functionName: 'liquidate-redeem',
    functionArgs: [
      principal(borrower),
      principal(collateralFt),
      principal(debtFt),
      uint(debtAmount),
      uint(minCollateralExpected),
      uint(minUnderlying),
      optionalPrincipal(receiver),
      encodePriceFeeds(priceFeeds),
    ],
  })

  // =================================================================
  // Pyth oracle helpers
  // =================================================================

  /**
   * Pyth feed IDs for assets available in Zest V2.
   * Pass the relevant subset to `fetchPriceFeeds` based on
   * which assets are involved in your transaction.
   */
  export const PRICE_FEEDS = {
    STX: PYTH_FEED_IDS.STX,
    BTC: PYTH_FEED_IDS.BTC,
    USDC: PYTH_FEED_IDS.USDC,
    ETH: PYTH_FEED_IDS.ETH,
  } as const

  /**
   * Fetch fresh Pyth price update buffers for Zest V2.
   * Returns a `Uint8Array[]` ready to pass as `priceFeeds` to any
   * encoder that accepts oracle data (borrow, collateral-remove, liquidate, etc.).
   *
   * @param feedIds - Pyth feed ID hex strings for the assets involved
   * @param options - optional Hermes URL override
   */
  export async function fetchPriceFeeds(
    feedIds: string[],
    options?: PythFetchOptions,
  ): Promise<Uint8Array[]> {
    return fetchPythPriceUpdates(feedIds, options)
  }
}

/**
 * Zest V2 efficiency group config encoders (admin).
 */
export namespace ZestV2EGroup {
  export const encodeInsert = (params: {
    mask: bigint | number
    ltvBorrow: bigint | number
    ltvLiqPartial: bigint | number
    ltvLiqFull: bigint | number
    liqPenaltyMin: bigint | number
    liqPenaltyMax: bigint | number
    liqCurveExp: bigint | number
    borrowDisabledMask: bigint | number
  }): StacksContractCall => ({
    contractAddress: EGROUP_ADDR,
    contractName: EGROUP_NAME,
    functionName: 'insert',
    functionArgs: [
      tupleCV({
        MASK: uint(params.mask),
        'LTV-BORROW': uint(params.ltvBorrow),
        'LTV-LIQ-PARTIAL': uint(params.ltvLiqPartial),
        'LTV-LIQ-FULL': uint(params.ltvLiqFull),
        'LIQ-PENALTY-MIN': uint(params.liqPenaltyMin),
        'LIQ-PENALTY-MAX': uint(params.liqPenaltyMax),
        'LIQ-CURVE-EXP': uint(params.liqCurveExp),
        'BORROW-DISABLED-MASK': uint(params.borrowDisabledMask),
      }),
    ],
  })

  export const encodeUpdate = (
    groupId: bigint | number,
    params: Parameters<typeof encodeInsert>[0],
  ): StacksContractCall => ({
    contractAddress: EGROUP_ADDR,
    contractName: EGROUP_NAME,
    functionName: 'update',
    functionArgs: [
      uint(groupId),
      tupleCV({
        MASK: uint(params.mask),
        'LTV-BORROW': uint(params.ltvBorrow),
        'LTV-LIQ-PARTIAL': uint(params.ltvLiqPartial),
        'LTV-LIQ-FULL': uint(params.ltvLiqFull),
        'LIQ-PENALTY-MIN': uint(params.liqPenaltyMin),
        'LIQ-PENALTY-MAX': uint(params.liqPenaltyMax),
        'LIQ-CURVE-EXP': uint(params.liqCurveExp),
        'BORROW-DISABLED-MASK': uint(params.borrowDisabledMask),
      }),
    ],
  })
}
