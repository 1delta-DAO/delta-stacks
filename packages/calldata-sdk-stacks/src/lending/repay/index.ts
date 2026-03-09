import type { StacksContractCall } from '../../types'
import type { RepayParams } from '../types'
import { Lender } from '../types'
import { repayZestV1 } from './zest-v1'
import { repayZestV2 } from './zest-v2'
import { repayGranite } from './granite'

export async function repay(params: RepayParams): Promise<StacksContractCall> {
  switch (params.lender) {
    case Lender.ZestV1:
      return repayZestV1(params)
    case Lender.ZestV2:
      return repayZestV2(params)
    case Lender.Granite:
      return repayGranite(params)
  }
}
