import { describe, it, expect } from 'vitest'
import {
  buildZestV2ReserveCalls,
  getExpectedCallCount,
  ASSET_REGISTRY_CALLS_PER_ASSET,
  VAULT_CALLS_PER_UNDERLYING,
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
        nAll,
    )
    // 6*3 + 6*5 + 12 = 18 + 30 + 12 = 60
    expect(expected).toBe(60)
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

  it('section 2: vault calls (5 per underlying)', () => {
    const section2Start = nUnderlying * ASSET_REGISTRY_CALLS_PER_ASSET
    for (let i = 0; i < nUnderlying; i++) {
      const base = section2Start + i * VAULT_CALLS_PER_UNDERLYING
      const aid = ZEST_V2_UNDERLYING_IDS[i]
      const vault = ZEST_V2_VAULT_FOR_ASSET[aid]

      expect(calls[base].functionName).toBe('get-supply-rate')
      expect(calls[base].contractName).toBe(vault.name)

      expect(calls[base + 1].functionName).toBe('get-borrow-rate')
      expect(calls[base + 2].functionName).toBe('get-total-supply')
      expect(calls[base + 3].functionName).toBe('get-total-borrows')
      expect(calls[base + 4].functionName).toBe('get-available-liquidity')
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

  it('all calls target the V2 deployer address', () => {
    for (const call of calls) {
      expect(call.contractAddress).toBe(ZEST_V2_CONTRACTS.market.address)
    }
  })
})
