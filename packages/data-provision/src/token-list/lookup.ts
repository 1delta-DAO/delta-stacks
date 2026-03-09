/**
 * Static token list lookup for attaching asset metadata to lending market entries.
 */

import tokenListJson from '../../data/stacks-token-list.json'
import type { StacksToken } from './types'

const tokenMap = tokenListJson.list as Record<string, StacksToken>

/**
 * Look up a token by its contract principal.
 * Handles case-insensitive lookup (the JSON keys are lowercase).
 */
export function lookupToken(address: string): StacksToken | undefined {
  return tokenMap[address.toLowerCase()]
}
