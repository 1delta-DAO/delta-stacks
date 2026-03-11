import { StacksCallResult } from '../../../stacks-call'
import { decodeClarityValue, extractTuple } from '../../../stacks-call'
import {
  getZestAssets,
  ZEST_ASSET_SYMBOLS,
  ZEST_NON_BORROWABLE,
  ZEST_Z_TOKENS,
} from './constants'
import type { ZestReserveData, ZestPublicResponse, ZestEModeConfig } from './publicCallParse'
import { lookupToken } from '../../../token-list'

const STACKS_CHAIN_ID = 'stacks-mainnet'
const RATE_PRECISION = 1e8

/**
 * Keys in the aggregator response tuple, matching asset order.
 * Must match the keys in zest-reader.clar's get-v1-reserve-data.
 */
const ASSET_KEYS: string[] = [
  'wstx',
  'ststx',
  'sbtc',
  'aeusdc',
  'diko',
  'usdh',
  'susdt',
  'ststxbtc',
  'alex',
]

/**
 * Parse the single aggregator call result from zest-reader.clar's
 * `get-v1-reserve-data` into the same ZestPublicResponse format.
 */
export function parseV1AggregatorResult(
  result: StacksCallResult,
  prices: Record<string, number> = {},
): ZestPublicResponse | undefined {
  if (!result.okay) {
    console.warn(`V1 aggregator call failed: ${result.result}`)
    return undefined
  }

  try {
    const decoded = decodeClarityValue(result.result)
    const outerTuple = extractOkTuple(decoded)
    if (!outerTuple) return undefined

    // Parse e-mode configs
    const emodeConfigs: Record<number, any> = {}
    for (const type of [0, 1]) {
      try {
        const emodeRaw = outerTuple[`emode-${type}`]
        const emoVal = emodeRaw?.value ?? emodeRaw
        if (emoVal && typeof emoVal === 'object') {
          const t = emoVal.value ?? emoVal
          emodeConfigs[type] = {
            label: t?.label?.value ?? `E-Mode ${type}`,
            ltv: Number(t?.ltv?.value ?? 0),
            liquidationThreshold: Number(
              t?.['liquidation-threshold']?.value ?? 0,
            ),
          }
        }
      } catch {
        // e-mode type may not exist
      }
    }

    const assets = getZestAssets()
    const reserveData: Record<string, ZestReserveData> = {}

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i]
      const key = ASSET_KEYS[i]
      const symbol = ZEST_ASSET_SYMBOLS[asset] ?? asset.split('.').pop() ?? ''
      const marketUid = `${STACKS_CHAIN_ID}:zest-v1:${asset}`

      const assetTuple = outerTuple[key]
      if (!assetTuple) continue

      const v = typeof assetTuple === 'object' && assetTuple.value
        ? assetTuple.value
        : assetTuple

      // Extract sub-fields: reserve-state, supply-apy, borrow-apy, e-mode-type
      const reserveStateRaw = v['reserve-state']
      const supplyApyRaw = v['supply-apy']
      const borrowApyRaw = v['borrow-apy']
      const eModeTypeRaw = v['e-mode-type']

      // reserve-state is a (response {tuple} uint) — extract the ok value
      const rs = extractResponseValue(reserveStateRaw)
      if (!rs) continue

      const t = typeof rs === 'object' && rs.value ? rs.value : rs

      const decimals = extractNum(t['decimals']) || 8
      const divisor = 10 ** decimals

      const totalBorrowsVariable = extractNum(t['total-borrows-variable']) / divisor
      const totalBorrowsStable = extractNum(t['total-borrows-stable']) / divisor
      const totalDebt = totalBorrowsVariable
      const totalDebtStable = totalBorrowsStable
      // Deposits = borrows only as fallback; aggregator doesn't have z-token supply
      const totalDeposits = totalDebt + totalDebtStable

      // Use annualized rates from reserve-state, not per-block supply-apy/borrow-apy
      const supplyRate = extractNum(t['current-liquidity-rate']) / RATE_PRECISION
      const borrowRate = extractNum(t['current-variable-borrow-rate']) / RATE_PRECISION

      // e-mode-type is (response (buff 1) uint)
      const eModeType = extractResponseBuff1(eModeTypeRaw)

      const price = prices[marketUid] ?? prices[symbol.toLowerCase()] ?? prices[asset] ?? 0

      // Build e-mode config map
      const config: Record<number, ZestEModeConfig> = {}
      config[0] = {
        category: 0,
        label: 'Disabled',
        borrowCollateralFactor: extractNum(t['base-ltv-as-collateral']) / RATE_PRECISION,
        collateralFactor: extractNum(t['liquidation-threshold']) / RATE_PRECISION,
        borrowFactor: 1,
        collateralDisabled: extractBoolField(t['usage-as-collateral-enabled']) === false,
        debtDisabled: extractBoolField(t['borrowing-enabled']) === false,
      }

      if (eModeType > 0 && emodeConfigs[eModeType]) {
        const eCfg = emodeConfigs[eModeType]
        config[eModeType] = {
          category: eModeType,
          label: eCfg.label,
          borrowCollateralFactor: eCfg.ltv / RATE_PRECISION,
          collateralFactor: eCfg.liquidationThreshold / RATE_PRECISION,
          borrowFactor: 1,
          collateralDisabled: extractBoolField(t['usage-as-collateral-enabled']) === false,
          debtDisabled: ZEST_NON_BORROWABLE.has(asset),
        }
      }

      reserveData[marketUid] = {
        marketUid,
        name: `Zest ${symbol}`,
        poolId: asset,
        underlying: asset,
        symbol,
        totalDeposits,
        totalDebtStable,
        totalDebt,
        totalLiquidity: 0,
        totalDepositsUSD: totalDeposits * price,
        totalDebtStableUSD: totalDebtStable * price,
        totalDebtUSD: totalDebt * price,
        totalLiquidityUSD: 0,
        depositRate: supplyRate,
        variableBorrowRate: borrowRate,
        stableBorrowRate: 0,
        decimals,
        config,
        collateralActive: extractBoolField(t['usage-as-collateral-enabled']),
        borrowingEnabled:
          extractBoolField(t['borrowing-enabled']) && !ZEST_NON_BORROWABLE.has(asset),
        isActive: extractBoolField(t['is-active']),
        isFrozen: extractBoolField(t['is-frozen']),
        supplyCap: extractNum(t['supply-cap']),
        borrowCap: extractNum(t['borrow-cap']),
        debtCeiling: extractNum(t['debt-ceiling']),
        liquidationThreshold: extractNum(t['liquidation-threshold']) / RATE_PRECISION,
        liquidationBonus: extractNum(t['liquidation-bonus']) / RATE_PRECISION,
        baseLtv: extractNum(t['base-ltv-as-collateral']) / RATE_PRECISION,
        asset: lookupToken(asset),
        zToken: ZEST_Z_TOKENS[asset],
        oracle: extractPrincipalField(t['oracle']) || undefined,
        params: ZEST_Z_TOKENS[asset] ? { metadata: { zToken: ZEST_Z_TOKENS[asset] } } : undefined,
      }
    }

    return {
      data: reserveData,
      chainId: STACKS_CHAIN_ID,
    }
  } catch (e) {
    console.warn('Failed to parse V1 aggregator result:', e)
    return undefined
  }
}

