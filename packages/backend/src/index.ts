import {
  getStacksLenderPublicData,
  type StacksLender,
  type AllLendingData,
} from '@delta-stacks/data-provision'

interface Env {
  LENDING_KV: KVNamespace
}

const LENDERS: StacksLender[] = ['zest-v1', 'zest-v2', 'granite']
const ROTATION_KEY = 'cron:next-lender-index'

/**
 * Cron trigger: fetches one lender per invocation, rotating through
 * zest-v1 -> zest-v2 -> granite to stay under Hiro rate limits.
 * Each lender's data is stored under its own KV key.
 * With a 2-minute cron, all 3 lenders refresh every 6 minutes.
 */
async function handleScheduled(env: Env): Promise<void> {
  const idxStr = await env.LENDING_KV.get(ROTATION_KEY)
  const idx = idxStr ? parseInt(idxStr, 10) % LENDERS.length : 0
  const lender = LENDERS[idx]

  console.log(`Cron: fetching ${lender} (index ${idx})`)

  try {
    const data = await getStacksLenderPublicData(lender, {}, { concurrency: 2 })

    if (data) {
      await env.LENDING_KV.put(`lending:${lender}`, JSON.stringify(data), {
        expirationTtl: 600, // expire after 10 min if not refreshed
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
 * GET / — returns all cached lending data from KV.
 * GET /:lender — returns data for a specific lender (zest-v1, zest-v2, granite).
 */
async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/+|\/+$/g, '')

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=60',
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
