import type { StacksContractCall } from '../../types'
import type { RepayZestV2Params } from '../types'
import { ZestV2Lending } from '../../zest-v2'
import { ZEST_V2_VAULT_TO_UNDERLYING } from '../../zest-v2/constants'

export async function repayZestV2(p: RepayZestV2Params): Promise<StacksContractCall> {
  const underlying = ZEST_V2_VAULT_TO_UNDERLYING[p.vault]
  if (!underlying) throw new Error(`Unknown Zest V2 vault: ${p.vault}`)
  return ZestV2Lending.encodeRepay(underlying, p.amount, p.onBehalfOf)
}