// --- Internal helpers ---

function extractOkTuple(decoded: any): Record<string, any> | null {
  if (decoded?.success === true && decoded?.value?.value) {
    return decoded.value.value
  }
  if (decoded?.value && typeof decoded.value === 'object') {
    return decoded.value
  }
  return null
}

/** Extract the ok value from a (response T E) Clarity value */
function extractResponseValue(field: any): any {
  if (!field) return null
  // cvToJSON for (ok X) => { success: true, value: { ... } }
  if (field?.success === true) return field.value
  // Might be nested { value: { success: true, value: ... } }
  if (field?.value?.success === true) return field.value.value
  // Direct tuple
  if (field?.value && typeof field.value === 'object') return field.value
  return field
}

/** Extract a number from a (response uint uint) field */
function extractResponseNum(field: any): number {
  if (!field) return 0
  const val = field?.success === true ? field.value : field?.value?.success === true ? field.value.value : field
  return extractNum(val)
}

/** Extract a buff(1) byte from a (response (buff 1) uint) field */
function extractResponseBuff1(field: any): number {
  if (!field) return 0
  const val = field?.success === true ? field.value : field?.value?.success === true ? field.value.value : field
  if (!val) return 0
  const hex = String(val?.value ?? val)
  const cleaned = hex.replace('0x', '')
  return parseInt(cleaned, 16) || 0
}

function extractNum(field: any): number {
  if (field === undefined || field === null) return 0
  if (typeof field === 'number') return field
  if (typeof field === 'bigint') return Number(field)
  if (field?.value !== undefined) return Number(field.value)
  return Number(field) || 0
}

function extractBoolField(field: any): boolean {
  if (field === undefined || field === null) return false
  if (typeof field === 'boolean') return field
  if (field?.value !== undefined) return field.value === true
  return false
}

function extractPrincipalField(field: any): string {
  if (!field) return ''
  if (typeof field === 'string') return field
  return String(field?.value ?? '')
}
