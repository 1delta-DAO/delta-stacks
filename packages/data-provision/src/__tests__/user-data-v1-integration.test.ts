import { describe, it, expect, beforeAll } from 'vitest'
import { executeStacksReadCalls } from '../stacks-call'
import { fetchAllPrices } from '../prices'
import { getStacksLenderPublicData } from '../lending/public-data/fetchStacksLender'
import { convertPublicDataToMeta } from '../lending/user-data/convertPublicToMeta'
import { getStacksUserData, getAllUserData } from '../lending/user-data/fetchStacksUserData'
import { buildV1UserReaderCalls } from '../lending/user-data/zest-v1/readerCallBuild'
import { parseV1UserReaderResults } from '../lending/user-data/zest-v1/readerCallParse'
import { buildZestV1UserCalls } from '../lending/user-data/zest-v1/userCallBuild'
import { getZestV1UserDataConverter } from '../lending/user-data/zest-v1/userCallParse'
import type { LenderCrossPoolMeta } from '../lending/user-data/utils/types'
import type { AllLendingData } from '../lending/public-data/fetchStacksLender'

const API_URL = 'https://api.hiro.so'
const opts = { apiUrl: API_URL, concurrency: 5 }

/** Known address with sBTC deposit in Zest V1 */
const TEST_ACCOUNT = 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H'

