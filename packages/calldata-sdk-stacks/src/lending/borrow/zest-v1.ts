import type { StacksContractCall } from '../../types'
import type { BorrowZestV1Params } from '../types'
import { ZestV1Lending } from '../../zest-v1'

export async function borrowZestV1(p: BorrowZestV1Params): Promise<StacksContractCall> {
  const priceFeedBytes = await ZestV1Lending.fetchPriceFeeds(p.pythOptions)
  return ZestV1Lending.encodeBorrow(
    p.poolReserve,
    p.oracle,
    p.assetToBorrow,
    p.lpToken,
    p.assets,
    p.amount,
    p.feeCalculator,
    p.interestRateMode,
    p.owner,
    priceFeedBytes,
  )
}
