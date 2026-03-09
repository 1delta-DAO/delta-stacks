import { createBaseTypeUserState } from '../utils'
import { parseRawAmount } from '../utils/formatting'
import { getDisplayPrice, getOraclePrice } from '../utils/oraclePrice'
import type { LenderCrossPoolMeta, LenderYieldComplete, UserData } from '../utils/types'
import type { StacksCallResult } from '../../../stacks-call'
import { decodeClarityValue, extractTuple, extractUint } from '../../../stacks-call'
import { getZestAssets, ZEST_ASSET_SYMBOLS } from '../../public-data/zest-v1/constants'

const STACKS_CHAIN_ID = 'stacks-mainnet'
const LENDER_ID = 'zest-v1'

/**
 * Mapping from asset principal → tuple key in the reader response.
 * Must match the keys in read-v1-user in user-reader-v1.clar.
 */
const ASSET_TO_READER_KEY: Record<string, string> = {}
// Build mapping dynamically from known assets
const READER_KEYS = [
  'wstx', 'ststx', 'sbtc', 'aeusdc', 'diko', 'usdh', 'susdt', 'ststxbtc', 'alex',
]

// Initialize mapping: getZestAssets() returns assets in a fixed order
function initAssetKeyMapping() {
  const assets = getZestAssets()
  for (let i = 0; i < assets.length && i < READER_KEYS.length; i++) {
    ASSET_TO_READER_KEY[assets[i]] = READER_KEYS[i]
  }
}
initAssetKeyMapping()

/**
 * Parse the result of a single read-v1-user reader call.
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
        userEMode = Number(emodeVal.value ?? 0)
      } catch { /* default 0 */ }
    }

    // Process each asset
    for (const asset of assets) {
      const readerKey = ASSET_TO_READER_KEY[asset]
      if (!readerKey) continue

      const assetData = outerTuple[readerKey]
      if (!assetData) continue

      const t = extractTuple(assetData)
      if (!t) continue

      const symbol = ZEST_ASSET_SYMBOLS[asset] ?? ''
      const marketUid = `${STACKS_CHAIN_ID}:${LENDER_ID}:${asset}`
      const meta = metaMap?.[marketUid]
      const decimals = meta?.asset?.decimals ?? 8

      const aTokenBalanceRaw = String(t['current-atoken-balance']?.value ?? 0)
      const stableDebtRaw = String(t['current-stable-debt']?.value ?? 0)
      const variableDebtRaw = String(t['current-variable-debt']?.value ?? 0)

      if (aTokenBalanceRaw === '0' && stableDebtRaw === '0' && variableDebtRaw === '0') continue

      const deposits = parseRawAmount(aTokenBalanceRaw, decimals)
      const debtStable = parseRawAmount(stableDebtRaw, decimals)
      const debt = parseRawAmount(variableDebtRaw, decimals)

      const price = prices?.[marketUid] ?? prices?.[symbol.toLowerCase()] ?? prices?.[asset] ?? getDisplayPrice(meta ?? {})
      const oPrice = getOraclePrice(meta ?? {})
      const priceHist = meta?.price?.priceUsd24h ?? price

      const collateralEnabled = t['usage-as-collateral-enabled']?.value === true

      lendingPositions[marketUid] = {
        marketUid,
        underlying: meta?.asset?.address,
        deposits,
        debtStable,
        debt,
        depositsUSD: Number(deposits) * price,
        debtStableUSD: Number(debtStable) * price,
        debtUSD: Number(debt) * price,
        depositsUSDOracle: Number(deposits) * oPrice,
        debtStableUSDOracle: Number(debtStable) * oPrice,
        debtUSDOracle: Number(debt) * oPrice,
        collateralEnabled,
        claimableRewards: 0,
      }

      totalDeposits24h += Number(deposits) * priceHist
      totalDebt24h += (Number(debt) + Number(debtStable)) * priceHist
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
