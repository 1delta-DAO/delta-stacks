import { describe, it, expect } from 'vitest'
import {
  tupleCV,
  uintCV,
  trueCV,
  falseCV,
  bufferCV,
  responseOkCV,
  cvToHex,
} from '@stacks/transactions'
import { parseV1AggregatorResult } from '../public-data/zest-v1/aggregatorParse'
import { getZestAssets, ZEST_ASSET_SYMBOLS } from '../public-data/zest-v1/constants'
import { StacksCallResult } from '../stacks-call'

/** Build a mock reserve-state tuple matching Zest V1's get-reserve-state-read response */
function mockReserveStateTuple(overrides: Partial<{
  totalBorrowsVariable: number
  totalBorrowsStable: number
  decimals: number
  borrowingEnabled: boolean
  usageAsCollateralEnabled: boolean
  isActive: boolean
  isFrozen: boolean
  baseLtvAsCollateral: number
  liquidationThreshold: number
  liquidationBonus: number
  supplyCap: number
  borrowCap: number
  debtCeiling: number
}> = {}) {
  return tupleCV({
    'total-borrows-variable': uintCV(overrides.totalBorrowsVariable ?? 500000000),
    'total-borrows-stable': uintCV(overrides.totalBorrowsStable ?? 0),
    'current-liquidity-rate': uintCV(3000000),
    'current-variable-borrow-rate': uintCV(5000000),
    'current-stable-borrow-rate': uintCV(0),
    'base-ltv-as-collateral': uintCV(overrides.baseLtvAsCollateral ?? 75000000),
    'liquidation-threshold': uintCV(overrides.liquidationThreshold ?? 80000000),
    'liquidation-bonus': uintCV(overrides.liquidationBonus ?? 105000000),
    decimals: uintCV(overrides.decimals ?? 6),
    'borrowing-enabled': overrides.borrowingEnabled === false ? falseCV() : trueCV(),
    'usage-as-collateral-enabled': overrides.usageAsCollateralEnabled === false ? falseCV() : trueCV(),
    'is-active': overrides.isActive === false ? falseCV() : trueCV(),
    'is-frozen': overrides.isFrozen === true ? trueCV() : falseCV(),
    'supply-cap': uintCV(overrides.supplyCap ?? 10000000),
    'borrow-cap': uintCV(overrides.borrowCap ?? 5000000),
    'debt-ceiling': uintCV(overrides.debtCeiling ?? 0),
    'a-token-address': uintCV(0), // placeholder
  })
}

/** Build a mock per-asset tuple as returned by zest-reader.clar read-v1-* helpers */
function mockV1AssetTuple(overrides: Parameters<typeof mockReserveStateTuple>[0] = {}) {
  return tupleCV({
    'reserve-state': responseOkCV(mockReserveStateTuple(overrides)),
    'supply-apy': responseOkCV(uintCV(3000000)),   // 3%
    'borrow-apy': responseOkCV(uintCV(5000000)),    // 5%
    'e-mode-type': responseOkCV(bufferCV(Uint8Array.from([0x00]))),
  })
}

/**
 * Build a full mock V1 aggregator response matching zest-reader.clar's get-v1-reserve-data.
 * Returns (ok { wstx: {...}, ststx: {...}, ..., emode-0: ..., emode-1: ..., assets: ... })
 */
function buildMockV1AggregatorResult(): StacksCallResult {
  const emodeConfig0 = responseOkCV(tupleCV({
    label: uintCV(0), // placeholder
    ltv: uintCV(0),
    'liquidation-threshold': uintCV(0),
  }))

  const emodeConfig1 = responseOkCV(tupleCV({
    label: uintCV(1),
    ltv: uintCV(90000000),
    'liquidation-threshold': uintCV(95000000),
  }))

  const responseTuple = tupleCV({
    wstx: mockV1AssetTuple({ totalBorrowsVariable: 1000000000, decimals: 6 }),
    ststx: mockV1AssetTuple({ totalBorrowsVariable: 500000000, decimals: 6 }),
    sbtc: mockV1AssetTuple({ totalBorrowsVariable: 50000000, decimals: 8, borrowingEnabled: false }),
    aeusdc: mockV1AssetTuple({ totalBorrowsVariable: 2000000000, decimals: 8 }),
    diko: mockV1AssetTuple({ totalBorrowsVariable: 100000000, decimals: 6 }),
    usdh: mockV1AssetTuple({ totalBorrowsVariable: 300000000, decimals: 8 }),
    susdt: mockV1AssetTuple({ totalBorrowsVariable: 200000000, decimals: 6 }),
    ststxbtc: mockV1AssetTuple({ totalBorrowsVariable: 80000000, decimals: 6, borrowingEnabled: false }),
    alex: mockV1AssetTuple({ totalBorrowsVariable: 50000000, decimals: 6 }),
    'emode-0': emodeConfig0,
    'emode-1': emodeConfig1,
    assets: responseOkCV(uintCV(0)), // placeholder global asset list
  })

  const okResponse = responseOkCV(responseTuple)

  return {
    okay: true,
    result: cvToHex(okResponse),
  }
}

