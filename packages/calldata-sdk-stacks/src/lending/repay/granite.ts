import type { StacksContractCall } from '../../types'
import type { RepayGraniteParams } from '../types'
import { GraniteLending, GRANITE_MARKETS } from '../../granite'

export async function repayGranite(p: RepayGraniteParams): Promise<StacksContractCall> {
  const market = GRANITE_MARKETS[p.marketId]
  return GraniteLending.encodeRepay(market, p.amount, p.onBehalfOf)
}
