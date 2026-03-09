import { divideAccrualsToAprs } from './formatting'
import { safeDivide } from './formatting'
import { getOraclePrice } from './oraclePrice'
import { buildUnderlyingInfo, getMarketUidsFromMeta } from './types'
import type { LenderCrossPoolMeta, UserData, UserDataPayload } from './types'

export function createBaseTypeUserState(
  payload: UserDataPayload,
  lenderData: LenderCrossPoolMeta,
  totalDeposits24h: number = 0,
  totalDebt24h: number = 0,
  _lender?: string,
): UserData {
  let assetKeys = getMarketUidsFromMeta(lenderData)
  const { chainId, account } = payload

  const mode = String((payload as any).userEMode ?? 0)
  const isWhitelisted = !Boolean((payload as any)?.notWhitelisted ?? false)

  // organic yields
  let depositInterest = 0
  let borrowInterest = 0
  // rewards
  let rewardDepositAccrual = 0
  let rewardBorrowAccrual = 0
  // staking
  let stakingDepositAccrual = 0
  let stakingBorrowAccrual = 0
  // amountrs
  let deposits = 0
  let debt = 0
  let oracleDebt = 0
  let collateral = 0
  let borrowDiscountedCollateral = 0
  // this one is the one assuming all collaterals are enabled
  let borrowDiscountedCollateralAllActive = 0
  let collateralAllActive = 0

  let rewardsPerAsset: any = {}
  // main user data
  for (let i = 0; i < assetKeys.length; i++) {
    const marketUid = assetKeys[i]
    if (!lenderData?.[marketUid] || !payload.lendingPositions[marketUid])
      continue

    const pos = payload.lendingPositions[marketUid]
    const { depositsUSD, debtStableUSD, debtUSD, collateralEnabled } = pos
    // oracle values for risk calculations (fallback to general if missing)
    const depositsUSDOracle = (pos as any).depositsUSDOracle ?? depositsUSD
    const debtStableUSDOracle =
      (pos as any).debtStableUSDOracle ?? debtStableUSD
    const debtUSDOracle = (pos as any).debtUSDOracle ?? debtUSD
    const {
      depositRate,
      intrinsicYield,
      variableBorrowRate,
      stableBorrowRate,
      rewards,
      flags,
      configs,
    } = lenderData[marketUid]

    const userConfigForAsset = configs![mode]

    // amounts (display)
    deposits += depositsUSD
    debt += debtStableUSD
    debt += debtUSD
    // oracle-based debt for risk
    oracleDebt += debtStableUSDOracle
    oracleDebt += debtUSDOracle

    // rewards
    ;(rewards ?? []).forEach((rewardData: any) => {
      const key = rewardData.asset
      rewardDepositAccrual += rewardData.depositRate * depositsUSD
      rewardBorrowAccrual +=
        rewardData.variableBorrowRate * debtUSD +
        (rewardData.stableBorrowRate ?? 0) * debtStableUSD

      // totals
      const rewDepo = rewardData.depositRate * depositsUSD
      const rewDebt =
        rewardData.variableBorrowRate * debtUSD +
        (rewardData.stableBorrowRate ?? 0) * (debtStableUSD ?? 0)

      if (!rewardsPerAsset[key])
        rewardsPerAsset[key] = { depositApr: 0, borrowApr: 0 }
      if (rewDepo > 0) rewardsPerAsset[key].depositApr += rewDepo
      if (rewDebt > 0) rewardsPerAsset[key].borrowApr += rewDebt
    })

    // staking
    stakingDepositAccrual += (intrinsicYield ?? 0) * depositsUSD
    stakingBorrowAccrual += (intrinsicYield ?? 0) * (debtStableUSD + debtUSD)
    // collateral accounting (oracle-based for risk accuracy)
    // mode can override the general collateral flag
    if (flags?.collateralActive || (userConfigForAsset && !userConfigForAsset.collateralDisabled)) {
      if (collateralEnabled) {
        // risk adjusted
        collateral +=
          (userConfigForAsset?.collateralFactor ?? 1) * depositsUSDOracle
        borrowDiscountedCollateral +=
          (userConfigForAsset?.borrowCollateralFactor ?? 1) * depositsUSDOracle
      }
      borrowDiscountedCollateralAllActive +=
        (userConfigForAsset?.borrowCollateralFactor ?? 1) * depositsUSDOracle
      collateralAllActive +=
        (userConfigForAsset?.collateralFactor ?? 1) * depositsUSDOracle
    }
    // IRs
    depositInterest += depositRate! * depositsUSD
    borrowInterest +=
      debtStableUSD * stableBorrowRate! + debtUSD * variableBorrowRate!
  }
  const nav = deposits - debt
  // aggregated balance data
  const balanceData = {
    borrowDiscountedCollateral,
    borrowDiscountedCollateralAllActive,
    collateral,
    collateralAllActive,
    deposits,
    debt,
    adjustedDebt: oracleDebt,
    nav,
    deposits24h: totalDeposits24h,
    debt24h: totalDebt24h,
    nav24h: totalDeposits24h - totalDebt24h,
    ...(payload.rewards ? { rewards: payload.rewards } : {}),
  }

  // aggregated apr data
  const aprData = {
    apr: safeDivide(depositInterest - borrowInterest, nav),
    borrowApr: safeDivide(borrowInterest, debt),
    depositApr: safeDivide(depositInterest, deposits),
    rewards: divideAccrualsToAprs(rewardsPerAsset, nav, deposits, debt),
    rewardApr: safeDivide(rewardDepositAccrual + rewardBorrowAccrual, nav),
    rewardDepositApr: safeDivide(rewardDepositAccrual, deposits),
    rewardBorrowApr: safeDivide(rewardBorrowAccrual, debt),
    intrinsicApr: safeDivide(stakingDepositAccrual - stakingBorrowAccrual, nav),
    intrinsicDepositApr: safeDivide(stakingDepositAccrual, deposits),
    intrinsicBorrowApr: safeDivide(stakingBorrowAccrual, debt),
  }
  const userConfig = { selectedMode: mode, id: account, isWhitelisted }

  const creditLine = Math.max(
    0,
    borrowDiscountedCollateral - balanceData.adjustedDebt,
  )
  for (let i = 0; i < assetKeys.length; i++) {
    const marketUid = assetKeys[i]
    if (!lenderData?.[marketUid]) continue

    const { configs, flags, borrowLiquidity, withdrawLiquidity } =
      lenderData[marketUid]
    const config = configs?.[mode]
    const price = getOraclePrice(lenderData[marketUid])
    const bcf = config?.borrowCollateralFactor ?? 1
    const bf = config?.borrowFactor ?? 1

    const pos = payload.lendingPositions[marketUid]

    if (pos) {
      // withdrawable: max tokens removable while keeping health >= 1
      // if collateral is not enabled (user or config level), the deposit is not
      // backing any debt → full balance is withdrawable regardless of health
      // note: frozen reserves still allow withdrawals
      let withdrawable: string
      if (!pos.collateralEnabled || config?.collateralDisabled) {
        withdrawable = String(pos.deposits)
      } else if (balanceData.debt === 0) {
        withdrawable = String(pos.deposits)
      } else {
        const withdrawableUSD = Math.max(creditLine / bcf, 0)
        withdrawable = String(
          Math.min(withdrawableUSD / price, Number(pos.deposits)),
        )
      }
      // cap by protocol-level withdraw liquidity
      if (withdrawLiquidity != null) {
        withdrawable = String(Math.min(Number(withdrawable), withdrawLiquidity))
      }

      // borrowable: max tokens borrowable while keeping health >= 1
      // zero if borrowing is disabled, reserve is frozen, or debt is disabled for mode
      let borrowable: string
      if (!flags?.borrowingEnabled || flags?.isFrozen || config?.debtDisabled) {
        borrowable = '0'
      } else {
        const borrowableUSD = Math.max(creditLine / bf, 0)
        borrowable = String(borrowableUSD / price)
      }
      // cap by protocol-level borrow liquidity
      if (borrowLiquidity != null) {
        borrowable = String(Math.min(Number(borrowable), borrowLiquidity))
      }

      ;(pos as any).withdrawable = withdrawable
      ;(pos as any).borrowable = borrowable
      ;(pos as any).underlyingInfo = buildUnderlyingInfo(lenderData[marketUid])
    } else if (
      (deposits > 0 || debt > 0) &&
      flags?.borrowingEnabled &&
      !flags?.isFrozen &&
      !config?.debtDisabled
    ) {
      // Synthetic position: user has activity in this lender but not this
      // market, and borrowing is possible here.
      let borrowable = String(Math.max(creditLine / bf, 0) / price)
      // cap by protocol-level borrow liquidity
      if (borrowLiquidity != null) {
        borrowable = String(Math.min(Number(borrowable), borrowLiquidity))
      }

      payload.lendingPositions[marketUid] = {
        marketUid,
        deposits: '0',
        debt: '0',
        debtStable: '0',
        depositsUSD: 0,
        debtUSD: 0,
        debtStableUSD: 0,
        collateralEnabled: false,
        claimableRewards: 0,
        withdrawable: '0',
        borrowable,
        underlyingInfo: buildUnderlyingInfo(lenderData[marketUid]),
      } as any
    }
  }

  return {
    lender: '',
    account,
    chainId,
    data: [
      {
        health:
          balanceData.debt === 0
            ? null
            : balanceData.adjustedDebt > 0
              ? balanceData.collateral / balanceData.adjustedDebt
              : balanceData.collateral / balanceData.debt,
        borrowCapacityUSD: creditLine,
        accountId: '0',
        balanceData,
        aprData,
        userConfig,
        positions: Object.values(payload.lendingPositions) as any,
      },
    ],
  }
}