describe('Zest V1 aggregator parser', () => {
  it('parses a valid V1 aggregator response', () => {
    const result = buildMockV1AggregatorResult()
    const parsed = parseV1AggregatorResult(result)

    expect(parsed).toBeDefined()
    expect(parsed!.chainId).toBe('stacks-mainnet')
    expect(Object.keys(parsed!.data).length).toBe(10)
  })

  it('produces correct market UIDs', () => {
    const parsed = parseV1AggregatorResult(buildMockV1AggregatorResult())!
    const assets = getZestAssets()

    for (const asset of assets) {
      const uid = `stacks-mainnet:zest-v1:${asset}`
      expect(parsed.data[uid]).toBeDefined()
    }
  })

  it('maps correct symbols', () => {
    const parsed = parseV1AggregatorResult(buildMockV1AggregatorResult())!
    const assets = getZestAssets()

    for (const asset of assets) {
      const uid = `stacks-mainnet:zest-v1:${asset}`
      expect(parsed.data[uid].symbol).toBe(ZEST_ASSET_SYMBOLS[asset])
    }
  })

  it('extracts borrow amounts from reserve state', () => {
    const parsed = parseV1AggregatorResult(buildMockV1AggregatorResult())!
    const wstxAsset = getZestAssets()[0]
    const wstx = parsed.data[`stacks-mainnet:zest-v1:${wstxAsset}`]

    // wSTX: totalBorrowsVariable=1000000000, decimals=6 → 1000
    expect(wstx.totalDebt).toBeCloseTo(1000000000 / 1e6, 2)
  })

  it('extracts rates from reserve-state', () => {
    const parsed = parseV1AggregatorResult(buildMockV1AggregatorResult())!
    const wstxAsset = getZestAssets()[0]
    const wstx = parsed.data[`stacks-mainnet:zest-v1:${wstxAsset}`]

    // current-liquidity-rate: 3000000 / 1e8 = 0.03
    expect(wstx.depositRate).toBeCloseTo(0.03, 6)
    // current-variable-borrow-rate: 5000000 / 1e8 = 0.05
    expect(wstx.variableBorrowRate).toBeCloseTo(0.05, 6)
  })

  it('extracts config fields from reserve state', () => {
    const parsed = parseV1AggregatorResult(buildMockV1AggregatorResult())!
    const wstxAsset = getZestAssets()[0]
    const wstx = parsed.data[`stacks-mainnet:zest-v1:${wstxAsset}`]

    expect(wstx.collateralActive).toBe(true)
    expect(wstx.isActive).toBe(true)
    expect(wstx.isFrozen).toBe(false)
    expect(wstx.baseLtv).toBeCloseTo(0.75, 4)
    expect(wstx.liquidationThreshold).toBeCloseTo(0.80, 4)
    expect(wstx.liquidationBonus).toBeCloseTo(1.05, 4)
  })

  it('marks non-borrowable assets correctly', () => {
    const parsed = parseV1AggregatorResult(buildMockV1AggregatorResult())!
    // sBTC and stSTXbtcV2 are non-borrowable
    const assets = getZestAssets()
    const sbtcAsset = assets[2] // sBTC
    const sbtc = parsed.data[`stacks-mainnet:zest-v1:${sbtcAsset}`]

    expect(sbtc.borrowingEnabled).toBe(false)
  })

  it('applies USD prices', () => {
    const parsed = parseV1AggregatorResult(buildMockV1AggregatorResult(), {
      wstx: 1.5,
    })!
    const wstxAsset = getZestAssets()[0]
    const wstx = parsed.data[`stacks-mainnet:zest-v1:${wstxAsset}`]

    expect(wstx.totalDebtUSD).toBeCloseTo(wstx.totalDebt * 1.5, 2)
  })

  it('returns undefined for failed call', () => {
    const result = parseV1AggregatorResult({ okay: false, result: 'error' })
    expect(result).toBeUndefined()
  })

  it('assigns z-token addresses', () => {
    const parsed = parseV1AggregatorResult(buildMockV1AggregatorResult())!
    const wstxAsset = getZestAssets()[0]
    const wstx = parsed.data[`stacks-mainnet:zest-v1:${wstxAsset}`]

    expect(wstx.zToken).toBeDefined()
    expect(wstx.zToken).toContain('zwstx')
  })
})
