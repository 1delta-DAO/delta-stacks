import type { StacksContractCall } from '../../types'
import type { DepositZestV2Params } from '../types'
import { ZestV2Lending } from '../../zest-v2'
import { ZEST_V2_VAULT_TO_UNDERLYING } from '../../zest-v2/constants'

export async function depositZestV2(p: DepositZestV2Params): Promise<StacksContractCall> {
  const underlying = ZEST_V2_VAULT_TO_UNDERLYING[p.vault]
  if (!underlying) throw new Error(`Unknown Zest V2 vault: ${p.vault}`)
  const feeds = await ZestV2Lending.fetchPriceFeedsForVaults([p.vault], p.pythOptions)
  return ZestV2Lending.encodeSupplyCollateralAdd(underlying, p.amount, p.minShares ?? 0, feeds)
}
