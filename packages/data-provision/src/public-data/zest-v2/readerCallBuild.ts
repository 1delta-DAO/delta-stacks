import { StacksCall } from '../../stacks-call'
import { encodeClarityUint } from '../../stacks-call'
import { READER_CONTRACT_ADDRESS, READER_CONTRACT_NAME } from '../fetchStacksLender'
import { ZEST_V2_CONTRACTS, ZEST_V2_UNDERLYING_IDS } from './constants'

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
 * Build calls to the per-vault reader functions in lending-reader-v1,
 * plus egroup resolve calls for each underlying's z-token.
 *
 * Layout: [0..6) per-vault reader calls, [6..12) egroup resolve calls
 * Total: 12 calls (down from 60+ individual calls)
 */
export function buildV2ReaderCalls(readerAddress = READER_CONTRACT_ADDRESS): StacksCall[] {
  const { egroup } = ZEST_V2_CONTRACTS

  const readerCalls: StacksCall[] = V2_READER_FUNCTIONS.map((fn) => ({
    contractAddress: readerAddress,
    contractName: READER_CONTRACT_NAME,
    functionName: fn,
    args: [],
  }))

  // Egroup resolve for each underlying's z-token: resolve(2^zTokenId)
  const egroupCalls: StacksCall[] = ZEST_V2_UNDERLYING_IDS.map((aid) => ({
    contractAddress: egroup.address,
    contractName: egroup.name,
    functionName: 'resolve',
    args: [encodeClarityUint(BigInt(1) << BigInt(aid + 1))],
  }))

  return [...readerCalls, ...egroupCalls]
}
