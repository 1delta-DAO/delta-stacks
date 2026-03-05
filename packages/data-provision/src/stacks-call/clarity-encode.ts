/**
 * Minimal Clarity value encoding helpers for read-only call arguments.
 * These produce hex-encoded Clarity values as expected by the Stacks API.
 */

/**
 * Encode a standard principal as a Clarity argument.
 * Format: 0x05 + version byte + 20-byte hash160
 *
 * For simplicity, we use the string representation and let the API handle it.
 * The Stacks API accepts hex-encoded Clarity values.
 */
export function encodeClarityPrincipal(principal: string): string {
  // Use @stacks/transactions for proper encoding if available,
  // otherwise we pass the raw principal string through the API's
  // contract-call-read which accepts string principals in arguments
  return cvToHex(principalCV(principal))
}

export function encodeClarityUint(value: number | bigint): string {
  return cvToHex(uintCV(value))
}

export function encodeClarityBuff(hexOrBytes: Uint8Array): string {
  return cvToHex(buffCV(hexOrBytes))
}

// Re-export from @stacks/transactions for encoding
import {
  principalCV,
  uintCV,
  bufferCV as buffCV,
  cvToHex,
} from '@stacks/transactions'
