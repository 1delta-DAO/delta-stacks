import {
  getStacksLenderPublicData,
  fetchAllPrices,
  fetchVaultSnapshot,
  VAULT_USDCX_CONFIG,
  VAULT_STX_CONFIG,
  VAULT_SBTC_CONFIG,
  type StacksLender,
  type AllLendingData,
  type USDPriceMap,
  type VaultSnapshot,
} from '@delta-stacks/data-provision'
import { runAllocation } from './allocator'
import { deriveAddress } from './utils'
import { VaultAllocationResult } from './allocator/types'

interface Env {
  LENDING_KV: KVNamespace
  /**
   * Hex-encoded Stacks private key for the allocator bot (64 chars, no 0x prefix).
   * Set via wrangler secret or wrangler.toml [vars] for local dev.
   */
  ALLOCATOR_PRIVATE_KEY?: string
  /**
   * Shared secret required in the Authorization header for POST /allocate.
   * Prevents anyone on the internet from burning the allocator's gas.
   * Example header: Authorization: Bearer <secret>
   */
  ALLOCATOR_SECRET?: string
}

const LENDERS: StacksLender[] = ['zest-v1', 'zest-v2', 'granite']
const ROTATION_KEY = 'cron:next-lender-index'
const PRICES_KEY = 'prices'
const VAULT_HISTORY_KEY = 'vault:share-price-history' // USDCx vault
const VAULT_STX_HISTORY_KEY = 'vault-stx:share-price-history'
const VAULT_SBTC_HISTORY_KEY = 'vault-sbtc:share-price-history'
const MAX_VAULT_HISTORY = 21_600 // ~30 days at 2-min intervals

// KV keys for each vault's latest snapshot (written by the 2-min cron, read by allocator)
const VAULT_LATEST_KEY: Record<string, string> = {
  usdcx: 'vault:latest',
  stx:   'vault-stx:latest',
  sbtc:  'vault-sbtc:latest',
}

/**
 * Cron trigger (every 2 min):
 *   1. Always refresh prices (Pyth API + on-chain — fast)
 *   2. Rotate through one lender per invocation, fetching WITH cached prices
 *
 * Prices refresh every 2 min. Each lender refreshes every 6 min.
 */
