import { executeStacksReadCalls } from '../stacks-call'
import { decodeClarityValue, extractUint } from '../stacks-call/clarity-decode'
import type { StacksCall } from '../stacks-call/types'

const VAULT_V3_DEPLOYER = 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H'
const VAULT_V3_CONTRACT = 'vault-usdcx-v3'

export interface VaultSnapshot {
  timestamp: number // Unix seconds
  totalAssets: string // stringified bigint for JSON safety
  totalSupply: string
  sharePrice: number // human-readable (assets per 1 share)
  allocGranite: string
  allocZest: string
  idleBookkeeping: string
}

/**
 * Fetch the current vault state and compute a share price snapshot.
 * Uses the data-provision executeStacksReadCalls infrastructure
 * (with retry/backoff).
 */
export async function fetchVaultSnapshot(options?: {
  apiUrl?: string
  concurrency?: number
}): Promise<VaultSnapshot> {
  const calls: StacksCall[] = [
    {
      contractAddress: VAULT_V3_DEPLOYER,
      contractName: VAULT_V3_CONTRACT,
      functionName: 'get-total-assets',
      args: [],
    },
    {
      contractAddress: VAULT_V3_DEPLOYER,
      contractName: VAULT_V3_CONTRACT,
      functionName: 'get-total-supply',
      args: [],
    },
    {
      contractAddress: VAULT_V3_DEPLOYER,
      contractName: VAULT_V3_CONTRACT,
      functionName: 'get-alloc-granite',
      args: [],
    },
    {
      contractAddress: VAULT_V3_DEPLOYER,
      contractName: VAULT_V3_CONTRACT,
      functionName: 'get-alloc-zest-v2',
      args: [],
    },
    {
      contractAddress: VAULT_V3_DEPLOYER,
      contractName: VAULT_V3_CONTRACT,
      functionName: 'get-idle-bookkeeping',
      args: [],
    },
    {
      contractAddress: VAULT_V3_DEPLOYER,
      contractName: VAULT_V3_CONTRACT,
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

  const totalAssets = decode(0)
  const totalSupply = decode(1)
  const allocGranite = decode(2)
  const allocZest = decode(3)
  const idleBookkeeping = decode(4)
  const virtualOffset = decode(5)

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
    allocGranite: allocGranite.toString(),
    allocZest: allocZest.toString(),
    idleBookkeeping: idleBookkeeping.toString(),
  }
}
