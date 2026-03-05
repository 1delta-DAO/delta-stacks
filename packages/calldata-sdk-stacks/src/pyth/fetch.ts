/**
 * Pyth Hermes API client for fetching price update VAA bytes.
 *
 * These bytes can be passed directly to Granite and Zest V2 contract calls
 * that require oracle price data.
 */

import { PYTH_HERMES_URL } from './feed-ids'

export interface PythFetchOptions {
  /** Hermes API base URL (defaults to https://hermes.pyth.network) */
  hermesUrl?: string
}

interface HermesLatestResponse {
  binary: { encoding: string; data: string[] }
  parsed: unknown[]
}

/**
 * Fetch the latest Pyth price update for one or more feed IDs.
 * Returns a single concatenated VAA buffer suitable for passing to contracts
 * that accept a single `(optional (buff 8192))` parameter (e.g. Granite).
 *
 * @param feedIds - one or more Pyth feed ID hex strings (with or without 0x prefix)
 * @param options - optional config (custom Hermes URL)
 * @returns raw VAA bytes as Uint8Array
 */
export async function fetchPythPriceUpdate(
  feedIds: string[],
  options?: PythFetchOptions,
): Promise<Uint8Array> {
  const baseUrl = options?.hermesUrl ?? PYTH_HERMES_URL
  const params = new URLSearchParams()
  for (const id of feedIds) {
    params.append('ids[]', id.startsWith('0x') ? id : `0x${id}`)
  }
  params.set('encoding', 'hex')

  const url = `${baseUrl}/v2/updates/price/latest?${params.toString()}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Pyth Hermes API error: ${res.status} ${res.statusText}`)
  }

  const body: HermesLatestResponse = await res.json()
  if (!body.binary?.data?.length) {
    throw new Error('Pyth Hermes returned no price update data')
  }

  // Hermes returns hex-encoded data; decode to bytes
  const hex = body.binary.data[0]
  return hexToBytes(hex)
}

/**
 * Fetch latest Pyth price updates as separate buffers (one per feed).
 * Suitable for contracts that accept `(optional (list N (buff ...)))` (e.g. Zest V2).
 *
 * @param feedIds - Pyth feed ID hex strings
 * @param options - optional config
 * @returns array of VAA byte buffers, one per entry in binary.data
 */
export async function fetchPythPriceUpdates(
  feedIds: string[],
  options?: PythFetchOptions,
): Promise<Uint8Array[]> {
  const baseUrl = options?.hermesUrl ?? PYTH_HERMES_URL
  const params = new URLSearchParams()
  for (const id of feedIds) {
    params.append('ids[]', id.startsWith('0x') ? id : `0x${id}`)
  }
  params.set('encoding', 'hex')

  const url = `${baseUrl}/v2/updates/price/latest?${params.toString()}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Pyth Hermes API error: ${res.status} ${res.statusText}`)
  }

  const body: HermesLatestResponse = await res.json()
  if (!body.binary?.data?.length) {
    throw new Error('Pyth Hermes returned no price update data')
  }

  return body.binary.data.map(hexToBytes)
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}
