import { StacksCall } from '../../stacks-call'
import { READER_CONTRACT_ADDRESS, READER_CONTRACT_NAME } from '../fetchStacksLender'

/**
 * Reader function names in the deployed lending-reader-v1 contract,
 * matching the order of getZestAssets().
 */
const V1_READER_FUNCTIONS = [
  'read-v1-wstx',
  'read-v1-ststx',
  'read-v1-sbtc',
  'read-v1-aeusdc',
  'read-v1-diko',
  'read-v1-usdh',
  'read-v1-susdt',
  'read-v1-ststxbtc',
  'read-v1-alex',
] as const

/**
 * Build calls to the per-asset reader functions in lending-reader-v1.
 * Each call bundles 4 sub-calls (reserve-state, supply-apy, borrow-apy, e-mode-type)
 * into a single read-only call.
 *
 * Layout: [0..9) per-asset, [9..11) e-mode configs = 11 calls total
 * (down from 39 individual calls)
 */
export function buildV1ReaderCalls(readerAddress = READER_CONTRACT_ADDRESS): StacksCall[] {
  const assetCalls: StacksCall[] = V1_READER_FUNCTIONS.map((fn) => ({
    contractAddress: readerAddress,
    contractName: READER_CONTRACT_NAME,
    functionName: fn,
    args: [],
  }))

  const emodeCalls: StacksCall[] = [
    {
      contractAddress: readerAddress,
      contractName: READER_CONTRACT_NAME,
      functionName: 'read-v1-emode-config-0',
      args: [],
    },
    {
      contractAddress: readerAddress,
      contractName: READER_CONTRACT_NAME,
      functionName: 'read-v1-emode-config-1',
      args: [],
    },
  ]

  return [...assetCalls, ...emodeCalls]
}
