import { StacksCall } from '../../stacks-call'
import { encodeClarityPrincipal } from '../../stacks-call'
import { READER_CONTRACT_ADDRESS, READER_CONTRACT_NAME } from '../fetchStacksLender'
import { GRANITE_MARKETS, GRANITE_CONTRACT_NAMES, GRANITE_COLLATERAL_TOKENS } from './constants'

/**
 * Build calls to the per-market reader functions in lending-reader-v1,
 * plus collateral config calls for each market's known collaterals.
 *
 * Layout: [0..2) reader calls, [2..) collateral config calls
 */
export function buildGraniteReaderCalls(readerAddress = READER_CONTRACT_ADDRESS): StacksCall[] {
  const readerCalls: StacksCall[] = [
    {
      contractAddress: readerAddress,
      contractName: READER_CONTRACT_NAME,
      functionName: 'read-granite-stx',
      args: [],
    },
    {
      contractAddress: readerAddress,
      contractName: READER_CONTRACT_NAME,
      functionName: 'read-granite-usdcx',
      args: [],
    },
  ]

  // Collateral config calls per market
  const collateralCalls = GRANITE_MARKETS.flatMap((market) => {
    const tokens = GRANITE_COLLATERAL_TOKENS[market.id] ?? []
    return tokens.map((token) => ({
      contractAddress: market.deployer,
      contractName: GRANITE_CONTRACT_NAMES.state,
      functionName: 'get-collateral',
      args: [encodeClarityPrincipal(token)],
    }))
  })

  return [...readerCalls, ...collateralCalls]
}
