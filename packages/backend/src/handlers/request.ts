import {
  type StacksLender,
  type AllLendingData,
  type VaultSnapshot,
} from '@delta-stacks/data-provision'
import { deriveAddress } from '../utils'
import { handleAllocation } from './allocation'
import type { Env } from '../env'
import {
  LENDERS,
  PRICES_KEY,
  VAULT_HISTORY_KEY,
  VAULT_STX_HISTORY_KEY,
  VAULT_SBTC_HISTORY_KEY,
} from '../constants'

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=60',
} as const

const VAULT_HISTORY_MAP: Record<string, string> = {
  'vault/history':      VAULT_HISTORY_KEY,
  'vault-stx/history':  VAULT_STX_HISTORY_KEY,
  'vault-sbtc/history': VAULT_SBTC_HISTORY_KEY,
}

/**
 * Full HTTP router. All methods except OPTIONS are handled here.
 *
 * GET  /                   — all cached lending data
 * GET  /lending             — same as above
 * GET  /prices              — cached USD price map
 * GET  /:lender             — data for a specific lender
 * GET  /vault/history       — USDCx vault share-price history
 * GET  /vault-stx/history   — STX vault share-price history
 * GET  /vault-sbtc/history  — sBTC vault share-price history
 * GET  /allocator-address   — Stacks address derived from ALLOCATOR_PRIVATE_KEY
 * POST /allocate            — trigger allocation immediately (requires Authorization header)
 */
export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/+|\/+$/g, '')

  // POST /allocate — manually trigger the allocation strategy
  if (request.method === 'POST') {
    if (path !== 'allocate') {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: JSON_HEADERS })
    }

    const secret = env.ALLOCATOR_SECRET
    if (secret) {
      const auth = request.headers.get('Authorization') ?? ''
      if (auth !== `Bearer ${secret}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS })
      }
    }

    if (!env.ALLOCATOR_PRIVATE_KEY) {
      return new Response(
        JSON.stringify({ error: 'ALLOCATOR_PRIVATE_KEY not configured' }),
        { status: 503, headers: JSON_HEADERS },
      )
    }

    const body = await request.json().catch(() => ({})) as { force?: boolean }
    const results = await handleAllocation(env, body.force === true)
    return new Response(JSON.stringify({ results }), { headers: JSON_HEADERS })
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: JSON_HEADERS,
    })
  }

  // Vault history endpoints
  if (VAULT_HISTORY_MAP[path]) {
    const raw = await env.LENDING_KV.get(VAULT_HISTORY_MAP[path])
    if (!raw) {
      return new Response(JSON.stringify({ error: 'No vault history yet' }), {
        status: 404,
        headers: JSON_HEADERS,
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
      return new Response(JSON.stringify(filtered), { headers: JSON_HEADERS })
    }

    return new Response(raw, { headers: JSON_HEADERS })
  }

  // Prices endpoint
  if (path === 'prices') {
    const raw = await env.LENDING_KV.get(PRICES_KEY)
    if (!raw) {
      return new Response(JSON.stringify({ error: 'No cached prices' }), {
        status: 404,
        headers: JSON_HEADERS,
      })
    }
    return new Response(raw, { headers: JSON_HEADERS })
  }

  // Single lender
  if (LENDERS.includes(path as StacksLender)) {
    const raw = await env.LENDING_KV.get(`lending:${path}`)
    if (!raw) {
      return new Response(JSON.stringify({ error: `No cached data for ${path}` }), {
        status: 404,
        headers: JSON_HEADERS,
      })
    }
    return new Response(raw, { headers: JSON_HEADERS })
  }

  // All lenders
  if (path === '' || path === 'lending') {
    const [v1, v2, granite] = await Promise.all([
      env.LENDING_KV.get('lending:zest-v1'),
      env.LENDING_KV.get('lending:zest-v2'),
      env.LENDING_KV.get('lending:granite'),
    ])

    const result: AllLendingData = {
      v1:      v1      ? JSON.parse(v1)      : undefined,
      v2:      v2      ? JSON.parse(v2)      : undefined,
      granite: granite ? JSON.parse(granite) : undefined,
    }

    return new Response(JSON.stringify(result), { headers: JSON_HEADERS })
  }

  // Allocator address (derived from the private key — set this as the vault allocator in the UI)
  if (path === 'allocator-address') {
    if (!env.ALLOCATOR_PRIVATE_KEY) {
      return new Response(JSON.stringify({ error: 'ALLOCATOR_PRIVATE_KEY not configured' }), {
        status: 503,
        headers: JSON_HEADERS,
      })
    }
    return new Response(
      JSON.stringify({ address: deriveAddress(env.ALLOCATOR_PRIVATE_KEY) }),
      { headers: JSON_HEADERS },
    )
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: JSON_HEADERS,
  })
}
