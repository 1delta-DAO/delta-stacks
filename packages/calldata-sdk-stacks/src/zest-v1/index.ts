import type { StacksContractCall } from '../types'
import { principal, uint, bool, buff1, noneCV, someCV, bufferCV, listCV, tupleCV } from '../types/clarity-args'
import type { ClarityValue } from '../types/clarity-args'
import { ZEST_V1_DEPLOYER, ZEST_V1_CONTRACTS, splitContract } from './constants'
import { PYTH_FEED_IDS } from '../pyth/feed-ids'
import { fetchPythPriceUpdate } from '../pyth/fetch'
import type { PythFetchOptions } from '../pyth/fetch'

export { ZEST_V1_DEPLOYER, ZEST_V1_CONTRACTS }

/**
 * Asset-oracle-lp tuple used in V1 collateral/health factor calculations.
 * Many V1 functions require passing the full user position as a list of these.
 */
export interface AssetOracleLp {
  asset: string      // contract principal for the token
  lpToken: string    // contract principal for the z-token
  oracle: string     // contract principal for the oracle
}

function encodeAssetList(assets: AssetOracleLp[]) {
  return listCV(
    assets.map((a) =>
      tupleCV({
        asset: principal(a.asset),
        'lp-token': principal(a.lpToken),
        oracle: principal(a.oracle),
      }),
    ),
  )
}

/** Encode price feed bytes: (some (buff N)) if provided, none otherwise */
function encodePriceFeedBytes(priceFeedBytes?: Uint8Array): ClarityValue {
  if (!priceFeedBytes || priceFeedBytes.length === 0) return noneCV()
  return someCV(bufferCV(priceFeedBytes))
}

const [HELPER_ADDR, HELPER_NAME] = splitContract(ZEST_V1_CONTRACTS.borrowHelper)
const [BORROW_ADDR, BORROW_NAME] = splitContract(ZEST_V1_CONTRACTS.poolBorrow)
const [RESERVE_ADDR, RESERVE_NAME] = splitContract(ZEST_V1_CONTRACTS.poolReserve)

/**
 * Pyth feed IDs needed by Zest V1 for health factor calculations.
 * V1 uses a single concatenated buffer containing all feeds.
 */
const V1_PYTH_FEEDS = [
  PYTH_FEED_IDS.BTC,
  PYTH_FEED_IDS.STX,
  PYTH_FEED_IDS.USDC,
]

/**
 * Zest V1 calldata encoders — pool-based lending (Aave-like architecture).
 *
 * All user-facing calls go through borrow-helper-v2-1-7 which is the approved
 * gateway contract. It forwards to pool-borrow-v2-4 internally.
 */
export namespace ZestV1Lending {
  /**
   * Fetch Pyth price feed bytes for V1 operations that need health checks.
   * Returns a single concatenated buffer suitable for the price-feed-bytes param.
   */
  export async function fetchPriceFeeds(options?: PythFetchOptions): Promise<Uint8Array> {
    return fetchPythPriceUpdate(V1_PYTH_FEEDS, options)
  }

  /**
   * Supply (deposit) an asset into the Zest V1 pool.
   */
  export const encodeSupply = (
    lpToken: string,
    poolReserve: string,
    asset: string,
    amount: bigint | number,
    owner: string,
  ): StacksContractCall => ({
    contractAddress: HELPER_ADDR,
    contractName: HELPER_NAME,
    functionName: 'supply',
    functionArgs: [
      principal(lpToken),
      principal(poolReserve),
      principal(asset),
      uint(amount),
      principal(owner),
      noneCV(), // referral
      principal(ZEST_V1_CONTRACTS.incentives),
    ],
  })

