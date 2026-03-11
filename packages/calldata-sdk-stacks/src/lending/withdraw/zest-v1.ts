import type { StacksContractCall } from '../../types'
import type { WithdrawZestV1Params } from '../types'
import { ZestV1Lending } from '../../zest-v1'

export async function withdrawZestV1(p: WithdrawZestV1Params): Promise<StacksContractCall> {
  const priceFeedBytes = await ZestV1Lending.fetchPriceFeeds(p.pythOptions)
  return ZestV1Lending.encodeWithdraw(
    p.poolReserve,
    p.asset,
    p.lpToken,
    p.oracle,
    p.assets,
    p.amount,
    p.owner,
    priceFeedBytes,
  )
}
