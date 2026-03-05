import type { StacksContractCall } from '../types'
import { principal, uint, optionalPrincipal, someCV, noneCV, bufferCV, listCV, tupleCV } from '../types/clarity-args'
import type { ClarityValue } from '../types/clarity-args'
import {
  GRANITE_MARKETS,
  GRANITE_STX_MARKET,
  GRANITE_USDCX_MARKET,
  GRANITE_CORE_DEPLOYER,
  GRANITE_STX_DEPLOYER,
  GRANITE_USDCX_DEPLOYER,
  splitContract,
} from './constants'
import type { GraniteMarketContracts } from './constants'
import { fetchPythPriceUpdate } from '../pyth/fetch'
import type { PythFetchOptions } from '../pyth/fetch'
import { PYTH_FEED_IDS } from '../pyth/feed-ids'

export {
  GRANITE_CORE_DEPLOYER,
  GRANITE_STX_DEPLOYER,
  GRANITE_USDCX_DEPLOYER,
  GRANITE_MARKETS,
  GRANITE_STX_MARKET,
  GRANITE_USDCX_MARKET,
}
export type { GraniteMarketContracts }

/** Encode optional Pyth price feed data (buff 8192). */
function encodeOptionalPriceFeed(data?: Uint8Array): ClarityValue {
  if (!data) return noneCV()
  return someCV(bufferCV(data))
}

function call(contractId: string, functionName: string, functionArgs: ClarityValue[]): StacksContractCall {
  const [contractAddress, contractName] = splitContract(contractId)
  return { contractAddress, contractName, functionName, functionArgs }
}

/**
 * Granite Lending calldata encoders.
 *
 * Granite uses isolated markets: each encoder takes a `market` parameter
 * (GraniteMarketContracts) to target the right contracts.
 *
 * Use GRANITE_STX_MARKET or GRANITE_USDCX_MARKET, or look up by ID
 * via GRANITE_MARKETS['stx'] / GRANITE_MARKETS['usdcx'].
 */
export namespace GraniteLending {
  // =================================================================
  // Liquidity Provider operations (deposit / withdraw / redeem)
  // =================================================================

  /**
   * Deposit assets into a Granite market as a liquidity provider.
   *
   * @param market    - target market contracts
   * @param amount    - amount of underlying asset to deposit
   * @param recipient - address to receive LP shares
   */
  export const encodeDeposit = (
    market: GraniteMarketContracts,
    amount: bigint | number,
    recipient: string,
  ): StacksContractCall =>
    call(market.lpProvider, 'deposit', [
      uint(amount),
      principal(recipient),
    ])

  /**
   * Withdraw underlying assets from a Granite market (by asset amount).
   *
   * @param market    - target market contracts
   * @param amount    - amount of underlying assets to withdraw
   * @param recipient - address to receive the withdrawn assets
   */
  export const encodeWithdraw = (
    market: GraniteMarketContracts,
    amount: bigint | number,
    recipient: string,
  ): StacksContractCall =>
    call(market.lpProvider, 'withdraw', [
      uint(amount),
      principal(recipient),
    ])

  /**
   * Redeem LP shares for underlying assets.
   *
   * @param market    - target market contracts
   * @param shares    - amount of LP shares to redeem
   * @param recipient - address to receive the underlying assets
   */
  export const encodeRedeem = (
    market: GraniteMarketContracts,
    shares: bigint | number,
    recipient: string,
  ): StacksContractCall =>
    call(market.lpProvider, 'redeem', [
      uint(shares),
      principal(recipient),
    ])

  // =================================================================
  // Borrower operations (collateral + borrow + repay)
  // =================================================================

  /**
   * Add collateral to a borrowing position.
   *
   * @param market     - target market contracts
   * @param collateral - collateral token contract principal (trait reference)
   * @param amount     - amount of collateral to add
   * @param onBehalfOf - optional user to add collateral for (defaults to sender)
   */
  export const encodeAddCollateral = (
    market: GraniteMarketContracts,
    collateral: string,
    amount: bigint | number,
    onBehalfOf?: string,
  ): StacksContractCall =>
    call(market.borrower, 'add-collateral', [
      principal(collateral),
      uint(amount),
      optionalPrincipal(onBehalfOf),
    ])