  /**
   * Withdraw an asset from the Zest V1 pool.
   */
  export const encodeWithdraw = (
    poolReserve: string,
    asset: string,
    lpToken: string,
    oracle: string,
    assets: AssetOracleLp[],
    amount: bigint | number,
    owner: string,
    priceFeedBytes?: Uint8Array,
  ): StacksContractCall => ({
    contractAddress: HELPER_ADDR,
    contractName: HELPER_NAME,
    functionName: 'withdraw',
    functionArgs: [
      principal(lpToken),
      principal(poolReserve),
      principal(asset),
      principal(oracle),
      uint(amount),
      principal(owner),
      encodeAssetList(assets),
      principal(ZEST_V1_CONTRACTS.incentives),
      encodePriceFeedBytes(priceFeedBytes),
    ],
  })

  /**
   * Borrow an asset from the Zest V1 pool.
   */
  export const encodeBorrow = (
    poolReserve: string,
    oracle: string,
    assetToBorrow: string,
    lpToken: string,
    assets: AssetOracleLp[],
    amount: bigint | number,
    feeCalculator: string,
    interestRateMode: number,
    owner: string,
    priceFeedBytes?: Uint8Array,
  ): StacksContractCall => ({
    contractAddress: HELPER_ADDR,
    contractName: HELPER_NAME,
    functionName: 'borrow',
    functionArgs: [
      principal(poolReserve),
      principal(oracle),
      principal(assetToBorrow),
      principal(lpToken),
      encodeAssetList(assets),
      uint(amount),
      principal(feeCalculator),
      uint(interestRateMode),
      principal(owner),
      encodePriceFeedBytes(priceFeedBytes),
    ],
  })

  /**
   * Repay a borrowed asset.
   */
  export const encodeRepay = (
    asset: string,
    amount: bigint | number,
    onBehalfOf: string,
    payer: string,
  ): StacksContractCall => ({
    contractAddress: HELPER_ADDR,
    contractName: HELPER_NAME,
    functionName: 'repay',
    functionArgs: [
      principal(asset),
      uint(amount),
      principal(onBehalfOf),
      principal(payer),
    ],
  })

  /**
   * Toggle whether a user's supplied asset is used as collateral.
   */
  export const encodeSetUserUseReserveAsCollateral = (
    who: string,
    lpToken: string,
    asset: string,
    enableAsCollateral: boolean,
    oracle: string,
    assetsToCalculate: AssetOracleLp[],
    priceFeedBytes?: Uint8Array,
  ): StacksContractCall => ({
    contractAddress: HELPER_ADDR,
    contractName: HELPER_NAME,
    functionName: 'set-user-use-reserve-as-collateral',
    functionArgs: [
      principal(who),
      principal(lpToken),
      principal(asset),
      bool(enableAsCollateral),
      principal(oracle),
      encodeAssetList(assetsToCalculate),
      encodePriceFeedBytes(priceFeedBytes),
    ],
  })

  /**
   * Set the user's e-mode category.
   */
  export const encodeSetEMode = (
    user: string,
    assets: AssetOracleLp[],
    eModeType: number,
    priceFeedBytes?: Uint8Array,
  ): StacksContractCall => ({
    contractAddress: HELPER_ADDR,
    contractName: HELPER_NAME,
    functionName: 'set-e-mode',
    functionArgs: [
      principal(user),
      encodeAssetList(assets),
      buff1(eModeType),
      encodePriceFeedBytes(priceFeedBytes),
    ],
  })

  /**
   * Liquidate an under-collateralized position.
   */
  export const encodeLiquidationCall = (
    assets: AssetOracleLp[],
    collateralLp: string,
    collateralToLiquidate: string,
    debtAsset: string,
    collateralOracle: string,
    debtOracle: string,
    liquidatedUser: string,
    debtAmount: bigint | number,
    toReceiveAToken: boolean,
    priceFeedBytes?: Uint8Array,
  ): StacksContractCall => ({
    contractAddress: HELPER_ADDR,
    contractName: HELPER_NAME,
    functionName: 'liquidation-call',
    functionArgs: [
      encodeAssetList(assets),
      principal(collateralLp),
      principal(collateralToLiquidate),
      principal(debtAsset),
      principal(collateralOracle),
      principal(debtOracle),
      principal(liquidatedUser),
      uint(debtAmount),
      bool(toReceiveAToken),
      encodePriceFeedBytes(priceFeedBytes),
    ],
  })
}
