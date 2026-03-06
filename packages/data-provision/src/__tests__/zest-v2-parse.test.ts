import { describe, it, expect } from 'vitest'
import { tupleCV, uintCV, trueCV, falseCV, bufferCV, cvToHex } from '@stacks/transactions'
import {
  getZestV2ReservesDataConverter,
} from '../public-data/zest-v2/publicCallParse'
import {
  getExpectedCallCount,
  ASSET_REGISTRY_CALLS_PER_ASSET,
  VAULT_CALLS_PER_UNDERLYING,
} from '../public-data/zest-v2/publicCallBuild'
import {
  ZEST_V2_UNDERLYING_IDS,
  ZEST_V2_ALL_ASSET_IDS,
  ZEST_V2_SYMBOLS,
} from '../public-data/zest-v2/constants'
import { StacksCallResult } from '../stacks-call'

function okResult(hex: string): StacksCallResult {
  return { okay: true, result: hex }
}

function mockUint(value: number | bigint): StacksCallResult {
  return okResult(cvToHex(uintCV(value)))
}

/** Mock asset lookup result (registry tuple) */
function mockAssetLookup(decimals = 8): StacksCallResult {
  return okResult(
    cvToHex(
      tupleCV({
        id: uintCV(0), // simplified, real one is (buff 1)
        addr: uintCV(0), // simplified
        decimals: uintCV(decimals),
        oracle: tupleCV({
          type: uintCV(0),
          ident: uintCV(0),
          'max-staleness': uintCV(3600),
        }),
      }),
    ),
  )
}

/** Mock asset status result */
function mockAssetStatus(
  collateral = true,
  debt = true,
): StacksCallResult {
  return okResult(
    cvToHex(
      tupleCV({
        collateral: collateral ? trueCV() : falseCV(),
        debt: debt ? trueCV() : falseCV(),
      }),
    ),
  )
}

/** Mock cached indexes */
function mockCachedIndexes(
  index = 100000000,
  lindex = 100000000,
): StacksCallResult {
  return okResult(
    cvToHex(
      tupleCV({
        index: uintCV(index),
        lindex: uintCV(lindex),
      }),
    ),
  )
}

function buildMockResults(): StacksCallResult[] {
  const nUnderlying = ZEST_V2_UNDERLYING_IDS.length
  const results: StacksCallResult[] = []

  // Section 1: asset registry calls (3 per underlying)
  for (let i = 0; i < nUnderlying; i++) {
    results.push(mockAssetLookup(8))
    results.push(mockAssetStatus(true, i < 5)) // last one debt-disabled
    results.push(mockCachedIndexes(100000000 + i * 1000000, 100000000 + i * 500000))
  }

  // Section 2: vault calls (5 per underlying)
  for (let i = 0; i < nUnderlying; i++) {
    results.push(mockUint(3000000 + i * 200000)) // supply rate
    results.push(mockUint(5000000 + i * 300000)) // borrow rate
    results.push(mockUint(10000000000 * (i + 1))) // total supply shares
    results.push(mockUint(5000000000 * (i + 1))) // total borrows
    results.push(mockUint(5000000000 * (i + 1))) // available liquidity
  }

  // Section 3: status for all 12 assets
  for (let i = 0; i < ZEST_V2_ALL_ASSET_IDS.length; i++) {
    results.push(mockAssetStatus(true, i % 2 === 0))
  }

  // Section 4: egroup resolve per z-token (6 calls)
  // Some return (ok tuple), others (err uint) for assets without egroup
  for (let i = 0; i < nUnderlying; i++) {
    if (i === 4) {
      // USDH (asset 8) has no egroup — simulate (err uint)
      results.push({ okay: true, result: cvToHex(uintCV(720007)) })
    } else {
      // Mock egroup with LTV-BORROW and LTV-LIQ-PARTIAL as (buff 2) BPS
      const ltvBorrow = 4000 + i * 1000 // 40%, 50%, 60%, 70%, 80%, skip
      const ltvLiqPartial = ltvBorrow + 1500
      results.push(
        okResult(
          cvToHex(
            tupleCV({
              'LTV-BORROW': bufferCV(new Uint8Array([(ltvBorrow >> 8) & 0xff, ltvBorrow & 0xff])),
              'LTV-LIQ-PARTIAL': bufferCV(new Uint8Array([(ltvLiqPartial >> 8) & 0xff, ltvLiqPartial & 0xff])),
              'LTV-LIQ-FULL': bufferCV(new Uint8Array([0x23, 0x28])),
              'LIQ-PENALTY-MIN': bufferCV(new Uint8Array([0x02, 0xee])),
              'LIQ-PENALTY-MAX': bufferCV(new Uint8Array([0x03, 0xe8])),
              'LIQ-CURVE-EXP': bufferCV(new Uint8Array([0x27, 0x10])),
              'BORROW-DISABLED-MASK': uintCV(0),
              'MASK': uintCV(0),
              id: bufferCV(new Uint8Array([i])),
            }),
          ),
        ),
      )
    }
  }

  return results
}

