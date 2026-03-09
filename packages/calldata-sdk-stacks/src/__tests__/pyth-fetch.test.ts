import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchPythPriceUpdate, fetchPythPriceUpdates } from '../pyth/fetch'
import { PYTH_FEED_IDS, PYTH_HERMES_URL } from '../pyth/feed-ids'
import { GraniteLending } from '../granite'
import { ZestV2Lending } from '../zest-v2'
import { ZEST_V2_CONTRACTS } from '../zest-v2/constants'

// Mock global fetch
const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Hex-encode a byte array for mock responses */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const SAMPLE_BYTES = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe])
const SAMPLE_HEX = bytesToHex(SAMPLE_BYTES)

function mockHermesResponse(dataEntries: string[] = [SAMPLE_HEX]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      binary: { encoding: 'hex', data: dataEntries },
      parsed: [],
    }),
  })
}

describe('Pyth feed IDs', () => {
  it('exports known feed IDs', () => {
    expect(PYTH_FEED_IDS.BTC).toMatch(/^0x[a-f0-9]{64}$/)
    expect(PYTH_FEED_IDS.STX).toMatch(/^0x[a-f0-9]{64}$/)
    expect(PYTH_FEED_IDS.USDC).toMatch(/^0x[a-f0-9]{64}$/)
    expect(PYTH_FEED_IDS.ETH).toMatch(/^0x[a-f0-9]{64}$/)
  })

  it('exports default Hermes URL', () => {
    expect(PYTH_HERMES_URL).toBe('https://hermes.pyth.network')
  })
})

describe('fetchPythPriceUpdate (single buffer)', () => {
  it('fetches from Hermes and returns Uint8Array', async () => {
    mockHermesResponse()

    const result = await fetchPythPriceUpdate([PYTH_FEED_IDS.STX])

    expect(mockFetch).toHaveBeenCalledOnce()
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('/v2/updates/price/latest')
    expect(url).toContain(encodeURIComponent(PYTH_FEED_IDS.STX))
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result).toEqual(SAMPLE_BYTES)
  })

  it('passes multiple feed IDs as separate params', async () => {
    mockHermesResponse()

    await fetchPythPriceUpdate([PYTH_FEED_IDS.STX, PYTH_FEED_IDS.BTC])

    const url = mockFetch.mock.calls[0][0] as string
    // Both IDs should appear in the URL
    expect(url).toContain(encodeURIComponent(PYTH_FEED_IDS.STX))
    expect(url).toContain(encodeURIComponent(PYTH_FEED_IDS.BTC))
  })

  it('supports custom Hermes URL', async () => {
    mockHermesResponse()

    await fetchPythPriceUpdate([PYTH_FEED_IDS.STX], {
      hermesUrl: 'https://custom-hermes.example.com',
    })

    const url = mockFetch.mock.calls[0][0] as string
    expect(url.startsWith('https://custom-hermes.example.com')).toBe(true)
  })

  it('handles 0x-prefixed hex from Hermes', async () => {
    mockHermesResponse([`0x${SAMPLE_HEX}`])

    const result = await fetchPythPriceUpdate([PYTH_FEED_IDS.STX])
    expect(result).toEqual(SAMPLE_BYTES)
  })

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    })

    await expect(
      fetchPythPriceUpdate([PYTH_FEED_IDS.STX]),
    ).rejects.toThrow('Pyth Hermes API error: 429')
  })

  it('throws on empty data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ binary: { data: [] }, parsed: [] }),
    })

    await expect(
      fetchPythPriceUpdate([PYTH_FEED_IDS.STX]),
    ).rejects.toThrow('no price update data')
  })
})

describe('fetchPythPriceUpdates (multiple buffers)', () => {
  it('returns array of Uint8Array buffers', async () => {
    const hex2 = bytesToHex(new Uint8Array([0x01, 0x02]))
    mockHermesResponse([SAMPLE_HEX, hex2])

    const result = await fetchPythPriceUpdates([
      PYTH_FEED_IDS.STX,
      PYTH_FEED_IDS.BTC,
    ])

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual(SAMPLE_BYTES)
    expect(result[1]).toEqual(new Uint8Array([0x01, 0x02]))
  })
})

describe('GraniteLending.fetchPriceFeedData', () => {
  it('fetches aeUSDC market feeds (USDC + BTC)', async () => {
    mockHermesResponse()

    const result = await GraniteLending.fetchPriceFeedData('aeusdc')

    expect(result).toBeInstanceOf(Uint8Array)
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain(encodeURIComponent(PYTH_FEED_IDS.USDC))
    expect(url).toContain(encodeURIComponent(PYTH_FEED_IDS.BTC))
  })

  it('fetches USDCx market feeds (USDC + BTC)', async () => {
    mockHermesResponse()

    const result = await GraniteLending.fetchPriceFeedData('usdcx')

    expect(result).toBeInstanceOf(Uint8Array)
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain(encodeURIComponent(PYTH_FEED_IDS.USDC))
    expect(url).toContain(encodeURIComponent(PYTH_FEED_IDS.BTC))
  })

  it('exposes PRICE_FEEDS mapping', () => {
    expect(GraniteLending.PRICE_FEEDS.aeusdc).toHaveLength(2)
    expect(GraniteLending.PRICE_FEEDS.usdcx).toHaveLength(2)
    expect(GraniteLending.PRICE_FEEDS.aeusdc[0]).toBe(PYTH_FEED_IDS.USDC)
    expect(GraniteLending.PRICE_FEEDS.usdcx[0]).toBe(PYTH_FEED_IDS.USDC)
  })
})

