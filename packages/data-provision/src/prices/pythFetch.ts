/**
 * Fetch parsed price data from the Pyth Hermes API.
 *
 * Unlike the VAA-fetching functions in calldata-sdk-stacks (which return raw bytes
 * for on-chain contract calls), this module returns actual USD price numbers
 * for use in the data-provision layer.
 */

import { PYTH_HERMES_URL } from './constants'

interface HermesParsedPrice {
  price: string
  conf: string
  expo: number
  publish_time: number
}

interface HermesParsedEntry {
  id: string
  price: HermesParsedPrice
  ema_price: HermesParsedPrice
}

interface HermesResponse {
  parsed: HermesParsedEntry[]
}

export interface PythPriceResult {
  /** Feed ID (without 0x prefix) */
  feedId: string
  /** USD price as a number */
  price: number
  /** Confidence interval */
  confidence: number
  /** Unix timestamp of the price */
  publishTime: number
}

/**
 * Fetch latest parsed prices from Pyth Hermes for a set of feed IDs.
 * Returns a map of feedId → price result.
 */
export async function fetchPythPrices(
  feedIds: string[],
  hermesUrl = PYTH_HERMES_URL,
): Promise<Map<string, PythPriceResult>> {
  if (!feedIds.length) return new Map()

  const params = new URLSearchParams()
  for (const id of feedIds) {
    params.append('ids[]', id.startsWith('0x') ? id : `0x${id}`)
  }
  params.set('encoding', 'hex')
  params.set('parsed', 'true')

  const url = `${hermesUrl}/v2/updates/price/latest?${params.toString()}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Pyth Hermes API error: ${res.status} ${res.statusText}`)
  }

  const body: HermesResponse = await res.json()
  const results = new Map<string, PythPriceResult>()

  for (const entry of body.parsed ?? []) {
    const price = Number(entry.price.price) * 10 ** entry.price.expo
    const confidence = Number(entry.price.conf) * 10 ** entry.price.expo
    const feedId = entry.id.startsWith('0x') ? entry.id : `0x${entry.id}`
    results.set(feedId, {
      feedId,
      price,
      confidence,
      publishTime: entry.price.publish_time,
    })
  }

  return results
}
