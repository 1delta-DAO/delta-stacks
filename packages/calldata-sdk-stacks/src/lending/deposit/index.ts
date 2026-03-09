import type { StacksContractCall } from '../../types'
import type { DepositParams } from '../types'
import { Lender } from '../types'
import { depositZestV1 } from './zest-v1'
import { depositZestV2 } from './zest-v2'
import { depositGranite } from './granite'

export async function deposit(params: DepositParams): Promise<StacksContractCall> {
  switch (params.lender) {
    case Lender.ZestV1:
      return depositZestV1(params)
    case Lender.ZestV2:
      return depositZestV2(params)
    case Lender.Granite:
      return depositGranite(params)
  }
}
