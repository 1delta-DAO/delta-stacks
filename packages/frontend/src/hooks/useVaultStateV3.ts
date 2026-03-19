import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { VAULT_V3_DEPLOYER } from '@delta-stacks/calldata-sdk-stacks'

const API = 'https://api.hiro.so'
const SENDER = VAULT_V3_DEPLOYER

function getBackendBase(): string {
  const dataUrl = import.meta.env.VITE_DATA_API_URL as string | undefined
  if (dataUrl) {
    try { return new URL(dataUrl).origin } catch { return dataUrl.replace(/\/[^/]*$/, '') }
  }
  return ''
}

// Vault reader contract (deployed on mainnet)
const READER_DEPLOYER = VAULT_V3_DEPLOYER
const READER_CONTRACT = 'vault-reader-v1'

// ---------------------------------------------------------------------------
// Clarity hex decode helpers
// ---------------------------------------------------------------------------

/** Decode a Clarity uint from its hex representation (0x01 + 16 bytes big-endian) */
function decodeUint(hex: string): bigint {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  let data: string
  if (clean.startsWith('0701')) {
    data = clean.slice(4)
  } else if (clean.startsWith('01')) {
    data = clean.slice(2)
  } else {
    return 0n
  }
  return BigInt('0x' + data)
}

/** Convert ASCII string to hex (browser-safe, no Buffer needed) */
function strToHex(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    out += s.charCodeAt(i).toString(16).padStart(2, '0')
  }
  return out
}

/** Decode a Clarity tuple uint field by name from hex. */
function decodeTupleUint(hex: string, fieldName: string): bigint {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const nameHex = strToHex(fieldName)
  const nameLen = (fieldName.length).toString(16).padStart(2, '0')
  const marker = nameLen + nameHex + '01'
  const idx = clean.indexOf(marker)
  if (idx === -1) return 0n
  const start = idx + marker.length
  const uintHex = clean.slice(start, start + 32)
  return BigInt('0x' + uintHex)
}

// ---------------------------------------------------------------------------
// API call helper
// ---------------------------------------------------------------------------

