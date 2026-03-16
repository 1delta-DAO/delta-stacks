import {
  getStacksLenderPublicData,
  fetchAllPrices,
  fetchVaultSnapshot,
  VAULT_USDCX_CONFIG,
  VAULT_STX_CONFIG,
  type StacksLender,
  type AllLendingData,
  type USDPriceMap,
  type VaultSnapshot,
} from '@delta-stacks/data-provision'

interface Env {
  LENDING_KV: KVNamespace
}

const LENDERS: StacksLender[] = ['zest-v1', 'zest-v2', 'granite']
const ROTATION_KEY = 'cron:next-lender-index'
const PRICES_KEY = 'prices'
const VAULT_HISTORY_KEY = 'vault:share-price-history' // USDCx vault
const VAULT_STX_HISTORY_KEY = 'vault-stx:share-price-history'
const MAX_VAULT_HISTORY = 21_600 // ~30 days at 2-min intervals

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
  ]

  await Promise.all(vaultJobs.map(async ({ key, label, config }) => {
    try {
      const snapshot = await fetchVaultSnapshot({ concurrency: 2, vault: config })

      // Share price must be >= 1 due to virtual offset. Skip bad reads:
      // - price < 1: garbage RPC data
      // - price exactly 1 with deposits: virtual offset masked a bad read
      const hasDeposits = snapshot.totalAssets !== '0' || snapshot.totalSupply !== '0'
      if (snapshot.sharePrice < 1 || (hasDeposits && snapshot.sharePrice === 1)) {
        console.warn(`Cron: ${label} vault snapshot invalid (price=${snapshot.sharePrice}), skipping`)
        return
      }

      const raw = await env.LENDING_KV.get(key)
      let history: VaultSnapshot[] = raw ? JSON.parse(raw) : []

      // Purge any existing bad entries: sharePrice <= 0, or sharePrice exactly
      // 1 while totalAssets is non-zero (indicates earlier bad RPC reads).
      const beforeLen = history.length
      history = history.filter(s =>
        s.sharePrice >= 1 &&
        !(s.sharePrice === 1 && s.totalAssets !== '0')
      )
      if (history.length < beforeLen) {
        console.log(`Cron: ${label} purged ${beforeLen - history.length} bad history entries`)
      }

      history.push(snapshot)

      if (history.length > MAX_VAULT_HISTORY) {
        history.splice(0, history.length - MAX_VAULT_HISTORY)
      }

      await env.LENDING_KV.put(key, JSON.stringify(history))
      console.log(`Cron: ${label} vault snapshot (price=${snapshot.sharePrice}, history=${history.length})`)
    } catch (e) {
      console.error(`Cron: failed to fetch ${label} vault snapshot`, e)
    }
  }))
}

/**
 * GET /           — all cached lending data
 * GET /lending    — same as above
 * GET /prices     — cached USD price map
 * GET /:lender    — data for a specific lender
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

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers,
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }
    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return handleRequest(request, env)
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await handleScheduled(env)
  },
} satisfies ExportedHandler<Env>
