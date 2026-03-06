import { StacksCallResult } from '../../stacks-call'
import { decodeClarityValue } from '../../stacks-call'
import {
  getZestAssets,
  ZEST_ASSET_SYMBOLS,
  ZEST_NON_BORROWABLE,
  ZEST_Z_TOKENS,
} from './constants'
import type { ZestReserveData, ZestPublicResponse, ZestEModeConfig } from './publicCallParse'

const STACKS_CHAIN_ID = 'stacks-mainnet'
const RATE_PRECISION = 1e8

/**
 * Parse results from the per-asset reader calls built by buildV1ReaderCalls.
 *
 * Layout: [0..9) per-asset tuples, [9] emode-0, [10] emode-1
 *
 * Each per-asset result is a direct tuple (NOT wrapped in (ok ...)):
 *   { reserve-state: (optional {tuple}),  -- not (response ...)
 *     supply-apy: uint,                   -- plain uint
 *     borrow-apy: uint,                   -- plain uint
 *     e-mode-type: (buff 1) }             -- plain buff
 */
export function parseV1ReaderResults(
  results: StacksCallResult[],
  prices: Record<string, number> = {},
): ZestPublicResponse | undefined {
  const assets = getZestAssets()
  const expectedCount = assets.length + 2 // 9 assets + 2 emode configs

  if (results.length !== expectedCount) {
    console.warn(`V1 reader: expected ${expectedCount} results, got ${results.length}`)
    return undefined
  }

  try {
    // Parse e-mode configs (last 2 results)
    // These are (optional tuple) from get-e-mode-type-config
    const emodeConfigs: Record<number, any> = {}
    for (const type of [0, 1]) {
      const emodeResult = results[assets.length + type]
      if (!emodeResult.okay) continue
      try {
        const decoded = decodeClarityValue(emodeResult.result)
        // Could be (ok (optional tuple)) or (optional tuple) depending on contract
        const t = unwrapValue(decoded)
        if (t && typeof t === 'object') {
          emodeConfigs[type] = {
            label: extractNum(t?.label) || `E-Mode ${type}`,
            ltv: extractNum(t?.ltv),
            liquidationThreshold: extractNum(t?.['liquidation-threshold']),
          }
        }
      } catch { /* e-mode type may not exist */ }
    }

    const reserveData: Record<string, ZestReserveData> = {}

    for (let i = 0; i < assets.length; i++) {
      const result = results[i]
      if (!result.okay) continue

      const asset = assets[i]
      const symbol = ZEST_ASSET_SYMBOLS[asset] ?? asset.split('.').pop() ?? ''
      const marketUid = `${STACKS_CHAIN_ID}:zest-v1:${asset}`

      const decoded = decodeClarityValue(result.result)
      // Per-asset reader returns a direct tuple: { reserve-state, supply-apy, borrow-apy, e-mode-type }
      const v = decoded?.value ?? decoded
      if (!v || typeof v !== 'object') continue

      // reserve-state is (optional tuple) — unwrap the optional
      const rsField = v['reserve-state']
      const rs = unwrapValue(rsField)
      if (!rs || typeof rs !== 'object') continue

      // The inner tuple fields are directly accessible
      const t = rs

      const decimals = extractNum(t['decimals']) || 8
      const divisor = 10 ** decimals

      const totalBorrowsVariable = extractNum(t['total-borrows-variable']) / divisor
      const totalBorrowsStable = extractNum(t['total-borrows-stable']) / divisor
      const totalDebt = totalBorrowsVariable
      const totalDebtStable = totalBorrowsStable
      const totalDeposits = totalDebt + totalDebtStable

      // supply-apy and borrow-apy include a 1.0 base (e.g. 100000698 = 1.00000698x)
      // Subtract 1.0 to get the actual rate as a decimal
      const supplyApy = extractNum(v['supply-apy']) / RATE_PRECISION - 1
      const borrowApy = extractNum(v['borrow-apy']) / RATE_PRECISION - 1

      // e-mode-type is plain (buff 1)
      const eModeType = extractBuff1(v['e-mode-type'])

      const price = prices[symbol.toLowerCase()] ?? prices[asset] ?? 0

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
        depositRate: supplyApy,
        variableBorrowRate: borrowApy,
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
        zToken: ZEST_Z_TOKENS[asset],
      }
    }

    return { data: reserveData, chainId: STACKS_CHAIN_ID }
  } catch (e) {
    console.warn('Failed to parse V1 reader results:', e)
    return undefined
  }
}

// --- helpers ---

/**
 * Unwrap nested Clarity value wrappers recursively.
 * Handles: (ok X), (some X), (optional (tuple ...)), plain tuple values.
 * cvToJSON gives: { type: "...", value: {...}, success?: boolean }
 *
 * Example unwrap chain for (optional (tuple ...)):
 *   { type: "(optional ...)", value: { type: "(tuple ...)", value: { decimals: ... } } }
 *   → unwrap → { type: "(tuple ...)", value: { decimals: ... } }
 *   → unwrap → { decimals: ... }
 */
function unwrapValue(field: any): any {
  if (!field) return null
  // (ok X) — has success: true
  if (field.success === true) return unwrapValue(field.value)
  // Has a 'type' field and a 'value' — this is a Clarity wrapper, unwrap it
  if (field.type && field.value !== undefined) return unwrapValue(field.value)
  // Already a plain object (the inner tuple fields)
  return field
}

/** Extract a plain uint value */
function extractNum(field: any): number {
  if (field === undefined || field === null) return 0
  if (typeof field === 'number') return field
  if (typeof field === 'bigint') return Number(field)
  if (field?.value !== undefined) return Number(field.value)
  return Number(field) || 0
}

/** Extract a plain (buff 1) byte value */
function extractBuff1(field: any): number {
  if (!field) return 0
  const hex = String(field?.value ?? field)
  const cleaned = hex.replace('0x', '')
  return parseInt(cleaned, 16) || 0
}

function extractBoolField(field: any): boolean {
  if (field === undefined || field === null) return false
  if (typeof field === 'boolean') return field
  if (field?.value !== undefined) return field.value === true
  return false
}