async function callRead(
  contractAddr: string,
  contractName: string,
  fn: string,
): Promise<string> {
  const resp = await fetch(
    `${API}/v2/contracts/call-read/${contractAddr}/${contractName}/${fn}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: SENDER, arguments: [] }),
    },
  )
  if (!resp.ok) return ''
  const data = await resp.json()
  return data.result ?? ''
}

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

export interface VaultStateV3 {
  // Vault bookkeeping (micro-USDCx)
  totalAssets: bigint
  allocGranite: bigint
  allocZest: bigint
  idleBookkeeping: bigint
  totalSupply: bigint
  sharePrice: number // assets per 1 share (human-readable)

  // Live positions
  liveIdle: bigint
  liveGranite: bigint
  liveZest: bigint
  liveTotal: bigint
  unrealizedYield: bigint

  // Market APRs (annualized %)
  graniteApr: number
  zestApr: number
  blendedApr: number

  // V3 additions
  feeBps: bigint
  feeRecipient: string
  idleBufferBps: bigint
  virtualOffset: bigint
  vaultOwner: string
  vaultAllocator: string
}

const EMPTY: VaultStateV3 = {
  totalAssets: 0n,
  allocGranite: 0n,
  allocZest: 0n,
  idleBookkeeping: 0n,
  totalSupply: 0n,
  sharePrice: 0,
  liveIdle: 0n,
  liveGranite: 0n,
  liveZest: 0n,
  liveTotal: 0n,
  unrealizedYield: 0n,
  graniteApr: 0,
  zestApr: 0,
  blendedApr: 0,
  feeBps: 0n,
  feeRecipient: '',
  idleBufferBps: 500n,
  virtualOffset: 1_000_000n,
  vaultOwner: '',
  vaultAllocator: '',
}

// ---------------------------------------------------------------------------
// Fetch function — single reader call (1 RPC request instead of 17)
// Falls back to individual calls if reader is not deployed yet
// ---------------------------------------------------------------------------

async function fetchVaultStateV3(): Promise<VaultStateV3> {
  // Go straight to sequential calls (reader exceeds RPC cost limits)
  return fetchVaultStateV3Fallback()
}

function parseReaderResponse(hex: string): VaultStateV3 {
  const totalAssets = decodeTupleUint(hex, 'total-assets')
  const totalSupply = decodeTupleUint(hex, 'total-supply')
  const allocGranite = decodeTupleUint(hex, 'alloc-granite')
  const allocZest = decodeTupleUint(hex, 'alloc-zest-v2')
  const idleBookkeeping = decodeTupleUint(hex, 'idle-bookkeeping')
  const liveIdle = decodeTupleUint(hex, 'idle-balance')
  const liveGranite = decodeTupleUint(hex, 'live-granite')
  const liveZest = decodeTupleUint(hex, 'live-zest-v2')
  const liveTotalDeployed = decodeTupleUint(hex, 'live-total')
  const liveTotal = liveTotalDeployed + liveIdle
  const feeBps = decodeTupleUint(hex, 'fee-bps')
  const idleBufferBps = decodeTupleUint(hex, 'idle-buffer-bps')
  const virtualOffset = decodeTupleUint(hex, 'virtual-offset')

  const vo = virtualOffset > 0n ? virtualOffset : 1_000_000n
  const sharePrice =
    totalSupply > 0n
      ? Number((totalAssets + vo) * 1_000_000n / (totalSupply + vo)) / 1e6
      : 1

  const unrealizedYield = liveTotal > totalAssets ? liveTotal - totalAssets : 0n

  // --- Granite APR (from reader's granite-lp-params and granite-open-interest) ---
  // The reader returns nested tuples; the field names are still accessible
  // const graniteTotalAssets = decodeTupleUint(hex, 'total-assets')
  // Ambiguous with vault total-assets — use the granite-specific subfields
  // The granite-lp-params tuple is nested inside the reader tuple, so we need
  // to find the granite-specific data. Since tuple field names are sorted
  // alphabetically in Clarity hex, we search for the granite-specific markers.
  // For now, parse the specific granite fields:
  const graniteTotalShares = decodeTupleUint(hex, 'total-shares')
  let graniteApr = 0
  if (graniteTotalShares > 0n) {
    // granite-lp-params contains total-assets and total-shares
    // But 'total-assets' is ambiguous with the vault's own total-assets.
    // We need to find the SECOND occurrence. Use a dedicated extractor.
    const graniteExchangeRate = extractGraniteExchangeRate(hex)
    if (graniteExchangeRate > 0) {
      const premium = graniteExchangeRate - 1
      if (premium > 0) graniteApr = premium * 2 * 100
    }
  }

  // --- Zest V2 APR ---
  const zestBorrowRate = Number(decodeTupleUint(hex, 'zest-v2-interest-rate')) / 10_000
  const zestUtilization = Number(decodeTupleUint(hex, 'zest-v2-utilization')) / 10_000
  const zestFeeReserve = Number(decodeTupleUint(hex, 'zest-v2-fee-reserve')) / 10_000
  const zestApr = zestBorrowRate * zestUtilization * (1 - zestFeeReserve) * 100

  // --- Blended APR ---
  let blendedApr = 0
  if (totalAssets > 0n) {
    const gWeight = Number(allocGranite) / Number(totalAssets)
    const zWeight = Number(allocZest) / Number(totalAssets)
    blendedApr = graniteApr * gWeight + zestApr * zWeight
  }

  return {
    totalAssets,
    allocGranite,
    allocZest,
    idleBookkeeping,
    totalSupply,
    sharePrice,
    liveIdle,
    liveGranite,
    liveZest,
    liveTotal,
    unrealizedYield,
    graniteApr,
    zestApr,
    blendedApr,
    feeBps,
    feeRecipient: '',
    idleBufferBps,
    virtualOffset: vo,
    vaultOwner: '',
    vaultAllocator: '',
  }
}

/**
 * Extract Granite exchange rate from the nested granite-lp-params tuple.
 * The reader response contains a nested tuple for granite-lp-params with
 * its own total-assets and total-shares fields. Since 'total-assets' appears
 * twice (vault-level and granite-level), we find the granite-lp-params marker
 * and extract from within that nested tuple.
 */
function extractGraniteExchangeRate(hex: string): number {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  // Find 'granite-lp-params' field in the outer tuple
  const fieldName = 'granite-lp-params'
  const nameHex = strToHex(fieldName)
  const nameLen = fieldName.length.toString(16).padStart(2, '0')
  const marker = nameLen + nameHex
  const idx = clean.indexOf(marker)
  if (idx === -1) return 0

  // The value after the field name is a tuple (0x0c prefix)
  // Extract from this sub-region to avoid ambiguity
  const subHex = clean.slice(idx)
  const totalAssets = decodeTupleUint(subHex, 'total-assets')
  const totalShares = decodeTupleUint(subHex, 'total-shares')
  if (totalShares === 0n) return 0
  return Number(totalAssets * 1_000_000n / totalShares) / 1_000_000
}

// ---------------------------------------------------------------------------
// Fallback: individual calls (for when reader is not deployed)
// ---------------------------------------------------------------------------

async function fetchVaultStateV3Fallback(): Promise<VaultStateV3> {
  const vaultContract = 'vault-usdcx-v3'
  const GRANITE_STATE = 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE'
  const GRANITE_CONTRACT = 'state-v1'
  const ZEST_DEPLOYER = 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7'
  const ZEST_CONTRACT = 'v0-vault-usdc'

  // Core vault reads only (6 RPCs) -- APR comes from backend
  const totalAssetsHex = await callRead(SENDER, vaultContract, 'get-total-assets')
  const totalSupplyHex = await callRead(SENDER, vaultContract, 'get-total-supply')
  const allocGraniteHex = await callRead(SENDER, vaultContract, 'get-alloc-granite')
  const allocZestHex = await callRead(SENDER, vaultContract, 'get-alloc-zest-v2')
  const idleBookHex = await callRead(SENDER, vaultContract, 'get-idle-bookkeeping')
  const feeBpsHex = await callRead(SENDER, vaultContract, 'get-fee-bps')
  // Unused -- APR from backend, live positions skipped
  const graniteLpParamsHex = ''
  const _graniteOpenInterestHex = ''
  const zestInterestRateHex = ''
  const zestUtilizationHex = ''
  const zestFeeReserveHex = ''

  const totalAssets = decodeUint(totalAssetsHex)
  const allocGranite = decodeUint(allocGraniteHex)
  const allocZest = decodeUint(allocZestHex)
  const idleBookkeeping = decodeUint(idleBookHex)
  const totalSupply = decodeUint(totalSupplyHex)
  const liveIdle = decodeUint(liveIdleHex)
  const liveGranite = decodeUint(liveGraniteHex)
  const liveZest = decodeUint(liveZestHex)
  const liveTotalDeployed = decodeUint(liveTotalHex)
  const liveTotal = liveTotalDeployed + liveIdle

  const virtualOffset = decodeUint(virtualOffsetHex)
  const vo = virtualOffset > 0n ? virtualOffset : 1_000_000n
  const sharePrice =
    totalSupply > 0n
      ? Number((totalAssets + vo) * 1_000_000n / (totalSupply + vo)) / 1e6
      : 1

  const unrealizedYield = liveTotal > totalAssets ? liveTotal - totalAssets : 0n

  const feeBps = decodeUint(feeBpsHex)
  const idleBufferBps = decodeUint(idleBufferBpsHex)

  // --- APR from backend ---
  let graniteApr = 0
  let zestApr = 0
  try {
    const backendBase = getBackendBase()
    if (backendBase) {
      const [gRes, zRes] = await Promise.all([
        fetch(`${backendBase}/granite`),
        fetch(`${backendBase}/zest-v2`),
      ])
      if (gRes.ok) {
        const gData = await gRes.json()
        const usdcxMarket = gData?.data?.['stacks-mainnet:granite:usdcx']
        if (usdcxMarket?.supplyRate != null) graniteApr = usdcxMarket.supplyRate * 100
      }
      if (zRes.ok) {
        const zData = await zRes.json()
        const usdcxMarket = zData?.data?.['stacks-mainnet:zest-v2:6']
        if (usdcxMarket?.supplyRate != null) zestApr = usdcxMarket.supplyRate * 100
      }
    }
  } catch { /* keep 0 */ }

  // --- Blended APR ---
  let blendedApr = 0
  if (totalAssets > 0n) {
    const gWeight = Number(allocGranite) / Number(totalAssets)
    const zWeight = Number(allocZest) / Number(totalAssets)
    blendedApr = graniteApr * gWeight + zestApr * zWeight
  }

  return {
    totalAssets,
    allocGranite,
    allocZest,
    idleBookkeeping,
    totalSupply,
    sharePrice,
    liveIdle,
    liveGranite,
    liveZest,
    liveTotal,
    unrealizedYield,
    graniteApr,
    zestApr,
    blendedApr,
    feeBps,
    feeRecipient: '',
    idleBufferBps,
    virtualOffset: vo,
    vaultOwner: '',
    vaultAllocator: '',
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const VAULT_V3_STATE_KEY = ['vault-v3-state'] as const

export function useVaultStateV3(pollIntervalMs = 120_000) {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: VAULT_V3_STATE_KEY,
    queryFn: fetchVaultStateV3,
    refetchInterval: pollIntervalMs,
    placeholderData: (prev) => prev,
    staleTime: 120_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: VAULT_V3_STATE_KEY })
  }, [queryClient])

  return { state: data ?? EMPTY, loading: isLoading, refresh }
}
