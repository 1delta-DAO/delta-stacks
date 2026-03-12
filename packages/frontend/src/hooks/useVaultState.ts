import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { VAULT_DEPLOYER } from '@delta-stacks/calldata-sdk-stacks'

const API = 'https://api.hiro.so'
const SENDER = VAULT_DEPLOYER

// Granite market (state-v1)
const GRANITE_STATE = 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE'
const GRANITE_CONTRACT = 'state-v1'

// Zest V2 vault
const ZEST_DEPLOYER = 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7'
const ZEST_CONTRACT = 'v0-vault-usdc'

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

export interface VaultState {
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
}

const EMPTY: VaultState = {
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
}

// ---------------------------------------------------------------------------
// Fetch function (shared between query and manual refresh)
// ---------------------------------------------------------------------------

async function fetchVaultState(): Promise<VaultState> {
  const vaultContract = 'vault-usdcx-v2-prod'

  const [
    totalAssetsHex,
    allocGraniteHex,
    allocZestHex,
    idleBookHex,
    totalSupplyHex,
    liveIdleHex,
    liveGraniteHex,
    liveZestHex,
    liveTotalHex,
    graniteLpParamsHex,
    graniteOpenInterestHex,
    zestInterestRateHex,
  ] = await Promise.all([
    callRead(SENDER, vaultContract, 'get-total-assets'),
    callRead(SENDER, vaultContract, 'get-alloc-granite'),
    callRead(SENDER, vaultContract, 'get-alloc-zest-v2'),
    callRead(SENDER, vaultContract, 'get-idle-bookkeeping'),
    callRead(SENDER, vaultContract, 'get-total-supply'),
    callRead(SENDER, vaultContract, 'get-idle-balance'),
    callRead(SENDER, vaultContract, 'get-granite-usdcx-position'),
    callRead(SENDER, vaultContract, 'get-zest-v2-usdc-position'),
    callRead(SENDER, vaultContract, 'get-live-total-assets'),
    callRead(GRANITE_STATE, GRANITE_CONTRACT, 'get-lp-params'),
    callRead(GRANITE_STATE, GRANITE_CONTRACT, 'get-open-interest'),
    callRead(ZEST_DEPLOYER, ZEST_CONTRACT, 'get-interest-rate'),
  ])

  const totalAssets = decodeUint(totalAssetsHex)
  const allocGranite = decodeUint(allocGraniteHex)
  const allocZest = decodeUint(allocZestHex)
  const idleBookkeeping = decodeUint(idleBookHex)
  const totalSupply = decodeUint(totalSupplyHex)
  const liveIdle = decodeUint(liveIdleHex)
  const liveGranite = decodeUint(liveGraniteHex)
  const liveZest = decodeUint(liveZestHex)
  const liveTotal = decodeUint(liveTotalHex)

  const virtualShares = 100_000_000n
  const sharePrice =
    totalSupply > 0n
      ? Number(totalAssets * 1_000_000n / (totalSupply + virtualShares)) / 1e6
      : 1

  const unrealizedYield = liveTotal > totalAssets ? liveTotal - totalAssets : 0n

  // --- Granite APR ---
  const graniteTotalAssets = decodeTupleUint(graniteLpParamsHex, 'total-assets')
  const graniteTotalShares = decodeTupleUint(graniteLpParamsHex, 'total-shares')

  let graniteApr = 0
  if (graniteTotalShares > 0n && graniteTotalAssets > 0n) {
    const exchangeRate = Number(graniteTotalAssets * 1_000_000n / graniteTotalShares) / 1_000_000
    const premium = exchangeRate - 1
    // Annualize from ~6 months of operation
    if (premium > 0) {
      graniteApr = premium * 2 * 100
    }
  }

  // --- Zest V2 APR ---
  const zestRateRaw = decodeUint(zestInterestRateHex)
  const zestApr = Number(zestRateRaw) / 100

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
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const VAULT_STATE_KEY = ['vault-state'] as const

export function useVaultState(pollIntervalMs = 60_000) {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: VAULT_STATE_KEY,
    queryFn: fetchVaultState,
    refetchInterval: pollIntervalMs,
    // Keep previous data visible while refetching in the background
    placeholderData: (prev) => prev,
    // Cache for 30s — avoids re-fetching on rapid mount/unmount
    staleTime: 30_000,
  })

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: VAULT_STATE_KEY })
  }, [queryClient])

  return { state: data ?? EMPTY, loading: isLoading, refresh }
}
