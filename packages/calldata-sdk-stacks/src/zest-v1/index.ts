import type { StacksContractCall } from '../types'
import { principal, uint, bool, buff1, listCV, tupleCV } from '../types/clarity-args'
import { ZEST_V1_DEPLOYER, ZEST_V1_CONTRACTS, splitContract } from './constants'

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

const [BORROW_ADDR, BORROW_NAME] = splitContract(ZEST_V1_CONTRACTS.poolBorrow)
const [RESERVE_ADDR, RESERVE_NAME] = splitContract(ZEST_V1_CONTRACTS.poolReserve)

/**
 * Zest V1 calldata encoders — pool-based lending (Aave-like architecture).
 *
 * Each function returns a StacksContractCall that can be serialized to JSON
 * and executed client-side via makeContractCall().
 */
export namespace ZestV1Lending {
  /**
   * Supply (deposit) an asset into the Zest V1 pool.
   *
   * @param lpToken   - z-token contract principal (receipt token)
   * @param poolReserve - pool reserve contract principal
   * @param asset     - the token to supply (contract principal)
   * @param amount    - amount in smallest units
   * @param owner     - address receiving the z-tokens
   */
  export const encodeSupply = (
    lpToken: string,
    poolReserve: string,
    asset: string,
    amount: bigint | number,
    owner: string,
  ): StacksContractCall => ({
    contractAddress: BORROW_ADDR,
    contractName: BORROW_NAME,
    functionName: 'supply',
    functionArgs: [
      principal(lpToken),
      principal(poolReserve),
      principal(asset),
      uint(amount),
      principal(owner),
    ],
  })

  /**
   * Withdraw an asset from the Zest V1 pool.
   *
   * @param poolReserve - pool reserve contract principal
   * @param asset      - the token to withdraw
   * @param lpToken    - z-token contract principal
   * @param oracle     - price oracle contract principal
   * @param assets     - full user position for health factor check
   * @param amount     - amount to withdraw in smallest units
   * @param owner      - address that owns the z-tokens
   */
  export const encodeWithdraw = (
    poolReserve: string,
    asset: string,
    lpToken: string,
    oracle: string,
    assets: AssetOracleLp[],
    amount: bigint | number,
    owner: string,
  ): StacksContractCall => ({
    contractAddress: BORROW_ADDR,
    contractName: BORROW_NAME,
    functionName: 'withdraw',
    functionArgs: [
      principal(poolReserve),
      principal(asset),
      principal(lpToken),
      principal(oracle),
      encodeAssetList(assets),
      uint(amount),
      principal(owner),
    ],
  })

  /**
   * Borrow an asset from the Zest V1 pool.
   *
   * @param poolReserve      - pool reserve contract principal
   * @param oracle           - price oracle for the borrowed asset
   * @param assetToBorrow    - the token to borrow
   * @param lpToken          - z-token for the borrowed asset
   * @param assets           - full user position for health factor check
   * @param amount           - amount to borrow in smallest units
   * @param feeCalculator    - fee calculator contract principal
   * @param interestRateMode - 1 = variable, 2 = stable (Zest V1 mirrors Aave modes)
   * @param owner            - borrower address
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
  ): StacksContractCall => ({
    contractAddress: BORROW_ADDR,
    contractName: BORROW_NAME,
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
    ],
  })

  /**
   * Repay a borrowed asset.
   *
   * @param asset         - the token to repay
   * @param amount        - amount to repay in smallest units
   * @param onBehalfOf    - address of the borrower
   * @param payer         - address paying the debt
   */
  export const encodeRepay = (
    asset: string,
    amount: bigint | number,
    onBehalfOf: string,
    payer: string,
  ): StacksContractCall => ({
    contractAddress: BORROW_ADDR,
    contractName: BORROW_NAME,
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
  ): StacksContractCall => ({
    contractAddress: BORROW_ADDR,
    contractName: BORROW_NAME,
    functionName: 'set-user-use-reserve-as-collateral',
    functionArgs: [
      principal(who),
      principal(lpToken),
      principal(asset),
      bool(enableAsCollateral),
      principal(oracle),
      encodeAssetList(assetsToCalculate),
    ],
  })

  /**
   * Set the user's e-mode category.
   *
   * @param user        - user address
   * @param assets      - full user position for health factor recalculation
   * @param eModeType   - e-mode category byte (0x00 = disabled, 0x01 = category 1, etc.)
   */
  export const encodeSetEMode = (
    user: string,
    assets: AssetOracleLp[],
    eModeType: number,
  ): StacksContractCall => ({
    contractAddress: BORROW_ADDR,
    contractName: BORROW_NAME,
    functionName: 'set-e-mode',
    functionArgs: [
      principal(user),
      encodeAssetList(assets),
      buff1(eModeType),
    ],
  })

  /**
   * Perform a flash loan.
   */
  export const encodeFlashloan = (
    receiver: string,
    asset: string,
    amount: bigint | number,
    flashloanContract: string,
  ): StacksContractCall => ({
    contractAddress: BORROW_ADDR,
    contractName: BORROW_NAME,
    functionName: 'flashloan',
    functionArgs: [
      principal(receiver),
      principal(asset),
      uint(amount),
      principal(flashloanContract),
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
  ): StacksContractCall => ({
    contractAddress: BORROW_ADDR,
    contractName: BORROW_NAME,
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
    ],
  })
}
