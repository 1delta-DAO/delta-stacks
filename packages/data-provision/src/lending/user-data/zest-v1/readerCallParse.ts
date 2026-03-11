import { createBaseTypeUserState } from '../utils'
import { parseRawAmount } from '../utils/formatting'
import { getDisplayPrice, getOraclePrice } from '../utils/oraclePrice'
import type { LenderCrossPoolMeta, UserData } from '../utils/types'
import type { StacksCallResult } from '../../../stacks-call'
import { decodeClarityValue, extractTuple, extractUint } from '../../../stacks-call'
import { getZestAssets, ZEST_ASSET_SYMBOLS } from '../../public-data/zest-v1/constants'

const STACKS_CHAIN_ID = 'stacks-mainnet'
const LENDER_ID = 'zest-v1'

/**
 * Mapping from asset principal → tuple key in the reader response.
 * Must match the keys in read-v1-user in user-reader-v2.clar.
 * Order matches on-chain asset registry (pool-reserve-data.get-assets-read).
 */
const READER_KEYS = [
  'ststx', 'aeusdc', 'wstx', 'diko', 'usdh', 'susdt', 'usda', 'sbtc', 'alex', 'ststxbtc',
]

const ASSET_TO_READER_KEY: Record<string, string> = {}

function initAssetKeyMapping() {
  const assets = getZestAssets()
  for (let i = 0; i < assets.length && i < READER_KEYS.length; i++) {
    ASSET_TO_READER_KEY[assets[i]] = READER_KEYS[i]
  }
}
initAssetKeyMapping()

/**
 * Parse the result of a single read-v1-user reader call from user-reader-v2.
 *
 * The v2 reader returns a tuple where each asset field is:
 *   { reserve: (optional {tuple}), z-balance: (response uint uint) }
 *
 * Returns UserData or undefined on failure.
 */
export function parseV1UserReaderResults(
  results: StacksCallResult[],
  account: string,
  metaMap?: LenderCrossPoolMeta,
  prices?: Record<string, number>,
): UserData | undefined {
  if (results.length !== 1 || !results[0].okay) return undefined

  try {
    const decoded = decodeClarityValue(results[0].result)
    const outerTuple = extractTuple(decoded)
    if (!outerTuple) return undefined

    const assets = getZestAssets()
    const lendingPositions: Record<string, any> = {}
    let totalDebt24h = 0
    let totalDeposits24h = 0

    // Extract e-mode
    let userEMode = 0
    const emodeVal = outerTuple['e-mode']
    if (emodeVal) {
      try {
        userEMode = Number(extractUint(emodeVal) ?? emodeVal.value ?? 0)
      } catch { /* default 0 */ }
    }

    // Process each asset
    for (const asset of assets) {
      const readerKey = ASSET_TO_READER_KEY[asset]
      if (!readerKey) continue

      const assetData = outerTuple[readerKey]
      if (!assetData) continue

      // Each asset is a tuple: { reserve, z-balance }
      const assetTuple = extractTuple(assetData)
      if (!assetTuple) continue

      // Extract z-token balance (deposit amount)
      // z-balance is (response uint uint) from get-balance
      let depositRaw = '0'
      const zBalField = assetTuple['z-balance']
      if (zBalField) {
        // Unwrap (ok uint) response
        const inner = zBalField?.success === true ? zBalField.value : zBalField
        const raw = extractUint(inner)
        if (raw !== undefined && Number(raw) !== 0) depositRaw = String(raw)
      }

      // Extract reserve data (borrow info + collateral flag)
      // reserve is (optional {tuple})
      let borrowRaw = '0'
      let collateralEnabled = false
      const reserveField = assetTuple['reserve']
      if (reserveField) {
        // Unwrap optional
        const innerVal = reserveField?.value
        if (innerVal !== null && innerVal !== undefined) {
          const fields = innerVal?.value ?? innerVal
          if (fields && typeof fields === 'object') {
            borrowRaw = String(fields['principal-borrow-balance']?.value ?? 0)
            collateralEnabled = fields['use-as-collateral']?.value === true
          }
        }
      }

      if (depositRaw === '0' && borrowRaw === '0') continue

      const symbol = ZEST_ASSET_SYMBOLS[asset] ?? ''
      const marketUid = `${STACKS_CHAIN_ID}:${LENDER_ID}:${asset}`
      const meta = metaMap?.[marketUid]
      const decimals = meta?.asset?.decimals ?? 8

      const deposits = parseRawAmount(depositRaw, decimals)
      const debt = parseRawAmount(borrowRaw, decimals)

      const price = prices?.[marketUid] ?? prices?.[symbol.toLowerCase()] ?? prices?.[asset] ?? getDisplayPrice(meta ?? {})
      const oPrice = getOraclePrice(meta ?? {})
      const priceHist = meta?.price?.priceUsd24h ?? price

      lendingPositions[marketUid] = {
        marketUid,
        underlying: meta?.asset?.address,
        deposits,
        debtStable: '0',
        debt,
        depositsUSD: Number(deposits) * price,
        debtStableUSD: 0,
        debtUSD: Number(debt) * price,
        depositsUSDOracle: Number(deposits) * oPrice,
        debtStableUSDOracle: 0,
        debtUSDOracle: Number(debt) * oPrice,
        collateralEnabled,
        claimableRewards: 0,
      }

      totalDeposits24h += Number(deposits) * priceHist
      totalDebt24h += Number(debt) * priceHist
    }

    const payload = {
      chainId: STACKS_CHAIN_ID,
      account,
      lendingPositions,
      rewards: [],
      userEMode,
    }

    return createBaseTypeUserState(payload, metaMap ?? {}, totalDeposits24h, totalDebt24h)
  } catch (e) {
    console.warn('Failed to parse V1 user reader results:', e)
    return undefined
  }
}
