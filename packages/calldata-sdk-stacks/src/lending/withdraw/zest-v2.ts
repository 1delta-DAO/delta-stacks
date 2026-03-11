import type { StacksContractCall } from '../../types'
import type { WithdrawZestV2Params } from '../types'
import { ZestV2Lending } from '../../zest-v2'
import { ZEST_V2_ALL_VAULTS } from '../../zest-v2/constants'

export async function withdrawZestV2(p: WithdrawZestV2Params): Promise<StacksContractCall> {
  // Fetch ALL market feeds — the contract checks health across all positions
  const feeds = await ZestV2Lending.fetchPriceFeedsForVaults(ZEST_V2_ALL_VAULTS, p.pythOptions)
  return ZestV2Lending.encodeCollateralRemoveRedeem(
    p.vault,
    p.amount,
    p.minUnderlying ?? 0,
    p.receiver,
    feeds,
  )
}
