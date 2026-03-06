import { StacksCall } from '../../stacks-call'
import { READER_CONTRACT_ADDRESS, READER_CONTRACT_NAME } from '../fetchStacksLender'

/**
 * Build calls to the per-market reader functions in lending-reader-v1.
 * Each call bundles 9 sub-calls into a single read-only call.
 *
 * Layout: [0] read-granite-stx, [1] read-granite-usdcx = 2 calls total
 * (down from 18 individual calls)
 */
export function buildGraniteReaderCalls(readerAddress = READER_CONTRACT_ADDRESS): StacksCall[] {
  return [
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
}
