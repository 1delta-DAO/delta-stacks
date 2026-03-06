import { describe, it, expect } from 'vitest'
import {
  tupleCV,
  uintCV,
  trueCV,
  falseCV,
  bufferCV,
  listCV,
  principalCV,
  cvToHex,
} from '@stacks/transactions'
import { getZestReservesDataConverter } from '../public-data/zest-v1/publicCallParse'
import { getExpectedCallCount, CALLS_PER_ASSET, ZEST_EMODE_TYPES } from '../public-data/zest-v1/publicCallBuild'
import { getZestAssets } from '../public-data/zest-v1/constants'
import { StacksCallResult } from '../stacks-call'

/**
 * Create a mock reserve-state tuple matching Zest V1's pool-reserve-data.
 * LTV/threshold/bonus values use 1e8 precision (e.g. 75000000 = 75%).
 */
function mockReserveState(overrides: Record<string, any> = {}) {
  return tupleCV({
    'total-borrows-stable': uintCV(overrides.totalBorrowsStable ?? 0),
    'total-borrows-variable': uintCV(overrides.totalBorrowsVariable ?? 500000000),
    'current-liquidity-rate': uintCV(overrides.currentLiquidityRate ?? 3500000),
    'current-variable-borrow-rate': uintCV(overrides.currentVariableBorrowRate ?? 5000000),
    'current-stable-borrow-rate': uintCV(0),
    'current-average-stable-borrow-rate': uintCV(0),
    'last-liquidity-cumulative-index': uintCV(100000000),
    'last-variable-borrow-cumulative-index': uintCV(100000000),
    'base-ltv-as-collateral': uintCV(overrides.baseLtv ?? 75000000),      // 75%
    'liquidation-threshold': uintCV(overrides.liquidationThreshold ?? 80000000), // 80%
    'liquidation-bonus': uintCV(overrides.liquidationBonus ?? 105000000),  // 105%
    'decimals': uintCV(overrides.decimals ?? 8),
    'a-token-address': principalCV('SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0'),
    'oracle': principalCV('SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.stx-oracle-v1-4'),
    'interest-rate-strategy-address': principalCV('SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-borrow-v2-4'),
    'flashloan-enabled': trueCV(),
    'last-updated-block': uintCV(100000),
    'borrowing-enabled': overrides.borrowingEnabled === false ? falseCV() : trueCV(),
    'usage-as-collateral-enabled': overrides.collateralEnabled === false ? falseCV() : trueCV(),
    'is-stable-borrow-rate-enabled': falseCV(),
    'supply-cap': uintCV(overrides.supplyCap ?? 1000000000000),
    'borrow-cap': uintCV(overrides.borrowCap ?? 500000000000),
    'debt-ceiling': uintCV(0),
    'accrued-to-treasury': uintCV(0),
    'is-active': overrides.isActive === false ? falseCV() : trueCV(),
    'is-frozen': overrides.isFrozen === true ? trueCV() : falseCV(),
  })
}

function okResult(hex: string): StacksCallResult {
  return { okay: true, result: hex }
}

function mockUint(value: number): StacksCallResult {
  return okResult(cvToHex(uintCV(value)))
}

function mockBuff1(byte: number): StacksCallResult {
  return okResult(cvToHex(bufferCV(new Uint8Array([byte]))))
}

/**
 * Build a full mock result array matching the expected call order.
 * APY values include a 1.0 base (e.g. 103500000 = 1.035x = 3.5% rate).
 */
function buildMockResults(): StacksCallResult[] {
  const assets = getZestAssets()
  const results: StacksCallResult[] = []

  // Per-asset calls (4 per asset)
  for (let i = 0; i < assets.length; i++) {
    // 0: reserve state
    results.push(okResult(cvToHex(mockReserveState({
      totalBorrowsVariable: 500000000 * (i + 1),
      currentVariableBorrowRate: 5000000 + i * 100000,
    }))))
    // 1: supply APY (includes 1.0 base: 103500000 = 1.035x = 3.5%)
    results.push(mockUint(103500000 + i * 50000))
    // 2: borrow APY (includes 1.0 base: 105000000 = 1.05x = 5%)
    results.push(mockUint(105000000 + i * 100000))
    // 3: e-mode type
    results.push(mockBuff1(i < 3 ? 0x01 : 0x00))
  }

  // E-mode config calls
  for (const _type of ZEST_EMODE_TYPES) {
    results.push(
      okResult(
        cvToHex(
          tupleCV({
            label: bufferCV(new TextEncoder().encode('STX Correlated')),
            ltv: uintCV(85000000),           // 85%
            'liquidation-threshold': uintCV(90000000), // 90%
          }),
        ),
      ),
    )
  }

  // Global: get-assets-read
  results.push(
    okResult(
      cvToHex(listCV(assets.map((a) => principalCV(a)))),
    ),
  )

  return results
}

