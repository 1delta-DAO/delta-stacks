import { StacksCall, StacksCallResult } from './types'

const DEFAULT_STACKS_API = 'https://stacks-node-api.mainnet.stacks.co'
const DEFAULT_SENDER = 'SP000000000000000000002Q6VF78' // standard read-only sender
const MAX_RETRIES = 3

/**
 * Execute a batch of read-only Stacks contract calls in parallel.
 *
 * Since Stacks has no on-chain multicall, we fire individual
 * HTTP requests to /v2/contracts/call-read and run them concurrently.
 *
 * Includes retry with exponential backoff for 429 (rate limit) responses.
 */
export async function executeStacksReadCalls(
  calls: StacksCall[],
  options?: {
    apiUrl?: string
    sender?: string
    concurrency?: number
  },
): Promise<StacksCallResult[]> {
  const apiUrl = options?.apiUrl ?? DEFAULT_STACKS_API
  const sender = options?.sender ?? DEFAULT_SENDER
  const concurrency = options?.concurrency ?? 5

  const results: StacksCallResult[] = new Array(calls.length)

  // Process in batches to respect rate limits
  for (let i = 0; i < calls.length; i += concurrency) {
    const batch = calls.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map((call) => executeSingleCall(call, apiUrl, sender)),
    )
    for (let j = 0; j < batchResults.length; j++) {
      results[i + j] = batchResults[j]
    }
  }

  return results
}

async function executeSingleCall(
  call: StacksCall,
  apiUrl: string,
  sender: string,
): Promise<StacksCallResult> {
  const url = `${apiUrl}/v2/contracts/call-read/${call.contractAddress}/${call.contractName}/${call.functionName}`

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender,
        arguments: call.args,
      }),
    })

    if (response.status === 429 && attempt < MAX_RETRIES) {
      // Exponential backoff: 1s, 2s, 4s
      const delay = 1000 * Math.pow(2, attempt)
      await new Promise((r) => setTimeout(r, delay))
      continue
    }

    if (!response.ok) {
      return { okay: false, result: `HTTP ${response.status}` }
    }

    return response.json() as Promise<StacksCallResult>
  }

  return { okay: false, result: 'HTTP 429' }
}
