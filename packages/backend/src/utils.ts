import { executeStacksReadCalls } from '@delta-stacks/data-provision'
import {
  getAddressFromPrivateKey,
  hexToCV,
  cvToJSON,
} from '@stacks/transactions'
import { API_URL } from './allocator/const'

/** Parse "deployer.contract-name" into [deployer, contractName]. */
export function splitPrincipal(full: string): [string, string] {
  const dot = full.indexOf('.')
  return [full.slice(0, dot), full.slice(dot + 1)]
}

/** Derive the Stacks mainnet address from a hex-encoded private key. */
export function deriveAddress(privateKey: string): string {
  return getAddressFromPrivateKey(privateKey, 'mainnet')
}

/** Fetch the current confirmed nonce for an address, with retry on 429. */
async function fetchCurrentNonce(address: string, retries = 3): Promise<number> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(`${API_URL}/v2/accounts/${address}?proof=0`)
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, (i + 1) * 2000))  // 2 s, 4 s, 6 s
      continue
    }
    if (!res.ok) throw new Error(`Failed to fetch nonce: ${res.status}`)
    const json = await res.json() as { nonce: number }
    return json.nonce
  }
  throw new Error('Failed to fetch nonce: too many retries (429)')
}

/**
 * Read get-vault-allocator from the vault contract.
 * Returns the principal string ("SP...") or null on failure.
 */
export async function getVaultAllocator(deployer: string, contractName: string): Promise<string | null> {
  const results = await executeStacksReadCalls([
    { contractAddress: deployer, contractName, functionName: 'get-vault-allocator', args: [] },
  ], { apiUrl: API_URL })

  const r = results[0]
  if (!r?.okay) return null
  try {
    const cv = hexToCV(r.result)
    const json = cvToJSON(cv) as { type: string; value: string }
    return json.value ?? null
  } catch {
    return null
  }
}