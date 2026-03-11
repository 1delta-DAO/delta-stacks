import { StacksCall } from '../../../stacks-call'
import { READER_CONTRACT_ADDRESS, READER_CONTRACT_NAME } from '../fetchStacksLender'
import { getZestAssets, ZEST_Z_TOKENS } from './constants'

/**
 * Reader function names in the deployed lending-reader-v3 contract,
 * matching the order of getZestAssets() (on-chain asset registry order).
 */
const V1_READER_FUNCTIONS = [
  'read-v1-ststx',
  'read-v1-aeusdc',
  'read-v1-wstx',
  'read-v1-diko',
  'read-v1-usdh',
  'read-v1-susdt',
  'read-v1-usda',
  'read-v1-sbtc',
  'read-v1-alex',
  'read-v1-ststxbtc',
] as const

/**
 * Build calls to the per-asset reader functions in lending-reader-v3.
 * Each call bundles 4 sub-calls (reserve-state, supply-apy, borrow-apy, e-mode-type)
 * into a single read-only call.
 *
 * Layout: [0..10) per-asset, [10..12) e-mode configs, [12..22) z-token supplies = 22 calls total
 * (down from 53 individual calls)
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

  // Z-token total supply calls (to get actual deposit amounts)
  const assets = getZestAssets()
  const zTokenCalls: StacksCall[] = assets
    .map((asset) => {
      const zToken = ZEST_Z_TOKENS[asset]
      if (!zToken) return null
      const [addr, name] = zToken.split('.')
      return {
        contractAddress: addr,
        contractName: name,
        functionName: 'get-total-supply',
        args: [] as string[],
      }
    })
    .filter((c): c is StacksCall => c !== null)

  return [...assetCalls, ...emodeCalls, ...zTokenCalls]
}
