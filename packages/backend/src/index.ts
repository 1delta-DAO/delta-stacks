import type { Env } from './env'
import { handleScheduled } from './handlers/scheduled'
import { handleAllocation } from './handlers/allocation'
import { handleRequest } from './handlers/request'

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