describe('Zest V1 parser', () => {
  it('returns [converter, expectedCount] tuple', () => {
    const [converter, count] = getZestReservesDataConverter()
    expect(typeof converter).toBe('function')
    expect(count).toBe(getExpectedCallCount())
  })

  it('rejects results with wrong length', () => {
    const [converter] = getZestReservesDataConverter()
    const result = converter([])
    expect(result).toBeUndefined()
  })

  it('rejects results with wrong length (off by one)', () => {
    const [converter, count] = getZestReservesDataConverter()
    const results = buildMockResults()
    // Remove last element
    results.pop()
    expect(results.length).toBe(count - 1)
    const result = converter(results)
    expect(result).toBeUndefined()
  })

  it('parses valid mock results into reserve data', () => {
    const [converter, count] = getZestReservesDataConverter({ wstx: 1.5 })
    const results = buildMockResults()
    expect(results.length).toBe(count)

    const parsed = converter(results)
    expect(parsed).toBeDefined()
    expect(parsed!.chainId).toBe('stacks-mainnet')
    expect(Object.keys(parsed!.data).length).toBe(getZestAssets().length)
  })

  it('produces correct market UIDs', () => {
    const [converter] = getZestReservesDataConverter()
    const results = buildMockResults()
    const parsed = converter(results)!
    const assets = getZestAssets()

    for (const asset of assets) {
      const uid = `stacks-mainnet:zest-v1:${asset}`
      expect(parsed.data[uid]).toBeDefined()
      expect(parsed.data[uid].marketUid).toBe(uid)
    }
  })

  it('parses numeric fields correctly', () => {
    const [converter] = getZestReservesDataConverter()
    const results = buildMockResults()
    const parsed = converter(results)!
    const firstAsset = getZestAssets()[0]
    const uid = `stacks-mainnet:zest-v1:${firstAsset}`
    const reserve = parsed.data[uid]

    expect(reserve.decimals).toBe(8)
    expect(reserve.isActive).toBe(true)
    expect(reserve.isFrozen).toBe(false)
    expect(reserve.borrowingEnabled).toBe(true)
    expect(reserve.collateralActive).toBe(true)
    // LTV/threshold use 1e8 precision: 75000000 / 1e8 = 0.75
    expect(reserve.baseLtv).toBe(0.75)
    expect(reserve.liquidationThreshold).toBe(0.80)
  })

  it('calculates rates as decimals', () => {
    const [converter] = getZestReservesDataConverter()
    const results = buildMockResults()
    const parsed = converter(results)!
    const firstUid = Object.keys(parsed.data)[0]
    const reserve = parsed.data[firstUid]

    // Rate = raw / 1e8 - 1, so 103500000 / 1e8 - 1 = 0.035
    expect(reserve.depositRate).toBeCloseTo(0.035, 10)
    expect(reserve.variableBorrowRate).toBeCloseTo(0.05, 10)
  })

  it('applies USD prices when provided', () => {
    const assets = getZestAssets()
    const firstAsset = assets[0]
    const [converter] = getZestReservesDataConverter({ [firstAsset]: 2.5 })
    const results = buildMockResults()
    const parsed = converter(results)!
    const uid = `stacks-mainnet:zest-v1:${firstAsset}`
    const reserve = parsed.data[uid]

    // totalDebt should have a USD value
    expect(reserve.totalDebtUSD).toBeGreaterThan(0)
  })

  it('handles failed call results gracefully', () => {
    const [converter, count] = getZestReservesDataConverter()
    const results = buildMockResults()
    // Make one result fail
    results[0] = { okay: false, result: 'error' }
    const parsed = converter(results)
    expect(parsed).toBeUndefined()
  })
})