  /**
   * Remove collateral from a borrowing position.
   * Requires the position to remain healthy after removal.
   *
   * @param market        - target market contracts
   * @param collateral    - collateral token contract principal
   * @param amount        - amount of collateral to remove
   * @param onBehalfOf    - optional user to remove collateral for
   * @param priceFeedData - optional Pyth oracle price feed buffer
   */
  export const encodeRemoveCollateral = (
    market: GraniteMarketContracts,
    collateral: string,
    amount: bigint | number,
    onBehalfOf?: string,
    priceFeedData?: Uint8Array,
  ): StacksContractCall =>
    call(market.borrower, 'remove-collateral', [
      encodeOptionalPriceFeed(priceFeedData),
      principal(collateral),
      uint(amount),
      optionalPrincipal(onBehalfOf),
    ])

  /**
   * Borrow from a Granite market.
   *
   * @param market        - target market contracts
   * @param amount        - amount to borrow in smallest units
   * @param onBehalfOf    - optional user to borrow for
   * @param priceFeedData - optional Pyth oracle price feed buffer
   */
  export const encodeBorrow = (
    market: GraniteMarketContracts,
    amount: bigint | number,
    onBehalfOf?: string,
    priceFeedData?: Uint8Array,
  ): StacksContractCall =>
    call(market.borrower, 'borrow', [
      encodeOptionalPriceFeed(priceFeedData),
      uint(amount),
      optionalPrincipal(onBehalfOf),
    ])

  /**
   * Repay borrowed assets.
   *
   * @param market     - target market contracts
   * @param amount     - amount to repay in smallest units
   * @param onBehalfOf - optional address of the borrower to repay for
   */
  export const encodeRepay = (
    market: GraniteMarketContracts,
    amount: bigint | number,
    onBehalfOf?: string,
  ): StacksContractCall =>
    call(market.borrower, 'repay', [
      uint(amount),
      optionalPrincipal(onBehalfOf),
    ])

  // =================================================================
  // Liquidation
  // =================================================================

  /**
   * Liquidate an under-collateralized position.
   *
   * @param market               - target market contracts
   * @param collateral           - collateral token to seize
   * @param user                 - address of the position to liquidate
   * @param repayAmount          - amount of debt to repay
   * @param minCollateralExpected - minimum collateral to receive (slippage)
   * @param priceFeedData        - optional Pyth oracle price feed buffer
   */
  export const encodeLiquidate = (
    market: GraniteMarketContracts,
    collateral: string,
    user: string,
    repayAmount: bigint | number,
    minCollateralExpected: bigint | number,
    priceFeedData?: Uint8Array,
  ): StacksContractCall =>
    call(market.liquidator, 'liquidate-collateral', [
      encodeOptionalPriceFeed(priceFeedData),
      principal(collateral),
      principal(user),
      uint(repayAmount),
      uint(minCollateralExpected),
    ])

  // =================================================================
  // Flash Loan
  // =================================================================

  /**
   * Execute a flash loan.
   *
   * @param market   - target market contracts
   * @param amount   - amount to flash borrow
   * @param callback - callback contract principal (must implement flash-loan-callback trait)
   * @param data     - optional callback data buffer
   */
  export const encodeFlashLoan = (
    market: GraniteMarketContracts,
    amount: bigint | number,
    callback: string,
    data?: Uint8Array,
  ): StacksContractCall =>
    call(market.flashLoan, 'flash-loan', [
      uint(amount),
      principal(callback),
      data ? someCV(bufferCV(data)) : noneCV(),
    ])

  // =================================================================
  // Pyth oracle helpers
  // =================================================================

  /**
   * Pyth feed IDs relevant to Granite markets.
   * STX market uses STX + BTC feeds; USDCx market uses USDC + BTC feeds.
   */
  export const PRICE_FEEDS = {
    stx: [PYTH_FEED_IDS.STX, PYTH_FEED_IDS.BTC],
    usdcx: [PYTH_FEED_IDS.USDC, PYTH_FEED_IDS.BTC],
  } as const

  /**
   * Fetch fresh Pyth price update bytes for a Granite market.
   * Returns a Uint8Array ready to pass as `priceFeedData` to
   * `encodeBorrow`, `encodeRemoveCollateral`, or `encodeLiquidate`.
   *
   * @param marketId - 'stx' or 'usdcx'
   * @param options  - optional Hermes URL override
   */
  export async function fetchPriceFeedData(
    marketId: 'stx' | 'usdcx',
    options?: PythFetchOptions,
  ): Promise<Uint8Array> {
    const feedIds = PRICE_FEEDS[marketId]
    return fetchPythPriceUpdate([...feedIds], options)
  }
}
