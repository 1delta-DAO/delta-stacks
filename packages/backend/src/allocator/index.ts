/**
 * Auto-allocator for Delta Stacks vaults.
 *
 * For each vault where this worker is the registered allocator, compares the
 * supply APR of both lending markets and reallocates funds to the
 * higher-yielding market if the difference exceeds REBALANCE_THRESHOLD.
 *
 * Vaults supported:
 *   - vault-usdcx-v3   → Granite vs Zest V2 (USDCx)
 *   - vault-stx-v3-1   → Zest V1 vs Zest V2 (wSTX / STX)
 *   - vault-sbtc-v3    → Zest V1 vs Zest V2 (sBTC)
 */


import { fetchNonce } from '@stacks/transactions'
import {
  type AllLendingData,
  type VaultSnapshot,
} from '@delta-stacks/data-provision'
import { VaultAllocationResult } from './types'
import { deriveAddress, getVaultAllocator } from '../utils'
import { VAULT_ALLOC_CONFIGS } from './config'
import { computeRebalance } from './strategy'
import { buildAndBroadcast } from './tx'

/**
 * Run the allocation strategy across all known vaults.
 *
 * @param privateKey  Hex-encoded Stacks private key (64 chars, no 0x prefix)
 * @param lending     Latest lending data (from KV cache)
 * @param snapshots   Latest vault snapshots keyed by vault id
 */
export async function runAllocation(
  privateKey: string,
  lending: AllLendingData,
  snapshots: Record<string, VaultSnapshot>,
  force = false,
): Promise<VaultAllocationResult[]> {
  const allocatorAddress = deriveAddress(privateKey)
  let nonce = await fetchNonce({ address: allocatorAddress })

  const results: VaultAllocationResult[] = []

  for (const cfg of VAULT_ALLOC_CONFIGS) {
    const snapshot = snapshots[cfg.id]

    if (!snapshot) {
      results.push({ vault: cfg.id, status: 'skipped', reason: 'no-snapshot' })
      continue
    }

    // Confirm we're the registered allocator for this vault
    const onChainAllocator = await getVaultAllocator(cfg.vaultPrincipal)
    if (!onChainAllocator || onChainAllocator.toLowerCase() !== allocatorAddress.toLowerCase()) {
      results.push({ vault: cfg.id, status: 'skipped', reason: 'not-allocator' })
      continue
    }

    const rebalance = computeRebalance(cfg, snapshot, lending, force)
    if (!rebalance) {
      results.push({
        vault: cfg.id,
        status: 'skipped',
        reason: 'no-rebalance-needed',
        market1Label: cfg.market1Label,
        market2Label: cfg.market2Label,
        market1Apr: cfg.getMarket1Apr(lending),
        market2Apr: cfg.getMarket2Apr(lending),
      })
      continue
    }

    const { fromMarket1, fromMarket2, toMarket1, toMarket2, apr1, apr2 } = rebalance

    try {
      const txid = await buildAndBroadcast(
        cfg.encodeReallocate(fromMarket1, fromMarket2, toMarket1, toMarket2),
        privateKey,
        nonce,
      )
      nonce += 1n  // increment for next vault tx in this run

      results.push({
        vault: cfg.id,
        status: 'rebalanced',
        txid,
        market1Label: cfg.market1Label,
        market2Label: cfg.market2Label,
        market1Apr: apr1,
        market2Apr: apr2,
        fromMarket1: fromMarket1.toString(),
        fromMarket2: fromMarket2.toString(),
        toMarket1: toMarket1.toString(),
        toMarket2: toMarket2.toString(),
      })
    } catch (e) {
      results.push({
        vault: cfg.id,
        status: 'error',
        reason: e instanceof Error ? e.message : String(e),
        market1Label: cfg.market1Label,
        market2Label: cfg.market2Label,
        market1Apr: apr1,
        market2Apr: apr2,
      })
    }
  }

  return results
}
