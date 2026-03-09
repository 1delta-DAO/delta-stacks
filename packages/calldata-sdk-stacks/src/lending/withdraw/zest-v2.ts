import type { StacksContractCall } from '../../types'
import type { WithdrawZestV2Params } from '../types'
import { ZestV2Lending } from '../../zest-v2'

export async function withdrawZestV2(p: WithdrawZestV2Params): Promise<StacksContractCall> {
  const feeds = await ZestV2Lending.fetchPriceFeedsForVaults([p.vault], p.pythOptions)
  return ZestV2Lending.encodeCollateralRemoveRedeem(
    p.vault,
    p.amount,
    p.minUnderlying ?? 0,
    p.receiver,
    feeds,
  )
}
