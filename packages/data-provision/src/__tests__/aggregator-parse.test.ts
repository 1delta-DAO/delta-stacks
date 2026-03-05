import { describe, it, expect } from 'vitest'
import { tupleCV, uintCV, responseOkCV, cvToHex } from '@stacks/transactions'
import { parseAggregatorResult } from '../public-data/zest-v2/aggregatorParse'
import { ZEST_V2_UNDERLYING_IDS, ZEST_V2_SYMBOLS } from '../public-data/zest-v2/constants'
import { StacksCallResult } from '../stacks-call'

function mockVaultTuple(overrides: Record<string, number> = {}) {
  return tupleCV({
    'total-supply': uintCV(overrides.totalSupply ?? 1000000000),
    'total-assets': uintCV(overrides.totalAssets ?? 800000000),
    debt: uintCV(overrides.debt ?? 300000000),
    available: uintCV(overrides.available ?? 500000000),
    'interest-rate': uintCV(overrides.interestRate ?? 5000000),
    index: uintCV(overrides.index ?? 105000000),
    lindex: uintCV(overrides.lindex ?? 102000000),
    'cap-debt': uintCV(overrides.capDebt ?? 10000000000),
    'cap-supply': uintCV(overrides.capSupply ?? 20000000000),
    'fee-reserve': uintCV(overrides.feeReserve ?? 10000000), // 10%
  })
}

/**
 * Build a mock aggregator response matching zest-v2-reader.clar's get-all-reserve-data.
 * Returns (ok { stx: {...}, sbtc: {...}, ..., asset-bitmap: uint })
 */
function buildMockAggregatorResult(): StacksCallResult {
  // Bitmap: all 6 underlying collateral-enabled (bits 0,2,4,6,8,10)
  // All 6 underlying debt-enabled (bits 64,66,68,70,72,74)
  // All 6 z-tokens collateral-enabled (bits 1,3,5,7,9,11)
  let bitmap = 0n
  for (const aid of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
    bitmap |= 1n << BigInt(aid) // collateral
  }
  for (const aid of [0, 2, 4, 6, 8, 10]) {
    bitmap |= 1n << BigInt(aid + 64) // debt
  }

  const responseTuple = tupleCV({
    stx: mockVaultTuple({ totalAssets: 1000000000, debt: 400000000, available: 600000000 }),
    sbtc: mockVaultTuple({ totalAssets: 50000000, debt: 10000000, available: 40000000 }),
    ststx: mockVaultTuple({ totalAssets: 2000000000, debt: 800000000, available: 1200000000 }),
    usdc: mockVaultTuple({ totalAssets: 5000000000, debt: 2000000000, available: 3000000000 }),
    usdh: mockVaultTuple({ totalAssets: 500000000, debt: 100000000, available: 400000000 }),
    ststxbtc: mockVaultTuple({ totalAssets: 300000000, debt: 50000000, available: 250000000 }),
    'asset-bitmap': uintCV(bitmap),
  })

  const okResponse = responseOkCV(responseTuple)

  return {
    okay: true,
    result: cvToHex(okResponse),
  }
}

describe('Zest V2 aggregator parser', () => {
  it('parses a valid aggregator response', () => {
    const result = buildMockAggregatorResult()
    const parsed = parseAggregatorResult(result)

    expect(parsed).toBeDefined()
    expect(parsed!.chainId).toBe('stacks-mainnet')
    expect(Object.keys(parsed!.data).length).toBe(6)
  })

  it('produces correct market UIDs and symbols', () => {
    const parsed = parseAggregatorResult(buildMockAggregatorResult())!

    for (const aid of ZEST_V2_UNDERLYING_IDS) {
      const uid = `stacks-mainnet:zest-v2:${aid}`
      expect(parsed.data[uid]).toBeDefined()
      expect(parsed.data[uid].symbol).toBe(ZEST_V2_SYMBOLS[aid])
    }
  })

  it('calculates total deposits from total-assets', () => {
    const parsed = parseAggregatorResult(buildMockAggregatorResult())!
    const stx = parsed.data['stacks-mainnet:zest-v2:0']

    // STX: totalAssets=1000000000, decimals=6, so 1000000000/1e6 = 1000
    expect(stx.totalDeposits).toBeCloseTo(1000000000 / 1e6, 2)
    expect(stx.totalBorrows).toBeCloseTo(400000000 / 1e6, 2)
    expect(stx.availableLiquidity).toBeCloseTo(600000000 / 1e6, 2)
  })

  it('parses borrow rate correctly', () => {
    const parsed = parseAggregatorResult(buildMockAggregatorResult())!
    const stx = parsed.data['stacks-mainnet:zest-v2:0']

    // interest-rate: 5000000 / 1e8 = 0.05 = 5%
    expect(stx.borrowRate).toBe(5000000 / 1e8)
  })

  it('derives supply rate from borrow rate, utilization, and fee', () => {
    const parsed = parseAggregatorResult(buildMockAggregatorResult())!
    const stx = parsed.data['stacks-mainnet:zest-v2:0']

    // utilization = debt/totalAssets = 400/1000 = 0.4
    // feeReserve = 10000000/1e8 = 0.1
    // supplyRate = borrowRate * utilization * (1 - fee)
    //            = 0.05 * 0.4 * 0.9 = 0.018
    expect(stx.supplyRate).toBeCloseTo(0.018, 6)
  })

  it('parses indexes', () => {
    const parsed = parseAggregatorResult(buildMockAggregatorResult())!
    const stx = parsed.data['stacks-mainnet:zest-v2:0']

    expect(stx.borrowIndex).toBe(105000000 / 1e8)
    expect(stx.liquidityIndex).toBe(102000000 / 1e8)
  })

  it('parses asset bitmap into statuses', () => {
    const parsed = parseAggregatorResult(buildMockAggregatorResult())!

    // All underlying assets should be collateral + debt enabled
    for (const aid of ZEST_V2_UNDERLYING_IDS) {
      expect(parsed.assetStatuses[aid].collateralEnabled).toBe(true)
      expect(parsed.assetStatuses[aid].debtEnabled).toBe(true)
    }

    // Z-tokens should be collateral-enabled but NOT debt-enabled
    for (const zid of [1, 3, 5, 7, 9, 11]) {
      expect(parsed.assetStatuses[zid].collateralEnabled).toBe(true)
      expect(parsed.assetStatuses[zid].debtEnabled).toBe(false)
    }
  })

  it('z-token collateral status propagates to reserve data', () => {
    const parsed = parseAggregatorResult(buildMockAggregatorResult())!
    const stx = parsed.data['stacks-mainnet:zest-v2:0']

    expect(stx.zTokenCollateralEnabled).toBe(true)
    expect(stx.zTokenId).toBe(1)
    expect(stx.zTokenSymbol).toBe('zSTX')
  })

  it('applies USD prices', () => {
    const parsed = parseAggregatorResult(buildMockAggregatorResult(), {
      stx: 2.0,
    })!
    const stx = parsed.data['stacks-mainnet:zest-v2:0']

    expect(stx.totalDepositsUSD).toBeCloseTo(stx.totalDeposits * 2.0, 2)
    expect(stx.totalBorrowsUSD).toBeCloseTo(stx.totalBorrows * 2.0, 2)
  })

  it('returns undefined for failed call', () => {
    const result = parseAggregatorResult({ okay: false, result: 'error' })
    expect(result).toBeUndefined()
  })
})
