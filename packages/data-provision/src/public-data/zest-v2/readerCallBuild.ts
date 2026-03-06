import { StacksCall } from '../../stacks-call'
import { READER_CONTRACT_ADDRESS, READER_CONTRACT_NAME } from '../fetchStacksLender'

/**
 * Reader function names in lending-reader-v1, matching ZEST_V2_UNDERLYING_IDS order.
 */
const V2_READER_FUNCTIONS = [
  'read-vault-stx',      // asset ID 0
  'read-vault-sbtc',     // asset ID 2
  'read-vault-ststx',    // asset ID 4
  'read-vault-usdc',     // asset ID 6
  'read-vault-usdh',     // asset ID 8
  'read-vault-ststxbtc', // asset ID 10
] as const

/**
 * Build calls to the per-vault reader functions in lending-reader-v1.
 * Each call bundles 10 sub-calls into a single read-only call.
 *
 * Layout: [0..6) per-vault = 6 calls total
 * (down from 60 individual calls)
 *
 * Note: the reader contract doesn't include the asset-bitmap call.
 * The bitmap must be fetched separately via buildZestV2ReserveCalls if needed.
 */
export function buildV2ReaderCalls(readerAddress = READER_CONTRACT_ADDRESS): StacksCall[] {
  return V2_READER_FUNCTIONS.map((fn) => ({
    contractAddress: readerAddress,
    contractName: READER_CONTRACT_NAME,
    functionName: fn,
    args: [],
  }))
}