async function handleScheduled(env: Env): Promise<void> {
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
  console.log(`Cron: fetching ${lender} (index ${idx})`)
  const kvKey = `lending:${lender}`
  try {
    const data = await getStacksLenderPublicData(lender, prices, { concurrency: 2 })

    const hasMarkets = data && Object.keys(data.data).length > 0
    if (hasMarkets) {
      await env.LENDING_KV.put(kvKey, JSON.stringify(data))
      console.log(`Cron: stored ${lender} data (${Object.keys(data.data).length} markets)`)
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
      const hasActivity = snapshot.totalAssets !== '0' ||
        snapshot.allocMarket1 !== '0' || snapshot.allocMarket2 !== '0' ||
        snapshot.idleBookkeeping !== '0'
      if (snapshot.sharePrice < 1 || (hasActivity && snapshot.sharePrice === 1)) {
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
        // sharePrice=1 is only valid for an empty vault (no allocs)
        if (s.sharePrice === 1) {
          const hasActivity = s.totalAssets !== '0' ||
            s.allocMarket1 !== '0' || s.allocMarket2 !== '0' ||
            s.idleBookkeeping !== '0'
          if (hasActivity) return false
        }
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

/**
 * Load lending data + latest vault snapshots from KV, run the allocation
 * strategy, log results, and return them.
 * Used by both the 12-h cron and the POST /allocate endpoint.
 */
async function handleAllocation(env: Env, force = false): Promise<VaultAllocationResult[]> {
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

/**
 * GET /                — all cached lending data
 * GET /lending         — same as above
 * GET /prices          — cached USD price map
 * GET /:lender         — data for a specific lender
 * GET /allocator-address — Stacks address derived from ALLOCATOR_PRIVATE_KEY
 * POST /allocate       — trigger allocation immediately (requires Authorization header)
 */
async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/+|\/+$/g, '')

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=60',
  }

  // Vault history endpoints: /vault/history (USDCx) and /vault-stx/history (STX)
  const vaultHistoryMap: Record<string, string> = {
    'vault/history': VAULT_HISTORY_KEY,
    'vault-stx/history': VAULT_STX_HISTORY_KEY,
    'vault-sbtc/history': VAULT_SBTC_HISTORY_KEY,
  }

  if (vaultHistoryMap[path]) {
    const raw = await env.LENDING_KV.get(vaultHistoryMap[path])
    if (!raw) {
      return new Response(JSON.stringify({ error: 'No vault history yet' }), {
        status: 404,
        headers,
      })
    }

    // Optional query params: ?from=<unix>&to=<unix> for filtering
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    if (from || to) {
      const history: VaultSnapshot[] = JSON.parse(raw)
      const fromTs = from ? parseInt(from, 10) : 0
      const toTs = to ? parseInt(to, 10) : Infinity
      const filtered = history.filter(s => s.timestamp >= fromTs && s.timestamp <= toTs)
      return new Response(JSON.stringify(filtered), { headers })
    }

    return new Response(raw, { headers })
  }

  // Prices endpoint
  if (path === 'prices') {
    const raw = await env.LENDING_KV.get(PRICES_KEY)
    if (!raw) {
      return new Response(JSON.stringify({ error: 'No cached prices' }), {
        status: 404,
        headers,
      })
    }
    return new Response(raw, { headers })
  }

  // Single lender
  if (LENDERS.includes(path as StacksLender)) {
    const raw = await env.LENDING_KV.get(`lending:${path}`)
    if (!raw) {
      return new Response(JSON.stringify({ error: `No cached data for ${path}` }), {
        status: 404,
        headers,
      })
    }
    return new Response(raw, { headers })
  }

  // All lenders
  if (path === '' || path === 'lending') {
    const [v1, v2, granite] = await Promise.all([
      env.LENDING_KV.get('lending:zest-v1'),
      env.LENDING_KV.get('lending:zest-v2'),
      env.LENDING_KV.get('lending:granite'),
    ])

    const result: AllLendingData = {
      v1: v1 ? JSON.parse(v1) : undefined,
      v2: v2 ? JSON.parse(v2) : undefined,
      granite: granite ? JSON.parse(granite) : undefined,
    }

    return new Response(JSON.stringify(result), { headers })
  }

  // Allocator address (derived from the private key — set this as the vault allocator in the UI)
  if (path === 'allocator-address') {
    if (!env.ALLOCATOR_PRIVATE_KEY) {
      return new Response(JSON.stringify({ error: 'ALLOCATOR_PRIVATE_KEY not configured' }), {
        status: 503,
        headers,
      })
    }
    return new Response(
      JSON.stringify({ address: deriveAddress(env.ALLOCATOR_PRIVATE_KEY) }),
      { headers },
    )
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers,
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const jsonHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      })
    }

    // POST /allocate — manually trigger the allocation strategy
    if (request.method === 'POST') {
      const path = new URL(request.url).pathname.replace(/^\/+|\/+$/g, '')
      if (path !== 'allocate') {
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: jsonHeaders })
      }

      // Guard with shared secret when configured
      const secret = env.ALLOCATOR_SECRET
      if (secret) {
        const auth = request.headers.get('Authorization') ?? ''
        if (auth !== `Bearer ${secret}`) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders })
        }
      }

      if (!env.ALLOCATOR_PRIVATE_KEY) {
        return new Response(
          JSON.stringify({ error: 'ALLOCATOR_PRIVATE_KEY not configured' }),
          { status: 503, headers: jsonHeaders },
        )
      }

      const body = await request.json().catch(() => ({})) as { force?: boolean }
      const results = await handleAllocation(env, body.force === true)
      return new Response(JSON.stringify({ results }), { headers: jsonHeaders })
    }

    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: jsonHeaders,
      })
    }

    return handleRequest(request, env)
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if (controller.cron === '*/2 * * * *') {
      // Price refresh + lender rotation + vault snapshots
      await handleScheduled(env)
    } else if (controller.cron === '0 */4 * * *') {
      // Auto-allocate: rebalance vaults to the best-APR market
      await handleAllocation(env)
    }
  },
} satisfies ExportedHandler<Env>
