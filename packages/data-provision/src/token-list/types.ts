/**
 * Stacks token list schema, modeled after EVM token list conventions.
 *
 * Keys in the `list` record are **lowercased** contract principals
 * (e.g. "sp4sze494vc2yc5jyg7ayfq44f5q4pyv7dvmdpbg.ststx-token")
 * for easy case-insensitive lookups.
 */

export interface StacksToken {
  chainId: string
  decimals: number
  name: string
  /** Original-case contract principal (e.g. "SP4SZE...token") */
  address: string
  symbol: string
  logoURI: string
}

export interface StacksTokenList {
  chainId: string
  version: string
  /** Tokens keyed by lowercased contract principal */
  list: Record<string, StacksToken>
  /** Lowercased addresses of well-known / high-liquidity tokens */
  mainTokens: string[]
}
