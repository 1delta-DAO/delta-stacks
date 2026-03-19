import type { Env } from './env'
import { handleAllocation } from './handlers/allocation'
import { deriveAddress } from './utils'

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=60',
} as const

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      })
    }

    const url = new URL(request.url)
    const path = url.pathname.replace(/^\/+|\/+$/g, '')

    // POST /allocate — manually trigger the allocation strategy
    if (request.method === 'POST' && path === 'allocate') {
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

    // GET /allocator-address — derive Stacks address from the private key
    if (request.method === 'GET' && path === 'allocator-address') {
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
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await handleAllocation(env)
  },
} satisfies ExportedHandler<Env>
