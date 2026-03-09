import type { StacksContractCall } from '../../types'
import type { DepositZestV1Params } from '../types'
import { ZestV1Lending } from '../../zest-v1'

export async function depositZestV1(p: DepositZestV1Params): Promise<StacksContractCall> {
  return ZestV1Lending.encodeSupply(p.lpToken, p.poolReserve, p.asset, p.amount, p.owner)
}
