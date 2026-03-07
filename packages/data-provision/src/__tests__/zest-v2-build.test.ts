import { describe, it, expect } from 'vitest'
import {
  buildZestV2ReserveCalls,
  getExpectedCallCount,
  ASSET_REGISTRY_CALLS_PER_ASSET,
  VAULT_CALLS_PER_UNDERLYING,
  EGROUP_CALLS,
} from '../public-data/zest-v2/publicCallBuild'
import {
  ZEST_V2_UNDERLYING_IDS,
  ZEST_V2_ALL_ASSET_IDS,
  ZEST_V2_CONTRACTS,
  ZEST_V2_VAULT_FOR_ASSET,
} from '../public-data/zest-v2/constants'

describe('Zest V2 call builder', () => {
  const calls = buildZestV2ReserveCalls()
  const nUnderlying = ZEST_V2_UNDERLYING_IDS.length
  const nAll = ZEST_V2_ALL_ASSET_IDS.length

  it('produces the expected number of calls', () => {
    const expected = getExpectedCallCount()
    expect(calls.length).toBe(expected)
    expect(expected).toBe(
      nUnderlying * ASSET_REGISTRY_CALLS_PER_ASSET +
        nUnderlying * VAULT_CALLS_PER_UNDERLYING +
        nAll +
        EGROUP_CALLS,
    )
    // 6*3 + 6*6 + 12 + 6 = 18 + 36 + 12 + 6 = 72
    expect(expected).toBe(72)
  })

  it('section 1: asset registry calls (3 per underlying)', () => {
    for (let i = 0; i < nUnderlying; i++) {
      const base = i * ASSET_REGISTRY_CALLS_PER_ASSET
      expect(calls[base].functionName).toBe('lookup')
      expect(calls[base].contractName).toBe(ZEST_V2_CONTRACTS.assets.name)

      expect(calls[base + 1].functionName).toBe('status')
      expect(calls[base + 1].contractName).toBe(ZEST_V2_CONTRACTS.assets.name)

      expect(calls[base + 2].functionName).toBe('get-cached-indexes')
      expect(calls[base + 2].contractName).toBe(ZEST_V2_CONTRACTS.market.name)
    }
  })

  it('section 2: vault calls (6 per underlying)', () => {
    const section2Start = nUnderlying * ASSET_REGISTRY_CALLS_PER_ASSET
    for (let i = 0; i < nUnderlying; i++) {
      const base = section2Start + i * VAULT_CALLS_PER_UNDERLYING
      const aid = ZEST_V2_UNDERLYING_IDS[i]
      const vault = ZEST_V2_VAULT_FOR_ASSET[aid]

      expect(calls[base].functionName).toBe('get-interest-rate')
      expect(calls[base].contractName).toBe(vault.name)

      expect(calls[base + 1].functionName).toBe('get-utilization')
      expect(calls[base + 2].functionName).toBe('get-fee-reserve')
      expect(calls[base + 3].functionName).toBe('get-total-supply')
      expect(calls[base + 4].functionName).toBe('get-debt')
      expect(calls[base + 5].functionName).toBe('get-available-assets')
    }
  })

  it('section 3: status calls for all 12 assets', () => {
    const section3Start =
      nUnderlying * ASSET_REGISTRY_CALLS_PER_ASSET +
      nUnderlying * VAULT_CALLS_PER_UNDERLYING
    for (let i = 0; i < nAll; i++) {
      expect(calls[section3Start + i].functionName).toBe('status')
      expect(calls[section3Start + i].contractName).toBe(
        ZEST_V2_CONTRACTS.assets.name,
      )
    }
  })

  it('section 4: egroup resolve calls for z-tokens', () => {
    const section4Start =
      nUnderlying * ASSET_REGISTRY_CALLS_PER_ASSET +
      nUnderlying * VAULT_CALLS_PER_UNDERLYING +
      nAll
    for (let i = 0; i < EGROUP_CALLS; i++) {
      expect(calls[section4Start + i].functionName).toBe('resolve')
      expect(calls[section4Start + i].contractName).toBe(
        ZEST_V2_CONTRACTS.egroup.name,
      )
    }
  })

  it('all calls target the V2 deployer address', () => {
    for (const call of calls) {
      expect(call.contractAddress).toBe(ZEST_V2_CONTRACTS.market.address)
    }
  })
})
