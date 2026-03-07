import {
  getStacksLenderPublicData,
  fetchAllPrices,
  type StacksLender,
  type AllLendingData,
  type USDPriceMap,
} from '@delta-stacks/data-provision'

interface Env {
  LENDING_KV: KVNamespace
}

const LENDERS: StacksLender[] = ['zest-v1', 'zest-v2', 'granite']
const ROTATION_KEY = 'cron:next-lender-index'
const PRICES_KEY = 'prices'

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
    await env.LENDING_KV.put(PRICES_KEY, JSON.stringify(prices), {
      expirationTtl: 600,
    })
    console.log(`Cron: prices refreshed (${Object.keys(prices).length} entries)`)
  } catch (e) {
    console.error('Cron: failed to fetch prices, loading from cache', e)
    const cached = await env.LENDING_KV.get(PRICES_KEY)
    if (cached) prices = JSON.parse(cached)
  }

  // Step 2: Fetch lender data with prices
  console.log(`Cron: fetching ${lender} (index ${idx})`)
  try {
    const data = await getStacksLenderPublicData(lender, prices, { concurrency: 2 })

    if (data) {
      await env.LENDING_KV.put(`lending:${lender}`, JSON.stringify(data), {
        expirationTtl: 600,
      })
      console.log(`Cron: stored ${lender} data`)
    } else {
      console.warn(`Cron: ${lender} returned no data`)
    }
  } catch (e) {
    console.error(`Cron: failed to fetch ${lender}`, e)
  }

  // Advance rotation
  await env.LENDING_KV.put(ROTATION_KEY, String((idx + 1) % LENDERS.length))
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
