import { describe, it, expect } from 'vitest'
import {
  getAllLendingData,
  getStacksLenderPublicData,
} from '../public-data/fetchStacksLender'

const API_URL = 'https://api.hiro.so'
const opts = { apiUrl: API_URL, concurrency: 2 }

/**
 * Integration test — hits mainnet reader contract.
 * Run with: npx vitest run src/__tests__/reader-integration.test.ts
 *
 * These tests call the deployed lending-reader-v2 contract on Stacks mainnet
 * via per-asset reader functions (19 calls total instead of 117).
 */
describe('lending-reader-v2 integration', { timeout: 120_000 }, () => {
  it('getAllLendingData returns data for all 3 protocols via reader contract', async () => {
    const result = await getAllLendingData({}, opts)

    // V1: 10 Zest V1 assets (including USDA)
    expect(result.v1).toBeDefined()
    expect(result.v1!.chainId).toBe('stacks-mainnet')
    expect(Object.keys(result.v1!.data).length).toBe(10)

    // V2: 6 Zest V2 vaults
    expect(result.v2).toBeDefined()
    expect(result.v2!.chainId).toBe('stacks-mainnet')
    expect(Object.keys(result.v2!.data).length).toBe(6)

    // Granite: 2 borrowable markets + 2 collateral entries (sBTC per market)
    expect(result.granite).toBeDefined()
    expect(result.granite!.chainId).toBe('stacks-mainnet')
    expect(Object.keys(result.granite!.data).length).toBe(4)
  })

  it('V1 reader returns valid reserve data for all 10 assets', async () => {
    const v1 = await getStacksLenderPublicData('zest-v1', {}, opts)

    expect(v1).toBeDefined()
    const markets = Object.values(v1!.data)
    expect(markets.length).toBe(10)

    for (const market of markets) {
      expect(market.marketUid).toContain('stacks-mainnet:zest-v1:')
      expect(market.symbol).toBeTruthy()
      expect(market.decimals).toBeGreaterThan(0)
      expect(market.depositRate).toBeGreaterThanOrEqual(0)
      expect(market.variableBorrowRate).toBeGreaterThanOrEqual(0)
    }
  })

  it('V2 reader returns valid vault data for all 6 vaults', async () => {
    const v2 = await getStacksLenderPublicData('zest-v2', {}, opts)

    expect(v2).toBeDefined()
    const markets = Object.values(v2!.data)
    expect(markets.length).toBe(6)

    for (const market of markets) {
      expect(market.marketUid).toContain('stacks-mainnet:zest-v2:')
      expect(market.symbol).toBeTruthy()
      expect(market.totalDeposits).toBeGreaterThanOrEqual(0)
      expect(market.borrowRate).toBeGreaterThanOrEqual(0)
    }
  })

  it('Granite reader returns valid market data', async () => {
    const granite = await getStacksLenderPublicData('granite', {}, opts)

    expect(granite).toBeDefined()
    const markets = Object.values(granite!.data)
    expect(markets.length).toBe(4) // 2 borrowable + 2 collateral (sBTC)

    const aeusdc = granite!.data['stacks-mainnet:granite:aeusdc']
    const usdcx = granite!.data['stacks-mainnet:granite:usdcx']

    expect(aeusdc).toBeDefined()
    expect(aeusdc.symbol).toBe('aeUSDC')
    expect(aeusdc.totalAssets).toBeGreaterThan(0)
    expect(aeusdc.isCollateral).toBe(false)
    expect(aeusdc.baseLtv).toBe(0)

    expect(usdcx).toBeDefined()
    expect(usdcx.symbol).toBe('USDCx')
    expect(usdcx.totalAssets).toBeGreaterThanOrEqual(0)
    expect(usdcx.isCollateral).toBe(false)

    // sBTC collateral entries
    const sbtcAeusdc = granite!.data['stacks-mainnet:granite:aeusdc:sbtc']
    const sbtcUsdcx = granite!.data['stacks-mainnet:granite:usdcx:sbtc']

    expect(sbtcAeusdc).toBeDefined()
    expect(sbtcAeusdc.symbol).toBe('sBTC')
    expect(sbtcAeusdc.isCollateral).toBe(true)
    expect(sbtcAeusdc.parentMarketId).toBe('aeusdc')
    expect(sbtcAeusdc.baseLtv).toBeGreaterThan(0)
    expect(sbtcAeusdc.borrowRate).toBe(0)

    expect(sbtcUsdcx).toBeDefined()
    expect(sbtcUsdcx.symbol).toBe('sBTC')
    expect(sbtcUsdcx.isCollateral).toBe(true)
    expect(sbtcUsdcx.parentMarketId).toBe('usdcx')
  })

  // Individual calls fallback is tested by the unit tests (no network needed).
  // Skipping here to avoid 429 rate limits from the public Hiro API.
})
