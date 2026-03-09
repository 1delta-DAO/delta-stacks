import type { StacksContractCall } from '../../types'
import type { RepayZestV1Params } from '../types'
import { ZestV1Lending } from '../../zest-v1'

export async function repayZestV1(p: RepayZestV1Params): Promise<StacksContractCall> {
  return ZestV1Lending.encodeRepay(p.asset, p.amount, p.onBehalfOf, p.payer)
}
