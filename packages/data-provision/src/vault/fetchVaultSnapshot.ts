import { executeStacksReadCalls } from '../stacks-call'
import { decodeClarityValue, extractUint } from '../stacks-call/clarity-decode'
import type { StacksCall } from '../stacks-call/types'

const VAULT_V3_DEPLOYER = 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H'

export interface VaultSnapshot {
  timestamp: number // Unix seconds
  totalAssets: string // stringified bigint for JSON safety
  totalSupply: string
  sharePrice: number // human-readable (assets per 1 share)
  allocMarket1: string // Granite (USDCx) or Zest V1 (STX)
  allocMarket2: string // Zest V2
  idleBookkeeping: string
}

/** Configuration for a specific vault's on-chain read calls. */
export interface VaultConfig {
  deployer: string
  contractName: string
  /** Function name for market 1 allocation (e.g. 'get-alloc-granite' or 'get-alloc-zest-v1') */
  allocMarket1Fn: string
  /** Function name for market 2 allocation */
  allocMarket2Fn: string
}

export const VAULT_USDCX_CONFIG: VaultConfig = {
  deployer: VAULT_V3_DEPLOYER,
  contractName: 'vault-usdcx-v3',
  allocMarket1Fn: 'get-alloc-granite',
  allocMarket2Fn: 'get-alloc-zest-v2',
}

export const VAULT_STX_CONFIG: VaultConfig = {
  deployer: VAULT_V3_DEPLOYER,
  contractName: 'vault-stx-v3-1',
  allocMarket1Fn: 'get-alloc-zest-v1',
  allocMarket2Fn: 'get-alloc-zest-v2',
}

/**
 * Fetch the current vault state and compute a share price snapshot.
 * Uses the data-provision executeStacksReadCalls infrastructure
 * (with retry/backoff).
 *
 * @param vault - vault config (defaults to USDCx for backward compat)
 */
export async function fetchVaultSnapshot(options?: {
  apiUrl?: string
  concurrency?: number
  vault?: VaultConfig
}): Promise<VaultSnapshot> {
  const vault = options?.vault ?? VAULT_USDCX_CONFIG

  const calls: StacksCall[] = [
    {
      contractAddress: vault.deployer,
      contractName: vault.contractName,
      functionName: 'get-total-assets',
      args: [],
    },
    {
      contractAddress: vault.deployer,
      contractName: vault.contractName,
      functionName: 'get-total-supply',
      args: [],
    },
    {
      contractAddress: vault.deployer,
      contractName: vault.contractName,
      functionName: vault.allocMarket1Fn,
      args: [],
    },
    {
      contractAddress: vault.deployer,
      contractName: vault.contractName,
      functionName: vault.allocMarket2Fn,
      args: [],
    },
    {
      contractAddress: vault.deployer,
      contractName: vault.contractName,
      functionName: 'get-idle-bookkeeping',
      args: [],
    },
    {
      contractAddress: vault.deployer,
      contractName: vault.contractName,
      functionName: 'get-virtual-offset',
      args: [],
    },
  ]

  const results = await executeStacksReadCalls(calls, {
    apiUrl: options?.apiUrl ?? 'https://api.hiro.so',
    concurrency: options?.concurrency ?? 3,
  })

  const decode = (i: number): bigint => {
    const r = results[i]
    if (!r.okay) return 0n
    try {
      const decoded = decodeClarityValue(r.result)
      return extractUint(decoded)
    } catch {
      return 0n
    }
  }

  // Track which calls succeeded
  const ok = (i: number): boolean => results[i]?.okay === true

  const totalAssets = decode(0)
  const totalSupply = decode(1)
  const allocMarket1 = decode(2)
  const allocMarket2 = decode(3)
  const idleBookkeeping = decode(4)
  const virtualOffset = decode(5)

  // If the two critical calls (totalAssets, totalSupply) both failed or returned
  // 0 while allocations are non-zero, the RPC gave us garbage — abort.
  if (!ok(0) || !ok(1)) {
    throw new Error('Vault snapshot: RPC failed for totalAssets or totalSupply')
  }
  const allocSum = allocMarket1 + allocMarket2
  if (totalAssets === 0n && totalSupply === 0n && allocSum > 0n) {
    throw new Error('Vault snapshot: totalAssets/totalSupply are 0 but allocations are non-zero — stale RPC')
  }

  // V3 symmetric share price: (totalAssets + V) / (totalSupply + V)
  const vo = virtualOffset > 0n ? virtualOffset : 1_000_000n
  const sharePrice =
    totalSupply > 0n
      ? Number((totalAssets + vo) * 1_000_000n / (totalSupply + vo)) / 1e6
      : 1

  return {
    timestamp: Math.floor(Date.now() / 1000),
    totalAssets: totalAssets.toString(),
    totalSupply: totalSupply.toString(),
    sharePrice,
    allocMarket1: allocMarket1.toString(),
    allocMarket2: allocMarket2.toString(),
    idleBookkeeping: idleBookkeeping.toString(),
  }
}
