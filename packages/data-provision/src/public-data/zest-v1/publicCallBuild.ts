import { StacksCall } from '../../stacks-call'
import { encodeClarityPrincipal } from '../../stacks-call'
import { getZestAssets, ZEST_CONTRACTS } from './constants'

/**
 * Number of calls per asset in the Zest call sequence:
 *   0: get-reserve-state-read(asset)         — full reserve tuple
 *   1: get-asset-supply-apy(asset)           — supply APY
 *   2: get-asset-borrow-apy(asset)           — borrow APY
 *   3: get-asset-e-mode-type(asset)          — e-mode type for this asset
 */
export const CALLS_PER_ASSET = 4

/**
 * E-mode type identifiers used by Zest.
 * Zest uses buff(1) for e-mode types.
 */
export const ZEST_EMODE_TYPES = [0x00, 0x01] as const

/**
 * Build the ordered call array for fetching all Zest reserve data.
 *
 * Call ordering (for N assets, M e-mode types):
 *   [0..N*4)           — per-asset calls (4 per asset)
 *   [N*4..N*4+M)       — e-mode config calls
 *   [N*4+M]            — get-assets-read (global)
 *
 * The parser depends on this exact ordering.
 */
export function buildZestReserveCalls(): StacksCall[] {
  const assets = getZestAssets()
  const { poolReserveData, poolReadBorrow, poolReadSupply, poolReserve } =
    ZEST_CONTRACTS

  // Per-asset calls
  const assetCalls: StacksCall[] = assets.flatMap((asset) => [
    {
      contractAddress: poolReserveData.address,
      contractName: poolReserveData.name,
      functionName: 'get-reserve-state-read',
      args: [encodeClarityPrincipal(asset)],
    },
    {
      contractAddress: poolReadSupply.address,
      contractName: poolReadSupply.name,
      functionName: 'get-asset-supply-apy',
      args: [encodeClarityPrincipal(asset)],
    },
    {
      contractAddress: poolReadBorrow.address,
      contractName: poolReadBorrow.name,
      functionName: 'get-asset-borrow-apy',
      args: [encodeClarityPrincipal(asset)],
    },
    {
      contractAddress: poolReserve.address,
      contractName: poolReserve.name,
      functionName: 'get-asset-e-mode-type',
      args: [encodeClarityPrincipal(asset)],
    },
  ])

  // E-mode config calls
  const emodeCalls: StacksCall[] = ZEST_EMODE_TYPES.map((type) => ({
    contractAddress: poolReserve.address,
    contractName: poolReserve.name,
    functionName: 'get-e-mode-type-config',
    args: [encodeClarityBuff1(type)],
  }))

  // Global metadata call
  const globalCalls: StacksCall[] = [
    {
      contractAddress: poolReserveData.address,
      contractName: poolReserveData.name,
      functionName: 'get-assets-read',
      args: [],
    },
  ]

  return [...assetCalls, ...emodeCalls, ...globalCalls]
}

/**
 * Returns the expected number of call results for validation.
 */
export function getExpectedCallCount(): number {
  return (
    getZestAssets().length * CALLS_PER_ASSET +
    ZEST_EMODE_TYPES.length +
    1
  )
}

/** Encode a single byte as a Clarity (buff 1) hex value */
function encodeClarityBuff1(byte: number): string {
  // Clarity buffer serialization: type prefix 0x02, length u32 (4 bytes), then data
  // For a (buff 1): 0x02 00000001 XX
  const hex = byte.toString(16).padStart(2, '0')
  return `0x020000000100${hex}`
}
