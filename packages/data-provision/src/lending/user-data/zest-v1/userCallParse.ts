import { createBaseTypeUserState } from '../utils'
import { parseRawAmount } from '../utils/formatting'
import { getDisplayPrice, getOraclePrice } from '../utils/oraclePrice'
import type { LenderCrossPoolMeta, LenderYieldComplete, UserData } from '../utils/types'
import type { StacksCallResult } from '../../../stacks-call'
import { decodeClarityValue, extractTuple, extractUint } from '../../../stacks-call'
import { getZestAssets, ZEST_ASSET_SYMBOLS, ZEST_Z_TOKENS } from '../../public-data/zest-v1/constants'

const STACKS_CHAIN_ID = 'stacks-mainnet'
const LENDER_ID = 'zest-v1'

/**
 * Returns a [converter, expectedCount] tuple for Zest V1 user data.
 *
 * Call layout:
 *   [0..N)           per-asset reserve data (raw: principal-borrow-balance, use-as-collateral, etc.)
 *   [N]              e-mode
 *   [N+1..N+1+M)    z-token get-balance per asset (deposit balances)
 */
export function getZestV1UserDataConverter(
  account: string,
  metaMap?: LenderCrossPoolMeta,
  prices?: Record<string, number>,
): [(data: StacksCallResult[]) => UserData | undefined, number] {
  const assets = getZestAssets()
  const assetsWithZToken = assets.filter((a) => ZEST_Z_TOKENS[a])
  const expectedCount = assets.length + 1 + assetsWithZToken.length

  const converter = (data: StacksCallResult[]): UserData | undefined => {
    if (data.length !== expectedCount) {
      console.warn(`V1 user: expected ${expectedCount} results, got ${data.length}`)
      return undefined
    }

    // E-mode is at index N
    let userEMode = 0
    const emodeResult = data[assets.length]
    if (emodeResult.okay) {
      try {
        const emodeDecoded = decodeClarityValue(emodeResult.result)
        userEMode = Number(extractUint(emodeDecoded) ?? 0)
      } catch { /* default to 0 */ }
    }

    // Build z-token balance map: asset principal → deposit balance (raw string)
    const zTokenBalances: Record<string, string> = {}
    const zTokenStart = assets.length + 1
    let zIdx = 0
    for (const asset of assets) {
      if (!ZEST_Z_TOKENS[asset]) continue
      const result = data[zTokenStart + zIdx]
      zIdx++
      if (!result?.okay) continue
      try {
        const decoded = decodeClarityValue(result.result)
        // get-balance returns (ok uint)
        const val = decoded?.success === true ? decoded.value : decoded
        const raw = extractUint(val)
        if (raw !== undefined) zTokenBalances[asset] = String(raw)
      } catch { /* skip */ }
    }

    const lendingPositions: Record<string, any> = {}
    let totalDebt24h = 0
    let totalDeposits24h = 0

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i]
      const result = data[i]
      const symbol = ZEST_ASSET_SYMBOLS[asset] ?? ''
      const marketUid = `${STACKS_CHAIN_ID}:${LENDER_ID}:${asset}`
      const metaEntity = metaMap?.[marketUid]
      const decimals = metaEntity?.asset?.decimals ?? 8

      // Z-token balance = deposit amount
      const depositRaw = zTokenBalances[asset] ?? '0'

      // Reserve data = borrow info + collateral flag
      // get-user-reserve-data-read returns (optional {tuple}) from a map
      let borrowRaw = '0'
      let collateralEnabled = false
      if (result?.okay) {
        try {
          const decoded = decodeClarityValue(result.result)
          // Unwrap optional — decoded may be { type: "(optional ...)", value: { ... } | null }
          const innerVal = decoded?.value
          if (innerVal !== null && innerVal !== undefined) {
            const fields = innerVal?.value ?? innerVal
            if (fields && typeof fields === 'object') {
              borrowRaw = String(fields['principal-borrow-balance']?.value ?? 0)
              collateralEnabled = fields['use-as-collateral']?.value === true
            }
          }
        } catch { /* skip */ }
      }

      if (depositRaw === '0' && borrowRaw === '0') continue

      const deposits = parseRawAmount(depositRaw, decimals)
      const debt = parseRawAmount(borrowRaw, decimals)

      const price = prices?.[marketUid] ?? prices?.[symbol.toLowerCase()] ?? prices?.[asset] ?? getDisplayPrice(metaEntity ?? {})
      const oPrice = getOraclePrice(metaEntity ?? {})
      const priceHist = metaEntity?.price?.priceUsd24h ?? price

      lendingPositions[marketUid] = {
        marketUid,
        underlying: metaEntity?.asset?.address,
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
  }

  return [converter, expectedCount]
}
