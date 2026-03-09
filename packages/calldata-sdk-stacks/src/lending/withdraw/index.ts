import type { StacksContractCall } from '../../types'
import type { WithdrawParams } from '../types'
import { Lender } from '../types'
import { withdrawZestV1 } from './zest-v1'
import { withdrawZestV2 } from './zest-v2'
import { withdrawGranite } from './granite'

export async function withdraw(params: WithdrawParams): Promise<StacksContractCall> {
  switch (params.lender) {
    case Lender.ZestV1:
      return withdrawZestV1(params)
    case Lender.ZestV2:
      return withdrawZestV2(params)
    case Lender.Granite:
      return withdrawGranite(params)
  }
}
