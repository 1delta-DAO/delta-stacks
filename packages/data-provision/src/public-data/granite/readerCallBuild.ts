import { StacksCall } from '../../stacks-call'
import { READER_CONTRACT_ADDRESS, READER_CONTRACT_NAME } from '../fetchStacksLender'
import { GRANITE_MARKETS, GRANITE_COLLATERAL_TOKENS, GRANITE_COLLATERAL_READER_FNS } from './constants'

/**
 * Build calls to the per-market reader functions in lending-reader-v2,
 * plus collateral config reader calls.
 *
 * Layout: [0..2) market reader calls, [2..) collateral reader calls
 */
export function buildGraniteReaderCalls(readerAddress = READER_CONTRACT_ADDRESS): StacksCall[] {
  const readerCalls: StacksCall[] = [
    {
      contractAddress: readerAddress,
      contractName: READER_CONTRACT_NAME,
      functionName: 'read-granite-aeusdc',
      args: [],
    },
    {
      contractAddress: readerAddress,
      contractName: READER_CONTRACT_NAME,
      functionName: 'read-granite-usdcx',
      args: [],
    },
  ]

  // Collateral config calls routed through the reader contract
  const collateralCalls = GRANITE_MARKETS.flatMap((market) => {
    const tokens = GRANITE_COLLATERAL_TOKENS[market.id] ?? []
    return tokens.map((token) => ({
      contractAddress: readerAddress,
      contractName: READER_CONTRACT_NAME,
      functionName: GRANITE_COLLATERAL_READER_FNS[`${market.id}:${token}`],
      args: [],
    }))
  })

  return [...readerCalls, ...collateralCalls]
}
