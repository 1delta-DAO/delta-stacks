import {
  uintCV,
  principalCV,
  contractPrincipalCV,
  trueCV,
  falseCV,
  noneCV,
  someCV,
  bufferCV,
  listCV,
  tupleCV,
  type ClarityValue,
} from '@stacks/transactions'

/**
 * Convert a string principal to the appropriate ClarityValue.
 * Handles both standard ("SP...") and contract ("SP...name") principals.
 */
export function principal(addr: string): ClarityValue {
  if (addr.includes('.')) {
    const [address, name] = addr.split('.')
    return contractPrincipalCV(address, name)
  }
  return principalCV(addr)
}

export function uint(value: number | bigint | string): ClarityValue {
  return uintCV(BigInt(value))
}

export function bool(value: boolean): ClarityValue {
  return value ? trueCV() : falseCV()
}

export function optionalPrincipal(addr?: string): ClarityValue {
  if (!addr) return noneCV()
  return someCV(principal(addr))
}

export function buff1(byte: number): ClarityValue {
  return bufferCV(Uint8Array.from([byte]))
}

export { listCV, tupleCV, someCV, noneCV, bufferCV }
export type { ClarityValue }
