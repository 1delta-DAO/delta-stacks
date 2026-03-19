import type { Env } from './env'
import { handleScheduled } from './handlers/scheduled'
import { handleRequest } from './handlers/request'

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

    return handleRequest(request, env)
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await handleScheduled(env)
  },
} satisfies ExportedHandler<Env>
