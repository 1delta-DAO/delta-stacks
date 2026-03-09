import { describe, it, expect, beforeAll } from 'vitest'
import { executeStacksReadCalls } from '../stacks-call'
import { buildZestV2UserCalls, buildZestV2CollateralCall, EXPECTED_V2_USER_CALL_COUNT } from '../lending/user-data/zest-v2/userCallBuild'
import {
  getZestV2UserDataConverter,
  parseV2ResolveSafe,
  parseV2CollateralResult,
  mergeV2Collateral,
} from '../lending/user-data/zest-v2/userCallParse'
import { fetchAllPrices } from '../prices'
import { getStacksLenderPublicData } from '../lending/public-data/fetchStacksLender'
import { convertPublicDataToMeta } from '../lending/user-data/convertPublicToMeta'
import { getStacksUserData } from '../lending/user-data/fetchStacksUserData'
import type { LenderCrossPoolMeta } from '../lending/user-data/utils/types'

const API_URL = 'https://api.hiro.so'
const opts = { apiUrl: API_URL, concurrency: 5 }

/** Known address with sBTC z-token collateral in Zest V2 */
const TEST_ACCOUNT = 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H'

/**
 * Integration test -- hits mainnet for user data.
 * Run with: npx vitest run src/__tests__/user-data-integration.test.ts
 *
 * Prices and public data are fetched once in beforeAll to avoid API rate limits.
 */
describe('user-data Zest V2 integration', { timeout: 120_000 }, () => {
  let prices: Record<string, number>
  let metaMap: LenderCrossPoolMeta

  beforeAll(async () => {
    prices = await fetchAllPrices({ apiUrl: API_URL })
    console.log('\nPrices:')
    for (const [k, v] of Object.entries(prices)) {
      if (!k.includes(':')) console.log(`  ${k}: $${v.toFixed(4)}`)
    }

    const v2Public = await getStacksLenderPublicData('zest-v2', prices, opts)
    expect(v2Public).toBeDefined()
    console.log(`\nV2 Public Data: ${Object.keys(v2Public!.data).length} markets`)
    for (const [uid, market] of Object.entries(v2Public!.data)) {
      console.log(`  ${uid}: supply=${market.supplyRate.toFixed(4)} borrow=${market.borrowRate.toFixed(4)} deposits=$${market.totalDepositsUSD.toFixed(0)}`)
    }

    metaMap = convertPublicDataToMeta({ v1: undefined, v2: v2Public, granite: undefined }, prices)
    console.log(`\nMetaMap: ${Object.keys(metaMap).length} entries`)
    for (const [uid, meta] of Object.entries(metaMap)) {
      console.log(`  ${uid}: decimals=${meta.asset?.decimals} price=$${meta.price?.priceUsd?.toFixed(2)} depositRate=${meta.depositRate?.toFixed(4)}`)
    }
  })

  it('builds the correct number of calls', () => {
    const calls = buildZestV2UserCalls(TEST_ACCOUNT)
    expect(calls).toHaveLength(EXPECTED_V2_USER_CALL_COUNT)
    expect(calls).toHaveLength(13)
  })

  it('fetches V2 user data with full pipeline (public data + prices + collateral)', async () => {
    // Phase 1: fetch vault balances + debt + resolve-safe
    const calls = buildZestV2UserCalls(TEST_ACCOUNT)
    const results = await executeStacksReadCalls(calls, opts)
    expect(results).toHaveLength(EXPECTED_V2_USER_CALL_COUNT)
    expect(results[0].okay).toBe(true)

    // Phase 2: parse resolve-safe and fetch collateral
    const resolved = parseV2ResolveSafe(results)
    expect(resolved).toBeDefined()
    console.log(`\n  resolve-safe: id=${resolved!.userId}, mask=${resolved!.userMask}`)

    const colCall = buildZestV2CollateralCall(resolved!.userId, resolved!.userMask)
    const [colResult] = await executeStacksReadCalls([colCall], opts)
    const collateral = parseV2CollateralResult(colResult)
    console.log(`  collateral entries: ${JSON.stringify(collateral)}`)
    expect(collateral.length).toBeGreaterThan(0)

    // Phase 3: parse user data with metaMap + prices, merge collateral
    const [converter] = getZestV2UserDataConverter(TEST_ACCOUNT, metaMap, prices)
    let userData = converter(results)
    expect(userData).toBeDefined()
    userData = mergeV2Collateral(userData, collateral, metaMap, prices)

    expect(userData).toBeDefined()
    expect(userData!.chainId).toBe('stacks-mainnet')
    expect(userData!.account).toBe(TEST_ACCOUNT)

    const pool = userData!.data[0]
    const positions = pool.positions
    console.log('\nV2 User Data Summary:')
    console.log(`  Account: ${userData!.account}`)
    console.log(`  Health: ${pool.health}`)
    console.log(`  Total Deposits: $${pool.balanceData.deposits.toFixed(4)}`)
    console.log(`  Total Debt: $${pool.balanceData.debt.toFixed(4)}`)
    console.log(`  Net APR: ${(pool.aprData.apr * 100).toFixed(2)}%`)
    console.log(`  Deposit APR: ${(pool.aprData.depositApr * 100).toFixed(2)}%`)
    console.log(`  Positions (${positions.length}):`)
    for (const pos of positions) {
      console.log(`    ${(pos as any).marketUid}: deposits=${pos.deposits} ($${pos.depositsUSD.toFixed(4)}), debt=${pos.debt} ($${pos.debtUSD.toFixed(4)}), collateral=${pos.collateralEnabled}`)
    }

    // Verify sBTC collateral position
    expect(positions.length).toBeGreaterThan(0)
    const sbtcPos = positions.find((p: any) => p.marketUid === 'stacks-mainnet:zest-v2:2')
    expect(sbtcPos).toBeDefined()
    expect(Number(sbtcPos!.deposits)).toBeGreaterThan(0)
    expect(sbtcPos!.depositsUSD).toBeGreaterThan(0)
    expect(pool.balanceData.deposits).toBeGreaterThan(0)
  })

  it('fetches V2 user data via orchestrator', async () => {
    // Use the orchestrator — tries reader contract first, falls back to individual calls
    const userData = await getStacksUserData('zest-v2', TEST_ACCOUNT, metaMap, prices, opts)

    expect(userData).toBeDefined()
    expect(userData!.account).toBe(TEST_ACCOUNT)

    const pool = userData!.data[0]
    const positions = pool.positions

    console.log('\n[Orchestrator] V2 User Data:')
    console.log(`  Total Deposits: $${pool.balanceData.deposits.toFixed(4)}`)
    console.log(`  Positions (${positions.length}):`)
    for (const pos of positions) {
      console.log(`    ${(pos as any).marketUid}: deposits=${pos.deposits} ($${pos.depositsUSD.toFixed(4)}), collateral=${pos.collateralEnabled}`)
    }

    expect(positions.length).toBeGreaterThan(0)
    expect(pool.balanceData.deposits).toBeGreaterThan(0)
  })
})
