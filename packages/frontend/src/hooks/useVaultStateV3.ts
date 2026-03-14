import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { VAULT_V3_DEPLOYER } from '@delta-stacks/calldata-sdk-stacks'

const API = 'https://api.hiro.so'
const SENDER = VAULT_V3_DEPLOYER

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
// Decode a standard principal from hex
// ---------------------------------------------------------------------------

function decodePrincipal(hex: string): string {
  // Standard principal: 0x05 + 1-byte version + 20-byte hash160
  // Contract principal: 0x06 + 1-byte version + 20-byte hash160 + name-length + name
  // For display we just return the hex — the UI only needs it for comparison
  // For simplicity, return the raw hex; a full decode would need c32check
  return hex
}

// ---------------------------------------------------------------------------
// Fetch function
// ---------------------------------------------------------------------------

async function fetchVaultStateV3(): Promise<VaultStateV3> {
  const vaultContract = 'vault-usdcx-v3'

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
    feeBpsHex,
    idleBufferBpsHex,
    virtualOffsetHex,
    graniteLpParamsHex,
    graniteOpenInterestHex,
    zestInterestRateHex,
    zestUtilizationHex,
    zestFeeReserveHex,
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
    callRead(SENDER, vaultContract, 'get-fee-bps'),
    callRead(SENDER, vaultContract, 'get-idle-buffer-bps'),
    callRead(SENDER, vaultContract, 'get-virtual-offset'),
    callRead(GRANITE_STATE, GRANITE_CONTRACT, 'get-lp-params'),
    callRead(GRANITE_STATE, GRANITE_CONTRACT, 'get-open-interest'),
    callRead(ZEST_DEPLOYER, ZEST_CONTRACT, 'get-interest-rate'),
    callRead(ZEST_DEPLOYER, ZEST_CONTRACT, 'get-utilization'),
    callRead(ZEST_DEPLOYER, ZEST_CONTRACT, 'get-fee-reserve'),
  ])

  const totalAssets = decodeUint(totalAssetsHex)
  const allocGranite = decodeUint(allocGraniteHex)
  const allocZest = decodeUint(allocZestHex)
  const idleBookkeeping = decodeUint(idleBookHex)
  const totalSupply = decodeUint(totalSupplyHex)
  const liveIdle = decodeUint(liveIdleHex)
  const liveGranite = decodeUint(liveGraniteHex)
  const liveZest = decodeUint(liveZestHex)
  const liveTotalDeployed = decodeUint(liveTotalHex)
  // get-live-total-assets only returns deployed capital — add idle to get true TVL
  const liveTotal = liveTotalDeployed + liveIdle

  // V3 uses symmetric virtual offset = 10^decimals (1_000_000 for USDCx)
  const virtualOffset = decodeUint(virtualOffsetHex)
  const vo = virtualOffset > 0n ? virtualOffset : 1_000_000n
  const sharePrice =
    totalSupply > 0n
      ? Number((totalAssets + vo) * 1_000_000n / (totalSupply + vo)) / 1e6
      : 1

  const unrealizedYield = liveTotal > totalAssets ? liveTotal - totalAssets : 0n

  // V3 fee & config
  const feeBps = decodeUint(feeBpsHex)
  const idleBufferBps = decodeUint(idleBufferBpsHex)

  // --- Granite APR ---
  const graniteTotalAssets = decodeTupleUint(graniteLpParamsHex, 'total-assets')
  const graniteTotalShares = decodeTupleUint(graniteLpParamsHex, 'total-shares')

  let graniteApr = 0
  if (graniteTotalShares > 0n && graniteTotalAssets > 0n) {
    const exchangeRate = Number(graniteTotalAssets * 1_000_000n / graniteTotalShares) / 1_000_000
    const premium = exchangeRate - 1
    if (premium > 0) {
      graniteApr = premium * 2 * 100
    }
  }

  // --- Zest V2 APR (supply rate = borrowRate * utilization * (1 - feeReserve)) ---
  const zestBorrowRate = Number(decodeUint(zestInterestRateHex)) / 10_000
  const zestUtilization = Number(decodeUint(zestUtilizationHex)) / 10_000
  const zestFeeReserve = Number(decodeUint(zestFeeReserveHex)) / 10_000
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
    feeRecipient: '', // raw hex — display handled in UI
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

export function useVaultStateV3(pollIntervalMs = 60_000) {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: VAULT_V3_STATE_KEY,
    queryFn: fetchVaultStateV3,
    refetchInterval: pollIntervalMs,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: VAULT_V3_STATE_KEY })
  }, [queryClient])

  return { state: data ?? EMPTY, loading: isLoading, refresh }
}