describe('Zest V2 parser', () => {
  it('returns [converter, expectedCount] tuple', () => {
    const [converter, count] = getZestV2ReservesDataConverter()
    expect(typeof converter).toBe('function')
    expect(count).toBe(getExpectedCallCount())
    // 6*3 registry + 6*5 vault + 12 statuses + 6 egroup = 66
    expect(count).toBe(66)
  })

  it('rejects results with wrong length', () => {
    const [converter] = getZestV2ReservesDataConverter()
    expect(converter([])).toBeUndefined()
  })

  it('parses valid mock results', () => {
    const [converter, count] = getZestV2ReservesDataConverter({ stx: 1.5 })
    const results = buildMockResults()
    expect(results.length).toBe(count)

    const parsed = converter(results)
    expect(parsed).toBeDefined()
    expect(parsed!.chainId).toBe('stacks-mainnet')
    expect(Object.keys(parsed!.data).length).toBe(ZEST_V2_UNDERLYING_IDS.length)
  })

  it('produces correct market UIDs', () => {
    const [converter] = getZestV2ReservesDataConverter()
    const parsed = converter(buildMockResults())!

    for (const aid of ZEST_V2_UNDERLYING_IDS) {
      const uid = `stacks-mainnet:zest-v2:${aid}`
      expect(parsed.data[uid]).toBeDefined()
      expect(parsed.data[uid].assetId).toBe(aid)
      expect(parsed.data[uid].symbol).toBe(ZEST_V2_SYMBOLS[aid])
    }
  })

  it('calculates total deposits = borrows + liquidity', () => {
    const [converter] = getZestV2ReservesDataConverter()
    const parsed = converter(buildMockResults())!
    const first = parsed.data['stacks-mainnet:zest-v2:0']

    expect(first.totalDeposits).toBeCloseTo(
      first.totalBorrows + first.availableLiquidity,
      6,
    )
  })

  it('parses rates as decimals', () => {
    const [converter] = getZestV2ReservesDataConverter()
    const parsed = converter(buildMockResults())!
    const first = parsed.data['stacks-mainnet:zest-v2:0']

    // supply rate: 3000000 / 1e8 = 0.03
    expect(first.supplyRate).toBe(3000000 / 1e8)
    // borrow rate: 5000000 / 1e8 = 0.05
    expect(first.borrowRate).toBe(5000000 / 1e8)
  })

  it('parses z-token info', () => {
    const [converter] = getZestV2ReservesDataConverter()
    const parsed = converter(buildMockResults())!
    const stx = parsed.data['stacks-mainnet:zest-v2:0']

    expect(stx.zTokenId).toBe(1)
    expect(stx.zTokenSymbol).toBe('zSTX')
  })

  it('populates asset statuses for all 12 assets', () => {
    const [converter] = getZestV2ReservesDataConverter()
    const parsed = converter(buildMockResults())!

    expect(Object.keys(parsed.assetStatuses).length).toBe(12)
    for (const aid of ZEST_V2_ALL_ASSET_IDS) {
      expect(parsed.assetStatuses[aid]).toBeDefined()
      expect(parsed.assetStatuses[aid].symbol).toBe(
        ZEST_V2_SYMBOLS[aid] ?? `asset-${aid}`,
      )
    }
  })

  it('applies USD prices', () => {
    const [converter] = getZestV2ReservesDataConverter({ stx: 2.0 })
    const parsed = converter(buildMockResults())!
    const stx = parsed.data['stacks-mainnet:zest-v2:0']

    expect(stx.totalDepositsUSD).toBeGreaterThan(0)
    expect(stx.totalBorrowsUSD).toBeGreaterThan(0)
  })

  it('handles failed results', () => {
    const [converter] = getZestV2ReservesDataConverter()
    const results = buildMockResults()
    results[0] = { okay: false, result: 'runtime error' }
    expect(converter(results)).toBeUndefined()
  })
})
