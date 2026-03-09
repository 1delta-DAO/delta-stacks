import type { StacksContractCall } from '../../types'
import type { WithdrawGraniteParams } from '../types'
import { GraniteLending, GRANITE_MARKETS } from '../../granite'

export async function withdrawGranite(p: WithdrawGraniteParams): Promise<StacksContractCall> {
  const market = GRANITE_MARKETS[p.marketId]
  return GraniteLending.encodeWithdraw(market, p.amount, p.recipient)
}
