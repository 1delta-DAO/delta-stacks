/**
 * Minimal Clarity value decoding helpers for read-only call results.
 */
import { hexToCV, cvToJSON, ClarityType } from '@stacks/transactions'

/**
 * Decode a hex-encoded Clarity value result into a JS-friendly structure.
 */
export function decodeClarityValue(hex: string): any {
  const cv = hexToCV(hex)
  return cvToJSON(cv)
}

/**
 * Extract a uint from a decoded Clarity value.
 */
export function extractUint(decoded: any): bigint {
  if (decoded?.type === ClarityType.UInt || decoded?.value !== undefined) {
    return BigInt(decoded.value)
  }
  throw new Error(`Expected uint, got: ${JSON.stringify(decoded)}`)
}

/**
 * Extract a bool from a decoded Clarity value.
 */
export function extractBool(decoded: any): boolean {
  if (decoded?.type === ClarityType.BoolTrue) return true
  if (decoded?.type === ClarityType.BoolFalse) return false
  if (typeof decoded?.value === 'boolean') return decoded.value
  throw new Error(`Expected bool, got: ${JSON.stringify(decoded)}`)
}

/**
 * Extract a tuple's fields from a decoded Clarity value.
 * Returns a Record<string, any> of the tuple fields.
 */
export function extractTuple(decoded: any): Record<string, any> {
  if (decoded?.value && typeof decoded.value === 'object') {
    return decoded.value
  }
  throw new Error(`Expected tuple, got: ${JSON.stringify(decoded)}`)
}

/**
 * Extract a principal string from a decoded Clarity value.
 */
export function extractPrincipal(decoded: any): string {
  if (decoded?.value) return String(decoded.value)
  throw new Error(`Expected principal, got: ${JSON.stringify(decoded)}`)
}
