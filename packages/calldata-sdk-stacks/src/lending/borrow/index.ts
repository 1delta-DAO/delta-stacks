import type { StacksContractCall } from '../../types'
import type { BorrowParams } from '../types'
import { Lender } from '../types'
import { borrowZestV1 } from './zest-v1'
import { borrowZestV2 } from './zest-v2'
import { borrowGranite } from './granite'

export async function borrow(params: BorrowParams): Promise<StacksContractCall> {
  switch (params.lender) {
    case Lender.ZestV1:
      return borrowZestV1(params)
    case Lender.ZestV2:
      return borrowZestV2(params)
    case Lender.Granite:
      return borrowGranite(params)
  }
}