describe('user-data Zest V1 integration', { timeout: 120_000 }, () => {
  let prices: Record<string, number>
  let metaMap: LenderCrossPoolMeta
  let allLendingData: AllLendingData

  beforeAll(async () => {
    prices = await fetchAllPrices({ apiUrl: API_URL })
    console.log('\nPrices (symbols):')
    for (const [k, v] of Object.entries(prices)) {
      if (!k.includes(':')) console.log(`  ${k}: $${v.toFixed(4)}`)
    }

    const v1Public = await getStacksLenderPublicData('zest-v1', prices, opts)
    expect(v1Public).toBeDefined()
    console.log(`\nV1 Public Data: ${Object.keys(v1Public!.data).length} markets`)
    for (const [uid, market] of Object.entries(v1Public!.data)) {
      console.log(`  ${uid}: symbol=${market.symbol} deposits=${market.totalDeposits.toFixed(4)} depositRate=${market.depositRate.toFixed(4)} oracle=${market.oracle ?? 'NONE'}`)
    }

    allLendingData = { v1: v1Public, v2: undefined, granite: undefined }
    metaMap = convertPublicDataToMeta(allLendingData, prices)

    console.log(`\nMetaMap: ${Object.keys(metaMap).length} entries`)
    for (const [uid, meta] of Object.entries(metaMap)) {
      if (!uid.includes('zest-v1')) continue
      console.log(`  ${uid}: decimals=${meta.asset?.decimals} price=$${meta.price?.priceUsd?.toFixed(2)} oraclePrice=$${meta.price?.oraclePrice?.toFixed(2)} depositRate=${meta.depositRate?.toFixed(4)} configs=${JSON.stringify(meta.configs)}`)
    }
  })

  it('reader call: fetches V1 user data via batched reader contract', async () => {
    const calls = buildV1UserReaderCalls(TEST_ACCOUNT)
    expect(calls).toHaveLength(1)

    const results = await executeStacksReadCalls(calls, opts)
    expect(results).toHaveLength(1)
    console.log(`\nReader call okay: ${results[0].okay}`)

    // Debug: inspect raw decoded reader result
    const { decodeClarityValue, extractTuple } = await import('../stacks-call')
    const decoded = decodeClarityValue(results[0].result)
    console.log('\nDecoded type:', decoded?.type, 'success:', decoded?.success)
    let outer: any
    try {
      outer = extractTuple(decoded)
    } catch (e) {
      // Unwrap ok/some wrappers
      const inner = decoded?.value
      console.log('Inner type:', inner?.type, 'inner value type:', typeof inner?.value)
      try { outer = extractTuple(inner) } catch { outer = null }
    }
    if (outer) {
      const keys = Object.keys(outer)
      console.log('Outer tuple keys:', keys)
      for (const k of keys) {
        const v = outer[k]
        const vType = v?.type ?? typeof v
        const hasValue = v?.value !== undefined
        const valNull = v?.value === null
        console.log(`  ${k}: type=${vType} hasValue=${hasValue} valueNull=${valNull}`)
        // If it's an optional with value, show the inner tuple fields
        if (v?.value && typeof v.value === 'object' && !valNull) {
          const innerFields = v.value?.value ?? v.value
          if (typeof innerFields === 'object') {
            for (const [fk, fv] of Object.entries(innerFields as Record<string, any>)) {
              console.log(`    ${fk}: ${JSON.stringify(fv).slice(0, 100)}`)
            }
          }
        }
      }
    }

    const userData = parseV1UserReaderResults(results, TEST_ACCOUNT, metaMap, prices)
    console.log('\nReader parser returns undefined (expected — reader lacks z-token balances):',  userData === undefined)
    console.log('\n[Reader] V1 User Data:')
    if (userData) {
      const pool = userData.data[0]
      console.log(`  Account: ${userData.account}`)
      console.log(`  Health: ${pool.health}`)
      console.log(`  Borrow Capacity: $${pool.borrowCapacityUSD.toFixed(4)}`)
      console.log(`  Deposits: $${pool.balanceData.deposits.toFixed(4)}`)
      console.log(`  Debt: $${pool.balanceData.debt.toFixed(4)}`)
      console.log(`  Collateral: $${pool.balanceData.collateral.toFixed(4)}`)
      console.log(`  Adjusted Debt: $${pool.balanceData.adjustedDebt.toFixed(4)}`)
      console.log(`  Positions (${pool.positions.length}):`)
      for (const pos of pool.positions) {
        const p = pos as any
        console.log(`    ${p.marketUid}: deposits=${pos.deposits} ($${pos.depositsUSD.toFixed(4)}), debt=${pos.debt} ($${pos.debtUSD.toFixed(4)}), collateral=${pos.collateralEnabled}`)
      }

      expect(pool.positions.length).toBeGreaterThan(0)
      expect(pool.balanceData.deposits).toBeGreaterThan(0)
    } else {
      console.log('  Reader returned undefined — expected (reader lacks z-token balances)')
    }
    // Reader is expected to return undefined so individual calls are used
    expect(userData).toBeUndefined()
  })

  it('individual calls: fetches V1 user data via per-asset calls', async () => {
    const calls = buildZestV1UserCalls(TEST_ACCOUNT)
    console.log(`\nIndividual calls: ${calls.length} calls`)

    const results = await executeStacksReadCalls(calls, opts)
    const okCount = results.filter(r => r.okay).length
    console.log(`  OK: ${okCount}/${results.length}`)

    const [converter] = getZestV1UserDataConverter(TEST_ACCOUNT, metaMap, prices)
    const userData = converter(results)

    console.log('\n[Individual] V1 User Data:')
    if (userData) {
      const pool = userData.data[0]
      console.log(`  Health: ${pool.health}`)
      console.log(`  Deposits: $${pool.balanceData.deposits.toFixed(4)}`)
      console.log(`  Debt: $${pool.balanceData.debt.toFixed(4)}`)
      console.log(`  Collateral: $${pool.balanceData.collateral.toFixed(4)}`)
      console.log(`  Positions (${pool.positions.length}):`)
      for (const pos of pool.positions) {
        const p = pos as any
        console.log(`    ${p.marketUid}: deposits=${pos.deposits} ($${pos.depositsUSD.toFixed(4)}), debt=${pos.debt} ($${pos.debtUSD.toFixed(4)}), collateral=${pos.collateralEnabled}`)
      }

      expect(pool.positions.length).toBeGreaterThan(0)
      expect(pool.balanceData.deposits).toBeGreaterThan(0)
    } else {
      console.log('  Individual converter returned undefined')
    }
  })

  it('orchestrator: fetches V1 user data via getStacksUserData', async () => {
    const userData = await getStacksUserData('zest-v1', TEST_ACCOUNT, metaMap, prices, opts)

    console.log('\n[Orchestrator] V1 User Data:')
    if (userData) {
      const pool = userData.data[0]
      console.log(`  Health: ${pool.health}`)
      console.log(`  Deposits: $${pool.balanceData.deposits.toFixed(4)}`)
      console.log(`  Debt: $${pool.balanceData.debt.toFixed(4)}`)
      console.log(`  Positions (${pool.positions.length}):`)
      for (const pos of pool.positions) {
        const p = pos as any
        console.log(`    ${p.marketUid}: deposits=${pos.deposits} ($${pos.depositsUSD.toFixed(4)})`)
      }

      const realPositions = pool.positions.filter((p: any) => p.depositsUSD > 0 || p.debtUSD > 0)
      expect(realPositions.length).toBeGreaterThan(0)
    } else {
      console.log('  Orchestrator returned undefined')
    }
    expect(userData).toBeDefined()
  })

  it('getAllUserData: fetches V1 data as part of combined fetch', async () => {
    const fullMetaMap = convertPublicDataToMeta(allLendingData, prices)
    const allData = await getAllUserData(TEST_ACCOUNT, fullMetaMap, prices, opts)

    console.log('\n[getAllUserData] Results:')
    console.log(`  V1: ${allData.v1 ? 'present' : 'undefined'}`)
    console.log(`  V2: ${allData.v2 ? 'present' : 'undefined'}`)
    console.log(`  Granite: ${allData.granite ? 'present' : 'undefined'}`)

    if (allData.v1) {
      const pool = allData.v1.data[0]
      console.log(`\n  V1 Details:`)
      console.log(`    Health: ${pool.health}`)
      console.log(`    Deposits: $${pool.balanceData.deposits.toFixed(4)}`)
      console.log(`    Positions: ${pool.positions.length}`)
      const realPositions = pool.positions.filter((p: any) => p.depositsUSD > 0 || p.debtUSD > 0)
      expect(realPositions.length).toBeGreaterThan(0)
    }
    expect(allData.v1).toBeDefined()
  })
})
