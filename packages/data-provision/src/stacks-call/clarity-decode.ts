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
 * Unwrap (ok ...) response wrapper if present.
 * Read-only Clarity functions typically return (ok <value>).
 */
function unwrap(decoded: any): any {
  if (decoded?.success === true && decoded?.value) return decoded.value
  return decoded
}

/**
 * Extract a uint from a decoded Clarity value.
 */
export function extractUint(decoded: any): bigint {
  const inner = unwrap(decoded)
  if (inner?.type === ClarityType.UInt) {
    return BigInt(inner.value)
  }
  // cvToJSON serialises type as a string in some versions
  if (inner?.type === 'uint' || inner?.type === 1) {
    return BigInt(inner.value)
  }
  if (typeof inner?.value === 'string' || typeof inner?.value === 'number' || typeof inner?.value === 'bigint') {
    return BigInt(inner.value)
  }
  throw new Error(`Expected uint, got: ${JSON.stringify(decoded)}`)
}

/**
 * Extract a bool from a decoded Clarity value.
 */
export function extractBool(decoded: any): boolean {
  const inner = unwrap(decoded)
  if (inner?.type === ClarityType.BoolTrue) return true
  if (inner?.type === ClarityType.BoolFalse) return false
  if (typeof inner?.value === 'boolean') return inner.value
  throw new Error(`Expected bool, got: ${JSON.stringify(decoded)}`)
}

/**
 * Extract a tuple's fields from a decoded Clarity value.
 * Returns a Record<string, any> of the tuple fields.
 */
export function extractTuple(decoded: any): Record<string, any> {
  const inner = unwrap(decoded)
  if (inner?.value && typeof inner.value === 'object') {
    return inner.value
  }
  throw new Error(`Expected tuple, got: ${JSON.stringify(decoded)}`)
}

/**
 * Extract a principal string from a decoded Clarity value.
 */
export function extractPrincipal(decoded: any): string {
  const inner = unwrap(decoded)
  if (inner?.value) return String(inner.value)
  throw new Error(`Expected principal, got: ${JSON.stringify(decoded)}`)
}