describe('ZestV2Lending.fetchPriceFeeds', () => {
  it('fetches feeds and returns array of buffers', async () => {
    const hex2 = bytesToHex(new Uint8Array([0xaa, 0xbb]))
    mockHermesResponse([SAMPLE_HEX, hex2])

    const result = await ZestV2Lending.fetchPriceFeeds([
      ZestV2Lending.PRICE_FEEDS.STX,
      ZestV2Lending.PRICE_FEEDS.BTC,
    ])

    expect(result).toHaveLength(2)
    expect(result[0]).toBeInstanceOf(Uint8Array)
    expect(result[1]).toBeInstanceOf(Uint8Array)
  })

  it('exposes PRICE_FEEDS with known IDs', () => {
    expect(ZestV2Lending.PRICE_FEEDS.STX).toBe(PYTH_FEED_IDS.STX)
    expect(ZestV2Lending.PRICE_FEEDS.BTC).toBe(PYTH_FEED_IDS.BTC)
    expect(ZestV2Lending.PRICE_FEEDS.USDC).toBe(PYTH_FEED_IDS.USDC)
    expect(ZestV2Lending.PRICE_FEEDS.ETH).toBe(PYTH_FEED_IDS.ETH)
  })
})

describe('ZestV2Lending.resolveFeedIds', () => {
  it('resolves STX vault to STX feed', () => {
    const ids = ZestV2Lending.resolveFeedIds([ZEST_V2_CONTRACTS.vaultStx])
    expect(ids).toEqual([PYTH_FEED_IDS.STX])
  })

  it('resolves sBTC vault to BTC feed', () => {
    const ids = ZestV2Lending.resolveFeedIds([ZEST_V2_CONTRACTS.vaultSbtc])
    expect(ids).toEqual([PYTH_FEED_IDS.BTC])
  })

  it('resolves stSTX vault to STX feed (pegged)', () => {
    const ids = ZestV2Lending.resolveFeedIds([ZEST_V2_CONTRACTS.vaultStstx])
    expect(ids).toEqual([PYTH_FEED_IDS.STX])
  })

  it('resolves USDC vault to USDC feed', () => {
    const ids = ZestV2Lending.resolveFeedIds([ZEST_V2_CONTRACTS.vaultUsdc])
    expect(ids).toEqual([PYTH_FEED_IDS.USDC])
  })

  it('resolves USDH vault to USDC feed (USD stablecoin)', () => {
    const ids = ZestV2Lending.resolveFeedIds([ZEST_V2_CONTRACTS.vaultUsdh])
    expect(ids).toEqual([PYTH_FEED_IDS.USDC])
  })

  it('resolves stSTXBTC vault to both STX and BTC feeds', () => {
    const ids = ZestV2Lending.resolveFeedIds([ZEST_V2_CONTRACTS.vaultStstxbtc])
    expect(ids).toContain(PYTH_FEED_IDS.STX)
    expect(ids).toContain(PYTH_FEED_IDS.BTC)
    expect(ids).toHaveLength(2)
  })

  it('deduplicates feeds across multiple vaults', () => {
    // STX vault + stSTX vault both need STX feed
    const ids = ZestV2Lending.resolveFeedIds([
      ZEST_V2_CONTRACTS.vaultStx,
      ZEST_V2_CONTRACTS.vaultStstx,
    ])
    expect(ids).toEqual([PYTH_FEED_IDS.STX])
  })

  it('collects unique feeds across all vaults', () => {
    const ids = ZestV2Lending.resolveFeedIds([
      ZEST_V2_CONTRACTS.vaultStx,
      ZEST_V2_CONTRACTS.vaultSbtc,
      ZEST_V2_CONTRACTS.vaultUsdc,
    ])
    expect(ids).toHaveLength(3)
    expect(ids).toContain(PYTH_FEED_IDS.STX)
    expect(ids).toContain(PYTH_FEED_IDS.BTC)
    expect(ids).toContain(PYTH_FEED_IDS.USDC)
  })

  it('throws for unknown vault', () => {
    expect(() => ZestV2Lending.resolveFeedIds(['SP1234.unknown-vault'])).toThrow(
      'Unknown Zest V2 vault',
    )
  })
})

describe('ZestV2Lending.fetchPriceFeedsForVaults', () => {
  it('fetches feeds for STX + sBTC vaults', async () => {
    const hex2 = bytesToHex(new Uint8Array([0xaa, 0xbb]))
    mockHermesResponse([SAMPLE_HEX, hex2])

    const result = await ZestV2Lending.fetchPriceFeedsForVaults([
      ZEST_V2_CONTRACTS.vaultStx,
      ZEST_V2_CONTRACTS.vaultSbtc,
    ])

    expect(result).toHaveLength(2)
    expect(result[0]).toBeInstanceOf(Uint8Array)
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain(encodeURIComponent(PYTH_FEED_IDS.STX))
    expect(url).toContain(encodeURIComponent(PYTH_FEED_IDS.BTC))
  })

  it('deduplicates: STX + stSTX vaults only fetch STX once', async () => {
    mockHermesResponse([SAMPLE_HEX])

    await ZestV2Lending.fetchPriceFeedsForVaults([
      ZEST_V2_CONTRACTS.vaultStx,
      ZEST_V2_CONTRACTS.vaultStstx,
    ])

    const url = mockFetch.mock.calls[0][0] as string
    // STX feed should appear only once
    const matches = url.match(new RegExp(encodeURIComponent(PYTH_FEED_IDS.STX), 'g'))
    expect(matches).toHaveLength(1)
  })
})
