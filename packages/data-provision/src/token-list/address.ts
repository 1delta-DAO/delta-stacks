/**
 * Stacks address utilities for consistent token list key access.
 *
 * Stacks contract principals have the form:
 *   `SP1ABC...XYZ.contract-name`
 *
 * The address part uses c32check encoding (uppercase + digits, with
 * a built-in checksum). The contract name is always lowercase.
 *
 * For token list keys we lowercase everything so lookups are
 * case-insensitive. Use {@link toTokenKey} as the single canonical
 * way to derive a lookup key.
 */

/** Valid c32 characters (case-insensitive) */
const C32_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

/** Valid Stacks address prefixes */
const VALID_PREFIXES = ['sp', 'sm', 'st', 'sn']

export interface ParsedStacksAddress {
  /** Full principal, original case */
  principal: string
  /** Address portion before the dot (e.g. "SP1Y5Y...") */
  address: string
  /** Contract name after the dot, or null for standard principals */
  contractName: string | null
  /** Lowercase key for token list lookups */
  key: string
}

/**
 * Normalize any Stacks principal to its lowercase token list key.
 *
 * Accepts mixed-case input and returns a consistently lowercased string.
 * Throws if the address format is invalid.
 *
 * @example
 * ```ts
 * const key = toTokenKey('SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token')
 * // => "sp4sze494vc2yc5jyg7ayfq44f5q4pyv7dvmdpbg.ststx-token"
 *
 * const token = tokenList.list[key]
 * ```
 */
export function toTokenKey(principal: string): string {
  validateStacksAddress(principal)
  return principal.toLowerCase()
}

/**
 * Parse a Stacks principal into its components and lowercase key.
 *
 * @example
 * ```ts
 * const parsed = parseStacksAddress('SP4SZE...DVMDPBG.ststx-token')
 * parsed.address      // "SP4SZE...DVMDPBG"
 * parsed.contractName // "ststx-token"
 * parsed.key          // "sp4sze...dvmdpbg.ststx-token"
 * ```
 */
export function parseStacksAddress(principal: string): ParsedStacksAddress {
  validateStacksAddress(principal)

  const dotIndex = principal.indexOf('.')
  if (dotIndex === -1) {
    return {
      principal,
      address: principal,
      contractName: null,
      key: principal.toLowerCase(),
    }
  }

  return {
    principal,
    address: principal.slice(0, dotIndex),
    contractName: principal.slice(dotIndex + 1),
    key: principal.toLowerCase(),
  }
}

/**
 * Check whether a string is a valid Stacks principal format.
 * Does not verify the c32check checksum bytes — only validates
 * structure and character set.
 */
export function isValidStacksAddress(principal: string): boolean {
  try {
    validateStacksAddress(principal)
    return true
  } catch {
    return false
  }
}

function validateStacksAddress(principal: string): void {
  if (!principal || typeof principal !== 'string') {
    throw new Error('Stacks address must be a non-empty string')
  }

  const dotIndex = principal.indexOf('.')
  const addressPart = dotIndex === -1 ? principal : principal.slice(0, dotIndex)
  const contractPart = dotIndex === -1 ? null : principal.slice(dotIndex + 1)

  // Address must be 39-41 chars (version byte + 20-byte hash in c32)
  const lower = addressPart.toLowerCase()
  if (lower.length < 39 || lower.length > 41) {
    throw new Error(`Invalid Stacks address length: ${addressPart.length}`)
  }

  // Must start with a valid prefix
  const prefix = lower.slice(0, 2)
  if (!VALID_PREFIXES.includes(prefix)) {
    throw new Error(`Invalid Stacks address prefix: "${prefix}" (expected ${VALID_PREFIXES.join(', ')})`)
  }

  // All chars must be valid c32
  for (let i = 0; i < lower.length; i++) {
    if (!C32_ALPHABET.includes(lower[i])) {
      throw new Error(`Invalid c32 character "${addressPart[i]}" at position ${i}`)
    }
  }

  // Contract name: lowercase alphanumeric + hyphens, 1-128 chars
  if (contractPart !== null) {
    if (contractPart.length === 0 || contractPart.length > 128) {
      throw new Error(`Invalid contract name length: ${contractPart.length}`)
    }
    if (!/^[a-z][a-z0-9-]*$/.test(contractPart)) {
      throw new Error(`Invalid contract name: "${contractPart}"`)
    }
  }
}
