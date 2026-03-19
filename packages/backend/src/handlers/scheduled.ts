import {
  getStacksLenderPublicData,
  fetchAllPrices,
  fetchVaultSnapshot,
  VAULT_USDCX_CONFIG,
  VAULT_STX_CONFIG,
  VAULT_SBTC_CONFIG,
  type USDPriceMap,
  type VaultSnapshot,
} from '@delta-stacks/data-provision'
import type { Env } from '../env'
import {
  LENDERS,
  ROTATION_KEY,
  PRICES_KEY,
  VAULT_HISTORY_KEY,
  VAULT_STX_HISTORY_KEY,
  VAULT_SBTC_HISTORY_KEY,
  MAX_VAULT_HISTORY,
  VAULT_LATEST_KEY,
} from '../constants'

/**
 * Cron trigger (every 2 min):
 *   1. Always refresh prices (Pyth API + on-chain — fast)
 *   2. Rotate through one lender per invocation, fetching WITH cached prices
 *
 * Prices refresh every 2 min. Each lender refreshes every 6 min.
 */
export async function handleScheduled(env: Env): Promise<void> {
  const idxStr = await env.LENDING_KV.get(ROTATION_KEY)
  const idx = idxStr ? parseInt(idxStr, 10) % LENDERS.length : 0
  const lender = LENDERS[idx]

  // Step 1: Refresh prices (always — they're lightweight)
  let prices: USDPriceMap = {}
  try {
    prices = await fetchAllPrices({ concurrency: 2 })
    await env.LENDING_KV.put(PRICES_KEY, JSON.stringify(prices))
    console.log(`Cron: prices refreshed (${Object.keys(prices).length} entries)`)
  } catch (e) {
    console.error('Cron: failed to fetch prices, loading from cache', e)
    const cached = await env.LENDING_KV.get(PRICES_KEY)
    if (cached) prices = JSON.parse(cached)
  }

  // Step 2: Fetch lender data with prices
  // Merge-on-write: if a fetch returns fewer markets than cached (some RPCs
  // failed), overlay the fresh markets onto the cached data so that markets
  // with transient RPC failures are preserved from the previous successful
  // fetch instead of being silently dropped.
  console.log(`Cron: fetching ${lender} (index ${idx})`)
  const kvKey = `lending:${lender}`
  try {
    const data = await getStacksLenderPublicData(lender, prices, { concurrency: 2 })

    const freshCount = data ? Object.keys(data.data).length : 0
    if (data && freshCount > 0) {
      // Load cached version to merge with
      const cachedRaw = await env.LENDING_KV.get(kvKey)
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw)
        const cachedCount = cached?.data ? Object.keys(cached.data).length : 0

        if (cachedCount > freshCount) {
          // Some markets were lost — merge fresh data onto cached base
          const merged = { ...data, data: { ...cached.data, ...data.data } }
          await env.LENDING_KV.put(kvKey, JSON.stringify(merged))
          console.log(
            `Cron: stored ${lender} data (${freshCount} fresh, ${Object.keys(merged.data).length} total — preserved ${cachedCount - freshCount} cached markets)`,
          )
        } else {
          await env.LENDING_KV.put(kvKey, JSON.stringify(data))
          console.log(`Cron: stored ${lender} data (${freshCount} markets)`)
        }
      } else {
        await env.LENDING_KV.put(kvKey, JSON.stringify(data))
        console.log(`Cron: stored ${lender} data (${freshCount} markets, first write)`)
      }
    } else {
      console.warn(`Cron: ${lender} returned no data or empty markets, keeping cached version`)
    }
  } catch (e) {
    console.error(`Cron: failed to fetch ${lender}, keeping cached version`, e)
  }

  // Advance rotation
  await env.LENDING_KV.put(ROTATION_KEY, String((idx + 1) % LENDERS.length))

  // Step 3: Vault snapshots (every invocation — lightweight single batch calls)
  const vaultJobs: { key: string; label: string; config: typeof VAULT_USDCX_CONFIG }[] = [
    { key: VAULT_HISTORY_KEY, label: 'USDCx', config: VAULT_USDCX_CONFIG },
    { key: VAULT_STX_HISTORY_KEY, label: 'STX', config: VAULT_STX_CONFIG },
    { key: VAULT_SBTC_HISTORY_KEY, label: 'sBTC', config: VAULT_SBTC_CONFIG },
  ]

  await Promise.all(vaultJobs.map(async ({ key, label, config }) => {
    try {
      const snapshot = await fetchVaultSnapshot({ concurrency: 2, vault: config })

      // Share price must be >= 1 due to virtual offset. Skip bad reads.
      if (snapshot.sharePrice < 1) {
        console.warn(`Cron: ${label} vault snapshot invalid (price=${snapshot.sharePrice}), skipping`)
        return
      }
      // totalAssets=0 but allocations non-zero = garbage RPC
      if (snapshot.totalAssets === '0' && (snapshot.allocMarket1 !== '0' || snapshot.allocMarket2 !== '0')) {
        console.warn(`Cron: ${label} vault snapshot inconsistent (assets=0, allocs non-zero), skipping`)
        return
      }

      const raw = await env.LENDING_KV.get(key)
      let history: VaultSnapshot[] = raw ? JSON.parse(raw) : []

      // Purge any existing bad entries: sharePrice <= 0, or sharePrice exactly
      // 1 while totalAssets is non-zero (indicates earlier bad RPC reads).
      const beforeLen = history.length
      history = history.filter(s => {
        if (s.sharePrice < 1) return false
        // totalAssets=0 but allocations non-zero means bad RPC read
        if (s.totalAssets === '0' && (s.allocMarket1 !== '0' || s.allocMarket2 !== '0')) return false
        return true
      })
      if (history.length < beforeLen) {
        console.log(`Cron: ${label} purged ${beforeLen - history.length} bad history entries`)
      }

      history.push(snapshot)

      if (history.length > MAX_VAULT_HISTORY) {
        history.splice(0, history.length - MAX_VAULT_HISTORY)
      }

      await env.LENDING_KV.put(key, JSON.stringify(history))
      // Also persist the latest snapshot separately so the allocator can read it cheaply
      const latestKey = VAULT_LATEST_KEY[label.toLowerCase()]
      if (latestKey) await env.LENDING_KV.put(latestKey, JSON.stringify(snapshot))
      console.log(`Cron: ${label} vault snapshot (price=${snapshot.sharePrice}, history=${history.length})`)
    } catch (e) {
      console.error(`Cron: failed to fetch ${label} vault snapshot`, e)
    }
  }))
}
