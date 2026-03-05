import { describe, it, expect } from 'vitest'
import {
  buildZestReserveCalls,
  getExpectedCallCount,
  CALLS_PER_ASSET,
  ZEST_EMODE_TYPES,
} from '../public-data/zest-v1/publicCallBuild'
import { getZestAssets, ZEST_CONTRACTS } from '../public-data/zest-v1/constants'

describe('Zest V1 call builder', () => {
  const calls = buildZestReserveCalls()
  const assets = getZestAssets()

  it('produces the expected number of calls', () => {
    const expected = getExpectedCallCount()
    expect(calls.length).toBe(expected)
    // N assets * 4 calls/asset + M emodes + 1 global
    expect(expected).toBe(
      assets.length * CALLS_PER_ASSET + ZEST_EMODE_TYPES.length + 1,
    )
  })

  it('has correct per-asset call structure', () => {
    // First asset: calls at indices 0, 1, 2, 3
    const reserveStateCall = calls[0]
    expect(reserveStateCall.contractName).toBe(ZEST_CONTRACTS.poolReserveData.name)
    expect(reserveStateCall.functionName).toBe('get-reserve-state-read')
    expect(reserveStateCall.args.length).toBe(1)

    const supplyApyCall = calls[1]
    expect(supplyApyCall.contractName).toBe(ZEST_CONTRACTS.poolReadSupply.name)
    expect(supplyApyCall.functionName).toBe('get-asset-supply-apy')

    const borrowApyCall = calls[2]
    expect(borrowApyCall.contractName).toBe(ZEST_CONTRACTS.poolReadBorrow.name)
    expect(borrowApyCall.functionName).toBe('get-asset-borrow-apy')

    const emodeTypeCall = calls[3]
    expect(emodeTypeCall.contractName).toBe(ZEST_CONTRACTS.poolReserve.name)
    expect(emodeTypeCall.functionName).toBe('get-asset-e-mode-type')
  })

  it('repeats the pattern for each asset', () => {
    for (let i = 0; i < assets.length; i++) {
      const baseIdx = i * CALLS_PER_ASSET
      expect(calls[baseIdx].functionName).toBe('get-reserve-state-read')
      expect(calls[baseIdx + 1].functionName).toBe('get-asset-supply-apy')
      expect(calls[baseIdx + 2].functionName).toBe('get-asset-borrow-apy')
      expect(calls[baseIdx + 3].functionName).toBe('get-asset-e-mode-type')
    }
  })

  it('has e-mode config calls after asset calls', () => {
    const emodeStart = assets.length * CALLS_PER_ASSET
    for (let j = 0; j < ZEST_EMODE_TYPES.length; j++) {
      expect(calls[emodeStart + j].functionName).toBe('get-e-mode-type-config')
    }
  })

  it('ends with get-assets-read', () => {
    const lastCall = calls[calls.length - 1]
    expect(lastCall.functionName).toBe('get-assets-read')
    expect(lastCall.args.length).toBe(0)
  })

  it('all calls have valid contract addresses', () => {
    for (const call of calls) {
      expect(call.contractAddress).toMatch(/^SP/)
      expect(call.contractName.length).toBeGreaterThan(0)
      expect(call.functionName.length).toBeGreaterThan(0)
    }
  })
})
