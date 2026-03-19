import {
  type AllLendingData,
  type VaultSnapshot,
} from '@delta-stacks/data-provision'
import { runAllocation } from '../allocator'
import type { Env } from '../env'
import { VAULT_LATEST_KEY } from '../constants'
import type { VaultAllocationResult } from '../allocator/types'

/**
 * Load lending data + latest vault snapshots from KV, run the allocation
 * strategy, log results, and return them.
 * Used by both the 4-h cron and the POST /allocate endpoint.
 */
export async function handleAllocation(env: Env, force = false): Promise<VaultAllocationResult[]> {
  const privateKey = env.ALLOCATOR_PRIVATE_KEY
  if (!privateKey) {
    console.warn('Alloc: ALLOCATOR_PRIVATE_KEY not set, skipping')
    return []
  }

  const [v1Raw, v2Raw, graniteRaw] = await Promise.all([
    env.LENDING_KV.get('lending:zest-v1'),
    env.LENDING_KV.get('lending:zest-v2'),
    env.LENDING_KV.get('lending:granite'),
  ])
  const lending: AllLendingData = {
    v1:      v1Raw      ? JSON.parse(v1Raw)      : undefined,
    v2:      v2Raw      ? JSON.parse(v2Raw)      : undefined,
    granite: graniteRaw ? JSON.parse(graniteRaw) : undefined,
  }

  const snapshotEntries = await Promise.all(
    Object.entries(VAULT_LATEST_KEY).map(async ([id, key]) => {
      const raw = await env.LENDING_KV.get(key)
      return [id, raw ? JSON.parse(raw) as VaultSnapshot : undefined] as const
    }),
  )
  const snapshots = Object.fromEntries(
    snapshotEntries.filter(([, v]) => v !== undefined),
  ) as Record<string, VaultSnapshot>

  console.log('Alloc: running allocation strategy')
  try {
    const results = await runAllocation(privateKey, lending, snapshots, force)
    for (const r of results) {
      if (r.status === 'rebalanced') {
        console.log(`Alloc: ${r.vault} rebalanced → txid=${r.txid} (${r.market1Label} ${(r.market1Apr! * 100).toFixed(2)}% vs ${r.market2Label} ${(r.market2Apr! * 100).toFixed(2)}%)`)
      } else if (r.status === 'error') {
        console.error(`Alloc: ${r.vault} error — ${r.reason}`)
      } else {
        console.log(`Alloc: ${r.vault} skipped — ${r.reason}`)
      }
    }
    return results
  } catch (e) {
    console.error('Alloc: unexpected error', e)
    return []
  }
}
