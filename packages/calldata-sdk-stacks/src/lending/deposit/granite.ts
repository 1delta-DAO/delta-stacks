import type { StacksContractCall } from '../../types'
import type { DepositGraniteParams } from '../types'
import { GraniteLending, GRANITE_MARKETS } from '../../granite'

export async function depositGranite(p: DepositGraniteParams): Promise<StacksContractCall> {
  const market = GRANITE_MARKETS[p.marketId]
  return GraniteLending.encodeDeposit(market, p.amount, p.recipient)
}
