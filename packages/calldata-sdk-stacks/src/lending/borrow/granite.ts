import type { StacksContractCall } from '../../types'
import type { BorrowGraniteParams } from '../types'
import { GraniteLending, GRANITE_MARKETS } from '../../granite'

export async function borrowGranite(p: BorrowGraniteParams): Promise<StacksContractCall> {
  const market = GRANITE_MARKETS[p.marketId]
  const feedData = await GraniteLending.fetchPriceFeedData(p.marketId, p.pythOptions)
  return GraniteLending.encodeBorrow(market, p.amount, p.onBehalfOf, feedData)
}
