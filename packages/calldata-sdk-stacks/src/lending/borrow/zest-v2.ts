import type { StacksContractCall } from '../../types'
import type { BorrowZestV2Params } from '../types'
import { ZestV2Lending } from '../../zest-v2'
import { ZEST_V2_VAULT_TO_UNDERLYING } from '../../zest-v2/constants'

export async function borrowZestV2(p: BorrowZestV2Params): Promise<StacksContractCall> {
  const underlying = ZEST_V2_VAULT_TO_UNDERLYING[p.vault]
  if (!underlying) throw new Error(`Unknown Zest V2 vault: ${p.vault}`)
  const feeds = await ZestV2Lending.fetchPriceFeedsForVaults([p.vault], p.pythOptions)
  return ZestV2Lending.encodeBorrow(underlying, p.amount, p.receiver, feeds)
}
